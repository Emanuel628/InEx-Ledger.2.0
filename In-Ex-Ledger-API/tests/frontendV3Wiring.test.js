const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");
const frontendPackageRoot = path.join(repoRoot, "frontend-v3");

// Transpiles a lib/*.ts module with the real TypeScript compiler and runs it
// in a sandbox so tests can exercise its real exported functions against a
// mocked fetch/DOM instead of pattern-matching the source text.
function loadLibModule(relativePath, sandboxExtras = {}) {
  const ts = require(path.join(frontendPackageRoot, "node_modules", "typescript"));
  const source = fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const sandbox = {
    exports: {},
    module: { exports: {} },
    URL,
    ...sandboxExtras
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transpiled, sandbox, { filename: relativePath });
  return sandbox.module.exports;
}

function loadApiClientModule({ fetchImpl, cookieStore = new Map() } = {}) {
  const assignedUrls = [];
  const documentStub = {
    get cookie() {
      return Array.from(cookieStore.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value) {
      const [pair] = String(value).split(";");
      const eq = pair.indexOf("=");
      if (eq > -1) {
        cookieStore.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  };
  const windowStub = {
    location: { pathname: "/transactions", search: "", hash: "" }
  };
  windowStub.location.assign = (url) => assignedUrls.push(url);

  const exports = loadLibModule(path.join("lib", "apiClient.ts"), {
    fetch: fetchImpl,
    Headers,
    FormData,
    window: windowStub,
    document: documentStub
  });

  return { exports, assignedUrls, cookieStore };
}

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

function normalizeNewlines(source) {
  return source.replace(/\r\n/g, "\n");
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

test("v3 API client refreshes an expired access token before failing authenticated requests", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const urlString = String(url);
    calls.push(urlString);
    if (urlString === "/api/data") {
      const attempt = calls.filter((call) => call === "/api/data").length;
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: "Token expired." }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (urlString === "/api/auth/refresh") {
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlString}`);
  };

  const { exports: apiClient } = loadApiClientModule({ fetchImpl });
  const result = await apiClient.apiRequest("/api/data");

  // result is a plain object created in the vm sandbox's own realm, so its
  // prototype differs from this realm's Object.prototype -- compare by
  // value (JSON) rather than reference-equal deepEqual.
  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true }));
  assert.deepEqual(
    calls,
    ["/api/data", "/api/auth/refresh", "/api/data"],
    "a 401 should trigger exactly one refresh, then exactly one retry of the original request"
  );
});

test("v3 API client preserves multipart bodies and retries stale CSRF once", async () => {
  const cookieStore = new Map([["csrf_token", "old-token"]]);
  const calls = [];
  const fetchImpl = async (url, init) => {
    const urlString = String(url);
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    calls.push({
      url: urlString,
      hasContentType: headers.has("Content-Type"),
      csrfHeader: headers.get("X-CSRF-Token")
    });

    if (urlString === "/api/upload") {
      const attempt = calls.filter((call) => call.url === "/api/upload").length;
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: "Session write token expired.", code: "csrf_invalid" }), { status: 403 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (urlString === "/api/me") {
      cookieStore.set("csrf_token", "new-token");
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlString}`);
  };

  const { exports: apiClient } = loadApiClientModule({ fetchImpl, cookieStore });
  const body = new FormData();
  body.append("file", "contents");

  const result = await apiClient.apiRequest("/api/upload", { method: "POST", body });

  assert.equal(JSON.stringify(result), JSON.stringify({ ok: true }));
  const uploadCalls = calls.filter((call) => call.url === "/api/upload");
  assert.equal(uploadCalls.length, 2, "a stale-CSRF 403 should be retried exactly once");
  assert.equal(uploadCalls[0].csrfHeader, "old-token");
  assert.equal(uploadCalls[1].csrfHeader, "new-token", "the retry should use the refreshed CSRF token");
  assert.equal(
    uploadCalls[0].hasContentType,
    false,
    "FormData bodies must not get an explicit Content-Type -- the browser needs to set the multipart boundary itself"
  );
});

test("v3 API client uses a machine-readable CSRF code before the legacy message fallback", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "apiClient.ts"), "utf8");

  assert.match(source, /data\.code === 'csrf_invalid'/);
  assert.match(source, /data\.error === 'CSRF token missing or invalid\.'/);
  assert.doesNotMatch(source, /return\s+data\.error === 'CSRF token missing or invalid\.'/);
});

