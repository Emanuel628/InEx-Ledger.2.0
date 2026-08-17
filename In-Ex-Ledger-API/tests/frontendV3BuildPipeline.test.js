const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("root build script builds the v3 SPA", async () => {
  const pkg = JSON.parse(read("package.json"));
  const runner = await import("../scripts/run-all-node-tests.mjs");

  assert.equal(pkg.scripts.build, "npm run build:frontend-v3");
  assert.match(pkg.scripts["build:frontend-v3"], /scripts\/build-v3-phrase-catalog\.mjs/);
  assert.match(pkg.scripts["build:frontend-v3"], /npm --prefix frontend-v3 run build/);
  assert.ok(runner.listNodeTestFiles(repoRoot).includes("tests/frontendV3BuildPipeline.test.js"));
});

test("Railway Nixpacks installs and builds the v3 frontend before start", () => {
  const source = read("nixpacks.toml");

  assert.match(source, /npm ci/);
  assert.match(source, /npm --prefix frontend-v3 ci/);
  assert.match(source, /npm run build:frontend-v3/);
  assert.match(source, /public\/app-v3\/index\.html/);
  assert.match(source, /\[start\][\s\S]*cmd = "npm start"/);
});

test("Docker image builds v3 assets instead of relying on committed leftovers", () => {
  const source = read("Dockerfile");

  assert.match(source, /COPY frontend-v3\/package\*\.json \.\/frontend-v3\//);
  assert.match(source, /npm ci --omit=dev/);
  assert.match(source, /npm --prefix frontend-v3 ci/);
  assert.match(source, /npm run build:frontend-v3/);
  assert.match(source, /public\/app-v3\/index\.html/);
  assert.match(source, /CMD \["npm", "start"\]/);
});

test("Nixpacks and Docker agree on the Node major version", () => {
  const nixpacks = read("nixpacks.toml");
  const dockerfile = read("Dockerfile");
  const pkg = JSON.parse(read("package.json"));

  const dockerMajor = dockerfile.match(/FROM node:(\d+)/)?.[1];
  const nixpacksMajor = nixpacks.match(/nixPkgs = \["nodejs_(\d+)"\]/)?.[1];
  const enginesMajor = pkg.engines?.node?.match(/^(\d+)/)?.[1];

  assert.ok(dockerMajor, "Dockerfile should pin a Node major version");
  assert.ok(nixpacksMajor, "nixpacks.toml should pin a specific nodejs_<major> package, not the unversioned 'nodejs'");
  assert.equal(nixpacksMajor, dockerMajor);
  assert.equal(enginesMajor, dockerMajor);
});

test("root and API-local nixpacks.toml stay mirrors of each other", () => {
  const apiNixpacks = read("nixpacks.toml");
  const rootNixpacks = fs.readFileSync(path.join(repoRoot, "..", "nixpacks.toml"), "utf8");

  // The root file builds from the monorepo root, so every command is
  // prefixed with "cd In-Ex-Ledger-API && "; stripping that prefix and
  // collapsing whitespace (TOML array formatting differs by line length,
  // not content) should make the two files semantically identical.
  const normalize = (source) =>
    source
      .replace(/cd In-Ex-Ledger-API && /g, "")
      .replace(/\s+/g, "");

  assert.equal(normalize(rootNixpacks), normalize(apiNixpacks));
});
