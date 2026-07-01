# CodexUltra

[English](README.md) | 简体中文

`CodexUltra` 是基于官方 OpenAI Codex Desktop 客户端重构的 macOS 桌面应用。它保留 Codex 本地执行能力，并额外集成 CodexPro bridge，让网页端 ChatGPT 可以通过 Server URL 读取当前工作区、生成规划、写入 `.ai-bridge` 交接文件，再交给 CodexUltra 本地执行。

当前版本：`0.0.1`

---

## 普通用户如何使用

### 1. 安装并启动

1. 下载发布产物中的 `CodexUltra-mac-arm64-0.0.1.dmg`。
2. 打开 DMG，把 `CodexUltra.app` 拖到 `/Applications`。
3. 启动 `CodexUltra`。
4. 如果 macOS 提示无法验证开发者，右键点击 `CodexUltra.app`，选择“打开”；或者到“系统设置 > 隐私与安全”中允许打开。

> 当前发布包是 ad-hoc 签名，还没有 Apple Developer ID 签名和 notarization，所以外部分发时可能触发 Gatekeeper 提示。

### 2. 使用 Codex 执行模式

默认可以直接使用 `Codex执行` 模式。这个模式面向本地代码修改、终端命令、文件写入等实际执行工作。

`Codex执行` 仍然走 CodexUltra 本地客户端，不需要把 Server URL 配到 ChatGPT。

### 3. 首次配置 GPT 规划模式

`GPT规划` 是给网页端 ChatGPT 做规划、阅读、审查和交接用的。当前不是全自动配置，ChatGPT 网页端还需要手动添加一次连接器。

1. 在 CodexUltra 输入框左上方切换到 `GPT规划`。
2. 如果还没有配置，界面会弹出 `Server URL` 窗口。
3. CodexUltra 会自动启动本地 CodexPro bridge，并尝试开启 Cloudflare Quick Tunnel。
4. 等待窗口里出现类似下面的 URL：

```text
https://xxxx.trycloudflare.com/mcp?codexpro_token=...
```

