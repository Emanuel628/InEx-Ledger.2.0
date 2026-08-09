# Codebase 100% Audit Baseline - 2026-08-09

Branch: `audit/codebase-review`
Base commit: `b340d8b31b99144211280d0bc84c523af957a992`
Starting tree state: clean

## Scope Rules

The review checklist is based on `git ls-files`, not the raw filesystem. This keeps the audit safe and reproducible.

Included:

- Application source, tests, migrations, scripts, docs, config, CI, Docker/Nixpacks, package manifests, lockfiles, tracked static assets, and deployment worker code.
- Legacy app files are included because they are tracked and may still be served for marketing/SEO or gated pages.
- Generated frontend bundle files under `In-Ex-Ledger-API/public/app-v3` are included as generated artifacts, but cleanup should happen in `frontend-v3/src` and then rebuild intentionally.

Excluded from code-quality review unless explicitly needed:

- `.git/`
- `node_modules/`
- local `.env` files
- logs such as `*.log`
- local browser/test scratch directories
- runtime storage
- Playwright `test-results`

Tracked source inventory:

- Total tracked files: 728
- `In-Ex-Ledger-API`: 659 files
- `Docs`: 27 files
- `Work-Completed`: 12 files
- `pdf-worker`: 7 files
- `Work-To-Do`: 7 files
- `Work-Review`: 3 files before this report
- `.github`: 3 files

Tracked generated/binary/lockfile count requiring separate treatment: 38.
Tracked legacy HTML files: 31.

## Checks Run

Passed:

- `npm run lint` in `In-Ex-Ledger-API/frontend-v3`
- `npm run i18n:v3:check` in `In-Ex-Ledger-API`
- `npm run log_scan` in `In-Ex-Ledger-API` completed with `Log directory not found: ./logs`

Blocked:

- `npm run migrations:verify-checksums` failed because local Postgres is not listening on `localhost:5432`.

Failed:

- `npm audit --omit=dev --audit-level=high` in `In-Ex-Ledger-API`
- `npm audit --omit=dev --audit-level=high` in `In-Ex-Ledger-API/frontend-v3`
- `npm audit --omit=dev --audit-level=high` in `pdf-worker`
- `npm run test:all` in `In-Ex-Ledger-API`

## Initial Findings

### High - Dependency Audit Failures

Evidence:

- Backend `npm audit` reports high-severity advisories for `ip-address`.
- `npm ls ip-address --all` shows the dependency comes through `express-rate-limit@8.5.2 -> ip-address@10.2.0`.
- Frontend `npm audit` reports high-severity `nanoid`.
- `npm ls nanoid --all` shows the dependency comes through `vite@8.1.5 -> postcss@8.5.23 -> nanoid@3.3.16`.
- `pdf-worker` audit reports Express-related advisories, while `npm ls` shows patched installed package versions. This needs lockfile/package metadata verification before changing anything.

Impact:

- CI dependency-security workflow only audits `In-Ex-Ledger-API`, not `frontend-v3` or `pdf-worker`, so current coverage is incomplete.

Suggested fix:

- Update dependency trees in small, isolated batches.
- Extend dependency CI to audit all package roots.
- Run full tests after each dependency update.

### High - `test:all` Is Failing

Evidence:

- `npm run test:all` fails.
- Focused rerun `node --test tests/frontendV3Wiring.test.js` fails one test: `v3 shell has an SPA-owned i18n runtime wired to business language`.
- The failing assertion expects `AppShell.tsx` formatting/source shape matching `/\n {2}language,\n/`, but the actual destructuring has CRLF line endings. This may be brittle test coupling rather than a product bug.

Impact:

- The advertised full guardrail suite is not green locally.
- If CI runs with the same line-ending/source shape, pull requests can fail on a low-value assertion.

Suggested fix:

- Make the test assert behavior/ownership more robustly instead of matching exact whitespace.
- Then rerun `npm run test:all`.

### Medium - Disconnected PDF Worker Surface

Evidence:

- `services/pdfWorkerClient.js` exports `dispatchPdfJob`.
- No tracked source imports `dispatchPdfJob` or `pdfWorkerClient`.
- `routes/exports.routes.js` calls `generatePdfExportPair` directly.
- `pdf-worker/index.js` implements a `/generate` endpoint and returns base64 fields named `fullPdf` and `redactedPdf`.

Impact:

- The repo contains a deployable worker and deployment docs that appear production-relevant but are not wired into the main export path.
- This is operationally misleading and increases maintenance surface.

Suggested fix:

- Decide whether the worker is retired or should be reconnected.
- If retired, remove worker deployment docs/client code in a dedicated cleanup batch.
- If active, add integration wiring and tests proving the worker returns real PDF bytes.

### Medium - Oversized Owner Files

Evidence:

- `In-Ex-Ledger-API/public/js/i18n.js`: 7,812 lines
- `In-Ex-Ledger-API/public/js/transactions.js`: 5,257 lines
- `In-Ex-Ledger-API/public/css/pages/transactions.css`: 4,823 lines
- `In-Ex-Ledger-API/frontend-v3/src/styles/index.css`: 4,579 lines
- `In-Ex-Ledger-API/services/pdfGeneratorService.js`: 2,850 lines
- `In-Ex-Ledger-API/routes/transactions.routes.js`: 2,573 lines
- `In-Ex-Ledger-API/routes/auth.routes.js`: 2,347 lines

Impact:

- These files are expensive to review, easy to regress, and likely contain mixed responsibilities.
- This is a prime overengineering/professionalism audit area, but not a reason for immediate broad refactoring.

Suggested fix:

- Add characterization tests before any extraction.
- Split only around clear seams: pure formatting helpers, validation helpers, route handlers, and translation data.

### Medium - Encoding/Mojibake Risk

Evidence:

- Source scans show mojibake or non-ASCII rendering in tracked files, especially `db.js` and `services/exportOrchestrationService.js`.
- Example visible artifacts include `â€”`, `â†’`, and `â”€` in comments/strings.

Impact:

- In comments this is professionalism debt.
- In user-visible strings or generated reports it becomes product quality debt.

Suggested fix:

- Classify matches as comments, test output, docs, or runtime/user-visible strings.
- Fix user-visible/runtime strings first.

### Medium - Raw Console Logging In Runtime Code

Evidence:

- `In-Ex-Ledger-API/db.js` logs database SSL/migration status through `console.log`.
- Most runtime code otherwise uses `utils/logger.js`.

Impact:

- Mixed logging paths make production log hygiene and redaction harder.

Suggested fix:

- Route startup/migration diagnostics through the structured logger where practical.

### Low/Medium - Silent Catch Blocks

Evidence:

- Source scan found silent catches in legacy frontend scripts, public JS, and a few service helpers.

Impact:

- Some are acceptable browser-storage fallbacks.
- Others may hide real failure states from users or tests.

Suggested fix:

- Classify each silent catch by context.
- Keep storage/feature-detection fallbacks when intentional.
- Replace swallowed business-flow errors with visible state or structured debug logging.

## Next Audit Pass

1. Build a complete tracked-file checklist grouped by source area.
2. Review all route files for duplicated validation, ownership leaks, and swallowed errors.
3. Review all services for one-use abstractions, disconnected modules, and overly broad responsibilities.
4. Review frontend v3 page/component files for duplicate state machines, oversized components, and user-facing polish gaps.
5. Review legacy public HTML/JS/CSS and decide what is still production-owned versus retirement debt.
6. Review docs/work trackers for stale claims that contradict code.
7. Produce the full risk-ranked report before any cleanup batches.

## Pass 2 - Backend Route/Service Inventory

Grouped tracked-file checklist, excluding local artifacts and treating generated/binary/lockfiles separately:

- `tests`: 132 files
- `root-config-and-other`: 109 files
- `migrations`: 101 files
- `api-services`: 61 files
- `legacy-public-css`: 50 files
- `legacy-public-js`: 49 files
- `api-routes`: 41 files
- `legacy-html`: 31 files
- `frontend-pages`: 30 files
- `docs`: 27 files
- `work-trackers`: 22 files
- `frontend-lib`: 20 files
- `frontend-components`: 8 files
- `pdf-worker`: 6 files
- `ci`: 3 files

### Medium - Route Layer Is Carrying Too Many Responsibilities

Evidence from route metrics:

- `In-Ex-Ledger-API/routes/transactions.routes.js`: 2,815 measured lines, 20 route handlers, 31 direct SQL calls, 33 log calls.
- `In-Ex-Ledger-API/routes/auth.routes.js`: 2,635 measured lines, 24 route handlers, 58 direct SQL calls, 56 log calls, 13 Resend/email references.
- `In-Ex-Ledger-API/routes/billing.routes.js`: 1,982 measured lines, 15 route handlers, 288 Stripe references, 47 log calls, 9 Resend/email references.
- `In-Ex-Ledger-API/routes/exports.routes.js`: 1,777 measured lines, 11 route handlers, 28 direct SQL calls.
- `In-Ex-Ledger-API/routes/messages.routes.js`: 1,307 measured lines, 15 route handlers, 32 direct SQL calls, 25 Resend/email references.

Impact:

- These route files mix HTTP handling, validation, SQL, business rules, side-effect orchestration, logging, and third-party integration.
- This is not automatically wrong, but it raises the cost of review and increases the chance that changes bypass shared policy.

Suggested fix:

- Do not mass-refactor.
- For each high-change route, extract only stable units with tests first: validation helpers, query builders, side-effect services, and Stripe/Resend adapters.

### Medium - Resend Client/From-Address Plumbing Is Duplicated

Evidence:

- Resend client setup appears in `auth.routes.js`, `businesses.routes.js`, `billing.routes.js`, `email.routes.js`, `invoices-v1.routes.js`, `messages.routes.js`, `supportEmail.routes.js`, `bookkeepingEmailService.js`, `emailReminderService.js`, `exportEmailService.js`, `invoiceOwnerEmailService.js`, `privacyEmailService.js`, and `usageLimitEmailService.js`.
- Several files separately compute fallback sender addresses from `RESEND_FROM_EMAIL` / `EMAIL_FROM`.

Impact:

- Configuration behavior can drift between flows.
- Error handling and missing-key behavior are inconsistent across transactional email paths.

Suggested fix:

- Add one small `resendClient`/email transport helper and migrate call sites gradually.
- Keep email content builders separate from delivery transport.

### High - App Supports Spanish UI But Transactional Email Falls Back To English

Evidence:

- `In-Ex-Ledger-API/frontend-v3/src/lib/i18n.ts` declares `AppLanguage = 'en' | 'es' | 'fr'`.
- `In-Ex-Ledger-API/services/emailI18nService.js` declares `SUPPORTED = new Set(["en", "fr"])`.
- Every `build*Email` function normalizes through `normalizeEmailLang`, so `es` becomes `en`.

Impact:

- Spanish-language users can use the app in Spanish but receive account, billing, MFA, invoice, privacy, and export emails in English.
- This is product-quality drift, not just implementation style.

Suggested fix:

- Either add Spanish transactional email coverage or remove Spanish as a persisted business/email preference until emails support it.
- Add tests that verify every supported app language is either supported by email or explicitly documented as falling back.

### High - Docs Claim PDF Worker Owns Exports, But Code Generates PDFs In-Process

Evidence:

- `Docs/ACCOUNTING_TRUST_RULES.md` says PDF exports are generated by the `pdf-worker` service.
- `Docs/RUNBOOK.md`, `Docs/SECURITY.md`, `pdf-worker/README.md`, and `pdf-worker/DEPLOYMENT.md` document live worker deployment and verification.
- `In-Ex-Ledger-API/services/pdfWorkerClient.js` exports `dispatchPdfJob`, but no tracked source imports it.
- `In-Ex-Ledger-API/routes/exports.routes.js` imports `generatePdfExportPair` and calls it directly at the export endpoints.

Impact:

- Security/operations docs overstate isolation guarantees.
- A reviewer or operator could believe tax-ID handling runs in an isolated worker when the current code path does not.

Suggested fix:

- Treat this as a product/security documentation correction first.
- Then decide whether to wire the worker back in or retire it and remove stale deployment claims.

### Medium - Email Translation File Is A Monolith

Evidence:

- `In-Ex-Ledger-API/services/emailI18nService.js` is 1,452 measured lines.
- It contains language selection, HTML escaping, URL sanitation, user-language DB lookup, shared HTML layout, and every transactional email copy table.

Impact:

- Adding one email or one language requires editing a very large, high-blast-radius file.
- Copy review, localization review, and code review are tightly coupled.

Suggested fix:

- Extract copy data by domain or language only after adding coverage around existing generated subjects/text bodies.
- Keep `escapeHtml`, `sanitizeHttpUrl`, and language normalization as a small shared module.

## Pass 3 - Frontend V3 Audit

Additional checks run:

- `npx tsc -b --noEmit` in `In-Ex-Ledger-API/frontend-v3`: passed.

Frontend v3 tracked source hotspots:

- `frontend-v3/src/styles/index.css`: 5,353 measured lines.
- `frontend-v3/src/lib/i18nPhrases.ts`: 3,392 measured lines, generated.
- `frontend-v3/src/pages/Transactions.tsx`: 1,781 measured lines, 28 `useState` calls, 42 detected functions, 15 detected components.
- `frontend-v3/src/pages/Settings.tsx`: 1,015 measured lines, 33 `useState` calls, 31 detected functions, 15 detected components.
- `frontend-v3/src/pages/Messages.tsx`: 765 measured lines.
- `frontend-v3/src/pages/Mileage.tsx`: 733 measured lines.
- `frontend-v3/src/pages/BusinessWorkspaces.tsx`: 652 measured lines.
- `frontend-v3/src/pages/Invoices.tsx`: 625 measured lines.
- `frontend-v3/src/App.tsx`: 582 measured lines.
- `frontend-v3/src/lib/transactionsApi.ts`: 539 measured lines.

### Medium - Frontend Page Components Are Becoming Route-Sized Controllers

Evidence:

- `Transactions.tsx` owns data loading, pagination, filters, drawers, receipt upload handoff, recurring templates, undo state, lock checks, review queue state, and page-size persistence.
- `Settings.tsx` owns account profile, business profile, billing redirects, MFA, privacy settings, accounting lock, account export, delete-all transactions, and account deletion flows.
- Both files contain many local states and nested helper components/functions.

Impact:

- The v3 frontend has repeated the backend route-file pattern: pages are becoming large owner files that combine data fetching, workflow orchestration, validation, and rendering.
- This makes UI regressions likely when touching unrelated flows on the same page.

Suggested fix:

- Avoid broad component splitting now.
- First extract stable custom hooks by workflow: `useTransactionsPageData`, `useTransactionModals`, `useSettingsBusinessProfile`, `useSettingsSecurity`, etc.
- Keep extracted hooks covered by existing page wiring tests or add focused unit tests around pure helpers.

### Medium - Translation Runtime Mutates Rendered DOM After React Render

Evidence:

- `frontend-v3/src/lib/i18n.ts` uses `MutationObserver`, `document.createTreeWalker`, text-node caches, and attribute rewriting to translate visible text after render.
- `frontend-v3/src/lib/i18nPhrases.ts` is generated and currently contains 1,126 phrases across `en`, `es`, and `fr`.
- The generator preserves existing translations and falls back newly added `es`/`fr` entries to English.

Impact:

- This is a brittle i18n strategy for a React app because rendered output is changed outside React's normal data flow.
- Newly added copy can silently ship untranslated in Spanish/French while still passing catalog freshness.
- Dynamic strings may be missed, overmatched, or translated at unexpected times.

Suggested fix:

- Keep the current runtime until a safer migration exists.
- For new/edited v3 components, prefer typed translation keys or local copy objects instead of relying on phrase scraping.
- Add a stricter untranslated-phrase check for `es`/`fr` if full localization is a product requirement.

### Medium - Frontend Styling Is Centralized In One Large File

Evidence:

- `frontend-v3/src/styles/index.css` is 5,353 measured lines.
- It contains app shell, public pages, page layouts, transactional surfaces, drawers/modals, tables, filters, and responsive behavior.
- Only four `@media` blocks were detected, so a lot of responsive behavior is likely handled through broad selectors rather than page-local styles.

Impact:

- CSS changes have a large blast radius.
- Page-specific styling is harder to delete when pages evolve.
- This creates a professionalism risk where visual fixes accumulate as selectors instead of design-system primitives.

Suggested fix:

- Do not run a formatter or split CSS mechanically.
- During feature work, move stable clusters into scoped CSS files by owner area: shell, public, forms/modals, transactions, settings, messages.
- Add visual regression checks before moving high-use selectors.

### Low/Medium - Full Page Reloads Remain In SPA Workflows

Evidence:

- `AppShell.tsx` calls `window.location.reload()` after business switch.
- `Settings.tsx` calls `window.location.reload()` after a destructive settings/data flow.

Impact:

- Reloads are sometimes pragmatic, but they bypass SPA state ownership and can mask missing invalidation paths.
- They also make user experience rougher and can hide race conditions in tests.

Suggested fix:

- Keep reloads until business-switch/account-state invalidation is understood.
- Replace with explicit state refresh once the relevant API/cache ownership is clear.

### Medium - ESLint Coverage Is Too Light For Current Frontend Size

Evidence:

- `frontend-v3/eslint.config.js` uses `@eslint/js` recommended and `typescript-eslint` recommended.
- It does not include React accessibility rules, React hooks rules beyond what TypeScript config may catch, import boundaries, or type-aware strictness.
- `npm run lint` passes, but a passing result therefore has limited meaning for UI correctness.

Impact:

- Common professional frontend issues can pass lint: missing labels, weak keyboard/modal behavior, hook dependency mistakes, and unsafe UI patterns.

Suggested fix:

- Add lint rules gradually and warning-first.
- Prioritize `eslint-plugin-jsx-a11y`, explicit React hooks coverage, and no-floating-promises style checks where compatible with the project.

### Low/Medium - Unsaved-Changes Detection Uses `JSON.stringify`

Evidence:

- `Settings.tsx` compares `businessProfile` and `privacySettings` to originals through `JSON.stringify`.

Impact:

- This works only while object shape/order is stable.
- It is fragile if API responses add unordered fields, defaults, or nested values.

Suggested fix:

- Replace with explicit dirty checks for fields shown in the form.
- This should be low-risk and can be handled in a small cleanup batch.

### Low/Medium - Modal Body Class Ownership Is Duplicated

Evidence:

- Multiple pages directly toggle `document.body.classList` for `modal-is-open`: `Accounts`, `BusinessWorkspaces`, `Categories`, `Exports`, `Invoices`, `Messages`, `Mileage`, `Receipts`, and `Transactions`.

Impact:

- Multiple open modal states across nested components can fight over the same global body class.
- This is manageable today but fragile as dialogs increase.

Suggested fix:

- Add a small shared `useBodyModalOpen(isOpen)` hook with reference-count semantics if overlapping modals become possible.

## Pass 4 - Public Static Surface And Archived Legacy Frontend

Status:

- Read-only.
- No source files changed.
- Clarification applied: `In-Ex-Ledger-API/legacy/public-html` is archived reference material, not the active frontend.
- Active product UI remains `In-Ex-Ledger-API/frontend-v3`, built to `In-Ex-Ledger-API/public/app-v3`.

### Medium - Archived Legacy Frontend Needs Stronger Guardrails

Evidence:

- `README.md` states the v3 SPA is the canonical logged-in product experience.
- `Docs/V3_ROUTE_INVENTORY.md` states Phase 2 is complete and old app-core HTML is archived under `In-Ex-Ledger-API/legacy/public-html/app-core`.
- `server.js` mounts `publicDir` and `public/html`; it does not mount `legacy/public-html` as a static root.
- Tests also refer to the legacy HTML as archived: `tests/v3LegacyHtmlRetirement.test.js`.

Impact:

- The archived legacy frontend is correctly separated from active routing, but it is large enough to confuse future reviewers or contributors.
- If someone scans the repo without route context, old app patterns can be mistaken for current production code.
- This is a professionalism/governance issue, not a request to rewire legacy code.

Suggested fix:

- Add an explicit `README.md` inside `In-Ex-Ledger-API/legacy/public-html` stating it is reference-only archived code.
- State that changes should not be made there unless preserving historical parity or intentionally deleting archived material.
- Keep active frontend review focused on `frontend-v3/src`.

### Medium - Bundle Drift Check Is Too Narrow

Evidence:

- `node scripts/check-bundle-drift.js` passed with: `checked 15 HTML file(s), 0 script reference(s), no drift detected`.
- The script checks only script references inside `In-Ex-Ledger-API/public/html`.
- It does not validate CSS links, `public/app-v3/index.html` JS/CSS assets, archived HTML references, or static asset references outside `public/html`.
- `public/app-v3/index.html` references `/app-v3/assets/index-BBFqOsTs.js` and `/app-v3/assets/index-CZPpTlwL.css`.

Impact:

- A green bundle-drift check currently gives limited confidence.
- Stale CSS or V3 build asset references could be missed.
- This is especially risky because the V3 bundle is served from generated files while source edits happen under `frontend-v3/src`.

Suggested fix:

- Extend the drift check to cover both `src` and `href` references for active static HTML.
- Add explicit validation for `public/app-v3/index.html` assets.
- Keep archived legacy HTML out of the production drift check unless a separate archive-integrity check is desired.

### Medium - Generated V3 Bundle Is Tracked And Should Be Treated As Build Output

Evidence:

- `In-Ex-Ledger-API/public/app-v3/assets/index-BBFqOsTs.js` is a minified generated bundle, about 765 KB and 11 physical lines.
- `In-Ex-Ledger-API/public/app-v3/assets/index-CZPpTlwL.css` is a minified generated CSS bundle, about 89 KB and 1 physical line.
- `frontend-v3/vite.config.ts` builds into `../public/app-v3`.
- `nixpacks.toml` verifies `public/app-v3/index.html` exists.

Impact:

- These files are necessary deployment artifacts in this repo, but they are not meaningful source-review targets.
- Professional review should inspect source in `frontend-v3/src`, then verify generated output is refreshed intentionally.

Suggested fix:

- Treat generated bundle files as artifacts in this audit.
- For any frontend source cleanup, run the V3 build and verify `public/app-v3` drift intentionally.
- Avoid manual edits under `public/app-v3`.

### Low/Medium - Active Static Public HTML Is A Small Mixed Surface

Evidence:

- `public/html` contains SEO pages, gated V2 Business placeholder pages, and a redirect helper page such as `review.html`.
- `server.js` blocks V2 placeholder pages unless `ENABLE_V2_BUSINESS=true`.
- `server.js` serves SEO/indexable pages from `INDEXABLE_PUBLIC_PAGES`.
- `public/html/review.html` contains inline script; SEO pages mostly link CSS and navigation.

Impact:

- This surface is much smaller than the old legacy app, but it still deserves separate review from the V3 SPA.
- Inline script and static SEO pages should be checked for CSP compatibility, stale copy, broken links, and route drift.

Suggested fix:

- Keep `public/html` in scope as active static/SEO surface.
- Review it separately from archived legacy frontend and V3 React source.
- Add or extend tests for active public HTML link integrity and CSP expectations.

### Low/Medium - Documentation Still Mentions Legacy Paths In Ways That Can Confuse Scope

Evidence:

- `Docs/DEPLOYMENT.md` includes a checklist item to verify `In-Ex-Ledger-API/legacy/public-html/auth-public/landing.html` is present and up to date.
- `Docs/CPA_CODEBASE_AUDIT_MATRIX.md` still lists archived legacy HTML files as evidence for business profile and vehicle workflows.
- `Docs/V3_ROUTE_INVENTORY.md` correctly identifies legacy app-core/auth HTML as archived.

Impact:

- Some docs are clear, while others can make archived frontend files look operationally active.
- This increases the chance of future maintenance work targeting the wrong frontend.

Suggested fix:

- Update deployment and audit matrix docs to distinguish active surfaces from archived reference evidence.
- Preserve the archive, but label it consistently.

## Pass 5 - Test And CI Guardrail Audit

Status:

- Read-only.
- No source files changed.
- This pass reviewed package scripts, GitHub workflows, and test inventory.

### High - `test:all` Is Not Actually All Tests

Evidence:

- `In-Ex-Ledger-API/tests` contains 120 tracked `*.test.js` files.
- `npm run test:all` includes 96 unique `*.test.js` files plus `asvsControls.test.js` through a separate `node -e` require.
- 24 test files are not included in `test:all`, including:
  - `accountsOpeningBalanceRoutes.test.js`
  - `authReactivationRegistration.test.js`
  - `businessProvisionAddOn.test.js`
  - `depreciationSchedules.test.js`
  - `exportSnapshotService.test.js`
  - `internalSupportRoutes.test.js`
  - `plaidSyncImportRoute.test.js`
  - `quickMethodService.test.js`
  - `requestIpService.test.js`
  - `reviewQueueRoutes.test.js`
  - `routeInventory.test.js`
  - `securityRegressionSuite.test.js`
  - `supportArtifactsRoutes.test.js`
  - `supportEmailInboundLegacy.test.js`
  - `supportEmailService.test.js`
  - `supportEmailThreading.test.js`
  - `transactionCategorizationAccuracy.test.js`
  - `transactionCategorizationService.test.js`
  - `transactionCsvImportRoute.test.js`
  - `transactionMappingRuleService.test.js`
  - `transactionMappingRulesRoutes.test.js`
  - `transactionReviewFlagService.test.js`
  - `transactionsBulkDeleteAllRoute.test.js`
  - `vehicleClaimService.test.js`

Impact:

- Developers and CI can believe the full suite passed when important tests never ran.
- Several omitted tests appear to cover security, support email, categorization, transaction review, Plaid sync/import, mapping rules, and vehicle claims.
- This is a guardrail trust issue.

Suggested fix:

- Either make `test:all` discover and run all `tests/*.test.js`, or rename it to the exact suite it runs.
- If some omitted tests are intentionally excluded, create explicit named scripts such as `test:integration:db`, `test:external`, or `test:slow`.
- Add a CI check that fails when a new `*.test.js` file is not assigned to a suite.

### High - Main CI Does Not Run V3 Lint, TypeScript, Or Build

Evidence:

- `.github/workflows/phase7-guardrails.yml` installs backend dependencies and frontend v3 dependencies.
- It runs migrations, checksum verification, export grant guard, log scan, redacted export verification, `npm run test:all`, and bundle drift.
- It does not run:
  - `npm --prefix frontend-v3 run lint`
  - `npm --prefix frontend-v3 run build`
  - `npm run i18n:v3:check`
- Earlier local checks showed V3 lint, V3 i18n check, and `npx tsc -b --noEmit` can pass, but they are not enforced by this workflow.

Impact:

- A pull request can pass the main guardrail while breaking TypeScript, Vite build output, frontend lint, or generated phrase catalog freshness.
- The bundle drift check is too narrow to compensate for missing frontend build enforcement.

Suggested fix:

- Add explicit CI steps for V3 lint, V3 i18n check, and V3 build.
- Prefer `npm ci` over `npm install` in CI once lockfile consistency is confirmed.
- Run frontend checks before backend `test:all` so frontend failures are fast and clear.

### Medium - CI Uses `npm install` In Guardrails And E2E

Evidence:

- `.github/workflows/phase7-guardrails.yml` uses `npm install` for backend and frontend.
- `.github/workflows/e2e-smoke.yml` uses `npm install`.
- `.github/workflows/dependency-security.yml` uses `npm ci`.

Impact:

- `npm install` can update lockfile resolution behavior during CI and is less deterministic than `npm ci`.
- This weakens repeatability and can hide lockfile drift.

Suggested fix:

- Move CI installs to `npm ci` for both backend and frontend packages.
- Keep `npm install` for local developer workflows only.

### Medium - Source-Shape Tests Are Brittle And Already Failed Locally

Evidence:

- Earlier local `npm run test:all` failed in `tests/frontendV3Wiring.test.js`.
- The failing assertion expected `AppShell.tsx` to match the exact newline/spacing regex `/\n {2}language,\n/`.
- The source file used CRLF line endings, causing the intent check to fail even though the code can still be semantically correct.
- `frontendV3Wiring.test.js` and related tests contain many `fs.readFileSync` plus `assert.match(source, /.../)` checks against implementation text.

Impact:

- These tests can fail because code was formatted, line endings changed, or implementation moved while behavior stayed correct.
- They are useful as temporary migration guardrails but too brittle for long-term confidence.

Suggested fix:

- Keep a small number of source-shape checks for architectural boundaries.
- Replace behavior-relevant source regexes with runtime tests, parser-based checks, or TypeScript-level API tests.
- Normalize line endings in any remaining source text tests.

### Medium - E2E Smoke Is Nightly/Manual Only

Evidence:

- `.github/workflows/e2e-smoke.yml` explicitly says it is not a required PR check yet.
- It runs only on `workflow_dispatch` and a daily schedule.
- It executes `npm run test:e2e:smoke`, which covers two Playwright specs: `v3-pages.spec.js` and `v3-interactions.spec.js`.

Impact:

- This is a pragmatic performance choice, but UI regressions can merge before the nightly run catches them.
- Since V3 is now the canonical frontend, lack of PR-triggered smoke coverage is a meaningful risk.

Suggested fix:

- Add a path-filtered PR trigger for V3, routing, auth, CSS, and public static changes.
- Keep full/comprehensive E2E nightly if runtime cost is high.

### Medium - Dependency Security Workflow Misses Frontend Package Audit

Evidence:

- `.github/workflows/dependency-security.yml` installs and audits only `In-Ex-Ledger-API`.
- The V3 frontend has its own `package.json` and `package-lock.json`.
- Earlier local audit found a high vulnerability in the frontend dependency chain through `vite -> postcss -> nanoid`.

Impact:

- Frontend production dependency issues can be missed by scheduled/PR dependency security CI.

Suggested fix:

- Add a frontend audit step with `working-directory: In-Ex-Ledger-API/frontend-v3`.
- Decide whether dev/build-time vulnerabilities should block release for the V3 bundle pipeline.

### Low/Medium - CI Workflow Contains Debug And Mojibake Artifacts

Evidence:

- `.github/workflows/phase7-guardrails.yml` includes a `Debug repo structure` step that prints directory listings.
- `.github/workflows/e2e-smoke.yml` comments contain mojibake such as `â€”` and `â‰ˆ`.

Impact:

- The debug step adds noise to professional CI output.
- Mojibake reinforces the broader encoding-quality issue already found elsewhere.

Suggested fix:

- Remove the debug step once the workflow is stable.
- Normalize workflow files to UTF-8 and fix mojibake comments.

## Pass 6 - Database, Migration, And Data-Safety Audit

Status:

- Read-only.
- No source files changed.
- Local checksum verification was not rerun in this pass because earlier execution failed without a local Postgres service on `localhost:5432`.

### High - Startup Runs A Checksum Repair With `--write`

Evidence:

- `In-Ex-Ledger-API/package.json` defines:
  - `"prestart": "node scripts/repair-migration-checksums.js --write --file 20260419_create_billable_expenses_table.sql"`
- `Docs/MAINTENANCE-SCRIPTS.md` documents `repair-migration-checksums.js` and says repair is intentional when run with `--write`.
- `repair-migration-checksums.js` updates `schema_migrations.checksum` to match current file content when `--write` is passed.

Impact:

- Startup should not mutate migration metadata as a routine side effect.
- Even if this specific file is a known historical case, automatic repair weakens trust in checksum drift detection.
- A production boot path should fail loudly on unexpected migration drift, not silently normalize it.

Suggested fix:

- Remove checksum repair from `prestart`.
- Keep `migrations:repair-checksums` as a manual, documented, break-glass command.
- If the billable-expenses historical compatibility must remain permanent, keep that logic in the migration runner's explicit compatibility allowlist, not as a startup write.

### Medium/High - Migration Naming Order Is Hard To Reason About

Evidence:

- There are 101 SQL migration files.
- The runner applies files by `fs.readdirSync(...).sort()`.
- Naming mixes three-digit prefixes and date-based prefixes.
- Duplicate numeric prefixes exist: `007`, `026`, `045`, and `048`.
- Numeric prefix `034` is missing.
- Date-prefix groups intentionally contain many files on the same date, including seven files under `20260511` and six under `20260523`.
- `db.js` has historical filename alias logic for renamed migrations.
- `migrationFiles.test.js` includes a specific ordering test proving `20260601_add_transaction_mapping_metadata.sql` sorts after `20260531_create_transaction_mapping_rules.sql`.

Impact:

- The migration system works by filename sort, but the naming convention no longer makes ordering obvious.
- Future developers can accidentally introduce a migration that sorts before a dependency or after a required backfill.
- Alias and compatibility logic are signs the migration history has already required manual correction.

Suggested fix:

- Adopt one forward-only migration naming convention from here onward.
- Add a migration linter that detects duplicate sequence numbers, unexpected gaps, and dependency-sensitive ordering.
- Keep historical aliases for existing deployed systems, but do not add new aliases unless unavoidable.

### Medium/High - Destructive Data Cleanup Exists Inside Migrations

Evidence:

- `002_enforce_business_name_uniqueness.sql` deletes duplicate accounts and categories before adding uniqueness.
- `035_fix_schema_gaps.sql` deletes mileage rows where `business_id IS NULL`.
- `041_enforce_category_name_ci_unique.sql` deletes duplicate categories case-insensitively.
- `048_reset_ip_based_signin_device_fingerprints.sql` deletes all rows from `recognized_signin_devices`.
- `043_drop_goals.sql` drops the `goals` table.
- Several migrations drop constraints or indexes.

Impact:

