const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("root build script builds the v3 SPA", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.scripts.build, "npm run build:frontend-v3");
  assert.match(pkg.scripts["build:frontend-v3"], /scripts\/build-v3-phrase-catalog\.mjs/);
  assert.match(pkg.scripts["build:frontend-v3"], /npm --prefix frontend-v3 run build/);
  assert.match(pkg.scripts["test:all"], /tests\/frontendV3BuildPipeline\.test\.js/);
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
