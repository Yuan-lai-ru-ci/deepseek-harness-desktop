# DeepSeek 桌面版 · DeepSeek Harness Desktop

<div align="center">

**DeepSeek 官方智能体的桌面客户端** —— 内置本地 `dsh` 宿主，双击即用，无需另行启动服务。

English | [中文](README.zh.md)

</div>

> 本仓库 fork 自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
> 在 Web 端基础上新增了 **Electron 桌面版**（`desktop/`）：无框原生窗口、页内窗口控制、
> 页内标题栏，并且**打包安装后自动通过 `npx @deepseek-ai/dsh` 拉起本地宿主**，装完即用。
> 上游仓库核心说明保留如下。

---

# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Desktop edition

`desktop/` is a standalone Electron app that wraps the Web UI into a native window:

- Frameless window with an in-page title bar and window controls (floating top-right buttons).
- The installer boots the local host itself via `npx --yes @deepseek-ai/dsh web` — no separate
  service to start.
- Third-party Web UIs (e.g. dsh-web-ui) can reuse or take over the window controls
  (see `desktop/docs/integration.md`).

```sh
cd desktop
npm install
npm start           # development (boot from the source checkout via pnpm dsh web)
npm run dist        # build the NSIS installer -> release/
```

> Note: the packaged app still needs Node.js (with npx) on the machine. On first launch it
> downloads the DSH CLI (a few tens of MB) over the network, then cached by npx for offline use.

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
