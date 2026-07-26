const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
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

test("v3 transaction mapper expects the legacy row fields the API returns", () => {
  const source = read(path.join("lib", "transactionsApi.ts"));

  for (const field of [
    "account_id",
    "account_name",
    "category_id",
    "category_name",
    "receipt_count",
    "review_status",
    "review_notes"
  ]) {
    assert.match(source, new RegExp(`${field}[?]?:`), `LegacyTransaction should include ${field}`);
    assert.match(source, new RegExp(`row\\.${field}`), `mapTransaction should consume ${field}`);
  }

  assert.match(source, /description: row\.description \|\| 'Untitled transaction'/);
  assert.match(source, /category: row\.category_name \|\| 'Uncategorized'/);
  assert.match(source, /account: row\.account_name \|\| 'Account'/);
});

test("v3 /api/me contract preserves active business localization and tier data", () => {
  const source = read(path.join("lib", "authApi.ts"));

  assert.match(source, /active_business\?: LegacyBusiness \| null/);
  assert.match(source, /language\?: string/);
  assert.match(source, /currency\?: string/);
  assert.match(source, /subscription\?: \{[\s\S]*effectiveTier\?: string[\s\S]*tier\?: string[\s\S]*planCode\?: string/);
  assert.match(source, /currentBusinessId: user\.active_business_id \|\| user\.business_id \|\| activeBusiness\?\.id \|\| null/);
  assert.match(source, /currency: activeBusiness\.currency \|\| \(activeBusiness\.region === 'CA' \? 'CAD' : 'USD'\)/);
  assert.match(source, /language: activeBusiness\.language \|\| null/);
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
  assert.match(transactionsSource, /estimatedCanadianRate\(province\)/);
});
