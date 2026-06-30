const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { redactSecrets } = require("../../src/codex-ultra/bridge/security/redactSecrets");
const { assertInsideWorkspace, safeJoin } = require("../../src/codex-ultra/bridge/workspace/pathSafety");
const { ensureBridgeDir, getGitStatus } = require("../../src/codex-ultra/bridge/workspace/gitTools");
const { resolveWorkspacePath } = require("../../src/codex-ultra/bridge/workspace/resolveWorkspacePath");
const { detectSourceRuntime } = require("../../src/codex-ultra/bridge/codexpro/codexProRuntimeDetector");
const { buildCodexProStartArgs, parseServerUrl, resolveNodeExecutable } = require("../../src/codex-ultra/bridge/codexpro/codexProProcessManager");
const { ensureCodexExecuteModel, readCodexModelConfig } = require("../../src/codex-ultra/bridge/config/codexConfig");
const { getOrCreateBridgeSession } = require("../../src/codex-ultra/bridge/session/bridgeSessionStore");

const root = path.resolve(__dirname, "../..");

test("redactSecrets removes common API keys and URL tokens", () => {
  const input = [
    "Authorization: Bearer abcdef1234567890",
    "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
    "x-api-key: secret-api-key-123456",
    "https://example.test/mcp?codexpro_token=secret-token-123&ok=1",
  ].join("\n");

  const output = redactSecrets(input);

  assert.doesNotMatch(output, /abcdef1234567890/);
  assert.doesNotMatch(output, /sk-proj-abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(output, /secret-api-key-123456/);
  assert.doesNotMatch(output, /secret-token-123/);
  assert.match(output, /codexpro_token=\[REDACTED_SECRET\]/);
});

test("parseServerUrl preserves the token needed by ChatGPT connector setup", () => {
  const url = "http://127.0.0.1:43117/mcp?codexpro_token=secret-token-123&ok=1";

  assert.equal(parseServerUrl(`Server URL: ${url}`), url);
});

test("parseServerUrl prefers public ChatGPT Server URLs over local status URLs", () => {
  const localUrl = "http://127.0.0.1:8787/?codexpro_token=local-token";
  const publicUrl = "https://example.trycloudflare.com/mcp?codexpro_token=public-token";

  assert.equal(parseServerUrl(`Local status: ${localUrl}\nServer URL: ${publicUrl}`), publicUrl);
});

test("CodexPro bridge starts with Cloudflare quick tunnel for ChatGPT access", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-cloudflare-"));
  const args = buildCodexProStartArgs({
    runtimePath: "/tmp/codexpro/scripts/codexpro.mjs",
    workspacePath: workspace,
  });

  assert.deepEqual(args.slice(0, 2), ["/tmp/codexpro/scripts/codexpro.mjs", "start"]);
  assert.match(args.join(" "), /--mode handoff/);
  assert.match(args.join(" "), /--tunnel cloudflare/);
  assert.doesNotMatch(args.join(" "), /--no-copy-url/);
  assert.doesNotMatch(args.join(" "), /--no-open-chatgpt/);
  assert.doesNotMatch(args.join(" "), /--no-auth/);
});

test("CodexPro bridge uses bundled Node instead of the Electron executable", () => {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-resources-"));
  const nodePath = path.join(resourcesPath, "cua_node", "bin", process.platform === "win32" ? "node.exe" : "node");
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, "");

  assert.equal(resolveNodeExecutable({ resourcesPath, execPath: "/Applications/CodexUltra.app/Contents/MacOS/CodexUltra-bin" }), nodePath);
});

test("resolveWorkspacePath can use the visible project name as a fallback", () => {
  assert.equal(resolveWorkspacePath({ projectName: "CodexUltra" }), root);
});

test("path safety rejects traversal outside workspace", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-path-"));

  assert.equal(safeJoin(workspace, ".ai-bridge", "current-plan.md"), path.join(workspace, ".ai-bridge", "current-plan.md"));
  assert.throws(() => safeJoin(workspace, "..", "outside.txt"), /outside workspace/);
  assert.throws(() => assertInsideWorkspace(workspace, path.dirname(workspace)), /outside workspace/);
});

test("ensureBridgeDir creates expected bridge files without requiring git", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-bridge-"));

  const paths = await ensureBridgeDir(workspace);

  assert.equal(paths.bridgeDir, path.join(workspace, ".ai-bridge"));
  for (const file of [
    "bridge-session.json",
    "session-summary.md",
    "current-plan.md",
    "gpt-request.md",
    "last-codex-result.md",
    "last-diff.patch",
    "gpt-review.md",
    "handoff-to-gpt.md",
    "handoff-to-codex.md",
  ]) {
    assert.equal(fs.existsSync(path.join(workspace, ".ai-bridge", file)), true, file);
  }

  const status = await getGitStatus(workspace);
  assert.match(status, /not a git repository|/);
});

test("detectSourceRuntime finds vendored codexpro source and reports build state", async () => {
  const info = await detectSourceRuntime({ projectRoot: path.resolve(__dirname, "../..") });

  assert.match(info.status, /^(source_ready|build_needed)$/);
  assert.equal(info.version, "0.28.6");
  assert.match(info.sourcePath, /vendor\/codexpro$/);
  assert.match(info.runtimePath, /scripts\/codexpro\.mjs$/);
});

test("getOrCreateBridgeSession persists app and workspace session state", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-session-workspace-"));
  const appUserData = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-user-data-"));

  const first = await getOrCreateBridgeSession({ appUserData, workspacePath: workspace });
  const second = await getOrCreateBridgeSession({ appUserData, workspacePath: workspace });

  assert.equal(second.id, first.id);
  assert.equal(second.workspacePath, workspace);
  assert.equal(second.ui.activeMode, "codex_execute");
  assert.equal(fs.existsSync(path.join(appUserData, "codex-ultra", "bridge-sessions.json")), true);
  assert.equal(fs.existsSync(path.join(workspace, ".ai-bridge", "bridge-session.json")), true);
});

test("ensureCodexExecuteModel persists Codex execution model as 5.5 xhigh", async () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ultra-config-"));
  const configPath = path.join(codexHome, "config.toml");
  fs.writeFileSync(
    configPath,
    [
      'model_provider = "sub2api"',
      'model = "gpt-5.4"',
      'model_reasoning_effort = "medium"',
      "",
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      "",
    ].join("\n"),
  );

  const result = await ensureCodexExecuteModel({ codexHome });
  const text = fs.readFileSync(configPath, "utf8");

  assert.equal(result.model, "gpt-5.5");
  assert.equal(result.modelReasoningEffort, "xhigh");
  assert.match(text, /^model = "gpt-5\.5"$/m);
  assert.match(text, /^model_reasoning_effort = "xhigh"$/m);
  assert.match(text, /\[projects\."\/tmp\/example"\]/);
  assert.deepEqual(await readCodexModelConfig({ codexHome }), {
    model: "gpt-5.5",
    modelReasoningEffort: "xhigh",
  });
});
