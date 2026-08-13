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
├── scripts/
│   ├── generate-icons.mjs   # 从 icon.svg 重新生成图标
│   ├── verify-lifecycle.js   # HostProcess 启停 & 孤儿进程清理验证
│   ├── verify-e2e.js         # app.quit 后无孤儿宿主验证
│   └── verify-titlebar.js    # frameless 页内标题栏 + 窗口控制桥验证
├── src/
│   ├── main.js       # Electron 主进程：frameless 窗口、IPC、生命周期、宿主管理
│   ├── host.js       # dsh web 宿主进程管理（定位/启动/就绪等待/进程树清理）
│   ├── titlebar.js   # 页内标题栏注入（CSS + DOM + 按钮）
│   └── preload.js    # 窗口控制 IPC 桥（contextBridge，安全隔离）
├── .npmrc           # 本机代理（下载 Electron 二进制的 network 需要）
└── package.json     # electron + electron-builder
```

## 界面：无框窗口 + 页内标题栏

桌面窗口去掉系统标题栏和菜单（`frame: false`），用一个**页内标题栏**承载标题与窗口控制按钮
（最小化/最大化-还原/关闭），与 DeepSeek Harness 深色主题融为一体：

- `src/titlebar.js` 注入标题栏 DOM + CSS（`-webkit-app-region: drag` 拖拽区，按钮 `no-drag`），
  并给 `body` 加 `padding-top` 让内容下移、让出标题栏高度，避免遮挡现有侧边栏/对话区。
- `src/preload.js` 用 contextBridge 暴露 `window.desktopWindow`（minimize/maximize/close/isMaximized/onMaximizedChange），
  页内按钮通过它驱动真实窗口；主进程 `maximize/unmaximize` 时推送状态同步按钮图标。
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

`scripts/verify-lifecycle.js` 验证 HostProcess 启停且不残留孤儿宿主：

```sh
node scripts/verify-lifecycle.js
```

## 路线 A（后续迭代，架构级 IPC shell）

上游为 Electron 预留的「正确」接入方式：

1. 新建 `apps/electron`，写 `startHost()` 组装 + `AbstractApiClient` 的 IPC 传输子类
   （reference: `packages/host/apiproxy/src/fetch/client.ts` 的 doFetch 抽象）。
2. `dist` 走 `file://` 加载，fetch 通过 IPC bridge（renderer ⇄ main ⇄ host）。
3. 处理流/SSE、插件 bundle、`__DSH_BOOT__` manifest 注入；不再依赖本地 HTTP server。

成本与风险显著高于路线 B，跟随快速演进的 `0.1.0-rc` 需持续对齐。