- Some destructive migrations may be justified, especially early in product history, but they are high-risk in accounting software.
- Deletes inside migrations should have explicit preflight counts, retention rationale, and backup/restore expectations.
- Without that, a fresh deploy or restore can hide data loss under normal migration output.

Suggested fix:

- For future destructive migrations, require a paired audit note: expected row counts, rollback/restore plan, and product owner approval.
- Add tests or script checks that flag `DELETE`, `DROP TABLE`, `DROP CONSTRAINT`, and broad `UPDATE` statements for manual review.
- Do not rewrite old migrations unless there is a deployed-system reason; add governance around future ones.

### Medium - Migration Logic Is Duplicated In `seed-dev.mjs`

Evidence:

- `scripts/seed-dev.mjs` contains its own self-contained migration runner.
- It mirrors checksum creation, file sorting, transaction wrapping, and `schema_migrations` writes.
- It does not include the same alias normalization and compatibility repair logic as `db.js`.
- The file also contains mojibake in comments/log output.

Impact:

- Dev seeding can drift from the production migration runner.
- A migration that works through `db.js` may fail or behave differently through `seed-dev.mjs`.
- Duplicate migration runners are overengineering unless they intentionally share core logic.

Suggested fix:

- Make `seed-dev.mjs` call the shared `initDatabase()` migration runner instead of maintaining a second implementation.
- If dev seeding needs different behavior, isolate only the seeding/wipe logic, not migration application.

### Medium - Server Starts Listening Before Database Initialization Completes

Evidence:

- `server.js` calls `app.listen(...)` before `initializeDatabaseWithRetry()`.
- `initializeDatabaseWithRetry()` runs in the background and can set `dbState` to `retrying` or `failed`.
- On `MigrationContentDriftError`, it marks the database failed and returns rather than exiting the process.

Impact:

- This can be useful for health reporting, but it also means the API process can be alive while the schema is unavailable or drifted.
- If health checks or load balancers do not strictly gate on `dbState`, traffic may hit a partially initialized app.

Suggested fix:

- Confirm `/health` and deployment health checks fail closed when `dbState !== 'ready'`.
- For non-retryable migration drift, consider exiting the process in production after logging the clear failure reason.

### Medium - Backup/Restore Procedure Runs Migrations Before Restore

Evidence:

- `Docs/BACKUP-RESTORE.md` says to run the migration runner on a clean target, then restore a dump with `pg_restore --clean --if-exists`.
- It then says to rerun checksum verification.

Impact:

- Running migrations before `pg_restore --clean` may be harmless if restore fully replaces objects, but the sequence is not obviously safe.
- Restore procedures are high-stakes; ambiguity increases the chance of a broken recovery under pressure.

Suggested fix:

- Rehearse restore into a disposable database and document the exact verified order.
- Clarify whether migrations are meant to create baseline schema before restore, or only run after restore to bring an older backup forward.

### Low/Medium - Database Files Contain Encoding/Mojibake Artifacts

Evidence:

- `db.js` contains mojibake in section comments and log text, such as `â”€`, `â†’`, and `â€”`.
- `scripts/seed-dev.mjs` contains similar mojibake in log separators and checksum mismatch messages.

Impact:

- This does not change runtime behavior, but it looks unprofessional and makes operational logs harder to read.
- It reinforces the broader encoding-quality issue already found in docs, workflows, and frontend translation files.

Suggested fix:

- Normalize these files to UTF-8 and replace corrupted comments/log text.
- Do this in a focused encoding cleanup batch with tests before and after.

## Pass 7 - Security, Auth, And Privacy Audit

Status:

- Read-only.
- No source files changed.
- This pass reviewed auth middleware, CSRF, cookies, environment validation, internal support access, privacy routes, logging, and related tests.

### Medium/High - Server Auth Still Accepts Bearer Tokens Despite Cookie-Only Contract

Evidence:

- `Docs/AUTHENTICATION.md` says session and CSRF tokens are cookie-only and that no bearer token is stored or read by client code.
- `middleware/auth.middleware.js` still checks `req.headers.authorization` first and accepts `Authorization: Bearer <token>`.
- The browser-side security regression test verifies legacy browser JS ignores attacker-planted bearer tokens and omits Authorization headers, but the server still accepts bearer tokens if any client sends them.

Impact:

- The V3 browser contract is cookie-only, but the server contract is broader.
- This may be intentional for API clients/connectors, but it is not documented as a supported authentication mode.
- If bearer auth is legacy-only, keeping it expands the attack surface and makes auth behavior harder to reason about.

Suggested fix:

- Decide explicitly whether bearer tokens are supported for non-browser API clients.
- If not supported, remove bearer acceptance from `requireAuth`.
- If supported, document the contract, add route-level/API-client scoping, and ensure CSRF assumptions are not mixed with bearer-token access.

### Medium/High - Internal Support API Is Gated By One Shared Secret

Evidence:

- `routes/internalSupport.routes.js` is mounted at `/api/internal/support`.
- It is gated by `requireSupportSecret`, which compares `x-support-secret` to `INEX_LEDGER_SUPPORT_SECRET`.
- The route returns user email, display name, subscription plan/status, business owner email, region, language, and created-at timestamps.
- A comment correctly states the router is gated only by a single shared secret and logs access.
- `envValidationService.js` does not require `INEX_LEDGER_SUPPORT_SECRET` for production.

Impact:

- Shared-secret-only support access has no per-agent identity, no scoped token, and no obvious rotation/audit ownership beyond log entries.
- If the secret is leaked, support lookup data is exposed until the secret is rotated.
- Because the env var is not required in production, the route may either be accidentally disabled or enabled inconsistently across environments.

Suggested fix:

- Decide whether the internal support API is production-required.
- If production-required, require `INEX_LEDGER_SUPPORT_SECRET` in production env validation and document rotation.
- Prefer per-agent identity or short-lived signed support tokens over a single long-lived shared secret.
- Keep the access log, but avoid treating logs as the primary control.

### Medium - CSRF Coverage Is Good But Depends On Route Discipline

Evidence:

- `csrf.middleware.js` uses signed nonce tokens, strict same-site CSRF cookie, and matching cookie/header verification for unsafe methods.
- Most authenticated routers apply `router.use(requireAuth)` and `router.use(requireCsrfProtection)`.
- Auth mutation routes apply CSRF selectively where appropriate.
- External webhooks such as Stripe and support email bypass CSRF and use their own signature/secret controls.

Impact:

- Current coverage looks broadly intentional.
- The risk is maintainability: new routes can forget CSRF unless they follow the router-level pattern.

Suggested fix:

- Add a route inventory/security test that enumerates unsafe authenticated routes and verifies either CSRF protection or an explicit documented exception.
- Keep webhook exceptions separate and named.

### Medium - Production Environment Validation Misses Some Mounted Security-Sensitive Features

Evidence:

- `envValidationService.js` requires core production secrets: `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL`, `RESEND_API_KEY`, `CSRF_SECRET`, `FIELD_ENCRYPTION_KEY`, Stripe keys, export grant secret, receipt storage, and Stripe price envs.
- It does not require `INEX_LEDGER_SUPPORT_SECRET`, even though `/api/internal/support` is mounted.
- Support email service also derives behavior from inbound support/email env vars outside this required list.

Impact:

- Optional features can be deployed partially configured.
- For security-sensitive mounted routes, optional configuration should be explicit and observable.

Suggested fix:

- Split env validation into required core config and mounted-feature config.
- For any mounted production endpoint, either require its secret or disable the route unless the full config is present.

### Medium - Sensitive Logging Is Sanitized Centrally, But Some Call Sites Pass Raw Errors

Evidence:

- `utils/logger.js` sanitizes structured context through `sanitizePayload`.
- Many routes pass structured `{ err: err.message }` objects, which is good.
- Some routes still pass raw `err`, `err.stack || err`, or string-concatenated error messages into `logError`.
- Earlier static scans found raw console/log usage across runtime code.

Impact:

- Central sanitization helps, but raw Error objects and stack traces can still carry SQL fragments, filesystem paths, request-derived values, or third-party payload details.
- This is a professionalism/security hygiene issue, especially in accounting and privacy flows.

Suggested fix:

- Standardize route error logging to a small helper that emits route, status, safe error code/message, and correlation id.
- Avoid passing full Error objects/stacks outside local development.

### Medium - Privacy/Delete Flows Are High-Impact And Need Stronger File/Transaction Recovery Tests

Evidence:

- `privacy.routes.js` implements `/privacy/export`, `/privacy/erase`, and `/privacy/delete`.
- These routes require auth, CSRF, and `requireMfaIfEnabled`.
- `/privacy/delete` deletes many business-owned tables inside a DB transaction, then unlinks receipt/export files after commit.
- If file unlink fails, the DB deletion remains committed and failures are logged.
- Existing tests cover many MFA/CSRF/password paths, but high-impact filesystem edge cases are a residual risk.

Impact:

- The current ordering is understandable, but it can leave orphaned files after successful DB deletion.
- For privacy deletion, orphaned files are a compliance risk even when logged.

Suggested fix:

- Add focused tests for delete-file failure handling and follow-up remediation.
- Consider a durable deletion-job table for file cleanup retries after DB commit.

### Low/Medium - Encryption Service Allows Plaintext Legacy Fallback

Evidence:

- `services/encryptionService.js` uses AES-256-GCM with `FIELD_ENCRYPTION_KEY`.
- `decrypt()` returns values unchanged when they do not start with `enc:v1:`.
- Comments state this is for graceful transition from plaintext legacy data.

Impact:

- This is reasonable during migration, but long-term plaintext fallback can hide unencrypted sensitive data.
- The codebase should know whether plaintext legacy data still exists.

Suggested fix:

- Add an audit script/check that counts plaintext values in fields expected to be encrypted.
- Once backfill is complete, make plaintext fallback explicit only for documented legacy reads or remove it.

### Low/Medium - Security Tests Exist But Are Not Fully Enforced By `test:all`

Evidence:

- `securityRegressionSuite.test.js` covers support artifact MIME mismatch, path traversal confinement, and browser auth behavior.
- Pass 5 found this file is not included in `npm run test:all`.
- `csrfProtection.test.js`, `csrfE2E.test.js`, and several auth/MFA tests are included, but the dedicated security regression suite is currently outside the main suite.

Impact:

- Important security regressions can be missed by the main named guardrail.

Suggested fix:

- Include `securityRegressionSuite.test.js` in the main required security suite or give it a clearly required CI job.

## Pass 8 - Accounting, Tax, And Business-Logic Integrity Audit

Status:

- Read-only.
- No source files changed.
- This pass reviewed accounting/tax docs, transaction/export/tax services, V3 export UI, and business-critical tests.

### High - `accounting_method` Is Collected But Does Not Drive Recognition Logic

Evidence:

- `business.routes.js`, `businesses.routes.js`, `me.routes.js`, and V3 settings/onboarding collect or validate `accounting_method` as `cash` or `accrual`.
- `exports.routes.js` and `pdfGeneratorService.js` include accounting method in profile/readiness metadata.
- Searches found no traced engine that changes transaction, invoice, bill, tax summary, export, or A/R/A/P recognition timing based on `accounting_method`.
- `Docs/CPA_CODEBASE_AUDIT_MATRIX.md` already flags this as `wrong`.

Impact:

- The app appears to ask users for an accounting method without applying the chosen method to reporting behavior.
- That is a professional correctness issue: collecting a tax/accounting field implies the app honors it.

Suggested fix:

- Either implement explicit cash-vs-accrual behavior, or relabel the field as informational and avoid any CPA-facing implication that reports honor accrual basis.
- Add tests proving how invoices, bills, payments, transactions, and exports behave under each method.

### Medium/High - Export Support Joins Do Not Fully Match Transaction Exclusion Guards

Evidence:

- Main export transaction queries exclude archived, voided, and adjustment rows with:
  - `deleted_at IS NULL`
  - `(is_void = false OR is_void IS NULL)`
  - `(is_adjustment = false OR is_adjustment IS NULL)`
- Related receipt and vehicle-claim joins in `exports.routes.js` only check `t.deleted_at IS NULL`.
- The same narrower pattern appears in both export source collection paths around receipt joins and `vehicle_expense_details` joins.

Impact:

- Support evidence tied to voided or adjustment transactions could be considered by export packet logic even when the underlying transaction row is excluded from P&L.
- This is subtle, but export packets are high-trust artifacts.

Suggested fix:

- Apply the same archived/void/adjustment guard to every export support join that depends on transactions.
- Add regression tests with receipts/vehicle claims attached to voided and adjustment transactions.

### Medium - V3 Export UI Starts With USD/Schedule C Defaults Instead Of Active Business Defaults

Evidence:

- `frontend-v3/src/pages/Exports.tsx` initializes `emptySummary.taxForm` as `Schedule C` and `emptySummary.currency` as `USD`.
- The page also initializes export `currency` state as `USD`.
- `loadExportPageData()` maps API metadata into summary currency/tax form, but the generation request sends the separate local `currency` state.
- For a Canadian business, the summary can display CAD/T2125 from the API while generation settings still default to USD unless the user changes the dropdown.

Impact:

- Canadian users can generate an export with the wrong currency setting through a UI default mismatch.
- Even if backend region controls jurisdiction, exported currency metadata and PDF formatting can be wrong.

Suggested fix:

- Initialize export currency from the active business or from dataset metadata after page data loads.
- Add a V3 wiring/unit test for a CA/CAD business export default.

### Medium - CPA Matrix Is Useful But Stale In Several References

Evidence:

- `Docs/CPA_CODEBASE_AUDIT_MATRIX.md` still lists archived legacy HTML paths as evidence for business profile and vehicle workflows.
- It marks home office as `wrong`, but `services/homeOfficeService.js` and `homeOffice.routes.js` now implement a dedicated worksheet and deduction math.
- It marks capital assets as partial, which still appears fair, but current code has `capitalAssetService.js` and depreciation utilities that should be reflected precisely.
- `Docs/ACCOUNTING_TRUST_RULES.md` says PDF exports are generated by the `pdf-worker` service, while earlier passes confirmed current export routes generate PDFs in process.
- `Docs/ACCOUNTING_TRUST_RULES.md` references `GET /api/privacy/data-export`, while current privacy export route is `POST /api/privacy/export`.

Impact:

- The CPA matrix is the right kind of professional artifact, but stale entries can send reviewers to archived UI or wrong endpoints.
- This creates audit confusion and weakens confidence in domain claims.

Suggested fix:

- Update the CPA matrix and accounting trust rules after the active-code audit is complete.
- Separate active implementation surfaces from archived/reference surfaces.
- Add doc tests for named critical routes and owner files where practical.

### Medium - Business-Critical Tests Are Outside `test:all`

Evidence:

- Pass 5 found 24 `*.test.js` files omitted from `npm run test:all`.
- The omitted set includes business-critical files:
  - `reviewQueueRoutes.test.js`
  - `vehicleClaimService.test.js`
  - `quickMethodService.test.js`
  - `transactionCategorizationAccuracy.test.js`
  - `transactionCategorizationService.test.js`
  - `transactionCsvImportRoute.test.js`
  - `transactionMappingRuleService.test.js`
  - `transactionMappingRulesRoutes.test.js`
  - `transactionReviewFlagService.test.js`
  - `transactionsBulkDeleteAllRoute.test.js`
  - `exportSnapshotService.test.js`
  - `depreciationSchedules.test.js`

Impact:

- Several of the highest-risk CPA/accounting features can regress while the named full suite still passes.

Suggested fix:

- Create a required `test:accounting` or `test:domain` suite and include it in CI.
- Do not rely on the current `test:all` name until it actually runs all required business-critical tests.

### Medium - Balance-Sheet Integrity Remains Partial

Evidence:

- The CPA matrix still marks accounts/opening balances and balance-sheet integrity as `partial`.
- `accountsOpeningBalanceRoutes.test.js` exists but is not in `test:all`.
- Searches found account opening balance storage/use, but no broad balance-sheet rollforward owner comparable to the P&L/tax export paths.

Impact:

- The app may handle cashflow/P&L workflows better than balance-sheet style reporting.
- Any product copy implying complete accounting/balance-sheet readiness would overstate the implementation.

Suggested fix:

- Keep balance-sheet claims conservative.
- Add a dedicated balance rollforward service and tests before making stronger accounting-ledger claims.

### Low/Medium - Home Office And Capital Asset Docs Lag Behind Current Code

Evidence:

- `homeOfficeService.js` now implements worksheet storage, US simplified method, actual method, CA unsupported simplified guard, eligible expense selection, and PDF worksheet inputs.
- `capitalAssetService.js` computes US MACRS and CA CCA-style depreciation using depreciation schedule utilities.
- The CPA matrix still describes some of these areas as missing or only defensive.

Impact:

- This is not a code defect by itself.
- It is a documentation/professionalism issue: the audit inventory should reflect current implementation accurately so future work starts from truth.

Suggested fix:

- Re-review these domains after this codebase pass and update status from stale claims to current verified behavior.
- Preserve caveats around edge-case tax elections and per-asset schedule detail.

## Pass 9 - Repository Governance, Professionalism, And AI-Slop Signals

Status:

- Scope: docs/work trackers, maintenance scripts, local artifacts, naming drift, stale reports, encoding artifacts, and obvious AI/slop/professionalism signals.
- This pass did not modify source code.
- Important clarification remains in force: `frontend-v3` is the active frontend truth. `In-Ex-Ledger-API/legacy/public-html` is archived reference material only and should not be wired back into the app.

### Medium/High - Work Tracker Sprawl Makes Current Truth Hard To Identify

Evidence:

- Markdown tracker/audit counts:
  - `Docs`: 26 markdown files.
  - `Work-Completed`: 12 markdown files.
  - `Work-Review`: 4 markdown files including this audit.
  - `Work-To-Do`: 7 markdown files.
- The folders include multiple status/audit-style documents with overlapping language:
  - `Docs/CURRENT_STATUS.md`
  - `Docs/PROJECT-README.md`
  - `Docs/REPO-GOVERNANCE.md`
  - `Docs/SECURITY_AUDIT_2026-06-10.md`
  - `Work-To-Do/WORK-TO-DO-STATUS.md`
  - `Work-To-Do/UNFINISHED-CLEANUP-WORK.md`
  - `Work-Completed/AUDIT-REPORT.md`
  - `Work-Completed/CODEBASE-AUDIT-HIGH.md`
  - `Work-Completed/CODEBASE-AUDIT-MEDIUM.md`
  - `Work-Completed/CODEBASE-AUDIT-LOW.md`
  - `Work-Completed/CURRENT_LAUNCH_BLOCKERS_2026-06-07.md`
- `Docs/README.md` and `Docs/REPO-GOVERNANCE.md` already define a good policy: current docs belong in `Docs`, stale/completed work belongs in `Work-Completed`, and stale audit/status documents should not drive new work.
- The policy is correct, but the volume of historical reports still makes it expensive to determine what is authoritative.

Impact:

- Future reviewers can easily chase old failures, old launch blockers, or stale roadmap claims.
- This is exactly the kind of repo shape that feels like AI-assisted accumulation: lots of artifacts, not enough active truth hierarchy.

Suggested fix:

- Add a single `Work-Review/README.md` or update `Docs/README.md` with the active review entry point and a short "historical only" index.
- Add an explicit top banner to stale historical audit reports that says they are retained for history and must not be treated as current without re-verification.
- Keep this current 100% audit as the temporary source of truth until the findings are triaged into issues or cleanup batches.

### Medium - Historical Reports Preserve Old FAIL Rows Without Current-Status Banners

Evidence:

- `Work-Completed/AUDIT-REPORT.md` contains old `FAIL` rows such as duplicate account name, CSRF cookie, change-password MFA, and registration consent issues.
- `Work-Completed/AUDIT-REPORT-2026-04-13.md` already has a clear stale warning.
- Other completed/status files contain mixed language like "Current Launch Blockers", "Status: Not complete", "Completed", and "Moved to Work-Completed".

Impact:

- A reviewer or future AI assistant can mistake historical failures for active production defects.
- The codebase review cost goes up because every old claim must be re-proven against current code.

Suggested fix:

- Standardize archived-work banners across all `Work-Completed/*.md` files.
- For any historical report worth keeping, add a "superseded by" line pointing to the current status source.
- For reports with old `FAIL` tables, add a note that the failures are historical snapshots, not current findings.

### Medium - Local Runtime Artifact Folders Sit At Repo Root

Evidence:

- Root folders found:
  - `.tmp-postgres-e2e/postgres.log`
  - `tmp-chrome/component_crx_cache`
  - `tmp-chrome/Crashpad`
  - `tmp-edge/component_crx_cache`
  - `tmp-edge/Crashpad`
  - `storage/.gitkeep`
- `git ls-files` shows only `storage/.gitkeep` is tracked from this set.
- The temp browser/Postgres folders are currently local/untracked, not committed source.

Impact:

- This is not damaging by itself, but root-level runtime artifacts make the repo look less professional and increase accidental commit risk.
- Logs and browser temp folders can contain machine-specific paths, noise, or sensitive diagnostics.

Suggested fix:

- Confirm `.gitignore` covers `.tmp-postgres-e2e/`, `tmp-chrome/`, `tmp-edge/`, and any equivalent runtime folders.
- Keep `storage/.gitkeep` only if the runtime storage root is intentionally required.
- Document the expected local runtime folders in developer setup docs, or redirect them under a clearly ignored `.tmp/` convention.

### Medium - Mojibake/Encoding Artifacts Are Still Present

Evidence:

- Current scan found mojibake in active and archived surfaces:
  - `In-Ex-Ledger-API/public/js/invoices.js`
  - `In-Ex-Ledger-API/tests/e2e/comprehensive.spec.js`
  - `In-Ex-Ledger-API/legacy/public-html/app-core/transactions.html`
  - this audit report, because it records earlier mojibake examples.
- Previous passes also found mojibake in `.github` comments, migration/database comments, scripts, docs, and generated/static surfaces.
- `tests/i18nCoverage.test.js` explicitly lists mojibake markers, which is good, but existing files still contain examples.

Impact:

- Encoding damage is a professionalism problem and can become a product defect when visible strings are affected.
- It also makes source reviews noisy because punctuation and symbols are no longer trustworthy.

Suggested fix:

- Run a focused UTF-8 normalization pass after the audit is complete.
- Separate harmless comment-only cleanup from user-visible strings.
- Add or extend a lightweight repo encoding check so new mojibake cannot be introduced.

### Medium - Maintenance/Test Scripts Need A Clear Promotion Or Retirement Policy

Evidence:

- `In-Ex-Ledger-API/scripts` contains 14 files, including:
  - `seed-dev.mjs`
  - `test-export-grant.mjs`
  - `test-region-tax.mjs`
  - `test-accounts-put.mjs`
  - `test-mileage-put.mjs`
  - `test-email.mjs`
  - `i18n-audit.js`
  - `i18n-fix.js`
  - `repair-migration-checksums.js`
  - `verify-redacted-storage.mjs`
- `In-Ex-Ledger-API/package.json` wires several ad hoc `test:...` scripts directly to `scripts/test-*.mjs`.
- `Docs/MAINTENANCE-SCRIPTS.md` already says these scripts are useful short-term but recommends promoting long-term regression coverage into real `node --test` tests when behavior becomes permanent.

Impact:

- The repo has the right documentation, but the current shape still mixes maintenance tools, one-off checks, and regression tests.
- That makes `npm run test:all` less trustworthy and creates uncertainty about which checks are required before release.

Suggested fix:

- Promote long-term `scripts/test-*.mjs` checks into `tests/*.test.js` and include them in the required suite.
- Keep true operator scripts under `scripts/`, but document side effects, required env vars, and whether they are safe in production.
- Rename or retire scripts that were only meant for a migration/recovery window.

### Low/Medium - AI/Codex And "AI-Sounding Text" References Are Mostly Process Debt, Not Product Code

Evidence:

- `Work-To-Do/IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md` explicitly says to "remove generic AI-sounding text".
- `Work-To-Do/UX-FUNNEL-AND-SETTINGS-IMPROVEMENTS.md` has a "Responsive (assigned to Codex)" section.
- `Work-To-Do/UNFINISHED-CLEANUP-WORK.md` references Codex and cleanup language around temporary workarounds, patches, sidecars, duplicate phase docs, and hidden patches.

Impact:

- These are not active production-code defects by themselves.
- They are useful signals that prior work may have accumulated scaffolding, placeholder copy, or temporary artifacts that need disciplined retirement.

Suggested fix:

- Treat these references as review breadcrumbs, not proof of defects.
- During cleanup batches, verify each referenced temporary/patch/sidecar concern against current code before deleting anything.
- Keep product copy review separate from code architecture review so "AI-sounding" prose does not distract from functional risks.

### Low/Medium - Placeholder And Mock Surfaces Need A Reachability Inventory

Evidence:

- `Docs/CURRENT_STATUS.md` says Business-tier placeholder pages are not launch blockers if hidden or locked.
- `Docs/V3_ROUTE_INVENTORY.md` lists gated legacy/business-tier placeholder pages such as `/customers`, `/vendors`, `/projects`, `/bills`, `/ar-ap`, and `/billable-expenses`.
- `Work-To-Do/WORK-TO-DO-STATUS.md` documents the dev-only billing mock path as completed/hidden.
- Earlier passes confirmed `server.js` blocks V2 placeholder pages unless `ENABLE_V2_BUSINESS=true`.

Impact:

- Placeholder/mock code is acceptable when intentionally gated, but it becomes unprofessional if it is reachable, undocumented, or confused with active V3 frontend work.
- This overlaps with the user's clarification: archived legacy frontend must remain reference-only.

Suggested fix:

- Maintain a small reachability inventory for every placeholder/mock/static legacy route.
- Include route, gate/env flag, expected status code/redirect, and owning test.
- Do not wire archived legacy frontend files into the active product unless a future product decision explicitly changes the frontend truth.

## Pass 10 - Deployment, Environment, And Operations Review

Status:

- Scope: Docker/Nixpacks config, package release scripts, production env validation, deployment docs, backup/restore docs, CI workflow release coverage, local artifact ignore rules, storage configuration, and worker deployment claims.
- This pass did not modify source code.

### High - Production Docker Startup Runs A Checksum-Writing `prestart`

Evidence:

- `In-Ex-Ledger-API/package.json` defines:
  - `"prestart": "node scripts/repair-migration-checksums.js --write --file 20260419_create_billable_expenses_table.sql"`
  - `"start": "node server.js"`
- `In-Ex-Ledger-API/Dockerfile` uses `CMD ["npm", "start"]`.
- NPM runs `prestart` automatically before `start`.
- Earlier migration pass already flagged checksum repair with `--write` as unsafe startup behavior.

Impact:

- Every production container start can mutate migration checksum metadata before the server starts.
- This is not professional release behavior. Startup should verify state and fail loudly on drift, not repair it silently.

Suggested fix:

- Remove the `prestart` hook from production startup.
- Replace it with a manual operator command such as `npm run migrations:repair-checksums` that requires explicit intent.
- Add a read-only migration checksum verification step to CI and deployment health checks.

### High - Production Rate-Limit Configuration Messaging Conflicts With Actual Health Behavior

Evidence:

- `In-Ex-Ledger-API/Dockerfile` says rate limiting "falls back to in-memory store when `REDIS_URL` is not set".
- `.env.example` says the same.
- `Docs/DEPLOYMENT.md` correctly says `REDIS_URL` should be set to the production Redis instance.
- `In-Ex-Ledger-API/tests/rateLimiter.test.js` asserts production with no `REDIS_URL` is `degraded` and `available === false`.
- `server.js` returns `503` for API requests when rate limiting is required and unavailable.

Impact:

- The comments imply production can run without Redis, while the code treats that as degraded/unavailable.
- An operator following the Dockerfile or `.env.example` comment could deploy a container that starts but blocks API traffic.

Suggested fix:

- Make the docs, `.env.example`, Docker comment, health check, and rate-limiter behavior agree.
- If Redis is mandatory in production, require `REDIS_URL` in `envValidationService.js`.
- If in-memory fallback is intentionally allowed for single-instance production, update the health model and tests accordingly.

### Medium/High - Production Environment Validation Is Too Narrow For Mounted Feature Surface

Evidence:

- `envValidationService.js` production-required variables are:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `APP_BASE_URL`
  - `RESEND_API_KEY`
  - `CSRF_SECRET`
  - `FIELD_ENCRYPTION_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `EXPORT_GRANT_SECRET`
  - `RECEIPT_STORAGE_DIR`
  - Stripe price envs from `stripePriceConfig.js`
- `.env.example` and runtime code expose additional feature/security variables:
  - `REDIS_URL`
  - `RECEIPT_STORAGE_PERSISTENT`
  - `INBOUND_EMAIL_WEBHOOK_SECRET`
  - `INVOICE_REPLY_HMAC_SECRET`
  - `SUPPORT_REPLY_HMAC_SECRET`
  - `SUPPORT_INBOUND_WEBHOOK_SECRET`
  - `INEX_LEDGER_SUPPORT_SECRET`
  - `PDF_WORKER_URL`
  - `PDF_WORKER_SECRET`
  - `EXPORT_PUBLIC_KEY_JWK`
  - `EXPORT_PUBLIC_KEY_KID`
  - `SUPPORT_ARTIFACT_STORAGE_DIR`
- Some are optional by design, but some are security-sensitive when the corresponding route/feature is mounted or advertised.

Impact:

- Production can pass startup validation while shipping partially configured billing, inbound email, support, export, diagnostics, or internal-support behavior.
- Operators have to infer which variables are required from scattered docs and code.

Suggested fix:

- Split env validation into core required variables and feature-gated required variables.
- Validate `REDIS_URL` if production rate limiting requires Redis.
- Validate support/internal/inbound/PDF-worker variables only when those surfaces are enabled or expected in production.
- Add an env validation matrix to `Docs/PRODUCTION-READINESS.md` and test it.

### Medium - Deployment Docs Contain Stale Env Names And V3 Frontend Drift

Evidence:

- `Docs/DEPLOYMENT.md` asks for `STRIPE_PRICE_V1_MONTHLY`.
- Current code requires Stripe envs like `STRIPE_PRO_M_US`, `STRIPE_PRO_Y_US`, `STRIPE_PRO_M_CA`, `STRIPE_PRO_Y_CA`, `STRIPE_ADDL_M_US`, and related add-on prices.
- `Docs/DEPLOYMENT.md` says to verify:
  - `In-Ex-Ledger-API/legacy/public-html/auth-public/landing.html`
  - `In-Ex-Ledger-API/public/html/settings.html`
  - Stripe checkout starts from `/html/subscription.html`
- Current frontend truth is `frontend-v3`, and `/subscription` is served by the SPA. Archived legacy frontend must remain reference-only.

Impact:

- A deployment checklist that points to stale frontend files or old env names causes operational mistakes.
- It also contradicts the V3 migration truth established elsewhere in the repo and in this audit.

Suggested fix:

- Update deployment docs to validate the V3 build and canonical routes such as `/subscription`, not archived or redirected legacy paths.
- Replace stale Stripe env names with the current `stripePriceConfig.js` matrix.
- Add a doc check or release checklist item that verifies every env var named in deployment docs exists in code or `.env.example`.

### Medium - CORS Origin Configuration Is Hardcoded Despite Deployment Checklist Language

Evidence:

- `server.js` defines `ALLOWED_ORIGINS` as a hardcoded array:
  - `https://inexledger.com`
  - `https://www.inexledger.com`
  - local dev origins when not in production
- `Docs/DEPLOYMENT.md` says CORS `ALLOWED_ORIGINS` in `server.js` should contain only expected production origins.
- `.env.example` has `APP_BASE_URL` and `FRONTEND_URL`, but no runtime `ALLOWED_ORIGINS` env.

Impact:

- Every staging/preview/custom-domain deploy requires a code change or will fail CORS.
- Operators cannot safely configure allowed origins per environment without editing source.

Suggested fix:

- Introduce a validated `ALLOWED_ORIGINS` env var or derive the production origin from `APP_BASE_URL` with explicit additional origins.
- Keep hardcoded safe defaults only as a fallback.
- Add tests for production, staging, and malformed origin config.

### Medium - Production Image Uses Non-Reproducible Installs And Keeps Frontend Build Dependencies

Evidence:

- `In-Ex-Ledger-API/Dockerfile` runs `npm install --omit=dev` for backend dependencies.
- It then runs `npm --prefix frontend-v3 install` without `--omit=dev` so the Vite/TypeScript build can run.
- The Dockerfile does not use `npm ci` despite package locks.
- The frontend dependencies remain in the final runtime image after the build.
- `pdf-worker/Dockerfile` also uses `npm install --omit=dev`.
- CI workflows also use `npm install` in some places.

Impact:

- Builds are less reproducible than they should be.
- The runtime image carries unnecessary frontend tooling and dependency surface.

Suggested fix:

- Use `npm ci` for lockfile-exact installs.
- Convert the API Dockerfile to a multi-stage build: build V3 in a builder stage, copy only `public/app-v3` and production backend dependencies into the runtime image.
- Align CI install commands with production build expectations.

### Medium - Nixpacks Config Starts The API Without Building V3

Evidence:

- `nixpacks.toml` install command is `cd In-Ex-Ledger-API && npm install`.
- Start command is `cd In-Ex-Ledger-API && npm start`.
- There is no Nixpacks build phase running `npm run build` or `npm run build:frontend-v3`.
- `server.js` serves `public/app-v3/index.html` when present.

Impact:

