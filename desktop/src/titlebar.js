'use strict'

/**
 * Frameless desktop shell chrome.
 *
 * A *generic* window-chrome layer that floats over any hosted web UI without
 * assuming a particular layout: a top drag strip + a top-right window-control
 * cluster. It is UI-agnostic — the built-in DeepSeek Harness UI, a third-party
 * skin/plugin (e.g. dsh-web-ui), or a fully custom renderer all share it.
 *
 * Two control modes (driven from the page via `desktopWindow.setControls`):
 *   - 'native' (default): the shell renders the drag strip + window buttons.
 *   - 'custom': the shell hides its chrome; the page draws its own title bar /
 *     window buttons and drives the OS window through `window.desktopWindow`,
 *     plus its own `-webkit-app-region: drag` region for moving the window.
 *
 * Styling is CSS-variable driven so a hosted skin can remap colors/sizes.
 */

const CONTROLS_W = 135 // width reserved for the 3 buttons (45px each)

/** CSS injected into the page. CSS variables let a third-party UI remap it. */
const css = `
  :root {
    --dshctrl-h: 34px;                 /* total chrome height (drag strip + buttons) */
    --dshctrl-right: 135px;            /* width reserved for the button cluster */
    --dshctrl-bg: transparent;         /* container background (drag strip + buttons) */
    --dshctrl-color: #a1a1aa;
    --dshctrl-color-hover: #f4f4f5;
    --dshctrl-bg-hover: rgba(255,255,255,0.09);
    --dshctrl-bg-active: rgba(255,255,255,0.14);
    --dshctrl-bg-close-hover: #e81123;
    --dshctrl-color-close-hover: #fff;
  }

  /* Drag strip across the top edge — same height as the button cluster, moving
     the window. Leaves the top-right button area clear (no-drag). */
  .dsh-dragstrip {
    position: fixed;
    top: 0; left: 0;
    height: var(--dshctrl-h);
    right: var(--dshctrl-right);
    z-index: 2147483646;
    background: var(--dshctrl-bg);
    -webkit-app-region: drag;
  }
  /* Top-right window-control cluster (floats, no layout shift). */
  .dsh-winctrl {
    position: fixed;
    top: 0; right: 0;
    height: var(--dshctrl-h);
    display: flex;
    align-items: stretch;
    z-index: 2147483647;
    -webkit-app-region: no-drag;
    user-select: none;
  }
  .dsh-winctrl__btn {
    width: 45px;
    height: var(--dshctrl-h);
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent; cursor: default;
    color: var(--dshctrl-color);
    transition: background 110ms ease, color 110ms ease;
    padding: 0;
  }
  .dsh-winctrl__btn svg { width: 11px; height: 11px; fill: currentColor; pointer-events: none; }
  .dsh-winctrl__btn:hover { background: var(--dshctrl-bg-hover); color: var(--dshctrl-color-hover); }
  .dsh-winctrl__btn:active { background: var(--dshctrl-bg-active); }
  .dsh-winctrl__btn--close:hover { background: var(--dshctrl-bg-close-hover); color: var(--dshctrl-color-close-hover); }
  .dsh-winctrl__btn--close:active { background: #f1707a; }
`

const controlsHtml = `
  <button class="dsh-winctrl__btn" data-action="minimize" title="最小化" aria-label="最小化">
    <svg viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1.2" rx="0.6"/></svg>
  </button>
  <button class="dsh-winctrl__btn" data-action="maximize" title="最大化" aria-label="最大化">
    <svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
  </button>
  <button class="dsh-winctrl__btn dsh-winctrl__btn--close" data-action="close" title="关闭" aria-label="关闭">
    <svg viewBox="0 0 12 12"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>
  </button>
`

const script = `
  (() => {
    if (window.__dshChromeInstalled) return
    window.__dshChromeInstalled = true
    const strip = document.createElement('div')
    strip.className = 'dsh-dragstrip'
    const cluster = document.createElement('div')
    cluster.className = 'dsh-winctrl'
    cluster.innerHTML = ${JSON.stringify(controlsHtml)}
    document.body.appendChild(strip)
    document.body.appendChild(cluster)

    const bridge = window.desktopWindow
    const btn = (a) => cluster.querySelector('[data-action="' + a + '"]')
    btn('minimize')?.addEventListener('click', () => bridge?.minimize())
    btn('close')?.addEventListener('click', () => bridge?.close())
    const onState = (st) => {
      const max = !!(st && (st.maximized ?? st))
      const m = btn('maximize')
      if (m) {
        m.innerHTML = max
          ? '<svg viewBox="0 0 12 12"><rect x="2.5" y="8" width="6" height="1.4" rx="0.7" fill="currentColor"/><rect x="2" y="2" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 6.5 V3 a1 1 0 0 1 1 -1h2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
          : '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
      }
    }
    btn('maximize')?.addEventListener('click', () => bridge?.toggleMaximize())
    if (bridge?.onStateChange) {
      bridge.onStateChange(onState)
    } else {
      bridge?.onMaximizedChange((max) => onState(!!max))
    }
    bridge?.getState?.().then((st) => onState(st)).catch(() => {})
  })()
`

// Helper used by both the compiled string and setControlsMode.
const setVisibleJs = (show) =>
  `document.querySelectorAll('.dsh-dragstrip,.dsh-winctrl').forEach(el => { el.style.display = ${show} ? '' : 'none' })`

/**
 * Install the frameless floating window chrome into a webContents.
 * Idempotent; safe to call on every load/reload.
 */
function installTitlebar(webContents) {
  try {
    webContents.insertCSS(css)
  } catch { /* page still loading */ }
  try {
    webContents.executeJavaScript(script, true).catch(() => {})
  } catch { /* not ready */ }
}

/**
 * Toggle who owns the window chrome.
 *   'native' -> show the built-in drag strip + buttons
 *   'custom' -> hide them (the page draws its own chrome and drives the window)
 */
function setControlsMode(webContents, mode) {
  const show = mode !== 'custom'
  try {
    webContents.executeJavaScript(setVisibleJs(show), true).catch(() => {})
  } catch { /* page still loading */ }
}

module.exports = { installTitlebar, setControlsMode, CONTROLS_W, css }
