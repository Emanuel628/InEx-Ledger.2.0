# AI-Slop / Overengineering Remediation Progress

Source of truth for scope: `Work-Review/CODEBASE-100PCT-AUDIT-2026-08-09.md` (findings)
and `Work-Review/PROGRAMMING-QUALITY-RESEARCH-2026-08-09.md` (the ordered Phase 0-10
remediation strategy this checklist follows).

This is the one tracking file for this initiative. It is updated in place with every
remediation PR rather than replaced by a new dated file, to avoid the "work tracker
sprawl" problem the audit itself flagged (Pass 9).

Status legend and scoring (used consistently — recompute before ever changing the
headline number):
- `[x]` = 1.0 — Done, independently verified against the current `main`.
- `[~]` = 0.5 — Likely done (a matching commit landed) but not independently
  re-verified line-by-line. Half credit until confirmed.
- `[ ]` = 0 — Not started, no evidence found on `main`.

Percentage = sum of item scores across Phases 1-10, divided by total item count.
Phase 0 is a standing process rule, not a checklist item, so it is not counted.

## Overall: 26.5 / 54 action items (~49%)

## Phase 0 - Safety Rules (process rule, always active, not counted)

## Phase 1 - Stop New Damage: Gates, Secrets, Repo Hygiene — 5.5 / 6
- [x] `npm run test:all` wired into CI (`phase7-guardrails.yml`)
- [~] Brittle source-shape tests replaced with behavior tests — partial; ongoing, folds
  into Phase 7's "prefer tests around behavior" rule.
- [x] Tracked E2E/session artifacts with credentials removed — verified none present
- [x] `.gitleaks.toml` tightened to narrow, specific allowlist — verified
- [x] Ignores for runtime/browser/session artifacts — verified (`test-results/` etc.)
- [x] CI coverage for V3 lint/type/i18n/build + backend/frontend-v3/pdf-worker audits —
  verified (`phase7-guardrails.yml`, `dependency-security.yml`)
  - **Known gap, verified by reading actual workflow run logs (not just the YAML) on
    PRs #287 and #288**: `dependency-security.yml`'s `dependency-review` job fails on
    every PR with `Dependency review is not supported on this repository. Please
    ensure that Dependency graph is enabled`. This predates this PR sequence and isn't
    fixable by a code change — it's a GitHub repo setting (Settings → Security →
    Dependency graph). The three `npm-audit` jobs in the same workflow (api,
    frontend-v3, pdf-worker) do pass. Flagging for whoever has repo-admin access
    rather than silently working around it.

## Phase 2 - Security Contract Cleanup — 3.0 / 7
- [x] Cookie-only V3 auth contract enforced (commit `6a075ad1`)
- [~] Bearer-token acceptance removed from normal app auth paths
- [~] Internal support shared-secret access hardened (commits `25026802`, `2ae677c9`)
- [~] CSRF/origin tests for representative mutating routes (`c665b36b`)
- [ ] MFA/signup transient tokens confirmed short-lived/single-purpose
- [ ] V3 check that persistent auth tokens aren't stored in browser storage
- [~] Route-local error/log paths sanitized (`25df086b`)

## Phase 3 - Startup, Deployment, Migration Safety — 4.5 / 6
- [x] Checksum repair removed from `prestart` (`391319b9`)
- [x] Server does not listen before DB init/migration readiness (`fabc898f`)
- [~] Read-only migration verification split from repair commands
- [~] Environment validation for required production settings
- [~] Docker/Nixpacks/start scripts reconciled
- [x] Reproducible installs (`npm ci`) in CI/deployment (`afdefa17`, `6a313ff0`)

## Phase 4 - API Error And Response Consistency — 3.0 / 5
- [ ] Consolidated `ApiError`/`sendError`/async-route pattern introduced
- [~] Client-facing error envelopes normalized — partial; this PR folded one more error
  class (`ReceiptStatusValidationError`) into `transactions.routes.js`'s existing
  generic mapper instead of a bespoke standalone try/catch, but this is route-file-local,
  not a repo-wide envelope standard, so it stays at half credit.
