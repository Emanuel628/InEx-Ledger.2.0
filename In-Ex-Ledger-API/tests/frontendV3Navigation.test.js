"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const apiRoot = path.join(__dirname, "..");
const frontendRoot = path.join(apiRoot, "frontend-v3");

function loadNavigationModule() {
  const ts = require(path.join(frontendRoot, "node_modules", "typescript"));
  const source = fs.readFileSync(path.join(frontendRoot, "src", "lib", "navigation.ts"), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const sandbox = {
    exports: {},
    module: { exports: {} },
    URL
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transpiled, sandbox, { filename: "navigation.ts" });
  return sandbox.module.exports;
}

test("v3 navigation normalizes only same-origin internal paths", () => {
  const { normalizeInternalPath } = loadNavigationModule();

  assert.equal(normalizeInternalPath("/trial-setup?next=%2Ftransactions"), "/trial-setup?next=%2Ftransactions");
  assert.equal(normalizeInternalPath("/transactions#ignored"), "/transactions");
  assert.equal(normalizeInternalPath("transactions"), "/transactions");
  assert.equal(normalizeInternalPath("https://evil.example/transactions"), "/transactions");
  assert.equal(normalizeInternalPath("//evil.example/transactions"), "/transactions");
  assert.equal(normalizeInternalPath("/\\evil.example"), "/transactions");
  assert.equal(normalizeInternalPath("", "/settings"), "/settings");
});

test("v3 navigation maps safe paths to known pages and blocks auth-flow loops", () => {
  const { resolvePageFromInternalPath } = loadNavigationModule();
  const pagesBySlug = new Map([
    ["transactions", "Transactions"],
    ["settings", "Settings"],
    ["login", "Login"]
  ]);
  const authFlowPages = new Set(["Login"]);

  assert.equal(
    resolvePageFromInternalPath("/settings?tab=billing", pagesBySlug, "Transactions", authFlowPages),
    "Settings"
  );
  assert.equal(
    resolvePageFromInternalPath("/login?next=%2Fsettings", pagesBySlug, "Transactions", authFlowPages),
    "Transactions"
  );
  assert.equal(
    resolvePageFromInternalPath("//evil.example/settings", pagesBySlug, "Transactions", authFlowPages),
    "Transactions"
  );
});

test("v3 navigation owns legacy app-v3 path canonicalization", () => {
  const { normalizeLegacyAppV3Path } = loadNavigationModule();

  assert.equal(normalizeLegacyAppV3Path("/app-v3", "/transactions"), "/transactions");
  assert.equal(normalizeLegacyAppV3Path("/app-v3/settings", "/settings?tab=profile"), "/settings?tab=profile");
  assert.equal(normalizeLegacyAppV3Path("/app-v3/assets/index.js", "/transactions"), null);
  assert.equal(normalizeLegacyAppV3Path("/settings", "/settings"), null);
  assert.equal(normalizeLegacyAppV3Path("/app-v3/settings", "https://evil.example/settings"), "/transactions");
});
