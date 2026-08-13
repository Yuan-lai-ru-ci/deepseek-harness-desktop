'use strict'
// Verify the frameless floating window controls install and are wired to the
// window-control bridge. Asserts the content is NOT pushed down (no title bar
// strip) — only a top drag strip + top-right button cluster are layered on.
const { app, BrowserWindow, ipcMain } = require('electron')
const { HostProcess } = require('../src/host')
const { installTitlebar, setControlsMode } = require('../src/titlebar')

const PORT = Number(process.env.DSH_PORT || 3080)
const host = new HostProcess({ port: PORT })

// Hard deadline so this never hangs the session editor.
setTimeout(() => { console.error('FATAL_TIMEOUT'); require('electron').app.exit(124) }, 45_000)

app.whenReady().then(async () => {
  await host.start()
  const win = new BrowserWindow({
    width: 1280, height: 800, show: true, frame: false,
    webPreferences: {
      contextIsolation: true, sandbox: true,
      preload: require('node:path').join(__dirname, '..', 'src', 'preload.js'),
    },
  })

  // Mirror the window-control IPC that main.js registers (so this script can
  // exercise the full bridge without bootstrapping the whole app).
  const winOf = () => win
  ipcMain.on('window:minimize', () => winOf()?.minimize())
  ipcMain.on('window:maximize', () => winOf()?.isMaximized() ? winOf()?.unmaximize() : winOf()?.maximize())
  ipcMain.on('window:toggle-maximize', () => winOf()?.isMaximized() ? winOf()?.unmaximize() : winOf()?.maximize())
  ipcMain.on('window:close', () => winOf()?.close())
  ipcMain.handle('window:is-maximized', () => winOf()?.isMaximized() ?? false)
  ipcMain.handle('window:is-fullscreen', () => winOf()?.isFullScreen() ?? false)
  ipcMain.on('window:set-title', (_e, t) => { if (typeof t === 'string') winOf()?.setTitle(t) })
  ipcMain.on('window:subscribe-state', () => {})
  ipcMain.on('window:unsubscribe-state', () => {})
  ipcMain.on('window:set-controls', (_e, mode) => {
    if (mode === 'native' || mode === 'custom') setControlsMode(win.webContents, mode)
  })

  await win.loadURL(`http://127.0.0.1:${PORT}`)
  await new Promise((r) => setTimeout(r, 5000))
  installTitlebar(win.webContents)
  await new Promise((r) => setTimeout(r, 1200))

  const info = await win.webContents.executeJavaScript(`(() => {
    const bridge = window.desktopWindow
    const strip = document.querySelector('.dsh-dragstrip')
    const cluster = document.querySelector('.dsh-winctrl')
    const stripRect = strip ? strip.getBoundingClientRect() : null
    const out = {
      clusterPresent: !!cluster,
      dragStripPresent: !!strip,
      dragStripPos: strip ? getComputedStyle(strip).position : null,
      dragStripHeight: stripRect ? Math.round(stripRect.height) : null,
      dragStripRight: stripRect ? Math.round(window.innerWidth - stripRect.right) : null,
      // Content must stay flush at the top (no reserved titlebar height).
      bodyPaddingTop: getComputedStyle(document.body).paddingTop,
      frameY: (document.querySelector('[class*="_frame"]') || {}).getBoundingClientRect?.()?.y,
      clusterRect: cluster ? (() => { const r = cluster.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })() : null,
      minimizeBtn: !!document.querySelector('.dsh-winctrl [data-action="minimize"]'),
      maximizeBtn: !!document.querySelector('.dsh-winctrl [data-action="maximize"]'),
      closeBtn: !!document.querySelector('.dsh-winctrl [data-action="close"]'),
    }
    if (bridge) { out.bridgeApi = Object.keys(bridge).sort() }
    return out
  })()`)

  console.log('=== frameless floating controls verification ===')
  console.log(JSON.stringify(info, null, 2))

  // IPC bridge end-to-end.
  await win.show(); await win.focus(); await new Promise((r) => setTimeout(r, 400))
  const max = await win.webContents.executeJavaScript('window.desktopWindow.isMaximized()')
  console.log('isMaximized() via bridge =', max)
  await win.webContents.executeJavaScript('window.desktopWindow.minimize()')
  await new Promise((r) => setTimeout(r, 600))
  const minimized = win.isMinimized()
  console.log('after minimize() → win.isMinimized =', minimized)
  win.restore()
  await new Promise((r) => setTimeout(r, 400))

  // --- generic shell API: getState / setTitle / setControls takeover ---
  const st = await win.webContents.executeJavaScript('window.desktopWindow.getState()')
  console.log('getState() =', JSON.stringify(st))
  const stateOk = st && st.maximized === false && typeof st.fullscreen === 'boolean'

  await win.webContents.executeJavaScript('window.desktopWindow.setTitle("DSH·验证标题")')
  await new Promise((r) => setTimeout(r, 300))
  const title = win.getTitle()
  console.log('setTitle() → win.getTitle() =', JSON.stringify(title))
  const titleOk = title === 'DSH·验证标题'

  await win.webContents.executeJavaScript('window.desktopWindow.setControls("custom")')
  await new Promise((r) => setTimeout(r, 500))
  const customVisible = await win.webContents.executeJavaScript(`
    Promise.resolve(document.querySelectorAll('.dsh-winctrl,.dsh-dragstrip').length > 0 &&
      Array.from(document.querySelectorAll('.dsh-winctrl,.dsh-dragstrip')).every(el => getComputedStyle(el).display === 'none'))
  `)
  console.log('setControls(custom) → built-ins hidden =', customVisible)
  const customOk = customVisible

  await win.webContents.executeJavaScript('window.desktopWindow.setControls("native")')
  await new Promise((r) => setTimeout(r, 500))
  const nativeVisible = await win.webContents.executeJavaScript(`
    Promise.resolve(Array.from(document.querySelectorAll('.dsh-winctrl,.dsh-dragstrip')).every(el => getComputedStyle(el).display !== 'none'))
  `)
  console.log('setControls(native) → built-ins restored =', nativeVisible)
  const nativeOk = nativeVisible

  // Save a screenshot for the user to eyeball.
  const img = await win.webContents.capturePage()
  require('node:fs').writeFileSync(require('node:path').join(__dirname, '..', 'titlebar-preview.png'), img.toPNG())
  console.log('screenshot saved → titlebar-preview.png')

  const ok = info.clusterPresent && info.dragStripPresent && info.dragStripPos === 'fixed' &&
    info.dragStripHeight === 34 &&
    info.minimizeBtn && info.maximizeBtn && info.closeBtn &&
    info.bridgeApi && info.bridgeApi.includes('setControls') && info.bridgeApi.includes('getState') &&
    info.bridgeApi.includes('onStateChange') && info.bridgeApi.includes('setTitle') &&
    info.bridgeApi.includes('toggleMaximize') &&
    // content is NOT pushed down (floating design): frame still at y=0
    info.frameY === 0 && info.bodyPaddingTop === '0px' &&
    minimized && stateOk && titleOk && customOk && nativeOk
  console.log(ok ? '\nPASS: generic window-chrome shell works (layout-flush, API: state/title/controls takeover)' : '\nFAIL: window-chrome verification incomplete')
  try { await host.stop() } catch {}
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.error('ERR', e); try { require('electron').app.exit(3) } catch {}; process.exit(3) })
