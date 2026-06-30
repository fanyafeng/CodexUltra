#!/usr/bin/env node
/**
 * CodexUltra integration: mode switch entrypoint.
 *
 * This patch is intentionally small and string-based because CodexDesktop-Rebuild
 * carries the upstream Electron app as generated bundles under src/<platform>/_asar.
 */
const fs = require("fs");
const path = require("path");
const { locateBundles, relPath, SRC_DIR } = require("./patch-util");

function replaceAll(file, replacements) {
  if (!fs.existsSync(file)) return false;
  let text = fs.readFileSync(file, "utf8");
  const original = text;
  for (const [from, to] of replacements) text = text.split(from).join(to);
  if (text !== original) {
    fs.writeFileSync(file, text);
    return true;
  }
  return false;
}

function patchPackageJson(platform) {
  const targets = [
    path.join(SRC_DIR, platform, "_asar", "package.json"),
    path.join(SRC_DIR, "package.json"),
  ];
  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.name = "codex-ultra";
    pkg.productName = "CodexUltra";
    pkg.description = "CodexUltra macOS app with bundled CodexPro bridge runtime";
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`  [ok] branded ${relPath(file)}`);
  }
}

function patchMainBundle(platform) {
  const bundles = locateBundles({ dir: "build", pattern: /^main-.*\.(?:js|mjs|cjs)$|^main\.(?:js|mjs|cjs)$/, platform });
  for (const bundle of bundles) {
    let text = fs.readFileSync(bundle.path, "utf8");
    const original = text;
    text = text.replace(/app\.setName\((['"`])Codex\1\);?/g, 'app.setName("CodexUltra");');
    text = text.replace(/(["'`])Codex\1/g, '"CodexUltra"');
    if (!text.includes("registerCodexUltraIpcMain")) {
      text += `
;try {
  const { app } = require("electron");
  app.setName("CodexUltra");
  app.setPath("userData", require("path").join(app.getPath("appData"), "CodexUltra"));
  require(require("path").join(process.resourcesPath, "codex-ultra", "bridge", "ipc", "codexUltraIpcMain.js")).registerCodexUltraIpcMain();
} catch (error) {
  console.error("[CodexUltra] IPC bootstrap failed", error);
}
`;
    }
    if (text !== original) {
      fs.writeFileSync(bundle.path, text);
      console.log(`  [ok] main integration ${relPath(bundle.path)}`);
    }
  }
}

function patchBootstrapBundle(platform) {
  const bundles = locateBundles({ dir: "build", pattern: /^bootstrap\.(?:js|mjs|cjs)$/, platform });
  const upstreamUserData = "function C({appDataPath:e,buildFlavor:n,env:r}){let i=r.CODEX_ELECTRON_USER_DATA_PATH?.trim();if(i)return(0,a.resolve)(i);let o=(0,a.join)(e,t.wa(n)),s=r.CODEX_ELECTRON_AGENT_RUN_ID?.trim()||null;return n===`agent`&&s!=null?(0,a.join)(o,`agent`,s):o}";
  const codexUltraUserData = "function C({appDataPath:e,buildFlavor:n,env:r}){let i=r.CODEX_ELECTRON_USER_DATA_PATH?.trim();if(i)return(0,a.resolve)(i);let o=(0,a.join)(e,`CodexUltra`),s=r.CODEX_ELECTRON_AGENT_RUN_ID?.trim()||null;return n===`agent`&&s!=null?(0,a.join)(o,`agent`,s):o}";
  for (const bundle of bundles) {
    let text = fs.readFileSync(bundle.path, "utf8");
    const original = text;
    text = text.split(upstreamUserData).join(codexUltraUserData);
    text = text.split("i.app.setName(t.wa(Q,se)),i.app.setPath(`userData`,C(").join("i.app.setName(`CodexUltra`),i.app.setPath(`userData`,C(");
    if (text !== original) {
      fs.writeFileSync(bundle.path, text);
      console.log(`  [ok] bootstrap identity ${relPath(bundle.path)}`);
    }
  }
}

function patchPreloadBundle(platform) {
  const bundles = locateBundles({ dir: "build", pattern: /^preload\.(?:js|mjs|cjs)$/, platform });
  const bridgeSource = `
;try {
  const { contextBridge, ipcRenderer } = require("electron");
  contextBridge.exposeInMainWorld(\`codexUltra\`, {
    invoke(channel, payload) {
      if (typeof channel !== "string" || !channel.startsWith(\`codexUltra:\`)) {
        throw new Error("Unsupported CodexUltra IPC channel");
      }
      return ipcRenderer.invoke(channel, payload);
    }
  });
} catch (error) {
  console.error("[CodexUltra] preload bridge failed", error);
}
`;
  for (const bundle of bundles) {
    let text = fs.readFileSync(bundle.path, "utf8");
    if (text.includes("exposeInMainWorld(`codexUltra`")) continue;
    const sourceMapIndex = text.indexOf("\n//# sourceMappingURL=");
    text =
      sourceMapIndex === -1
        ? `${text}\n${bridgeSource}`
        : `${text.slice(0, sourceMapIndex)}\n${bridgeSource}${text.slice(sourceMapIndex)}`;
    fs.writeFileSync(bundle.path, text);
    console.log(`  [ok] preload CodexUltra bridge ${relPath(bundle.path)}`);
  }
}

function rendererInjectionSource() {
  return `
;(() => {
  // CodexUltra integration: mode switch entrypoint
  const STYLE_ID = "codex-ultra-style";
  const state = { mode: localStorage.getItem("codexUltra.mode") || "codex_execute" };
  let installScheduled = false;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ".codex-ultra-mode-slot{position:fixed;display:inline-flex;align-items:center;justify-content:center;z-index:20;pointer-events:auto;min-width:0}.codex-ultra-mode-switch{display:inline-flex;gap:1px;align-items:center;height:28px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;padding:2px;background:color-mix(in srgb,currentColor 5%,transparent);white-space:nowrap;box-sizing:border-box}.codex-ultra-mode-switch button{height:22px;border:0;background:transparent;color:inherit;border-radius:5px;padding:0 8px;font-size:13px;font-weight:500;line-height:22px;cursor:pointer;white-space:nowrap}.codex-ultra-mode-switch button.active{background:color-mix(in srgb,currentColor 16%,transparent);font-weight:650}";
    document.head.appendChild(style);
  }
  function visibleText(element) {
    return (element?.innerText || element?.textContent || "").replace(/\\s+/g, " ").trim();
  }
  function sendBridgeMessage(message) {
    const event = new CustomEvent("codex-ultra-bridge-message", { detail: message });
    window.dispatchEvent(event);
  }
  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem("codexUltra.mode", mode);
    document.querySelectorAll(".codex-ultra-mode-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
  }
  function buildSwitch() {
    const root = document.createElement("div");
    root.className = "codex-ultra-mode-switch";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "CodexUltra mode");
    for (const [mode, label, title] of [["gpt_plan", "GPT规划", "用于计划、阅读、审阅，不直接改代码"], ["codex_execute", "Codex执行", "用于真正执行代码修改，可能产生 git diff"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mode = mode;
      button.title = title;
      button.textContent = label;
      button.addEventListener("click", () => setMode(mode));
      root.appendChild(button);
    }
    return root;
  }
  function findComposer() {
    return document.querySelector("textarea") || document.querySelector('[contenteditable="true"]');
  }
  function findModelSelector(composer) {
    const modelPattern = /(^|\\s)(5\\.5|5\\.4|gpt|o[1-9]|codex|超高|高|中|低)(\\s|$)/i;
    const composerContainer = composer?.closest("form") || composer?.parentElement || document;
    const roots = [composerContainer, document];
    const seen = new Set();
    for (const root of roots) {
      const buttons = Array.from(root.querySelectorAll("button")).filter((button) => {
        if (seen.has(button)) return false;
        seen.add(button);
        return isVisible(button);
      });
      const match = buttons.find((button) => {
        if (button.closest(".codex-ultra-mode-switch")) return false;
        const text = visibleText(button);
        return text.length > 0 && text.length <= 32 && modelPattern.test(text);
      });
      if (match) return match;
    }
    return null;
  }
  function findContextInfoButton(composer, modelSelector) {
    const composerContainer = composer?.closest("form") || composer?.parentElement || document;
    const modelRect = modelSelector.getBoundingClientRect();
    const buttons = Array.from(composerContainer.querySelectorAll("button")).filter((button) => {
      if (button.closest(".codex-ultra-mode-switch")) return false;
      if (button === modelSelector || !isVisible(button)) return false;
      const rect = button.getBoundingClientRect();
      if (rect.right > modelRect.left || rect.left < modelRect.left - 140) return false;
      const text = visibleText(button);
      const iconLike = text.length === 0 || text.length <= 3;
      const compact = rect.width > 10 && rect.width <= 44 && rect.height > 10 && rect.height <= 44;
      return iconLike && compact;
    });
    return buttons.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0] || null;
  }
  function positionModeSlot(slot, composer, modelSelector, contextInfoButton) {
    const composerRect = composer.getBoundingClientRect();
    const modelRect = modelSelector.getBoundingClientRect();
    const contextRect = contextInfoButton?.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const width = Math.max(slotRect.width || 0, 196);
    let targetLeft = modelRect.left - width - 24;
    if (contextRect) {
      const contextGap = Math.max(8, modelRect.left - contextRect.right);
      targetLeft = contextRect.left - contextGap - width;
    }
    const left = Math.max(composerRect.left + 300, targetLeft);
    const top = modelRect.top + (modelRect.height - (slotRect.height || 28)) / 2;
    slot.style.left = Math.round(left) + "px";
    slot.style.top = Math.round(top) + "px";
  }
  function findModeSlotTarget(composer) {
    const modelSelector = findModelSelector(composer);
    const contextInfoButton = modelSelector ? findContextInfoButton(composer, modelSelector) : null;
    return modelSelector ? { composer, modelSelector, contextInfoButton } : null;
  }
  function mountModeControlsInActionSlot(composer) {
    const target = findModeSlotTarget(composer);
    if (!target) return false;
    let slot = document.querySelector(".codex-ultra-mode-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "codex-ultra-mode-slot";
      document.body.appendChild(slot);
    }
    let modeSwitch = document.querySelector(".codex-ultra-mode-switch");
    if (!modeSwitch) modeSwitch = buildSwitch();
    if (modeSwitch.parentElement !== slot) {
      slot.replaceChildren(modeSwitch);
    }
    positionModeSlot(slot, target.composer, target.modelSelector, target.contextInfoButton);
    return true;
  }
  function install() {
    ensureStyle();
    const composer = findComposer();
    if (!composer) return;
    if (!mountModeControlsInActionSlot(composer)) return;
    setMode(state.mode);
  }
  function scheduleInstall() {
    if (installScheduled) return;
    installScheduled = true;
    requestAnimationFrame(() => {
      installScheduled = false;
      install();
    });
  }
  document.addEventListener("submit", (event) => {
    if (state.mode !== "gpt_plan") return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const composer = findComposer();
    const userInput = composer?.value || composer?.textContent || "";
    if (!userInput.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigator.clipboard?.writeText("# Handoff to GPT\\n\\n" + userInput).catch(() => {});
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    sendBridgeMessage({ mode: "bridge", content: "已生成 GPT 规划请求，并复制到剪贴板。" });
  }, true);
  new MutationObserver(scheduleInstall).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleInstall, { passive: true });
  window.addEventListener("scroll", scheduleInstall, { passive: true, capture: true });
  scheduleInstall();
})();
`;
}

function patchRendererBundle(platform) {
  const webviewDir = path.join(SRC_DIR, platform, "_asar", "webview");
  const indexHtml = path.join(webviewDir, "index.html");
  if (!fs.existsSync(indexHtml)) return;

  const injectedScript = path.join(webviewDir, "assets", "codex-ultra-renderer.js");
  fs.writeFileSync(injectedScript, rendererInjectionSource());

  let html = fs.readFileSync(indexHtml, "utf8");
  if (!html.includes("codex-ultra-renderer.js")) {
    html = html.replace("</head>", '    <script type="module" crossorigin src="./assets/codex-ultra-renderer.js"></script>\n</head>');
    fs.writeFileSync(indexHtml, html);
  }
  console.log(`  [ok] renderer mode switch ${relPath(injectedScript)}`);
}

function main() {
  const args = process.argv.slice(2);
  const platform = args.find((arg) => ["mac-arm64", "mac-x64", "win", "unix"].includes(arg));
  const platforms = platform && platform !== "unix" ? [platform] : ["mac-arm64", "mac-x64", "win"];
  for (const plat of platforms) {
    if (!fs.existsSync(path.join(SRC_DIR, plat, "_asar"))) continue;
    console.log(`-- CodexUltra patch: ${plat}`);
    patchPackageJson(plat);
    patchBootstrapBundle(plat);
    patchMainBundle(plat);
    patchPreloadBundle(plat);
    patchRendererBundle(plat);
  }
}

main();
