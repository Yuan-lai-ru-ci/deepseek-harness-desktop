# 集成指南：第三方 Web UI 接入桌面窗口壳层

DeepSeek Harness Desktop 的窗口是一个 **无系统边框** 的 Electron 窗口，内置一套
**通用窗口壳层**（`src/titlebar.js` + `src/preload.js`）。这套壳层不依赖任何特定
Web UI —— DeepSeek Harness 自家界面、第三方皮肤/插件（如
[dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)）、或完全自定义的前端
都能直接使用，甚至接管窗口控制。

## 运行形态

桌面应用在本机启动 `dsh web` 宿主，窗口加载 `http://127.0.0.1:3080`。因此任何
**通过客户端插件机制注入到 dsh web 页面里的 UI**（皮肤、右侧面板、自定义标题栏等）
都天然跑在窗口内，与壳层共存于同一页面。

## 窗口壳层提供的 API

`window.desktopWindow`（由 preload 通过 contextBridge 注入，沙箱安全）:

| 方法 | 说明 |
|---|---|
| `minimize()` | 最小化窗口 |
| `maximize()` | 直接最大化 |
| `toggleMaximize()` | 最大化/还原切换 |
| `close()` | 关闭窗口（触发应用+宿主干净退出） |
| `isMaximized() => Promise<boolean>` | 是否最大化 |
| `getState() => Promise<{maximized, fullscreen}>` | 一次拿到窗口状态 |
| `onStateChange(cb) => unsubscribe` | 订阅状态变化，`cb({maximized, fullscreen})` |
| `setTitle(title)` | 设置窗口/任务栏标题 |
| `setControls('native' \| 'custom')` | 谁画窗口按钮（见下） |

这些方法即调用即用，任一经由 dsh 注入到页面的插件都能访问。

## 两种控件模式

### native（默认）
壳层自己渲染：顶部一条 34px 可拖拽区 + 右上角最小化/最大化/关闭按钮。页面内容完全
铺满，壳层是悬浮、透明的，不占布局高度。

### custom（第三方接管）
你的 UI 想自己画标题栏/窗口按钮时，调用：

```js
window.desktopWindow.setControls('custom')
```

壳层随即隐藏内置的拖拽条和按钮。你需要在页面里渲染自己的窗口控制，并通过同一套 API
驱动真实的窗口：

```js
// 你自己的"最小化"按钮
btnMinimize.addEventListener('click', () => window.desktopWindow.minimize())
// "最大化/还原"
btnMaximize.addEventListener('click', () => window.desktopWindow.toggleMaximize())
// "关闭"
btnClose.addEventListener('click', () => window.desktopWindow.close())
```

并且你负责提供 **`-webkit-app-region: drag`** 的移动窗口区域（无系统框时窗口需要拖拽
区域才能移动）:

```css
.my-titlebar {
  -webkit-app-region: drag;   /* 可拖区域 */
  user-select: none;
}
.my-window-btn {
  -webkit-app-region: no-drag; /* 按钮不可拖 */
}
```

想切回壳层自带控件：`window.desktopWindow.setControls('native')`。

## 自适应皮肤（CSS 变量）

壳层控件样式全部走 CSS 变量，皮肤可覆盖以融入主题：

```css
:root {
  --dshctrl-h: 34px;                 /* 控件总高 */
  --dshctrl-right: 135px;            /* 预留按钮区宽 */
  --dshctrl-bg: transparent;         /* 容器背景 */
  --dshctrl-color: #a1a1aa;          /* 按钮图标颜色 */
  --dshctrl-color-hover: #f4f4f5;
  --dshctrl-bg-hover: rgba(255,255,255,0.09);
  --dshctrl-bg-active: rgba(255,255,255,0.14);
  --dshctrl-bg-close-hover: #e81123; /* 关闭按钮 hover */
  --dshctrl-color-close-hover: #fff;
}
```

## 最小接入示例（第三方插件）

```js
// 用 dsh-web-ui 之类的客户端插件初始化；以原生 DOM 示例：
const b = window.desktopWindow
// 读取状态
b.getState().then(s => console.log('窗口状态', s))
// 订阅变化（例如同步你自己的最大化按钮图标）
const off = b.onStateChange(({ maximized }) => {
  myMaxBtn.setAttribute('data-max', maximized ? '1' : '0')
})
// 接管窗口按钮（可选，若你要自绘）
b.setControls('custom')
// 一切就绪后更新任务栏标题
b.setTitle('我的 DSH 工作台')
```

## 与第三方 UI 的注意事项

- 壳层使用高 z-index（`2147483646`）悬浮在最顶层；若你的皮肤某个全屏浮层想盖住它，
  可用上面 CSS 变量再抬壳层层级或临时 `setControls('custom')` 隐藏。
- 内置控件只占用右上角很小一块（45px × 3 按钮），一般不会与常规布局冲突。
- 若你的标题栏需要把自己顶到真正的最顶层，建议 `setControls('custom')` 自绘，避免
  与内置按钮视觉重叠。
