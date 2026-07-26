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

test("v3 app routes stay under app-v3 and browser back drives page state", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");

  assert.match(source, /return slug \? `\/app-v3\/\$\{slug\}` : '\/app-v3'/);
  assert.match(source, /window\.addEventListener\('popstate', handlePopState\)/);
  assert.match(source, /setCurrentPage\(requestedPage \|\| \(authUser \? chooseAuthenticatedPage\(authUser\) : 'Landing'\)\)/);
});

test("v3 header notifications use real unread message counts without noisy local filler", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8");

  assert.match(source, /loadUnreadCounts/);
  assert.match(source, /buildNotifications\(counts\)/);
  assert.match(source, /support replies/);
  assert.match(source, /unread emails/);
  assert.match(source, /account notices/);
  assert.match(source, /window\.setInterval\(\(\) => void refreshNotifications\(\), 60000\)/);
  assert.doesNotMatch(source, /initialNotifications/);
});

test("v3 settings normalizes business profile fields before saving", () => {
  const settingsApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "settingsApi.ts"), "utf8");
  const settingsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(settingsApiSource, /if \(profile\.region === 'US'\) \{/);
  assert.match(settingsApiSource, /body\.material_participation = Boolean\(profile\.material_participation\)/);
  assert.doesNotMatch(settingsApiSource, /material_participation: profile\.region === 'US' \? Boolean\(profile\.material_participation\) : null/);
  assert.match(settingsSource, /English/);
  assert.match(settingsSource, /French/);
  assert.match(settingsSource, /Newfoundland and Labrador/);
  assert.match(settingsSource, /Northwest Territories/);
  assert.match(settingsSource, /Prince Edward Island/);
  assert.match(settingsSource, /placeholder="MM-DD"/);
  assert.match(settingsSource, /validateBusinessProfile/);
  assert.match(settingsSource, /settings-field-error/);
  assert.doesNotMatch(settingsSource, /type="date"[\s\S]*Fiscal year start/);
  assert.match(cssSource, /\.settings-field\.is-invalid/);
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

test("v3 transactions restores tax estimate, review fixes, receipt upload, recurring templates, and category handoff", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");

  assert.match(apiSource, /\/api\/business/);
  assert.match(apiSource, /\/api\/review\/queue/);
  assert.match(apiSource, /\/api\/recurring/);
  assert.match(apiSource, /resolveEstimatedTaxProfile/);
  assert.match(pageSource, /Estimated tax/);
  assert.match(pageSource, /uploadReceipt\(file, transaction\.id\)/);
  assert.match(pageSource, /ReviewQueuePanel/);
  assert.match(pageSource, /RecurringTemplatesPanel/);
  assert.match(pageSource, /Manage categories\.\.\./);
  assert.doesNotMatch(pageSource, /Tax set-aside helper/);
  assert.doesNotMatch(pageSource, /Not connected yet/);
});

test("v3 transactions render review reasons safely and wire filter date range plus category handoff", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(apiSource, /categoryReason\?: unknown/);
  assert.match(pageSource, /function reviewText\(value: unknown\)/);
  assert.match(pageSource, /reviewText\(record\.summary\)/);
  assert.doesNotMatch(pageSource, /\{reviewItem\.supportSummary \|\| reviewItem\.reviewNotes \|\| reviewItem\.categoryReason\}/);
  assert.match(pageSource, /transaction\.dateIso >= startDateFilter/);
  assert.match(pageSource, /transaction\.dateIso <= endDateFilter/);
  assert.match(pageSource, /onStartDateChange={setStartDateFilter}/);
  assert.match(pageSource, /onEndDateChange={setEndDateFilter}/);
  assert.match(pageSource, /Manage categories<\/button>/);
  assert.match(pageSource, /transaction-edit-review/);
  assert.match(pageSource, /field-needs-review/);
  assert.match(cssSource, /\.transaction-edit-review/);
  assert.match(cssSource, /\.drawer-form :is\(label, details\)\.field-needs-review/);
});

test("v3 transactions expose legacy undo delete and a clickable per-page select affordance", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(apiSource, /\/api\/transactions\/undo-delete'/);
  assert.match(apiSource, /\/api\/transactions\/undo-delete-status/);
  assert.match(pageSource, /Undo delete/);
  assert.match(pageSource, /undo-delete-button/);
  assert.match(cssSource, /\.per-page-button svg[\s\S]*pointer-events: none/);
});