- A Nixpacks-style deploy can run whatever V3 bundle is already checked into `public/app-v3`, not necessarily the bundle generated from current `frontend-v3` source.
- This reinforces the tracked-generated-bundle drift risk from earlier passes.

Suggested fix:

- Add a Nixpacks build phase that runs `npm run build`.
- Or remove Nixpacks if Docker is the only supported production build path.
- Do not rely on checked-in generated assets as the deploy build step.

### Medium - Storage Configuration Is Inconsistent Across Receipts, Exports, And Support Artifacts

Evidence:

- Receipt storage is configurable via `RECEIPT_STORAGE_DIR` and guarded by `RECEIPT_STORAGE_PERSISTENT`.
- Redacted export storage is hardcoded in `services/exportStorage.js` to `storage/exports`.
- Support artifacts default to `storage/support-artifacts`, configurable via `SUPPORT_ARTIFACT_STORAGE_DIR`.
- `Docs/BACKUP-RESTORE.md` refers to `EXPORT_REDACTED_DIR` / object store, but code does not use `EXPORT_REDACTED_DIR`.

Impact:

- Backup and restore docs do not precisely match runtime storage behavior.
- Production operators could back up receipts but miss redacted exports or support artifacts.

Suggested fix:

- Standardize storage env names for receipts, redacted exports, and support artifacts.
- Update backup/restore docs to match the exact code paths.
- Add a diagnostics endpoint or script that prints every managed storage root and persistence status.

### Medium - PDF Worker Deployment Docs Describe A Security Architecture That Is Not Active

Evidence:

- Earlier passes found `pdfWorkerClient.js` is not imported by tracked source and current export routes generate PDFs in process.
- `Docs/RUNBOOK.md`, `Docs/SECURITY.md`, `pdf-worker/README.md`, and `pdf-worker/DEPLOYMENT.md` describe private worker networking, attestation/KMS, worker secrets, and JWK flow.
- `.env.example` includes `PDF_WORKER_URL`, `PDF_WORKER_SECRET`, and `EXPORT_PUBLIC_KEY_JWK`.

Impact:

- The documented architecture is stronger than the active architecture.
- This creates professional and security-review risk because reviewers may assume a TEE/private-worker isolation boundary exists when it currently does not.

Suggested fix:

- Mark the PDF worker docs as inactive/future architecture unless the worker is reconnected.
- If the worker is desired, make reconnection an explicit project with tests, deployment proof, and rollback plan.
- Do not present worker isolation as current protection until active code uses it.

### Low/Medium - Ignore Rules Miss Some Root Runtime Artifacts

Evidence:

- `.gitignore` covers `tmp-chrome/`, `tmp-edge/`, `tmp-*.txt`, `.claude/`, and `In-Ex-Ledger-API/storage/`.
- It does not cover `.tmp-postgres-e2e/`.
- It does not cover root `storage/`; only `storage/.gitkeep` is currently tracked, but runtime data at root could appear untracked.

Impact:

- Accidental local artifacts can keep reappearing in developer status output.
- This is low immediate risk, but it makes a repo-wide cleanup/audit harder to maintain.

Suggested fix:

- Add explicit ignore rules for `.tmp-postgres-e2e/` and expected root runtime storage contents while preserving intentional `.gitkeep` files.
- Keep these as hygiene changes in a later cleanup batch, not during audit discovery.

## Pass 11 - Dead Code And Reachability Review

Status:

- Scope: backend route/service mounting, frontend V3 imports, active static pages, public JS/CSS reachability, archived legacy frontend, worker code, and tests that still load non-reachable files.
- This pass did not modify source code.
- Deletion recommendations are intentionally conservative. Anything marked "probably orphaned" still needs a focused cleanup PR with tests before removal.

### Medium/High - Active `public/js` Contains Large Pre-V3 App Code That Is No Longer Page-Reachable

Evidence:

- `git ls-files` counts in old/static frontend areas:
  - `In-Ex-Ledger-API/public/js`: 49 tracked files.
  - `In-Ex-Ledger-API/public/css/pages`: 36 tracked files.
  - `In-Ex-Ledger-API/legacy/public-html`: 31 tracked files.
- Active `public/html` currently has 15 tracked HTML files. These are SEO/static pages, gated Business placeholders, and `review.html`.
- A direct HTML scan found those active `public/html` pages link mostly:
  - `/css/app.css`
  - `/css/pages/seo-page.css`
  - one inline script in `review.html`
- The scan found no active `public/html` references to most old app scripts such as:
  - `public/js/accounts.js`
  - `public/js/transactions.js`
  - `public/js/settings.js`
  - `public/js/invoices.js`
  - `public/js/messages.js`
  - `public/js/mileage.js`
  - `public/js/exports.js`
  - `public/js/login.js`
  - `public/js/register.js`
  - `public/js/mfa-challenge.js`
- `Docs/AUTHENTICATION.md` confirms the V3 SPA owns the auth bridge and says the legacy `public/js` auth scripts are no longer reachable.
- `Docs/V3_ROUTE_INVENTORY.md` says not to add new product features to active `public/html` or `public/js` app pages.

Impact:

- The repo still carries a large amount of old product JavaScript in an active static directory even though V3 is the frontend truth.
- This is a major professionalism and maintenance issue: reviewers see active-looking code that does not own the product anymore.
- It also increases false positives in audits, tests, dependency/security reviews, and AI-assisted cleanup.

Suggested fix:

- Create an explicit classification for `public/js` files:
  - active static helper
  - test-only legacy helper
  - archived reference
  - delete candidate
- Do not wire these files back into V3.
- Move or delete dead pre-V3 app scripts only after tests and docs are updated to point at V3 owners.

### Medium - Tests Still Load Legacy `public/js` Files As If They Are Active Owners

Evidence:

- Tests load old scripts directly through `vm` helpers:
  - `tests/authBridgeRedirects.test.js` loads `public/js/auth.js`, `public/js/login.js`, and `public/js/mfa-challenge.js`.
  - `tests/asvsControls.test.js` loads `public/js/auth.js`.
  - `tests/securityRegressionSuite.test.js` loads `public/js/auth.js`.
  - `tests/frontendSecurityHelpers.test.js` loads `public/js/billing-pricing.js`, `public/js/privacyService.js`, `public/js/jwe-utils.js`, `public/js/auth.js`, `public/js/trial.js`, `public/js/accounts.js`, `public/js/receipts.js`, `public/js/subscription.js`, and `public/js/settings.js`.
  - `tests/taxRemindersBanner.test.js` loads `public/js/taxReminders.js`.
- Some of these helpers may still encode useful behavior, but the active V3 product does not load many of those scripts through page HTML.

Impact:

- The test suite can preserve old code by accident even after the product moved to V3.
- A passing test against `public/js/auth.js` may give false confidence about V3 auth behavior if the V3 source is not also tested.

Suggested fix:

- For every test that loads `public/js`, decide whether it protects:
  - still-active static/public behavior,
  - intentionally archived compatibility behavior,
  - or obsolete pre-V3 behavior.
- Port any still-relevant checks to `frontend-v3/src` tests.
- Remove tests that only keep dead code alive.

### Medium - Old Page-Specific CSS Is Not Clearly Active

Evidence:

- `public/css/app.css` imports only core styles:
  - `core/tokens.css`
  - `core/base.css`
  - `core/components.css`
  - `core/layout.css`
  - `core/app-shell-stability.css`
  - `core/dark-mode.css`
  - `core/header-menu.css`
  - `core/currency-fit.css`
  - `core/responsive.css`
  - `core/mobile-refinements.css`
  - `core/print.css`
  - `core/design-pass.css`
- Active `public/html` SEO pages link `public/css/pages/seo-page.css`.
- The scan found many `public/css/pages/*.css` files without active HTML/CSS references, including old app page styles for accounts, analytics, categories, exports, invoices, messages, mileage, receipts, settings, subscription, transactions, and auth pages.

Impact:

- Old CSS files remain in a public static path and look maintained even when the browser no longer uses them.
- This makes design cleanup harder because V3 styling lives in `frontend-v3/src/styles/index.css`, while old page CSS still appears as a competing source of truth.

Suggested fix:

- Keep only CSS files that are referenced by active static pages.
- Move any reference-only historical CSS under an archived path with a README, or delete it after visual parity is no longer needed.
- For V3 polish work, ignore old `public/css/pages` unless a route reachability test proves it is active.

### Medium - V2 Business Backend Is Feature-Gated, Not Dead, But It Needs A Product Decision

Evidence:

- `routes/index.js` mounts these only when `ENABLE_V2_BUSINESS === 'true'`:
  - `/api/vendors`
  - `/api/customers`
  - `/api/invoices`
  - `/api/bills`
  - `/api/projects`
  - `/api/billable-expenses`
- The corresponding services are referenced by those V2 routes:
  - `vendorService.js`
  - `customerService.js`
  - `invoiceService.js`
  - `billService.js`
  - `projectService.js`
  - `billableExpenseService.js`
- `Docs/API_ROUTE_INVENTORY.md` correctly classifies these as legacy V2 business-tier surfaces.
- `Docs/V3_ROUTE_INVENTORY.md` lists customers, vendors, projects, bills, AR/AP, and billable expenses as gated placeholder/locked pages.

Impact:

- This code is not dead in a technical sense, but it is product-dormant by default.
- Leaving dormant feature code mounted behind one env flag is acceptable only if the product decision is explicit and tested.

Suggested fix:

- Keep the V2 business surface in a "feature-gated dormant" bucket.
- Add a reachability inventory with route, env flag, entitlement, expected UI status, and required tests.
- If the product is not going to ship these soon, consider removing the routes from production builds or moving them behind a stronger internal-only feature gate.

### Medium - Active Static `public/html` Surface Is Small But Still Publicly Served

Evidence:

- `server.js` builds `htmlPageNames` from every `public/html/*.html` file.
- For non-V3 and non-blocked V2 pages, `server.js` serves canonical bare routes from `public/html`.
- Current `public/html` files include SEO/content pages:
  - `schedule-c-bookkeeping.html`
  - `t2125-bookkeeping-canada.html`
  - `quickbooks-alternative-for-solo-operators.html`
  - `spreadsheet-alternative-bookkeeping.html`
  - `cpa-ready-export.html`
  - `redacted-export-history.html`
  - `invoice-replies-bookkeeping.html`
  - `estimated-tax-reminders.html`
- It also includes gated placeholders:
  - `customers.html`
  - `vendors.html`
  - `projects.html`
  - `bills.html`
  - `ar-ap.html`
  - `billable-expenses.html`
- `review.html` is a small redirect/helper page with inline script.

Impact:

- This is not legacy archived code. It is an active public/static surface and should stay in the review scope.
- It needs a different standard than V3 app code: SEO copy, links, CSP, metadata, no accidental app behavior.

Suggested fix:

- Keep `public/html` reviewed separately from `legacy/public-html`.
- Add a static route inventory test that asserts which `public/html` pages are reachable, blocked, or redirected.
- Make sure public copy does not overstate features that are only placeholders or dormant V2 routes.

### Medium - PDF Worker Client Remains A True Orphan In The API

Evidence:

- Earlier passes found `services/pdfWorkerClient.js` exports `dispatchPdfJob`.
- Current scan again found no active source imports `pdfWorkerClient` or `dispatchPdfJob`.
- `routes/exports.routes.js` imports `jweDecryptService.js` and in-process PDF generation paths, not the worker client.
- `pdf-worker` exists as a separate deployable package with its own Dockerfile and docs.

Impact:

- Unlike V2 business routes, this is not just feature-gated dormant code. The API client is present but disconnected.
- It creates a false architecture signal: a reader can think PDF generation is isolated in a worker when the API does not actually dispatch jobs there.

Suggested fix:

- Either reconnect the worker intentionally or mark `pdfWorkerClient.js` and worker docs as inactive/reference architecture.
- Do not leave the client in active services without an owner test proving the API can call it.

### Low/Medium - V3 Source Appears Reachable Through `App.tsx`, But Static Analysis Must Be Type-Aware

Evidence:

- `frontend-v3/src/App.tsx` imports page components and core APIs directly, including Transactions, Accounts, Categories, Receipts, Exports, Mileage, Invoices, Messages, Analytics, Settings, Subscription, BusinessWorkspaces, auth pages, legal pages, `PlanProvider`, `authApi`, `inactivityMonitor`, and `i18n`.
- Local V3 TypeScript check passed earlier with `npx tsc -b --noEmit`.
- A simple filename-based reachability script falsely reported many V3 files as unreferenced because V3 uses extensionless TypeScript imports.

Impact:

- V3 dead-code review should not rely on ad hoc filename grep alone.
- The right tools are TypeScript, bundler analysis, ESLint unused exports/imports, and focused manual review.

Suggested fix:

- Add a V3 dead-code check with a TypeScript-aware tool or stricter ESLint rules.
- Treat `frontend-v3/src` as active unless type-aware tooling or manual review proves otherwise.

## Pass 12 - Duplication And Architecture Boundary Review

Status:

- Scope: copied validation, route ownership patterns, email delivery setup, app URL builders, storage/file handling, frontend global UI state, navigation/reload behavior, and active-vs-legacy owner drift.
- This pass did not modify source code.

### Medium/High - UUID And Primitive Validation Are Duplicated Across Many Routes

Evidence:

- UUID regexes or `isUuid` helpers appear repeatedly in:
  - `routes/accounts.routes.js`
  - `routes/bank-connections.routes.js`
  - `routes/billable-expenses.routes.js`
  - `routes/bills.routes.js`
  - `routes/categories.routes.js`
  - `routes/customers.routes.js`
  - `routes/invoices.routes.js`
  - `routes/invoices-v1.routes.js`
  - `routes/messages.routes.js`
  - `routes/mileage.routes.js`
  - `routes/plaid.routes.js`
  - `routes/projects.routes.js`
  - `routes/receipts.routes.js`
  - `routes/recurring.routes.js`
  - `routes/review.routes.js`
  - `routes/sessions.routes.js`
  - `routes/supportArtifacts.routes.js`
  - `routes/transactions.routes.js`
  - `routes/vendors.routes.js`
  - `services/invoiceEmailService.js`
  - `services/supportEmailService.js`
- The regexes are not identical everywhere. Example: `sessions.routes.js` only accepts UUIDs with a version-4 nibble, while most route regexes accept versions 1-5.
- Several routes also define local `isValidDateOnly`, currency checks, status sets, and route payload validators.

Impact:

- Basic validation behavior can drift by route.
- This is a common source of "works here, fails there" bugs and makes security review noisy.

Suggested fix:

- Create a shared validation module for UUID, date-only, currency code, status enum, amount, and safe string validation.
- Replace local route regexes gradually in focused batches.
- Add tests proving the shared validators preserve existing accepted/rejected examples before migration.

### Medium - V2 Business Routes Repeat The Same CRUD Scaffold

Evidence:

- V2 Business route files repeat the same structure:
  - `router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement)`
  - route-local `UUID_RE`
  - route-local `isUuid`
  - route-local payload validation
  - route-local `formatRouteError`
  - optional `normalizeV2Metadata`
  - list/create/get/update/delete handlers
- Affected files:
  - `vendors.routes.js`
  - `customers.routes.js`
  - `projects.routes.js`
  - `bills.routes.js`
  - `billable-expenses.routes.js`
  - `invoices.routes.js`

Impact:

- The dormant V2 surface is internally repetitive enough that any hardening change has to be copied across files.
- Because this code is feature-gated and not daily-used, copy/paste drift is more likely to survive unnoticed.

Suggested fix:

- If V2 Business is kept, extract a small V2 route helper for auth/entitlement/CSRF/limiter setup, UUID validation, metadata validation, and error formatting.
- If V2 Business is not a near-term product priority, do not over-engineer it. Keep it gated and document it as dormant until product direction is decided.

### Medium - Business Scope Resolution Is Repeated Handler-By-Handler

Evidence:

- Many routes repeatedly call `resolveBusinessIdForUser(req.user)` inside each handler:
  - `analytics.routes.js`
  - `bank-connections.routes.js`
  - `billing.routes.js`
  - `business.routes.js`
  - `exports.routes.js`
  - `mileage.routes.js`
  - `recurring.routes.js`
  - `review.routes.js`
  - `supportArtifacts.routes.js`
  - `transactions.routes.js`
  - `vehicleClaims.routes.js`
- V2 routes instead rely on `requireV2BusinessEnabled` to set `req.business.id`.
- Receipt routes use their own request-scoped `_receiptsBusinessId` pattern.

Impact:

- Business scoping is one of the highest-risk ownership boundaries in the app, but the calling convention varies by route family.
- This makes it harder to prove cross-business isolation consistently.

Suggested fix:

- Introduce a shared middleware that resolves and attaches the active business scope for normal authenticated business routes.
- Keep special cases explicit, but make the common path obvious: `req.business.id`.
- Add route inventory tests that assert every business-scoped route uses the shared scope owner or has a documented exception.

### Medium - Resend Client And Sender Configuration Are Duplicated Across Routes/Services

Evidence:

- Local Resend client setup appears in many files:
  - `routes/auth.routes.js`
  - `routes/billing.routes.js`
  - `routes/businesses.routes.js`
  - `routes/email.routes.js`
  - `routes/invoices-v1.routes.js`
  - `routes/messages.routes.js`
  - `routes/supportEmail.routes.js`
  - `services/bookkeepingEmailService.js`
  - `services/emailReminderService.js`
  - `services/exportEmailService.js`
  - `services/invoiceOwnerEmailService.js`
  - `services/privacyEmailService.js`
  - `services/usageLimitEmailService.js`
- Sender fallback logic is repeated as `RESEND_FROM_EMAIL || EMAIL_FROM || "InEx Ledger <noreply@inexledger.com>"`.
- Some files cache the Resend client, some instantiate a new client, and some throw on missing API key differently.

Impact:

- Email behavior can diverge across auth, billing, reminders, exports, privacy, invoices, support, and business lifecycle notifications.
- This also makes environment validation harder because every sender path has its own fallback and failure behavior.

Suggested fix:

- Create a central mail provider module for:
  - Resend client construction/cache
  - sender fallback resolution
  - reply-to formatting
  - missing-key behavior
  - safe logging around delivery failures
- Move email-template ownership separately from provider plumbing so the module does not become a giant email monolith.

### Medium - App URL Builders Are Reimplemented With Different Production Rules

Evidence:

- URL builder logic appears in:
  - `routes/auth.routes.js`
  - `routes/billing.routes.js`
  - `routes/businesses.routes.js`
  - `services/bookkeepingEmailService.js`
  - `services/emailPreferencesService.js`
  - `services/emailReminderService.js`
  - `services/exportEmailService.js`
  - `services/invoiceOwnerEmailService.js`
  - `services/privacyEmailService.js`
- Some builders fall back to `FRONTEND_URL` or `https://www.inexledger.com`.
- Others require `APP_BASE_URL` and enforce HTTPS.

Impact:

- A link generated by one subsystem can be valid while another subsystem fails startup or emits a wrong origin.
- This is risky for auth, billing, support, unsubscribe, export, and privacy emails.

Suggested fix:

- Centralize app URL resolution in one module.
- Define one production policy: required `APP_BASE_URL`, HTTPS-only in production, explicit dev fallback.
- Replace local builders gradually and add tests for production/dev/malformed env behavior.

### Medium - Storage And File Cleanup Boundaries Are Split Across Routes And Services

Evidence:

- Receipt storage has a service owner: `services/receiptStorage.js`.
- Support artifact storage has a service owner: `services/supportArtifactStorage.js`.
- Export storage has a service owner: `services/exportStorage.js`.
- But cleanup and path checks still happen in multiple route files:
  - `routes/me.routes.js` unlinks receipt files during account delete.
  - `routes/businesses.routes.js` unlinks receipt files during business delete.
  - `routes/privacy.routes.js` defines its own `isManagedExportPath` and unlinks receipt/export files.
  - `routes/receipts.routes.js` defines local `safeUnlink`, pending-delete rename behavior, and mirror writes.
  - `routes/supportArtifacts.routes.js` writes and unlinks support artifact files directly.

Impact:

- File lifecycle behavior is not fully owned by the storage modules.
- Delete/export/privacy flows are high-risk, so duplicated cleanup logic increases the chance of leaving orphaned files or deleting the wrong file.

Suggested fix:

- Move lifecycle operations into storage services:
  - save
  - stream/read
  - mark pending delete
  - restore pending delete
  - delete managed file
  - bulk cleanup by business/user
- Keep routes responsible for authorization and HTTP responses, not filesystem details.

### Medium - Frontend Modal Body-Class Ownership Is Repeated Per Page

Evidence:

- V3 pages independently toggle `document.body.classList.toggle('modal-is-open', ...)` in:
  - `Accounts.tsx`
  - `Categories.tsx`
  - `Receipts.tsx`
  - `Mileage.tsx`
  - `Invoices.tsx`
  - `Messages.tsx`
  - `Exports.tsx`
  - `BusinessWorkspaces.tsx`
  - `Transactions.tsx`
- Each page also removes the class in its own effect cleanup.

Impact:

- Multiple overlays or fast navigation can fight over a global body class.
- This kind of duplicated UI ownership leads to scroll-lock and modal-state bugs.

Suggested fix:

- Add a small `useBodyClass` or `useModalBodyLock` hook with reference-counting or owner tracking.
- Replace page-local body-class effects gradually.

### Low/Medium - Frontend Navigation Has Several Owners

Evidence:

- `App.tsx` owns most in-app path normalization and navigation.
- `apiClient.ts` owns session-expired redirects to login.
- `PlanGate.tsx` calls `window.location.assign('/upgrade')`.
- `billingApi.ts` calls `window.location.assign(data.url)` for Stripe redirects.
- `AppShell.tsx` and `Settings.tsx` still call `window.location.reload()`.

Impact:

- Some full-page navigations are appropriate, especially Stripe external redirects.
- But route changes, auth redirects, plan gating, and reloads are split across several files, making SPA behavior harder to reason about.

Suggested fix:

- Keep Stripe external redirects in billing API code.
- Move internal navigation/plan redirects behind a small navigation helper or app-level callback.
- Replace full reloads with state refresh wherever practical.

### Low/Medium - V3 API Modules Repeat Request Body Serialization

Evidence:

- V3 API modules repeatedly construct `body: JSON.stringify(...)`:
  - `accountsApi.ts`
  - `authApi.ts`
  - `billingApi.ts`
  - `businessesApi.ts`
  - `categoriesApi.ts`
  - `exportsApi.ts`
  - `invoicesApi.ts`
  - `messagesApi.ts`
  - `mileageApi.ts`
  - `receiptsApi.ts`
  - `settingsApi.ts`
  - `transactionsApi.ts`
- There is already a central `apiClient.ts`, but callers still manage serialization and payload shape manually.

Impact:

- This is not urgent, but it creates repetitive code and inconsistent call-site style.
- It also makes it easier to forget method/body conventions for future endpoints.

Suggested fix:

- Extend `apiRequest` with a `json` option that serializes and sets headers consistently.
- Keep `FormData` and blob requests as explicit exceptions.

---

## Pass 13 - V3 UX, Product Copy, and Frontend Polish

Scope:

- Reviewed V3 user-facing copy, placeholder states, destructive confirmations, and polish signals.
- Treated `frontend-v3` as the frontend truth.
- Treated `public/html` V2 Business pages only as active static/product surface when their feature flag enables them.
- Did not wire, revive, or edit the archived legacy frontend.

Commands:

```powershell
rg -n 'placeholder|coming soon|we will|together next|TODO|FIXME|AI|slop|magic|just|obviously|simple|easy|calm|beautiful|delight|lorem|dummy|test|mock|not available|not yet|soon|beta|experimental|upgrade|Business Tier|basic|pro' In-Ex-Ledger-API\frontend-v3\src --glob '*.tsx' --glob '*.ts'
rg -n '<h1|<h2|<p>|placeholder=|aria-label=|title=|empty|error|Unable|Loading|No .* found|Try|This page|ready|will|need|must' In-Ex-Ledger-API\frontend-v3\src\pages In-Ex-Ledger-API\frontend-v3\src\components
rg -n 'window.alert|confirm\(|prompt\(|console\.|debug|TODO|FIXME|window\.location\.reload|document\.body\.classList|dangerouslySetInnerHTML' In-Ex-Ledger-API\frontend-v3\src
rg -n 'not available|not yet|coming soon|we will|placeholder|decide whether|roadmap|This workflow|available in the current product' In-Ex-Ledger-API\public\html --glob '*.html'
```

Status:

- V3 has no obvious `console.*` or `dangerouslySetInnerHTML` usage in the scanned source.
- V3 does contain several production-polish issues: placeholder route copy, browser-native destructive prompts, roadmap language in static product pages, and tax/accounting help content embedded directly in React.

### Medium/High - Placeholder Route Copy Still Exists In V3

Evidence:

- `frontend-v3/src/App.tsx` imports `PlaceholderPage`.
- `frontend-v3/src/App.tsx` returns `<PlaceholderPage {...pageProps} />` as the final fallback in `renderPage`.
- `frontend-v3/src/pages/PlaceholderPage.tsx` renders:
  - `This page is ready in the navigation. We will design and build it together next.`

Impact:

- This is classic prototype/slop wording.
- Even if the normal route map makes it hard to reach, a production app should not have a fallback that tells users the page will be designed later.
- It also hides routing mistakes by rendering a placeholder instead of a clear not-found or unsupported page.

Suggested fix:

- Replace `PlaceholderPage` with a professional not-found/unsupported route, or remove it if every valid page is explicitly handled.
- Add a V3 route exhaustiveness check so missing pages fail in development/tests instead of falling into product-copy debt.

### Medium/High - Destructive Workflows Use Browser-Native Confirm/Alert

Evidence:

- `frontend-v3/src/pages/Exports.tsx` uses `window.confirm` before deleting export history.
- `frontend-v3/src/pages/Invoices.tsx` uses `window.confirm` before deleting invoices.
- `frontend-v3/src/pages/Messages.tsx` uses `window.confirm` before deleting message threads.
- `frontend-v3/src/pages/Mileage.tsx` uses `window.confirm` before deleting mileage entries.
- `frontend-v3/src/pages/Settings.tsx` uses `window.confirm` before locking an accounting period.
- `frontend-v3/src/pages/Settings.tsx` uses `window.alert` after bulk transaction deletion, then `window.location.reload()`.

Impact:

- Browser dialogs are hard to style, hard to localize consistently, and weak for accessibility.
- They also make high-stakes actions feel unfinished, especially accounting locks and bulk deletion.
- Reloading after deletion discards app state and reinforces the feel of a patched-in workflow.

Suggested fix:

- Add a shared V3 confirmation modal with:
  - explicit title/body
  - typed confirm action
  - danger styling for destructive actions
  - optional typed confirmation for bulk delete/accounting lock
  - consistent loading/error state
- Replace `alert + reload` with local state refresh and an in-app toast/banner.

### Medium - Help Content Mixes Product Education, Tax Guidance, and Implementation Detail In One Component

Evidence:

- `frontend-v3/src/pages/Help.tsx` defines a large `helpItems` array directly inside the page component file.
- The business profile help includes long tax/accounting guidance such as:
  - cash vs. accrual advice
  - material participation explanations
  - NAICS guidance
  - default recommendations such as choosing cash when unsure
- The same component also owns filtering/search UI and rendering.
- The scanned file contains mojibake in user-facing copy, including corrupted apostrophes, dashes, and bullet characters.

Impact:

- This page is doing too much: product content, tax-adjacent guidance, search/filter behavior, and rendering.
- Tax-adjacent recommendations need product/legal/accounting review and versioned ownership, not hardcoded page prose.
- Mojibake in help text is visibly unprofessional and undermines trust.

Suggested fix:

- Move help content into a dedicated typed content module or CMS-like data file.
- Separate UI logic from reviewed help copy.
- Add a content review checklist for tax/accounting statements.
- Fix encoding before shipping Help as a polished support surface.

### Medium - Marketing Copy Overstates Maturity Relative To Current Audit Findings

Evidence:

- `frontend-v3/src/pages/Landing.tsx` claims:
  - `Clean books without the accounting headache.`
  - `export-ready records`
  - `Export anytime`
  - `US and Canada support`
  - CPA/tax-preparer export usefulness
  - Schedule C and T2125 support
- Earlier audit passes found unresolved product risks around:
  - `accounting_method` not driving recognition behavior
  - CPA matrix staleness
  - export support joins not fully matching transaction exclusion guards
  - inactive/disconnected PDF worker architecture claims
  - Spanish UI support not matching transactional email support

Impact:

- The copy is not necessarily false in every case, but it is ahead of the verified implementation in several business-critical areas.
- Tax/accounting apps need a tighter link between claims and tested behavior.

Suggested fix:

- Create a claims matrix for Landing, Upgrade, Help, and Export copy.
- For each claim, map it to tests or remove/soften it until the backing behavior is verified.
- Avoid strong tax-ready/export-ready language until accounting-method, tax-line, and export-support gaps are closed.

### Medium - V2 Business Static Pages Contain Roadmap/Placeholder Copy When Feature-Enabled

Evidence:

- `server.js` blocks V2 Business pages unless `ENABLE_V2_BUSINESS=true`.
- When enabled, static pages under `public/html` can be served.
- Several pages render copy such as:
  - `This workflow is not available in the current product.`
  - `we decide whether bills belong in the roadmap`
  - `we decide whether projects belong in the roadmap`
  - `we decide whether standalone customer management belongs in the roadmap`

Impact:

- This is not legacy frontend wiring, and it should not be treated as V3.
- Still, when the feature flag is enabled, these pages become user-facing product surface.
- Roadmap/internal decision language reads unfinished and should not ship to customers.

Suggested fix:

- Keep these pages gated unless product explicitly wants them live.
- If enabled, rewrite them as professional unsupported-feature pages with clear navigation back to V3.
- Add an automated copy scan for `roadmap`, `coming soon`, `we decide`, and `we will design`.

### Low/Medium - Some In-App Copy Exposes Implementation Details

Evidence:

- `frontend-v3/src/pages/Sessions.tsx` says:
  - `Session controls are connected to the auth backend. Removing a session revokes that cookie.`
- `frontend-v3/src/pages/Accounts.tsx` says Plaid is not available `on this deployment`.
- `frontend-v3/src/components/BankCsvHelp.tsx` says PDF statements require manual entry `for now`.
- `frontend-v3/src/pages/Messages.tsx` tells users to `Try again or refresh the page.`

Impact:

- These messages are more implementation-oriented than user-oriented.
- They make the product feel provisional even when the feature itself is working.

Suggested fix:

- Rewrite copy around user outcomes:
  - "Remove access from devices you no longer use."
  - "Bank connections are not available for this account."
  - "PDF statement import is not supported yet; enter those records manually."
  - "Could not load messages. Try again."
- Keep deployment/backend/cookie wording out of customer-facing UI unless it is required for security clarity.

### Low/Medium - Empty, Loading, and Error States Need A Shared V3 Standard

Evidence:

- V3 pages use many local phrases for empty/loading/error states:
  - `Unable to load...`
  - `Try again or refresh the page.`
  - `No help topics found`
  - `Loading messages...`
  - page-specific empty table blocks
- There is no obvious shared empty/error/loading component standard in the scanned pages.

Impact:

- The app is functional, but the UX voice varies by page.
- Shared state components would reduce copy drift, improve accessibility consistency, and make localization cleaner.

Suggested fix:

- Add shared V3 components for:
  - `EmptyState`
  - `InlineError`
  - `LoadingState`
  - `ConfirmDialog`
- Move page-specific text into typed props instead of repeating markup and behavior.

---

## Pass 14 - V3 Accessibility, Keyboard Behavior, and Responsive UI Risk

Scope:

- Reviewed V3 accessibility and interaction signals in `frontend-v3/src`.
- Focused on dialogs, menus, keyboard handling, table/card responsive behavior, focus styling, and test coverage.
- Did not modify app/source files.

Commands:

```powershell
rg -n 'onClick=|onKeyDown=|tabIndex|aria-|role=|<button|<input|<select|<textarea|<label|htmlFor|disabled=|autoFocus|dialog|modal|drawer|sheet' In-Ex-Ledger-API\frontend-v3\src --glob '*.tsx'
rg -n '<table|<thead|<tbody|<th|<td|aria-sort|scope=|role="table"|role="grid"' In-Ex-Ledger-API\frontend-v3\src --glob '*.tsx'
Select-String -Path In-Ex-Ledger-API\frontend-v3\src\pages\*.tsx,In-Ex-Ledger-API\frontend-v3\src\components\*.tsx -Pattern 'role="dialog"'
Select-String -Path In-Ex-Ledger-API\frontend-v3\src\pages\*.tsx,In-Ex-Ledger-API\frontend-v3\src\components\*.tsx -Pattern 'role="menu"|role="menuitem"'
Select-String -Path In-Ex-Ledger-API\frontend-v3\src\styles\index.css -Pattern ':focus|focus-visible|outline'
rg -n 'axe|accessibility|a11y|aria|keyboard|tab|focus' In-Ex-Ledger-API\frontend-v3 In-Ex-Ledger-API\tests --glob '*.test.*' --glob '*.spec.*' --glob '*.js' --glob '*.ts'
```

Status:

- V3 uses semantic controls in many places: real `<button>`, `<input>`, `<select>`, labels, `role="alert"`, and visible focus styling exist.
- There is no obvious accessibility test dependency in `frontend-v3/package.json` such as axe, Playwright accessibility checks, or Testing Library.
- The strongest risks are keyboard/focus behavior around modals, menu semantics, and responsive table transformations.

