'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Desktop window-control bridge for the frameless shell.
 *
 * Exposed on the window as `window.desktopWindow`. This is a *generic* shell
 * API — it does not assume any particular web UI, so any client (the built-in
 * DeepSeek Harness UI, a third-party skin/plugin such as dsh-web-ui, or a fully
 * custom renderer) can drive the OS window, query its state, change the title,
 * and — crucially — take over the window controls entirely.
 *
 * ## Control modes
 * - `'native'` (default): the shell draws the built-in top-right window buttons
 *   and a top drag strip.
 * - `'custom'`: the shell hides its built-in controls; the page is expected to
 *   render its own title bar/window buttons and drive them through this same
 *   API (minimize / maximize / toggleMaximize / close), plus its own
 *   `-webkit-app-region: drag` region for moving the window.
 *
 * Security: only a fixed, narrow surface is bridged — no Node, no filesystem,
 * no arbitrary ipcRenderer access. All values are validated/whitelisted.
 */
const api = {
  // ---- window actions ----------------------------------------------------
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),

  // ---- state -------------------------------------------------------------
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  /** @returns {Promise<{ maximized: boolean; fullscreen: boolean }>} */
  getState: async () => {
    const maximized = Boolean(await ipcRenderer.invoke('window:is-maximized'))
    const fullscreen = Boolean(await ipcRenderer.invoke('window:is-fullscreen'))
    return { maximized, fullscreen }
  },

  /**
   * Subscribe to window state changes.
   * @param {(state: { maximized: boolean; fullscreen: boolean }) => void} cb
   * @returns {() => void} unsubscribe
   */
  onStateChange: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_e, state) => cb({ maximized: !!state?.maximized, fullscreen: !!state?.fullscreen })
    ipcRenderer.on('window:state-changed', listener)
    ipcRenderer.send('window:subscribe-state')
    return () => {
      ipcRenderer.removeListener('window:state-changed', listener)
      ipcRenderer.send('window:unsubscribe-state')
    }
  },

  /**
   * Backwards-compatible subscription for the maximized flag only.
   * @param {(maximized: boolean) => void} cb
   * @returns {() => void} unsubscribe
   */
  onMaximizedChange: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_e, state) => cb(!!state?.maximized)
    ipcRenderer.on('window:state-changed', listener)
    ipcRenderer.send('window:subscribe-state')
    return () => {
      ipcRenderer.removeListener('window:state-changed', listener)
      ipcRenderer.send('window:unsubscribe-state')
    }
  },

  // ---- window chrome -----------------------------------------------------
  /** @param {string} title */
  setTitle: (title) => {
    if (typeof title !== 'string') return
    ipcRenderer.send('window:set-title', title.slice(0, 200))
  },

  /**
   * Decide who draws the window controls.
   * @param {'native' | 'custom'} mode
   */
  setControls: (mode) => {
    if (mode !== 'native' && mode !== 'custom') return
    ipcRenderer.send('window:set-controls', mode)
  },

  /** Open the built-in About dialog (brand, version, credits). */
  showAbout: () => ipcRenderer.send('window:about'),
}

contextBridge.exposeInMainWorld('desktopWindow', api)
