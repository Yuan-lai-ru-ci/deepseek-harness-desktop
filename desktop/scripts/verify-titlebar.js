'use strict'
// Verify the frameless in-page title bar actually installs and its buttons
// are wired to the window-control bridge.
const { app, BrowserWindow, ipcMain } = require('electron')
const { HostProcess } = require('./src/host')
const { installTitlebar } = require('./src/titlebar')

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
      preload: require('node:path').join(__dirname, 'src/preload.js'),
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

  await win.loadURL(`http://127.0.0.1:${PORT}`)
  await new Promise((r) => setTimeout(r, 5000))
  installTitlebar(win.webContents)
  await new Promise((r) => setTimeout(r, 1200))

  const info = await win.webContents.executeJavaScript(`(() => {
    const bar = document.querySelector('.dsh-titlebar')
    const bridge = window.desktopWindow
    const out = {
      barPresent: !!bar,
      bodyFrameless: document.body.classList.contains('dsh-frameless'),
      bodyPaddingTop: getComputedStyle(document.body).paddingTop,
      barPosition: bar ? bar.getBoundingClientRect().y : null,
      minimizeBtn: !!document.querySelector('[data-action="minimize"]'),
      maximizeBtn: !!document.querySelector('[data-action="maximize"]'),
      closeBtn: !!document.querySelector('[data-action="close"]'),
      bridgeApi: bridge ? Object.keys(bridge).sort() : null,
      frameY: (document.querySelector('[class*="_frame"]') || {}).getBoundingClientRect?.()?.y,
    }
    return out
  })()`)

  console.log('=== frameless verification ===')
  console.log(JSON.stringify(info, null, 2))

  // Also exercise the IPC bridge end-to-end.
  const max = await win.webContents.executeJavaScript('window.desktopWindow.isMaximized()')
  console.log('isMaximized() via bridge =', max)

  // Make sure the window is visible/focused so minimize has real effect.
  win.show()
  win.focus()
  await new Promise((r) => setTimeout(r, 400))
  await win.webContents.executeJavaScript('window.desktopWindow.minimize()')
  await new Promise((r) => setTimeout(r, 600))
  const minimized = win.isMinimized()
  console.log('after minimize() → win.isMinimized =', minimized)
  win.restore()
  await new Promise((r) => setTimeout(r, 400))
  const restored = !win.isMinimized()
  console.log('after restore() → minimized =', !restored)

  // Save a screenshot so the user can eyeball the in-page title bar.
  const rect = await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('.dsh-titlebar').getBoundingClientRect()
    const s = document.querySelector('[class*="_frame"]').getBoundingClientRect()
    return { bar: {x:r.x,y:r.y,w:r.width,h:r.height}, frameY: s.y }
  })()`)
  const img = await win.webContents.capturePage()
  require('node:fs').writeFileSync(require('node:path').join(__dirname, 'titlebar-preview.png'), img.toPNG())
  console.log('screenshot saved → titlebar-preview.png (bar:', JSON.stringify(rect.bar), ', frameY:', rect.frameY, ')')

  const ok = info.barPresent && info.minimizeBtn && info.maximizeBtn && info.closeBtn &&
    info.bridgeApi && info.bridgeApi.includes('toggleMaximize') && info.bridgeApi.includes('onMaximizedChange') &&
    minimized && restored
  console.log(ok ? '\nPASS: in-page title bar works (present, buttons wired, bridge functional)' : '\nFAIL: title bar verification incomplete')
  // Tear down the host and app cleanly so nothing lingers.
  try { await host.stop() } catch {}
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.error('ERR', e); try { require('electron').app.exit(3) } catch {}; process.exit(3) })
