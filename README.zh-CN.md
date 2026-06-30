# CodexUltra

[English](README.md) | 简体中文

`CodexUltra` 是针对官方 **OpenAI Codex 桌面应用程序**（微软商店 Product ID `9plm9xgg6vks` 及 macOS Sparkle 分发渠道）的增强重构版本。它引入了自定义品牌、隔离的工作区会话、云控绕过，并集成了 **CodexPro 桥接运行时**，以实现与 OpenAI 智能体开发平台的深度本地文件系统集成。

---

## 💻 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | x64, arm64 | ✅ 已支持 |
| Windows | x64 | ⏳ 开发中 |
| Linux | x64, arm64 | ⏳ 开发中 |

---

## 🌟 核心特性

- **CodexPro 桥接运行时集成**：内置 `vendor/codexpro` 源码运行时，在桌面应用前端和本地文件系统之间提供活跃的 IPC 通道。
- **Cloudflare 隧道集成**：自动配置安全的 **Cloudflare Quick Tunnel** (`https://*.trycloudflare.com`)，在公网 HTTPS 上暴露本地 MCP 桥接服务，允许 ChatGPT 网页端的 Agent Connector（连接器）界面安全地接入并操作您的本地工作区。
- **动态模式切换面板**：在输入框区域挂载了包含两种模式的自定义控制面板：
  - 📝 **GPT规划 (GPT Plan)**：适合规划、阅读和评审。Prompt 会连同当前工作区上下文一起打包并复制到剪贴板。客户端会提示您复制公网 Tunnel URL，并将浏览器自动重定向到 [ChatGPT 连接器设置 (ChatGPT Connectors Settings)](https://chatgpt.com/#settings/Connectors) 页面，方便轻松绑定。
  - ⚡ **Codex执行 (Codex Execute)**：启用实时的文件修改和终端命令执行，允许模型直接在本地工作区进行代码修改和文件写入。
- **用户数据目录隔离**：将用户配置文件、缓存和状态隔离在独立的 `CodexUltra` 目录下，避免干扰官方原版 OpenAI Codex 客户端。
- **Statsig 云控绕过 (App Sunset 补丁)**：绕过强制的客户端下线/更新守卫（如 Statsig 闸口 `2929582856` 弹出的全屏更新拦截），并映射内部 Statsig 闸口属性。
- **增强调试**：在生产环境包中直接开启 Chrome 开发者工具和元素审查。
- **国际化支持**：注入了英文 (`en-US`) 及自定义区域设置。
- **内置安全防护**：具备自动敏感信息（API Keys/密钥）脱敏和严格的工作区路径跨目录安全检测。

---

## 🛠️ 项目架构

```
├── src/
│   ├── codex-ultra/      # 核心集成层
│   │   ├── bridge/       # IPC 处理器、安全检测、会话管理以及 Git 工具
│   │   └── renderer/     # 前端渲染集成与样式配置
│   ├── mac-arm64/        # 未打包的上游资源 (在 sync 时自动生成)
│   └── mac-x64/          # 未打包的上游资源 (在 sync 时自动生成)
├── scripts/              # 自定义补丁工具链
│   ├── patch-all.js      # 顺序运行所有补丁的调度脚本
│   ├── patch-codex-ultra.js # 注入应用品牌、IPC 注册以及 UI 模式控制面板
│   ├── patch-sunset.js   # 绕过应用强制更新限制
│   ├── patch-devtools.js # 启用开发者调试工具
│   ├── patch-i18n.js     # 语言包及区域本地化补丁
│   ├── fetch-msstore.js  # 从微软商店获取 Windows 构建资源
│   └── build-from-upstream.js # 生产打包的主调度脚本
├── test/
│   └── codex-ultra/      # 校验与回归测试套件
├── forge.config.js       # Electron Forge 配置文件
└── package.json          # Node 依赖与项目脚本
```

---

## 🚀 快速上手

### 前置条件

- Node.js (推荐 v18 或更高版本)
- `npm` 包管理器
- macOS 平台：本地需预装 `plutil` 工具（用于修改 `.plist` 品牌配置）

### 安装

克隆本仓库（包括依赖的 Submodules）：

```bash
git clone --recurse-submodules git@github.com:fanyafeng/CodexUltra.git
cd CodexUltra
npm install
```

---

## 💻 开发与同步

### 同步上游资源
同步并解包来自官方上游渠道的最新客户端资源：

```bash
npm run sync
```

### 应用补丁
自动将 `scripts/` 目录下的所有补丁应用到解包好的资源中：

```bash
# 在所有平台下应用补丁
npm run patch

# 仅为 macOS 应用补丁
npm run patch:mac

# 仅为 Windows 应用补丁
npm run patch:win
```

### 启动本地开发模式
在本地开发环境下运行已打补丁的 Electron 客户端：

```bash
npm run dev
# 或
npm run start
```

---

## 📦 构建与打包

生产打包会将资源解包、应用补丁，并在 `out/` 目录下生成最终可发布的分发包。

### macOS (Apple Silicon 与 Intel 芯片)
```bash
# 构建 Apple Silicon 芯片版本 (macOS arm64) - 默认构建
npm run build

# 构建 Intel 芯片版本 (macOS x64)
npm run build:mac-x64

# 重新构建以上两个 macOS 版本
npm run build:mac
```

### Windows & Linux — ⏳ 开发中
> [!NOTE]
> Windows (`npm run build:win`) and Linux (`npm run build:linux`) 的构建命令已在 `package.json` 中定义，但目前暂时处于开发状态。

---

## 🧪 测试与校验

测试套件采用 Node.js 原生的测试运行器 (`node:test`)，用于验证核心模块逻辑和打包规范。

运行所有测试：
```bash
node --test test/codex-ultra/**/*.test.js
```

- **[bridge-core.test.js](test/codex-ultra/bridge-core.test.js)**：校验密钥自动脱敏、路径跨目录安全拦截、桥接会话初始化与元数据持久化。
- **[packaging.test.js](test/codex-ultra/packaging.test.js)**：校验编译后的输出 bundle 中是否被正确注入补丁（如 `bootstrap.js` 中的用户数据隔离和主进程 IPC 注册）。

---

## 👥 致谢

- **[OpenAI](https://github.com/openai)**：官方原版 OpenAI Codex 客户端的设计与开发者。
- **[Cometix Space (Haleclipse)](https://github.com/Haleclipse)**：提供基础的跨平台重构框架及构建工具链。
- **[fanyafeng](https://github.com/fanyafeng)**：CodexUltra 功能定制与主要维护。
- **[Electron Forge](https://www.electronforge.io/)**：打包与构建工具链支持。
