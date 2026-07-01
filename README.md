# CodexUltra

[简体中文](README.zh-CN.md) | English

`CodexUltra` is a macOS desktop rebuild of the official OpenAI Codex Desktop client. It keeps local Codex execution intact and adds a CodexPro bridge so ChatGPT in the browser can connect to the current workspace through a Server URL, produce plans, write `.ai-bridge` handoff files, and hand execution back to the local CodexUltra app.

Current version: `0.0.1`

---

## How To Use

### 1. Install And Launch

1. Download `CodexUltra-mac-arm64-0.0.1.dmg` from the release artifacts.
2. Open the DMG and copy `CodexUltra.app` to `/Applications`.
3. Launch `CodexUltra`.
4. If macOS blocks the app because the developer cannot be verified, right-click `CodexUltra.app` and choose `Open`, or allow it in `System Settings > Privacy & Security`.

> Current builds are ad-hoc signed. Smooth public distribution requires Apple Developer ID signing and notarization.

### 2. Use Codex Execute

Use `Codex执行` / `Codex Execute` for local code changes, terminal commands, and file edits.

This mode uses the local CodexUltra client and does not require a ChatGPT Server URL.

### 3. Configure GPT Planning

`GPT规划` / `GPT Plan` is for browser ChatGPT planning, reading, review, and handoff. The local bridge is automatic, but adding the connector in ChatGPT is still manual.

1. Switch the composer mode to `GPT规划`.
2. If no URL is configured, CodexUltra shows a `Server URL` dialog.
3. CodexUltra starts the local CodexPro bridge and opens a Cloudflare Quick Tunnel.
4. Wait for a URL like:

```text
https://xxxx.trycloudflare.com/mcp?codexpro_token=...
```

