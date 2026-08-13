'use strict'

const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron')
const { HostProcess } = require('./host')
const { installTitlebar, setControlsMode } = require('./titlebar')

const PORT = Number(process.env.DSH_PORT || 3080)
const url = `http://127.0.0.1:${PORT}`

/** Primary window instance, kept to guard against GC. */
let mainWindow = null
const host = new HostProcess({
  port: PORT,
  isPackaged: app.isPackaged,
})

/** Number of renderer-side state subscriptions (drives pushWindowState). */
let stateSubscriberCount = 0

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness',
    backgroundColor: '#151517',
    // No OS frame: the in-page title bar (titlebar.js) owns the title + window
    // controls and is wired to the window via the IPC bridge in preload.js.
    frame: false,
    webPreferences: {
      // Never expose Node to the rendered Web UI.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: require('node:path').join(__dirname, 'preload.js'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    // Open external links in the default browser, never in a new app window.
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      shell.openExternal(targetUrl)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    // Keep the shell pinned to the harness UI origin.
    if (!targetUrl.startsWith(url)) {
      event.preventDefault()
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        shell.openExternal(targetUrl)
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Keep window-state subscribers (the in-page controls / any custom chrome)
  // in sync with the real window: push a unified state only when someone is
  // listening, on every relevant transition.
  const pushWindowState = () => {
    const w = mainWindow
    if (!w || stateSubscriberCount <= 0) return
    w.webContents.send('window:state-changed', {
      maximized: w.isMaximized(),
      fullscreen: w.isFullScreen(),
    })
  }
  mainWindow.on('maximize', pushWindowState)
  mainWindow.on('unmaximize', pushWindowState)
  mainWindow.on('enter-full-screen', pushWindowState)
  mainWindow.on('leave-full-screen', pushWindowState)

  // Frameless windows can't be recovered with the system menu; restore a few
  // essential accelerators (F12 devtools, reload).
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') mainWindow?.webContents.toggleDevTools()
    if (input.key === 'F5') mainWindow?.webContents.reload()
  })

  mainWindow.loadURL(url)

  // Inject the in-page title bar once the harness UI has had a chance to
  // mount; idempotent, so a later reload also inherits it.
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => installTitlebar(mainWindow.webContents), 1200)
  })
}


/**
 * Show a fatal error and quit. Used when the host cannot be started or dies
 * during a run without user interaction.
 */
function fatal(message) {
  dialog.showErrorBox('DeepSeek Harness Desktop 启动失败', message)
  app.exit(1)
}

// Window-control IPC surface consumed by the in-page titlebar (preload.js).
function registerWindowControls() {
  const win = () => mainWindow
  ipcMain.on('window:minimize', () => win()?.minimize())
  ipcMain.on('window:maximize', () => { const w = win(); if (w) w.maximize() })
  ipcMain.on('window:toggle-maximize', () => { const w = win(); if (w) w.isMaximized() ? w.unmaximize() : w.maximize() })
  ipcMain.on('window:close', () => win()?.close())
  ipcMain.handle('window:is-maximized', () => win()?.isMaximized() ?? false)
  ipcMain.handle('window:is-fullscreen', () => win()?.isFullScreen() ?? false)

  // Title from the hosted UI (so it can control the OS/taskbar title).
  ipcMain.on('window:set-title', (_e, title) => {
    const w = win()
    if (w && typeof title === 'string') w.setTitle(title)
  })

  // Hand window-chrome ownership to the page: 'native' shows the built-in
  // controls, 'custom' hides them (page draws its own and drives the window).
  ipcMain.on('window:set-controls', (_e, mode) => {
    const w = win()
    if (w && (mode === 'native' || mode === 'custom')) {
      setControlsMode(w.webContents, mode)
    }
  })

  // Built-in About dialog (brand, version, notes).
  ipcMain.on('window:about', () => {
    const w = win()
    if (!w) return
    void dialog.showMessageBox(w, {
      type: 'info',
      title: '关于 DeepSeek 桌面版',
      message: 'DeepSeek 桌面版',
      detail:
        'DeepSeek 官方智能体的桌面客户端\n' +
        `版本 ${app.getVersion()}\n\n` +
        '内置本地 dsh 宿主，双击即用，无需另行启动服务。\n' +
        '基于 DeepSeek Harness (dsh) 与 Electron 构建。',
      buttons: ['好的'],
      defaultId: 0,
    })
  })

  // Optional throttling for window-state pushes (count subscribers).
  ipcMain.on('window:subscribe-state', () => { stateSubscriberCount += 1 })
  ipcMain.on('window:unsubscribe-state', () => {
    stateSubscriberCount = Math.max(0, stateSubscriberCount - 1)
    // Drop listeners that will never be read again.
    ipcMain.removeAllListeners('window:is-fullscreen')
  })
}

app.whenReady().then(async () => {
  registerWindowControls()

  try {
    await host.start()
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err))
    return
  }

  createWindow()
  watchHost()

  // Debug/test hook: auto-quit `N` ms after the window loads, simulating the
  // user closing the app — used by scripts/verify-e2e.js to check teardown.
  if (process.env.DSH_AUTOCLOSE_MS) {
    const ms = Number(process.env.DSH_AUTOCLOSE_MS)
    setTimeout(() => app.quit(), Number.isFinite(ms) ? ms : 5000)
  }
})

/**
 * Watch the host for an unexpected exit while the window is up and offer the
 * user a choice between restarting the host or quitting the app.
 */
function watchHost() {
  if (!host.child) return
  host.child.once('exit', async (code, signal) => {
    if (host.stopRequested || !mainWindow || mainWindow.isDestroyed()) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'Host 已退出',
      message: `dsh web 宿主进程已终止（exit=${code}, signal=${signal}）。`,
      detail: '可以选择重启宿主，或退出应用。',
      buttons: ['重启宿主', '退出'],
      defaultId: 0,
    })
    if (choice === 1) {
      app.quit()
      return
    }
    try {
      await host.restart()
      watchHost()
      mainWindow.webContents.reload()
    } catch (err) {
      fatal(err instanceof Error ? err.message : String(err))
    }
  })
}



// Teardown: make sure the host is stopped before the app actually exits, on
// every normal quit path (window close, Cmd+Q, menu quit, OS shutdown).
let quitCleaned = false
async function teardownHost() {
  if (quitCleaned) return
  quitCleaned = true
  try {
    await host.stop()
  } catch { /* best-effort cleanup */ }
}

app.on('before-quit', (event) => {
  // The host stop is async; block the first quit pass, clean up, then exit.
  event.preventDefault()
  teardownHost().then(() => app.exit(0))
  app.removeAllListeners('before-quit') // avoid re-entering on app.exit
})

// Closing every window requests a quit; on macOS keep the app alive like a
// native app (host stays up), elsewhere just quit.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Safety net for abrupt shutdowns (SIGINT / SIGTERM / session end).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await teardownHost()
    process.exit(0)
  })
}
