const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");
const frontendPackageRoot = path.join(repoRoot, "frontend-v3");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

// Transpiles a lib/*.ts module with the real TypeScript compiler and runs it
// in a sandbox so tests can call its real exported functions instead of
// pattern-matching the source text. `stubs` supplies CommonJS modules for
// the file's own relative imports (types are erased, so only runtime
// dependencies actually used by the functions under test need real bodies).
function loadLibModule(relativePath, stubs = {}) {
  const ts = require(path.join(frontendPackageRoot, "node_modules", "typescript"));
  const source = read(relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const sandbox = {
    exports: {},
    module: { exports: {} },
    require(specifier) {
      if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
        return stubs[specifier];
      }
      throw new Error(`Unexpected require('${specifier}') while loading ${relativePath}`);
    },
    URL
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transpiled, sandbox, { filename: relativePath });
  return sandbox.module.exports;
}

test("v3 transaction contract stays server-driven and id-based", () => {
  const source = read(path.join("lib", "transactionsApi.ts"));

  assert.match(source, /type ListResponse = \{[\s\S]*data: LegacyTransaction\[\][\s\S]*total\?: number[\s\S]*limit\?: number[\s\S]*offset\?: number[\s\S]*has_more\?: boolean[\s\S]*summary\?:/);
  assert.match(source, /income_total\?: number/);
  assert.match(source, /expense_total\?: number/);
  assert.match(source, /transaction_count\?: number/);
  assert.match(source, /params\.set\('category_id', filters\.categoryId\)/);
  assert.match(source, /params\.set\('account_id', filters\.accountId\)/);
  assert.match(source, /params\.set\('start_date', filters\.startDate\)/);
  assert.match(source, /params\.set\('end_date', filters\.endDate\)/);
  assert.match(source, /total: Number\(transactions\.total \?\? transactions\.summary\?\.transaction_count \?\? 0\)/);
  assert.match(source, /hasMore: transactions\.has_more === true/);
  assert.doesNotMatch(source, /category_name\)/);
  assert.doesNotMatch(source, /account_name\)/);
});

function loadTransactionsApiModule() {
  return loadLibModule(path.join("lib", "transactionsApi.ts"), {
    "./apiClient": {
      apiRequest: async () => {
        throw new Error("apiRequest should not be called by mapTransaction");
      }
    },
    "./categoriesApi": {
      getTaxLineOptions: () => []
    }
  });
}

test("v3 transaction mapper maps a full legacy row's real fields onto the Transaction shape", () => {
  const { mapTransaction } = loadTransactionsApiModule();

  const mapped = mapTransaction({
    id: "txn-1",
    account_id: "acct-1",
    account_name: "Checking",
    category_id: "cat-1",
    category_name: "Software",
    amount: "42.50",
    type: "expense",
    cleared: true,
    description: "Zoom subscription",
    date: "2026-01-15",
    note: "monthly",
    receipt_count: 2,
    review_status: "flagged",
    review_notes: "needs a second look",
    receipt_status: "attached",
    receipt_missing_reason: null,
    business_purpose: "software"
  });

  assert.equal(mapped.accountId, "acct-1");
  assert.equal(mapped.categoryId, "cat-1");
  assert.equal(mapped.category, "Software");
  assert.equal(mapped.account, "Checking");
  assert.equal(mapped.amount, -42.5, "expense amounts should be negative");
  assert.equal(mapped.receipt, "Attached");
  assert.equal(mapped.reviewStatus, "flagged");
  assert.equal(mapped.reviewNotes, "needs a second look");
  assert.equal(mapped.receiptStatus, "attached");
  assert.equal(mapped.cleared, true);
});

test("v3 transaction mapper falls back to defaults when optional legacy fields are absent", () => {
  const { mapTransaction } = loadTransactionsApiModule();

  const mapped = mapTransaction({
    id: "txn-2",
    account_id: "acct-2",
    category_id: "cat-2",
    amount: 10,
    type: "income",
    date: "2026-01-16"
  });

  assert.equal(mapped.description, "Untitled transaction");
  assert.equal(mapped.category, "Uncategorized");
  assert.equal(mapped.account, "Account");
  assert.equal(mapped.receipt, "Missing");
  assert.equal(mapped.amount, 10, "income amounts should stay positive");
  assert.equal(mapped.receiptStatus, "pending", "an unrecognized/missing receipt_status should fall back to pending");
});

function loadAuthApiModule() {
  return loadLibModule(path.join("lib", "authApi.ts"), {
    "./apiClient": {
      apiRequest: async () => {
        throw new Error("apiRequest should not be called by mapLegacyUser");
      }
    }
  });
}

test("v3 /api/me contract maps a real legacy user's active business localization and tier data", () => {
  const { mapLegacyUser } = loadAuthApiModule();

  const mapped = mapLegacyUser({
    id: "user-1",
    email: "owner@example.com",
    full_name: "Ada Lovelace",
    active_business_id: "biz-1",
    active_business: {
      id: "biz-1",
      name: "Analytical Engines Ltd",
      region: "CA",
      language: "fr"
    },
    subscription: { effectiveTier: "business" }
  });

  assert.equal(mapped.currentBusinessId, "biz-1");
  assert.equal(mapped.business.currency, "CAD", "a CA business with no explicit currency should default to CAD");
  assert.equal(mapped.business.language, "fr");
  assert.equal(mapped.tier, "business");
});

test("v3 /api/me contract falls back through business_id and defaults currency to USD outside Canada", () => {
  const { mapLegacyUser } = loadAuthApiModule();

  const mapped = mapLegacyUser({
    id: "user-2",
    email: "member@example.com",
    business_id: "biz-legacy",
    active_business: { id: "biz-2", region: "US" },
    subscription: { tier: "pro" }
  });

  assert.equal(mapped.currentBusinessId, "biz-legacy", "business_id should be preferred over the active business's own id");
  assert.equal(mapped.business.currency, "USD");
  assert.equal(mapped.business.language, null);
  assert.equal(mapped.tier, "pro");
});

test("v3 business profile contract keeps region and province available for tax math", () => {
  const settingsSource = read(path.join("lib", "settingsApi.ts"));
  const transactionsSource = read(path.join("lib", "transactionsApi.ts"));

  assert.match(settingsSource, /region: 'US' \| 'CA'/);
  assert.match(settingsSource, /province\?: string \| null/);
  assert.match(settingsSource, /material_participation\?: boolean \| null/);
  assert.match(settingsSource, /body\.material_participation = Boolean\(profile\.material_participation\)/);
  assert.match(transactionsSource, /type LegacyBusiness = \{[\s\S]*region\?: string \| null[\s\S]*country\?: string \| null[\s\S]*province\?: string \| null/);
  assert.match(transactionsSource, /resolveEstimatedTaxProfile\(business\)/);
});