5. Click `Copy URL`.
6. Click `Open Settings`, or open [ChatGPT Connectors Settings](https://chatgpt.com/#settings/Connectors).
7. Create a custom connector / MCP connector in ChatGPT.
8. Paste the copied URL into `Server URL`.
9. Choose `None` for authentication because `codexpro_token` is already in the URL.
10. Save the connector.

### 4. Smoke Test The GPT Bridge

In ChatGPT, choose the connector you created and send:

```text
Use CodexPro to write one line to .ai-bridge/gpt-smoke-test.md: GPT bridge smoke test OK. Only write that file and do not modify anything else.
```

Then check the local workspace for:

```text
.ai-bridge/gpt-smoke-test.md
```

Expected content:

```text
GPT bridge smoke test OK
```

### 5. Recommended Daily Workflow

1. Switch CodexUltra to `GPT规划`.
2. Ask ChatGPT to inspect the project through CodexPro and produce a plan.
3. Ask ChatGPT to write the final plan to `.ai-bridge/current-plan.md`.
4. Switch back to `Codex执行`.
5. Ask CodexUltra to execute the local changes from `.ai-bridge/current-plan.md`.

This keeps ChatGPT focused on planning and review while local Codex performs implementation and verification.

### 6. Important Notes

- **Not fully automatic**: CodexUltra can start the local bridge and generate the Server URL, but ChatGPT connector creation still requires manual setup in the browser.
- **Quick Tunnel URLs change**: The default Cloudflare Quick Tunnel URL is temporary. Restarting the app or bridge can produce a new `trycloudflare.com` URL, so the ChatGPT connector may need to be updated.
- **Keep the app running**: ChatGPT can only call local tools while CodexUltra / CodexPro bridge is running.
- **Do not publish the Server URL**: It includes `codexpro_token`, which acts like a temporary access credential.
- **Network is required**: If `cloudflared` is missing, CodexPro attempts to download it to `~/.codexpro/bin`.

---

## Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS | arm64 | `0.0.1` release artifact available |
| macOS | x64 | Build script available, build locally |
| Windows | x64 | In development |
| Linux | x64, arm64 | In development |

---

## Key Features

- **Codex / GPT mode switch**: `Codex Execute` is for local implementation; `GPT Plan` is for browser ChatGPT planning, review, and handoff.
- **CodexPro bridge integration**: Bundles `vendor/codexpro` and exposes the current workspace to ChatGPT through an MCP Server URL.
- **Cloudflare Quick Tunnel**: Generates a public HTTPS Server URL for ChatGPT browser access.
- **`.ai-bridge` handoff directory**: Central location for GPT plans, reviews, smoke tests, and Codex execution context.
- **User data isolation**: Stores profile, cache, and state under `CodexUltra` instead of overwriting official Codex data.
- **Safety checks**: Redacts common secrets and blocks workspace path traversal.
- **Debug support**: Keeps DevTools / inspection support available for development and troubleshooting.

---

## Project Structure

```text
├── src/
│   ├── codex-ultra/          # CodexUltra integration layer
│   │   ├── bridge/           # IPC, CodexPro bridge, sessions, context, safety checks
│   │   └── renderer/         # Frontend injection and UI
│   ├── mac-arm64/            # Unpacked upstream macOS arm64 assets
│   └── mac-x64/              # Unpacked upstream macOS x64 assets
├── scripts/
│   ├── patch-all.js          # Patch orchestrator
│   ├── patch-codex-ultra.js  # CodexUltra UI / IPC / bridge injection
│   ├── patch-devtools.js     # DevTools patch
│   ├── patch-i18n.js         # Locale patching
│   ├── sync-upstream.js      # Sync upstream client assets
│   └── build-from-upstream.js # Production packaging script
├── test/
│   └── codex-ultra/          # Bridge and packaging regression tests
├── vendor/
│   └── codexpro/             # CodexPro bridge runtime
└── package.json
```

---

## Developer Setup

### Prerequisites

- Node.js 18 or newer
- npm
- macOS build tools available by default: `plutil`, `hdiutil`, `codesign`
- `vendor/codexpro` submodule

### Clone And Install

```bash
git clone --recurse-submodules git@github.com:fanyafeng/CodexUltra.git
cd CodexUltra
npm install
```

If the repository was cloned without submodules:

```bash
git submodule update --init --recursive
```

### Sync Upstream Assets

```bash
npm run sync
```

### Apply Patches

```bash
npm run patch

# macOS only
npm run patch:mac
```

### Start Development Mode

```bash
npm run dev
```

---

## Build Release Artifacts

Default macOS arm64 build:

```bash
npm run build
```

Artifacts are written to `out/`:

```text
out/CodexUltra-mac-arm64-0.0.1.dmg
out/CodexUltra-mac-arm64-0.0.1.zip
```

Build macOS x64:

```bash
npm run build:mac-x64
```

Build both macOS architectures:

```bash
npm run build:mac
```

Windows and Linux build scripts are still in development and are not recommended as current release artifacts.

---

## Testing And Verification

Run regression tests:

```bash
node --test test/codex-ultra/bridge-core.test.js test/codex-ultra/packaging.test.js
```

Verify macOS code signature integrity:

```bash
codesign --verify --deep --strict --verbose=4 out/mac-arm64/CodexUltra.app
```

Check app version metadata:

```bash
plutil -p out/mac-arm64/CodexUltra.app/Contents/Info.plist | rg 'CFBundleShortVersionString|CFBundleVersion'
```

Expected values for `0.0.1`:

```text
CFBundleShortVersionString => 0.0.1
CFBundleVersion => 1
```

---

## Before Open Sourcing

- Do not commit `out/` build artifacts.
- Do not commit `.ai-bridge/`.
- Do not commit a full `https://*.trycloudflare.com/mcp?codexpro_token=...` URL.
- Do not commit local `.env` files, Cloudflare tokens, ngrok tokens, Apple signing certificates, or private keys.
- Prefer `git archive` or GitHub release source archives instead of zipping the full working directory.

---

## Credits

- [OpenAI](https://github.com/openai): Official Codex Desktop client.
- [Cometix Space (Haleclipse)](https://github.com/Haleclipse): Cross-platform rebuild and packaging foundation.
- [fanyafeng](https://github.com/fanyafeng): CodexUltra customization and development.
- [Electron Forge](https://www.electronforge.io/): Electron packaging toolchain.