### Medium/High - Dialogs Declare Modal Semantics Without Shared Focus Management

Evidence:

- Many V3 surfaces use `role="dialog"` and `aria-modal="true"`:
  - `Accounts.tsx`
  - `Analytics.tsx`
  - `BusinessWorkspaces.tsx`
  - `Categories.tsx`
  - `Exports.tsx`
  - `Invoices.tsx`
  - `Messages.tsx`
  - `Mileage.tsx`
  - `Receipts.tsx`
  - `Settings.tsx`
  - `Subscription.tsx`
  - `Transactions.tsx`
  - `TrialSetup.tsx`
  - `UpgradePrompt.tsx`
- `rg -F "Escape"` found no V3 dialog escape-key handling.
- `rg -F "focus("` found focus handling only in `MfaChallenge.tsx`, not in shared modal/drawer code.
- Dialog/drawer implementations are repeated per page instead of sharing one accessibility-controlled primitive.

Impact:

- `aria-modal="true"` tells assistive technology a modal interaction is active, but the code does not appear to consistently:
  - move focus into the dialog
  - trap tab focus inside the dialog
  - restore focus to the opener on close
  - close on Escape
  - prevent background interaction for keyboard users
- This is not just polish; broken modal focus can make core workflows hard or impossible for keyboard and screen-reader users.

Suggested fix:

- Add one shared `Dialog`/`Drawer` primitive with:
  - focus capture and restore
  - Escape handling
  - inert/background hiding strategy where supported
  - consistent `aria-labelledby`/`aria-describedby`
  - scroll lock ownership
- Migrate existing V3 modals/drawers to that primitive page by page.

### Medium - ARIA Menu Roles Are Used Without Menu Keyboard Behavior

Evidence:

- `components/AppShell.tsx` uses:
  - `role="menu"` for the business dropdown
  - `role="menuitem"` for business entries
  - `role="menu"` and `role="menuitem"` for the user dropdown
- `Invoices.tsx` and `Mileage.tsx` use `role="menu"` for row action menus.
- `rg -F "onKeyDown"` found V3 keyboard handling only in `MfaChallenge.tsx`.

Impact:

- ARIA menu roles imply desktop-app menu behavior: arrow keys, Home/End, Escape, focus movement, and correct focus placement.
- Current menus appear to behave like button-triggered popovers with clickable buttons, not full ARIA menus.
- Using ARIA roles without the matching keyboard contract can make screen-reader behavior worse than plain semantic buttons.

Suggested fix:

- Either implement proper menu keyboard behavior in a shared `Menu` component, or remove `role="menu"`/`role="menuitem"` and treat these as simpler popovers containing normal buttons.
- Add keyboard tests for:
  - open menu
  - arrow through items if menu roles remain
  - Escape close
  - focus return to trigger

### Medium - Responsive Tables Depend On CSS-Generated Labels

Evidence:

- V3 table rows use `data-label` extensively; scan counted 48 `data-label=` instances in V3 page tables.
- `styles/index.css` at the mobile breakpoint changes `table`, `thead`, `tbody`, `tr`, `th`, and `td` to `display: block`.
- The same CSS hides `thead` visually and uses `td::before { content: attr(data-label); }`.

Impact:

- CSS-generated labels are visual only and may not be exposed consistently to assistive technology.
- The semantic table relationship may also become harder to reason about once table elements are restyled as blocks.
- This pattern can be acceptable, but it needs browser/screen-reader verification because it is used across financial tables.

Suggested fix:

- Add accessibility QA for mobile table/card views.
- Prefer explicit visible label elements in each mobile row if screen-reader behavior is not verified.
- Add automated checks that every table cell in mobile-card tables has either an accessible label or a preserved header relationship.

### Medium - No Automated Accessibility Gate For V3

Evidence:

- `frontend-v3/package.json` includes Vite, React, TypeScript, ESLint, and React hook linting only.
- No axe, Playwright accessibility scan, Testing Library, or equivalent accessibility test dependency is present.
- Existing tests include some source-level ARIA checks in `tests/frontendV3Wiring.test.js` and `tests/i18nCoverage.test.js`, but not a browser-level accessibility audit.

Impact:

- Accessibility regressions can land even if TypeScript, lint, and i18n checks pass.
- This is especially risky because V3 uses custom drawers, modals, menus, responsive financial tables, and dynamic i18n DOM mutation.

Suggested fix:

- Add a small Playwright + axe smoke suite for:
  - public landing/login/register
  - authenticated shell
  - Transactions with drawer open
  - Settings danger-zone modal
  - Messages compose/detail modal
- Run it in CI after the V3 build.

### Low/Medium - Focus Styling Exists But Some Controls Locally Reset Outline

Evidence:

- `styles/index.css` defines global `:focus-visible` outlines for `button`, `input`, `select`, and `textarea`.
- The same file also contains local `outline: 0` rules around specific custom controls.

Impact:

- The global focus rule is good.
- Local outline resets are not automatically wrong, but they should be reviewed to ensure an equivalent visible focus treatment remains in every custom control state.

Suggested fix:

- Add a stylelint or CSS review rule: no `outline: 0` unless the selector also has an explicit `:focus-visible` replacement.
- Include keyboard tab-through screenshots in the V3 accessibility smoke test.

### Low/Medium - Mobile Navigation Lacks Documented Keyboard Close Behavior

Evidence:

- `AppShell.tsx` opens the mobile sidebar with a button and closes it through a backdrop button or navigation.
- No Escape-key handler was found in V3.
- The mobile sidebar is visually handled with fixed positioning and a backdrop in `styles/index.css`.

Impact:

- Pointer users likely have a clear close path.
- Keyboard users may have to tab through the entire open sidebar/backdrop state rather than pressing Escape or having focus constrained.

Suggested fix:

- Fold mobile nav into the same shared overlay primitive as dialogs/drawers, or add equivalent focus/escape behavior.
- Test open/close behavior with keyboard only at mobile viewport sizes.

---

## Pass 15 - Performance, Bundle Hygiene, and Runtime Efficiency

Scope:

- Reviewed V3 build configuration, generated V3 assets, static serving, frontend request fan-out, polling, and lightweight runtime efficiency signals.
- Kept archived legacy frontend out of scope.
- Did not run a production rebuild, because that would rewrite generated app assets under `public/app-v3`.

Commands:

```powershell
Get-ChildItem -Path In-Ex-Ledger-API\public\app-v3 -Recurse -File | Sort-Object Length -Descending | Select-Object -First 20 FullName,Length
Get-Content -Path In-Ex-Ledger-API\frontend-v3\vite.config.ts
Get-Content -Path In-Ex-Ledger-API\frontend-v3\src\main.tsx
Select-String -Path In-Ex-Ledger-API\server.js -Pattern 'express.static|setStaticAssetCacheHeaders|compression|Cache-Control|etag|app.use\(express.json|limit:' -Context 2,5
rg -n 'function load|export async function load|Promise\.all\(' In-Ex-Ledger-API\frontend-v3\src\lib --glob '*.ts'
rg -n 'limit=500|limit=1000|include_inactive=true|review/queue|unread-count|setInterval|POLL_INTERVAL|poll' In-Ex-Ledger-API\frontend-v3\src In-Ex-Ledger-API\routes In-Ex-Ledger-API\services --glob '*.ts' --glob '*.tsx' --glob '*.js'
```

Status:

- V3 build output currently contains one large JS bundle and one CSS bundle:
  - `public/app-v3/assets/index-BBFqOsTs.js`: 765,222 bytes raw, about 202,801 bytes gzip
  - `public/app-v3/assets/index-CZPpTlwL.css`: 88,825 bytes raw, about 15,736 bytes gzip
- `frontend-v3` has no bundle analyzer, performance budget, Lighthouse budget, or code-splitting configuration.
- Server uses static cache headers, but current cache detection does not line up with Vite hashed filenames.

### Medium/High - V3 Ships As One Eager All-Pages JavaScript Bundle

Evidence:

- `frontend-v3/src/App.tsx` eagerly imports every page at startup:
  - `Transactions`
  - `Accounts`
  - `Categories`
  - `Receipts`
  - `Exports`
  - `Mileage`
  - `Invoices`
  - `Messages`
  - `Analytics`
  - `Settings`
  - public/auth/legal pages
  - onboarding/help/upgrade flows
- `vite.config.ts` has no `manualChunks` or route-level splitting setup.
- Generated V3 JS bundle is currently `765,222` bytes raw and about `202,801` bytes gzip.

Impact:

- Anonymous visitors, login users, and authenticated ledger users all pay for most page code up front.
- Large route/controller components make this worse because page-specific UI, forms, copy, and helpers are bundled into the first load.
- As V3 grows, this becomes a launch performance and mobile performance problem.

Suggested fix:

- Use `React.lazy`/`Suspense` or route-level dynamic imports for non-initial pages.
- Split public/auth pages from authenticated app pages.
- Split heavy authenticated pages such as `Transactions`, `Settings`, `Messages`, `Analytics`, and `Exports`.
- Add a bundle-size budget in CI before optimizing aggressively.

### Medium/High - Static Asset Cache Policy Does Not Match Vite Hashed Assets

Evidence:

- Vite emits hashed assets such as:
  - `index-BBFqOsTs.js`
  - `index-CZPpTlwL.css`
- `server.js` only sets immutable caching when a JS/CSS/MJS request has a `?v` query parameter:
  - `Object.prototype.hasOwnProperty.call(requestQuery, 'v')`
- Otherwise JS/CSS/HTML get:
  - `Cache-Control: private, no-store, max-age=0, must-revalidate`

Impact:

- Hashed Vite assets are already content-addressed and should be cacheable without a query parameter.
- The current policy can force repeat downloads of the 765 KB JS bundle and 89 KB CSS bundle.
- This undercuts the value of Vite's hashed asset output.

Suggested fix:

- Treat `/app-v3/assets/*` files with hashed filenames as immutable.
- Keep HTML entry points `no-store`.
- Keep tests in `tests/staticAssetCacheHeaders.test.js` but update them to cover Vite hashed asset URLs without `?v`.

### Medium - No Server-Side Compression For Large Static Assets

Evidence:

- `package.json` does not include `compression`.
- `server.js` uses `helmet` and `express.static`, but no `compression()` middleware was found.
- Current V3 JS bundle is about `765 KB` raw and `203 KB` gzip when compressed manually.

Impact:

- If the deployment platform does not automatically compress responses, the app may ship raw JS/CSS.
- Even if the platform compresses, the repo does not document or test that assumption.

Suggested fix:

- Confirm whether the production host handles gzip/Brotli for static assets.
- If not, add compression middleware or precompressed asset serving.
- Add a deployment smoke check for `Content-Encoding` on `/app-v3/assets/*.js`.

### Medium - Transactions Page Load Fans Out Into Six API Requests

Evidence:

- `frontend-v3/src/lib/transactionsApi.ts` loads the Transactions page with `Promise.all` across:
  - `/api/transactions?...`
  - `/api/accounts?limit=500&offset=0`
  - `/api/categories?limit=500&offset=0&include_inactive=true`
  - `/api/business`
  - `/api/review/queue`
  - `/api/recurring`

Impact:

- Transactions is the primary authenticated landing workflow.
- Six parallel calls may be acceptable locally, but it increases latency variance, auth/CSRF retry surface, and backend load.
- Some supporting datasets are broad (`limit=500`, inactive categories, full review queue) even when the user is viewing one page of transactions.

Suggested fix:

- Consider a purpose-built V3 dashboard/bootstrap endpoint for Transactions, or cache account/category/business metadata client-side.
- Paginate or scope review queue data to visible transactions unless the full queue is needed.
- Add timing instrumentation for first authenticated Transactions render.

### Medium - Frontend Polling Exists Without A Central Polling Policy

Evidence:

- `AppShell.tsx` polls unread counts every 60 seconds.
- `VerifyEmail.tsx` polls verification state every 3 seconds up to a max poll count.
- `Subscription.tsx` polls after checkout-related state changes.
- `inactivityMonitor.ts` uses a periodic timeout check.

Impact:

- None of these are obviously wrong in isolation.
- The risk is policy drift: polling intervals, visibility behavior, retry behavior, and cleanup are owned per feature.
- As the app grows, background tabs and multi-tab sessions can create avoidable request load.

Suggested fix:

- Add a small polling utility that standardizes:
  - pause-on-hidden behavior where appropriate
  - jitter/backoff
  - max duration
  - cleanup
  - shared logging/metrics
- Keep security-sensitive inactivity behavior separate if needed, but document why.

### Medium - CSS Is Fully Global And Loaded For Every Route

Evidence:

- `frontend-v3/src/main.tsx` imports all style bundles globally:
  - `index.css`
  - `auth-core.css`
  - `billing-subscription.css`
  - `theme-dark.css`
- Generated CSS is currently `88,825` bytes raw.
- Earlier passes found `index.css` is a very large shared style file.

Impact:

- Every route pays for auth, billing, app shell, tables, modals, analytics, messages, and route-specific styles up front.
- Global CSS also increases regression risk because selector ownership is broad.

Suggested fix:

- First add a CSS ownership map and dead-selector audit.
- Then split route-specific styles only where it clearly reduces risk and bundle weight.
- Keep theme tokens global; move page-specific layout rules closer to their page/component.

### Low/Medium - No Performance Budget Or Bundle Analysis Gate

Evidence:

- `frontend-v3/package.json` has only:
  - `dev`
  - `build`
  - `lint`
- No analyzer or budget tooling was found.
- Main CI gaps were already found in Pass 5; this pass adds the performance angle.

Impact:

- Bundle growth, request fan-out, and runtime regressions can land without review.
- This is especially risky with route-sized page components and all-pages eager imports.

Suggested fix:

- Add a simple bundle budget check for built JS/CSS.
- Store current sizes as baseline, then ratchet down after route splitting.
- Add one Playwright performance smoke for first load and authenticated Transactions render timing.

---

## Pass 16 - API Contracts, Data Shapes, and Frontend/Backend Boundary

Scope:

- Reviewed V3 API client modules, route registration, contract tests, and backend response-shape signals.
- Focused on implicit contracts, legacy shape mapping, validation consistency, route naming/versioning, and contract test quality.
- Did not modify app/source files.

Commands:

```powershell
rg -n 'type Legacy|Legacy[A-Z]|map[A-Z].*\(|snake|camel|_[a-z]|apiRequest<|fetch\(' In-Ex-Ledger-API\frontend-v3\src\lib In-Ex-Ledger-API\frontend-v3\src\pages --glob '*.ts' --glob '*.tsx'
rg -n 'router\.(get|post|put|patch|delete)|res\.json|res\.status\([0-9]+\)\.json|module\.exports|validate|normalize|sanitize' In-Ex-Ledger-API\routes --glob '*.js'
rg -n 'OpenAPI|Swagger|zod|joi|yup|ajv|schema|contract|api contract|response shape|request shape' In-Ex-Ledger-API --glob '*.js' --glob '*.ts' --glob '*.json' --glob '*.md'
rg --files In-Ex-Ledger-API\tests | rg 'frontendV3|ApiContracts|contract|routes|schemas'
Get-Content -Path In-Ex-Ledger-API\tests\frontendV3ApiContracts.test.js
Get-Content -Path In-Ex-Ledger-API\routes\index.js
```

Status:

- There is a V3 API contract test file: `tests/frontendV3ApiContracts.test.js`.
- That test mostly locks contract assumptions by regexing frontend source files, not by validating real backend responses or shared schemas.
- No first-party OpenAPI/Swagger spec, runtime schema layer, or shared DTO package was found in the active app code.

### Medium/High - V3 API Boundary Depends On Many Client-Side Legacy Mappers

Evidence:

- V3 client modules define many `Legacy*` API shapes and then map them into UI models:
  - `authApi.ts`: `LegacyBusiness`, `LegacyUser`, `LegacySession`
  - `accountsApi.ts`: `LegacyAccount`
  - `categoriesApi.ts`: `LegacyCategory`
  - `invoicesApi.ts`: `LegacyInvoice`
  - `messagesApi.ts`: `LegacyMessage`
  - `mileageApi.ts`: `LegacyTrip`, `LegacyCost`, `LegacySummary`
  - `receiptsApi.ts`: `LegacyReceipt`, `LegacyTransaction`
  - `transactionsApi.ts`: `LegacyTransaction`, `LegacyCategoryOption`, `LegacyBusiness`, `LegacyRecurringTemplate`
  - `exportsApi.ts`: `LegacyHistory`
- These mappers convert snake_case backend fields into camelCase UI fields throughout the frontend.

Impact:

- The API contract is spread across many frontend files instead of being explicit at the boundary.
- Backend field changes can silently degrade UI behavior through fallbacks such as `|| ''`, `|| 'Client'`, `|| 'Uncategorized'`, and `Number(... || 0)`.
- The name `Legacy*` in V3 code is also a professionalism smell: V3 is the product truth, but its main data layer still reads as an adapter over old contracts.

Suggested fix:

- Introduce explicit V3 DTO names at the boundary, even if the backend still returns snake_case internally.
- Centralize normalization per resource in one contract module, not page-adjacent helpers.
- Add runtime validation for high-risk responses before mapping to UI models.

### Medium/High - Contract Tests Are Source-Regex Checks, Not Runtime Contract Checks

Evidence:

- `tests/frontendV3ApiContracts.test.js` reads TypeScript files from `frontend-v3/src`.
- It asserts regex patterns such as:
  - `type ListResponse = { ... }`
  - `params.set('category_id', filters.categoryId)`
  - `row.account_id`
  - `row.category_name`
- It does not call the Express routes, validate JSON responses, or share schemas with backend code.

Impact:

- These tests can pass while real backend responses drift.
- They are also brittle to harmless refactors, formatting changes, or moving mappers into cleaner modules.
- This matches the earlier test-quality finding: source-shape tests are useful as temporary guardrails, but they are not a professional contract strategy.

Suggested fix:

- Keep the current tests only as temporary migration guardrails.
- Add runtime contract tests that exercise route handlers with representative responses.
- For critical resources, validate:
  - required fields
  - optional field defaults
  - snake_case/camelCase policy
  - error envelope shape
  - pagination metadata

### Medium - API Versioning And Naming Are Inconsistent

Evidence:

- V3 frontend consumes unversioned API routes such as:
  - `/api/accounts`
  - `/api/categories`
  - `/api/transactions`
  - `/api/messages`
  - `/api/mileage`
- It also consumes explicitly versioned/legacy-looking routes:
  - `/api/invoices-v1`
- `routes/index.js` still conditionally mounts old V2 Business routes under names like `/vendors`, `/customers`, `/invoices`, `/bills`, `/projects`, and `/billable-expenses` when `ENABLE_V2_BUSINESS=true`.

Impact:

- It is hard to tell from route names which contract is current, which is compatibility, and which is feature-flagged legacy/business surface.
- `/api/invoices-v1` being the active V3 invoice endpoint is particularly confusing.
- Future V3 work can accidentally build against old API conventions because the boundary does not communicate lifecycle status.

Suggested fix:

- Document API lifecycle status per route:
  - active V3
  - compatibility
  - feature-flagged V2 Business
  - deprecated/retiring
- Consider adding `/api/v3/...` facades for V3-owned contracts before doing broad rewrites.
- Rename only after tests and redirects/adapters are in place; do not break existing clients casually.

### Medium - Error Envelopes Are Consistent Enough To Use, But Not Standardized

Evidence:

- Most backend routes return JSON errors shaped like `{ error: "..." }`.
- Some routes add extra fields such as `code`, `details`, `message`, `count`, `deleted`, `subscription`, or redirect fields.
- `apiClient.ts` expects error-like response data with:
  - `error?: string`
  - `code?: string`
  - `details?: unknown`
- Several route scans show direct inline response construction across route files rather than shared response helpers.

Impact:

- The common `{ error }` baseline is good.
- But without a standard error envelope, frontend code must guess which fields are stable and which are incidental.
- This becomes risky for billing, auth, imports, exports, and destructive actions where errors need precise handling.

Suggested fix:

- Define a shared API error envelope:
  - `error`
  - `code`
  - `details`
  - optional `fieldErrors`
  - optional `retryAfter`
- Add a helper for route errors and a test that enforces the envelope on V3-consumed routes.

### Medium - Client-Side Fallbacks Can Hide Backend Contract Regressions

Evidence:

- V3 mappers commonly substitute fallback values:
  - invoices: `row.customer_name || 'Client'`, `row.invoice_number || ''`
  - transactions: `row.category_name || 'Uncategorized'`, `row.account_name || 'Account'`
  - mileage: `row.destination || 'No destination'`, `row.vendor || 'No vendor'`
  - messages: `row.subject || 'No subject'`
  - auth/business: multiple fallbacks for active business and display names

Impact:

- Some UI fallbacks are necessary for resilience.
- But contract-critical fields should fail loudly in development/tests, not quietly become generic text.
- Silent fallbacks can mask broken joins, missing authorization scope, or partial API responses.

Suggested fix:

- Mark which fields are truly optional vs. contract-required.
- In development/test, log or throw on missing required API fields before mapping.
- Keep user-friendly fallbacks only after the missing-field condition is observable in tests/telemetry.

### Medium - Request Validation Is Hand-Rolled Per Route

Evidence:

- Route files contain many local validation/normalization functions and inline checks.
- Examples from scans include transaction payload validation, account/category ID validation, message type validation, invoice field checks, mileage field checks, and business profile normalization.
- No app-owned schema validation dependency was found in `package.json`.

Impact:

- Hand-rolled validation is workable, but consistency depends on route discipline.
- It is easy for similar fields to diverge across routes: UUIDs, dates, enum values, currency, money amounts, emails, pagination, and boolean flags.
- This ties into earlier duplication findings around primitive validation.

Suggested fix:

- Introduce small shared validators first, not a sweeping schema migration.
- Start with high-reuse primitives:
  - UUID
  - ISO date
  - currency
  - decimal money
  - pagination
  - region/province
  - plan/feature enums
- Consider schema validation later for route-specific DTOs once primitive cleanup is stable.

### Low/Medium - `__private` Exports Are Used Heavily For Testing Internals

Evidence:

- Several services and routes export internals via `__private`.
- `transactions.routes.js` exposes `module.exports.__private`.
- Tests import internal helpers from route/service modules directly.

Impact:

- This is a pragmatic testing pattern, and it can be useful.
- But heavy reliance on `__private` can freeze implementation details and discourage extracting testable services.
- Route modules become both HTTP adapters and helper libraries.

Suggested fix:

- Keep `__private` where it protects important legacy behavior during migration.
- For new work, prefer extracting pure helpers/services into named modules and testing those directly.
- Gradually retire `__private` exports from large route files as route responsibilities shrink.

## Pass 17 - Localization, Regionalization, Currency, And Unit Consistency

Scope:

- V3 language catalogs and runtime localization behavior.
- Backend transactional email language support.
- Region, currency, tax form, and locale defaults across V3 and API routes.
- US/Canada distance and tax-unit handling.

Positive signals:

- The codebase is not region-blind.
- V3 onboarding, accounts, analytics, billing, and several backend tax services already use region or currency in meaningful ways.
- Backend billing currency resolution is stricter than many other areas and intentionally ignores client-supplied currency in some payment flows.
- Region-aware tax service coverage exists for GST/HST, quick method, regular method, category gating, business profile normalization, and mileage rates.

### Medium/High - V3 Spanish And French Coverage Can Pass While Still Shipping English

Evidence:

- `npm run i18n:v3:check` passed with 1126 phrases.
- A direct phrase catalog comparison found:
  - Spanish: 95 of 1126 phrases are identical to English.
  - French: 113 of 1126 phrases are identical to English.
- Examples that remain identical include billing, account deletion, plan, onboarding, province, and help phrases.
- Core shell translations in `frontend-v3/src/lib/i18n.ts` also contain unaccented or English fallback text in Spanish/French-facing labels.

Impact:

- The current i18n check proves phrase presence, not translation quality or completeness.
- Spanish and French users can see mixed-language UI in important workflows.
- This weakens product trust because the app presents language selection as a real capability.

Suggested fix:

- Extend the i18n check to report identical-to-English strings per locale.
- Maintain a small allowlist for proper nouns, plan names, province names, and technical terms that should stay identical.
- Fail CI when non-allowlisted identity translations exceed a low threshold.
- Have a human/native review pass over Spanish and French catalog files after the mechanical gate is in place.

### High - App Allows Spanish, But Transactional Email Supports Only English/French

Evidence:

- `resolveBusinessIdForUser.js` accepts business language values `en`, `es`, and `fr`.
- V3 export UI exposes English, Spanish, and French.
- Backend `emailI18nService.js` defines `SUPPORTED = new Set(["en", "fr"])`.
- `normalizeEmailLang` falls back unsupported languages to English.
- `getPreferredLanguageForUser` chooses the first business for a user by `created_at ASC`, not necessarily the active business context.

Impact:

- A Spanish-language user can still receive English transactional email.
- Multi-business users may receive email in the language of an older business rather than the active business.
- This is especially risky for receipts, exports, billing, CSV imports, password/security flows, and support messages.

Suggested fix:

- Decide whether Spanish email is supported now.
- If yes, add Spanish templates and tests.
- If no, hide or qualify Spanish for surfaces that trigger transactional email until parity exists.
- Change preferred email language resolution to use active business context where available, with a documented fallback order.

### Medium/High - Export Defaults Can Mismatch Active Business Region And Language

Evidence:

- V3 `Exports.tsx` initializes export state with:
  - language: `en`
  - currency: `USD`
  - summary tax form: `Schedule C`
- Backend export route metadata also falls back to:
  - language: `en`
  - currency: `USD`
- Backend export generation derives jurisdiction from business region, but currency can still come from request metadata.

Impact:

- A Canadian business can start from US currency and Schedule C-facing defaults in the export UI.
- A Spanish/French user can initiate exports from English defaults.
- Server-side export behavior is partially business-derived and partially client-driven, which creates avoidable mismatch risk.

Suggested fix:

- Derive export language, currency, and tax form from active business server-side.
- Let the client display those resolved defaults instead of inventing them locally.
- Reject invalid combinations such as Canadian jurisdiction with USD-only tax export metadata unless explicitly supported.
- Add contract tests for US and Canada export defaults.

### Medium - Locale Formatting Is Scattered And Often Hardcoded To `en-US`

Evidence:

- `Exports.tsx` formats dates and money with `en-US`.
- `receiptsApi.ts` formats transaction link amounts with `en-US` and `currency: "USD"`.
- `transactionsApi.ts` formats short dates with `en-US`.
- `Mileage.tsx`, `Invoices.tsx`, and `Receipts.tsx` format dates with `en-US`.
- `Sessions.tsx` uses `toLocaleString()` without an explicit locale.
- `Analytics.tsx` has a better local CAD/USD helper, but that helper is not shared.

Impact:

- Region and language settings do not consistently affect displayed dates, money, or timestamps.
- Canadian businesses can see US date formatting in several workflows.
- USD/CAD handling depends on page-specific implementation instead of a single policy.

Suggested fix:

- Add a V3 formatting module for:
  - locale resolution from language and region
  - currency formatting
  - date and datetime formatting
  - distance formatting
- Replace page-local `toLocale*` calls with shared helpers.
- Add tests for `en-US`, `en-CA`, `fr-CA`, and Spanish-language display expectations.

### Medium - Mileage/Kilometer Regionalization Is Superficial In Some Data Paths

Evidence:

- V3 `Mileage.tsx` changes labels to "Kilometers" for Canadian businesses.
- The same page and API mapping still use names like `totalMiles`, `miles`, and `row.miles`.
- The mileage mapper ignores a possible `row.km` field and maps distance from `row.miles || 0`.
- Some validation/user copy still refers to miles.

Impact:

- The UI may display a numeric value as kilometers while the data path still treats it as miles.
- This is exactly the kind of regional defect that is hard to catch by visual inspection.
- Tax mileage claims are financially sensitive, so ambiguous units need stricter handling.

Suggested fix:

- Store and return an explicit distance unit with mileage records and summaries.
- Rename client-facing fields to neutral names such as `distance` and `distanceUnit`.
- Keep conversion, rates, and labels in one shared mileage domain helper.
- Add US and Canada tests that assert both numeric values and displayed units.

### Medium - Region/Currency Rules Are Fragmented Across Frontend And Backend

Evidence:

- Frontend pages define local region/currency helpers such as Canada checks, active currency lookup, and account currency resolution.
- Backend routes and services also define separate normalization and defaulting behavior.
- Some routes are strict about currency by region, while V2 Business routes accept broad three-letter currency values.

Impact:

- The system has enough regional logic to be useful, but not enough central ownership to be reliably consistent.
- New features can accidentally pick the wrong default by copying the nearest local helper.
- This is an overengineering smell in practice: many small local helpers solve the same domain rule differently.

Suggested fix:

- Define a small app-owned regional policy module.
- Start with stable primitives:
  - supported regions
  - default currency by region
  - tax form by region
  - locale by language and region
  - supported distance unit by region
- Use the shared policy from both frontend and backend where feasible, or mirror it through generated constants/tests if direct sharing is not practical.

### Low/Medium - Localization Tests Need Quality Gates, Not Just Presence Gates

Evidence:

- The phrase presence check passes despite many identity translations.
- Backend email i18n tests cover the existing English/French implementation but do not enforce Spanish parity because Spanish is not implemented there.
- Locale formatting is not covered by a central formatter test because no central formatter exists yet.

Impact:

- The current tests prevent missing catalog keys, which is useful.
- They do not prevent mixed-language UI, US-format leakage, or unsupported language fallbacks in production flows.

Suggested fix:

- Keep the existing phrase-key coverage.
- Add quality checks:
  - identity translation threshold
  - no unsupported app language in email flows
  - locale formatting tests
  - export default tests by region/language
  - mileage unit tests by region

Pass 17 status:

- No source changes made.
- No tests were run in this pass beyond targeted read-only inspection and phrase catalog counting.
- Localization and regionalization are functional in parts, but not yet professionally coherent end to end.

## Pass 18 - Observability, Logging, Diagnostics, And Operational Debugging

Scope:

- Backend logger and log sanitizer.
- Route-level error logging patterns.
- Global error handler behavior.
- Health and diagnostics routes.
- Audit event recording and audit-table shape.
- Production incident-readiness signals such as request correlation, structured logs, and crash handling.

Positive signals:

- `utils/logger.js` centralizes `logInfo`, `logWarn`, and `logError`.
- `utils/logSanitizer.js` redacts sensitive keys and masks email-like strings.
- `tests/logSanitizer.test.js` covers key redaction and email masking.
- `services/diagnosticsService.js` is intentionally designed to return booleans/counts instead of secrets or customer data.
- `/health` and `/api/system/diagnostics` exist.
- `audit_events`, `user_action_audit_log`, `privacy_consent_log`, and `cpa_audit_logs` show serious attention to auditability in several domains.

### Medium/High - Logs Have No Request Or Correlation ID

Evidence:

- No request ID middleware was found in `server.js`.
- No consistent `requestId`, `correlationId`, `traceId`, or `X-Request-ID` propagation was found across routes.
- The global error handler logs method/path/status/message, but not a stable ID that can be returned to the client.

Impact:

- A user-facing 500 cannot be reliably tied to one log line or a chain of downstream events.
- Multi-request workflows such as login, export generation, billing checkout, CSV import, receipt upload, and support messages are hard to reconstruct.
- This becomes a production support problem before it becomes a code problem.

Suggested fix:

- Add request ID middleware early in the Express stack.
- Accept trusted incoming `X-Request-ID` only if it meets a strict format/length policy; otherwise generate one.
- Attach it to `req.id`, response headers, and every log context.
- Return it in 5xx error responses as `requestId` so support can ask users for it.

### Medium/High - Logger Is Console-Based Text, Not Structured Production Logging

Evidence:

- `utils/logger.js` writes formatted strings to `console.info`, `console.warn`, and `console.error`.
- Context is JSON-stringified and appended to a text prefix such as `[InEx][ERROR]`.
- No `pino`, `winston`, OpenTelemetry, Sentry, Datadog, New Relic, or metrics dependency was found in backend or V3 package metadata.

Impact:

- Logs are partially structured but not first-class JSON log events.
- Searching by fields such as `businessId`, `userId`, `requestId`, `route`, `errorCode`, or `stripeEventId` depends on provider text parsing.
- Alerting and dashboards are much harder to build cleanly.

Suggested fix:

- Keep the current logger facade, but change its output implementation to structured JSON events.
- Standard fields should include:
  - timestamp
  - level
  - message
  - requestId
  - route or operation
  - userId/businessId where safe and useful
  - error code/name/message
- Avoid a sweeping vendor integration until field ownership is clean.

### Medium/High - Route Error Logging Is Inconsistent And Often Passes Raw Errors

Evidence:

- Many routes call `logError("... error:", err)` directly.
- Many others call `logError("... error:", err.stack || err)`.
- Examples include `auth.routes.js`, `transactions.routes.js`, `invoices-v1.routes.js`, `receipts.routes.js`, `analytics.routes.js`, `accounts.routes.js`, `business.routes.js`, `capitalAssets.routes.js`, `system.routes.js`, and others.
- The sanitizer handles plain objects and strings, but raw `Error` objects do not serialize cleanly through `JSON.stringify`, and raw stack strings bypass field-level error structure.

Impact:

- Some errors may log as `{}` or unstructured stack text.
- Error names, database codes, Stripe codes, and route context can be lost.
- Sensitive values embedded in stack/message strings are harder to reliably sanitize than structured context fields.

Suggested fix:

