const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
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
  assert.match(renderer, /function detectProjectName/);
  assert.match(renderer, /projectName/);
  assert.match(renderer, /Cloudflare tunnel/);
  assert.match(renderer, /function isPublicGptServerUrl/);
  assert.match(renderer, /function readSavedGptServerUrl/);
  assert.match(renderer, /localStorage\.removeItem\("codexUltra\.gptServerUrl"\)/);
  assert.match(renderer, /result\?\.publicUrl \|\| result\?\.serverUrl/);
});

test("vendored CodexPro always prints the full ChatGPT Server URL for CodexUltra to capture", () => {
  const cli = fs.readFileSync(path.join(root, "vendor/codexpro/scripts/codexpro.mjs"), "utf8");
  const start = cli.indexOf("function printConnectorBlock");
  const end = cli.indexOf("function printControlHelp");
  assert.notEqual(start, -1, "CodexPro CLI must define printConnectorBlock");
  assert.notEqual(end, -1, "CodexPro CLI must define printControlHelp after printConnectorBlock");

  const connectorBlock = cli.slice(start, end);
  assert.match(connectorBlock, /Server URL: \$\{serverUrl\}/);
});

test("renderer project detection avoids arbitrary sidebar buttons", () => {
  const renderer = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/webview/assets/codex-ultra-renderer.js"), "utf8");

  assert.match(renderer, /function detectProjectName/);
  assert.match(renderer, /function buttonLabel/);
  assert.match(renderer, /Change project:/);
  assert.doesNotMatch(renderer, /buttons\.map\(visibleText\)/);
});

test("patched preload exposes a restricted CodexUltra IPC bridge", () => {
  const preload = fs.readFileSync(path.join(root, "src/mac-arm64/_asar/.vite/build/preload.js"), "utf8");

  assert.match(preload, /codexUltra/);
  assert.match(preload, /exposeInMainWorld\(`codexUltra`/);
  assert.match(preload, /channel\.startsWith\(`codexUltra:`\)/);
  assert.match(preload, /ipcRenderer\.invoke\(channel, payload\)/);
});

test("patched main IPC can resolve workspace paths from the visible project name", () => {
  const ipc = fs.readFileSync(path.join(root, "src/codex-ultra/bridge/ipc/codexUltraIpcMain.js"), "utf8");

  assert.match(ipc, /resolveWorkspacePath/);
  assert.match(ipc, /codexUltra:resolveWorkspacePath/);
  assert.match(ipc, /withResolvedWorkspacePath/);
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

test("packaged macOS resources exclude local release metadata", () => {
  const resourcesDir = path.join(macApp, "Contents/Resources");
  const offenders = walkFiles(resourcesDir, (file) => [".DS_Store", ".git"].includes(path.basename(file)))
    .map((file) => path.relative(root, file));

  assert.deepEqual(offenders, []);
});

test("release package metadata is pinned to 0.0.1", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

  assert.equal(pkg.version, "0.0.1");
  assert.equal(lock.version, "0.0.1");
  assert.equal(lock.packages[""].version, "0.0.1");
});

test("build script uses the root release version for app metadata and artifact names", () => {
  const script = path.join(root, "scripts/build-from-upstream.js");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-release-"));
  const asarDir = path.join(tempDir, "_asar");
  const plist = path.join(tempDir, "Info.plist");
  fs.mkdirSync(asarDir);
  fs.writeFileSync(
    path.join(asarDir, "package.json"),
    `${JSON.stringify({ name: "codex", productName: "Codex", version: "26.999.0" }, null, 2)}\n`,
  );
  fs.writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>26.999.0</string>
  <key>CFBundleVersion</key>
  <string>9999</string>
</dict>
</plist>
`,
  );

  const result = spawnSync(process.execPath, [
    "-e",
    `
const build = require(${JSON.stringify(script)});
const fs = require("node:fs");
const path = require("node:path");
const asarDir = ${JSON.stringify(asarDir)};
const plist = ${JSON.stringify(plist)};
build.syncAsarPackageMetadata(asarDir);
build.syncMacBundleVersion(plist);
const pkg = JSON.parse(fs.readFileSync(path.join(asarDir, "package.json"), "utf8"));
const names = build.getMacArtifactNames("mac-arm64");
console.log(JSON.stringify({
  releaseVersion: build.getReleaseVersion(),
  packageVersion: pkg.version,
  packageName: pkg.name,
  packageProductName: pkg.productName,
  dmgName: names.dmgName,
  zipName: names.zipName,
  shortVersion: require("node:child_process").execFileSync("plutil", ["-extract", "CFBundleShortVersionString", "raw", plist], { encoding: "utf8" }).trim(),
  bundleVersion: require("node:child_process").execFileSync("plutil", ["-extract", "CFBundleVersion", "raw", plist], { encoding: "utf8" }).trim(),
}));
`,
  ], { cwd: root, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    releaseVersion: "0.0.1",
    packageVersion: "0.0.1",
    packageName: "codex-ultra",
    packageProductName: "CodexUltra",
    dmgName: "CodexUltra-mac-arm64-0.0.1.dmg",
    zipName: "CodexUltra-mac-arm64-0.0.1.zip",
    shortVersion: "0.0.1",
    bundleVersion: "1",
  });
});
