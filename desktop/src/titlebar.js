'use strict'

/**
 * Custom titlebar for the frameless desktop window.
 *
 * This module holds the markup + styles injected into the DeepSeek Harness
 * web UI so the OS title bar and menu can be removed and replaced with an
 * in-page title bar. The window controls talk to the main process over the
 * `desktopWindow` preload bridge.
 *
 * Why this (vs. Electron's titleBarOverlay): the user asked for the controls
 * to live *inside* the page, so we draw our own buttons and reserve a draggable
 * region (CSS `-webkit-app-region: drag`), matching the harness's dark theme
 * (`rgb(21,21,23)` frame / `rgb(27,27,28)` sidebar).
 */

const TITLEBAR_HEIGHT = 34

/** CSS injected into the page. */
const css = `
  .dsh-titlebar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: ${TITLEBAR_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgb(21, 21, 23);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    z-index: 2147483646;
    -webkit-app-region: drag;
    user-select: none;
    color: #a1a1aa;
    font-size: 12px;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .dsh-titlebar__brand {
    display: flex; align-items: center; gap: 8px;
    padding-left: 12px;
    font-weight: 500; letter-spacing: 0.2px;
  }
  .dsh-titlebar__dot { width: 9px; height: 9px; border-radius: 50%; background: #4d6bfe; }
  .dsh-titlebar__controls {
    display: flex; align-items: center; height: 100%;
    -webkit-app-region: no-drag;
  }
  .dsh-titlebar__btn {
    width: 46px; height: ${TITLEBAR_HEIGHT}px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent; cursor: default;
    color: #a1a1aa;
    -webkit-app-region: no-drag;
    transition: background 120ms ease, color 120ms ease;
  }
  .dsh-titlebar__btn svg { width: 11px; height: 11px; fill: currentColor; pointer-events: none; }
  .dsh-titlebar__btn:hover { background: rgba(255, 255, 255, 0.08); color: #f4f4f5; }
  .dsh-titlebar__btn--close:hover { background: #e81123; color: #fff; }

  /* Shift the app content down by the titlebar height. */
  html body.dsh-frameless { padding-top: ${TITLEBAR_HEIGHT}px; }
  html body.dsh-frameless #root { /* keep existing layout rules; just moved down */ }
`

/** Controls markup (SVG glyphs for Windows 11-looking controls). */
const controlsHtml = `
  <div class="dsh-titlebar__controls">
    <button class="dsh-titlebar__btn" data-action="minimize" title="最小化" aria-label="最小化">
      <svg viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1.2" rx="0.6"/></svg>
    </button>
    <button class="dsh-titlebar__btn" data-action="maximize" title="最大化" aria-label="最大化">
      <svg class="dsh-maximize-icon" viewBox="0 0 12 12"><rect x="1.5" y="2.5" width="9" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
    </button>
    <button class="dsh-titlebar__btn dsh-titlebar__btn--close" data-action="close" title="关闭" aria-label="关闭">
      <svg viewBox="0 0 12 12"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>
    </button>
  </div>
`

/**
 * JS to run in the page once the harness UI has mounted. Creates the title
 * bar, wires the buttons to the preload `desktopWindow` bridge, and reflects
 * window state (maximized) on the buttons.
 */
const script = `
  (() => {
    if (window.__dshTitlebarInstalled) return
    window.__dshTitlebarInstalled = true
    document.body.classList.add('dsh-frameless')
    const bar = document.createElement('div')
    bar.className = 'dsh-titlebar'
    bar.innerHTML = '<div class="dsh-titlebar__brand"><span class="dsh-titlebar__dot"></span><span>DeepSeek Harness</span></div>' + ${JSON.stringify(controlsHtml)}
    document.body.appendChild(bar)
    const bridge = window.desktopWindow
    const btn = (a) => bar.querySelector('[data-action="' + a + '"]')
    btn('minimize')?.addEventListener('click', () => bridge?.minimize())
    btn('close')?.addEventListener('click', () => bridge?.close())
    const onState = (max) => {
      // swap to "restore" glyph when maximized
      const m = btn('maximize')
      if (m) {
        m.innerHTML = max
          // restore: overlapping stacked windows
          ? '<svg viewBox="0 0 12 12"><rect x="2.5" y="8" width="6" height="1.4" rx="0.7" fill="currentColor"/><rect x="2" y="2" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 6.5 V3 a1 1 0 0 1 1 -1h2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
          // maximize: simple frame
          : '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
      }
    }
    btn('maximize')?.addEventListener('click', () => bridge?.toggleMaximize())
    bridge?.onMaximizedChange((max) => onState(!!max))
    bridge?.isMaximized().then((max) => onState(!!max))
  })()
`

/**
 * Inject the frameless title bar into a webContents once the page DOM is ready.
 * Idempotent; safe to call multiple times.
 */
function installTitlebar(webContents) {
  try {
    webContents.insertCSS(css)
  } catch { /* page still loading */ }
  try {
    webContents.executeJavaScript(script, true).catch(() => {})
  } catch { /* not ready */ }
}

module.exports = { installTitlebar, TITLEBAR_HEIGHT, css }
