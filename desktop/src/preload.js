'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Window-control bridge for the frameless desktop shell.
 *
 * Exposed on the window as `desktopWindow`. The in-page title bar uses it to
 * drive the OS window (minimize / maximize / close) and to learn the current
 * maximized state so the button glyph stays in sync.
 *
 * Security: only a fixed, narrow API is bridged. No Node, no filesystem, no
 * arbitrary channel access. `onMaximizedChange` listens on the specific
 * `window:max-changed` channel and lets the page unsubscribe via its return.
 */
const api = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  /**
   * @param {(maximized: boolean) => void} cb
   * @returns {() => void} unsubscribe
   */
  onMaximizedChange: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_e, maximized) => cb(Boolean(maximized))
    ipcRenderer.on('window:max-changed', listener)
    return () => ipcRenderer.removeListener('window:max-changed', listener)
  },
}

contextBridge.exposeInMainWorld('desktopWindow', api)
