const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const macApp = path.join(root, "out/mac-arm64/CodexUltra.app");

function walkFiles(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, results);
    else if (predicate(full)) results.push(full);
  }
  return results;
}

test("patched bootstrap isolates CodexUltra userData before single instance lock", () => {
  const bootstrap = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/.vite/build/bootstrap.js"), "utf8");
  const userDataIndex = bootstrap.indexOf('setPath(`userData`');
  const lockIndex = bootstrap.lastIndexOf("requestSingleInstanceLock()");

  assert.notEqual(userDataIndex, -1, "bootstrap must set userData");
  assert.notEqual(lockIndex, -1, "bootstrap must request a single-instance lock");
  assert.ok(userDataIndex < lockIndex, "userData must be isolated before requestSingleInstanceLock");
  assert.match(bootstrap, /CODEX_ELECTRON_USER_DATA_PATH/);
  assert.doesNotMatch(bootstrap, /\(0,a\.join\)\(e,t\.wa\(n\)\)/);
  assert.match(bootstrap, /\(0,a\.join\)\(e,`CodexUltra`\)/);
  assert.match(bootstrap, /CodexUltra/);
});

test("patched main bundle does not include patch script helpers", () => {
  const buildDir = path.join(root, "src/mac-arm64/_asar/.vite/build");
  const mainFile = fs.readdirSync(buildDir).find((file) => /^main-.*\.js$/.test(file));
  assert.ok(mainFile, "main bundle must exist");
  const main = fs.readFileSync(path.join(buildDir, mainFile), "utf8");

  assert.doesNotMatch(main, /function patchBootstrapBundle/);
  assert.match(main, /registerCodexUltraIpcMain/);
});

test("renderer mode switch mounts in the composer action slot without modifying the model selector", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /codex-ultra-mode-slot/);
  assert.match(renderer, /positionModeSlot/);
  assert.match(renderer, /mountModeControlsInActionSlot/);
  assert.match(renderer, /getBoundingClientRect/);
  assert.match(renderer, /findContextInfoButton/);
  assert.match(renderer, /const contextGap = Math\.max\(8, modelRect\.left - contextRect\.right\)/);
  assert.match(renderer, /contextRect\.left - contextGap - width/);
  assert.doesNotMatch(renderer, /container\.insertBefore\(buildSwitch\(\), container\.firstChild\)/);
  assert.doesNotMatch(renderer, /function findActionItemNode/);
  assert.doesNotMatch(renderer, /function isStatusLikeNode/);
  assert.doesNotMatch(renderer, /findComposerActionRow/);
  assert.doesNotMatch(renderer, /findModelSelectorMountNode/);
  assert.doesNotMatch(renderer, /updateModelSelectorLabel/);
  assert.doesNotMatch(renderer, /setDisplayIfChanged\(state\.modelSelector/);
  assert.doesNotMatch(renderer, /ensureCodexExecuteModel/);
  assert.doesNotMatch(renderer, /codexUltra:ensureCodexExecuteModel/);
});

test("renderer mode switch stays compact and does not inject helper rows into composer", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /\.codex-ultra-mode-slot\{[^"]*position:fixed/);
  assert.match(renderer, /\.codex-ultra-mode-slot\{[^"]*z-index:20/);
  assert.match(renderer, /\.codex-ultra-mode-switch\{[^"]*height:28px/);
  assert.match(renderer, /\.codex-ultra-mode-switch button\{[^"]*font-size:13px/);
  assert.match(renderer, /\.codex-ultra-mode-switch button\{[^"]*padding:0 8px/);
  assert.doesNotMatch(renderer, /font:inherit/);
  assert.doesNotMatch(renderer, /codex-ultra-helper/);
  assert.doesNotMatch(renderer, /ensureHelper/);
});

test("renderer shows GPT account title and email when planning mode is selected", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /codex-ultra-gpt-account/);
  assert.match(renderer, /codex-ultra-gpt-account-title/);
  assert.match(renderer, /codex-ultra-gpt-account-desc/);
  assert.match(renderer, /function readGptAccount/);
  assert.match(renderer, /function rememberGptAccount/);
  assert.match(renderer, /function installAccountResponseWatcher/);
  assert.match(renderer, /function updateModeTargetDisplay/);
  assert.match(renderer, /lastModeTarget = target/);
  assert.match(renderer, /target \|\| lastModeTarget/);
  assert.match(renderer, /modelSelector\.style\.visibility = state\.mode === "gpt_plan" \? "hidden" : ""/);
});

test("renderer prompts for ChatGPT Server URL when GPT planning has no detected account", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /codex-ultra-gpt-login-dialog/);
  assert.match(renderer, /function showGptServerUrlDialog/);
  assert.match(renderer, /登录 ChatGPT/);
  assert.match(renderer, /配置 Server URL/);
  assert.match(renderer, /codexUltra\.gptServerUrl/);
  assert.match(renderer, /https:\/\/chatgpt\.com\/#settings\/Connectors/);
  assert.match(renderer, /codexUltra:startGptBridge/);
});

test("patched preload exposes a restricted CodexUltra IPC bridge", () => {
  const preload = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/.vite/build/preload.js"), "utf8");

  assert.match(preload, /codexUltra/);
  assert.match(preload, /exposeInMainWorld\(`codexUltra`/);
  assert.match(preload, /channel\.startsWith\(`codexUltra:`\)/);
  assert.match(preload, /ipcRenderer\.invoke\(channel, payload\)/);
});

test("renderer mode switch install is mutation safe", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /installScheduled/);
  assert.match(renderer, /requestAnimationFrame/);
  assert.match(renderer, /function isVisible/);
  assert.doesNotMatch(renderer, /helper\.textContent = mode ===/);
  assert.doesNotMatch(renderer, /new MutationObserver\(install\)/);
  assert.doesNotMatch(renderer, /state\.modelSelector/);
});

test("packaged macOS Info.plist uses CodexUltra product directory", () => {
  const plist = path.join(macApp, "Contents/Info.plist");
  assert.equal(fs.existsSync(plist), true);
  const text = fs.readFileSync(plist, "utf8");
  assert.match(text, /CodexUltra/);
  assert.match(text, /<string>codexultra<\/string>/);
  assert.doesNotMatch(text, /<string>codex<\/string>/);
  assert.doesNotMatch(text, /com\.openai\.codex/);
});

test("packaged macOS launcher selects CodexUltra userData before native startup", () => {
  const launcher = path.join(macApp, "Contents/MacOS/CodexUltra");
  const binary = path.join(macApp, "Contents/MacOS/CodexUltra-bin");
  assert.equal(fs.existsSync(launcher), true);
  assert.equal(fs.existsSync(binary), true);

  const text = fs.readFileSync(launcher, "utf8");
  assert.match(text, /Application Support\/CodexUltra/);
  assert.match(text, /--user-data-dir=/);
  assert.match(text, /CodexUltra-bin/);
});

test("packaged macOS plist files do not reuse official Codex bundle identifiers", () => {
  const plistFiles = walkFiles(macApp, (file) => /(?:^|-)Info\.plist$/.test(path.basename(file)));
  assert.ok(plistFiles.length > 0, "macOS bundle plist files must exist");

  const offenders = plistFiles
    .filter((file) => fs.readFileSync(file, "utf8").includes("com.openai.codex"))
    .map((file) => path.relative(root, file));

  assert.deepEqual(offenders, []);
});
