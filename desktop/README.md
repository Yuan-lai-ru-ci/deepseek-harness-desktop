# DeepSeek Harness Desktop (Electron wrapper)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`，从
本仓库 fork）用 Electron 包成桌面应用。首版走「路线 B」：Electron 主进程在本地
spawn `dsh web` 宿主，`BrowserWindow` 加载其 Web UI（默认 `http://127.0.0.1:3080`）。

> 上游架构文档（`2026-07-19-gui-layering-and-rpc-protocol.md`）明确预留了 Electron
> 的「路线 A」：加载 `dist` over `file://` + fetch 走 IPC bridge。当前为稳定的
> 路线 B 首版；后续可渐进迁移（见文末「路线 A」）。

## 目录结构

```
desktop/
├── assets/          # 应用图标（SVG 源 + 生成的 PNG/ICO）
├── docs/
│   └── integration.md # 三方 Web UI 接入/接管窗口壳层指南
├── scripts/
│   ├── generate-icons.mjs   # 从 icon.svg 重新生成图标
│   ├── verify-lifecycle.js   # HostProcess 启停 & 孤儿进程清理验证
│   ├── verify-e2e.js         # app.quit 后无孤儿宿主验证
│   └── verify-titlebar.js    # 通用窗口壳层 + 窗口控制 API 验证
├── src/
│   ├── main.js       # Electron 主进程：frameless 窗口、IPC、生命周期、宿主管理
│   ├── host.js       # dsh web 宿主进程管理（定位/启动/就绪等待/进程树清理）
│   ├── titlebar.js   # 通用窗口壳层注入（拖拽条 + 窗口按钮，CSS 变量化）
│   └── preload.js    # 窗口控制 API 桥（contextBridge，安全隔离）
├── .npmrc           # 本机代理（下载 Electron 二进制的 network 需要）
└── package.json     # electron + electron-builder
```

## 界面：无框窗口 + 通用窗口壳层

桌面窗口去掉系统标题栏和菜单（`frame: false`），用一套**通用窗口壳层**承载窗口移动与
窗口控制按钮（最小化/最大化-还原/关闭）。壳层**不占布局高度、不以任何特定 UI 为前提**：
内容铺满窗口顶部，壳层以悬浮透明层叠加在页面之上。

- `src/titlebar.js`：注入顶部拖拽条（`-webkit-app-region: drag`）+ 右上角按钮簇（`no-drag`），
  样式走 CSS 变量（`--dshctrl-*`）便于三方皮肤覆盖（详见 `docs/integration.md`）。
- `src/preload.js`：contextBridge 暴露 `window.desktopWindow`，通用窗口控制 API：
  `minimize/maximize/toggleMaximize/close/isMaximized/getState/onStateChange/setTitle/`
  `setControls('native'|'custom')`。主进程 `maximize/unmaximize/fullscreen` 变化时推送状态。
- **给三方 UI 留出接入空间**：任何注入到 dsh web 页面的插件（如 dsh-web-ui 皮肤）都能
  调用 `desktopWindow`；想要 `自绘标题栏/窗口按钮` 时可调 `setControls('custom')` 隐藏
  内置控件并自己接管窗口。详见 `docs/integration.md`。
- F12 = 开发者工具，F5 = 重载（无系统菜单后保留的快捷键）。

## 环境要求

- Node.js（本工程在 `v24` 验证）
- pnpm（monorepo 使用；Electron 首版只定位 `dsh web` 需要 pnpm）

## 运行

先构建一次 monorepo（部署 `dsh` 宿主与 Web UI）：

```sh
# 在仓库根（source/）
pnpm install
pnpm run build
```

再启动桌面应用：

```sh
cd desktop
npm install          # 下载 Electron（需代理，见 .npmrc）
npm start            # 或 npm run dev
```

应用会：
1. 探测仓库根，`spawn pnpm dsh web`；
2. 轮询 `http://127.0.0.1:3080`，就绪后 `BrowserWindow` 加载；
3. 关闭所有窗口时停止宿主（Windows 下 `taskkill /T` 杀整棵进程树，避免孤儿进程）。

### 自定义

| 环境变量 | 作用 | 默认 |
|---|---|---|
| `DSH_CMD` | 覆盖宿主启动命令 | 自动探测（源码 `pnpm dsh web` / 全局 `dsh`） |
| `DSH_PORT` | 宿主 HTTP 端口 | `3080` |

## 打包

```sh
cd desktop
npm run icons   # 改了 assets/icon.svg 后重新生成图标
npm run dist    # electron-builder 产出 NSIS 安装包（release/）
```

## 验证

- `npm run verify:lifecycle`：HostProcess 启停且不残留孤儿宿主。
- `npm run verify:e2e`：app.quit 正常退路径后无孤儿宿主。
- `npm run verify:titlebar`：通用窗口壳层（布局不被下移）+ `desktopWindow` 全 API
  （含 getState / setTitle / setControls('custom') 接管 / 'native' 恢复）。

## 路线 A（后续迭代，架构级 IPC shell）

上游为 Electron 预留的「正确」接入方式：

1. 新建 `apps/electron`，写 `startHost()` 组装 + `AbstractApiClient` 的 IPC 传输子类
   （reference: `packages/host/apiproxy/src/fetch/client.ts` 的 doFetch 抽象）。
2. `dist` 走 `file://` 加载，fetch 通过 IPC bridge（renderer ⇄ main ⇄ host）。
3. 处理流/SSE、插件 bundle、`__DSH_BOOT__` manifest 注入；不再依赖本地 HTTP server。

成本与风险显著高于路线 B，跟随快速演进的 `0.1.0-rc` 需持续对齐。
