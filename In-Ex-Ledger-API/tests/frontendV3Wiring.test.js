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
    "/api/analytics",
    "/api/me/onboarding",
    "/api/businesses",
    "/api/privacy/settings"
  ]) {
    assert.match(libFiles, new RegExp(route.replace("/", "\\/")));
  }
});

test("v3 public pages are mapped for direct URL routing", () => {
  const appSource = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");

  for (const [page, slug] of [
    ["Pricing", "pricing"],
    ["Legal", "legal"],
    ["Privacy", "privacy"],
    ["Terms", "terms"]
  ]) {
    assert.match(appSource, new RegExp(`${page}: '${slug}'`));
  }
});

test("v3 API client refreshes an expired access token before failing authenticated requests", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "apiClient.ts"), "utf8");

  assert.match(source, /response\.status === 401 && await refreshAccessToken\(\)/);
  assert.match(source, /\/api\/auth\/refresh/);
  assert.match(source, /credentials: 'include'/);
});

test("v3 API client preserves multipart bodies and retries stale CSRF once", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "apiClient.ts"), "utf8");

  assert.match(source, /init\.body instanceof FormData/);
  assert.match(source, /init\.body && !isFormData/);
  assert.match(source, /response\.status === 403 && await isCsrfFailure\(response\)/);
  assert.match(source, /CSRF token missing or invalid\./);
});

test("v3 transactions CSV import requires legacy account and date range fields", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");

  assert.match(apiSource, /form\.append\('account_id', input\.accountId\)/);
  assert.match(apiSource, /form\.append\('start_date', input\.startDate\)/);
  assert.match(apiSource, /form\.append\('end_date', input\.endDate\)/);
  assert.match(pageSource, /Destination account/);
  assert.match(pageSource, /Start date/);
  assert.match(pageSource, /End date/);
  assert.doesNotMatch(pageSource, /monthFilter/);
});

test("v3 archived message rows expose an action menu instead of only opening the thread", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "Messages.tsx"), "utf8");

  assert.match(source, /message-action-menu/);
  assert.match(source, /thread\.archived \? 'Unarchive' : 'Archive'/);
  assert.match(source, /setActionMenuId\(\(id\) => \(id === thread\.id \? null : thread\.id\)\)/);
});