- Add a `serializeError(err)` helper used by the logger or route wrapper.
- Emit a structured shape:
  - `name`
  - `message`
  - `code`
  - `status`
  - optional stack in non-production only
- Convert route catches toward `logRouteError(req, operation, err, context)`.

### Medium - Audit Event Recording Is Best-Effort And Silent On Failure

Evidence:

- `services/auditEventService.js` explicitly states audit insert failures must not break the caller.
- `recordAuditEvent` catches insert errors and returns `null` without logging.
- Sensitive flows use audit events, including login, session revocation, billing checkout, exports, support requests, onboarding, password changes, and email changes.

Impact:

- Best-effort audit is reasonable for some low-risk actions.
- But completely silent audit failure means the app can lose security/compliance records without any operational signal.
- If the `audit_events` table, permissions, or migration state breaks, production may not know until a user asks for history.

Suggested fix:

- Keep audit events non-blocking for normal user flows.
- Log a sanitized warning/error when audit insert fails, with action and request ID.
- Add a health/diagnostics flag for recent audit-write failures.
- Consider making audit writes blocking for a small set of security-critical flows if compliance expectations require it.

### Medium - Audit Trails Are Split Across Several Tables And Services

Evidence:

- General security/product events use `audit_events`.
- Privacy flows write `user_action_audit_log` and `privacy_consent_log`.
- CPA/access history uses `cpa_audit_logs`.
- These tables have different route/service ownership and different retention/query surfaces.

Impact:

- Multiple audit tables can be legitimate domain design.
- The risk is operational: support, compliance export, account deletion, and incident review need to know which table is authoritative for which event.
- This also explains some migration complexity around audit immutability and foreign keys.

Suggested fix:

- Document an audit event map:
  - table
  - owning service
  - event types
  - retention/immutability policy
  - user-visible export behavior
- Add a small audit coverage test that asserts critical actions are still recorded in the intended table.

### Medium - Diagnostics Are Useful But Not Incident-Grade Yet

Evidence:

- `services/diagnosticsService.js` reports app version, commit, uptime, migration stats, rate limiting, receipt storage, email, Stripe, encryption, and auth configuration booleans.
- `/api/system/diagnostics` is auth-required but not visibly admin/support-role restricted in `system.routes.js`.
- Diagnostics do not include recent audit-write failures, queue/background job status, email send failure rates, Stripe webhook freshness, or dependency latency.

Impact:

- The diagnostics view is a good support starting point.
- It does not yet answer several production incident questions:
  - Are webhooks arriving?
  - Are emails failing?
  - Are audit writes failing?
  - Are exports/receipts backing up?
  - Are API errors spiking?

Suggested fix:

- Keep diagnostics secret-free.
- Add coarse operational status fields backed by counters/timestamps:
  - last successful Stripe webhook
  - last inbound email webhook
  - recent outbound email failure count
  - recent audit insert failure count
  - recent export generation failure count
  - last successful receipt storage check
- Restrict diagnostics to a clear admin/support entitlement if general authenticated users should not see system posture.

### Medium - Runtime Startup And Database Logs Still Bypass The Logger

Evidence:

- `db.js` still uses raw `console.log`, `console.warn`, and `console.error` for SSL config, DB identity, migration application, migration failure, and pool errors.
- `server.js` startup environment validation failure uses `console.error`.
- These logs do not go through the sanitizer or a consistent structured context path.

Impact:

- Startup and migration logs are exactly the logs needed during outages.
- Bypassing the logger creates inconsistent formatting and makes later structured logging harder.
- It also increases the chance of accidental environment or connection-detail exposure.

Suggested fix:

- Route DB/startup logs through the central logger.
- Keep `logDbIdentity` disabled in production, but make non-production output sanitized and explicit.
- Add a startup log event with app version, commit, environment, and sanitized runtime mode.

### Low/Medium - No Crash-Level Process Error Hooks Beyond Graceful Shutdown

Evidence:

- `server.js` handles `SIGTERM` and `SIGINT`.
- No `process.on("unhandledRejection")` or `process.on("uncaughtException")` handling was found.

Impact:

- Node may still print unstructured crash output for unexpected async failures.
- Without structured crash logging, production incidents can lose key context before process restart.

Suggested fix:

- Add minimal process-level handlers that log structured fatal events.
- For `uncaughtException`, log and exit.
- For `unhandledRejection`, log with enough context and decide whether to exit based on deployment policy.
- Keep the handlers small; they should not attempt complex recovery.

### Low/Medium - Log Scan Exists But Has No Logs To Scan In The Current Setup

Evidence:

- `npm run log_scan` completed with `Log directory not found: ./logs`.
- The app currently writes to console rather than an app-owned log directory.

Impact:

- The scanner may be useful for local file logs, but it does not validate the actual production logging path.
- It can give a false sense that log hygiene is continuously checked.

Suggested fix:

- Decide whether `log_scan` is for local artifacts only or part of CI/ops.
- If it stays, point it at exported sample logs or make CI feed captured process output through it.
- Add tests around the sanitizer/logger path instead of relying only on filesystem log scanning.

Pass 18 status:

- No source changes made.
- No tests were run in this pass.
- Observability has useful building blocks, but it is not yet production-grade: request correlation, structured logs, audit failure visibility, and incident diagnostics are the main gaps.

## Pass 19 - Data Lifecycle, Retention, Deletion, Backup, And Privacy Durability

Scope:

- Privacy export, erasure, business-data deletion, and full account deletion.
- Receipt/export file cleanup.
- Soft-delete vs hard-delete behavior.
- Backup/restore documentation and retention statements.
- Tests that prove lifecycle behavior.

Positive signals:

- Privacy routes exist for settings, export, erase, delete, and audit-log retrieval.
- Account deletion is password/MFA guarded and has meaningful tests.
- Deletion order is explicit where foreign keys would otherwise fail.
- Receipt deletion uses a safer pending-delete file move so failed DB deletes can restore the file.
- Privacy export includes receipts, export history, bank connections, invoices, privacy settings, and consent log.
- Backup/restore documentation exists in `Docs/BACKUP-RESTORE.md`.
- Internal PIA documentation acknowledges encryption gaps and retention alignment requirements.

### High - `POST /api/privacy/erase` Can Commit Erasure And Then Fail The Response Path

Evidence:

- In `privacy.routes.js`, `POST /api/privacy/erase` declares `const userResult = await pool.query(...)` inside the password-verification `try` block.
- After the DB transaction commits, the route calls `sendPrivacyActivityEmail` with `email: userResult.rows[0]?.email || ""`.
- That `userResult` is block-scoped and not available at the later call site.
- The catch block then calls `ROLLBACK` unconditionally, even though `COMMIT` may already have succeeded.
- `tests/privacyRoutes.test.js` covers privacy export, CSV neutralization, privacy delete, and Quebec consent logging, but no erasure success-path test was found.

Impact:

- A user could receive a 500 response even though their account was already erased.
- The completion email may fail.
- Retrying could be confusing or impossible because the password hash is set to `ERASED`.
- This is a serious lifecycle bug because the committed data state and user-facing response can disagree.

Suggested fix:

- Store `userEmail` in an outer variable before the verification block exits.
- Track `transactionOpen` for erasure the same way `POST /privacy/delete` does.
- Only rollback when a transaction is still open.
- Add tests for:
  - successful erasure returns 200
  - refresh tokens are revoked
  - free-text fields are scrubbed
  - email failure after commit does not convert committed erasure into a failed erasure response

### High - Full Account Deletion Cleans Receipt Files But Not Export Files

Evidence:

- `DELETE /api/me` in `me.routes.js` collects receipt `storage_path` values and unlinks managed receipt files after commit.
- The same route deletes export DB rows with `DELETE FROM exports WHERE business_id = ANY($1::uuid[])`.
- It does not collect or unlink export files referenced by `export_metadata`.
- `POST /api/privacy/delete` does collect both receipt paths and export paths before deleting rows.

Impact:

- Full account deletion can leave generated export files on disk after the account and database rows are gone.
- That creates orphaned customer artifacts with no DB owner.
- It also makes the user-facing "account and data deleted" promise weaker than the business-data deletion path.

Suggested fix:

- Reuse the privacy-delete file collection logic for account deletion.
- Collect managed export paths before deleting export rows.
- Unlink them after commit.
- Add an account-deletion test that includes an export metadata file path and asserts unlink.

### Medium/High - File Cleanup After Commit Can Leave Orphans Without A Repair Queue

Evidence:

- `POST /api/privacy/delete` commits the DB transaction, then unlinks receipt/export files.
- `DELETE /api/me` commits the DB transaction, then unlinks receipt files.
- Tests intentionally assert success when receipt cleanup fails after commit.
- Failures are logged, but no retry table, quarantine marker, or cleanup job was found.

Impact:

- Committing before file deletion avoids DB rollback after partial filesystem work, which is reasonable.
- But when unlink fails, the app has no durable record of the orphaned file after the DB rows are deleted.
- A process crash between commit and unlink creates the same orphan risk without even logging the failure.

Suggested fix:

- Add a durable deletion queue or `pending_file_deletions` table before commit.
- Process file deletion after commit and mark each path deleted.
- Add a maintenance command that retries pending deletions and reports orphan counts.
- Keep path validation strict with managed receipt/export directories.

### Medium/High - Retention Policy Is Documented But Not Enforced As Code

Evidence:

- `Docs/PIA.md` says live user data persists until deletion and certain audit/security/export records may persist longer.
- `Docs/BACKUP-RESTORE.md` documents Railway PITR, weekly off-site database dumps, daily receipt/export backups, and quarterly restore drills.
- The public V3 privacy page says records are retained as needed for product, tax, audit, dispute, backup, security, and legal obligations.
- No retention scheduler or purge job was found for:
  - expired refresh tokens
  - old export files
  - old redacted export artifacts
  - deleted account records
  - old import batches
  - stale support artifacts

Impact:

- Written policy and actual production behavior can drift.
- Backup retention, export retention, and deleted-account reactivation guard retention are not visibly enforced in the application.
- This is a professionalism gap because retention promises are operational commitments, not just legal copy.

Suggested fix:

- Create a retention matrix with table/artifact, owner, legal basis, retention period, and deletion mechanism.
- Add scheduled cleanup jobs or explicit manual runbooks for each retained artifact class.
- Add diagnostics showing the last successful cleanup run.
- Keep public privacy text aligned with the matrix.

### Medium - Privacy Export JSON Is Broad, But CSV Export Is Only Transactions

Evidence:

- JSON export returns a broad package: user, businesses, accounts, categories, transactions, adjustment history, mileage, vehicle costs, recurring templates, receipts, export history, bank connections, invoices, privacy settings, consent log, and audit log.
- CSV export only emits the primary transaction sheet.
- The Settings UI describes "Account data export" as a complete data package, but offers a CSV button.

Impact:

- JSON is the actual complete data portability package.
- CSV may be interpreted by users as a complete export but is materially narrower.
- This is not necessarily wrong, but it needs clear product language.

Suggested fix:

- Label CSV as "Transactions CSV".
- Offer JSON as "Complete data package".
- Add an export manifest in JSON listing included sections and counts.
- Add a test that ensures Settings exposes the complete export option if the API supports it.

### Medium - Soft Delete And Hard Delete Policies Are Domain-Specific But Not Centrally Documented

Evidence:

- Transactions use archival/soft delete with `deleted_at` and restore support.
- Invoices and recurring transactions also have soft-delete paths.
- Receipts are hard-deleted, and a migration comment says receipt rows are hard-deleted so usage limits cannot be bypassed.
- Messages use per-party archive/delete booleans.
- Account/business privacy deletion hard-deletes broad business data.

Impact:

- These choices may be individually defensible.
- But without a central lifecycle policy, future developers will copy whichever pattern is closest.
- That is how accounting/audit behavior becomes inconsistent over time.

Suggested fix:

- Add a data lifecycle policy doc or code-adjacent table covering:
  - mutation style: soft delete, hard delete, anonymize, append-only
  - restore support
  - audit event
  - privacy export inclusion
  - account deletion behavior
  - backup behavior
- Add tests for the most sensitive rows: transactions, receipts, exports, invoices, bank connections, messages, and audit logs.

### Medium - Backup/Restore Docs Need Verification State And Runtime Alignment

Evidence:

- `Docs/BACKUP-RESTORE.md` defines backup scope, commands, restore procedure, access list, and quarterly drill expectations.
- The restore drill log is still a placeholder row.
- Receipt restore text says `getReceiptStorageStatus()` should report `mode = 'local'`, but current `receiptStorage.js` modes are `development`, `persistent-confirmed`, `enforced`, or `degraded`.
- Docs mention `EXPORT_REDACTED_DIR` / object store, while other code paths use local export storage under `storage/exports` and export metadata file paths.

Impact:

- A restore plan exists, but the repo does not prove it has ever been exercised.
- Small naming drift in restore docs can cause confusion during an incident.
- Backup docs should be boring and exact.

Suggested fix:

- Run and record a restore drill in the log.
- Update mode names to match `receiptStorage.js`.
- Normalize export storage naming across docs and code.
- Add a scripted restore smoke checklist if possible.

### Low/Medium - Public Privacy Page Is Much Less Specific Than Internal Policy

Evidence:

- V3 `Privacy.tsx` has a short "Retention and security" paragraph.
- Internal `Docs/PIA.md` and `Docs/BACKUP-RESTORE.md` contain much more specific retention and backup expectations.
- Legacy public privacy copy is more specific about backup copies than the V3 public page.

Impact:

- The public policy may be intentionally concise, but it currently hides the more concrete operational commitments.
- This can cause mismatch between what the product says externally and what the repo expects internally.

Suggested fix:

- Decide the public level of specificity with counsel.
- At minimum, align V3 public privacy text with the actual backup/deletion behavior the company intends to stand behind.

Pass 19 status:

- No source changes made.
- No tests were run in this pass.
- Data lifecycle is not a disaster; several important controls exist. The rough areas are committed-erasure correctness, artifact cleanup, retention enforcement, and backup/restore proof.

## Pass 20 - Dependency Hygiene, Supply Chain, Package Scripts, And Toolchain Professionalism

Scope:

- Package roots and lockfiles.
- Dependency usage and install reproducibility.
- CI/Docker/Nixpacks install behavior.
- Security audit coverage.
- Local installed-tree drift.
- Script hygiene and package-boundary clarity.

Package roots found:

- `In-Ex-Ledger-API/package.json`
- `In-Ex-Ledger-API/frontend-v3/package.json`
- `pdf-worker/package.json`

Positive signals:

- Each package root has a lockfile.
- CI has a dependency security workflow with GitHub dependency review.
- Backend exposes `npm run security:deps`.
- V3 has dedicated `lint` and `build` scripts.
- Backend `test:all` is centralized, even if earlier passes found it incomplete.
- Package count is not wildly inflated for a SaaS app of this shape.

### High - Backend Dependency Tree Is Locally Invalid Around `multer`

Evidence:

- `In-Ex-Ledger-API/package.json` declares `multer: "1.4.5-lts.1"`.
- `In-Ex-Ledger-API/package-lock.json` also locks `node_modules/multer` to `1.4.5-lts.1`.
- `npm ls --depth=0` in `In-Ex-Ledger-API` reports:
  - installed `multer@2.2.0`
  - invalid because the root project requires `1.4.5-lts.1`
- The lockfile entry for `multer@1.4.5-lts.1` includes the deprecation warning that Multer 1.x is impacted by vulnerabilities patched in 2.x.

Impact:

- Local behavior may differ from CI/Docker behavior.
- A developer can run tests against Multer 2 while production installs Multer 1 from the lockfile.
- Upload validation and receipt/support-artifact paths depend on Multer, so this is not a harmless package mismatch.

Suggested fix:

- Decide deliberately whether to upgrade to Multer 2.
- If upgrading, update `package.json`, lockfile, upload middleware usage, and upload tests together.
- If staying on Multer 1 temporarily, clean local `node_modules` and document the risk with a time-boxed issue.
- Add `npm ci` as the standard verification command so invalid local trees are caught earlier.

### High - Known Dependency Audit Coverage Is Still Incomplete Across Package Roots

Evidence:

- Earlier baseline checks found:
  - backend high advisory through `express-rate-limit -> ip-address`
  - frontend high advisory through `vite -> postcss -> nanoid`
  - `pdf-worker` audit/package metadata inconsistency around Express-related advisories
- `.github/workflows/dependency-security.yml` installs and audits only `In-Ex-Ledger-API`.
- The workflow does not visibly run `npm audit` in `In-Ex-Ledger-API/frontend-v3` or `pdf-worker`.

Impact:

- The package roots with known issues are not all enforced by CI.
- Dependency review catches changed dependencies in PRs, but does not replace auditing every package root on a schedule.
- This is a launch-readiness gap because a green CI security job can coexist with known vulnerable package roots.

Suggested fix:

- Extend dependency CI to run:
  - `npm ci && npm audit --omit=dev --audit-level=high` in `In-Ex-Ledger-API`
  - `npm ci && npm audit --omit=dev --audit-level=high` in `In-Ex-Ledger-API/frontend-v3`
  - `npm ci && npm audit --omit=dev --audit-level=high` in `pdf-worker`
- Add a short allowlist/waiver mechanism only if a fix is unavailable, with expiry dates.

### Medium/High - CI, Docker, And Nixpacks Still Use `npm install` In Important Paths

Evidence:

- `.github/workflows/phase7-guardrails.yml` uses `npm install` for backend and V3.
- `.github/workflows/e2e-smoke.yml` uses `npm install`.
- `In-Ex-Ledger-API/Dockerfile` uses `npm install --omit=dev` for backend and `npm --prefix frontend-v3 install` for frontend.
- `pdf-worker/Dockerfile` uses `npm install --omit=dev`.
- `In-Ex-Ledger-API/nixpacks.toml` uses `npm install` and `npm --prefix frontend-v3 install`.
- Root `nixpacks.toml` uses `cd In-Ex-Ledger-API && npm install`.

Impact:

- Builds are less deterministic than they should be with committed lockfiles.
- `npm install` can alter dependency resolution behavior and can mask lockfile drift.
- CI may pass under one dependency tree while Docker/Nixpacks produces another.

Suggested fix:

- Move CI, Docker, and Nixpacks to `npm ci`.
- Use `npm ci --omit=dev` only for runtime-only installs.
- Keep `npm install` for local development instructions.
- Add a CI check that fails if lockfiles would change after install.

### Medium/High - Runtime And Tooling Node Versions Are Not Declared In One Place

Evidence:

- GitHub workflows use Node `22`.
- Docker images use `node:20-bookworm-slim`.
- Frontend Vite lockfile requires Node `^20.19.0 || >=22.12.0`.
- The backend package has no `engines` field.
- No `.nvmrc` or root tool-version file was found.

Impact:

- Developers, CI, Docker, and Railway/Nixpacks can run different Node minor versions.
- The frontend toolchain has stricter Node expectations than the backend package declares.
- This can create build failures that reproduce only in one environment.

Suggested fix:

- Pick one supported Node line for the repo.
- Add `engines.node` to each package root.
- Add `.nvmrc` or `.node-version`.
- Align CI and Docker to the same major/minor policy.

### Medium - Frontend Build Tooling Is Listed As Production Dependencies

Evidence:

- `frontend-v3/package.json` lists `@vitejs/plugin-react`, `typescript`, and `vite` under `dependencies`.
- These are build-time/dev-time packages for this repo.
- Docker runs `npm --prefix frontend-v3 install` and keeps frontend dependencies in the final image.

Impact:

- Production image size and supply-chain surface are larger than necessary.
- Runtime deployments carry build tooling that the served V3 bundle does not need.
- This increases audit noise and vulnerability exposure.

Suggested fix:

- Move Vite, TypeScript, and Vite React plugin to `devDependencies`.
- Build the SPA in a build stage.
- Copy only `public/app-v3` and backend production dependencies into the final image.

### Medium - `pdf-worker` Is A Separate Package But Not A First-Class Build/Test Target

Evidence:

- `pdf-worker` has its own package root, lockfile, Dockerfile, and README.
- Main docs describe it as a TEE-ready service.
- Earlier architecture passes found the main API currently generates PDFs in-process and the `pdfWorkerClient.js` is effectively orphaned.
- CI dependency audit does not cover `pdf-worker`.
- No tests or lint script were found in `pdf-worker/package.json`.

Impact:

- The worker is supply-chain-visible but operationally disconnected.
- It can accumulate vulnerable dependencies without CI visibility.
- Its README describes a stronger architecture than the app currently uses.

Suggested fix:

- Decide whether `pdf-worker` is active, experimental, or archived.
- If active, add CI install/audit/test coverage and wire deployment docs to it.
- If archived, move it to an explicit archive/reference location and remove it from deployment claims.

### Medium - Package Scripts Mix Production Commands, Maintenance Tools, And One-Off Test Scripts

Evidence:

- Backend scripts include core commands (`start`, `build`, `test:all`) alongside one-off scripts:
  - `test:export-grant`
  - `test:region-tax`
  - `test:accounts-put`
  - `test:mileage-put`
  - `test:email`
  - `i18n:fix`
  - migration checksum repair commands
- `prestart` still runs checksum repair with `--write` for one migration file, covered as a high-risk finding in earlier passes.

Impact:

- Package scripts are becoming a junk drawer.
- It is harder to tell which scripts are safe in production, safe locally, or legacy maintenance.
- Dangerous commands near `start` increase operational risk.

Suggested fix:

- Split scripts into categories in docs:
  - runtime
  - build
  - CI tests
  - local developer tools
  - maintenance/admin
  - retired/manual verification
- Move permanent validation into `node --test` files where possible.
- Remove `--write` repair behavior from startup.

### Medium - Lockfiles And Installed Trees Show Local Drift

Evidence:

- Backend `npm ls` exits with `ELSPROBLEMS` because installed Multer differs from the lock/package declaration.
- V3 `npm ls --depth=0` reports extraneous packages:
  - `@emnapi/wasi-threads`
  - `tslib`
- `pdf-worker npm ls --depth=0` shows `express@4.22.2`, while `pdf-worker/package-lock.json` contains `express@4.22.1`.

Impact:

- Local `node_modules` cannot be treated as evidence of reproducible repo state.
- Developers may unknowingly validate against a dependency graph CI will not install.
- This is exactly why `npm ci` should be the default verification path.

Suggested fix:

- Clean all `node_modules` directories and reinstall with `npm ci`.
- Re-run `npm ls --depth=0` in all package roots.
- Capture the result as part of dependency cleanup.

### Low/Medium - Root-Level Deployment Files Can Conflict With API-Level Deployment Files

Evidence:

- Root `nixpacks.toml` installs only the API package and starts `npm start`.
- `In-Ex-Ledger-API/nixpacks.toml` installs backend and frontend dependencies and builds V3.
- Both exist in the repo.

Impact:

- A hosting service pointed at the repo root may use different behavior from one pointed at `In-Ex-Ledger-API`.
- The root Nixpacks path can skip the V3 build.
- This is a professionalism and deployment reproducibility issue.

Suggested fix:

- Keep exactly one authoritative deployment entry point per hosting platform.
- If both are needed, document the intended root directory for each environment and add guard comments to both files.

Pass 20 status:

- No source changes made.
- No tests were run.
- Read-only package checks were run:
  - `npm ls --depth=0` in backend, V3, and `pdf-worker`
  - package/lockfile/script/CI/Docker/Nixpacks inspection
- Dependency hygiene needs a focused cleanup pass before launch: Multer drift, multi-root audit coverage, `npm ci`, Node version alignment, and frontend build-tool dependency placement are the main items.

## Pass 21 - Scripts, Maintenance Utilities, Generated Artifacts, And Developer Tooling

Scope:

- All tracked files under `In-Ex-Ledger-API/scripts/`.
- `Docs/MAINTENANCE-SCRIPTS.md`.
- `pdf-worker` implementation and docs as a script-like side service.
- Package-script wiring and documented operational usage.

Inventory:

- 14 tracked API scripts:
  - `backfill-default-category-tax-maps.mjs`
  - `build-v3-phrase-catalog.mjs`
  - `i18n-audit.js`
  - `i18n-fix.js`
  - `log_scan.js`
  - `repair-migration-checksums.js`
  - `seed-dev.mjs`
  - `send-email-reminders.js`
  - `test-accounts-put.mjs`
  - `test-email.mjs`
  - `test-export-grant.mjs`
  - `test-mileage-put.mjs`
  - `test-region-tax.mjs`
  - `verify-redacted-storage.mjs`
- 7 tracked `pdf-worker` files.

Positive signals:

- `Docs/MAINTENANCE-SCRIPTS.md` exists and states a useful rule: scripts must be intentional, wired, and documented.
- Most API scripts are wired through `package.json`.
- `build-v3-phrase-catalog.mjs` has a real `--check` mode used by V3 i18n validation.
- `repair-migration-checksums.js` has a dry-run default and warns that `--write` should be deliberate.
- `seed-dev.mjs` is explicitly described as local development seeding.

### High - Maintenance Script Policy Exists, But `prestart` Violates The Spirit Of It

Evidence:

- `Docs/MAINTENANCE-SCRIPTS.md` says checksum repair should be intentional and that no overlapping repair scripts should be created.
- Backend `package.json` wires:
  - `prestart`: `node scripts/repair-migration-checksums.js --write --file 20260419_create_billable_expenses_table.sql`
- This means a maintenance repair script runs automatically before production startup.

Impact:

- This repeats the earlier migration/deployment finding, but it is also a script governance problem.
- A script documented as intentional repair tooling is being executed as runtime startup behavior.
- It trains future maintainers that scripts can mutate operational metadata during app boot.

Suggested fix:

- Remove checksum repair from `prestart`.
- Keep `migrations:verify-checksums` as the boot-safe command.
- Keep `migrations:repair-checksums` as a manual command requiring explicit operator action.

### High - `seed-dev.mjs --wipe` Can Delete Broad Tables Without Environment Guardrails

Evidence:

- `seed-dev.mjs` defaults `DATABASE_URL` to local Postgres, but also accepts any `process.env.DATABASE_URL`.
- The script documents a `--wipe` mode.
- `wipeSeedData()` executes broad deletes:
  - `DELETE FROM recurring_transaction_runs`
  - `DELETE FROM recurring_transactions`
  - `DELETE FROM receipts`
  - `DELETE FROM mileage`
  - `DELETE FROM transactions`
  - `DELETE FROM categories`
  - `DELETE FROM accounts`
  - `DELETE FROM businesses`
  - `DELETE FROM users WHERE email = ANY(...)`
- No explicit `NODE_ENV !== "production"` or host/database-name allowlist guard was found in the inspected code.

Impact:

- A misconfigured `DATABASE_URL` could point this dev script at a non-dev database.
- The script is powerful enough to wipe real customer ledger data.
- This is one of the most important places to be strict and boring.

Suggested fix:

- Add hard guardrails:
  - refuse when `NODE_ENV=production`
  - require database name to match an allowlisted dev/test pattern
  - require an explicit `--confirm-dev-wipe` flag for destructive mode
  - print the target database host/name and pause/fail unless confirmed
- Keep seeding useful, but make accidental non-dev execution very hard.

### Medium/High - Long-Term Regression Scripts Duplicate Route Logic Instead Of Testing Owners

Evidence:

- `test-accounts-put.mjs` mirrors constants and validation logic from `accounts.routes.js`.
- `test-mileage-put.mjs` mirrors constants and update validation logic from `mileage.routes.js`.
- These scripts use custom `assert` functions and `console.log`, not `node:test`.
- They are wired through package scripts but are not part of `test:all`.

Impact:

- Mirrored logic can pass while production route logic changes or diverges.
- These scripts create a false feeling of coverage because they validate a copy, not the real owner.
- This is a classic professionalism issue: useful scratch tests were not promoted into durable tests.

Suggested fix:

- Move account and mileage validation into shared pure helpers.
- Test the helpers with `node:test`.
- Add route-level tests for request/response behavior.
- Retire these script tests after parity exists.

### Medium/High - `test-export-grant.mjs` Logs Secret Material

Evidence:

- `test-export-grant.mjs` sets `EXPORT_GRANT_SECRET` from env or a test default.
- It prints `EXPORT_GRANT_SECRET:` to stdout.
- It is referenced by docs as something to run when rotating `EXPORT_GRANT_SECRET` / `PDF_WORKER_SECRET`.

Impact:

- If run with a real secret, the secret is written into terminal logs, CI logs, shell history captures, or support transcripts.
- This conflicts with the surrounding security intent.

Suggested fix:

- Never print the secret value.
- Print only whether a real env value or test default is being used.
- Print a fingerprint if needed, such as first 6 chars of a hash, not the secret.
- Convert to `node:test` if it is meant to remain regression coverage.

### Medium - Legacy i18n Maintenance Scripts Target Old Public JS While V3 Is The Frontend Truth

Evidence:

- `i18n-audit.js` reads `In-Ex-Ledger-API/public/js/i18n.js`.
- `i18n-fix.js` modifies `In-Ex-Ledger-API/public/js/i18n.js`.
- `Docs/MAINTENANCE-SCRIPTS.md` still documents those scripts as active i18n maintenance tools for `public/js/i18n.js`.
- V3 localization is now driven by `frontend-v3/src/lib/i18n.ts` and `frontend-v3/src/lib/i18nPhrases.ts`.

Impact:

- Developers can spend time maintaining the archived/legacy i18n surface instead of V3.
- Running `i18n:fix` can produce churn in a legacy path and does nothing for the canonical V3 app.
- This is directly connected to the user's earlier correction: legacy frontend is reference-only, V3 is frontend truth.

Suggested fix:

- Mark legacy i18n scripts as archived/manual-reference only, or remove them after confirming no active route depends on them.
- Keep `build-v3-phrase-catalog.mjs` and `i18n:v3:check` as the active V3 i18n tooling.
- Update `Docs/MAINTENANCE-SCRIPTS.md` to reflect V3 ownership.

### Medium - Backfill Script Mutates All US/CA Businesses Without Scope Controls

Evidence:

- `backfill-default-category-tax-maps.mjs` selects all businesses where `region IN ('US', 'CA')`.
- It has `--dry-run`, which is good.
- The non-dry run calls `seedDefaultCategoriesForBusiness(pool, business.id)` for every matching business.
- No `--business-id`, `--limit`, environment guard, or explicit confirmation was found.

Impact:

- The backfill can touch every US/Canada business in one command.
- That may be intended during a rollout, but the blast radius is broad.
- It is safer as a controlled migration/admin operation with targeting.

Suggested fix:

- Add optional `--business-id` and `--limit`.
- Require `--confirm` when not dry-run.
- Log counts and affected IDs to a durable run record if used outside local/dev.

### Medium - `verify-redacted-storage.mjs` Can Give False Confidence About Export Storage

Evidence:

- The script checks only `process.cwd()/storage/exports`.
- It passes if that directory does not exist.
- It only checks filenames ending in `.redacted.pdf`.
- Earlier data-lifecycle and deployment passes found export file paths can come from metadata and docs mention alternate storage names/object-store paths.

Impact:

- The script is useful for a narrow local-disk convention.
- It does not prove object-store safety, metadata consistency, or that full PDFs were never written elsewhere.
- If production storage differs from `storage/exports`, the check can pass while checking the wrong place.

Suggested fix:

- Resolve export storage from the same configuration used by export services.
- Fail or warn loudly in production if the configured export store is unavailable.
- Optionally verify DB metadata paths against actual storage contents.

### Medium - `log_scan.js` Scans A Log Directory That May Not Exist In Real Deployments

Evidence:

- `log_scan.js` scans `LOG_DIR || "./logs"`.
- Earlier execution produced `Log directory not found: ./logs`.
- The app logs primarily to console.
- Docs and release checklists still treat `npm run log_scan` as a release/security guard.

Impact:

- This can become a checkbox that does not inspect production-like logs.
- It is not useless, but its current default does not match the app logging path.

Suggested fix:

- Make CI pipe captured app/test output into the scanner.
- Or rename/document the script as a local file-log scanner only.
- Keep sanitizer/logger tests as the primary automated protection.

### Medium - `pdf-worker` Claims TEE-Ready Security But Contains Prototype-Level PDF Generation

Evidence:

- `pdf-worker/README.md` and `DEPLOYMENT.md` describe a TEE-ready service.
- `index.js` decrypts `taxId_jwe`, then builds "PDF" responses by returning UTF-8 text buffers encoded as base64.
- `buildPdfContent` uses mojibake divider characters in the inspected output.
- The worker has no tests or lint script.
- Earlier passes found the main API currently generates PDFs in-process and the worker client is effectively orphaned.

Impact:

- The worker's docs overstate maturity relative to implementation.
- It is not a real PDF generator in the inspected code; it returns text buffers labeled as PDF payloads.
- If someone deploys it based on README claims, they may believe they have a stronger confidential export architecture than actually exists.

Suggested fix:

- If the worker is active, implement real PDF generation, add tests, wire the API path, and add CI.
- If it is a prototype/reference, label it clearly as such or move it to an archive/prototype folder.
- Do not call it TEE-ready until attestation/key-unsealing/runtime controls are actually implemented and tested.

### Medium - `pdf-worker` Trusts `X-Forwarded-For` Directly

Evidence:

- `pdf-worker/index.js` gets remote IP from the first value of `x-forwarded-for` when present.
- It then applies CIDR allowlisting to that value.
- No trusted proxy validation was found in the worker.

Impact:

- If the worker is ever exposed through an untrusted proxy path, callers can spoof `X-Forwarded-For`.
- The shared token still provides a second control, but the CIDR allowlist can be bypassed at the header layer.
- This repeats a class of risk the main API already worked to clean up.

