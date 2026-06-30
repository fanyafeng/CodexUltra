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
  const CHATGPT_CONNECTORS_URL = "https://chatgpt.com/#settings/Connectors";
  function isPublicGptServerUrl(url) {
    try {
      const parsed = new URL(String(url || "").trim());
      return parsed.protocol === "https:" && /\\/mcp\\/?$/i.test(parsed.pathname) && !["localhost", "127.0.0.1"].includes(parsed.hostname);
    } catch {
      return false;
    }
  }
  function readSavedGptServerUrl() {
    const value = localStorage.getItem("codexUltra.gptServerUrl") || "";
    if (!value) return "";
    if (isPublicGptServerUrl(value)) return value;
    localStorage.removeItem("codexUltra.gptServerUrl");
    return "";
  }
  const state = {
    mode: localStorage.getItem("codexUltra.mode") || "codex_execute",
    gptServerUrl: readSavedGptServerUrl(),
    bridgeSession: null,
    bridgeStart: null,
  };
  let installScheduled = false;
  let lastModeTarget = null;
  let cachedGptAccount = null;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".codex-ultra-mode-slot{position:fixed;display:inline-flex;align-items:center;justify-content:center;z-index:20;pointer-events:auto;min-width:0}",
      ".codex-ultra-mode-switch{display:inline-flex;gap:1px;align-items:center;height:28px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;padding:2px;background:color-mix(in srgb,currentColor 5%,transparent);white-space:nowrap;box-sizing:border-box}",
      ".codex-ultra-mode-switch button{height:22px;border:0;background:transparent;color:inherit;border-radius:5px;padding:0 8px;font-size:13px;font-weight:500;line-height:22px;cursor:pointer;white-space:nowrap}",
      ".codex-ultra-mode-switch button.active{background:color-mix(in srgb,currentColor 16%,transparent);font-weight:650}",
      ".codex-ultra-gpt-account{position:fixed;z-index:21;display:none;pointer-events:auto;min-width:84px;max-width:150px;white-space:nowrap;overflow:hidden;text-align:left;color:inherit;cursor:pointer}",
      ".codex-ultra-gpt-account-title{display:block;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:650;line-height:14px}",
      ".codex-ultra-gpt-account-desc{display:block;overflow:hidden;text-overflow:ellipsis;font-size:10px;font-weight:450;line-height:12px;color:color-mix(in srgb,currentColor 62%,transparent)}",
      ".codex-ultra-gpt-account-login .codex-ultra-gpt-account-title{color:rgb(37,99,235)}",
      ".codex-ultra-gpt-login-backdrop{position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.28);backdrop-filter:blur(2px)}",
      ".codex-ultra-gpt-login-dialog{width:min(520px,calc(100vw - 32px));border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;background:Canvas;color:CanvasText;box-shadow:0 20px 64px rgba(0,0,0,.28);padding:16px;box-sizing:border-box}",
      ".codex-ultra-gpt-login-dialog h2{margin:0 0 6px;font-size:16px;line-height:22px;font-weight:650}",
      ".codex-ultra-gpt-login-dialog p{margin:0 0 12px;font-size:13px;line-height:18px;color:color-mix(in srgb,currentColor 70%,transparent)}",
      ".codex-ultra-gpt-login-dialog label{display:block;margin:0 0 6px;font-size:12px;line-height:16px;font-weight:600}",
      ".codex-ultra-gpt-login-dialog input{width:100%;height:34px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:6px;background:color-mix(in srgb,Canvas 94%,currentColor);color:inherit;padding:0 10px;font-family:inherit;font-size:13px;box-sizing:border-box}",
      ".codex-ultra-gpt-login-status{min-height:18px;margin-top:8px;font-size:12px;line-height:18px;color:color-mix(in srgb,currentColor 64%,transparent)}",
      ".codex-ultra-gpt-login-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}",
      ".codex-ultra-gpt-login-actions button{height:30px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:6px;background:color-mix(in srgb,currentColor 6%,transparent);color:inherit;padding:0 11px;font-family:inherit;font-size:13px;cursor:pointer}",
      ".codex-ultra-gpt-login-actions button[data-primary=true]{background:rgb(37,99,235);border-color:rgb(37,99,235);color:white}",
    ].join("");
    document.head.appendChild(style);
  }
  function visibleText(element) {
    return (element?.innerText || element?.textContent || "").replace(/\\s+/g, " ").trim();
  }
  function sendBridgeMessage(message) {
    const event = new CustomEvent("codex-ultra-bridge-message", { detail: message });
    window.dispatchEvent(event);
  }
  function getCodexUltraApi() {
    return window.codexUltra && typeof window.codexUltra.invoke === "function" ? window.codexUltra : null;
  }
  function detectWorkspacePath() {
    const candidates = [
      window.__CODEx_WORKSPACE_PATH__,
      window.__CODEX_WORKSPACE_PATH__,
      window.codexWorkspacePath,
      window.workspacePath,
      document.body?.dataset?.workspacePath,
      document.querySelector("[data-workspace-path]")?.getAttribute("data-workspace-path"),
      document.querySelector("[data-project-path]")?.getAttribute("data-project-path"),
      localStorage.getItem("codexUltra.workspacePath"),
    ];
    const text = visibleText(document.body);
    const pathMatch = text.match(/(?:\\/Users\\/[^\\n\\r\\t ]+|\\/Volumes\\/[^\\n\\r\\t ]+|\\/private\\/[^\\n\\r\\t ]+|\\/tmp\\/[^\\n\\r\\t ]+)/);
    if (pathMatch) candidates.push(pathMatch[0]);
    const found = candidates.find((value) => typeof value === "string" && value.trim().startsWith("/"));
    if (found) {
      const workspacePath = found.trim();
      localStorage.setItem("codexUltra.workspacePath", workspacePath);
      return workspacePath;
    }
    return "";
  }
  function detectProjectName() {
    const buttons = Array.from(document.querySelectorAll("button"));
    function cleanProjectName(value) {
      const text = String(value || "").replace(/^Change project:\\s*/i, "").trim();
      if (!text || text.length > 80 || text.includes("/") || text.includes("\\\\")) return "";
      if (["GPT规划", "Codex执行", "本地模式", "main", "不使用项目"].includes(text)) return "";
      return text;
    }
    function buttonLabel(button) {
      return [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        visibleText(button),
      ].find((value) => typeof value === "string" && value.trim()) || "";
    }
    for (const button of buttons) {
      const label = buttonLabel(button);
      if (/Change project:/i.test(label)) {
        const projectName = cleanProjectName(label);
        if (projectName) return projectName;
      }
    }
    const bodyText = visibleText(document.body);
    const questionMatch = bodyText.match(/我们应该在\\s+(.+?)\\s+中构建什么[？?]?/) || bodyText.match(/What should we build in\\s+(.+?)\\?/i);
    return cleanProjectName(questionMatch?.[1]);
  }
  function rememberGptServerUrl(url) {
    const value = String(url || "").trim();
    if (value && !isPublicGptServerUrl(value)) {
      state.gptServerUrl = "";
      localStorage.removeItem("codexUltra.gptServerUrl");
      updateModeTargetDisplay();
      return "";
    }
    state.gptServerUrl = value;
    if (value) localStorage.setItem("codexUltra.gptServerUrl", value);
    else localStorage.removeItem("codexUltra.gptServerUrl");
    updateModeTargetDisplay();
    return value;
  }
  async function ensureGptBridgeServerUrl(statusElement) {
    if (state.gptServerUrl) return state.gptServerUrl;
    const api = getCodexUltraApi();
    const workspacePath = detectWorkspacePath();
    const projectName = detectProjectName();
    if (!api || (!workspacePath && !projectName)) {
      if (statusElement) statusElement.textContent = "未自动找到工作区，请粘贴 CodexPro Server URL。";
      return "";
    }
    if (!state.bridgeSession) {
      if (statusElement) statusElement.textContent = "正在准备本地桥接会话...";
      state.bridgeSession = await api.invoke("codexUltra:getOrCreateBridgeSession", {
        workspacePath,
        projectName,
      });
      if (state.bridgeSession?.workspacePath) localStorage.setItem("codexUltra.workspacePath", state.bridgeSession.workspacePath);
    }
    if (!state.bridgeStart) {
      if (statusElement) statusElement.textContent = "正在启动 CodexPro bridge 和 Cloudflare tunnel...";
      state.bridgeStart = api.invoke("codexUltra:startGptBridge", {
        workspacePath: state.bridgeSession?.workspacePath || workspacePath,
        projectName,
        bridgeSessionId: state.bridgeSession.id,
      }).catch((error) => {
        state.bridgeStart = null;
        throw error;
      });
    }
    const result = await state.bridgeStart;
    const serverUrl = result?.publicUrl || result?.serverUrl || "";
    if (serverUrl) return rememberGptServerUrl(serverUrl);
    if (statusElement) statusElement.textContent = result?.error || "未能自动生成 Server URL，请手动粘贴。";
    return "";
  }
  function copyText(value) {
    return navigator.clipboard?.writeText(value).catch(() => {}) || Promise.resolve();
  }
  function openChatGptConnectors() {
    window.open(CHATGPT_CONNECTORS_URL, "_blank", "noopener,noreferrer");
  }
  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none";
  }
  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem("codexUltra.mode", mode);
    document.querySelectorAll(".codex-ultra-mode-switch button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    updateModeTargetDisplay();
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
  function readObjectAccount(value) {
    if (!value || typeof value !== "object") return null;
    const email = String(value.email || value.emailAddress || value.user_email || value.accountEmail || "").trim();
    const title = String(value.name || value.displayName || value.fullName || value.title || value.username || value.userName || "").trim();
    if (!email && !title) return null;
    const fallbackTitle = email ? email.split("@")[0] : "GPT规划";
    return { title: title || fallbackTitle, desc: email || "未检测到邮箱" };
  }
  function rememberGptAccount(value) {
    const direct = readObjectAccount(value);
    if (direct?.desc.includes("@")) {
      cachedGptAccount = direct;
      if (state.mode === "gpt_plan") updateModeTargetDisplay();
      return direct;
    }
    if (!value || typeof value !== "object") return null;
    const queue = [value];
    const seen = new Set();
    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      const account = readObjectAccount(item);
      if (account?.desc.includes("@")) {
        cachedGptAccount = account;
        if (state.mode === "gpt_plan") updateModeTargetDisplay();
        return account;
      }
      for (const nested of Object.values(item)) {
        if (nested && typeof nested === "object") queue.push(nested);
      }
    }
    return null;
  }
  function installAccountResponseWatcher() {
    if (typeof fetch !== "function" || fetch.__codexUltraAccountWatcher) return;
    const originalFetch = fetch.bind(window);
    const watchedFetch = (...args) => {
      const promise = originalFetch(...args);
      promise.then((response) => {
        const contentType = response.headers?.get?.("content-type") || "";
        if (!contentType.includes("json")) return;
        response.clone().json().then(rememberGptAccount).catch(() => {});
      }).catch(() => {});
      return promise;
    };
    watchedFetch.__codexUltraAccountWatcher = true;
    window.fetch = watchedFetch;
  }
  function readGptAccountFromStorage(storage) {
    if (!storage) return null;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i) || "";
      if (!/(account|profile|user|session|auth)/i.test(key)) continue;
      const raw = storage.getItem(key);
      if (!raw || !/@/.test(raw)) continue;
      try {
        const parsed = JSON.parse(raw);
        const queue = [parsed];
        const seen = new Set();
        while (queue.length) {
          const item = queue.shift();
          if (!item || typeof item !== "object" || seen.has(item)) continue;
          seen.add(item);
          const account = readObjectAccount(item);
          if (account?.desc.includes("@")) return account;
          for (const value of Object.values(item)) {
            if (value && typeof value === "object") queue.push(value);
          }
        }
      } catch {
        const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0];
        if (email) return { title: email.split("@")[0], desc: email };
      }
    }
    return null;
  }
  function readGptAccount() {
    if (cachedGptAccount) return cachedGptAccount;
    const storageAccount = readGptAccountFromStorage(localStorage) || readGptAccountFromStorage(sessionStorage);
    if (storageAccount) return rememberGptAccount(storageAccount) || storageAccount;
    const bodyText = visibleText(document.body);
    const email = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0] || "";
    if (email) {
      const emailIndex = bodyText.indexOf(email);
      const beforeEmail = bodyText.slice(0, emailIndex).split(" ").slice(-4).join(" ").trim();
      const title = beforeEmail && beforeEmail.length <= 40 ? beforeEmail : email.split("@")[0];
      return { title, desc: email };
    }
    if (state.gptServerUrl) return { title: "GPT规划", desc: "Server URL 已配置", needsLogin: true };
    return { title: "登录 ChatGPT", desc: "配置 Server URL", needsLogin: true };
  }
  function closeGptServerUrlDialog() {
    document.querySelector(".codex-ultra-gpt-login-backdrop")?.remove();
  }
  function showGptServerUrlDialog() {
    ensureStyle();
    let backdrop = document.querySelector(".codex-ultra-gpt-login-backdrop");
    if (backdrop) {
      backdrop.querySelector("input")?.focus();
      return;
    }
    backdrop = document.createElement("div");
    backdrop.className = "codex-ultra-gpt-login-backdrop";
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeGptServerUrlDialog();
    });
    const dialog = document.createElement("div");
    dialog.className = "codex-ultra-gpt-login-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const title = document.createElement("h2");
    title.textContent = "登录 ChatGPT";
    const body = document.createElement("p");
    body.textContent = "CodexPro 的做法是把本地 bridge 的 Server URL 填到 ChatGPT Connectors。粘贴或复制下面的 URL，然后在 ChatGPT 设置里创建连接。";
    const label = document.createElement("label");
    label.textContent = "Server URL";
    const input = document.createElement("input");
    input.type = "url";
    input.placeholder = "https://.../mcp?codexpro_token=...";
    input.value = state.gptServerUrl;
    const status = document.createElement("div");
    status.className = "codex-ultra-gpt-login-status";
    status.textContent = state.gptServerUrl ? "Server URL 已保存。" : "正在尝试自动生成 Server URL...";
    const actions = document.createElement("div");
    actions.className = "codex-ultra-gpt-login-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", closeGptServerUrlDialog);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制 URL";
    copy.addEventListener("click", () => {
      const value = rememberGptServerUrl(input.value);
      if (!value) {
        status.textContent = "请先粘贴 Server URL。";
        return;
      }
      copyText(value).then(() => {
        status.textContent = "已复制 Server URL。";
      });
    });
    const openSettings = document.createElement("button");
    openSettings.type = "button";
    openSettings.textContent = "打开设置";
    openSettings.addEventListener("click", openChatGptConnectors);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.dataset.primary = "true";
    confirm.textContent = "确定";
    confirm.addEventListener("click", () => {
      rememberGptServerUrl(input.value);
      openChatGptConnectors();
      closeGptServerUrlDialog();
    });
    input.addEventListener("input", () => rememberGptServerUrl(input.value));
    actions.append(cancel, copy, openSettings, confirm);
    dialog.append(title, body, label, input, status, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    input.focus();
    ensureGptBridgeServerUrl(status).then((url) => {
      if (!url) return;
      input.value = url;
      status.textContent = "Server URL 已生成，可复制后在 ChatGPT 设置中粘贴。";
    }).catch((error) => {
      status.textContent = "自动生成失败：" + (error?.message || String(error));
    });
  }
  function ensureGptAccountOverlay() {
    let account = document.querySelector(".codex-ultra-gpt-account");
    if (account) return account;
    account = document.createElement("div");
    account.className = "codex-ultra-gpt-account";
    account.setAttribute("role", "button");
    account.tabIndex = 0;
    account.title = "配置 ChatGPT Server URL";
    account.addEventListener("click", () => {
      const accountInfo = readGptAccount();
      if (accountInfo.needsLogin) showGptServerUrlDialog();
    });
    account.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const accountInfo = readGptAccount();
      if (!accountInfo.needsLogin) return;
      event.preventDefault();
      showGptServerUrlDialog();
    });
    const title = document.createElement("span");
    title.className = "codex-ultra-gpt-account-title";
    const desc = document.createElement("span");
    desc.className = "codex-ultra-gpt-account-desc";
    account.append(title, desc);
    document.body.appendChild(account);
    return account;
  }
  function updateModeTargetDisplay(target) {
    const rememberedTarget = target || lastModeTarget;
    const composer = rememberedTarget?.composer || findComposer();
    const modelSelector = rememberedTarget?.modelSelector || (composer ? findModelSelector(composer) : null);
    const accountOverlay = ensureGptAccountOverlay();
    if (!modelSelector) {
      accountOverlay.style.display = "none";
      return;
    }
    lastModeTarget = { composer, modelSelector, contextInfoButton: rememberedTarget?.contextInfoButton || null };
    modelSelector.style.visibility = state.mode === "gpt_plan" ? "hidden" : "";
    if (state.mode !== "gpt_plan") {
      accountOverlay.style.display = "none";
      return;
    }
    const account = readGptAccount();
    const modelRect = modelSelector.getBoundingClientRect();
    const title = accountOverlay.querySelector(".codex-ultra-gpt-account-title");
    const desc = accountOverlay.querySelector(".codex-ultra-gpt-account-desc");
    if (title) title.textContent = account.title;
    if (desc) desc.textContent = account.desc;
    accountOverlay.classList.toggle("codex-ultra-gpt-account-login", Boolean(account.needsLogin));
    accountOverlay.style.left = Math.round(modelRect.left) + "px";
    accountOverlay.style.top = Math.round(modelRect.top + (modelRect.height - 26) / 2) + "px";
    accountOverlay.style.width = Math.round(Math.max(84, modelRect.width)) + "px";
    accountOverlay.style.display = "block";
    if (account.needsLogin && !state.gptServerUrl && !sessionStorage.getItem("codexUltra.gptLoginPromptShown")) {
      sessionStorage.setItem("codexUltra.gptLoginPromptShown", "1");
      setTimeout(showGptServerUrlDialog, 0);
    }
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
    lastModeTarget = target;
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
    updateModeTargetDisplay(target);
    return true;
  }
  function install() {
    ensureStyle();
    installAccountResponseWatcher();
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
    if (!state.gptServerUrl) {
      showGptServerUrlDialog();
      sendBridgeMessage({ mode: "bridge", content: "请先配置 ChatGPT Server URL。" });
      return;
    }
    openChatGptConnectors();
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