test("v3 accounts remove the bottom Plaid connector panel while keeping add-account options", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "Accounts.tsx"), "utf8");

  assert.doesNotMatch(source, /title="Plaid connector"/);
  assert.doesNotMatch(source, /Available later/);
  assert.match(source, /Connect with Plaid/);
});

test("v3 categories use full tax mappings and red inactive archived states without archived footer panel", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "categoriesApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Categories.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  for (const expected of [
    "depreciation_section179",
    "employee_benefit_programs",
    "rent_lease_vehicles",
    "t2125_8000",
    "ca_9943"
  ]) {
    assert.match(apiSource, new RegExp(expected));
  }
  assert.match(apiSource, /tax_map_us: null/);
  assert.match(apiSource, /taxLine: isActive \?[\s\S]*: 'Disconnected'/);
  assert.match(apiSource, /'Inactive'/);
  assert.match(pageSource, /<option value="Inactive">Inactive<\/option>/);
  assert.doesNotMatch(pageSource, /Archived categories/);
  assert.match(cssSource, /\.status-inactive,[\s\S]*\.status-archived[\s\S]*var\(--red\)/);
});

test("v3 receipts use red unlinked pills and a transaction picker instead of link-to-latest", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Receipts.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(pageSource, /ReceiptLinkModal/);
  assert.match(pageSource, /Search transactions/);
  assert.match(pageSource, /Link transaction/);
  assert.doesNotMatch(pageSource, /Link to latest/);
  assert.doesNotMatch(pageSource, /attachReceipt\(receipt\.id, null\)/);
  assert.match(cssSource, /\.receipt-link-unlinked,[\s\S]*var\(--red\)/);
});

test("v3 mileage and exports remove nonessential bottom/card sections", () => {
  const mileageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Mileage.tsx"), "utf8");
  const exportsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Exports.tsx"), "utf8");

  assert.doesNotMatch(mileageSource, /Mileage rate and unit settings/);
  assert.doesNotMatch(mileageSource, /ProgressivePanel/);
  assert.doesNotMatch(exportsSource, /sensitive-export-card/);
  assert.doesNotMatch(exportsSource, /Protected export details/);
});

test("v3 archived message rows expose an action menu instead of only opening the thread", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "Messages.tsx"), "utf8");

  assert.match(source, /message-action-menu/);
  assert.match(source, /thread\.archived \? 'Unarchive' : 'Archive'/);
  assert.match(source, /setActionMenuId\(\(id\) => \(id === thread\.id \? null : thread\.id\)\)/);
});

test("v3 change email uses MFA-style verification instead of inline confirm controls", () => {
  const changeEmailSource = fs.readFileSync(path.join(frontendRoot, "pages", "ChangeEmail.tsx"), "utf8");
  const mfaSource = fs.readFileSync(path.join(frontendRoot, "pages", "MfaChallenge.tsx"), "utf8");
  const authSource = fs.readFileSync(path.join(frontendRoot, "lib", "authApi.ts"), "utf8");

  assert.doesNotMatch(changeEmailSource, /Verification code/);
  assert.doesNotMatch(changeEmailSource, /Confirm email change/);
  assert.match(changeEmailSource, /inex-mfa-context/);
  assert.match(authSource, /verificationMode: 'mfa_code'/);
  assert.match(authSource, /\/api\/auth\/confirm-email-change/);
  assert.match(mfaSource, /Verify email change/);
});

test("v3 business settings expose the live accounting lock and hide the old business-account row", () => {
  const settingsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "settingsApi.ts"), "utf8");

  assert.match(settingsSource, /AccountingLockControls/);
  assert.match(settingsSource, /Save lock/);
  assert.match(settingsSource, /Clear lock/);
  assert.doesNotMatch(settingsSource, /Businesses on this account/);
  assert.match(apiSource, /\/api\/business\/accounting-lock/);
});

test("v3 subscription avoids checkout conflicts for existing Stripe subscriptions", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "Subscription.tsx"), "utf8");

  assert.match(source, /openBillingPortal/);
  assert.match(source, /shouldManageExistingSubscription/);
  assert.match(source, /needsBillingPortal/);
  assert.match(source, /await openBillingPortal\(\)/);
  assert.match(source, /Open Stripe billing/);
});
