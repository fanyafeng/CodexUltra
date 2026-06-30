const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { redactSecrets } = require("../../src/codex-ultra/bridge/security/redactSecrets");
const { assertInsideWorkspace, safeJoin } = require("../../src/codex-ultra/bridge/workspace/pathSafety");
const { ensureBridgeDir, getGitStatus } = require("../../src/codex-ultra/bridge/workspace/gitTools");
const { detectSourceRuntime } = require("../../src/codex-ultra/bridge/codexpro/codexProRuntimeDetector");
const { ensureCodexExecuteModel, readCodexModelConfig } = require("../../src/codex-ultra/bridge/config/codexConfig");
const { getOrCreateBridgeSession } = require("../../src/codex-ultra/bridge/session/bridgeSessionStore");

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