- [x] V2 CRUD routes no longer misclassify bad-ID/validation as 500 (`32210ac6`,
  `0e3fc909`)
- [x] Repeated validation helpers shared where duplication is real (`f4c0e99f` — v2 UUID
  validation)
- [~] Representative tests for error status/code/message

## Phase 5 - Database Invariants And Multi-Tenant Boundaries — 3.5 / 5
- [x] `CHECK` constraint for subscription `plan_code`/`status` (`e7e14acb`)
- [x] `CHECK` constraint for `transactions.review_status` (`01cd219c`)
- [x] Cross-business child relationships enforced (`e018b6eb`)
- [ ] Account type/currency assumptions reviewed for closed-set constraints
- [~] Migration tests for new invariants (`c44d08b1` guards destructive migrations)

## Phase 6 - Product Truth And Legacy/Static Cleanup — 3.0 / 5
- [x] Archived legacy frontend confirmed reference-only, not runtime-reachable —
  independently verified: `server.js` only mounts `publicDir` (`public/`) and
  `htmlDir` (`public/html`) as static roots; `legacy/public-html` is a sibling
  directory, not a descendant of either, and is not referenced by any
  `express.static`/`app.use` call. Added `In-Ex-Ledger-API/legacy/public-html/README.md`
  stating this explicitly (Pass 4's suggested guardrail). Also fixed
  `Docs/DEPLOYMENT.md`'s "Frontend Bundle" checklist, which told deployers to
  verify a legacy file that isn't served and a `public/html/settings.html` file
  that doesn't exist at all (retired, 301-redirects to `/settings`) — replaced
  with a check against the actual served V3 bundle and static SEO pages.
- [ ] Inventory of active `public/js`/static HTML paths still directly serveable
  (73 tracked files as of this pass)
- [ ] Old auth scripts / V2 placeholders quarantined or removed
- [x] V3 canonical routing tests kept current — already enforced by
  `tests/routeInventory.test.js`, which fails if any `V3_APP_PAGES` entry in
  `server.js` isn't documented in `Docs/V3_ROUTE_INVENTORY.md`, and asserts the
  doc's required sections and temporary-legacy-overlap classifications exist.
  Read and independently verified against current `main` rather than assumed.
- [x] Direct URL behavior explicit for `/app`, V3 routes, blocked legacy routes,
  static assets — `tests/staticAssetCacheHeaders.test.js` already covers V3
  canonical routes, static asset caching, and `/app-v3/*` legacy redirects with
  real HTTP requests against the live `app`. The one real gap found by reading
  it against `server.js`: nothing exercised `isBlockedV2PageRequest`'s actual
  redirect (V2 business placeholder pages — `ar-ap`, `billable-expenses`,
  `bills`, `customers`, `projects`, `vendors` — 302 to
  `/settings?feature=v2-business` when `ENABLE_V2_BUSINESS` isn't `'true'`, the
  production default). Closed with a new `tests/blockedV2PageRedirects.test.js`
  covering all 6 pages across all 4 URL aliases (bare, `.html`, `/html/*`,
  `/html/*.html`).

## Phase 7 - Route And Service Decomposition — 3.5 / 4
- [x] Consolidated the repeated account/category join SQL in `transactions.routes.js`
  (was duplicated across 7 call sites: GET list, GET single, POST, PUT, and the
  `cleared`/`review-status`/`receipt-status` PATCH routes) into one shared fragment.
  In the process, found and fixed the same "Uncategorized until refresh" bug (bare
  `RETURNING *`, no account/category join) on the `cleared` and `review-status` PATCH
  routes — the ones that mark a transaction cleared or change its review status from
  the UI previously lost the category display until the next full list reload, same
  bug class as the earlier Add-Transaction fix.
- [x] Moved transaction list filter-parsing (`buildTransactionListFilters`,
  `buildTransactionListWhereClause`, `getTransactionPeriodBounds`) out of
  `transactions.routes.js` into `services/transactionListQueryService.js`. The
  review-summary orchestration (the three-query dance — review-source query, review
  filtering, building the final `WHERE` clause with the review-filtered ID list, the
  paginated list query, the aggregate summary query) that was deliberately deferred is
  now also extracted, as four more pure functions in the same module
  (`buildTransactionReviewSourceQuery`, `buildFinalTransactionWhereClause`,
  `buildTransactionListQuery`, `buildTransactionSummaryQuery`) — moved verbatim (byte-
  identical SQL text), only parameterizing what varied (the join-clause SQL, `now`).
  `GET /` dropped from ~228 lines to ~72; the route now reads as parse → build query →
  run query → shape response. 19 direct unit tests total across all 7 functions in this
  module. Full HTTP test coverage for this endpoint (191 tests across 6 files that hit
  `GET /api/transactions`) still passes unchanged, confirming behavior parity on the
  highest-traffic endpoint in the file.
- [x] Codify dynamic-SQL rules (values as params, identifiers from constants only, no
  request-derived text interpolated) — written down in `Docs/DYNAMIC_SQL_RULES.md`,
  citing the existing modules that already follow it.
- [~] SQL-shape/parameter tests — added for transaction list filters/where-clause and
  now for mileage's `date`/`trip_date` column-mode selection (`mileageQueryService.js`,
  9 tests: coalesce/trip_date-only/date-only column choice, insert SQL column list and
  positional-param shift under each mode, insert values array under each mode). Tax
  region column selection (`taxSummaryService.js`) and usage-limit thresholds
  (`usageLimitEmailService.js`) are still untested at this level.