test("v3 API client keeps CSRF and auth retry sequencing in one helper", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "lib", "apiClient.ts"), "utf8");

  assert.match(source, /async function fetchWithAuthRetry\(url: string, init: RequestInit = \{\}\)/);
  assert.equal((source.match(/fetchWithAuthRetry\(url, init\)/g) || []).length, 2);
  assert.equal((source.match(/await refreshCsrfToken\(\)/g) || []).length, 1);
  assert.equal((source.match(/await refreshAccessToken\(\)/g) || []).length, 1);
});

test("v3 app routes use bare canonical paths and browser back drives page state", () => {
  const source = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");

  assert.doesNotMatch(source, /^(<<<<<<<|=======|>>>>>>>)/m);
  assert.match(source, /return slug \? `\/\$\{slug\}` : '\/transactions'/);
  assert.match(source, /if \(page === 'Landing'\)[\s\S]*return '\/'/);
  assert.doesNotMatch(source, /return slug \? `\/app-v3\/\$\{slug\}`/);
  assert.match(source, /return requestedPage \? getPathForPage\(requestedPage\) : '\/transactions'/);
  assert.match(source, /import \{ normalizeInternalPath, normalizeLegacyAppV3Path, resolvePageFromInternalPath \} from '\.\/lib\/navigation'/);
  assert.match(source, /function replaceLegacyAppV3Path/);
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
  // The cache-busting query string's exact value changes on every legitimate
  // asset update -- what matters is that the favicon points at the current
  // brand mark and carries *some* cache-busting param, not which one.
  assert.match(indexSource, /\/brand\/inex-mark-color\.svg\?v=[\w-]+/);
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

test("v3 pages share modal body-lock behavior through one hook", () => {
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useBodyModalLock.ts"), "utf8");
  const pageSources = readFrontendFiles()
    .filter(({ file }) => file.includes(`${path.sep}pages${path.sep}`))
    .map(({ source }) => source)
    .join("\n");

  assert.match(hookSource, /function useBodyModalLock\(locked: boolean\)/);
  assert.match(hookSource, /document\.body\.classList\.toggle\('modal-is-open', locked\)/);
  assert.match(hookSource, /document\.body\.classList\.remove\('modal-is-open'\)/);
  assert.doesNotMatch(pageSources, /document\.body\.classList\.(toggle|remove)\('modal-is-open'/);
  for (const page of [
    "Accounts.tsx",
    "BusinessWorkspaces.tsx",
    "Categories.tsx",
    "Exports.tsx",
    "Invoices.tsx",
    "Messages.tsx",
    "Mileage.tsx",
    "Receipts.tsx",
    "Transactions.tsx"
  ]) {
    const source = fs.readFileSync(path.join(frontendRoot, "pages", page), "utf8");
    assert.match(source, /useBodyModalLock\(/, `${page} should use the shared modal lock hook`);
  }
});

test("v3 transactions keeps recurring template workflow outside the page controller", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const workflowSource = fs.readFileSync(
    path.join(frontendRoot, "components", "transactions", "RecurringTemplatesWorkflow.tsx"),
    "utf8"
  );

  assert.match(pageSource, /import RecurringTemplatesWorkflow from '\.\.\/components\/transactions\/RecurringTemplatesWorkflow'/);
  assert.match(pageSource, /<RecurringTemplatesWorkflow/);
  assert.doesNotMatch(pageSource, /function RecurringTemplatesPanel/);
  assert.doesNotMatch(pageSource, /function RecurringTemplateModal/);
  assert.match(workflowSource, /export default function RecurringTemplatesWorkflow/);
  assert.match(workflowSource, /function RecurringTemplatesPanel/);
  assert.match(workflowSource, /function RecurringTemplateModal/);
});

test("v3 settings keeps destructive data workflow outside the page controller", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");
  const dataPanelSource = fs.readFileSync(
    path.join(frontendRoot, "components", "settings", "DataSettingsPanel.tsx"),
    "utf8"
  );
  const primitivesSource = fs.readFileSync(
    path.join(frontendRoot, "components", "settings", "SettingsPrimitives.tsx"),
    "utf8"
  );

  assert.match(pageSource, /import DataSettingsPanel from '\.\.\/components\/settings\/DataSettingsPanel'/);
  assert.match(pageSource, /<DataSettingsPanel/);
  assert.doesNotMatch(pageSource, /function DataSettings/);
  assert.doesNotMatch(pageSource, /deleteAllTransactions/);
  assert.doesNotMatch(pageSource, /deleteMyAccount/);
  assert.match(dataPanelSource, /export default function DataSettingsPanel/);
  assert.match(dataPanelSource, /deleteAllTransactions/);
  assert.match(dataPanelSource, /deleteMyAccount/);
  assert.match(primitivesSource, /export function SettingsPanel/);
  assert.match(primitivesSource, /export function Field/);
});

test("v3 transactions keeps review queue and review labels outside the page controller", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const reviewPanelSource = fs.readFileSync(
    path.join(frontendRoot, "components", "transactions", "ReviewQueuePanel.tsx"),
    "utf8"
  );
  const reviewSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionReview.ts"), "utf8");

  assert.match(pageSource, /import ReviewQueuePanel from '\.\.\/components\/transactions\/ReviewQueuePanel'/);
  assert.match(pageSource, /from '\.\.\/lib\/transactionReview'/);
  assert.match(pageSource, /<ReviewQueuePanel/);
  assert.doesNotMatch(pageSource, /function ReviewQueuePanel/);
  assert.doesNotMatch(pageSource, /function reviewText/);
  assert.doesNotMatch(pageSource, /function normalizeReviewLabels/);
  assert.match(reviewPanelSource, /export default function ReviewQueuePanel/);
  assert.match(reviewPanelSource, /Mapping: \{reviewText\(item\.categoryReason\)\}/);
  assert.match(reviewSource, /export function reviewText\(value: unknown\)/);
  assert.match(reviewSource, /export function normalizeReviewLabels/);
  assert.match(reviewSource, /\^mapped\$/i);
});

test("v3 transactions page data orchestration stays in its hook", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useTransactionsPageData.ts"), "utf8");

  assert.match(pageSource, /import useTransactionsPageData from '\.\.\/hooks\/useTransactionsPageData'/);
  assert.match(pageSource, /\} = useTransactionsPageData\(\)/);
  assert.doesNotMatch(pageSource, /loadTransactionPageData/);
  assert.doesNotMatch(pageSource, /loadTransactionUndoStatus/);
  assert.doesNotMatch(pageSource, /loadAccountingLock/);
  assert.doesNotMatch(pageSource, /TRANSACTION_PAGE_SIZE_KEY/);
  assert.match(hookSource, /loadTransactionPageData\(\{/);
  assert.match(hookSource, /loadTransactionUndoStatus/);
  assert.match(hookSource, /loadAccountingLock\(\)\.catch\(\(\) => null\)/);
  assert.match(hookSource, /TRANSACTION_PAGE_SIZE_KEY/);
  assert.match(hookSource, /const refreshRequestSeq = useRef\(0\)/);
  assert.match(hookSource, /requestId !== refreshRequestSeq\.current/);
});

test("v3 messages page data orchestration stays in its hook", () => {
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Messages.tsx"), "utf8");
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useMessagesPageData.ts"), "utf8");

  assert.match(pageSource, /import useMessagesPageData, \{ type ComposeMessagePayload, type MessagesLaneLabel \} from '\.\.\/hooks\/useMessagesPageData'/);
  assert.match(pageSource, /\} = useMessagesPageData\(\)/);
  for (const apiFunction of [
    "loadInboxMessages",
    "loadSentMessages",
    "loadArchivedMessages",
    "loadUnreadCounts",
    "loadMessageThread",
    "markMessageRead",
    "archiveMessage",
    "deleteMessage",
    "replyToMessage",
    "sendGeneralMessage",
    "sendSupportMessage"
  ]) {
    assert.doesNotMatch(pageSource, new RegExp(`\\b${apiFunction}\\b`));
    assert.match(hookSource, new RegExp(`\\b${apiFunction}\\b`));
  }
  assert.match(hookSource, /export type MessagesLaneLabel/);
  assert.match(hookSource, /export type ComposeMessagePayload/);
  assert.match(hookSource, /const refreshRequestSeq = useRef\(0\)/);
  assert.match(hookSource, /const threadRequestSeq = useRef\(0\)/);
  assert.match(hookSource, /requestId !== refreshRequestSeq\.current/);
  assert.match(hookSource, /requestId !== threadRequestSeq\.current/);
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

test("v3 plan feature keys and labels stay aligned with backend catalog", () => {
  const planCatalog = require(path.join(repoRoot, "config", "planCatalog.js"));
  const planApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "planApi.ts"), "utf8");
  const planGateSource = fs.readFileSync(path.join(frontendRoot, "components", "PlanGate.tsx"), "utf8");

  assert.match(planApiSource, /export const PLAN_FEATURE_KEYS = \[/);
  assert.match(planApiSource, /export const PLAN_FEATURE_LABELS: Record<PlanFeatureKey, string> = \{/);
  assert.match(planApiSource, /export type PlanFeatureKey =\s+typeof PLAN_FEATURE_KEYS\[number\]/);
  assert.match(planGateSource, /import \{ PLAN_FEATURE_LABELS, type PlanFeatureKey \} from '\.\.\/lib\/planApi'/);
  assert.doesNotMatch(planGateSource, /const FEATURE_LABELS/);

  for (const [name, featureKey] of Object.entries(planCatalog.FEATURE_KEYS)) {
    assert.match(planApiSource, new RegExp(`['"]${featureKey}['"]`), `frontend is missing FEATURE_KEYS.${name}`);
    assert.match(
      planApiSource,
      new RegExp(`${featureKey}: ['"]${planCatalog.FEATURE_LABELS[featureKey]}['"]`),
      `frontend label for ${featureKey} should match backend catalog`
    );
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
  const translationHookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useV3PhraseTranslations.ts"), "utf8");
  const shellSource = normalizeNewlines(
    fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8")
  );
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
  assert.match(appSource, /useV3PhraseTranslations\(language, currentPage\)/);
  assert.doesNotMatch(appSource, /observeV3PhraseTranslations/);
  assert.doesNotMatch(appSource, /applyV3PhraseTranslations/);
  assert.doesNotMatch(appSource, /document\.getElementById\('root'\)/);
  assert.match(translationHookSource, /observeV3PhraseTranslations\(root, \(\) => languageRef\.current\)/);
  assert.match(translationHookSource, /applyV3PhraseTranslations\(root, language\)/);
  assert.match(translationHookSource, /window\.requestAnimationFrame/);
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
  const appSource = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");
  const transactionsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(shellSource, /loadBusinesses/);
  assert.match(shellSource, /activateBusiness\(business\.id\)/);
  assert.match(shellSource, /getCurrentUser\(\)/);
  assert.doesNotMatch(shellSource, /window\.location\.reload\(\)/);
  assert.match(appSource, /key=\{activeBusinessId\}/);
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

test("v3 app avoids hard reloads for SPA-owned state changes", () => {
  const sources = readFrontendFiles().map(({ source }) => source).join("\n");
  const settingsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");
  const dataSettingsSource = fs.readFileSync(path.join(frontendRoot, "components", "settings", "DataSettingsPanel.tsx"), "utf8");
  const planProviderSource = fs.readFileSync(path.join(frontendRoot, "context", "PlanContext.tsx"), "utf8");

  assert.doesNotMatch(sources, /window\.location\.reload\(\)/);
  assert.doesNotMatch(sources, /location\.reload\(\)/);
  assert.match(dataSettingsSource, /setStatusMessage\(`Deleted \$\{result\.count\} transaction\(s\)\.`\)/);
  assert.doesNotMatch(`${settingsSource}\n${dataSettingsSource}`, /window\.alert\(`Deleted \$\{result\.count\} transaction\(s\)\.`\)/);
  assert.match(planProviderSource, /const currentBusinessId = authUser\?\.currentBusinessId/);
  assert.match(planProviderSource, /\[authUserId, currentBusinessId\]/);
});

test("v3 money formatters use the active business currency on app pages", () => {
  // Regression test: formatMoney/getActiveCurrency used to be redefined
  // independently in each page, which is exactly the duplication that let
  // Invoices.tsx's currency-collapsing bug (every non-CAD currency,
  // including EUR/GBP/AUD, displayed as USD) and
  // RecurringTemplatesWorkflow.tsx's hardcoded 'USD' ship undetected. Both
  // are now sourced from one shared module, lib/money.ts.
  const moneyLibSource = fs.readFileSync(path.join(frontendRoot, "lib", "money.ts"), "utf8");
  const appSource = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");
  assert.match(moneyLibSource, /export function setActiveCurrency/);
  assert.match(moneyLibSource, /export function getActiveCurrency/);
  assert.match(moneyLibSource, /export function formatMoney/);
  assert.doesNotMatch(`${moneyLibSource}\n${appSource}`, /__LUNA_ME__/);
  assert.match(appSource, /setActiveCurrency\(authUser\?\.business\?\.currency\)/);

  const moneyLib = loadLibModule(path.join("lib", "money.ts"));
  moneyLib.setActiveCurrency("eur");
  assert.equal(moneyLib.getActiveCurrency(), "EUR", "active non-CAD business currencies must not be downgraded to USD");
  assert.match(moneyLib.formatMoney(1234), /€/, "default money formatting must use the active business currency");

  for (const page of ["Transactions.tsx", "Analytics.tsx", "Mileage.tsx", "Invoices.tsx", "Exports.tsx"]) {
    const source = fs.readFileSync(path.join(frontendRoot, "pages", page), "utf8");
    assert.match(source, /from '\.\.\/lib\/money'/, `${page} must source formatMoney/getActiveCurrency from the shared lib/money module`);
    assert.doesNotMatch(source, /window\.__LUNA_ME__\?\.business\?\.currency/, `${page} must not re-derive the active currency itself`);
  }

  const recurringWorkflowSource = fs.readFileSync(path.join(frontendRoot, "components", "transactions", "RecurringTemplatesWorkflow.tsx"), "utf8");
  assert.match(recurringWorkflowSource, /from '\.\.\/\.\.\/lib\/money'/);
  assert.doesNotMatch(recurringWorkflowSource, /return 'USD'/, "must not hardcode USD regardless of the business's real currency");

  const invoicesApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "invoicesApi.ts"), "utf8");
  const invoicesSource = fs.readFileSync(path.join(frontendRoot, "pages", "Invoices.tsx"), "utf8");
  const invoicesApi = loadLibModule(path.join("lib", "invoicesApi.ts"), {
    require(specifier) {
      if (specifier === "./apiClient") {
        return { apiRequest: async () => { throw new Error("apiRequest should not be called"); } };
      }
      if (specifier === "./money") {
        return moneyLib;
      }
      throw new Error(`Unexpected require('${specifier}')`);
    }
  });

  assert.match(invoicesApiSource, /blankInvoiceDraft\(currency = 'USD'\)/);
  assert.doesNotMatch(invoicesApiSource, /currency\.toUpperCase\(\) === 'CAD' \? 'CAD' : 'USD'/);
  assert.equal(invoicesApi.blankInvoiceDraft("EUR").currency, "EUR", "new invoice drafts must preserve supported non-CAD currencies");
  const mapStatusMatch = invoicesApiSource.match(/function mapStatus[\s\S]*?\n}/);
  assert.ok(mapStatusMatch, "invoicesApi.ts should define mapStatus");
  assert.match(mapStatusMatch[0], /normalized === 'overdue'/);
  assert.doesNotMatch(mapStatusMatch[0], /new Date\(/);
  assert.doesNotMatch(mapStatusMatch[0], /dueDate|due_date/);
  assert.match(invoicesSource, /blankInvoiceDraft\(currency\)/);
  assert.doesNotMatch(invoicesSource, /function formatMoney\(value: number, currency = 'USD'\)/);
});

test("v3 attachment pickers share one hook and one limit contract", () => {
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useFileAttachments.ts"), "utf8");
  const messagesSource = fs.readFileSync(path.join(frontendRoot, "pages", "Messages.tsx"), "utf8");
  const invoicesSource = fs.readFileSync(path.join(frontendRoot, "pages", "Invoices.tsx"), "utf8");

  assert.match(hookSource, /export const MAX_FILE_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(hookSource, /export const MAX_FILE_ATTACHMENTS = 5/);
  assert.match(messagesSource, /import useFileAttachments from '\.\.\/hooks\/useFileAttachments'/);
  assert.match(invoicesSource, /import useFileAttachments from '\.\.\/hooks\/useFileAttachments'/);
  assert.equal((messagesSource.match(/useFileAttachments\(\)/g) || []).length, 2);
  assert.equal((invoicesSource.match(/useFileAttachments\(\)/g) || []).length, 1);
  assert.doesNotMatch(`${messagesSource}\n${invoicesSource}`, /MAX_(?:REPLY|MESSAGE|INVOICE)_ATTACH/);
  assert.doesNotMatch(`${messagesSource}\n${invoicesSource}`, /10 \* 1024 \* 1024/);
});

test("v3 shared utility modules replace page-local CSV, download, pagination, and Canada helpers", () => {
  const pages = {
    Subscription: fs.readFileSync(path.join(frontendRoot, "pages", "Subscription.tsx"), "utf8"),
    Analytics: fs.readFileSync(path.join(frontendRoot, "pages", "Analytics.tsx"), "utf8"),
    Transactions: fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8"),
    Mileage: fs.readFileSync(path.join(frontendRoot, "pages", "Mileage.tsx"), "utf8"),
    Invoices: fs.readFileSync(path.join(frontendRoot, "pages", "Invoices.tsx"), "utf8"),
    AppShell: fs.readFileSync(path.join(frontendRoot, "components", "AppShell.tsx"), "utf8")
  };

  assert.doesNotMatch(pages.Subscription, /function csvCell/);
  assert.doesNotMatch(pages.Analytics, /function csvCell/);
  assert.match(pages.Subscription, /from '\.\.\/lib\/browserDownload'/);
  assert.match(pages.Analytics, /from '\.\.\/lib\/browserDownload'/);
  assert.match(pages.Transactions, /from '\.\.\/lib\/pagination'/);
  assert.match(pages.Mileage, /from '\.\.\/lib\/pagination'/);
  assert.match(pages.Invoices, /from '\.\.\/lib\/pagination'/);
  assert.doesNotMatch(pages.Transactions, /function getPaginationPages/);
  assert.doesNotMatch(pages.Mileage, /function getPaginationPages/);
  assert.doesNotMatch(pages.Invoices, /function getPaginationPages/);
  assert.match(pages.Mileage, /from '\.\.\/lib\/businessLocale'/);
  assert.match(pages.AppShell, /from '\.\.\/lib\/businessLocale'/);
  assert.doesNotMatch(pages.Mileage, /function isCanadaBusiness/);
  assert.doesNotMatch(pages.AppShell, /function isCanadaBusiness/);
});

test("browser download, pagination, and business locale helpers preserve behavior", () => {
  const clickedDownloads = [];
  const browserDownload = loadLibModule(path.join("lib", "browserDownload.ts"), {
    Blob,
    URL: {
      createObjectURL(blob) {
        assert.ok(blob instanceof Blob);
        return "blob:test-download";
      },
      revokeObjectURL(url) {
        assert.equal(url, "blob:test-download");
      }
    },
    document: {
      body: {
        appendChild(anchor) {
          anchor.appended = true;
        }
      },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return {
          href: "",
          download: "",
          click() {
            clickedDownloads.push({ href: this.href, download: this.download, appended: this.appended === true });
          },
          remove() {
            this.removed = true;
          }
        };
      }
    }
  });
  const pagination = loadLibModule(path.join("lib", "pagination.ts"));
  const businessLocale = loadLibModule(path.join("lib", "businessLocale.ts"));

  assert.equal(
    browserDownload.buildCsv([["plain", "has,comma"], ["has\"quote", "line\nbreak"]]),
    'plain,"has,comma"\n"has""quote","line\nbreak"'
  );
  browserDownload.downloadCsv([["Name"], ["InEx"]], "report.csv");
  assert.deepEqual(clickedDownloads, [{ href: "blob:test-download", download: "report.csv", appended: true }]);
  assert.deepEqual(Array.from(pagination.getPaginationPages(5, 10)), [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  assert.equal(businessLocale.isCanadaBusiness("CA", "USD"), true);
  assert.equal(businessLocale.isCanadaBusiness("US", "CAD"), true);
  assert.equal(businessLocale.isCanadaBusiness("US", "USD"), false);
});

test("v3 settings normalizes business profile fields before saving", () => {
  const settingsApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "settingsApi.ts"), "utf8");
  const settingsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");
  const primitivesSource = fs.readFileSync(path.join(frontendRoot, "components", "settings", "SettingsPrimitives.tsx"), "utf8");
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
  assert.match(primitivesSource, /settings-field-error/);
  assert.doesNotMatch(settingsSource, /type="date"[\s\S]*Fiscal year start/);
  assert.match(cssSource, /\.settings-field\.is-invalid/);
});

test("v3 theme remains light-only until dark mode is redesigned", () => {
  const appSource = fs.readFileSync(path.join(frontendRoot, "App.tsx"), "utf8");
  const settingsSource = fs.readFileSync(path.join(frontendRoot, "pages", "Settings.tsx"), "utf8");

  assert.match(appSource, /export type ThemeMode = 'light'/);
  assert.match(appSource, /const theme: ThemeMode = 'light'/);
  assert.match(appSource, /localStorage\.setItem\('inex-theme', 'light'\)/);
  assert.doesNotMatch(appSource, /setTheme:/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\('inex-theme'\) === 'dark'/);
  assert.doesNotMatch(settingsSource, /options=\{\['Light', 'Dark'\]\}/);
  assert.doesNotMatch(settingsSource, /setTheme\(value === 'Dark'/);
  assert.match(settingsSource, /<Field label="Theme" value="Light" readOnly \/>/);
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
  assert.match(pageSource, /RecurringTemplatesWorkflow/);
  assert.match(pageSource, /Manage categories\.\.\./);
  assert.doesNotMatch(pageSource, /Tax set-aside helper/);
  assert.doesNotMatch(pageSource, /Not connected yet/);
});

test("v3 transactions render review reasons safely and wire filter date range plus category handoff", () => {
  const apiSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionsApi.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(frontendRoot, "pages", "Transactions.tsx"), "utf8");
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useTransactionsPageData.ts"), "utf8");
  const reviewSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionReview.ts"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(apiSource, /categoryReason\?: unknown/);
  assert.match(reviewSource, /function reviewText\(value: unknown\)/);
  assert.match(reviewSource, /reviewText\(record\.summary\)/);
  assert.doesNotMatch(pageSource, /\{reviewItem\.supportSummary \|\| reviewItem\.reviewNotes \|\| reviewItem\.categoryReason\}/);
  assert.match(apiSource, /start_date/);
  assert.match(apiSource, /end_date/);
  assert.match(apiSource, /params\.set\('account_id', filters\.accountId\)/);
  assert.match(apiSource, /params\.set\('category_id', filters\.categoryId\)/);
  assert.doesNotMatch(apiSource, /params\.set\('account_name'/);
  assert.doesNotMatch(apiSource, /params\.set\('category_name'/);
  assert.doesNotMatch(apiSource, /transactions\.data\.length\)/);
  assert.match(hookSource, /loadTransactionPageData\(\{/);
  assert.match(hookSource, /limit: pageSize/);
  assert.match(hookSource, /offset: \(currentPage - 1\) \* pageSize/);
  assert.match(hookSource, /categoryId: categoryFilter/);
  assert.match(hookSource, /accountId: accountFilter/);
  assert.match(hookSource, /function updateFilter/);
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
  const reviewPanelSource = fs.readFileSync(path.join(frontendRoot, "components", "transactions", "ReviewQueuePanel.tsx"), "utf8");
  const reviewSource = fs.readFileSync(path.join(frontendRoot, "lib", "transactionReview.ts"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(apiSource, /\/api\/categories\?limit=500&offset=0&include_inactive=true/);
  assert.match(apiSource, /function mapCategoryOption/);
  assert.match(apiSource, /category\.is_active !== false/);
  assert.match(reviewSource, /function normalizeReviewLabels/);
  assert.match(reviewSource, /function canonicalReviewLabelForIssueCode/);
  assert.match(reviewSource, /\^mapped\$/i);
  const reviewLib = loadLibModule(path.join("lib", "transactionReview.ts"));
  assert.deepEqual(
    reviewLib.reviewLabelsFor({
      description: "Fuel purchase",
      reviewIssues: [{
        issueLabels: [],
        issueEntries: [
          { issueCode: "needs_category", label: "Backend wording changed" },
          { issueCode: "needs_receipt_support", label: "Attach evidence wording changed" },
          { issueCode: "final_confirmation_needed", label: "Confirm wording changed" }
        ]
      }]
    }),
    ["Tax mapping needed", "Receipt or support missing", "Final confirmation needed"]
  );
  assert.match(reviewPanelSource, /Mapping: \{reviewText\(item\.categoryReason\)\}/);
  assert.match(pageSource, /tax-profile-note/);
  assert.match(cssSource, /\.tax-profile-note/);
});

test("v3 transactions no longer compute their own estimated-tax dollar figure from hardcoded rates", () => {
  // Regression test: resolveEstimatedTaxProfile used to hardcode a flat 28%
  // US rate and a per-province Canadian rate table, and Transactions.tsx
  // multiplied that rate against the page's net total to produce an
  // "estimated tax" dollar figure -- independent of, and inconsistent
  // with, the backend's real se_tax_estimate shown on Analytics. The
  // dollar estimate now comes from lib/analyticsApi.ts's loadTaxSetAside()
  // (backend-sourced) instead; resolveEstimatedTaxProfile only derives the
  // display label (region/province naming), not a rate or dollar amount.
  const { resolveEstimatedTaxProfile } = loadLibModule(path.join("lib", "transactionsApi.ts"), {
    require(specifier) {
      if (specifier === "./apiClient") {
        return { apiRequest: async () => { throw new Error("apiRequest should not be called"); } };
      }
      if (specifier === "./categoriesApi") {
        return { getTaxLineOptions: () => [] };
      }
      throw new Error(`Unexpected require('${specifier}')`);
    }
  });

  const abProfile = resolveEstimatedTaxProfile({ region: "CA", province: "AB" });
  assert.equal(abProfile.region, "CA");
  assert.equal(abProfile.province, "AB");
  assert.equal(abProfile.label, "AB tax estimate");
  assert.equal("rate" in abProfile, false, "resolveEstimatedTaxProfile must not compute a client-side tax rate");
  assert.equal("note" in abProfile, false, "resolveEstimatedTaxProfile must not fabricate a rate-describing note");

  const usProfile = resolveEstimatedTaxProfile({ region: "US" });
  assert.equal(usProfile.label, "US Schedule C estimate");

  const analyticsApiSource = fs.readFileSync(path.join(frontendRoot, "lib", "analyticsApi.ts"), "utf8");
  assert.match(analyticsApiSource, /export async function loadTaxSetAside/, "the real backend-sourced tax estimate must be exported for reuse");

  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useTransactionsPageData.ts"), "utf8");
  assert.match(hookSource, /loadTaxSetAside/, "Transactions page data must source its tax estimate from the backend, not a local computation");
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
  // The exact debounce delay and ref name are tuning/implementation
  // details -- what actually needs protecting is that the search is
  // debounced at all, and that stale (out-of-order) responses are
  // discarded via a ref-based sequence guard rather than applied blindly.
  assert.match(
    pageSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*?\}, \d+\)/,
    "transaction search should stay debounced with window.setTimeout"
  );
  assert.match(
    pageSource,
    /\w+Ref\.current === sequence/,
    "stale search responses should be discarded via a ref-based sequence guard"
  );
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
  const hookSource = fs.readFileSync(path.join(frontendRoot, "hooks", "useTransactionsPageData.ts"), "utf8");
  const cssSource = fs.readFileSync(path.join(frontendRoot, "styles", "index.css"), "utf8");

  assert.match(hookSource, /loadAccountingLock/);
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
  const workflow = normalizeNewlines(
    fs.readFileSync(path.join(repoRoot, "..", ".github", "workflows", "phase7-guardrails.yml"), "utf8")
  );

  assert.match(workflow, /Install frontend v3 dependencies/);
  assert.match(workflow, /working-directory: In-Ex-Ledger-API\/frontend-v3[\s\S]*run: npm ci/);
  assert.match(workflow, /Lint frontend v3[\s\S]*run: npm run lint/);
  assert.match(workflow, /Type-check frontend v3[\s\S]*run: npx tsc -b --noEmit/);
  assert.match(workflow, /Check frontend v3 i18n catalog[\s\S]*run: npm run i18n:v3:check/);
  assert.match(workflow, /Build frontend v3[\s\S]*run: npm run build:frontend-v3/);
});

test("legacy auth defaults avoid rapid v3 session expiry and refresh throttling", () => {
  // auth.middleware.js's default JWT expiry is a plain Node module (not
  // TS/React), so it costs nothing to require it directly and check the
  // real signed-token lifetime instead of pattern-matching its source.
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  const authMiddlewarePath = require.resolve(path.join(repoRoot, "middleware", "auth.middleware.js"));
  delete require.cache[authMiddlewarePath];
  const { signToken } = require(authMiddlewarePath);
  const jwt = require(path.join(repoRoot, "node_modules", "jsonwebtoken"));

  const token = signToken({ sub: "test-user" });
  const decoded = jwt.decode(token);
  const expirySeconds = decoded.exp - decoded.iat;
  assert.ok(
    expirySeconds >= 30 * 60,
    `JWT access tokens should last at least 30 minutes by default to avoid rapid v3 session expiry, got ${expirySeconds}s`
  );

  const authCookieService = require(path.join(repoRoot, "services", "authCookieService.js"));
  const defaultAccessTokenSeconds = authCookieService.ACCESS_TOKEN_EXPIRY_SECONDS;
  assert.ok(
    defaultAccessTokenSeconds >= 30 * 60,
    `the access-token cookie's default maxAge should last at least 30 minutes, got ${defaultAccessTokenSeconds}s`
  );

  // rateLimitTiers.js's refresh-endpoint limit is not exported, so this stays
  // a source check on numeric magnitude rather than exact formatting.
  const rateLimitTiers = fs.readFileSync(path.join(repoRoot, "middleware", "rateLimitTiers.js"), "utf8");
  const refreshLimiterMatch = rateLimitTiers.match(/max:\s*(\d+)[\s\S]{0,80}keyPrefix:\s*"rl:refresh"/);
  assert.ok(refreshLimiterMatch, "rateLimitTiers.js should define a refresh-endpoint rate limit");
  assert.ok(
    Number(refreshLimiterMatch[1]) >= 60,
    `the refresh endpoint's rate limit should be generous enough to avoid throttling normal session refresh traffic, got max=${refreshLimiterMatch[1]}`
  );
});
