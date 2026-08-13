'use strict'

const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const { HostProcess } = require('./host')

const PORT = Number(process.env.DSH_PORT || 3080)
const url = `http://127.0.0.1:${PORT}`

/** Primary window instance, kept to guard against GC. */
let mainWindow = null
const host = new HostProcess({ port: PORT })

/**
 * Build the application menu. The Web UI owns the content, so we expose only
 * the standard window/document controls plus a couple of helpers that are
 * genuinely useful for a desktop shell (reload, toggling the host devtools,
 * opening the harness home/data directory in the OS file manager).
 */
function buildMenu() {
  const template = [
    {
      label: '文件(&F)',
      submenu: [{ label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }],
    },
    {
      label: '视图(&V)',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '查看仓库/Docs',
          click: () => shell.openExternal('https://github.com/Yuan-lai-ru-ci/deepseek-harness-desktop'),
        },
        {
          label: '关于',
          click: () => {
            void dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'DeepSeek Harness Desktop',
              message: 'DeepSeek Harness Desktop',
              detail: `基于 DeepSeek Harness (dsh) 的 Electron 桌面包装。\n本地服务: ${url}`,
            })
          },
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness',
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
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

  mainWindow.loadURL(url)
}

/**
 * Show a fatal error and quit. Used when the host cannot be started or dies
 * during a run without user interaction.
 */
function fatal(message) {
  dialog.showErrorBox('DeepSeek Harness Desktop 启动失败', message)
  app.exit(1)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu())

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