## Phase 8 - V3 React Cleanup — 0.5 / 7
- [~] Internal path normalization shared for nav/`redirect_to` (`6960331b`)
- [ ] Large controller pages split by workflow
- [ ] API/data orchestration moved into hooks/clients where it reduces local state
- [ ] DOM-mutation i18n pattern confined/replaced
- [ ] Modal focus/body-scroll handling consolidated
- [ ] Hard reloads replaced with state updates where SPA behavior expected
- [ ] `PlanGate` usage normalized against backend feature keys

## Phase 9 - Integrations, Idempotency, Side Effects — 0 / 5
- [ ] Stripe mutation idempotency keys reviewed beyond checkout
- [ ] Durable dedupe/outbox behavior for important emails
- [ ] Plaid partial-failure/cursor/retry behavior hardened
- [ ] Export/receipt cleanup paths made explicit and testable
- [ ] Required vs. best-effort side effects separated

## Phase 10 - Documentation And Final Stabilization — 0 / 4
- [ ] Source-of-truth docs updated to match code
- [ ] Stale `Work-*` docs contradicting runtime behavior removed/archived
- [ ] Concise architecture notes added (auth, startup/migrations, V3 routing, dynamic
  SQL, paid-feature enforcement)
- [ ] Final targeted file inventory confirming no review-only/generated artifacts were
  promoted into runtime

## PR Log

- **PR 1** (`chore/consolidate-transaction-response-join`): Phase 7 (+ one Phase 4
  fix). Removed the 7x-duplicated account/category join SQL in
  `routes/transactions.routes.js` into one shared fragment (`TRANSACTION_JOIN_COLUMNS_SQL`
  / `TRANSACTION_JOIN_CLAUSE_SQL`), applied to all 6 endpoints that return a full
  transaction row. Fixed two real "Uncategorized until refresh" bugs found in the
  process (`PATCH /:id/cleared`, `PATCH /:id/review-status`), same class as the earlier
  Add-Transaction fix. Folded `ReceiptStatusValidationError` into the route file's
  existing generic error mapper, removing a redundant standalone try/catch. Zero other
  behavior change. Full test suite: 1265/1266 passing (the one failure is the
  pre-existing, unrelated Windows-path-traversal test, confirmed failing on `main`
  before this PR too). Two SQL edits were attempted and reverted during this PR after
  discovering the target queries' `WHERE` clause is dynamically built and can reference
  `a.name`/`c.name` for search/name filters — removing those joins would have broken
  filtered requests; caught before running tests, not shipped.

