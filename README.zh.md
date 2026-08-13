# DeepSeek 桌面版 · DeepSeek Harness Desktop

<div align="center">

**DeepSeek 官方智能体的桌面客户端** —— 内置本地 `dsh` 宿主，双击即用，无需另行启动服务。

[English](README.md) | 中文

</div>

> 本仓库 fork 自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
> 在 Web 端基础上新增了 **Electron 桌面版**（`desktop/`）：无框原生窗口、页内窗口控制、
> 页内标题栏，并且**打包安装后自动通过 `npx @deepseek-ai/dsh` 拉起本地宿主**，装完即用。
> 上游仓库核心说明保留如下。

---

# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 桌面版（Desktop）

`desktop/` 是一个独立 Electron 应用，把上述 Web 端包成原生桌面窗口：

- 无框窗口 + 页内标题栏、窗口控制按钮；页内右上角可悬浮窗口按钮。
- 安装包会自动通过 `npx --yes @deepseek-ai/dsh web` 拉起本地宿主，无需手动启动服务。
- 支持第三方 Web UI（如 dsh-web-ui）接入/接管窗口控制（见 `desktop/docs/integration.md`）。

```sh
cd desktop
npm install
npm start           # 开发运行（走仓库源码 pnpm dsh web）
npm run dist        # 打包 NSIS 安装包 -> release/
```

> 安装包运行时仍需要本机有 Node.js（含 npx）。首次启动会联网下载 DSH CLI（约几十 MB），之后走 npx 缓存。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令会启动 Web UI，默认地址为 `http://127.0.0.1:3080`。详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="assets/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
