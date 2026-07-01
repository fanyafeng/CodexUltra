# CodexUltra

[简体中文](README.zh-CN.md) | English

`CodexUltra` is an enhanced rebuild of the official **OpenAI Codex Desktop Application** (available on the Microsoft Store as Product ID `9plm9xgg6vks` and macOS Sparkle feeds). It introduces custom branding, isolated workspace sessions, cloud-control bypasses, and integrates the **CodexPro Bridge Runtime** to enable advanced local filesystem integrations with OpenAI's agentic developer platform.

---

## 💻 Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS    | x64, arm64   | ✅ Supported |
| Windows  | x64          | ⏳ In Development |
| Linux    | x64, arm64   | ⏳ In Development |

---

## 📖 Usage Workflow (Semi-Automatic)

Currently, the setup and usage flow is **semi-automatic**:

1. **Install & Launch**: Install and open `CodexUltra`.
2. **Switch Mode**: Toggle the mode switch in the composer to **GPT Plan (GPT规划)**.
3. **Configure URL**: If not configured yet, a **Server URL** dialog will pop up.
4. **Auto Tunneling**: The app automatically starts the local `CodexPro` bridge and launches a Cloudflare Quick Tunnel, generating a public URL like:
   `https://xxxx.trycloudflare.com/mcp?codexpro_token=...`
