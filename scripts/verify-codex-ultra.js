#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const required = [
  "src/codex-ultra/bridge/security/redactSecrets.js",
  "src/codex-ultra/bridge/ipc/codexUltraIpcMain.js",
  "src/codex-ultra/renderer/components/ModeSwitch.tsx",
  "vendor/codexpro/package.json",
  "vendor/codexpro/scripts/codexpro.mjs",
];

let failed = 0;
for (const rel of required) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) console.log(`OK ${rel}`);
  else {
    console.error(`MISSING ${rel}`);
    failed++;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (pkg.productName !== "CodexUltra" || pkg.name !== "codex-ultra") {
  console.error("MISSING CodexUltra package identity");
  failed++;
} else {
  console.log("OK package identity");
}

const forge = fs.readFileSync(path.join(root, "forge.config.js"), "utf8");
for (const expected of ["CodexUltra", "com.fanyafeng.codexultra", "codexpro"]) {
  if (!forge.includes(expected)) {
    console.error(`MISSING forge config token: ${expected}`);
    failed++;
  } else {
    console.log(`OK forge token ${expected}`);
  }
}

process.exit(failed ? 1 : 0);
