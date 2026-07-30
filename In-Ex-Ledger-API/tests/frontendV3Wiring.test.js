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
  assert.match(source, /getCurrentCanonicalPath\(\)/);
  assert.match(source, /window\.location\.hash/);
  assert.match(source, /path\.startsWith\('\/app-v3\/'\)/);
  assert.match(source, /isAuthPath\(path\)/);
  assert.match(source, /return '\/transactions'/);
});

test("v3 API client preserves multipart bodies and retries stale CSRF once", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "apiClient.ts"), "utf8");

  assert.match(source, /class ApiRequestError extends Error/);
  assert.match(source, /code\?: string/);
  assert.match(source, /details\?: unknown/);
  assert.match(source, /new ApiRequestError\(data\.error \|\| 'Request failed\.', response\.status, data\.code, data\.details\)/);
  assert.match(source, /init\.body instanceof FormData/);
  assert.match(source, /init\.body && !isFormData/);
  assert.match(source, /response\.status === 403 && await isCsrfFailure\(response\)/);
  assert.match(source, /await refreshCsrfToken\(\)/);
  assert.match(source, /fetch\('\/api\/me'/);
  assert.match(source, /CSRF token missing or invalid\./);
});

test("v3 app routes use bare canonical paths and browser back drives page state", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");

  assert.doesNotMatch(source, /^(<<<<<<<|=======|>>>>>>>)/m);
  assert.match(source, /return slug \? `\/\$\{slug\}` : '\/transactions'/);
  assert.match(source, /if \(page === 'Landing'\)[\s\S]*return '\/'/);
  assert.doesNotMatch(source, /return slug \? `\/app-v3\/\$\{slug\}`/);
  assert.match(source, /return requestedPage \? getPathForPage\(requestedPage\) : '\/transactions'/);
  assert.match(source, /normalizeLegacyAppV3Path/);
  assert.match(source, /login\?next=\$\{encodeURIComponent\(getPathForPage\(page\)\)\}/);
  assert.match(source, /app-v3-loading/);
  assert.match(source, /window\.addEventListener\('popstate', handlePopState\)/);
  assert.match(source, /setCurrentPage\(requestedPage \|\| \(authUser \? chooseAuthenticatedPage\(authUser\) : 'Landing'\)\)/);
});

test("v3 legacy app-v3 redirects have one server owner", () => {
  const source = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");

  assert.doesNotMatch(source, /^(<<<<<<<|=======|>>>>>>>)/m);
  assert.match(source, /function getLegacyV3RedirectPath/);
  assert.match(source, /return '\/transactions'/);
  assert.doesNotMatch(source, /app\.get\('\/app-v3'/);
  assert.doesNotMatch(source, /app\.get\('\/app-v3\/\*'/);
});

test("v3 root landing uses the React shell and current favicon", () => {
  const serverSource = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(repoRoot, "frontend-v3", "index.html"), "utf8");

  assert.match(serverSource, /app\.get\('\/', sendFrontendV3App\)/);
  assert.doesNotMatch(serverSource, /app\.get\('\/', \(req, res\)[\s\S]*sendCanonicalPage\('landing'/);
  assert.match(indexSource, /\/brand\/inex-mark-color\.svg\?v=20260726a/);
});

test("v3 row action menus are positioned against the viewport to avoid table clipping", () => {
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useOutsideActionMenu.ts"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(hookSource, /positionOpenActionMenu/);
  assert.match(hookSource, /getBoundingClientRect/);
  assert.match(hookSource, /--row-action-menu-left/);
  assert.match(hookSource, /window\.addEventListener\('scroll', reposition, true\)/);
  assert.match(cssSource, /\.row-action-menu\s*\{[\s\S]*position: fixed/);
  assert.match(cssSource, /max-height: calc\(100vh - 24px\)/);
});

test("v3 frontend dependencies are pinned", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "frontend-v3", "package.json"), "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(pkg[section] || {})) {
      assert.notEqual(version, "latest", `${name} should be pinned`);
      assert.match(String(version), /^\d+\.\d+\.\d+/, `${name} should use an exact semver version`);
    }
  }
});