5. **Link ChatGPT**: Copy this URL, open the [ChatGPT Connectors Settings](https://chatgpt.com/#settings/Connectors), and create a new custom connector.
6. **Authentication**: Select **None** as the authentication type (the security token is already embedded in the URL query string).
7. **Verify**: Save the connector, and you can now test GPT invoking local agentic tools in your workspace.

### ⚠️ Current Limitations & Caveats

- **Manual Configuration Required**: Adding the URL to the ChatGPT connector list cannot be fully automated by the app.
- **Dynamic Tunnel URLs**: Because it uses Cloudflare's *Quick Tunnel*, the URL is temporary. Restarting the bridge or the app will generate a new URL, requiring you to update the connector configuration in ChatGPT.
- **Network Dependency**: If the system lacks the `cloudflared` binary, `CodexPro` will attempt to download it automatically to `~/.codexpro/bin`. This step requires an active internet connection.
- **macOS Gatekeeper Warning**: Since production builds are currently **ad-hoc signed**, macOS Gatekeeper might block the app on first launch. You can bypass this by right-clicking the app and selecting *Open*, or allowing it in *System Settings > Privacy & Security*. (Smooth distribution requires a paid Apple Developer ID signature and notarization).

### 🗺️ Future Roadmap (Next Steps)
To achieve a "configure once, run forever" experience without repeatedly copying URLs, the project plans to support:
- **Cloudflare Named Tunnels**: Persistent, static tunnel configurations.
- **Custom Domains**: Pointing the bridge directly to your own secure domain.

---

## 🌟 Key Features

- **CodexPro Bridge Runtime Integration**: Bundles the `vendor/codexpro` source runtime, providing an active IPC channel between the desktop app and your local filesystem.
- **Cloudflare Tunnel Integration**: Automatically provisions a secure **Cloudflare Quick Tunnel** (`https://*.trycloudflare.com`) to expose the local MCP bridge over HTTPS, allowing the ChatGPT Web Agent Connector interface to securely access your local workspace.
- **Dynamic Mode Switch Panel**: Mounts a custom control panel inside the composer input webview with two modes:
  - 📝 **GPT Plan (GPT规划)**: Ideal for planning, reading, and reviewing. Prompts are packaged with workspace context and copied to the clipboard. The client prompts you to copy the public Tunnel URL and redirects you to the [ChatGPT Connectors Settings](https://chatgpt.com/#settings/Connectors) to easily link the agent.
  - ⚡ **Codex Execute (Codex执行)**: Enables real-time filesystem edits and terminal commands, allowing the model to perform changes and write to files directly in your local workspace.
- **UserData Directory Isolation**: Isolates user profile, cache, and state under `CodexUltra` to avoid interfering with official OpenAI Codex installations.
- **Statsig Cloud Control Bypass (App Sunset Patch)**: Bypasses forced client sunset/update gates (such as Statsig gate `2929582856` which normally displays a full-screen block requiring updates) and maps internal Statsig gates.
- **Enhanced Debugging**: Enables Chrome DevTools and element inspections directly in production builds.
- **Internationalization Support**: Patches English (`en-US`) and custom locale injections.
- **Built-in Security & Safety**: Features automatic API key/secret redaction and strict workspace path traversal checks.

---

## 🛠️ Project Architecture

```
├── src/
│   ├── codex-ultra/      # Core integration layer
│   │   ├── bridge/       # IPC handlers, safety checks, sessions, and Git tools
│   │   └── renderer/     # Frontend integration and UI styling
│   ├── mac-arm64/        # Unpacked upstream assets (generated during sync)
│   └── mac-x64/          # Unpacked upstream assets (generated during sync)
├── scripts/              # Custom patching toolchain
│   ├── patch-all.js      # Orchestrator to run all patches in sequence
│   ├── patch-codex-ultra.js # Injects branding, IPC registration, and UI mode controls
│   ├── patch-sunset.js   # Disables forced app sunset/updates
│   ├── patch-devtools.js # Enables developer inspection tools
│   ├── patch-i18n.js     # Patches language files and localization
│   ├── fetch-msstore.js  # Fetches assets from Microsoft Store for Windows builds
│   └── build-from-upstream.js # Main production packaging orchestrator
├── test/
│   └── codex-ultra/      # Verification and regression tests
├── forge.config.js       # Electron Forge configuration
└── package.json          # Node dependencies and project scripts
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- `npm` package manager
- macOS: `plutil` (pre-installed) for `.plist` modifications during branding

### Installation

Clone the repository with submodules:

```bash
git clone --recurse-submodules git@github.com:fanyafeng/CodexUltra.git
cd CodexUltra
npm install
```

---

## 💻 Development & Syncing

### Sync Upstream
To synchronize and unpack the latest release assets from the upstream desktop application feed:

```bash
npm run sync
```

### Apply Patches
All patching scripts under `scripts/` can be applied automatically:

```bash
# Run all patches across all platforms
npm run patch

# Run patches for macOS only
npm run patch:mac

# Run patches for Windows only
npm run patch:win
```

### Start in Development Mode
To boot up the patched Electron client in a local development environment:

```bash
npm run dev
# or
npm run start
```

---

## 📦 Building and Packaging

Production packaging extracts, patches, and rebuilds the final application bundles inside the `out/` directory.

### macOS (Apple Silicon & Intel)
```bash
# Build for Apple Silicon (macOS arm64) - Default build
npm run build

# Build for Intel Mac (macOS x64)
npm run build:mac-x64

# Rebuild both macOS bundles
npm run build:mac
```

### Windows & Linux — ⏳ In Development
> [!NOTE]
> Windows (`npm run build:win`) and Linux (`npm run build:linux`) build commands are defined in `package.json` but are temporarily disabled or in development.

---

## 🧪 Testing and Verification

Tests are written using Node's native test runner (`node:test`) to verify both core library logic and packaging compliance.

Run all tests:
```bash
node --test test/codex-ultra/**/*.test.js
```

- **[bridge-core.test.js](test/codex-ultra/bridge-core.test.js)**: Verifies secrets redaction, path traversal safety, workspace setup, and metadata storage.
- **[packaging.test.js](test/codex-ultra/packaging.test.js)**: Verifies that patches have been correctly applied to generated bundle outputs (such as user profile path changes in `bootstrap.js` and IPC bindings).

---

## 👥 Credits

- **[OpenAI](https://github.com/openai)**: Creator of the original OpenAI Codex Desktop client.
- **[Cometix Space (Haleclipse)](https://github.com/Haleclipse)**: Base cross-platform rebuilding framework and build toolchains.
- **[fanyafeng](https://github.com/fanyafeng)**: CodexUltra customizations and active development.
- **[Electron Forge](https://www.electronforge.io/)**: Packaging and distribution toolchain.

