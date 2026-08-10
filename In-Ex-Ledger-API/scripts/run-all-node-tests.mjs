import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const ASVS_TEST_FILE = "asvsControls.test.js";

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function listTopLevelTestFiles(root = apiRoot) {
  return readdirSync(join(root, "tests"))
    .filter((fileName) => fileName.endsWith(".test.js"))
    .sort();
}

export function listNodeTestFiles(root = apiRoot) {
  return listTopLevelTestFiles(root)
    .filter((fileName) => fileName !== ASVS_TEST_FILE)
    .map((fileName) => `tests/${fileName}`);
}

function runNodeTests() {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...listNodeTestFiles()],
    {
      cwd: apiRoot,
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

function main(args) {
  if (args.includes("--list")) {
    process.stdout.write(`${JSON.stringify(listNodeTestFiles(), null, 2)}\n`);
    return;
  }

  runNodeTests();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