5. 点击 `复制 URL`。
6. 点击 `打开设置`，或手动打开 [ChatGPT Connectors 设置](https://chatgpt.com/#settings/Connectors)。
7. 在 ChatGPT 网页端新建自定义连接器 / MCP 连接器。
8. `Server URL` 粘贴刚才复制的 URL。
9. Authentication / 认证方式选择 `None`，因为 `codexpro_token` 已经在 URL 参数里。
10. 保存连接器。

### 4. 测试 GPT bridge 是否可用

在 ChatGPT 中选择刚配置的连接器，然后发一条只写 `.ai-bridge` 的测试请求：

```text
通过 CodexPro 在 .ai-bridge/gpt-smoke-test.md 写入一行：GPT bridge smoke test OK。只写这个文件，不要改其他文件。
```

如果成功，回到本地项目目录，应该能看到：

```text
.ai-bridge/gpt-smoke-test.md
```

文件内容应为：

```text
GPT bridge smoke test OK
```

### 5. 日常使用方式

推荐工作流：

1. 在 CodexUltra 中切到 `GPT规划`。
2. 把需求发给 GPT，让它通过 CodexPro 读取项目并生成规划。
3. 让 GPT 把最终规划写入 `.ai-bridge/current-plan.md`。
4. 回到 CodexUltra，切到 `Codex执行`。
5. 让 Codex 按 `.ai-bridge/current-plan.md` 执行实际代码修改。

这样 GPT 主要负责规划和审查，CodexUltra 本地侧负责真正执行和验证。

### 6. 重要注意事项

- **不是全自动**：CodexUltra 可以自动启动本地 bridge 和生成 URL，但 ChatGPT 网页端的新建连接器、粘贴 URL、保存连接器这一步仍需手动完成。
- **Quick Tunnel URL 会变化**：当前默认使用 Cloudflare Quick Tunnel。App 或 bridge 重启后，`trycloudflare.com` URL 可能变化，需要把新的 URL 更新到 ChatGPT 连接器里。
- **App 要保持运行**：ChatGPT 调用本地工具时，CodexUltra / CodexPro bridge 需要保持运行。
- **不要公开 Server URL**：URL 中包含 `codexpro_token`，等同于临时访问凭证。不要把完整 URL 提交到 GitHub、README、issue、截图或公开聊天中。
- **需要网络**：如果本机没有 `cloudflared`，CodexPro 会尝试自动下载到 `~/.codexpro/bin`，这一步需要网络可用。

---

## 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | arm64 | 已生成 `0.0.1` 发布产物 |
| macOS | x64 | 构建脚本已保留，需要本地构建 |
| Windows | x64 | 开发中 |
| Linux | x64, arm64 | 开发中 |

---

## 核心特性

- **Codex / GPT 双模式**：`Codex执行` 用于本地代码修改；`GPT规划` 用于网页端 ChatGPT 规划、审查和交接。
- **CodexPro bridge 集成**：内置 `vendor/codexpro` 源码运行时，通过 MCP Server URL 把本地工作区暴露给 ChatGPT 连接器。
- **Cloudflare Quick Tunnel**：自动生成公网 HTTPS Server URL，方便 ChatGPT 网页端访问本地 bridge。
- **`.ai-bridge` 交接目录**：GPT 规划、审查、测试请求和 Codex 执行上下文都集中写入 `.ai-bridge`。
- **用户数据隔离**：用户配置、缓存和状态存放在独立的 `CodexUltra` 目录，不覆盖官方 Codex 客户端数据。
- **安全处理**：内置敏感信息脱敏和工作区路径越界检查。
- **调试支持**：生产包中保留 DevTools / inspection 相关能力，方便开发阶段排查 UI 和 bridge 问题。

---

## 项目结构

```text
├── src/
│   ├── codex-ultra/          # CodexUltra 集成层
│   │   ├── bridge/           # IPC、CodexPro bridge、会话、上下文、安全检查
│   │   └── renderer/         # 前端注入逻辑和 UI
│   ├── mac-arm64/            # 解包后的 macOS arm64 上游资源
│   └── mac-x64/              # 解包后的 macOS x64 上游资源
├── scripts/
│   ├── patch-all.js          # 补丁调度脚本
│   ├── patch-codex-ultra.js  # CodexUltra UI / IPC / bridge 注入
│   ├── patch-devtools.js     # DevTools 补丁
│   ├── patch-i18n.js         # 语言与本地化补丁
│   ├── sync-upstream.js      # 同步上游客户端资源
│   └── build-from-upstream.js # 生产打包脚本
├── test/
│   └── codex-ultra/          # bridge 和打包回归测试
├── vendor/
│   └── codexpro/             # CodexPro bridge runtime
└── package.json
```

---

## 开发者快速开始

### 前置条件

- Node.js 18 或更高版本
- npm
- macOS 构建需要系统自带的 `plutil`、`hdiutil`、`codesign`
- 需要克隆 submodule：`vendor/codexpro`

### 克隆和安装

```bash
git clone --recurse-submodules git@github.com:fanyafeng/CodexUltra.git
cd CodexUltra
npm install
```

如果已经克隆但没有 submodule：

```bash
git submodule update --init --recursive
```

### 同步上游资源

```bash
npm run sync
```

### 应用补丁

```bash
npm run patch

# 仅 macOS
npm run patch:mac
```

### 本地开发启动

```bash
npm run dev
```

---

## 构建发布产物

默认构建 macOS arm64：

```bash
npm run build
```

生成产物位于 `out/`：

```text
out/CodexUltra-mac-arm64-0.0.1.dmg
out/CodexUltra-mac-arm64-0.0.1.zip
```

构建 macOS x64：

```bash
npm run build:mac-x64
```

同时构建两个 macOS 架构：

```bash
npm run build:mac
```

Windows 和 Linux 构建脚本仍在开发中，不建议作为当前发布产物使用。

---

## 测试和验证

运行回归测试：

```bash
node --test test/codex-ultra/bridge-core.test.js test/codex-ultra/packaging.test.js
```

验证 macOS app 签名完整性：

```bash
codesign --verify --deep --strict --verbose=4 out/mac-arm64/CodexUltra.app
```

检查版本信息：

```bash
plutil -p out/mac-arm64/CodexUltra.app/Contents/Info.plist | rg 'CFBundleShortVersionString|CFBundleVersion'
```

当前 `0.0.1` 期望值：

```text
CFBundleShortVersionString => 0.0.1
CFBundleVersion => 1
```

---

## 开源前注意

- 不要提交 `out/` 构建产物。
- 不要提交 `.ai-bridge/`。
- 不要提交完整的 `https://*.trycloudflare.com/mcp?codexpro_token=...` URL。
- 不要提交本地 `.env`、Cloudflare token、ngrok token、Apple 签名证书或私钥。
- 发布源码包时优先使用 `git archive` 或 GitHub Release source archive，不要直接压缩整个工作目录。

---

## 致谢

- [OpenAI](https://github.com/openai)：官方 Codex Desktop 客户端。
- [Cometix Space (Haleclipse)](https://github.com/Haleclipse)：跨平台重构和打包基础。
- [fanyafeng](https://github.com/fanyafeng)：CodexUltra 定制开发。
- [Electron Forge](https://www.electronforge.io/)：Electron 打包工具链。
