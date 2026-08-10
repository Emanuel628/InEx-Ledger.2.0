"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");

test("test:all runs every top-level Node test file", async () => {
  const packageJson = require("../package.json");
  const runner = await import("../scripts/run-all-node-tests.mjs");

  const topLevelTests = runner.listTopLevelTestFiles(apiRoot);
  const nodeTests = runner.listNodeTestFiles(apiRoot).map((filePath) => path.basename(filePath));
  const separateTests = topLevelTests.filter((fileName) => !nodeTests.includes(fileName));

  assert.match(packageJson.scripts["test:all"], /node scripts\/run-all-node-tests\.mjs/);
  assert.match(packageJson.scripts["test:all"], /tests\/asvsControls\.test\.js/);
  assert.deepEqual(separateTests, [runner.ASVS_TEST_FILE]);
  assert.equal(nodeTests.includes(path.basename(__filename)), true);

  const listResult = spawnSync(process.execPath, ["scripts/run-all-node-tests.mjs", "--list"], {
    cwd: apiRoot,
    encoding: "utf8"
  });

  assert.equal(listResult.status, 0, listResult.stderr);
  assert.deepEqual(JSON.parse(listResult.stdout).map((filePath) => path.basename(filePath)), nodeTests);
});
