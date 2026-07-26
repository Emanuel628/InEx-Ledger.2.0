const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");

function readFrontendFiles() {
  const files = [];
  const stack = [frontendRoot];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files.map((file) => ({
    file,
    source: fs.readFileSync(file, "utf8")
  }));
}

test("v3 wired app pages do not ship mock business data fallbacks", () => {
  const forbiddenPatterns = [
    /\bmock-\w+/i,
    /Emanuel Castro/i,
    /Mejor Tech/i,
    /Acme Corporation/i,
    /Brightfield Studios/i,
    /Northwind Labs/i,
    /Sample Studio/i,
    /Alex Morgan/i,
    /\bAlex\b/i,
    /\bMorgan\b/i,
    /Visa ending 4242/i,
    /FinServe/i,
    /May 2024/i
  ];

  const offenders = [];
  for (const { file, source } of readFrontendFiles()) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        offenders.push(`${path.relative(repoRoot, file)} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("v3 API helpers point at legacy API routes instead of fake local data", () => {
  const libFiles = readFrontendFiles()
    .filter(({ file }) => file.includes(`${path.sep}lib${path.sep}`))
    .map(({ source }) => source)
    .join("\n");

  for (const route of [
    "/api/transactions",
    "/api/accounts",
    "/api/categories",
    "/api/receipts",
    "/api/mileage",
    "/api/exports",
    "/api/invoices-v1",
    "/api/analytics"
  ]) {
    assert.match(libFiles, new RegExp(route.replace("/", "\\/")));
  }
});