test("v3 header notifications use real unread message counts without noisy local filler", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8");
  const i18nSource = fs.readFileSync(path.join(frontendRoot, "lib", "i18n.ts"), "utf8");

  assert.match(source, /loadUnreadCounts/);
  assert.match(source, /buildNotifications\(counts, language\)/);
  assert.match(source, /formatCountLabel/);
  assert.match(i18nSource, /support replies/);
  assert.match(i18nSource, /unread emails/);
  assert.match(i18nSource, /account notices/);
  assert.match(source, /window\.setInterval\(\(\) => void refreshNotifications\(\), 60000\)/);
  assert.doesNotMatch(source, /initialNotifications/);
  assert.doesNotMatch(source, /setNotifications\(\(items\) => items\.filter/);
  assert.doesNotMatch(source, /notification-clear/);
  assert.doesNotMatch(source, />Dismiss</);
});

test("v3 shell has an SPA-owned i18n runtime wired to business language", () => {
  const appSource = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");
  const shellSource = fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8");
  const authSource = fs.readFileSync(path.join(frontendRoot, "lib", "authApi.ts"), "utf8");
  const i18nSource = fs.readFileSync(path.join(frontendRoot, "lib", "i18n.ts"), "utf8");

  assert.match(i18nSource, /export type AppLanguage = 'en' \| 'es' \| 'fr'/);
  assert.match(i18nSource, /const translations = \{/);
  assert.match(i18nSource, /getUserLanguage\(user: AuthUser \| null\)/);
  assert.match(i18nSource, /user\?\.business\?\.language/);
  assert.match(i18nSource, /document\.documentElement\.lang = language/);
  assert.match(authSource, /language\?: string \| null/);
  assert.match(authSource, /language: activeBusiness\.language \|\| null/);
  assert.match(appSource, /getStoredLanguage/);
  assert.match(appSource, /getUserLanguage\(authUser\)/);
  assert.match(appSource, /setStoredLanguage\(nextLanguage\)/);
  assert.match(appSource, /translate\('app\.loading\.title', language\)/);
  assert.match(appSource, /language: AppLanguage/);
  assert.match(appSource, /onLanguageChange: \(language: AppLanguage\) => void/);
  // AppShell consumes the same shared `language` from PageProps rather than
  // independently recomputing it from authUser, so it can't diverge from an
  // in-progress (unsaved) language pick made in Settings or Onboarding.
  assert.match(shellSource, /\n {2}language,\n/);
  assert.doesNotMatch(shellSource, /getUserLanguage/);
  assert.match(shellSource, /translate\(key, language\)/);
  assert.match(shellSource, /i18nKey: 'shell\.nav\.transactions'/);
  assert.doesNotMatch(shellSource, /data-i18n/);
});

test("v3 header business switcher is wired instead of decorative, and the topbar search chrome is gone", () => {
  const shellSource = fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8");
  const transactionsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(shellSource, /loadBusinesses/);
  assert.match(shellSource, /activateBusiness\(business\.id\)/);
  assert.match(shellSource, /getCurrentUser\(\)/);
  assert.match(shellSource, /window\.location\.reload\(\)/);
  assert.match(shellSource, /business-dropdown/);
  assert.match(shellSource, /aria-label=\{t\('shell\.business\.switch'\)\}/);
  // The topbar search box was deleted outright (owner decision) -- it never
  // rendered in production anyway, since no page passed onSearch to AppShell.
  assert.doesNotMatch(shellSource, /onSearch/);
  assert.doesNotMatch(shellSource, /searchPlaceholder/);
  assert.doesNotMatch(shellSource, /topbar-search/);
  assert.doesNotMatch(transactionsSource, /searchPlaceholder=/);
  assert.doesNotMatch(transactionsSource, /searchValue=\{searchTerm\}/);
  assert.doesNotMatch(transactionsSource, /onSearch=\{\(value\) => updateFilter\(setSearchTerm, value\)\}/);
  assert.match(transactionsSource, /placeholder="Search transactions"[\s\S]*onChange=\{\(event\) => updateFilter\(setSearchTerm, event\.target\.value\)\}/);
  assert.match(cssSource, /\.business-dropdown/);
  assert.match(cssSource, /\.topbar-menus/);
  assert.doesNotMatch(cssSource, /\.topbar-search/);
});

test("v3 money formatters use the active business currency on app pages", () => {
  for (const page of ["Transactions.tsx", "Analytics.tsx", "Mileage.tsx", "Invoices.tsx"]) {
    const source = fs.readFileSync(path.join(frontendRoot, "pages", page), "utf8");
    assert.match(source, /window\.__LUNA_ME__\?\.business\?\.currency/);
  }

  const invoicesApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "invoicesApi.ts"), "utf8");
  const invoicesSource = fs.readFileSync(path.join(frontendRoot, "pages", "Invoices.tsx"), "utf8");

  assert.match(invoicesApiSource, /blankInvoiceDraft\(currency = 'USD'\)/);
  assert.match(invoicesApiSource, /currency\.toUpperCase\(\) === 'CAD' \? 'CAD' : 'USD'/);
  assert.match(invoicesSource, /blankInvoiceDraft\(currency\)/);
  assert.doesNotMatch(invoicesSource, /function formatMoney\(value: number, currency = 'USD'\)/);
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
  assert.match(apiSource, /start_date/);
  assert.match(apiSource, /end_date/);
  assert.match(apiSource, /params\.set\('account_id', filters\.accountId\)/);
  assert.match(apiSource, /params\.set\('category_id', filters\.categoryId\)/);
  assert.doesNotMatch(apiSource, /params\.set\('account_name'/);
  assert.doesNotMatch(apiSource, /params\.set\('category_name'/);
  assert.doesNotMatch(apiSource, /transactions\.data\.length\)/);
  assert.match(pageSource, /loadTransactionPageData\(\{/);
  assert.match(pageSource, /limit: pageSize/);
  assert.match(pageSource, /offset: \(currentPage - 1\) \* pageSize/);
  assert.match(pageSource, /categoryId: categoryFilter/);
  assert.match(pageSource, /accountId: accountFilter/);
  assert.match(pageSource, /function updateFilter/);
  assert.match(pageSource, /getPaginationPages\(safeCurrentPage, totalPages\)/);
  assert.doesNotMatch(pageSource, /Array\.from\(\{ length: totalPages \}, \(_, index\) => index \+ 1\)\.slice\(0, 5\)/);
  assert.match(pageSource, /onStartDateChange=\{\(value\) => updateFilter\(setStartDateFilter, value\)\}/);
  assert.match(pageSource, /onEndDateChange=\{\(value\) => updateFilter\(setEndDateFilter, value\)\}/);
  assert.match(pageSource, /Manage categories<\/button>/);
  assert.match(pageSource, /transaction-edit-review/);
  assert.match(pageSource, /field-needs-review/);
  assert.match(cssSource, /\.transaction-edit-review/);
  assert.match(cssSource, /\.drawer-form :is\(label, details\)\.field-needs-review/);
});

test("v3 transactions use Categories page source for dropdowns and clean review labels", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(apiSource, /\/api\/categories\?limit=500&offset=0&include_inactive=true/);
  assert.match(apiSource, /function mapCategoryOption/);
  assert.match(apiSource, /category\.is_active !== false/);
  assert.match(pageSource, /function normalizeReviewLabels/);
  assert.match(pageSource, /\^mapped\$/i);
  assert.match(pageSource, /Mapping: \{reviewText\(item\.categoryReason\)\}/);
  assert.match(pageSource, /tax-profile-note/);
  assert.match(cssSource, /\.tax-profile-note/);
});

test("v3 transactions use legacy estimated tax percentages including Canada province rates", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");

  assert.match(source, /AB: 0\.29/);
  assert.match(source, /BC: 0\.26/);
  assert.match(source, /ON: 0\.27/);
  assert.match(source, /QC: 0\.34/);
  assert.match(source, /return rates\[province\] \|\| 0\.28/);
  assert.match(source, /combined income tax \+ CPP rate/);
  assert.doesNotMatch(source, /QC: 0\.14975/);
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
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "accountsApi.ts"), "utf8");

  assert.doesNotMatch(source, /title="Plaid connector"/);
  assert.doesNotMatch(source, /Available later/);
  assert.match(source, /Connect with Plaid/);
  assert.match(source, /requestPlaidLinkToken/);
  assert.match(source, /onPlaidConnect/);
  assert.match(source, /Plaid is configured, but the Plaid Link launcher is not installed/);
  assert.match(apiSource, /\/api\/plaid\/link-token/);
});