Suggested fix:

- Ignore `X-Forwarded-For` unless the direct socket peer is a trusted proxy.
- Prefer network-level private routing and security groups over application-layer forwarded-header allowlisting.
- Add tests for spoofed forwarded headers if the worker remains active.

### Low/Medium - Script Documentation Is Stale Around Root Scripts

Evidence:

- `Docs/MAINTENANCE-SCRIPTS.md` documents root scripts:
  - `scripts/check-bundle-drift.js`
  - `scripts/log_scan.js`
- `git ls-files` for this pass found tracked API scripts, but no tracked root `scripts/` files in the current inventory output.

Impact:

- The maintenance-script inventory itself has drift.
- This makes it harder to know which tools are current, retired, or missing.

Suggested fix:

- Reconcile `Docs/MAINTENANCE-SCRIPTS.md` with `git ls-files`.
- Remove references to non-existent scripts or restore them intentionally if they are required by CI.

### Low/Medium - Mojibake Remains In Script And Worker Output

Evidence:

- `test-accounts-put.mjs`, `test-mileage-put.mjs`, `test-export-grant.mjs`, and `pdf-worker/index.js` displayed mojibake in comments/output strings.
- Examples include broken box-drawing/em dash/checkmark characters.

Impact:

- This is not the largest technical risk.
- It is an unprofessional code-quality signal and makes scripts harder to trust.
- It also reinforces earlier encoding findings.

Suggested fix:

- Normalize files to UTF-8.
- Prefer ASCII for script output unless non-ASCII is intentional and verified.
- Add an encoding/mojibake scan after the audit.

Pass 21 status:

- No source changes made.
- No tests were run.
- Script/tooling inspection covered all tracked API scripts and all tracked `pdf-worker` files.
- Highest-priority script fixes are: remove mutating checksum repair from startup, guard `seed-dev --wipe`, stop logging export secrets, retire or relabel legacy i18n scripts, and resolve `pdf-worker` as either real infrastructure or archived prototype.

---

## Pass 22 - Documentation, Source-Of-Truth Drift, And Stale Work Trackers

Scope:

- Reviewed tracked root, `Docs/`, `Work-To-Do/`, `Work-Completed/`, and pre-existing `Work-Review/` documentation for stale architectural claims, contradictory source-of-truth statements, legacy/V3 drift, and launch-status overclaims.
- This pass treats `frontend-v3` as the current frontend truth.
- Archived legacy frontend files are reference-only. Findings below do **not** recommend wiring legacy product UI back into the app.

Files/signals inspected:

- `README.md`
- `Docs/ACCOUNTING_TRUST_RULES.md`
- `Docs/API_ROUTE_INVENTORY.md`
- `Docs/CURRENT_STATUS.md`
- `Docs/PROJECT-README.md`
- `Docs/REPO-GOVERNANCE.md`
- `Docs/RUNBOOK.md`
- `Docs/SECURITY.md`
- `Docs/SECURITY_AUDIT_2026-06-10.md`
- `Docs/V3_ROUTE_INVENTORY.md`
- `Work-To-Do/OWNER-FILE-FOLLOWUP-WORK.md`
- `Work-To-Do/UNFINISHED-CLEANUP-WORK.md`
- `Work-To-Do/WORK-TO-DO-STATUS.md`
- `Work-Review/MUTATION_AUDIT.md`
- Existing archived audit reports under `Work-Completed/`

Positive findings:

- `README.md` and `Docs/PROJECT-README.md` correctly state that `frontend-v3` is the canonical logged-in product experience.
- `Docs/V3_ROUTE_INVENTORY.md` exists and gives a route-by-route migration map instead of leaving route ownership implicit.
- Several older `Work-Completed/` audit reports include stale-report banners, which is the right direction for archived evidence.
- `Docs/REPO-GOVERNANCE.md` tries to define where living docs, completed work, and work-in-progress should live.

### High - Active Security Docs Describe A PDF Worker / TEE Architecture That The Code Does Not Implement

Evidence:

- `Docs/SECURITY.md` states that the API is only a conduit and that decryption happens inside a non-Internet TEE worker.
- `Docs/SECURITY.md` references `pdf-worker/DEPLOYMENT.md`, worker CIDR controls, private endpoints, and DRM/ephemeral full-PDF delivery.
- `Docs/RUNBOOK.md` instructs operators to verify worker attestation, TEE worker startup, `taxId_jwe` decryption, and worker-returned `fullPdf` / `redactedPdf`.
- `Docs/PROJECT-README.md` lists `pdf-worker/` as the PDF/export worker.
- `Docs/ACCOUNTING_TRUST_RULES.md` says PDF exports are generated by the `pdf-worker` service.
- Code inspection found the main API generating PDFs in-process through `routes/exports.routes.js`, `services/exportOrchestrationService.js`, and `services/pdfGeneratorService.js`.
- `services/pdfWorkerClient.js` exists, but earlier passes found it effectively orphaned.
- Pass 21 found the worker implementation itself is prototype-grade and does not generate real PDF content.

Impact:

- The docs materially overstate the security architecture.
- Operators could believe sensitive export generation is isolated when it is not.
- This is a professionalism and trust problem, not just stale prose.

Suggested fix:

- Rewrite active security/runbook/project docs to describe the current implemented export path.
- Move the TEE/pdf-worker architecture into a clearly labeled future design document unless it is implemented, wired, tested, and deployed.
- Add a doc/code consistency check for export architecture claims before launch.

### High - Accounting Trust Rules Conflict With Current Transaction Restore And Privacy Export Behavior

Evidence:

- `Docs/ACCOUNTING_TRUST_RULES.md` says it is the single source of truth for mutation, locking, archiving, and exports.
- The same file says restore is not currently supported through the UI and archived transactions cannot be unarchived.
- Current backend code exposes transaction restore through `POST /api/transactions/undo-delete`.
- Current V3 code includes `restoreDeletedTransaction()` in `frontend-v3/src/pages/Transactions.tsx`.
- The accounting rules doc references privacy export endpoints as `GET /api/privacy/data-export` and `GET /api/privacy/export-data`.
- Current backend code documents and implements `POST /api/privacy/export`.
- Current V3 settings code calls `POST /api/privacy/export?format=...`.

Impact:

- The stated accounting/legal source of truth is wrong on user-visible behavior and API contracts.
- A future reviewer could remove or reject valid V3 restore behavior based on stale docs.
- Privacy/export compliance documentation can send engineers to endpoints that do not exist.

Suggested fix:

- Update `Docs/ACCOUNTING_TRUST_RULES.md` to match the current restore, archive, and privacy export implementation.
- Add a short "last verified against code" line with the exact command or files checked.
- Link this doc to contract tests that assert the documented privacy/export endpoints.

### Medium/High - V3 Route Ownership Docs Contradict Themselves

Evidence:

- `Docs/V3_ROUTE_INVENTORY.md` says Phase 3 is complete and auth pages are served by the V3 SPA.
- Later in the same document, it says auth pages remain intentionally legacy for Strategy A.
- `Docs/CURRENT_STATUS.md` says privacy and terms pages redirect to V3 equivalents.
- `Docs/V3_ROUTE_INVENTORY.md` lists `/privacy` and `/terms` as legacy/public routes with V3 equivalents but "Keep as legacy" set to yes.
- `Docs/V3_ROUTE_INVENTORY.md` lists `/review` as legacy HTML today with a temporary legacy bridge.

Impact:

- The repo has no single unambiguous route truth for auth/legal/static routes.
- This is exactly the kind of drift that can cause someone to touch archived legacy files or route users to the wrong frontend.

Suggested fix:

- Make `Docs/V3_ROUTE_INVENTORY.md` the route authority and reconcile contradictory phase/status notes inside it.
- Add a current-state table with only three categories: V3 app, active public/static, and archived reference-only.
- Add a test or script that compares mounted routes/redirects to the inventory.

### Medium/High - Active Work-To-Do Trackers Still Point At Legacy Product UI Files

Evidence:

- `Work-To-Do/UNFINISHED-CLEANUP-WORK.md` says it is the single source of truth for unfinished cleanup work.
- It still references many old product UI files under `In-Ex-Ledger-API/public/js/` and `In-Ex-Ledger-API/public/html/`, including transaction, auth, onboarding, subscription, theme, and quick-add files.
- `Work-To-Do/OWNER-FILE-FOLLOWUP-WORK.md` also points at old `public/html` and `public/js` owner files for transactions, onboarding, auth, and other product flows.
- `Work-To-Do/WORK-TO-DO-STATUS.md` contains many completion notes anchored to old public JS files.
- Some tracker prose references a "Claude" audit as the basis for active cleanup work.

Impact:

- These files can steer current cleanup work back into legacy product UI even though V3 is the frontend truth.
- The problem is not that legacy files exist; the problem is that active task trackers still treat them as owner files.
- This creates a high risk of duplicate fixes, wasted work, and accidental reactivation of old UI assumptions.

Suggested fix:

- Add a top banner to each active tracker stating whether it is current, superseded by V3, or archived reference.
- Retire or rewrite tasks that target legacy app-core UI files unless they are explicitly about archiving, redirecting, or public SEO/static pages.
- Replace "Claude audit" framing with neutral repository-maintenance language.

### Medium - Status Docs Claim Green/Complete Checks That Are Currently False

Evidence:

- `Work-To-Do/WORK-TO-DO-STATUS.md` says full `npm run test:all` is green.
- The current audit baseline found `npm run test:all` failing.
- Focused `node --test tests/frontendV3Wiring.test.js` had 39 passing tests and 1 failing brittle source-shape test.
- Dependency-security docs/status imply completed guardrails, but Pass 20 found multi-root audit gaps and current high-severity audit findings.

Impact:

- Launch/readiness docs can create false confidence.
- Future reviewers may trust stale "green" status instead of re-running the actual checks.

Suggested fix:

- Replace static "green" claims with dated verification entries and exact commands.
- Add an "as of" status block to current work trackers.
- Avoid marking security/dependency work complete unless backend, frontend, and worker package roots are all covered.

### Medium - Too Many Documents Claim Or Imply Source-Of-Truth Authority

Evidence:

- `Docs/ACCOUNTING_TRUST_RULES.md` says it is the single source of truth for mutation/locking/archiving/exports.
- `Work-To-Do/UNFINISHED-CLEANUP-WORK.md` says it is the single source of truth for unfinished cleanup work.
- `Docs/REPO-GOVERNANCE.md` also names current cleanup source-of-truth files and gives owner-file guidance.
- `Docs/V3_ROUTE_INVENTORY.md`, `Docs/CURRENT_STATUS.md`, and `Docs/PROJECT-README.md` all contain route/status truth.

Impact:

- Multiple "single source" docs can disagree without an obvious winner.
- This is a documentation architecture smell: each doc may be defensible alone, but together they create operational ambiguity.

Suggested fix:

- Define a short source-of-truth hierarchy in `Docs/README.md` or `Docs/REPO-GOVERNANCE.md`.
- Make each living doc declare its scope and owner.
- Move historical reports to archive folders with stronger "do not use as current task list" banners.

### Medium - Historical Security Audit Lives In Active Docs Without A Strong Current/Stale Boundary

Evidence:

- `Docs/SECURITY_AUDIT_2026-06-10.md` remains under active `Docs/`.
- It contains dated findings and many old `public/js` path references.
- It may still be useful evidence, but it is not clearly separated from living security policy.

Impact:

- Engineers could mistake historical findings for current instructions.
- Current security posture becomes harder to evaluate because active policy, historical audit evidence, and future architecture claims coexist in the same docs folder.

Suggested fix:

- Move dated audit reports to `Work-Completed/` or a dedicated `Docs/archive/`.
- Add a current/stale banner if the file stays in `Docs/`.
- Keep `Docs/SECURITY.md` as the living policy and link historical audits explicitly.

### Low/Medium - Maintenance And Governance Docs Lag The Actual Script Inventory

Evidence:

- `Docs/MAINTENANCE-SCRIPTS.md` references root `scripts/` files that were not present in the tracked inventory gathered in Pass 21.
- `Docs/REPO-GOVERNANCE.md` still gives owner-file examples under old `public/js` and `public/html` product files.
- Pass 21 found tracked API scripts that are not cleanly separated into runtime, maintenance, regression, and one-off categories.

Impact:

- The repo is telling maintainers to rely on some tools and ownership boundaries that no longer match the current tree.
- This reinforces the wider "active docs drift from active code" problem.

Suggested fix:

- Reconcile maintenance docs against `git ls-files`.
- Split script docs by supported runtime scripts, supported maintenance scripts, tests, and retired/manual tools.
- Refresh owner-file examples around V3 and backend service owners.

Pass 22 status:

- No source changes made.
- No tests were run.
- Documentation/work-tracker inspection covered all tracked root docs, all tracked `Docs/` files, all tracked `Work-To-Do/` files, all tracked `Work-Completed/` files, and pre-existing tracked `Work-Review/` files.
- Highest-priority doc fixes are: correct PDF worker/TEE claims, correct accounting/privacy endpoint claims, reconcile V3 route ownership, and mark legacy-targeted active trackers as stale/superseded unless they are specifically about archived reference or public/static pages.

---

## Pass 23 - Test Suite Integrity, Harness Quality, And Regression Signal

Scope:

- Reviewed backend `package.json` test scripts, tracked `tests/` files, Playwright configuration, E2E support files, and V3 frontend package scripts.
- Focused on whether tests provide reliable regression signal rather than just whether test files exist.
- No application/source files were edited.

Inventory:

- Tracked backend/E2E test/spec files found: 127.
- Test files listed in backend `npm run test:all`: 96.
- Tracked test/spec files excluded from `test:all`: 31.
- Test files using `Module._load` monkey-patching: 58.
- Test files deleting `require.cache`: 61.
- Test files reading source files with `readFileSync`: 20.
- Test files using `__private` exports: 13.
- Test files using `test.skip`, `.skip`, `test.only`, or `.only`: 0.
- V3 frontend package has lint/build scripts, but no frontend unit/component test script.

Positive findings:

- There is substantial backend test coverage across auth, billing, exports, privacy, tax, receipts, rate limiting, subscriptions, and route hardening.
- Playwright specs exist for broad E2E flows and targeted V3 page/interactions.
- No committed `test.only` or skipped test markers were found in the inspected test files.
- Focused V3 lint and TypeScript checks passed earlier in this audit.

### High - `test:all` Excludes 31 Tracked Test/Spec Files

Evidence:

- Parsed `In-Ex-Ledger-API/package.json` `test:all` against tracked test/spec files.
- Tracked test/spec files found: 127.
- Files included in `test:all`: 96.
- Excluded files:
  - `tests/accountsOpeningBalanceRoutes.test.js`
  - `tests/authReactivationRegistration.test.js`
  - `tests/businessProvisionAddOn.test.js`
  - `tests/depreciationSchedules.test.js`
  - `tests/e2e/canada-lifecycle.spec.js`
  - `tests/e2e/comprehensive.spec.js`
  - `tests/e2e/full-flow.spec.js`
  - `tests/e2e/full-flow-v2.spec.js`
  - `tests/e2e/fullWalkthrough.spec.js`
  - `tests/e2e/v3-interactions.spec.js`
  - `tests/e2e/v3-pages.spec.js`
  - `tests/exportSnapshotService.test.js`
  - `tests/internalSupportRoutes.test.js`
  - `tests/plaidSyncImportRoute.test.js`
  - `tests/quickMethodService.test.js`
  - `tests/requestIpService.test.js`
  - `tests/reviewQueueRoutes.test.js`
  - `tests/routeInventory.test.js`
  - `tests/securityRegressionSuite.test.js`
  - `tests/supportArtifactsRoutes.test.js`
  - `tests/supportEmailInboundLegacy.test.js`
  - `tests/supportEmailService.test.js`
  - `tests/supportEmailThreading.test.js`
  - `tests/transactionCategorizationAccuracy.test.js`
  - `tests/transactionCategorizationService.test.js`
  - `tests/transactionCsvImportRoute.test.js`
  - `tests/transactionMappingRuleService.test.js`
  - `tests/transactionMappingRulesRoutes.test.js`
  - `tests/transactionReviewFlagService.test.js`
  - `tests/transactionsBulkDeleteAllRoute.test.js`
  - `tests/vehicleClaimService.test.js`

Impact:

- `npm run test:all` is not a truthful "all tests" gate.
- Several excluded files cover high-risk areas: security regression, internal support, route inventory, support artifacts/email, transaction categorization, depreciation, vehicle claims, bulk delete, and V3 E2E.
- Docs or status reports that say `test:all` is green would still miss important behavior.

Suggested fix:

- Rename the current script to `test:unit:curated` or expand it to include every intended non-E2E test.
- Add separate explicit scripts for `test:unit`, `test:integration`, `test:e2e:smoke`, `test:e2e:full`, and `test:all`.
- Add a meta-test that fails if a tracked `*.test.js` file is not assigned to a known test group.

### High - Current Baseline Test Gate Is Failing

Evidence:

- Earlier audit execution of `npm run test:all` failed.
- Focused `node --test tests/frontendV3Wiring.test.js` produced 39 passing tests and 1 failing test.
- The failure was source-shape brittle: the assertion expected a particular regex/whitespace shape that did not match current CRLF/source formatting.

Impact:

- The main local regression gate is red.
- A failing gate trains maintainers to ignore tests.
- Because the failing case is brittle, it also reduces confidence in source-text tests as a quality strategy.

Suggested fix:

- Fix the immediate failing `frontendV3Wiring.test.js` assertion.
- Then make `test:all` a required CI/local merge gate.
- Separate source-shape checks from runtime behavior checks so formatting does not block unrelated work.

### Medium/High - V3 Frontend Has No Real Unit/Component Test Runner

Evidence:

- `In-Ex-Ledger-API/frontend-v3/package.json` exposes:
  - `dev`
  - `build`
  - `lint`
- No Vitest/Jest/Testing Library script or dependencies were found in the V3 package.
- Backend tests inspect V3 files by reading source text, and Playwright covers some browser flows.

Impact:

- V3 behavior between pure source assertions and full browser E2E has a missing middle layer.
- Page components, hooks, API mappers, i18n behavior, dialogs, keyboard behavior, and error states are harder to test cheaply.
- This encourages brittle regex tests in the backend test suite.

Suggested fix:

- Add a V3 test runner only after deciding the target scope.
- Start with high-value unit tests for API mappers, route/path helpers, i18n phrase application, modal/focus helpers, and business defaults.
- Avoid snapshot-heavy component tests; prefer behavior and accessibility assertions.

### Medium/High - Source-Text Tests Are Overused As Contract Tests

Evidence:

- `tests/frontendV3Wiring.test.js` reads many `.tsx`, `.ts`, `.css`, and `server.js` files with `fs.readFileSync`.
- `tests/frontendV3ApiContracts.test.js` asserts TypeScript source shapes with regexes such as `type ListResponse = ...`, `params.set(...)`, and exact fallback expressions.
- `tests/v3LegacyHtmlRetirement.test.js`, `tests/frontendV3BuildPipeline.test.js`, `tests/frontendV3I18nRuntime.test.js`, `tests/csrfE2E.test.js`, `tests/i18nCoverage.test.js`, `tests/routeInventory.test.js`, and others also inspect source text.
- Count from this pass: 20 test files use `readFileSync`.

Impact:

- These tests often prove implementation shape, not behavior.
- They can fail on harmless refactors or formatting changes.
- They can also pass while runtime behavior is broken, because a string still exists somewhere in source.

Suggested fix:

- Keep a small number of source-scanning tests for repository policy checks.
- Convert API/contract checks to runtime tests around exported functions or request/response fixtures.
- Convert V3 behavior checks to unit/component tests or Playwright smoke tests where appropriate.

### Medium/High - Route Tests Depend Heavily On Global Module Monkey-Patching

Evidence:

- 58 test files use `Module._load`.
- 61 test files delete `require.cache`.
- Examples include route tests for privacy, account deletion, ASVS controls, messages, billing, auth device verification, review queue, transactions, V2 hardening, and more.

Impact:

- Monkey-patching CommonJS module loading is fragile and order-sensitive.
- It makes tests harder to reason about and can hide real integration issues.
- The pattern is understandable in an older Express codebase, but at this scale it becomes a test architecture smell.

Suggested fix:

- Introduce explicit route factories for high-risk routes: `createPrivacyRouter({ pool, auth, csrf, logger, storage })`.
- Migrate gradually, starting with privacy/account deletion/support/export routes.
- Keep the old monkey-patched tests until the route factory tests prove equivalent coverage.

### Medium/High - E2E Artifacts And Session Material Are Tracked

Evidence:

- `git ls-files In-Ex-Ledger-API/tests/e2e/screenshots` found 31 tracked artifacts.
- Tracked files include many `.png` screenshots plus:
  - `tests/e2e/screenshots/auth.json`
  - `tests/e2e/screenshots/session-token.json`
  - `tests/e2e/screenshots/run-state.json`
- `auth.json` contains localhost cookies including `csrf_token` and `refresh_token`.
- `session-token.json` contains a JWT-shaped token value from an older run.
- `run-state.json` contains an E2E email and password.
- Current `tests/e2e/global-setup.js` writes these files during setup.

Impact:

- Even if these are local/test-only credentials, committed session material is an unprofessional and risky pattern.
- It normalizes storing auth state in tracked paths.
- It also causes noisy repository churn when E2E tests update screenshots/state.

Suggested fix:

- Move E2E auth/session state into an ignored temp/output directory.
- Remove tracked generated screenshots and session artifacts from source control unless a specific visual baseline process exists.
- Add `.gitignore` rules for Playwright output, auth state, run state, and generated screenshots.

### Medium - Playwright E2E Exists But Is Not Part Of The Main Gate

Evidence:

- `In-Ex-Ledger-API/playwright.config.js` exists.
- E2E specs include:
  - `v3-pages.spec.js`
  - `v3-interactions.spec.js`
  - `canada-lifecycle.spec.js`
  - `comprehensive.spec.js`
  - `full-flow.spec.js`
  - `full-flow-v2.spec.js`
  - `fullWalkthrough.spec.js`
- Backend `test:all` excludes E2E specs.
- Existing package scripts expose `test:e2e`, `test:e2e:smoke`, and `test:e2e:comprehensive`, but the primary gate does not run them.

Impact:

- Browser-level regressions can land while `test:all` appears healthy.
- V3 route rendering and core interactions depend on a separate command that is easy to forget.
- Given V3 is now frontend truth, this gap matters more than it did during migration.

Suggested fix:

- Make `test:e2e:smoke` part of release/PR gating once local DB/test setup is reliable.
- Keep full E2E walkthroughs as scheduled/manual if runtime is too high.
- Record required DB/env setup in one place.

### Medium - Some E2E Specs Still Appear To Target Legacy/V2 UI Paths

Evidence:

- `tests/e2e/full-flow-v2.spec.js` is explicitly V2.
- `tests/e2e/full-flow.spec.js` and `tests/e2e/fullWalkthrough.spec.js` contain old-style selectors such as `#txType`, `#invoiceForm`, `#onboardingForm`, and route/page assumptions that may predate V3.
- This pass did not prove whether every selector is stale, but the naming and selectors are strong drift signals.

Impact:

- E2E coverage may be split between current V3 product truth and legacy historical flows.
- Failures may be hard to interpret: a failing E2E could mean V3 broke, legacy selectors are stale, or the test is no longer meaningful.

Suggested fix:

- Classify each E2E spec as current V3, active public/static, archived legacy reference, or retired.
- Do not update legacy E2E tests to wire old frontend back in.
- Rebuild the smoke suite around V3 user journeys.

### Medium - Internal/Private Exports Are Used As A Testing Shortcut

Evidence:

- 13 test files reference `__private`.
- Examples include service internals such as audit event helpers, usage email thresholds, and similar private implementation details.

Impact:

- Testing internals can be useful for critical pure functions, but broad use cements implementation details as public contracts.
- It makes refactors more expensive and encourages exposing internals only for tests.

Suggested fix:

- Keep `__private` only for stable pure functions that are intentionally part of the test seam.
- Prefer extracting reusable pure helpers into small modules with normal exports.
- Avoid exporting route/service internals just to assert implementation shape.

### Low/Medium - Test Naming And Script Taxonomy Are Hard To Navigate

Evidence:

- Backend package scripts mix focused test commands, one-off script tests, full harness commands, E2E commands, and maintenance commands.
- Test file names span unit, route, service, regression, security, E2E, source-policy, and build-pipeline checks without a clear grouping in the command layer.

Impact:

- It is not obvious which command a developer should run before a PR.
- It is not obvious which failures block launch versus which are advisory/manual.

Suggested fix:

- Create a test matrix in `Docs/` or `package.json` scripts:
  - fast local required
  - security required
  - V3 frontend required
  - DB/integration required
  - E2E smoke required
  - full/manual
- Make CI mirror the same categories.

Pass 23 status:

- No source changes made.
- No tests were run in this pass.
- Test-suite integrity inspection covered tracked backend tests, E2E specs/config, V3 package scripts, and representative brittle/monkey-patched test files.
- Highest-priority test fixes are: make `test:all` truthful or rename it, fix the current failing gate, remove tracked E2E session artifacts, add a V3 test layer, and start replacing source-regex/`Module._load` tests in the highest-risk routes.

---

## Pass 24 - Database Schema Versus Application Assumptions

Scope:

- Reviewed migration DDL, route SQL, service SQL, and representative tests for schema/application mismatches.
- Focused on constraints, enum-like fields, foreign-key ownership assumptions, soft-delete/void invariants, and `ON CONFLICT` targets.
- This pass did not connect to a live database. Earlier migration checksum verification already failed because local Postgres was unavailable.

Positive findings:

- Core transaction `type` and category `kind` have database `CHECK` constraints.
- Category case-insensitive upsert paths using `ON CONFLICT (business_id, lower(name))` are backed by `041_enforce_category_name_ci_unique.sql`.
- Transaction `account_id` and `category_id` foreign keys are intentionally hardened to `ON DELETE RESTRICT`.
- Several newer support/export/review tables have explicit `CHECK` constraints for status-like fields.
- Account/category delete routes are aware of `ON DELETE RESTRICT` and try to handle soft-deleted dependents.

### Medium/High - Cross-Business Child Links Are Not Enforced For Several Tables

Evidence:

- `support_artifacts` stores both `business_id` and `transaction_id`, but the schema only references `businesses(id)` and `transactions(id)` independently.
- `transaction_review_states` stores both `business_id` and `transaction_id`, also with independent foreign keys.
- `vehicle_expense_details` stores `transaction_id` and `business_id`, again with independent foreign keys.
- Similar patterns appear in export/review support schemas where `business_id` is trusted alongside a nullable or required child FK.

Impact:

- The app generally scopes queries by `business_id`, but the database does not guarantee that a child row's `transaction_id` belongs to the same `business_id`.
- A bug, failed migration, manual repair, or future script could create cross-business links that pass all individual foreign keys.
- For a financial/privacy app, cross-tenant relational integrity should not depend only on route discipline.

Suggested fix:

- Add composite uniqueness on parent tables where needed, such as `(id, business_id)` on `transactions`.
- Add composite foreign keys from child tables to `(transaction_id, business_id)` where the row stores both values.
- Backfill/validate with a query that detects mismatched child business IDs before adding constraints.

### Medium/High - Transaction `review_status` Is An App Enum But Not A DB Enum

Evidence:

- `037_add_cpa_edge_case_metadata.sql` adds `transactions.review_status TEXT NOT NULL DEFAULT 'ready'`.
- No database `CHECK` constraint was found for `transactions.review_status`.
- `routes/transactions.routes.js` defines valid values as `needs_review`, `ready`, `matched`, and `locked`.
- Multiple services and exports branch on these values.

Impact:

- Invalid review states can enter through scripts, imports, manual SQL, future routes, or bugs.
- Review queues, export readiness, email reminders, and V3 filters can silently misclassify transactions.
- This is especially risky because review status drives "ready" versus "needs attention" user-facing behavior.

Suggested fix:

- Add a validated `CHECK (review_status IN ('needs_review','ready','matched','locked'))`.
- Before enforcing, scan for existing values outside that set.
- Centralize the allowed values in one module and mirror them in the migration/test.

### Medium/High - Billing Plan And Status Values Are Not DB-Constrained

Evidence:

- `012_create_business_subscriptions.sql` creates:
  - `plan_code TEXT NOT NULL DEFAULT 'v1'`
  - `status TEXT NOT NULL DEFAULT 'trialing'`
- `20260515_fix_default_plan_code.sql` changes the default `plan_code` to `free`.
- No `CHECK` constraint was found for subscription `plan_code` or `status`.
- Billing/subscription code branches on values such as `free`, `v1`, `trialing`, `active`, `past_due`, `unpaid`, and `canceled`.

Impact:

- A typo in one write path can alter entitlements, billing UI, trial eligibility, or deletion/reactivation logic.
- The most business-critical access-control table is more permissive than lower-risk tables like bank connections and support artifacts.

Suggested fix:

- Add explicit constraints for supported `plan_code` and lifecycle `status` values.
- If Stripe can send unexpected statuses, store raw Stripe status separately in metadata and map it to an internal constrained status.
- Add tests that prove unknown status values are rejected or safely mapped.

### Medium - Account Type Taxonomy Is Split Between Routes, Tests, And Schema

Evidence:

- `accounts.type` is `TEXT NOT NULL` with no DB `CHECK`.
- `routes/accounts.routes.js` allows `checking`, `savings`, `credit_card`, `cash`, `loan`, and `custom`.
- Some tests/export fixtures use account type values such as `bank`.
- Plaid account creation writes into `accounts.type` through `routes/plaid.routes.js`.

Impact:

- Reports, exports, imports, and UI code can drift on what an account type means.
- DB rows can contain values the account route would never accept.
- This is a data-quality issue that will become harder to repair after bank sync/imports grow.

Suggested fix:

- Define one account type taxonomy and use it in routes, Plaid mapping, frontend options, tests, and schema.
- Add a DB `CHECK` once existing rows are normalized.
- Decide whether `bank` is a display/grouping value or a real stored type.

### Medium - Currency Is Stored In Many Places Without Consistent DB Constraints

Evidence:

- `transactions.currency` is added as text in `037_add_cpa_edge_case_metadata.sql`.
- `invoices_v1.currency` is `TEXT NOT NULL DEFAULT 'CAD'`.
- V2 business tables and billable expenses also store `currency TEXT NOT NULL`.
- Some code normalizes currency to `USD`/`CAD`; other paths accept any 3-letter code or pass request/export currency through.

Impact:

- Currency is financially meaningful, but enforcement is fragmented.
- Invalid or unsupported currency codes can break formatting, exports, billing assumptions, or tax-package presentation.
- Because the product appears to support US/CA, unrestricted currency text is probably too loose for current scope.

Suggested fix:

- Decide whether supported currencies are only `USD`/`CAD` or any ISO 4217 code.
- Add DB constraints accordingly.
- Route all currency normalization through one helper used by transactions, invoices, exports, billing, imports, and V3.

### Medium - Soft-Delete/Void Invariants Are Repeated In SQL Instead Of Being A Schema Abstraction

Evidence:

- This pass found 134 route/service matches for guards involving `deleted_at`, `is_void`, or `is_adjustment`.
- Core reporting queries repeatedly need:
  - `deleted_at IS NULL`
  - `(is_void = false OR is_void IS NULL)`
  - `(is_adjustment = false OR is_adjustment IS NULL)`
- The same concepts appear in analytics, exports, transactions, review, reminders, accounting locks, and plan usage.

Impact:

- Every new query must remember the full exclusion contract.
- A single missed guard can leak archived, voided, or adjustment records into analytics/export totals.
- Earlier passes already found export/accounting guard mismatch risk; this is the underlying schema/query design pressure.

Suggested fix:

- Create database views or query helpers for active reportable transactions.
- Add partial indexes that match the canonical active/reportable predicate.
- Add a source test that flags raw transaction aggregate queries without the canonical predicate, but prefer runtime tests for key reports.

### Medium - Business Profile Compliance Is Partially DB-Enforced And Partially Route-Enforced

Evidence:

- `20260523_enforce_compliance_rules.sql` adds checks for:
  - six-digit `business_activity_code`
  - allowed `business_type`
  - Canada disallowing `single_member_llc`
- Route code additionally enforces:
  - US businesses require `material_participation`
  - valid accounting method values
  - Canadian province requirements
  - fiscal year behavior for sole proprietorships
- No DB constraints were found for `accounting_method`, `material_participation` region requirements, province requirements, or GST/HST method values.

Impact:

- Some compliance facts are protected at the database layer and others only by route logic.
- Scripts, imports, admin repairs, or alternate routes can create business profiles that the UI/API would reject.
- Export generation then has to handle inconsistent profile states.

Suggested fix:

- Decide which compliance profile rules are true database invariants.
- Add constraints for stable invariants such as accounting method and GST/HST method values.
- Add partial constraints or validation jobs for conditional rules that are too complex for simple `CHECK`s.

### Medium - Deleted Recurring Template Handling Differs Between Account And Category Deletes

Evidence:

- `accounts.routes.js` blocks active recurring templates, then hard-deletes soft-deleted recurring templates that still reference the account because `recurring_transactions.account_id` is `NOT NULL` and `ON DELETE RESTRICT`.
- `categories.routes.js` checks `SELECT COUNT(*) FROM recurring_transactions WHERE category_id = $1 AND business_id = $2` with no `deleted_at IS NULL` filter.
- This means any recurring template, including a soft-deleted one, can block category deletion.

