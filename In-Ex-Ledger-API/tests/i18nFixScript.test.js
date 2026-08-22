"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("i18n-fix is idempotent against an already-fixed i18n bundle", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inex-i18n-fix-"));
  const fixturePath = path.join(tmpDir, "i18n.js");
  fs.copyFileSync(path.join(repoRoot, "public", "js", "i18n.js"), fixturePath);

  const run = () => spawnSync(process.execPath, ["scripts/i18n-fix.js"], {
    cwd: repoRoot,
    env: { ...process.env, I18N_FIX_FILE_PATH: fixturePath },
    encoding: "utf8"
  });

  const first = run();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const afterFirst = fs.readFileSync(fixturePath, "utf8");

  const second = run();
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(fs.readFileSync(fixturePath, "utf8"), afterFirst);
});