test("v3 accounts use API account transaction counts instead of a capped transactions scan", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "accountsApi.ts"), "utf8");
  const routeSource = fs.readFileSync(path.join(repoRoot, "routes", "accounts.routes.js"), "utf8");

  assert.match(routeSource, /COALESCE\(tx\.transaction_count, 0\)::int AS transaction_count/);
  assert.match(routeSource, /LEFT JOIN LATERAL/);
  assert.match(apiSource, /mapAccount\(account\)/);
  assert.doesNotMatch(apiSource, /\/api\/transactions\?limit=500&offset=0/);
  assert.doesNotMatch(apiSource, /transactions\.data\.reduce/);
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
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "receiptsApi.ts"), "utf8");
  const routeSource = fs.readFileSync(path.join(repoRoot, "routes", "receipts.routes.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(pageSource, /ReceiptLinkModal/);
  assert.match(pageSource, /Search transactions/);
  assert.match(pageSource, /Link transaction/);
  assert.match(pageSource, /onSearchTransactions={searchReceiptTransactionOptions}/);
  assert.match(pageSource, /useRef\(0\)/);
  assert.match(pageSource, /window\.setTimeout\(\(\) =>/);
  assert.match(pageSource, /}, 275\)/);
  assert.match(pageSource, /searchSequenceRef\.current === sequence/);
  assert.match(apiSource, /export async function searchReceiptTransactionOptions/);
  assert.match(apiSource, /params\.set\('limit', '50'\)/);
  assert.doesNotMatch(apiSource, /\/api\/transactions\?limit=500&offset=0/);
  assert.match(routeSource, /t\.description AS transaction_description/);
  assert.doesNotMatch(pageSource, /Link to latest/);
  assert.doesNotMatch(pageSource, /attachReceipt\(receipt\.id, null\)/);
  assert.match(cssSource, /\.receipt-link-unlinked,[\s\S]*var\(--red\)/);
});