Impact:

- Account deletion and category deletion have different semantics for already-deleted recurring templates.
- Users may be unable to clean up an unused category because a logically deleted template still holds the FK.
- This is exactly the kind of edge behavior that grows out of soft-delete plus restrictive foreign keys.

Suggested fix:

- Align category deletion with account deletion semantics, or document why categories intentionally differ.
- Add tests for deleting categories referenced only by soft-deleted recurring templates.
- Consider allowing nullable category/account references on soft-deleted recurring templates if cleanup is expected.

### Low/Medium - `ON CONFLICT` Targets Are Mostly Backed, But This Needs A Guard

Evidence:

- `ON CONFLICT (business_id, lower(name))` in transactions/Plaid category creation is backed by `categories_business_name_unique_ci`.
- `ON CONFLICT (business_id, period_start)`, `(business_id, reminder_key)`, `(transaction_id)`, and other targets appear to have matching constraints/indexes.
- This pass was a static inspection, not a live catalog verification.

Impact:

- Current obvious conflict targets look mostly intentional, but a future migration can easily break this without a live schema test.
- Because migration ordering is already hard to reason about, static confidence is not enough.

Suggested fix:

- Add a DB-backed schema contract test that queries `pg_indexes` / `pg_constraint` for expected unique indexes and checks.
- Run it in CI against a migrated test database.

Pass 24 status:

- No source changes made.
- No tests were run.
- Schema/application inspection covered migrations, route SQL, service SQL, and representative tests for constraints, foreign keys, soft-delete predicates, and enum-like fields.
- Highest-priority schema fixes are: enforce cross-business child links with composite FKs, constrain transaction `review_status`, constrain billing plan/status values, normalize account type taxonomy, and centralize active/reportable transaction predicates.

---

## Pass 25 - Multi-Tenant Scoping And Authorization Consistency

Scope:

- Inspected business/user scoping helpers, auth middleware, support/admin routes, system diagnostics, V2 entitlement middleware, business management routes, export scoping, message scoping, support artifact scoping, review scoping, billing mock routes, and public webhook entry points.
- Confirmed legacy frontend remains archived reference-only. No attempt was made to wire it into V3 or active routes.

Files inspected:

- `In-Ex-Ledger-API/middleware/auth.middleware.js`
- `In-Ex-Ledger-API/middleware/requireSupportSecret.js`
- `In-Ex-Ledger-API/middleware/requirePlanFeature.js`
- `In-Ex-Ledger-API/api/utils/resolveBusinessIdForUser.js`
- `In-Ex-Ledger-API/api/utils/requireV2BusinessEnabled.js`
- `In-Ex-Ledger-API/routes/index.js`
- `In-Ex-Ledger-API/routes/internalSupport.routes.js`
- `In-Ex-Ledger-API/routes/system.routes.js`
- `In-Ex-Ledger-API/routes/businesses.routes.js`
- `In-Ex-Ledger-API/routes/exports.routes.js`
- `In-Ex-Ledger-API/routes/messages.routes.js`
- `In-Ex-Ledger-API/routes/supportArtifacts.routes.js`
- `In-Ex-Ledger-API/routes/review.routes.js`
- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/routes/email.routes.js`
- `In-Ex-Ledger-API/routes/supportEmail.routes.js`
- `In-Ex-Ledger-API/routes/plaid.routes.js`
- `In-Ex-Ledger-API/services/diagnosticsService.js`

### Positive - Explicit Business Ownership Checks Exist In The Core Business Switcher

Evidence:

- `setActiveBusinessForUser(userId, businessId)` verifies the target business belongs to the user before updating `users.active_business_id`.
- `businesses.routes.js` profile reads/writes use `fetchOwnedBusinessProfile(req.user.id, req.params.id)` and `updateOwnedBusinessProfile(req.user.id, req.params.id, ...)`.
- Business deletion verifies `SELECT id, name FROM businesses WHERE id = $1 AND user_id = $2`.
- Export generation uses an export grant tied to both `businessId` and `userId`, then re-resolves the current active business before generating.
- Message routes consistently include `business_id` plus sender/receiver participation checks for inbox, sent, thread, read, resolve, archive, and delete operations.

Impact:

- This is not a codebase where tenant scoping is absent. The dominant pattern is to scope data by active business or owned business IDs.
- That lowers the likelihood of obvious direct cross-tenant reads through normal app routes.

### High - Internal Support API Is A Shared-Secret Cross-Tenant Surface

Evidence:

- `routes/index.js` mounts `/api/internal/support` globally.
- `internalSupport.routes.js` applies `router.use(requireSupportSecret)`.
- `requireSupportSecret.js` accepts a single `x-support-secret` value compared to `INEX_LEDGER_SUPPORT_SECRET`.
- The support routes can fetch user details by email, business details by business ID, and subscription details by user ID.
- Returned user data includes `userId`, `email`, `displayName`, `emailVerified`, `role`, `plan`, `status`, `region`, `language`, and `createdAt`.
- No per-agent identity, role binding, route-local limiter, approval workflow, or durable support audit table was visible in this route.

Impact:

- A leaked support secret becomes broad cross-tenant read access.
- The app cannot answer who performed a support lookup; it can only know that someone had the shared secret.
- This is not professional-grade support access control for a finance app.

Suggested fix:

- Replace the shared-secret-only model with authenticated support-agent identity plus role/permission checks.
- Keep a secret or mTLS layer only as an additional service-auth factor, not the user identity.
- Add rate limiting, purpose logging, durable support audit events, and field-level minimization for every support lookup.
- Add tests proving normal users cannot call support routes and support access is attributed to a named agent.

### Medium/High - `requireAuth` Trusts JWT State Without A Fresh User/Session Check

Evidence:

- `auth.middleware.js` reads bearer/cookie tokens, verifies the JWT, and assigns `req.user = decoded`.
- It does not load the current user row, active session, disabled/deleted status, current role, current email verification status, or token revocation state during normal request auth.
- Route-specific middleware sometimes checks email verification, but many authenticated routes only require `requireAuth`.
- `getRequestToken` prefers `Authorization: Bearer ...` over the cookie token even though the product direction is cookie-only.

Impact:

- Access tokens can continue carrying stale role/business/email state until expiry.
- Account deletion, support role removal, email verification changes, or security lockouts may not take effect immediately on all routes.
- Bearer-token support expands the attack surface beyond the browser cookie model and conflicts with the cookie-only contract already flagged in the security pass.

Suggested fix:

- Make `requireAuth` hydrate a minimal current user/session record or add a separate strict middleware used by every user-data route.
- Enforce disabled/deleted/session-revoked/email-verification state centrally.
- Remove bearer token acceptance once all first-party clients are cookie-based, or isolate it to documented machine-token endpoints.

### Medium/High - `resolveBusinessIdForUser` Mutates State During Read-Like Route Resolution

Evidence:

- `resolveBusinessIdForUser(user)`:
  - reads `users.active_business_id`,
  - falls back to the first `businesses.user_id`,
  - updates `users.active_business_id`,
  - creates a business if none exists,
  - optionally seeds default accounts/categories,
  - mutates the in-memory `user.business_id`.
- This helper is used throughout normal routes and middleware, including plan feature checks, billing, analytics, accounts, categories, receipts, transactions, Plaid, businesses, and V2 feature checks.
- Passing `{ seedDefaults: false }` prevents default seed rows, but does not clearly mean "do not create a business".

Impact:

- A read-like request can create durable tenant state.
- Feature checks and diagnostics-adjacent flows can accidentally provision businesses for users that are partially registered, reactivated, deleted, or in an unexpected state.
- The helper name reads like a resolver but it also performs provisioning and user mutation, which is over-broad and easy to misuse.

Suggested fix:

- Split this into separate APIs:
  - `getActiveBusinessIdForUser` for no-mutation reads.
  - `ensureActiveBusinessForUser` for explicit provisioning flows.
  - `setActiveBusinessForUser` for explicit switching.
- Make creation impossible unless the route name and tests prove provisioning is intended.
- Rename options so `seedDefaults: false` cannot be mistaken for "no mutation".

### Medium - `scope=all` Is Powerful And Inconsistently Exposed

Evidence:

- `getBusinessScopeForUser(user, requestedScope)` returns all user-owned business IDs when `requestedScope` lowercases to `all`.
- It is used in:
  - `accounts.routes.js`
  - `categories.routes.js`
  - `transactions.routes.js`
  - `receipts.routes.js`
- Several receipt detail/download/delete paths request `"all"` internally.
- Many other routes remain active-business-only.

Impact:

- This is not a direct cross-user leak because the helper lists businesses by `user_id`.
- It is still a tenant-boundary consistency risk: some APIs can span all owned businesses, while others silently use only the active business.
- Reporting, receipt attachment, and export expectations can diverge if the UI does not make scope explicit.

Suggested fix:

- Define a written policy for active-business routes versus all-owned-business routes.
- Require explicit route names or query documentation for all-owned-business behavior.
- Add contract tests for each `scope=all` route proving it includes owned businesses and excludes non-owned businesses.

### Medium - Authenticated Diagnostics Are Available To Every Logged-In User

Evidence:

- `system.routes.js` exposes `GET /api/system/diagnostics` with `requireAuth`.
- `diagnosticsService.js` intentionally returns booleans/counts rather than secrets, but still reports operational facts:
  - app version/commit/node env/uptime
  - migration counts and last timestamps
  - rate-limit Redis mode/config/connection status
  - receipt storage mode/config status
  - inbound email readiness
  - Stripe secret/webhook/price-env configuration status
  - encryption/export-grant/auth secret configuration booleans

Impact:

- The data is sanitized, but it is operational intelligence.
- Any authenticated customer can see deployment readiness and configuration gaps that should probably be support/admin-only.
- The route comment says it is useful for settings diagnostics and support, but that product choice should be explicit.

Suggested fix:

- Decide whether customer-facing diagnostics is a real product feature.
- If not, require admin/support role or a scoped support session.
- If yes, split customer-safe diagnostics from internal diagnostics and remove deployment/configuration details from the customer version.

### Medium - App Authorization Still Depends On Child-Row `business_id` Consistency

Evidence:

- Pass 24 found tables with both `business_id` and `transaction_id` where independent foreign keys do not enforce that the transaction belongs to the same business.
- `supportArtifacts.routes.js` verifies transaction ownership for uploads and review-note creation, but the artifact list endpoint filters by `support_artifacts.business_id` and caller-supplied `transaction_id` without first verifying the transaction belongs to the business.
- `review.routes.js` verifies transaction ownership when creating review issues, but `GET /issues/:transactionId` filters `transaction_review_states.business_id` and the requested transaction ID without joining back to `transactions`.

Impact:

- Normal route code tries to write consistent rows, so this is not an obvious live exploit from the inspected handlers.
- If a script, migration, bug, manual repair, or future route inserts mismatched child rows, read authorization can trust the wrong `business_id`.
- This is exactly where app-only tenant scoping becomes brittle.

Suggested fix:

- Add composite database constraints so child rows cannot reference a transaction from another business.
- For read paths that take `transactionId`, join to `transactions` on both `id` and `business_id` or verify ownership before returning child rows.
- Add regression tests that attempt mismatched child rows and prove they are impossible or invisible.

### Medium - Role/Support Semantics Are String-Based And Scattered

Evidence:

- `messages.routes.js` treats users with `role IN ('it_support', 'admin')` as globally visible support contacts.
- `internalSupport.routes.js` does not use the normal user role system at all; it uses only the support secret.
- `auth.middleware.js` passes through whatever role is in the JWT.
- No central `requireRole(...)` or `requireSupportAgent(...)` middleware was visible in the inspected files.

Impact:

- Support/admin semantics are implemented differently across routes.
- Future support features can easily pick the wrong model: JWT role, DB role, or shared secret.
- This is a professionalism issue and a security maintainability issue.

Suggested fix:

- Create one role/permission service for support/admin decisions.
- Make routes call named policies such as `canViewSupportInbox`, `canLookupCustomer`, and `canSeeInternalDiagnostics`.
- Add tests that role changes in the DB affect access consistently.

### Positive - Public Webhook Entry Points Are Not Plain Open Posts

Evidence:

- Billing webhook verifies Stripe signatures and has idempotency handling.
- Invoice inbound email verifies Svix or custom HMAC signatures, has timestamp tolerance, and rejects legacy static-secret fallback in production unless explicitly enabled.
- Support inbound email has similar signed-webhook verification and replay tracking.
- Plaid webhook verifies the Plaid JWT-style verification header and body hash.

Impact:

- Earlier documentation may overstate or misdescribe webhook architecture, but the current route code is materially better than "public endpoint with no verification."
- Remaining risk is more about replay cache durability and operational monitoring than missing first-line webhook authentication.

Suggested fix:

- Keep these signature checks covered by tests.
- Move replay/idempotency state to a durable/shared store for multi-instance production where needed.
- Align docs with the actual webhook verification contracts.

Pass 25 status:

- No source changes made.
- No tests were run.
- Multi-tenant review covered core business resolution, active/all business scope, explicit business ownership routes, support/admin surfaces, diagnostics, webhook entry points, exports, messages, support artifacts, and review queues.
- Highest-priority fixes are: replace shared-secret support access, centralize current-user/session validation in auth, split business resolution from provisioning, define active-vs-all business scope policy, and harden child-row tenant integrity at the database and query layers.

---

## Pass 26 - Billing, Subscriptions, Entitlements, And Feature Gating

Scope:

- Inspected canonical plan catalog, subscription derivation, Basic usage limits, entitlement routes, feature-gate middleware, billing routes, business workspace capacity, V3 plan provider/gates, export feature checks, analytics tax gates, recurring gates, and billing-related tests.
- No legacy frontend wiring was touched or considered active.

Files inspected:

- `In-Ex-Ledger-API/config/planCatalog.js`
- `In-Ex-Ledger-API/services/subscriptionService.js`
- `In-Ex-Ledger-API/services/basicPlanUsageService.js`
- `In-Ex-Ledger-API/services/stripePriceConfig.js`
- `In-Ex-Ledger-API/middleware/requirePlanFeature.js`
- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/routes/businesses.routes.js`
- `In-Ex-Ledger-API/routes/entitlements.routes.js`
- `In-Ex-Ledger-API/routes/exports.routes.js`
- `In-Ex-Ledger-API/routes/analytics.routes.js`
- `In-Ex-Ledger-API/routes/transactions.routes.js`
- `In-Ex-Ledger-API/routes/receipts.routes.js`
- `In-Ex-Ledger-API/routes/recurring.routes.js`
- `In-Ex-Ledger-API/routes/invoices-v1.routes.js`
- `In-Ex-Ledger-API/db/migrations/012_create_business_subscriptions.sql`
- `In-Ex-Ledger-API/db/migrations/20260515_fix_default_plan_code.sql`
- `In-Ex-Ledger-API/frontend-v3/src/context/PlanContext.tsx`
- `In-Ex-Ledger-API/frontend-v3/src/lib/planApi.ts`
- `In-Ex-Ledger-API/frontend-v3/src/components/PlanGate.tsx`
- `In-Ex-Ledger-API/frontend-v3/src/components/UpgradePrompt.tsx`
- `In-Ex-Ledger-API/frontend-v3/src/pages/BusinessWorkspaces.tsx`
- `In-Ex-Ledger-API/tests/planCatalog.test.js`
- `In-Ex-Ledger-API/tests/businessUsageService.test.js`
- Representative billing tests: `billingAddonManagement`, `billingCurrencyResolution`, `billingMockRoutes`, `billingSubscriptionRecovery`, `billingWebhook`, `businessCreationLimit`, and entitlement/recurring/transaction feature tests.

### Positive - There Is A Real Canonical Plan Catalog

Evidence:

- `config/planCatalog.js` defines internal plan codes, display names, feature keys, feature maps, and Basic limits.
- Every plan explicitly lists every feature key.
- Unknown feature keys fail closed:
  - throw outside production,
  - log and return false in production.
- `tests/planCatalog.test.js` verifies complete feature maps, unknown-feature behavior, Basic limits, Pro feature coverage, public plan names, and internal DB code preservation.

Impact:

- This is a professional pattern. It reduces plan drift and avoids hard-to-find free-access bugs caused by default-allow behavior.
- The codebase has a reasonable foundation for billing/entitlement correctness.

### Positive - Basic Usage Limits Are Enforced Server-Side, Not Only In V3

Evidence:

- `basicPlanUsageService.js` defines:
  - 50 Basic transactions per month,
  - 25 Basic receipt uploads per month,
  - CSV imports consuming the same monthly transaction allowance.
- `transactions.routes.js` calls `assertCanCreateTransactions(...)` under a per-business advisory transaction lock before inserting a transaction.
- CSV import calls `assertCanImportCsvRows(...)` before inserts.
- `receipts.routes.js` calls `assertCanUploadReceipts(...)` and `incrementReceiptUsage(...)` under an advisory lock before commit.
- Receipt usage is not decremented on deletion, preventing delete/re-upload bypass.
- `businessUsageService.test.js` covers Basic cap rejection and Pro non-enforcement behavior.

Impact:

- The important metered Basic limits are actually enforced at the backend mutation points.
- The frontend usage meter is presentation-only, which is the right authority split.

### Positive - Business Workspace Capacity Is Locally Enforced With Locking

Evidence:

- `businesses.routes.js` resolves the billing anchor business, fetches its subscription, reads `subscription.maxBusinessesAllowed`, and then locks on the user ID before creating another business.
- Creation checks `SELECT COUNT(*) FROM businesses WHERE user_id = $1` inside the transaction and returns `402 additional_business_payment_required` when capacity is exhausted.
- New businesses inherit the billing anchor's paid/trial window instead of getting a new independent trial.
- `businessCreationLimit.test.js` exists for this behavior.

Impact:

- Local business-slot enforcement is not just a UI upsell. The server enforces it.
- The user cannot trivially bypass workspace capacity by calling the API directly.

### High - Subscription `plan_code` And `status` Still Lack DB Constraints

Evidence:

- `012_create_business_subscriptions.sql` creates:
  - `plan_code TEXT NOT NULL DEFAULT 'v1'`
  - `status TEXT NOT NULL DEFAULT 'trialing'`
  - no `CHECK` constraint for allowed plan codes,
  - no `CHECK` constraint for allowed statuses.
- `20260515_fix_default_plan_code.sql` changes the default to `'free'`, but still does not constrain values.
- `deriveEffectiveState(row)` normalizes unknown plan behavior in code, but the database accepts arbitrary values.

Impact:

- Billing access depends on application interpretation of unconstrained text.
- Scripts, manual repairs, broken migrations, or Stripe sync bugs can leave invalid subscription states that are not rejected at write time.
- This is high-risk because subscription state gates paid features and business capacity.

Suggested fix:

- Add DB `CHECK` constraints for known `plan_code` and `status` values.
- Add a migration that first reports any invalid existing rows, then repairs or blocks.
- Add a schema contract test that verifies the constraints exist in `pg_constraint`.

### Medium/High - Entitlement Feature Names Are More Granular Than Backend Enforcement

Evidence:

- The catalog has separate feature keys:
  - `pdf_exports`
  - `advanced_exports`
  - `export_history`
  - `basic_csv_export`
- `exports.routes.js` gates multiple export/history surfaces with `"pdf_exports"`:
  - `POST /history`
  - non-basic exports in `/request-grant`
  - export history listing and diagnostics
  - redacted PDF download
  - secure export
- `csv_basic` is allowed, but `csv_full`, `csv_excluded`, and `csv_category_summary` are denied via `pdf_exports`, not `advanced_exports`.
- `export_history` exists in the catalog and deprecated `/entitlements/features`, but no backend route check appears to use `export_history`.

Impact:

- The catalog implies product-level control that the route layer does not actually honor.
- If future pricing wants PDF exports, advanced CSV exports, and export history to differ, the existing enforcement will be wrong.
- Even today, this is confusing: a user can be blocked from CSV full export with a `pdf_exports` feature error.

Suggested fix:

- Replace string literals with `FEATURE_KEYS`.
- Map each export route/action to the exact feature it needs:
  - Basic CSV export -> `basic_csv_export`.
  - PDF generation/download -> `pdf_exports`.
  - CPA/full/excluded/category CSV -> `advanced_exports`.
  - export history/list/diagnostics -> `export_history`.
- Add route tests per export type and per history endpoint for Basic vs Pro.

### Medium - Paid Feature Checks Use Raw String Literals In Several Routes

Evidence:

- `recurring.routes.js` uses `FEATURE_KEYS.RECURRING_TRANSACTIONS`, which is the better pattern.
- Other routes use string literals:
  - `transactions.routes.js`: `"edge_case_tools"`
  - `analytics.routes.js`: `"tax_estimates"`
  - `exports.routes.js`: `"pdf_exports"`
- `planHasFeature` fails closed for unknown strings, but production only logs and returns false.

Impact:

- Typos in development/test are caught, but route code still lacks compile-time or lint-level protection.
- A misspelled feature in production becomes an outage for that feature instead of a visible test failure if the route lacks coverage.
- This is an avoidable professionalism gap now that a canonical `FEATURE_KEYS` object exists.

Suggested fix:

- Use `FEATURE_KEYS` everywhere in backend route code.
- Add a source-level test or ESLint rule that bans raw feature-key strings outside `planCatalog.js`, tests, and frontend type definitions.
- Prefer `requirePlanFeature(FEATURE_KEYS.X)` for route-wide gates where possible.

### Medium - Tax Estimate Entitlement Is Data-Masked, Not Route-Gated

Evidence:

- `analytics.routes.js` loads the subscription and checks `hasFeatureAccess(subscription, "tax_estimates")`.
- It still computes dashboard analytics for Basic businesses and returns:
  - `estimated_tax_liability_pct: null`
  - `se_tax_estimate: null`
  - `has_tax_estimates: false`
- Other analytics endpoints such as `/cash-flow`, `/seasonal`, and `/whatif` are available under Basic through the general `basic_analytics` feature concept, but they do not call the catalog directly.

Impact:

- This may be intentional product behavior: Basic gets analytics, Pro gets tax-specific estimate values.
- The issue is that entitlement semantics are implicit in one route instead of a clear policy.
- If "tax estimates" is meant to be a paid feature, masking two fields is weaker than enforcing a named capability boundary.

Suggested fix:

- Document whether `tax_estimates` means "hide only tax estimate fields" or "block tax-estimate endpoints."
- If only field masking is intended, add tests proving Basic receives null tax fields and Pro receives numbers.
- If route gating is intended, split tax estimate data to a dedicated endpoint and gate it with `requirePlanFeature(FEATURE_KEYS.TAX_ESTIMATES)`.

### Medium - Billing Anchor Model Is Complex And Needs More Contract Tests

Evidence:

- `findBillingAnchorBusinessIdForUser(...)` chooses one business subscription as the billing anchor based on Stripe subscription/customer presence and active business preference.
- `billing.routes.js` scopes subscription, checkout, portal, add-on, overview, and billing history through that anchor.
- `businesses.routes.js` also migrates anchor subscription state when deleting the anchor business.
- During business deletion, Stripe slot sync failure is logged but local deletion proceeds; comments say the slot count will reconcile on the next sync.

Impact:

- The anchor model supports multi-business billing, but it is subtle.
- A Stripe outage during deletion can leave paid slot count out of sync with local business count.
- Because add-on slots drive billable quantity, this is both billing correctness and customer trust risk.

Suggested fix:

- Add a durable reconciliation job/report for local business count vs Stripe add-on quantity.
- Add tests for deleting the billing anchor, deleting a non-anchor business, Stripe failure during deletion, and later reconciliation.
- Surface a support/admin diagnostic when local and Stripe slot counts diverge.

### Medium - Trial And Mock Billing Are Carefully Gated, But Still Operationally Sensitive

Evidence:

- `billing.routes.js` has `isMockBillingAllowed()` requiring:
  - `ENABLE_MOCK_BILLING === "true"`,
  - not production,
  - no live Stripe key.
- `GET/POST /mock-v1` also require auth; POST requires CSRF.
- Tests cover mock billing not being publicly readable and returning 404 when disabled.
- Trial selection and re-upgrade logic is handled through `setTrialPlanSelectionForBusiness(...)`, `isTrialReupgradeAttempt(...)`, and checkout normalization.

Impact:

- The obvious production footgun is guarded.
- This still deserves operational attention because billing state mutation endpoints are inherently high-impact.

Suggested fix:

- Keep mock billing tests in the main gate.
- Add an environment validation warning/error if `ENABLE_MOCK_BILLING=true` is ever combined with production-like deployment settings.
- Add audit events for mock billing activation, even though it should be non-production only.

### Medium - Frontend Plan Gates Are Presentation-Only, But Coverage Looks Partial

Evidence:

- `PlanContext.tsx` correctly states the backend remains authoritative.
- `PlanGate.tsx` is a presentation-only feature gate and supports all known feature keys.
- `BusinessWorkspaces.tsx` uses plan/subscription data for capacity UX and then relies on backend creation limits.
- Direct `usePlan()` usages found in V3 are concentrated in Pricing, Settings, Subscription, BusinessWorkspaces, and the generic gates.

Impact:

- This is the right architecture: do not trust UI gates.
- But if pages bypass `PlanGate`, users may see actions that later fail with API errors. That is a UX/professionalism issue, not the primary security boundary.
- Earlier V3 passes already found modal/copy issues; plan-gated UX needs the same systematic polish.

Suggested fix:

- Inventory every Pro-only action in V3 and ensure it either uses `PlanGate` or handles `feature_requires_plan` with `UpgradePrompt`.
- Add a V3 test/smoke for Basic user flows through recurring, exports, advanced transaction fields, and business slots.

### Low/Medium - Pricing Has Verified And Fallback Sources That Can Drift

Evidence:

- `billing.routes.js` can build pricing from Stripe price objects.
- It also has fallback static pricing:
  - USD monthly base/add-on: 12/5
  - USD yearly base/add-on: 122.4/51
  - CAD monthly base/add-on: 17/7
  - CAD yearly base/add-on: 175/72
- V3 pricing pages call backend pricing APIs rather than hardcoding these values in the inspected frontend files.

Impact:

- The fallback is useful for availability, but any fallback pricing can become stale compared with Stripe.
- If fallback pricing is displayed while Stripe is misconfigured, users may see prices the checkout cannot honor.

Suggested fix:

- Add a visible `verified` flag handling in the UI if fallback pricing is used.
- Alert operationally when pricing falls back.
- Keep fallback values documented and tested against current public pricing copy.

Pass 26 status:

- No source changes made.
- No tests were run.
- Billing/entitlement review covered plan catalog, subscription state derivation, Basic usage caps, Stripe price mapping, mock billing, checkout/add-on flows, business capacity, export gating, analytics gating, V3 plan context/gates, and representative tests.
- Highest-priority fixes are: constrain subscription plan/status values in DB, align export routes with the exact feature keys, replace raw feature strings with `FEATURE_KEYS`, clarify tax-estimate gating semantics, and add reconciliation coverage for Stripe slot count vs local business count.

## Pass 27 - Cross-Cutting Error Handling And API Response Consistency

Scope inspected:

- `server.js` global 404 and error handlers.
- Representative route families: auth, businesses/business profile, customers, vendors, projects, billable expenses, bills, invoices, email/support webhooks, Plaid, transactions, receipts, exports, internal support.
- Error helper/domain signals: plan feature errors, Basic plan limit errors, accounting lock errors, billing validation errors, recurring validation errors.
- Silent/best-effort catch patterns across middleware/routes/services.

### Positive - A Central Express Error Handler Exists

Evidence:

- `server.js` has a final Express error handler that:
  - derives status from `err.status` / `err.statusCode`,
  - logs method/path/status/message,
  - hides internal 500 details behind `Internal server error`,
  - includes stack only outside production.
- Domain-specific errors exist in several areas:
  - `feature_requires_plan`
  - `BasicPlanLimitError`
  - `AccountingPeriodLockedError`
  - `BillingValidationError`
  - `RecurringTemplateValidationError`

Impact:

- The app has the start of a professional error model.
- This is not a greenfield problem; the cleanup can consolidate existing good pieces instead of inventing everything from scratch.

Suggested fix:

- Preserve the central handler and domain errors.
- Add a small `ApiError`/`sendApiError` layer only where it reduces route duplication and stabilizes API contracts.

### Medium/High - Most Route Errors Bypass The Central Error Handler

Evidence:

- Many routes use local `try/catch` blocks that directly send `res.status(...).json(...)`.
- Examples:
  - `business.routes.js` logs `err.stack || err` and returns bespoke 500 messages.
  - `businesses.routes.js` returns `{ success: false, error: ... }` for some failures but `{ error: ... }` elsewhere.
  - `customers.routes.js`, `vendors.routes.js`, `bills.routes.js`, `projects.routes.js`, `billable-expenses.routes.js`, and `invoices.routes.js` each hand-roll similar CRUD error responses.
  - `internalSupport.routes.js` uses `{ ok: false, message: ... }`.
  - email/support webhook routes use `{ ok: false, error: ... }`.

Impact:

- The central handler cannot consistently sanitize, log, shape, or correlate failures.
- Client code must infer several response shapes.
- This is a maintainability and professionalism issue, and it increases the chance that future fixes only cover one route family.

Suggested fix:

- Introduce an async route wrapper and a shared error responder.
- Let route code throw typed/domain errors for expected 400/401/403/404/409/422 cases.
- Keep route-local catches only for true compensation/rollback work, then rethrow or pass to `next(err)`.

### Medium/High - Some V2 CRUD Routes Misclassify Internal Failures As 400

Evidence:

- `billable-expenses.routes.js` returns 400 for create/update/delete catch blocks after service calls fail.
- `projects.routes.js` returns 400 for create/update/delete catch blocks after service calls fail.
- Comparable routes such as `customers.routes.js`, `vendors.routes.js`, `bills.routes.js`, and `invoices.routes.js` mostly return 500 for service failures.

Impact:

- A database outage, constraint drift, or unexpected service exception can look like a client validation mistake.
- Monitoring and frontend behavior become less trustworthy.
- This is also a clear AI-slop/scaffold smell: near-identical CRUD files differ in status semantics for no obvious domain reason.

Suggested fix:

- Split validation errors from service/runtime failures.
- Use typed service errors for known conflict/not-found/validation cases.
- Default unknown route failures to 500 through the central handler.

### Medium - Error Envelopes Are Inconsistent Across The API

Evidence:

- Shapes seen in active routes include:
  - `{ error: "..." }`
  - `{ error: "...", code: "..." }`
  - `{ success: false, error: "..." }`
  - `{ ok: false, error: "..." }`
  - `{ ok: false, message: "..." }`
  - `{ detail: "..." }`
  - plain `.send("...")` text responses in auth email verification flows.
- Some errors include feature/limit metadata; others drop codes entirely.
- Code casing also varies, for example `feature_requires_plan` and `ACCOUNTING_PERIOD_LOCKED`.

Impact:

- Frontend error handling becomes defensive and inconsistent.
- Contract tests are harder to write.
- External integrations/webhooks are harder to document cleanly.

Suggested fix:

- Standardize on one backward-compatible envelope, for example top-level `error` plus optional `code`/`details` during migration.
- Document canonical error codes and casing.
- Add contract tests for representative 400, 401, 403, 404, 409, 422, 429, and 500 responses.

### Medium - Route-Level Logging Still Emits Raw Error Details

Evidence:

- Multiple routes log `err.stack || err` or raw `err.message` directly in catch blocks.
- This overlaps with Pass 18's observability finding: logs lack request IDs and are not centrally normalized.

Impact:

- Sensitive or noisy internals can leak into production logs.
- Repeated route-local logging risks duplicate logs when central handling is later added.
- Without request IDs, these logs remain hard to connect to user-visible failures.

Suggested fix:

- Centralize error logging in the final error handler.
- Log structured fields: request ID, route, user ID, business ID, error code, status, sanitized message.
- Avoid raw stack logging except in controlled non-production diagnostics.

### Medium - Silent And Best-Effort Catches Need A Written Policy

Evidence:

- Some silent catches are reasonable, such as rollback cleanup, parser fallback, optional response header decoration, or defensive URL parsing.
- Others hide operationally meaningful work:
  - audit/event writes,
  - export reminder/snapshot side effects,
  - email/preference side effects,
  - file cleanup attempts.

Impact:

- Best-effort side effects are acceptable only when failures are observable somewhere.
- Today the distinction is not encoded consistently, which makes data lifecycle and incident response weaker.

Suggested fix:

- Classify side effects as required, compensating, or best-effort.
- Required failures should fail the request before commit.
- Best-effort failures should emit structured warnings/metrics with request/business context.

### Medium - Auth Verification Routes Mix Browser Flows And API Error Contracts

Evidence:

- `auth.routes.js` email verification and email-change/recovery confirmation routes return plain `.send("Token is required.")`, `.send("Invalid or expired link.")`, and similar text responses.
- The same auth module also exposes JSON API endpoints for login/session/password/MFA flows.

Impact:

- Browser-click verification routes can be special, but the boundary is not explicit.
- If V3 or tests treat these as API endpoints, response handling will be inconsistent.

Suggested fix:

- Decide which auth routes are browser document/redirect flows and which are JSON APIs.
- For browser flows, redirect to a V3 result page with a stable status query/code.
- For API flows, use the canonical JSON error envelope.

### Low/Medium - Business Profile Validation Is Duplicated Across Similar Route Families

Evidence:

