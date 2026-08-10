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

## Overall: 30.0 / 54 action items (~56%)

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

## Phase 2 - Security Contract Cleanup — 6.0 / 7
- [x] Cookie-only V3 auth contract enforced (commit `6a075ad1`)
- [x] Bearer-token acceptance removed from normal app auth paths — verified via
  `git log -p` that commit `6a075ad1` (the same commit credited for the item
  above) removed `Authorization: Bearer` parsing from both
  `middleware/auth.middleware.js`'s `getRequestToken` and
  `routes/consent.routes.js`'s own `resolveAuthenticatedUserId`; confirmed on
  current `main` that neither reads `req.headers.authorization` anymore, and an
  exhaustive repo grep for bearer/authorization header handling found only
  outbound calls to Stripe's API (unrelated). This was two separate audit
  findings (Pass 7 and Pass 31) satisfied by one fix, which is why the tracker
  had it split into two checklist items with different scores. Added
  `tests/bearerTokenRejection.test.js` so the property is enforced going
  forward, not just true as of this read: a validly-signed token sent only as
  a Bearer header is asserted to produce byte-identical 401 responses to no
  auth at all, and can't rescue a request carrying an invalid cookie either.
  Also extended `tests/v3AuthTokenStorage.test.js` with a check that no V3
  frontend source file ever constructs an `Authorization` header, closing the
  audit's own suggested CI check (Pass 31) for the client side of this
  contract.
- [~] Internal support shared-secret access hardened (commits `25026802`,
  `2ae677c9`, this PR) — the audit's suggested fix has four parts: agent
  identity, role/scope checks, a limiter, and durable audit. Read
  `routes/internalSupport.routes.js` and `middleware/requireSupportSecret.js`
  directly rather than assuming the prior commits' scope: durable audit was
  already done (every access is logged, with the log helper auto-sanitizing
  emails) and the secret comparison already uses `crypto.timingSafeEqual`
  (constant-time, no timing side-channel). A limiter was missing — every
  `/internal/support/*` request only got the generic 300/min global tier sized
  for ordinary app traffic. Added `createInternalSupportLimiter()` (30
  requests/15 min, IP-keyed) and wired it ahead of the secret check so
  failed-guess attempts count toward the same window, not just successful
  ones. **Still open, and staying at half credit because of it**: per-agent
  identity and role/scope checks. That's the audit's actual "High" severity
  concern (no accountability beyond an IP+URL log line if the shared secret
  leaks or is misused) and it's explicitly a product decision — "decide
  whether the internal support API is production-required" — not something to
  make unilaterally inside a remediation PR.
- [~] CSRF/origin tests for representative mutating routes (`c665b36b`)
- [x] MFA/signup transient tokens confirmed short-lived/single-purpose — read
  `routes/auth.routes.js` end to end rather than assuming. Every non-final auth
  token carries a `purpose` claim that's checked with strict equality on
  verification (`mfa_pending`, `mfa_sensitive_reauth`, `verified_signup_bootstrap`,
  `verify_email_status`, `global_mfa_trust`) — none of them double as a general
  session credential. Expiry is bounded in all cases:
  `MFA_PENDING_TOKEN_EXPIRY_SECONDS` defaults to the 15-minute email-code window
  (`MFA_EMAIL_CODE_EXPIRY_MINUTES * 60`), `VERIFICATION_STATUS_TOKEN_EXPIRY_SECONDS`
  defaults to 24 hours. The signup bootstrap token additionally binds a device
  fingerprint hash, checked against the current request before it can be
  redeemed. The generic JWT mechanics (`signToken`/`verifyToken`: expiry
  enforcement, tampering, malformed input) already have direct unit tests in
  `tests/authFlows.test.js`; the purpose-scoping itself is a simple, visible
  strict-equality check at each call site, not something that needed a new
  bespoke test harness to trust.
- [x] V3 check that persistent auth tokens aren't stored in browser storage —
  verified `apiClient.ts` uses `credentials: 'include'` everywhere and never
  builds an `Authorization` header from stored state; the only cookie it reads
  via JS is the intentionally-non-httpOnly CSRF cookie. `utils/authUtils.js`
  sets the real session cookie `httpOnly: true`, so V3 code can't touch it even
  if it tried. Read every `localStorage`/`sessionStorage.setItem(` call site in
  `frontend-v3/src` (16 total) — the only token-shaped value stored anywhere is
  the transient MFA challenge token covered by the item above; everything else
  is a UI preference, a plain status string, or a dismissal flag. Turned this
  from a one-time read into an enforced check: added
  `tests/v3AuthTokenStorage.test.js`, which fails if any future `setItem` call
  writes a key outside an explicit allowlist, or writes an
  access/refresh/session/auth/jwt-token-shaped key under any name.
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