test("v3 mileage and exports remove nonessential bottom/card sections", () => {
  const mileageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Mileage.tsx"), "utf8");
  const exportsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Exports.tsx"), "utf8");

  assert.doesNotMatch(mileageSource, /Mileage rate and unit settings/);
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
  assert.match(apiSource, /\/api\/business\/accounting-lock/);
});

test("v3 transactions disable protected actions for locked accounting periods", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(pageSource, /loadAccountingLock/);
  assert.match(pageSource, /function isTransactionLocked/);
  assert.match(pageSource, /rowLocked/);
  assert.match(pageSource, /row-action-menu-note/);
  assert.match(pageSource, /disabled=\{rowLocked\}/);
  assert.match(pageSource, /transaction-lock-note/);
  assert.match(pageSource, /disabled=\{isLocked\}/);
  assert.match(pageSource, /Edits, receipt changes, cleared status, and deletion are disabled/);
  assert.match(cssSource, /\.row-action-menu button:disabled/);
  assert.match(cssSource, /\.transaction-lock-note/);
});

test("v3 mileage disables edit and delete for locked accounting periods", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Mileage.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(pageSource, /loadAccountingLock/);
  assert.match(pageSource, /function isMileageLocked/);
  assert.match(pageSource, /rowLocked/);
  assert.match(pageSource, /disabled=\{rowLocked\}/);
  assert.match(pageSource, /Locked through \{formatMonthDate/);
  assert.match(pageSource, /This mileage activity is locked through/);
  assert.match(cssSource, /\.row-menu button:disabled/);
});

test("v3 receipts disable relink and delete for receipts tied to locked transactions", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Receipts.tsx"), "utf8");
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "receiptsApi.ts"), "utf8");

  assert.match(apiSource, /linkedTransactionDate/);
  assert.match(apiSource, /row\.transaction_date \? String\(row\.transaction_date\)\.slice\(0, 10\) : null/);
  assert.match(pageSource, /loadAccountingLock/);
  assert.match(pageSource, /function isReceiptLocked/);
  assert.match(pageSource, /Linked transaction locked through/);
  assert.match(pageSource, /disabled=\{rowLocked\}/);
  assert.match(pageSource, /This receipt is linked to a transaction locked through/);
});

test("v3 subscription avoids checkout conflicts for existing Stripe subscriptions", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "Subscription.tsx"), "utf8");
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "billingApi.ts"), "utf8");

  assert.match(source, /openBillingPortal/);
  assert.match(source, /shouldManageExistingSubscription/);
  assert.match(source, /needsBillingPortal/);
  assert.match(source, /await openBillingPortal\(\)/);
  assert.match(source, /readPreferredBillingInterval/);
  assert.match(source, /chooseBillingInterval/);
  assert.match(source, /sessionStorage\.setItem\('inex-preferred-billing-interval', nextInterval\)/);
  // Pro checkout is plan-only: no addon-slot picker on the pre-Pro checkout
  // screen, and startCheckout is never called with an additionalBusinesses
  // argument. Extra business slots are purchased separately, after Pro is
  // active, through the Business Workspaces page's own pricing-aware view.
  assert.match(source, /await startCheckout\(interval\)/);
  assert.doesNotMatch(source, /startCheckout\(interval, /);
  assert.match(apiSource, /\/api\/billing\/additional-businesses\/checkout/);
  assert.match(apiSource, /\/api\/billing\/additional-businesses/);
  assert.match(apiSource, /method: 'PATCH'/);
});