- `business.routes.js` and `businesses.routes.js` both handle business profile concepts, validation messages, and snapshot invalidation.
- Messages and response shapes differ between the single active-business endpoint and multi-business profile endpoints.

Impact:

- Fixes to tax/compliance validation can land in one route family and miss the other.
- This creates source-of-truth drift in a business-critical surface.

Suggested fix:

- Extract shared business profile validation/update rules into one service.
- Keep route files focused on auth/scope and HTTP translation.

Pass 27 status:

- No source changes made.
- No tests were run.
- Cross-cutting error review covered central handlers, representative route families, route-local catch behavior, response envelope drift, browser-vs-API auth responses, and silent/best-effort catch policy.
- Highest-priority fixes are: centralize error shaping/logging, correct V2 CRUD 400-vs-500 misclassification, standardize the API error envelope, and write policy/tests for best-effort side effects.

## Pass 28 - External Integrations, Webhooks, Retries, And Idempotency

Scope inspected:

- Stripe billing routes and `stripeClient`.
- Stripe webhook signature verification and event reservation.
- Plaid link/exchange/sync/webhook flow.
- Inbound email and support email webhook verification/storage.
- Import batch tracking and duplicate detection.
- Relevant migration signals for Stripe events, bank connections, transaction imports, external transaction IDs, and message email-threading columns.

### Positive - Stripe Webhook Idempotency Is Durable And Mostly Professional

Evidence:

- `billing.routes.js` verifies Stripe signatures against raw body, timestamp tolerance, and all `v1=` signatures.
- `reserveWebhookEvent(event.id)` inserts into `stripe_webhook_events` with `ON CONFLICT DO NOTHING`.
- If reservation fails because the DB is unavailable, the webhook returns 500 so Stripe can retry.
- Duplicate events return 200 with `{ received: true, duplicate: true }`.
- `releaseWebhookEvent(event.id)` exists so failed processing can allow retry.
- Migration `049_create_stripe_webhook_events.sql` creates the backing table and processed-at index.

Impact:

- This is one of the better-engineered integration areas.
- It directly addresses a common payment-webhook failure mode: acknowledging before durable processing.

Suggested fix:

- Keep this pattern as the standard for future external webhooks.
- Add focused tests for:
  - duplicate Stripe event ID,
  - DB reservation failure,
  - processing failure followed by retry,
  - missing event ID.

### Medium/High - Outbound Stripe Mutations Are Not Consistently Idempotent

Evidence:

- Checkout session creation uses an idempotency key:
  - `stripeRequest("/checkout/sessions", ..., { idempotencyKey: ... })`.
- Many other Stripe mutations do not pass idempotency keys:
  - customer creation in `ensureStripeCustomer`,
  - billing portal session creation,
  - subscription cancel/resume/update,
  - additional-business subscription item updates,
  - `businesses.routes.js` add-on compensation/update paths.
- `stripeClient.js` supports `options.idempotencyKey`, but most callers do not use it.

Impact:

- User retries, network timeouts, or double-clicks can produce duplicate or ambiguous Stripe-side mutations.
- Some operations are naturally less dangerous, but subscription item updates and customer creation should have deliberate idempotency semantics.

Suggested fix:

- Define idempotency keys per mutation type, scoped by business/user/target state.
- Start with high-impact mutations:
  - customer creation,
  - subscription cancel/resume,
  - additional-business quantity changes,
  - direct plan interval changes.
- Add tests that simulate retry after Stripe success but before local sync.

### Medium/High - Inbound Email Replay Protection Is In-Memory Only

Evidence:

- `email.routes.js` and `supportEmail.routes.js` verify Svix/custom signatures and maintain `inboundReplayCache` in memory.
- The replay key uses Svix ID or custom signature, with TTL pruning.
- Unlike Stripe, there is no durable webhook-event table for inbound email/support events.
- Message rows store `external_message_id`, `external_references`, and `external_in_reply_to`, but migrations only add columns/indexes; no unique dedupe constraint was found.

Impact:

- Replay protection resets on process restart or horizontal scaling.
- Provider retries can insert duplicate inbound replies/messages if the same signed event is delivered to a different instance or after memory loss.
- This is a production professionalism issue because email integrations are retry-heavy by design.

Suggested fix:

- Add durable inbound webhook event tracking keyed by provider event/message ID.
- Add a unique partial index for message dedupe where possible, for example by business/thread/external message ID.
- Keep the in-memory replay cache only as a cheap first filter.

### Medium - Inbound Email And Support Webhook Implementations Are Duplicated

Evidence:

- `email.routes.js` and `supportEmail.routes.js` duplicate:
  - Svix/custom signature parsing,
  - timestamp tolerance handling,
  - legacy-secret fallback handling,
  - replay cache logic,
  - caller diagnostics,
  - recipient/body parsing helpers.
- The general inbound email route can also route support replies through `parseSupportReplyToken`, while `supportEmail.routes.js` has a support-specific inbound path.

Impact:

- Security fixes must be made twice.
- Behavior can drift between invoice replies and support replies.
- The dual support handling path is hard to reason about operationally.

Suggested fix:

- Extract one inbound webhook verification module and one durable replay/idempotency store.
- Decide whether support replies should enter through the general inbound route, the support-specific route, or both with explicit routing tests.

### Medium - Plaid Webhook Is Verified But Does Not Trigger Or Persist Work

Evidence:

- `plaid.routes.js` verifies the `Plaid-Verification` JWT.
- The webhook currently logs the event and returns `{ ok: true }`.
- A code comment states it does not trigger sync; the frontend or a scheduled job will call `POST /connections/:id/sync`.
- No durable Plaid webhook event table was found.

Impact:

- This is safe in the narrow sense that it avoids doing too much in the webhook.
- But it also means Plaid's event delivery does not guarantee timely sync, and missed frontend/scheduler calls can leave data stale.
- Operationally, webhook receipt is not enough to diagnose whether sync actually happened.

Suggested fix:

- Persist Plaid webhook events or last-seen event metadata per connection.
- Trigger a queued/scheduled sync rather than doing heavy work inline.
- Track event received, sync attempted, sync succeeded/failed, and cursor advanced.

### Medium - Plaid Sync Can Advance Cursor After Partial Per-Row Failures

Evidence:

- Plaid sync loops over added/modified/removed transactions.
- Individual insert/modify/remove errors are logged with `logWarn(...)` and processing continues.
- `finalizeImportBatch(... failed: 0 ...)` is called regardless of per-row warnings.
- `updateBankConnectionStatus(... cursor ...)` advances the cursor after processing.

Impact:

- A row-level database failure can be hidden as a successful sync.
- Advancing the cursor can make failed rows hard to recover from without manual backfill.
- Import history may underreport failures.

Suggested fix:

- Count per-row failures and store them in the import batch.
- Do not advance the Plaid cursor when failures affect data correctness, or persist enough failure metadata for deterministic retry.
- Add tests for insert/modify/remove partial failure behavior.

### Medium - Stripe Webhook Side Effects Include Non-Transactional Email Sends

Evidence:

- Stripe webhook processing can sync subscription state and send billing lifecycle emails.
- `sendBillingEmail` failure is caught/logged inside that helper.
- Webhook idempotency prevents duplicate processing after event reservation, but email send state is not recorded as a separately idempotent side effect.

Impact:

- This avoids failing payment state sync because email failed, which is correct.
- But it also means email delivery status is not reconciled independently and cannot be retried cleanly without reprocessing or manual action.

Suggested fix:

- Keep billing state sync as the required side effect.
- Move lifecycle email sends to an outbox/audit-backed notification queue, keyed by event/business/kind.

### Low/Medium - Stripe API Version Is Hardcoded To A Future-Dated Version String

Evidence:

- `stripeClient.js` defaults `STRIPE_API_VERSION` to `"2026-02-25.clover"` if the environment variable is absent.

Impact:

- If this value is intentional, it should be documented and pinned in deployment config.
- If it is aspirational or copied, it can break real Stripe calls depending on account/version support.

Suggested fix:

- Verify against the live Stripe account configuration before production use.
- Move the default to explicit env validation or a documented deployment constant.

Pass 28 status:

- No source changes made.
- No tests were run.
- Integration review covered Stripe webhook durability, outbound Stripe idempotency, Plaid webhook/sync behavior, inbound email/support replay protection, import batch failure accounting, and message dedupe posture.
- Highest-priority fixes are: add idempotency keys to high-impact Stripe mutations, durably dedupe inbound email/support events, make Plaid row-level failures affect batch status/cursor policy, and consolidate duplicated inbound webhook verification.

## Pass 29 - Repository Residue, Secrets Hygiene, Mock Surfaces, And Tracked Artifacts

Scope inspected:

- Active source, scripts, V3 frontend, public/static pages, and `pdf-worker` for TODO/FIXME/HACK/mock/demo/stub/placeholder/AI/Codex/Claude-style residue.
- Repository-level tracked artifacts and ignored files.
- E2E screenshot/session fixture directory.
- `.gitleaks.toml` and `.gitignore`.

### High - Tracked E2E Session Artifacts Contain Token And Password Material

Evidence:

- Tracked files under `In-Ex-Ledger-API/tests/e2e/screenshots/` include:
  - `auth.json` with `csrf_token`, `refresh_token`, localhost cookies, localStorage business/user/subscription data.
  - `session-token.json` with a JWT-shaped token containing user/business claims.
  - `run-state.json` with an E2E email and password.
- `git ls-files` shows these files are tracked.
- `.gitignore` ignores `In-Ex-Ledger-API/test-results/`, but not `In-Ex-Ledger-API/tests/e2e/screenshots/`.

Impact:

- These appear to be local/test values, not production secrets.
- Still, this is a high-severity professionalism and security-hygiene issue because it normalizes committing live-looking tokens and passwords.
- It also weakens future secret-scanning signal because reviewers become used to seeing token-shaped artifacts in source control.

Suggested fix:

- Remove tracked browser-state JSON artifacts from git history/current tree after confirming they are not needed as fixtures.
- Keep visual screenshots only if they are deliberate golden artifacts.
- Add ignore rules for generated E2E state files:
  - `In-Ex-Ledger-API/tests/e2e/screenshots/*.json`
  - or move generated artifacts under `In-Ex-Ledger-API/test-results/`.
- Rotate any local/dev secrets if these values were produced from shared dev credentials.

### Medium/High - Secret Scanning Is Present But Over-Allowlisted

Evidence:

- `.gitleaks.toml` extends the default ruleset.
- The allowlist excludes all of:
  - `In-Ex-Ledger-API/tests/.*`
  - `In-Ex-Ledger-API/scripts/test-*.mjs`
  - `Docs/.*.md`
  - `Work-To-Do/.*.md`
  - `Work-Review/.*.md`
  - `Work-Completed/.*.md`
  - package lockfile.
- The tracked E2E token/password files live under the fully allowlisted tests path.

Impact:

- The repo has the right idea but the allowlist is broad enough to hide exactly the class of mistakes it should catch.
- Tests and docs are common places for accidental credentials because they contain examples and debugging state.

Suggested fix:

- Narrow the tests allowlist to known placeholder patterns or specific fixture files.
- Do not allowlist generated browser state directories.
- Run gitleaks in CI and make failures blocking.

### Medium - Generated E2E Screenshots Are Tracked In Source Control

Evidence:

- `git ls-files` lists 31 tracked PNGs under `In-Ex-Ledger-API/tests/e2e/screenshots/`.
- The same directory also holds generated session JSON.

Impact:

- Golden screenshots can be legitimate, but this directory name reads like run output, not curated fixtures.
- It blurs generated artifacts with source truth.
- It makes code review heavier and increases the chance of accidental session/state commits.

Suggested fix:

- Decide whether screenshots are golden test fixtures or generated output.
- If golden, move them to a clearly named fixture directory and document update rules.
- If output, untrack them and store under ignored `test-results`.

### Medium - Active Mock Billing Surface Still Exists By Design And Needs Strict Governance

Evidence:

- `billing.routes.js` exposes `GET/POST /mock-v1`.
- It is guarded by `ENABLE_MOCK_BILLING === "true"`, non-production environment, and no live Stripe key.
- `public/js/upgrade.js` conditionally reveals `#mockUpgradeWrap` only after `GET /api/billing/mock-v1` succeeds.

Impact:

- This was already found as guarded in earlier passes.
- The remaining risk is process/governance: mock billing is a high-impact business-state mutation endpoint and should stay test/dev-only forever.

Suggested fix:

- Keep blocking tests for production-disabled mock billing in the main gate.
- Add explicit startup validation that refuses production-like deployments with `ENABLE_MOCK_BILLING=true`.
- Consider moving mock billing behind a test-only route mount or dev harness instead of production route code.

### Medium - Public Static Business-Tier Placeholders Are Still Reachable When Gated

Evidence:

- Active `public/html` files include:
  - `customers.html`
  - `vendors.html`
  - `projects.html`
  - `bills.html`
  - `ar-ap.html`
  - `billable-expenses.html`
- These pages include "Coming later" sidebar labeling.
- Docs currently say they are intentionally gated Business-tier placeholders.

Impact:

- This is not legacy V3 truth confusion by itself; earlier passes confirmed V3 is canonical and legacy app-core is archived.
- It is still a product-polish risk if customers can pay into surfaces that say "Coming later".

Suggested fix:

- Either hide these routes entirely until implemented in V3, or present them as unavailable add-ons with a clear product decision.
- Keep route inventory updated so nobody mistakes these pages for V3 migration targets.

### Medium - Active Code Contains Some "For Now/Later" Product Debt, But Less Raw AI Slop Than Expected

Evidence:

- Active source search did not find profanity or obvious "AI slop" markers in app code.
- Most "AI", "Claude", and "Codex" hits are in historical docs/work trackers, not active runtime files.
- Active "later/for now" examples include:
  - manual-entry copy while Plaid matures,
  - V3/V2 route inventory language,
  - support/invoice placeholder terminology,
  - mock billing controls.

Impact:

- The repo has a lot of product/process debt, but it is not full of crude comments or abandoned AI prompts in active code.
- The bigger issue is architectural drift, generated artifacts, and stale docs rather than vulgar or obviously unprofessional inline code.

Suggested fix:

- Treat "placeholder", "coming later", "for now", "temporary", and "mock" as governed terms.
- Add a CI grep/report that fails only on active runtime paths unless terms are allowlisted with a reason.

### Low/Medium - Root Ignore Rules Do Not Cover Current Generated Artifact Patterns

Evidence:

- `.gitignore` excludes `tmp-*`, `.claude/`, storage, and `In-Ex-Ledger-API/test-results/`.
- It does not exclude `In-Ex-Ledger-API/tests/e2e/screenshots/*.json` or screenshot run output.
- It does not exclude root audit/run output directories except this current review report is intentionally tracked/untracked by workflow.

Impact:

- The repo can keep accumulating run artifacts.
- This is a small but persistent source of unprofessional churn.

Suggested fix:

- Expand `.gitignore` for generated browser state and run outputs.
- Keep durable reports in one documented review folder.

Pass 29 status:

- No source changes made.
- No tests were run.
- Residue review covered tracked generated artifacts, session/token/password material, gitleaks allowlists, mock billing surfaces, placeholder pages, and active-code AI/slop markers.
- Highest-priority fixes are: untrack generated E2E session JSON, tighten `.gitleaks.toml`, ignore generated browser-state artifacts, and govern mock/placeholder surfaces.

## Pass 30 - Closure, Coverage Reconciliation, And Remediation Shape

Scope reconciled:

- 728 tracked files were included in the review inventory.
- Major tracked areas reviewed:
  - 160 test files/artifacts.
  - 144 public/static files.
  - 101 database migrations.
  - 77 `frontend-v3` files.
  - 61 service files.
  - 54 other root/API/config files.
  - 41 route files.
  - 31 archived legacy frontend files.
  - 27 docs.
  - 22 work-tracker files.
  - 7 `pdf-worker` files.
  - 3 CI files.
- Review passes covered architecture, source quality, tests, CI, DB schema, migrations, security, auth, privacy, billing, integrations, V3 frontend, static/public/legacy posture, docs, dependency hygiene, scripts, observability, data lifecycle, localization, accessibility, performance, and repository residue.

### Overall Assessment

The codebase is not beyond repair, but it is not in a launch-clean state.

The dominant pattern is not vulgar code or obvious prompt dumps. The dominant pattern is accumulated implementation drift:

- V3 is the frontend truth, but older static/V2/placeholder surfaces and tests still create confusion.
- Several important systems exist twice or three times in slightly different forms.
- There are many real safety improvements already present, but the enforcement/gating layer is inconsistent.
- The test suite is large, but the main gate does not represent the whole suite and currently fails.
- Docs are abundant, but too many are stale enough to mislead.

### Highest Priority Remediation Themes

1. Make the main quality gate real.

- Fix `npm run test:all`.
- Include the 31 currently excluded backend/E2E test files intentionally: either add them, retire them, or document them as non-gate tests.
- Add V3 lint/type/build/i18n checks to CI.
- Add dependency audits for backend, V3 frontend, and `pdf-worker`.

2. Remove security-hygiene landmines.

- Untrack generated E2E session JSON containing cookies/tokens/password material.
- Tighten `.gitleaks.toml` so tests/docs are not blanket allowlisted.
- Resolve high dependency audit findings.
- Decide and enforce cookie-only auth server-side; remove bearer-token acceptance if it is no longer part of the contract.
- Replace shared-secret internal support access with agent identity, role/scope checks, limiter, and durable audit.

3. Stop startup/runtime mutation surprises.

- Remove checksum-writing migration repair from `prestart`.
- Make DB init complete before the server listens.
- Replace production `npm install` paths with reproducible installs.
- Consolidate Node version and deployment env validation.

4. Consolidate business-critical contracts.

- Add DB constraints for subscription `plan_code`/`status`, transaction `review_status`, and cross-business child table consistency.
- Standardize API error envelopes and centralize route error handling.
- Make export feature keys match the canonical entitlement catalog.
- Align accounting-method UX with actual cash/accrual behavior.

5. Clean up generated/legacy/static truth.

- Preserve legacy frontend only as archived reference, per product decision.
- Add stronger archive guardrails so nobody wires it back in accidentally.
- Decide whether active Business-tier placeholder pages are product surfaces or should be hidden.
- Stop tracking generated run artifacts unless they are intentional golden fixtures.

6. Make integrations retry-safe.

- Add idempotency keys to high-impact Stripe mutations beyond checkout.
- Durably dedupe inbound email/support events.
- Make Plaid row-level failures affect import batch status and cursor-advance policy.
- Move integration notification emails toward an outbox-style pattern.

### AI Slop / Overengineering Judgment

There is meaningful AI-slop-style residue, but not mainly in the form of embarrassing comments or random generated code fragments.

The strongest slop indicators are:

- duplicate route/service patterns with slight semantic drift,
- broad source-text tests that assert implementation shape instead of behavior,
- work-tracker/doc sprawl with stale "complete" claims,
- placeholder and mock surfaces kept alive longer than their governance,
- oversized owner files,
- inconsistent response envelopes, validation, and feature gates,
- tracked generated artifacts with session material.

The strongest overengineering indicators are:

- several parallel ways to represent business/accounting/billing state,
- V3 boundary layers still named and shaped around legacy compatibility,
- multiple email/inbound/support verification paths,
- docs describing architecture that is more advanced than the implementation,
- tests using extensive module-loader interception instead of stable contracts.

The strongest positive signals are:

- V3 lint, TypeScript, and i18n checks pass locally.
- The canonical V3 direction is documented clearly in current README/project docs.
- Stripe webhook idempotency is durable and thoughtfully handled.
- Core transaction/category DB checks exist.
- Basic plan usage limits and business-slot capacity are server-enforced with locking.
- Privacy/delete/export/security areas have serious work already done, even where gaps remain.

### Recommended First Fix Sequence

1. Repository hygiene/security:
   remove tracked E2E session JSON, tighten gitleaks, expand `.gitignore`, and run secret scan.

2. Test gate:
   fix the current brittle `frontendV3Wiring.test.js` failure, then decide the fate of the 31 excluded tests.

3. CI/dependency:
   add V3 checks and all package-root audits; resolve high advisories.

4. Startup/migrations:
   remove checksum repair from `prestart`; make startup fail before listen on DB init failure.

5. API consistency/security:
   standardize error envelopes, auth bearer/cookie policy, internal support access, and high-risk route logging.

6. DB contract hardening:
   add missing enum/cross-business constraints and tests.

7. Product truth cleanup:
   archive-guard legacy, hide or intentionally label Business-tier placeholder pages, and reconcile stale docs.

8. Integration reliability:
   Stripe mutation idempotency, durable inbound-email dedupe, Plaid partial-failure cursor policy.

Pass 30 status:

- No source changes made.
- No tests were run.
- Closure reconciled the tracked inventory against the completed review passes and converted findings into remediation themes.
- At this point, the 100% codebase review is complete as a review/audit artifact. Implementation should proceed in small, isolated fix PRs rather than one giant cleanup change.

## Pass 31 - Browser State, Client Auth Flow, Redirects, And Static Reachability

Scope inspected:

- V3 client API/auth/navigation flow.
- Server static routing and canonical route handling.
- Auth and CSRF middleware.
- Consent route optional-auth behavior.
- Public/legacy JavaScript auth storage references.
- CORS/origin handling for API writes.

### Positive - V3 Client API Uses Cookie-Based Auth And Does Not Add Bearer Headers

Evidence:

- `frontend-v3/src/lib/apiClient.ts` sends requests with `credentials: 'include'`.
- It reads the CSRF cookie only to mirror it into `X-CSRF-Token` on mutating requests.
- It retries once after CSRF failure by refreshing `/api/me`.
- It retries once after 401 by calling `/api/auth/refresh`.
- Targeted search found no V3 `Authorization: Bearer` header construction.

Impact:

- This aligns with the documented V3 cookie-only direction.
- V3 no longer depends on persistent access tokens in localStorage.

Suggested fix:

- Keep V3 API helpers as the only supported frontend API layer.
- Add a CI check that fails if `frontend-v3/src` introduces `Authorization: Bearer` or stores auth tokens outside approved MFA/signup transient state.

### Medium/High - Backend Still Accepts Bearer Access Tokens Despite Cookie-Only V3 Contract

Evidence:

- `middleware/auth.middleware.js` prefers `Authorization: Bearer ...` before falling back to the access-token cookie.
- `routes/consent.routes.js` has its own optional auth resolver that also accepts bearer tokens.
- Current V3 code does not need bearer tokens.
- Old public JS still defines `authHeader()` and calls it in several places, even though active V3 is the product truth.

Impact:

- The server accepts an authentication mode the canonical frontend no longer uses.
- This preserves a larger attack and compatibility surface than the product contract implies.
- It also lets archived/old scripts continue to shape backend security assumptions.

Suggested fix:

- Decide whether bearer access tokens are still a supported API contract.
- If not, remove bearer-token acceptance from `requireAuth`, `optionalAuth`, and consent optional-auth logic.
- If bearer support must remain for external API clients, document it as a separate API mode with tighter audience/scope rules.

### Positive - Server Has Useful Canonical Route And V2 Blocking Controls

Evidence:

- `server.js` redirects deprecated `/app-v3` page URLs to bare canonical paths.
- V3 page names are served by `sendFrontendV3App`.
- `isBlockedV2PageRequest()` redirects V2 business pages to `/settings?feature=v2-business` unless `ENABLE_V2_BUSINESS=true`.
- Many old HTML aliases redirect to V3/settings destinations.

Impact:

- This supports the user's product decision: V3 is frontend truth; old app-core is not being wired back in.
- The route layer already has guardrails that reduce accidental legacy page use.

Suggested fix:

- Add a small route test asserting archived legacy app-core pages do not become canonical app routes.
- Keep `ENABLE_V2_BUSINESS` off by default and document it as a product flag, not a migration bridge.

### Medium - Old Public JS Remains Directly Serveable And Still Contains Legacy Auth Patterns

Evidence:

- `server.js` serves `express.static(publicDir)` after page-route setup.
- `public/js/auth.js` still contains old `authHeader()` behavior and cleanup for `auth_token`/`token` localStorage/sessionStorage keys.
- Public JS files are directly requestable even when their old HTML pages redirect.
- This is separate from the archived `legacy/public-html` directory; these files are still in active `public/js`.

Impact:

- Direct reachability does not mean the V3 app loads those scripts.
- But old public scripts remain part of the deployed static surface and continue to encode obsolete auth assumptions.
- This can confuse maintainers and security reviewers.

Suggested fix:

- Inventory active static HTML pages that still load `public/js/auth.js`.
- Move unused old app scripts out of deployed `public/js` or block direct serving if they are not needed.
- Keep any required marketing/static scripts minimal and auth-free.

### Medium - V3 Stores MFA And Signup Bootstrap Tokens In Session Storage

Evidence:

- `Login.tsx` stores `inex-mfa-token` and `inex-mfa-context` in `window.sessionStorage`.
- `MfaChallenge.tsx` reads and refreshes `inex-mfa-token` in sessionStorage.
- `VerifyEmail.tsx` reads `inex-verify-signup-token` and persists verification state.
- These are not normal access tokens, but they are still auth-flow bearer-style artifacts.

Impact:

- Session storage is reasonable for short auth-flow state, but XSS could still read it.
- The risk is narrower than localStorage access-token storage, but it should be explicitly time-limited and single-purpose.

Suggested fix:

- Confirm MFA/signup tokens are short-lived, single-use or low-scope server-side.
- Clear them aggressively after success/failure.
- Add a V3 test/check that persistent auth tokens are not stored, while allowing only named transient MFA/signup keys.

### Medium - `navigateToPath` Trusts Backend-Returned Paths For Client History

Evidence:

- `App.tsx` `navigateToPath(path)` resolves the page from the raw path and then pushes `fullPath` into browser history.
- It prepends `/` for non-absolute values but does not reject `//host`-style paths before `pushState`.
- Current known callers use backend `redirect_to` from onboarding/settings flows.

Impact:

- This is not an immediate open redirect because it uses `history.pushState`, not `window.location`.
- Still, client URL mutation should use the same internal-path normalizer used by login `next` handling and billing return paths.

Suggested fix:

- Reuse one `normalizeInternalPath` helper in V3 for `next`, backend `redirect_to`, and any raw path navigation.
- Reject `//`, protocol-bearing, and unknown route paths before pushing to history.

### Positive - API Writes Without Origin Are Mostly Blocked

Evidence:

- `server.js` CORS logic permits originless requests only for safe methods and explicit webhook allowlist paths.
- Originless API writes are allowlisted only for:
  - `/api/billing/webhook`
  - `/api/email/inbound`
  - `/api/support-email/inbound`
- Those webhook paths have separate signature verification.

Impact:

- This is a solid defense-in-depth layer alongside CSRF.
- It reduces risk from non-browser or malformed write requests without an Origin header.

Suggested fix:

- Add tests around originless mutating requests for representative protected API routes and webhook exceptions.

### Low/Medium - CSRF Cookie Is Intentionally Readable And Path-Wide

Evidence:

- `csrf.middleware.js` sets `csrf_token` with `httpOnly: false`, `sameSite: "strict"`, path `/`, and `secure` in production.
- V3 reads this cookie in `apiClient.ts` and mirrors it into `X-CSRF-Token`.

Impact:

- This is the normal double-submit-cookie pattern and not a bug by itself.
- The wide path and readable cookie mean XSS would bypass CSRF protection, so CSP/XSS controls remain important.

Suggested fix:

- Keep strict CSP and avoid adding inline script allowances.
- Add route tests proving CSRF rejection and one-refresh retry behavior.

Pass 31 status:

- No source changes made.
- No tests were run.
- Browser/client auth review covered V3 API behavior, server bearer-token acceptance, static routing, V2 route blocking, direct public JS reachability, transient auth-flow storage, internal path handling, CORS origin checks, and CSRF posture.
- Highest-priority fixes are: remove or formally document bearer-token server support, inventory/deploy-prune old `public/js` auth scripts, constrain V3 raw path navigation, and add CI checks around frontend token storage.

## Pass 32 - SQL Construction, Query Parameterization, And Dynamic Fragments

Scope inspected:

- Route/service SQL construction patterns in transactions, mileage, review, messages, tax summary, usage-limit email, bank connections, analytics, and representative CRUD services.
- Dynamic template literal fragments using `${...}` in SQL contexts.
- Query parameter handling for filters, pagination, date ranges, and region-dependent tax columns.
- Migration/script dynamic SQL signals at a high level.

### Positive - Sampled Hot Paths Mostly Use Parameterized Values

Evidence:

- Transaction list filters build clauses with positional parameters and validate UUID/date/type/review filters before query execution.
- Pagination values are parsed, clamped, and passed as parameters.
- CRUD-style services such as customer/vendor/project/bill/invoice use `$1` parameters.
- Plaid imports and sync updates use positional parameters for external transaction IDs, amounts, account IDs, and categories.
- Review queue date filters choose between static fragments and parameter arrays.

Impact:

- I did not find an obvious user-controlled SQL injection in the sampled high-traffic route/service paths.
- The codebase generally knows to parameterize values.

Suggested fix:

- Preserve this pattern.
- Add focused static checks for raw user input inside SQL template literals.

### Medium - Dynamic SQL Is Hand-Built In Several Places Without A Shared Policy

Evidence:

- `transactions.routes.js` builds `whereSql`, `finalWhereSql`, and parameter indexes manually.
- `mileage.routes.js` dynamically selects `date` vs `trip_date`, builds insert column lists, and builds dynamic `SET` clauses.
- `review.routes.js` conditionally injects date-filter fragments into multiple queries.
- `messages.routes.js` injects `threadKeySql("m")` into several CTEs.
- `taxSummaryService.js` injects region-selected tax columns.
- `usageLimitEmailService.js` builds `SET ${setSql}` from threshold-column mappings.
- `bankConnectionService.js` appends a cursor assignment fragment depending on whether cursor is supplied.

Impact:

- Most inspected fragments are allowlist/constant-driven, not raw user input.
- The risk is maintainability: every new dynamic SQL fragment must be individually audited for whether it is value-like, identifier-like, or structural.
- This is a common place for future AI-slop regressions because the code looks easy to copy and tweak.

Suggested fix:

- Create a small query-fragment policy:
  - values always parameters,
  - identifiers only from constants/allowlists,
  - structural fragments only from closed enums,
  - no request-derived text in SQL fragments.
- Add tests or lint-like grep for `${req.`, `${query`, `${body`, `${params`, and unsafely interpolated sort/order fields inside SQL strings.

### Medium - Dynamic Identifier Fragments Depend On Local Allowlists Rather Than Typed Helpers

Evidence:

- `taxSummaryService.js` chooses `c.tax_map_ca` or `c.tax_map_us` based on region.
- `mileage.routes.js` chooses between `date` and `trip_date` based on schema capability helpers.
- `usageLimitEmailService.js` chooses update columns from `RESOURCE_CONFIG`.

Impact:

- These look safe today because the choices are constants.
- But each file independently implements the safety rule; there is no helper that makes "safe identifier from enum" explicit.

Suggested fix:

- Use small helpers like `sqlIdentifierFromMap(key, allowedMap)` or plain local maps with comments where a dynamic identifier is unavoidable.
- Add unit tests for region/date-mode/resource keys that assert exact emitted SQL fragments.

### Medium - Transaction Query Construction Is Correct-Looking But Too Complex For A Route File

Evidence:

- `transactions.routes.js` builds filters, review-filter IDs, final where clauses, summary parameter indexes, and list queries in the route module.
- It runs a 50,000-row review-source query before applying review filtering and then applies a second paginated query.
- Dynamic parameter index calculation is manual.

Impact:

- I did not identify an injection bug here.
- But this route is carrying query-builder, review-summary, pagination, and response-mapping responsibilities together.
- Manual parameter indexing is fragile under future edits.

Suggested fix:

- Move transaction list query construction into a service with tests that snapshot SQL shape and parameters for each filter combination.
- Keep route code limited to parsing request, calling service, and returning response.

### Medium - Migration/Repair Scripts Intentionally Execute Dynamic SQL And Need Stronger Operational Boundaries

Evidence:

- Migration code reads and executes migration files.
- Migration repair/checksum scripts build operational SQL around schema migration metadata.
- Previous passes already found checksum repair can run via `prestart` with `--write`.

Impact:

- Dynamic SQL in migrations is expected, but operational scripts are high-impact.
- The main risk is not injection from web users; it is accidental production mutation.

Suggested fix:

- Keep migration/repair scripts separate from app startup.
- Require explicit operator intent and environment checks for any script that writes migration metadata or destructive data.

### Low/Medium - SQL Safety Is Not Enforced By Tooling

Evidence:

- No dedicated SQL lint/static rule was found during this pass.
- Existing tests exercise many helpers, but the suite relies heavily on source-shape tests and module interception in other areas.

Impact:

- SQL safety currently depends on reviewer discipline.
- As the codebase grows, dynamic fragments will be easy to get wrong.

Suggested fix:

- Add a lightweight SQL construction test suite for:
  - transaction filters,
  - mileage date-column mode,
  - tax region column selection,
  - usage-limit email threshold claims,
  - review queue date filters.
- Add a repo grep check that flags request-derived interpolation inside SQL template strings.

Pass 32 status:

- No source changes made.
- No tests were run.
- SQL construction review covered parameterization, dynamic fragments, region/date identifier choices, transaction filter query construction, migration/script dynamic SQL, and missing tooling.
- Highest-priority fixes are: move transaction query construction out of the route file, codify a safe dynamic-SQL fragment policy, test exact SQL/params for dynamic builders, and keep migration repair writes out of startup.