## Phase 6 - Product Truth And Legacy/Static Cleanup — 3.5 / 5
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
- [~] Inventory of active `public/js`/static HTML paths still directly serveable
  (73 tracked files as of this pass) — built the actual classification the
  audit asked for instead of another verify-only pass. Confirmed via
  `grep` that zero of the 49 `public/js` files are `<script src>`-referenced
  by any currently-active `public/html` page. Rather than trusting a naive
  "not mentioned by filename" check (these are pre-module browser-global
  scripts with real hidden coupling — confirmed the hard way when a first-pass
  heuristic wrongly flagged `escape-html.js` and `global.js` as orphaned when
  they're actually depended on by several still-referenced files), extracted
  the real historical `<script>` co-load graph from the archived
  `legacy/public-html/**/*.html` pages (the only reliable source of truth for
  which files were ever meant to load together) and cross-referenced it
  against what tests still load directly. 43 of the 49 files are either
  loaded by a test or appear in that co-load graph and are therefore still
  entangled with other files; the remaining 6 —
  `dashboard.js`, `filters.js`, `review.js` (961 lines — its own review-queue
  UI, fully superseded by the `review.html` meta-refresh stub that now points
  to V3's Exports page), `settings-mobile-redirect.js`, `tax-widget.js`,
  `theme-boot.js` — appear in **zero** archived page's script list, are loaded
  by no test, and (verified by checking every identifier each one defines)
  are called by no other file in the directory. Deleted those 6.

  **Follow-up pass, same PR sequence**: did the equivalent classification for
  `public/css/pages` (36 files). CSS coupling is simpler to prove than the JS
  case — `@import` is explicit and grep-able, no hidden global-scope calls —
  but still cross-referenced the same archived-HTML `<link>` manifest rather
  than trusting a bare "not imported elsewhere" check. `seo-page.css` is
  actively linked by the SEO pages (kept, obviously); 26 more files correspond
  to an archived page that still exists in `legacy/public-html` and are linked
  from it (kept, bundled with that larger not-yet-made archive/delete
  decision). The remaining 9 — `business-profile.css`, `change-password.css`,
  `landing-responsive-fixes.css`, `landing-rolodex.css`, `review.css`,
  `security.css`, `settings-mobile-native.css`,
  `subscription-premium-bridge.css`, `subscription-premium.css` (3,152 lines
  total) — aren't linked by any active or archived page, aren't `@import`ed by
  any other CSS file, and don't even have a corresponding archived HTML file
  in `legacy/public-html` the way the kept 26 do — these were vestigial before
  the archive was even created. Deleted all 9.

  Still half credit: 43 `public/js` files and 26 `public/css/pages` files
  remain, all legitimately entangled with the still-existing (if archived)
  legacy HTML pages. Deciding their fate — archive the whole legacy bundle
  more formally, or delete it outright now that V3 fully supersedes it — is a
  bigger product/scope call than fits inside this file-by-file safety pass.
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

**Beyond the four original items** (not counted in this phase's score — real
work, but not one of the audit-derived checklist items, so it's logged here
rather than inflating the denominator): extracted `transactions.routes.js`'s
CSV-import parsing/detection helpers (`parseCsv`, `normalizeDate`,
`detectColumns`, `derivePseudoMerchant`, `collectCsvTextFields`,
`extractRowData`, `parseImportDateRange`, `isPlannedCsvDuplicate`,
`countImportableCsvRows`) into `services/transactionCsvImportService.js`.
These functions previously only existed inside the route file and were reached
by two separate test files through a `module.exports.__private = {...}`
escape hatch — a testing-shaped wart that existed purely to let tests see
inside an unexported implementation detail. Moving them to a real module
eliminates that hack for these 7 functions (3 category-resolution functions
that are genuinely shared across POST/PUT/CSV-import stay in the route file
and keep their narrower `__private` export, since bundling them in would have
been a different, broader-scoped extraction than this one). Route file:
2,450 → 2,108 lines. Test files updated to import from the service directly.

**Follow-up, same reasoning**: `routes/auth.routes.js` overtook
`transactions.routes.js` as the largest route file (2,634 lines) once the CSV
work landed. Read all 70 of its top-level functions before touching anything,
given how security-sensitive this file is. Found 13 genuinely pure/near-pure
functions with zero DB, cookie, or `req`/`res` coupling — password
hashing/strength, login-lockout timing, email masking for logs and MFA
status, MFA-code generation/hashing, refresh/MFA-trust-token hashing, and two
small response-shaping helpers — none of which had any direct unit test
coverage anywhere (only reachable indirectly through full HTTP-level auth
flow tests). Left everything that issues JWTs, touches `pool`, or builds
links from `req` in the route file — that's the actual security-decision
surface, not utility code, and higher risk to move. Extracted the 13 into
`services/authSecurityService.js` with 12 new direct unit tests. Also found
and fixed a real small duplicate along the way: `maskEmailAddress` and
`maskEmail` were two names for the identical function, with `maskEmail` used
at ~19 call sites and `maskEmailAddress` at effectively none outside its own
alias — collapsed to the one name already in wide use, `maskEmail`, so
existing call sites needed no changes. Considered collapsing
`hashRefreshToken`/`hashMfaTrustToken` too (identical bodies) but kept them
separate: unlike the mileage/mask cases, these hash conceptually distinct
token types, and collapsing them would silently couple two security
boundaries that happen to use the same algorithm today but have no reason to
stay coupled. Caught two bugs in my own new tests before shipping —
miscalculated `isStrongPassword`'s lowercase requirement (it has none) and
`maskEmail`'s exact masking output — by running them against the real
function first rather than trusting my own arithmetic. Route file:
2,634 → 2,551 lines. Full auth-adjacent test suite (218 tests across 10
files) passes unchanged.

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

- **PR 8** (`security/verify-mfa-signup-tokens-and-storage`): Phase 2, its two
  unstarted items. Read `routes/auth.routes.js`'s token issuance/verification
  paths and `frontend-v3/src/lib/apiClient.ts` end to end before concluding
  anything. Found both items were already true in production code — every
  transient auth token is purpose-scoped and time-bounded, and the persistent
  session credential is cookie-only (`httpOnly`, never touched by V3 JS) — but
  neither property was enforced by a test, so either could silently regress.
  Closed that gap with `tests/v3AuthTokenStorage.test.js`: scans every
  `localStorage`/`sessionStorage.setItem(` call site in `frontend-v3/src`
  against an explicit allowlist of the (non-auth-token) keys the app is
  actually allowed to write, plus a standalone check that no call site ever
  writes an access/refresh/session/auth/jwt-token-shaped key under any name.
  Verified the regex actually catches a violation (not just vacuously passing)
  with an isolated sample file before trusting it. No production code changes
  — the underlying behavior was already correct. Full test suite: 1299/1300
  passing (same pre-existing, unrelated failure as every prior PR).

- **PR 9** (`security/verify-bearer-token-removal`): Phase 2, its last
  half-credit item. Started from the audit's own claim (Pass 7/31) that
  `auth.middleware.js` still accepted `Authorization: Bearer`, and checked it
  against current `main` before assuming the finding still applied — it
  didn't. `git log -p` showed commit `6a075ad1` had already removed bearer
  parsing from both places the audit flagged
  (`auth.middleware.js::getRequestToken` and
  `consent.routes.js::resolveAuthenticatedUserId`); a repo-wide grep confirmed
  no inbound bearer/authorization handling remains anywhere. That commit was
  already credited for the separate "cookie-only V3 auth contract" item, which
  is why this item had been sitting at half credit rather than zero — same fix,
  two checklist entries. Closed the "not independently re-verified" half with
  `tests/bearerTokenRejection.test.js` (a validly-signed Bearer-only token
  produces byte-identical 401s to no auth at all, and can't override an invalid
  cookie) and one more check added to `tests/v3AuthTokenStorage.test.js` (no V3
  source file ever constructs an `Authorization` header — the audit's own
  suggested client-side CI check for this same contract). No production code
  changes. Full test suite: 1303/1304 passing (same pre-existing, unrelated
  failure as every prior PR).

- **PR 10** (`security/rate-limit-internal-support`): Phase 2's last remaining
  half-credit item, following up on the user's request to keep working through
  `Work-Review/CODEBASE-100PCT-AUDIT-2026-08-09.md`. Read
  `routes/internalSupport.routes.js` and `middleware/requireSupportSecret.js`
  directly rather than assuming what the two cited commits already covered:
  timing-safe secret comparison and per-access audit logging were both already
  in place; a dedicated rate limiter was not — the router only got the generic
  300/min global tier. Added `createInternalSupportLimiter()` (30 req/15 min,
  IP-keyed) to `middleware/rateLimitTiers.js`, matching the existing
  auth/password/MFA limiter pattern, and wired it in *ahead of* the secret
  check so a failed-guess loop is throttled too, not just successful requests.
  Added a source-order test confirming that wiring (the limiter line appears
  before the secret-check line in the router file) plus a limiter-configuration
  test in `tests/rateLimiter.test.js` replicating the exact tier and proving it
  blocks at request 31. Deliberately did not attempt the audit's other two
  suggested pieces (per-agent identity, role/scope checks) — that's the
  finding's actual "High" severity core, and it requires a product decision
  ("is the internal support API even production-required") that isn't mine to
  make inside a remediation PR, so the item stays at half credit with that gap
  explicitly documented rather than silently claimed done. Full test suite:
  1305/1306 passing (same pre-existing, unrelated failure as every prior PR).

- **PR 11** (`chore/remove-orphaned-legacy-page-scripts`): Phase 6, a genuine
  first slice of the `public/js` inventory item, prompted directly by user
  feedback that the last several PRs kept adding tests instead of removing
  the AI-slop/legacy code this whole effort is supposed to be cutting down.
  That feedback was accurate — PRs 6, 8, and 9 touched zero production code,
  and this PR corrects course with an actual deletion, done carefully rather
  than rushed: confirmed via `grep` that none of the 49 `public/js` files are
  reachable from any active `public/html` page, then built the real
  dependency graph before deleting anything, because these are pre-module
  browser-global scripts with real hidden coupling (a first-pass identifier
  heuristic wrongly flagged `escape-html.js` and `global.js` — both are
  quietly depended on by several still-live files — which is exactly the
  mistake a rushed pass here would make). Used the archived
  `legacy/public-html/**/*.html` pages' own `<script>` tag lists as the
  reliable source of the real historical co-load graph, cross-referenced
  against what tests still load directly. Of 49 files, 43 are entangled with
  something else and stay untouched. The other 6 — `dashboard.js`,
  `filters.js`, `review.js` (961 lines of a review-queue UI now fully
  superseded by the `review.html` meta-refresh stub that points at V3's
  Exports page), `settings-mobile-redirect.js`, `tax-widget.js`,
  `theme-boot.js` — appear in zero archived page's script list, are loaded by
  no test, and define no identifier called anywhere else in the directory.
  Deleted all 6 (1,141 total lines removed) and fixed a stale comment in
  `public/css/core/dark-mode.css` that referenced the now-deleted
  `theme-boot.js` by name. No new tests added — this PR is net negative on
  line count. Full test suite: 1305/1306 passing, identical pass/fail count to
  before the deletion (same pre-existing, unrelated failure as every prior
  PR), confirming zero regressions. The other 43 `public/js` files and the 36
  files in `public/css/pages` remain open — deciding their fate (archive vs.
  delete vs. keep for historical CSS parity) is a bigger, more careful pass
  than fits in one PR.

- **PR 12** (`chore/remove-orphaned-page-css`): Phase 6, continuing the same
  path directly ("continue on this path" after PR 11's course-correction).
  Did the CSS equivalent of PR 11's classification for `public/css/pages` (36
  files). `@import` is explicit and grep-able — no hidden global-scope
  coupling risk the way `public/js` has — but still cross-referenced the
  archived-HTML `<link>` manifest rather than trusting a bare
  not-imported-elsewhere check, for consistency and rigor. `seo-page.css` is
  actively linked by the live SEO pages; 26 files are linked from an archived
  page that still exists in `legacy/public-html` and stay bundled with that
  larger, not-yet-made archive/delete decision. The remaining 9 —
  `business-profile.css`, `change-password.css`,
  `landing-responsive-fixes.css`, `landing-rolodex.css`, `review.css`,
  `security.css`, `settings-mobile-native.css`,
  `subscription-premium-bridge.css`, `subscription-premium.css` — are linked
  by nothing, `@import`ed by nothing, and (unlike the 26 kept files) don't
  even have a corresponding archived HTML file in `legacy/public-html` — they
  predate the archive itself being vestigial. Deleted all 9 (3,152 lines).
  Repo-wide grep after the deletion found zero remaining references. Full
  test suite: 1305/1306 passing, identical pass/fail count to before the
  deletion (same pre-existing, unrelated failure as every prior PR) — zero
  regressions. No new tests added; net negative on line count again. Combined
  with PR 11: 15 files, 4,293 lines of confirmed-dead legacy static assets
  removed across this pair. The remaining 43 `public/js` and 26
  `public/css/pages` files stay open for the larger archive/delete call.

- **PR 13** (`refactor/extract-csv-import-parsing`): continuing the same real
  simplification path, this time on `transactions.routes.js` itself rather
  than the static-asset surface. The CSV import endpoint's helper functions
  (`parseCsv`, `normalizeDate`, `detectColumns`, `derivePseudoMerchant`,
  `collectCsvTextFields`, `extractRowData`, `parseImportDateRange`,
  `isPlannedCsvDuplicate`, `countImportableCsvRows`) had been sitting unexported
  in the route file, reachable by two test files only through a
  `module.exports.__private = {...}` escape hatch — itself a small AI-slop
  tell, since it exists purely to let tests peek inside code that should have
  had its own module boundary from the start. Extracted all 9 into
  `services/transactionCsvImportService.js`, moved verbatim (same logic, same
  branches, only the DB-access functions' default injected dependencies
  changed source location). Left `getCategoryCacheEntryId`,
  `ensureCategoryTemplateFields`, and `resolveCategoryId` in the route file —
  confirmed via grep they're called from POST and PUT as well as CSV import,
  so bundling them into a CSV-specific service would have been a wrong,
  broader-scoped move; they keep their own narrower `__private` export.
  Updated `tests/transactionCsvImportHelpers.test.js` and
  `tests/transactionsCsvImportLimit.test.js` to import directly from the new
  service instead of reaching through `__private`. Route file: 2,450 → 2,108
  lines (342 lines removed). Full CSV-import test coverage (26 tests across
  the 4 files that touch this endpoint, including the real HTTP-level route
  test) passes unchanged. Full suite: 1305/1306 passing (same pre-existing,
  unrelated failure as every prior PR) — zero regressions. Not counted toward
  Phase 7's score (see the phase's own note) since it goes beyond the four
  audit-derived checklist items, but it's real: another ~340 lines off the
  file the audit called "too complex for a route file," with no new
  scope-inflation to the tracker's denominator.

- **PR 14** (`refactor/extract-auth-security-utils`): same path, one file
  over. `routes/auth.routes.js` (2,634 lines) is now the largest route file in
  the repo, having overtaken `transactions.routes.js` once PR 13 shrank that
  one. Given how security-sensitive this file is, read all 70 of its
  top-level functions in full before deciding what, if anything, was safe to
  touch — this is not a file to extract from on a quick pattern-match.
  Identified 13 functions with zero database, cookie, or `req`/`res`
  coupling — `hashPassword`, `isStrongPassword`,
  `isTransientLoginInfrastructureError`, `buildPublicSessionPayload`,
  `ensureArrayValue`, `hashMfaEmailCode`, `generateMfaEmailCode`, `maskEmail`,
  `buildMfaStatusPayload`, `getLoginLockExpiry`, `isLoginLocked`,
  `hashRefreshToken`, `hashMfaTrustToken` — none of which had any direct unit
  test anywhere; they were only exercised indirectly through full HTTP auth
  flow tests. Left every function that signs a JWT, queries `pool`, or builds
  a link from `req` in the route file — that's the actual security-decision
  surface (MFA token issuance, session creation, device fingerprinting), not
  interchangeable utility code, and a wrong call there is a very different
  risk category than a wrong call in a password-strength regex. Extracted the
  13 into `services/authSecurityService.js` with 12 new direct unit tests.
  While doing this, found `maskEmailAddress` and `maskEmail` were two names
  for one identical function (`maskEmail` used at ~19 call sites,
  `maskEmailAddress` at none outside its own now-removed alias) — collapsed
  to `maskEmail`, the name already in use everywhere, so no call sites needed
  changing. Deliberately did *not* collapse `hashRefreshToken`/
  `hashMfaTrustToken` despite identical bodies — they hash conceptually
  distinct token types, and merging them would silently couple two security
  boundaries that only coincidentally share an algorithm today. Caught two
  real bugs in my own new tests before running them for real — wrongly
  assumed `isStrongPassword` required a lowercase letter (it doesn't) and
  miscalculated `maskEmail`'s exact masking output by hand — both fixed by
  checking against the actual function output rather than trusting my own
  arithmetic, same discipline as the regex sanity-checks in earlier PRs. Route
  file: 2,634 → 2,551 lines. Full auth-adjacent test suite (218 tests across
  10 files, all real HTTP-level flows) passes unchanged. Full suite:
  1317/1318 passing (same pre-existing, unrelated failure as every prior PR).
  Not counted toward Phase 7's score, same reasoning as PR 13.