test("v3 business workspaces page owns additional-business-slot checkout", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "pages", "BusinessWorkspaces.tsx"), "utf8");

  assert.match(source, /startAdditionalBusinessCheckout/);
  assert.match(source, /canPurchaseAdditionalBusiness/);
  assert.match(source, /hasAvailableBusinessSlot/);
  assert.match(source, /isCancellationPending/);
  assert.match(source, /Buy another business slot/);
  assert.match(source, /additionalBusinessPrice/);
});

test("v3 collapsed sidebar keeps the header visible", () => {
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(cssSource, /\.sidebar-is-collapsed \.app-topbar[\s\S]*display: flex/);
  assert.match(cssSource, /\.sidebar-is-collapsed \.app-topbar[\s\S]*visibility: visible/);
  assert.match(cssSource, /\.app-topbar[\s\S]*z-index: 40/);
  assert.match(cssSource, /grid-template-columns: minmax\(0, max-content\) auto/);
  assert.match(cssSource, /\.topbar-actions\s*\{[\s\S]*min-width: max-content/);
});

test("v3 logout resets next login to transactions instead of the prior app page", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");

  assert.match(source, /setCurrentPage\('Landing'\)[\s\S]*window\.history\.replaceState\(\{\}, '', '\/'\)/);
  // Auth-flow pages (Login, MfaChallenge, ...) are never a valid landing
  // page for an authenticated session, so they fall back to Transactions
  // alongside the "no requested page at all" case.
  assert.match(source, /return requestedPage && !authFlowPages\.has\(requestedPage\) \? requestedPage : 'Transactions'/);
});

test("v3 page polish removes redundant controls and decorations", () => {
  const transactions = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const mileage = fs.readFileSync(path.join(frontendRoot, "pages", "Mileage.tsx"), "utf8");
  const invoices = fs.readFileSync(path.join(frontendRoot, "pages", "Invoices.tsx"), "utf8");

  assert.doesNotMatch(transactions, /onSearch=\{\(value\) => updateFilter\(setSearchTerm, value\)\}/);
  assert.doesNotMatch(mileage, /mileage-quick-log decorative-card/);
  assert.doesNotMatch(mileage, /mileage-planning-card decorative-card/);
  assert.doesNotMatch(invoices, /invoice-tools-panel/);
  assert.doesNotMatch(invoices, /Email and payment tools/);
});

test("v3 Help page reflects the current app workflows", () => {
  const help = fs.readFileSync(path.join(frontendRoot, "pages", "Help.tsx"), "utf8");

  assert.match(help, /CSV imports and auto-mapping/);
  assert.match(help, /Mileage or kilometers/);
  assert.match(help, /Email changes use a six-digit email verification flow/);
});

test("phase 7 guardrails installs frontend v3 dependencies before i18n runtime checks", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, "..", ".github", "workflows", "phase7-guardrails.yml"), "utf8");

  assert.match(workflow, /Install frontend v3 dependencies/);
  assert.match(workflow, /working-directory: In-Ex-Ledger-API\/frontend-v3[\s\S]*run: npm install/);
});

test("legacy auth defaults avoid rapid v3 session expiry and refresh throttling", () => {
  const authRoutes = fs.readFileSync(path.join(repoRoot, "routes", "auth.routes.js"), "utf8");
  const authMiddleware = fs.readFileSync(path.join(repoRoot, "middleware", "auth.middleware.js"), "utf8");
  const rateLimitTiers = fs.readFileSync(path.join(repoRoot, "middleware", "rateLimitTiers.js"), "utf8");

  assert.match(authRoutes, /ACCESS_TOKEN_EXPIRY_SECONDS\) \|\| 60 \* 60/);
  assert.match(authMiddleware, /JWT_EXPIRY_SECONDS\) \|\| 60 \* 60/);
  assert.match(rateLimitTiers, /max: 120[\s\S]*keyPrefix: "rl:refresh"/);
});