- **PR 2** (`chore/extract-transaction-list-service`): Phase 7. Extracted
  `buildTransactionListFilters`, `buildTransactionListWhereClause`, and
  `getTransactionPeriodBounds` out of `routes/transactions.routes.js` into a new
  `services/transactionListQueryService.js` — moved verbatim, no logic changes. Added
  13 direct unit tests for the extracted functions (limit clamping, validation
  branches, id-vs-name filter precedence, search clause, v3Status clauses, period
  bounds), which the route-only HTTP tests didn't cover directly before. The route file
  now imports these instead of defining them inline. Full test suite: 1278/1279 passing
  (same pre-existing, unrelated failure as PR 1). The review-summary orchestration in
  `GET /` (the review-source query, review-filtering, and final `WHERE`-clause
  assembly) was deliberately left in the route file for a follow-up PR rather than
  combined with this change — it threads request-scoped state (query results feeding
  back into a second query's parameters) that deserves its own careful, isolated pass
  rather than being bundled into a pure-function extraction.

- **PR 3** (`chore/fix-review-followups`): quality follow-up on PR 1/2, no new phase
  progress (percentage unchanged). A review of the previous two PRs against this
  file's own scoring — re-checked against `PROGRAMMING-QUALITY-RESEARCH-2026-08-09.md`
  — surfaced three real, narrow issues, all fixed here:
  1. `transactionListQueryService.js`'s header comment referenced "Phase 7," this
     tracker file, and "moved verbatim" — process history, not durable documentation.
     Rewritten to explain what the module does and why it's side-effect-free.
  2. The module duplicated a UUID-validation regex that already exists as `isUuid` in
     `api/utils/v2HttpValidators.js` (used by the v2 business routes). Switched to
     importing it instead — same regex, same behavior, one fewer copy to keep in sync.
  3. `type: type || ""` and `reviewStatus: reviewStatus || ""` in
     `buildTransactionListFilters`'s return value were dead code — both variables are
     already guaranteed non-null strings from `String(...).trim().toLowerCase()`
     earlier in the function, so the fallback could never fire. Simplified to `type,`
     and `reviewStatus,`.

  Also verified, while investigating a claim that CI status wasn't visible, that CI
  *is* visible via the GitHub Actions API and *did* run on both prior PRs — and found
  a real, pre-existing gap in the process (see the note under Phase 1 above) rather
  than one introduced by this PR sequence. Full test suite: 1278/1279 passing (same
  pre-existing, unrelated failure).

- **PR 4** (`chore/extract-mileage-query-service`): Phase 7, remaining two items.
  Extracted `mileage.routes.js`'s dynamic date-column SQL builders
  (`mileageDateSelect`/`mileageDateOrderBy`/`buildMileageInsertSql`/
  `buildMileageInsertValues`) into a new `services/mileageQueryService.js`, same
  pattern as PR 2. Two small changes made in the move (not pure copy, both verified
  behavior-preserving by the new tests): `mileageDateSelect` and `mileageDateOrderBy`
  had byte-identical bodies, so they're collapsed into one `mileageDateColumn`
  function used at all 5 former call sites; `buildMileageInsertValues` previously
  called `crypto.randomUUID()` internally (a side effect inside an otherwise-pure
  function), so it now takes the id as a parameter and the route generates it,
  matching the module's own "side-effect-free" design goal. Added 9 direct unit
  tests covering all three column-mode combinations (date-only, trip_date-only,
  both). Also added `Docs/DYNAMIC_SQL_RULES.md`, a short policy note (values as
  params, identifiers from constants/closed maps only, structural fragments from
  closed enums, never request-derived text in a SQL template) citing the modules
  that already follow it, closing the "codify dynamic-SQL rules" item. Tax-region
  column selection and usage-limit threshold SQL are still untested at this level —
  left for a follow-up rather than growing this PR further. Full test suite (glob
  run across `tests/*.test.js`, matching `test:all`'s `--test-concurrency=1`):
  1287/1288 passing, same pre-existing, unrelated Windows-path-traversal failure as
  every prior PR in this sequence.

- **PR 5** (`chore/archive-legacy-frontend-guardrails`): Phase 6, its first item.
  Before writing anything, checked what actually serves `legacy/public-html` —
  confirmed by reading `server.js`'s static-mount setup directly (`publicDir` =
  `public/`, `htmlDir` = `public/html`, only those two are passed to
  `express.static`) that the directory is never served, matching the audit's Pass 4
  claim. Then, rather than treating "not reachable" as good enough on its own, went
  looking for anywhere the archived status wasn't actually reflected — found
  `Docs/DEPLOYMENT.md`'s pre-deploy checklist telling deployers to verify a legacy
  landing page that's never served, and a `public/html/settings.html` that doesn't
  exist on disk at all (that page was retired in favor of V3's `/settings`, confirmed
  via `tests/v3LegacyHtmlRetirement.test.js` and a direct `ls`). Fixed the checklist
  to check the actual served V3 bundle and static SEO pages instead. Added
  `legacy/public-html/README.md` per the audit's suggested guardrail, so the archive
  status is stated in the directory itself, not just implied by omission from
  routing. No source/behavior changes — docs and one new README only. Full test
  suite: 1287/1288 passing (same pre-existing, unrelated failure as every prior PR).

- **PR 6** (`test/blocked-v2-page-redirects`): Phase 6, its last two items.
  Read `server.js`'s routing stack end to end before writing anything, and
  cross-referenced it against the existing test files that already exercise it
  (`tests/routeInventory.test.js`, `tests/staticAssetCacheHeaders.test.js`)
  rather than assuming those items were untouched just because the tracker
  still showed them unstarted. Found both were already substantially covered:
  `routeInventory.test.js` fails if `server.js`'s `V3_APP_PAGES` set drifts
  from `Docs/V3_ROUTE_INVENTORY.md`, and `staticAssetCacheHeaders.test.js`
  already makes real HTTP requests against V3 canonical routes, static asset
  caching, and `/app-v3/*` legacy redirects. The one real, verified gap: no
  test exercised `isBlockedV2PageRequest`'s actual redirect behavior for the
  six V2 business placeholder pages. Added
  `tests/blockedV2PageRedirects.test.js` (test-only, no source changes) — 3
  tests confirming all 6 pages 302-redirect to `/settings?feature=v2-business`
  across all 4 URL aliases they're reachable under, never serve their raw HTML
  while gated, and don't affect unrelated canonical pages. Full test suite:
  1290/1291 passing (same pre-existing, unrelated failure as every prior PR).

- **PR 7** (`refactor/extract-transaction-list-orchestration`): Phase 7, its
  last item, prompted by the user asking whether `transactions.routes.js`
  (2,602 lines, 21 endpoints) was worth tackling. Rather than attempting the
  whole file, scoped to the one piece the audit specifically flagged (Pass 32:
  "correct-looking but too complex for a route file") and PR 2 had explicitly
  deferred: `GET /`'s three-query orchestration. Extracted the review-source
  query, the review-filter-to-WHERE-clause folding, the paginated list query,
  and the summary query into four pure functions in
  `services/transactionListQueryService.js`, moved verbatim (same SQL text,
  byte-for-byte) so no query behavior could drift in the move. `GET /` went
  from ~228 lines to ~72. Left everything else in the file alone — the CSV
  import handler (~380 lines, the single largest remaining chunk) is a
  different, larger, differently-shaped problem and wasn't pulled into this
  PR. Added 6 new direct unit tests for the extracted functions (19 total in
  the module now). Verified behavior parity by running every test file that
  exercises `GET /api/transactions` (191 tests across 6 files) — all passing
  unchanged — on top of the full suite: 1296/1297 passing (same pre-existing,
  unrelated failure as every prior PR).
