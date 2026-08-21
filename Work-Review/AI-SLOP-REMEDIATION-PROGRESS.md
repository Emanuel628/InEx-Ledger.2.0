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

## Overall: 65.5 / 92 action items (~71%)

## Phase 0 - Safety Rules (process rule, always active, not counted)

## Phase 1 - Stop New Damage: Gates, Secrets, Repo Hygiene — 6.0 / 6
- [x] `npm run test:all` wired into CI (`phase7-guardrails.yml`)
- [x] Brittle source-shape tests replaced with behavior tests — inventoried all 22
  files across the suite that read frontend-v3 `.ts`/`.tsx` source as text. Most
  turned out to be either false positives (files that `readFileSync` a script only to
  `vm`-execute it and test real runtime behavior) or legitimate structural/source-level
  invariants explicitly worth keeping (CSRF route-inventory, migration-file content
  pinning, nixpacks/Dockerfile config checks, doc-sync checks) — retained unchanged per
  this item's own stated finish line. Converted the genuinely brittle ones:
  `tests/frontendV3ApiContracts.test.js`'s transaction-mapper and `/api/me` contract
  tests now transpile `transactionsApi.ts`/`authApi.ts` with the real TypeScript
  compiler and run the real `mapTransaction`/`mapLegacyUser` functions in a `vm`
  sandbox (exported both — previously module-private — specifically for this), instead
  of regexing fallback expressions out of the source. `tests/frontendV3Wiring.test.js`'s
  Canadian tax-rate test now calls the real (newly-exported) `resolveEstimatedTaxProfile`
  the same way instead of pinning literal `AB: 0.29`-style constants in a regex. Its two
  `apiClient.ts` tests now load the real module with a mocked `fetch`/`document.cookie`/
  `FormData` sandbox and assert on actual request sequences (401 → refresh → retry;
  403 CSRF failure → refresh → retry with the new token), replacing literal-code-fragment
  regexes with genuine behavior tests. Its debounce/stale-response-guard test for
  `Receipts.tsx` had its magic-number (`275`) and private-ref-name pins relaxed to
  structural pattern checks, since there's no React/jsdom test harness in this repo to
  drive true component behavior — introducing one solely for this single assertion
  would be disproportionate, so it stays a source check with the genuine brittleness
  removed. The root-landing favicon test's exact cache-bust query string
  (`?v=20260726a`, guaranteed to go stale on the next legitimate asset update) was
  relaxed to match any cache-bust value. The legacy-auth-defaults test now signs a real
  JWT via `auth.middleware.js`'s exported `signToken` and decodes its actual `exp`-`iat`
  lifetime instead of regexing `|| 60 * 60`; the two remaining non-exported constants
  (the auth-cookie maxAge and the refresh rate limit) stay source checks but now assert
  on numeric magnitude rather than pinning exact literal formatting.
  `tests/startupMigrationSafety.test.js`'s server-init-before-listen test previously
  compared `indexOf` positions of two strings inside a sliced function body; it now
  requires the real `server.js`/`db.js` fresh, spies on the real `initDatabase` and
  `app.listen` calls, invokes the real `startServer()`, and asserts the actual call
  order. `tests/internalSupportRoutes.test.js`'s rate-limiter-before-secret-check test
  was investigated too: unlike the other `indexOf` cases, `router.use(A); router.use(B)`
  ordering in Express *is* the actual behavior (Express always runs middleware in
  registration order), so converting it to a live 429-triggering test would need either
  running in production mode or new store-injection plumbing for a check that's already
  faithful — left unchanged as a legitimate source-level invariant. Full backend suite:
  1631/1631 passing; `frontend-v3` type-checks and builds clean.
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

## Phase 2 - Security Contract Cleanup — 7 / 7
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
- [x] Internal support shared-secret access hardened (commits `25026802`,
  `2ae677c9`) — the audit's suggested fix has four parts: agent identity,
  role/scope checks, a limiter, and durable audit. Durable audit was already
  done (every access is logged, with the log helper auto-sanitizing emails)
  and the secret comparison already uses `crypto.timingSafeEqual`
  (constant-time, no timing side-channel). A limiter was missing — every
  `/internal/support/*` request only got the generic 300/min global tier sized
  for ordinary app traffic — fixed with `createInternalSupportLimiter()` (30
  requests/15 min, IP-keyed), wired ahead of the secret check so failed-guess
  attempts count toward the same window, not just successful ones. The
  remaining piece — per-agent identity and role/scope checks — is the
  audit's actual "High" severity concern (no accountability beyond an IP+URL
  log line if the shared secret leaks or is misused), and it's explicitly a
  product decision: **accepted product decision (confirmed with the product
  owner)** — the internal support API currently uses a single production
  secret with timing-safe validation, dedicated rate limiting, and durable
  access auditing; per-agent identity and role/scoped authorization are
  intentionally deferred until the product has multiple support operators or
  external support tooling requiring individual attribution, and are not
  required for the current operating model. Closing at full credit on that
  basis rather than leaving an intentionally-deferred decision permanently
  half-scored.
- [x] CSRF/origin tests for representative mutating routes (`c665b36b`) —
  the source finding (`PROGRAMMING-QUALITY-RESEARCH-2026-08-09.md`) is "Add
  CSRF/origin tests for representative mutating API routes **and allowed
  webhook exceptions**." `tests/csrfE2E.test.js` already covers the first
  half well: route-inventory checks that every mutation route file applies
  `requireCsrfProtection`, plus e2e valid/missing/invalid/mismatched-token
  cases. It also has a test confirming the billing webhook is *structurally*
  exempt from CSRF (no `requireCsrfProtection` in its handler chain) — but
  nothing anywhere exercised whether that exemption is actually safe, i.e.
  whether `verifyWebhookSignature` in `routes/billing.routes.js` really
  rejects a request that isn't from Stripe. It does (checked the function
  directly: missing signature, malformed header, wrong secret, tampered
  body, and a stale timestamp outside the 5-minute tolerance window all
  throw before any event is processed), but there was zero test coverage of
  any of those paths at the HTTP level. Added 6 tests to
  `tests/billingWebhook.test.js` exercising exactly that: each rejection
  path returns 400 without touching subscription sync or the free-plan
  fallback, plus one confirming a valid signature among multiple (secret
  rotation) is still accepted. Full suite via `npm run test:all`:
  **1594/1594 passing** (plus 3/3 ASVS controls) — 6 more than the
  pre-existing baseline, all new.
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
- [x] Route-local error/log paths sanitized (`25df086b`, `24931740`) — rather
  than rolling `buildRouteErrorContext` out file-by-file across the ~19
  remaining route files (a huge, mostly-redundant lift now that 38 of 40
  files already run through `asyncRoute`), enriched the one mechanism that
  already serves all of them: `server.js`'s central error handler. It logged
  `requestId`/`status`/`method`/`path`/`message` already but was missing
  `err.code`, `err.constraint`, `userId`, and route params compared to
  `buildRouteErrorContext`'s shape — added all four (mirrored in
  `tests/helpers/testPool.js`'s `attachCentralErrorHandler`, the shared test
  fixture, so both stay in sync). Route params turned out to be a real, not
  cosmetic, gap: Express resets `req.params` to `{}` as an error bubbles up
  past the route-specific layer that matched it, so a central app-level
  handler can never read `req.params` directly — confirmed this by writing a
  test for it first and watching it fail, not by inspection. Fixed properly
  rather than dropping the field: `asyncRoute` now snapshots non-empty
  `req.params` onto the error as `err.routeParams` while it's still valid,
  and the central handler reads that instead. Also found and removed 3
  redundant raw-`Error`-object `logError()` calls in `routes/receipts.routes.js`
  (`POST /`, `PATCH /:id/attach`, `DELETE /:id`) — each logged the unsanitized
  error and then rethrew it anyway, meaning the error was already being
  logged a second time, more richly, by the central handler; the local dump
  was pure duplication of the exact kind this item exists to remove. Added
  9 new tests (5 in `testPoolHelpers.test.js` covering the enriched fields,
  4 in `apiError.test.js` covering `routeParams` snapshotting including the
  no-clobber-if-already-set case). `routes/transactions.routes.js` keeps its
  existing direct `buildRouteErrorContext` usage as-is — still the right
  choice there since it threads route-specific `businessId` into `extra`,
  which the central handler can't do generically. Full suite via
  `npm run test:all`: **1614/1614 passing** (plus 3/3 ASVS controls) — 9
  more than the pre-existing baseline, all new.

## Phase 3 - Startup, Deployment, Migration Safety — 6 / 6
- [x] Checksum repair removed from `prestart` (`391319b9`)
- [x] Server does not listen before DB init/migration readiness (`fabc898f`)
- [x] Read-only migration verification split from repair commands — read
  `scripts/repair-migration-checksums.js` directly rather than assuming
  this needed new code: the split already existed functionally.
  `package.json`'s `migrations:verify-checksums` and
  `migrations:repair-checksums` are two distinctly-named commands, both
  resolving to this one script, gated by a hard safety default — no flag
  means read-only (reports drift and exits non-zero, mutates nothing);
  `--write` is required to actually update `schema_migrations.checksum`,
  and even then only inside a transaction. `migrations:verify-checksums`
  never passes `--write`, so it's structurally incapable of mutating
  regardless of what it finds. What was actually missing was proof: the
  script had zero test coverage, so nothing would catch a regression (e.g.
  someone flipping the default). Added a `require.main === module` guard
  and exported `parseArgs`/`buildDriftReport`/`main` (matching the existing
  pattern in `scripts/check-child-business-fk-readiness.js`), then added 9
  tests in `tests/repairMigrationChecksumsScript.test.js`: argument parsing,
  drift/missing-file detection, and — the actual safety property — `main()`
  with no `--write` throws without issuing a single `UPDATE`, `--write`
  performs the scoped repair, no-drift is a no-op regardless of flags, and
  missing applied-migration files refuse to repair even with `--write`.
  Full suite via `npm run test:all`: **1603/1603 passing** (plus 3/3 ASVS
  controls) — 9 more than the pre-existing baseline, all new.
- [x] Environment validation for required production settings — the
  remaining piece from the earlier half-credit pass was building the fuller
  suggested design: a real two-tier core-vs-feature-gated validator, plus an
  env-validation matrix in `Docs/PRODUCTION-READINESS.md`. User confirmed
  the intent directly: build the two-tier structure and the doc without
  changing which vars are actually required today — leave the
  inbound-email/support-reply secrets question as a documented, deliberate
  exception rather than a product call made unilaterally. Rewrote
  `envValidationService.js`'s flat required-list into an explicit
  `ENV_VARIABLE_REGISTRY` (`{ name, tier: "core" | "production", reason }`)
  plus a separate `OPTIONAL_FEATURE_ENV_VARIABLES` list documenting the
  inbound-email secrets and their fail-closed 503 behavior;
  `collectRequiredEnvironmentVariables` now derives its output from the
  registry instead of a hand-maintained array. Verified behavior preservation
  by running the full pre-existing `tests/envValidationService.test.js`
  unchanged against the new implementation — all 13 tests passed with zero
  edits, confirming the required-variable set for both `production` and
  non-production is byte-identical to before. Added 4 new tests locking in
  the registry's own shape (only two known tiers, every entry has a reason,
  no duplicate names, optional entries never leak into the required list).
  `Docs/PRODUCTION-READINESS.md` was badly stale (dated 2026-06-07, missing
  `INEX_LEDGER_SUPPORT_SECRET`/`REDIS_URL`/`PDF_WORKER_URL`/
  `PDF_WORKER_SECRET`/`EXPORT_PUBLIC_KEY_JWK`/`EXPORT_PRIVATE_KEY_JWK` from
  its required list even though code already required all of them) —
  rewrote its "Required environment variables" section as a real matrix
  (variable / tier / why) matching the registry exactly, plus the
  feature-gated table with each secret's fail-closed behavior. Full suite
  via `npm run test:all`: **1618/1618 passing** (plus 3/3 ASVS controls) —
  4 more than the pre-existing baseline, all new.
- [x] Docker/Nixpacks/start scripts reconciled — checked both of the
  audit's original findings against current `main` before assuming either
  was still open. Both were already fixed: Nixpacks has a real
  `[phases.build]` running `npm run build:frontend-v3` and verifying
  `public/app-v3/index.html` exists (the original finding was that Nixpacks
  had no build phase and could deploy a stale checked-in bundle), and every
  install step across the Dockerfile and both `nixpacks.toml` files already
  uses `npm ci`, not `npm install` (the reproducible-installs item, already
  `[x]` separately). What was still genuinely inconsistent: `Dockerfile`
  pins `node:20-bookworm-slim` but both `nixpacks.toml` files used the
  unversioned `nixPkgs = ["nodejs"]`, which resolves to whatever Node
  version the Nixpacks/nixpkgs channel defaults to — not necessarily 20,
  and not guaranteed stable across rebuilds. Pinned both to
  `nixPkgs = ["nodejs_20"]` and added `"engines": {"node": "20.x"}` to
  `package.json`. Added 2 tests to `tests/frontendV3BuildPipeline.test.js`
  (which already covered the build-phase/`npm ci` properties): one asserts
  the Dockerfile/nixpacks/package.json Node major version all agree, the
  other asserts the root and API-local `nixpacks.toml` files stay
  semantic mirrors of each other (they differ only by a
  `cd In-Ex-Ledger-API && ` prefix and incidental TOML array line-wrapping,
  confirmed by diffing them directly). Full suite via `npm run test:all`:
  **1605/1605 passing** (plus 3/3 ASVS controls) — 2 more than the
  pre-existing baseline, all new.
- [x] Reproducible installs (`npm ci`) in CI/deployment (`afdefa17`, `6a313ff0`)

## Phase 4 - API Error And Response Consistency — 5 / 5
- [x] Consolidated `ApiError`/`sendError`/async-route pattern introduced — Pass 27's
  suggested design already had most of its foundation in place and just wasn't being
  used: `server.js` already has a final Express error handler that derives status
  from `err.status`/`err.statusCode`, hides 500 details in production, and logs
  structured fields — it just never received anything, since every route file
  catches its own errors locally and hand-rolls `res.status(...).json(...)`. Added
  `utils/apiError.js`: `ApiError` (a typed error carrying `.status`/optional `.code`)
  and `asyncRoute` (wraps an async handler so both a rejected promise *and* a
  synchronous throw reach `next(err)` — Express's own dispatcher already catches
  synchronous throws in ordinary handlers, but a handler invoked directly, e.g. in a
  test, doesn't get that for free, so `asyncRoute` catches both explicitly; caught
  by actually running my own unit tests for it, not by inspection — the first
  version silently dropped synchronous throws and didn't return the promise chain,
  so a test awaiting the wrapped handler resolved before the async catch ran).
  Piloted on `routes/business.routes.js` (audit's own cited example: `business.routes.js`
  logs `err.stack || err` and returns bespoke 500 messages) — replaced every
  `try/catch` + `res.status(...).json(...)` with `throw new ApiError(status, message)`
  and `asyncRoute(...)`, keeping local `try/catch` only where it's genuinely needed
  (translating a DB `CHECK` constraint violation or `accountingLockService`'s date
  error into an `ApiError`). Every existing 400/404 message is preserved exactly;
  the only behavior change is that a *truly unexpected* 500 now returns the same
  generic "Internal server error" text as everywhere else instead of a bespoke
  per-route message, which is the explicit point of centralizing. This route file
  had zero HTTP-level test coverage before — added 27 tests
  (`tests/businessRouteErrors.test.js`) covering every validation branch, both
  success paths, all 3 `CHECK` constraint mappings, and the date-validation
  special case, plus 5 direct unit tests for `ApiError`/`asyncRoute` itself
  (`tests/apiError.test.js`). **Follow-up, same PR sequence**: converted 4 more
  small, always-mounted route files — `system.routes.js`, `bank-connections.routes.js`,
  `homeOffice.routes.js`, `entitlements.routes.js`. `homeOffice.routes.js` was a
  useful data point: `services/homeOfficeService.js` already threw plain `Error`s
  with a `.status` property (`Object.assign(new Error(...), { status: 400 })`) —
  functionally identical to `ApiError` in shape — so the route's manual
  `if (err?.status === 400) return res.status(400)...` re-wrap was pure boilerplate
  once `asyncRoute` lets it propagate straight to the central handler. Along the
  way, found real duplication forming across route-specific test files: 4 of them
  were about to grow an identical 6-line "minimal stand-in for server.js's central
  error handler" snippet. Extracted `attachCentralErrorHandler` into the shared
  `tests/helpers/testPool.js` (alongside the existing `buildTestApp`) instead,
  with 5 new direct unit tests (`tests/testPoolHelpers.test.js`), and switched
  `businessRouteErrors.test.js`'s already-existing inline copy over to it too so
  there's one canonical version, not one exception. Updated the 4 route files'
  existing test files to match centralized behavior (checking `logError`'s new
  structured `{status, method, path, message}` shape instead of a route-specific
  log-string regex) and added 2 previously-missing tests for
  `homeOffice.routes.js` (a 404 and a 500 path that had no coverage before).
  Now 5 of 41 route files use the pattern. **Follow-up, same PR sequence**:
  converted 4 more — `vehicleClaims.routes.js`, `sessions.routes.js`,
  `consent.routes.js`, `capitalAssets.routes.js`. `vehicleClaims.routes.js`
  was the interesting one: `services/vehicleClaimService.js` throws plain
  `Error`s with no `.status` for its 3 domain-validation cases (a claim
  method conflict, and two CRA-region rules), unlike `homeOfficeService.js`
  which already had `.status`. Rather than reshaping the service (bigger,
  separate change) or losing the route's existing message-substring
  detection, kept the same detection logic, just throwing `ApiError(400, ...)`
  instead of responding directly — same behavior, still gets the pattern's
  benefit for the other paths in the file. `vehicleClaims.routes.js` and
  `capitalAssets.routes.js` had zero test coverage before (28 tests added
  between them: 13 + 19 — some overlap since capitalAssets got 19 across
  4 endpoints incl. every validation branch); added 4 more to
  `sessions.routes.js` (400/404/500 paths that existed in the code but not
  in tests) and 3 more to `consent.routes.js` (400 + two 500s). Now 9 of 41
  route files use the pattern. Staying at half credit — 32 to go.
  **Follow-up, same PR sequence**: converted 2 more — `accounts.routes.js`
  and `supportArtifacts.routes.js`, both meaningfully more complex than the
  prior batch (a real DB transaction with rollback, and real filesystem
  compensation on a failed upload). `accounts.routes.js`'s account-type
  reclassification path calls `assertNoLockedPeriodTransactionsForAccount`,
  whose `AccountingPeriodLockedError` carries extra structured fields
  (`code`, `locked_through_date`) the shared central handler has no
  mechanism to forward — kept a local catch that responds directly with
  those fields instead of forcing it through `ApiError`. Its `DELETE /:id`
  keeps its real `pool.connect()`/`BEGIN`/`COMMIT`/`ROLLBACK` transaction
  intact (catch → rollback → rethrow → release in `finally`) as true
  compensation work, not a pattern violation. `supportArtifacts.routes.js`'s
  `POST /upload` similarly keeps a local catch that unlinks an
  already-written file from disk if the DB insert after it fails, then
  rethrows unchanged — and dropping its old bespoke `res.status(status).json(...)`
  fallback is a real fix, not just a refactor: unmapped errors (e.g. a raw
  DB failure) no longer leak `err.message` to the client, they now correctly
  fall through to the central handler's generic "Internal server error".
  Along the way, found and fixed a real, previously-invisible gap: two large
  multi-router test files (`tests/criticalFlows.test.js`,
  `tests/integrationFlows.test.js`) each maintain their own locally-duplicated
  `buildApp` helper — copy-pasted rather than sharing `testPool.js`'s
  `buildTestApp` — and neither had `attachCentralErrorHandler` wired in, so
  3 tests in `integrationFlows.test.js` started failing the moment
  `accounts.routes.js` began throwing instead of responding directly.
  Fixed both files' local helpers and proactively audited the other 15
  files sharing the same duplicated-`buildApp` pattern — confirmed none of
  them mount an already-converted route file, so no other latent breakage.
  Added a new `tests/accountsRouteErrors.test.js` (11 tests, including the
  locked-period extra-fields response and the rollback-then-500 path) and
  4 new tests to `tests/supportArtifactsRoutes.test.js` (a 400, a 404, a
  500, and the file-missing-on-disk 404). Full suite via `npm run test:all`:
  **1468/1468 passing** (plus 3/3 ASVS controls) — 15 more than PR 23's
  baseline, all new. Now **11 of 41** route files use the pattern; checklist
  item stays at half credit — 30 to go.
  **Follow-up, same PR sequence**: converted 4 more — `customers.routes.js`,
  `vendors.routes.js`, `projects.routes.js`, `billable-expenses.routes.js`
  — all four V2/Business CRUD routers sharing the exact same shape (uniform
  `try { ... } catch (err) { logError(...); res.status(500).json({error:...})}`
  boilerplate on every handler, no unique-constraint mapping or compensation
  work in any of them). Straightforward conversion: upfront validation/UUID
  checks became `throw new ApiError(400, ...)`, not-found checks became
  `throw new ApiError(404, ...)`, the per-route `logError`/500 catch was
  removed entirely in all four. Correcting an earlier miscount while here:
  a fresh `find`/`ls` of `routes/*.routes.js` shows **40** route files
  total, not 41 as previously logged — this batch is **15 of 40**, not
  "15 of 41"; the discrepancy predates this PR and doesn't reflect a file
  being added or removed. `tests/v2RouteHardening.test.js` shares all four
  routers (plus `bills.routes.js` and `invoices.routes.js`, not touched
  here) through one `loadRouter` fixture with no `attachCentralErrorHandler`
  wired in, and several of its existing tests asserted the exact custom
  500 message (`"Failed to create project"`, `"Failed to create billable
  expense"`) and the old per-route `logError` call shape — both no longer
  true once the routes throw instead of responding directly. Wired in the
  central handler and updated those assertions to the generic `"Internal
  server error"` message and the handler's `{status, method, path, message}`
  log shape, rather than leaving the fixture out of sync with the routes it
  tests. Added a new `tests/v2RouteErrors.test.js` (16 tests, table-driven
  across all four routers: GET/PUT/DELETE 404-for-unknown-id and a
  non-UUID 400, none of which had any coverage before). Full suite via
  `npm run test:all`: **1484/1484 passing** (plus 3/3 ASVS controls) — 16
  more than the prior baseline, all new. Now **15 of 40** route files use
  the pattern; checklist item stays at half credit — 25 to go.
  **Follow-up, same PR sequence**: converted the last 2 files in the
  V2/Business CRUD family — `bills.routes.js` and `invoices.routes.js` —
  identical shape to the previous 4, same mechanical conversion, no
  special cases. This closes out the whole `requireV2BusinessEnabled`
  router family (customers/vendors/projects/billable-expenses/bills/
  invoices all now converted). Fixed one more instance of the same
  `v2RouteHardening.test.js` fixture gap: its "invoices list logs service
  failures" test asserted the old custom 500 message
  (`"Failed to load invoices."`) and the route's own `logError` shape;
  updated to the generic `"Internal server error"` and the central
  handler's `{status, method, path, message}` log shape, matching the fix
  already applied to the `projects`/`billable-expenses` tests in this same
  file. Extended `tests/v2RouteErrors.test.js` to cover `bills` and
  `invoices` too (8 more tests, same table-driven GET/PUT/DELETE-404 and
  non-UUID-400 shape as the other four routers — 24 tests total in that
  file now). Full suite via `npm run test:all`: **1492/1492 passing**
  (plus 3/3 ASVS controls) — 8 more than the prior baseline, all new. Now
  **17 of 40** route files use the pattern; checklist item stays at half
  credit — 23 to go.
  **Follow-up, same PR sequence**: converted 3 more route files —
  `check-email-verified.routes.js`, `review.routes.js`, and
  `analytics.routes.js`. `check-email-verified` now preserves its specific
  400/401 state-validation responses while unexpected database failures go
  through the central generic 500 handler. `review.routes.js` no longer carries
  per-handler `try/catch`/`logError` boilerplate around queue and issue handlers;
  invalid IDs/payloads and missing rows are explicit `ApiError` 400/404s, and
  unexpected dataset/query failures route through the shared handler.
  `analytics.routes.js` keeps the analytics math/query behavior intact while
  replacing four bespoke 500 messages with shared error routing and converting
  what-if validation failures to `ApiError(400, ...)`. Added
  `tests/analyticsRouteErrors.test.js` and expanded existing
  `checkEmailVerifiedRoutes.test.js`/`reviewQueueRoutes.test.js` coverage for
  central-handler 500s and representative validation/not-found branches. Full
  suite via `npm run test:all`: **1506/1506 passing** (plus 3/3 ASVS controls).
  Now **20 of 40** route files use the pattern. Phase 4 moves from **3.5/5**
  to **3.75/5**; overall moves from **31.0/54 (~57%)** to
  **31.25/54 (~58%)**. Checklist item remains partial because half the route
  files still need conversion.
  **Follow-up, same PR sequence**: converted 3 more route files —
  `internalSupport.routes.js`, `unsubscribe.routes.js`, and
  `crypto.routes.js`. `internalSupport.routes.js` now uses `asyncRoute` and
  `ApiError` across its support lookup handlers while preserving its support
  console envelope (`{ ok: false, message }`) through one router-level error
  mapper; expected 400/404 cases stay specific, unexpected failures return a
  generic 500. `unsubscribe.routes.js` now wraps its async opt-out write so
  database failures reach the central handler instead of relying on Express 4
  to catch an async rejection. `crypto.routes.js` now uses `ApiError(503, ...)`
  for an unavailable export public key while keeping the existing parse-failure
  logging and key-rotation behavior intact. Added
  `tests/unsubscribeRoutes.test.js`, expanded `internalSupportRoutes.test.js`,
  and wired `cryptoRoutes.test.js` to the central error helper. Focused suites:
  **14/14 passing**. Now **23 of 40** route files use the pattern. Phase score
  unchanged at **3.75/5** pending the remaining route families.
  **Follow-up, same PR sequence**: converted `recurring.routes.js`. Read and
  preserved the important non-boilerplate paths: transaction wrappers still keep
  local `try/catch` only for rollback, `RecurringTemplateValidationError` still
  maps to its expected status, Basic-plan limit responses still include their
  extra detail fields, and locked-period responses remain explicit. Removed the
  route-local logging/custom 500 responses from list/status/delete/restore/runs/
  upcoming flows and moved unexpected failures to the central generic handler.
  Updated `tests/recurringRouteValidation.test.js` to mount the central error
  helper and assert that the rollback-on-materialization-failure path no longer
  leaks the raw internal error message. Focused suite: **12/12 passing**. Now
  **24 of 40** route files use the pattern. Phase score unchanged at **3.75/5**.
  **Follow-up, same PR sequence**: converted `categories.routes.js`. Preserved
  the non-boilerplate special cases: unique-name violations still map to 409,
  locked accounting-period errors still return their `code` and
  `locked_through_date`, and merge keeps its transaction rollback path. Removed
  route-local custom 500 responses from list/create/unmapped/defaults/update/
  delete/merge flows and moved unexpected failures to the central generic
  handler. Added `tests/categoriesRouteErrors.test.js` and updated
  `categoryRegionGating.test.js` to mount the shared central error helper.
  Focused category suites plus direct-mount integration/critical coverage:
  **153/153 passing**. Now **25 of 40** route files use the pattern. Phase score
  unchanged at **3.75/5** pending the larger route families.
  **Follow-up, same PR sequence**: converted `supportEmail.routes.js` and
  `email.routes.js`. Kept the webhook response envelope as `{ ok, error }`, but
  removed route-local custom 500 bodies from unexpected processing failures and
  sent those failures through router-level generic 500 handlers. Added failure
  coverage in `tests/supportEmailInboundLegacy.test.js` and
  `tests/supportEmailThreading.test.js` so database insert failures no longer
  leak operational details. Focused inbound email suites: **5/5 passing**. Now
  **27 of 40** route files use the pattern. Phase score unchanged at **3.75/5**.
  **Follow-up, same PR sequence**: converted `invoices-v1.routes.js`.
  Preserved the route's real special case for outbound email-provider failures,
  which still logs structured details, notifies the invoice owner, and returns
  the provider-facing error payload. Moved the route's list/create/read/update/
  status/delete/restore boilerplate to `asyncRoute` plus `ApiError` and a
  router-level `{ error }` mapper. Added tests for preserved validation errors
  and generic unexpected database failures. Focused invoice suites:
  **23/23 passing**. Now **28 of 40** route files use the pattern. Phase score
  unchanged at **3.75/5**.
  **Follow-up, same PR sequence**: outside-this-chat work landed 8 more
  conversions between PR 35 and this note, bringing the count to **38 of 40**
  before this batch started — the only two files not using the pattern were
  `auth.routes.js` (2551 lines, 23 routes, by far the largest remaining file)
  and `region.routes.js` (verified N/A: a single sync handler with one
  static 503 branch, no hand-rolled multi-shape error responses to unify).
  Started `auth.routes.js`'s conversion in batches given its size and
  security sensitivity — this PR converts the first 7 routes
  (`/register`, `/send-verification`, `/complete-verified-signup`, `/login`,
  `/refresh`, `/logout`, `GET /verify-email`), leaving 16 more (MFA, password
  reset/recovery, email change) for follow-up PRs; not counting the file as
  converted yet since it's partial. `/login` and `/refresh` needed the most
  care: both had a route-local `try/catch` whose `catch` block treated
  every error as either a specific translated response or a generic 500 —
  converting the 400/401/403/423 branches to `throw new ApiError(...)`
  without also fixing the `catch` would have meant the catch's own
  `isTransientLoginInfrastructureError` check (and its final generic-500
  fallback) swallowed those intentional throws and reported them all as 500.
  Fixed by having the `catch` only translate the one specific case it exists
  for and rethrow everything else unchanged. `GET /verify-email` responds
  with plain text, not the JSON `{error}` envelope, since it's a link
  opened directly in a browser rather than a JS API client — left its
  response bodies untouched, only wrapped it in `asyncRoute` so an
  unexpected throw doesn't become a hung/unhandled-rejection request instead
  of a response. **Real bug found by writing the test first, not by
  inspection**: `/login`'s transient-infrastructure-error path threw
  `ApiError(503, "Sign-in is temporarily unavailable...")` — but the central
  handler replaces the message of *any* status >= 500 with the generic
  "Internal server error" by design (it hides 500 detail in production), so
  that deliberately-informative 503 message would have been silently lost.
  Fixed by keeping it as a direct `res.status(503).json({error: "..."})`
  response instead of a throw, the same "extra info the central handler
  can't carry" exception class as `AccountingPeriodLockedError` elsewhere in
  this rollout — just for the message itself rather than extra fields. Once
  found, checked whether this same mistake existed anywhere else already on
  `main`: it did, in two files converted in earlier (non-auth) batches —
  `crypto.routes.js`'s `GET /export-public-key` and three identical spots in
  `messages.routes.js` — both threw a 503 `ApiError` with a message that was
  already being silently swallowed by the central handler on `main` right
  now. Fixed all three the same way. `tests/cryptoRoutes.test.js` already
  had a test hitting this exact path but only asserted the status code, not
  the body — strengthened it to assert the real message, which would have
  caught this the moment it was introduced. Added
  `tests/authRouteErrors.test.js` (10 tests covering `/login`'s and
  `/refresh`'s error paths, including the transient-503 case and confirming
  unexpected DB failures produce a generic 500 rather than a leaked message)
  and one new test in `tests/cryptoRoutes.test.js`. Full suite via
  `npm run test:all`: **1629/1629 passing** (plus 3/3 ASVS controls) — 11
  more than the pre-existing baseline, all new. Route-file count stays at
  **38 of 40** (unchanged, since `auth.routes.js` isn't fully converted
  yet); Phase score unchanged.
  **Follow-up, same PR sequence — final batch, closes this item**: converted
  the remaining 16 routes of `auth.routes.js` (change-password, the full MFA
  cluster — `mfa/status`, `mfa/reauth`, `mfa/enable`, `mfa/disable`,
  `mfa/verify`, `mfa/resend`, `verify-email/send-code`,
  `verify-email/confirm-code` — the password/recovery cluster —
  `forgot-password`, `account-recovery`, `reset-password`,
  `recovery-email/request` — and the email-change cluster —
  `request-email-change`, `confirm-email-change` POST, `GET
  /confirm-email-change`, `GET /confirm-recovery-email`), bringing
  `auth.routes.js` to all 24 of its routes on `asyncRoute`/`ApiError` and the
  route-file count to **39 of 40** (`region.routes.js` stays the one
  confirmed-N/A exception). Most of these routes' `try/catch` blocks were a
  pure "log the error, return a generic 500" fallback with no real
  translation logic — for those, converting meant deleting the `try/catch`
  entirely (its only job is now `asyncRoute`'s), since a removed catch's
  message was already being discarded by the central handler's own
  status->=500 rule, so nothing observable changes. `/mfa/verify` and
  `/mfa/resend` needed the same care as `/login` had: their `catch` blocks
  translate *any* caught error (including a raw JWT-verify exception) into a
  specific non-500 status, so converting their internal branches to
  `throw new ApiError(...)` without restructuring the `catch` would have let
  it re-swallow those intentional throws into its own generic message.
  Fixed the same way as `/login`: `catch (err) { if (err instanceof
  ApiError) throw err; ...only-then handle the real translation case... }`.
  One incidental discovery while re-running the full suite: an unrelated,
  pre-existing test file, `tests/authDeviceVerification.test.js`, had its
  own ad hoc `buildApp` error handler (`(err, req, res, next) =>
  res.status(500).json(...)`) that ignored `err.status` entirely and always
  returned 500 — stale infrastructure that predates this rollout's
  `attachCentralErrorHandler` convention. It had gone unnoticed because none
  of that file's `/login`-hitting tests exercised a thrown-error branch
  until this batch's `/mfa/verify` conversion was the first to route a
  legitimately-thrown `EmailNotVerifiedError` (403) through it, at which
  point the stale handler flattened it to a wrong 500 and a real test
  (`"mfa verification refuses to issue session when user becomes
  unverified"`) failed. Fixed by replacing the local handler with the
  shared `attachCentralErrorHandler` from `tests/helpers/testPool.js` — the
  same fixture already used throughout this whole rollout — rather than
  patching the ad hoc one in place. Full suite via `npm run test:all`:
  **1631/1631 passing** (plus 3/3 ASVS controls). Phase 4 reaches **5/5**;
  this closes the last of the ten `[~]` half-credit items from the original
  batch of ten identified at the start of this PR sequence.
- [x] Client-facing error envelopes normalized — with 38 of 40 route files now on
  `asyncRoute`/`ApiError` (see the rollout item above), the central handler's
  `{ error: message }` shape (plus `requestId` on 500s) is the de facto
  repo-wide standard now, not just a route-file-local mapping. Grepped every
  `routes/*.js` file for any remaining non-`{error}` shaped response and
  checked each hit individually rather than assuming they're all leftover
  gaps: the `{ ok: false, status, error }`/`{ ok: false }` shapes in
  `email.routes.js`, `supportEmail.routes.js`, and `plaid.routes.js` are all
  server-to-server webhook responses, not client-facing (Plaid's was already
  an accepted exception as of PR 34); `internalSupport.routes.js`'s
  `{ ok: false, message }` is that route file's own internal-tooling API
  surface (gated by the shared secret above), a different consumer from the
  V3 browser client, and internally consistent with its own `{ ok: true,
  item }` success shape throughout. **Known, narrow exception, left alone**:
  `businesses.routes.js`'s `POST /provision-add-on` (Stripe-subscription
  business provisioning, wrapped in a real DB transaction with Stripe
  compensation on failure) still returns `{ success: false/true, error }`
  instead of the standard shape. No V3 frontend caller was found for this
  route (grepped `frontend-v3/src` for the path), so its actual usage is
  unverified; reshaping a route with live billing-compensation logic and an
  unconfirmed caller isn't a safe "while we're here" edit, so it's flagged
  here rather than touched.
- [x] V2 CRUD routes no longer misclassify bad-ID/validation as 500 (`32210ac6`,
  `0e3fc909`)
- [x] Repeated validation helpers shared where duplication is real (`f4c0e99f` — v2 UUID
  validation)
- [x] Representative tests for error status/code/message — 7 dedicated
  `tests/*RouteErrors.test.js` files now exist (`accountsRouteErrors`,
  `analyticsRouteErrors`, `businessRouteErrors`, `capitalAssetsRouteErrors`,
  `categoriesRouteErrors`, `v2RouteErrors`, `vehicleClaimsRouteErrors`), plus
  every other route conversion PR in this rollout added its own status/
  message assertions inline. 21 test files assert on a response's `.code`
  field specifically (e.g. the `accounting_period_locked` extra-fields case).
  This is a natural byproduct of the `asyncRoute`/`ApiError` rollout, not a
  separate effort — as that rollout's route-file count climbs, so does this
  coverage, and it's already broad enough across enough different route
  families (V1 CRUD, V2 CRUD, business logic, complex domain errors) to call
  representative.

## Phase 5 - Database Invariants And Multi-Tenant Boundaries — 5 / 5
- [x] `CHECK` constraint for subscription `plan_code`/`status` (`e7e14acb`)
- [x] `CHECK` constraint for `transactions.review_status` (`01cd219c`)
- [x] Cross-business child relationships enforced (`e018b6eb`, `56624845`, `6f9d4477`) —
  **correction to this file's own earlier scoring**: `e018b6eb` was credited `[x]`
  (full) when it landed, but it had a real regression that independent re-verification
  missed. It added composite FKs (`(transaction_id, business_id)` etc.) on
  `support_artifacts`, `transaction_review_states`, and `vehicle_expense_details`
  without specifying `ON DELETE`, which defaults to `NO ACTION` — strictly more
  restrictive than the original single-column FKs on the same tables (`ON DELETE SET
  NULL` for `support_artifacts`, `ON DELETE CASCADE` for the other two, per
  `20260523_add_vehicle_claim_fields.sql`/`20260523_create_cpa_export_state.sql`).
  Net effect: deleting a transaction with any linked support artifact, review state,
  or vehicle expense detail row would have started failing with an FK violation
  instead of cascading/nulling the way it always had. Fixed directly on `main`
  (`56624845`, outside this PR sequence) with a follow-up migration that drops and
  re-adds each composite FK with its original `ON DELETE` action restored — verified
  against the original single-column definitions, not guessed. `6f9d4477` adds
  `scripts/check-child-business-fk-readiness.js` (`npm run db:child-fk-readiness`), a
  read-only report on whether each `NOT VALID` composite constraint is safe to
  `VALIDATE` yet (existence, validated status, live violation count + sample rows) —
  directly answers Pass 24's suggested "backfill/validate with a query that detects
  mismatched child business IDs before adding constraints." Both have test coverage
  (`migrationFiles.test.js`, `childBusinessFkReadinessScript.test.js`). Still `[x]`:
  the underlying constraints are correctly in place and now correctly configured: the
  earlier credit was right about the destination, wrong about a step along the way,
  and that step has since been corrected.
- [x] Account type/currency assumptions reviewed for closed-set constraints.
  - **Account type**: fixed by adding a separate constrained `accounts.account_category`
    column instead of constraining overloaded provider detail in `accounts.type`.
    Manual account writes, onboarding starter-account writes, and Plaid account seeding
    now populate `account_category`; Plaid still preserves raw subtype/type detail in
    `type` and `account_subtype`. The database enforces
    `account_category IN ('checking', 'savings', 'credit_card', 'cash', 'loan',
    'custom')`, so the app has a closed category invariant without rejecting real
    Plaid subtypes such as `money market`, `mortgage`, `student`, `depository`, or
    `brokerage`. V3 account mapping now prefers `account_category` when present and
    falls back to legacy `type` for old responses.
  - **Currency**: found and fixed the one concrete, safe-to-fix piece.
    `routes/transactions.routes.js`'s `normalizeCurrencyCode` validated shape only
    (`/^[A-Z]{3}$/`), so a garbage code like `"ZZZ"` or `"ABC"` — not a real currency,
    just three letters — passed straight through and got stored, instead of falling
    back to the business's real currency the way malformed/missing input already did.
    Fixed by checking membership in `Intl.supportedValuesOf("currency")` (Node 18+,
    available in this repo's `node:20-bookworm-slim` runtime) instead of the shape-only
    regex — same fallback contract, same function signature, still accepts every real
    ISO-4217 code (doesn't narrow the product to USD/CAD-only, which would have been
    a scope decision, not a bug fix). Grepped the rest of the backend for other
    currency-shape validators first — this was the only one; billing's
    `normalizeCurrency` (`services/billingInputValidationService.js`) already uses a
    real closed `Set` of `usd`/`cad`, so it wasn't affected. Added
    `normalizeCurrencyCode` to `transactions.routes.js`'s existing `__private` test
    export (already used for 3 other pure helpers) and added
    `tests/transactionCurrencyNormalization.test.js` (4 tests, including a named
    regression case for the exact `"ZZZ"` bug) — this function had no direct test
    coverage before. Full suite unaffected.
- [x] Migration tests for new invariants (`c44d08b1` guards destructive migrations;
  `migrationFiles.test.js` now also verifies the account-category invariant migration)

## Phase 6 - Product Truth And Legacy/Static Cleanup — 5 / 5
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
- [x] Inventory of active `public/js`/static HTML paths still directly serveable
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

  Completion pass: re-ran the suspicious filename inventory against tracked
  active source/public paths and confirmed no active `public/js`, `public/css`,
  `routes`, `services`, or `middleware` file remains with `-v2`, `patch`,
  `override`, `bridge`, `temporary`, `temp`, `legacy`, `old`, or `sidecar`
  naming. The one remaining `landing-faqs-v2.js` asset was only referenced by
  archived legacy HTML, so it was moved from runtime-served `public/js/` into
  `legacy/public-html/js/` beside the archived page that references it.
- [x] Old auth scripts / V2 placeholders quarantined or removed
  - Verified the previously listed sidecar files are absent from tracked active
    source: `transaction-undo-button.js`, `transaction-checkbox-actions.js`,
    `transaction-checkbox-actions-v2.js`, `billing-checkout-overrides.routes.js`,
    `subscriptionTrialCheckoutPatch.js`, `theme-boot.js`,
    `accountSwitchMfaTrust.js`, `global-patches.js`, and
    `quick-add-entitlements.js`.
  - Removed the V3 `PlaceholderPage` fallback and replaced the page renderer
    with an exhaustive switch. New V3 page additions now fail TypeScript if
    they are not wired to a real page component, instead of falling through to
    placeholder copy.
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

## Phase 7 - Route And Service Decomposition — 4 / 4
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
- [x] SQL-shape/parameter tests — added for transaction list filters/where-clause,
  mileage's `date`/`trip_date` column-mode selection (`mileageQueryService.js`, 9
  tests), tax-region column selection (`taxSummaryService.js`), and usage-limit
  threshold claims (`usageLimitEmailService.js`). The tax-summary tests now prove US,
  CA, and hostile region text can only choose the closed `tax_map_us`/`tax_map_ca`
  fragments in SELECT/GROUP/ORDER/filter positions. The usage-limit tests now prove
  threshold-claim SQL updates only configured columns, guards on the highest crossed
  threshold, and sends copy for the highest newly crossed threshold.

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

**Third pass, same reasoning, more caution given real financial risk**:
`routes/billing.routes.js` (1,981 lines) is Stripe/payment code — a wrong
extraction here has a different consequence class than a wrong extraction in
static-asset cleanup or even auth (money moving incorrectly, not just a bug).
Read all 60 of its top-level functions before choosing anything, and scoped
this pass narrower than the auth one on purpose: only the input
normalization/validation group, not the Stripe-object-shape functions
(`parseStripeUnitAmount`, `getStripeProductIdFromPrice`,
`assertStripePriceMatchesBillingInterval`, etc.) which need their exact
Stripe API assumptions verified more carefully first, and not
`verifyWebhookSignature` (calls the Stripe SDK's signature verification
directly — core security surface, stays put). Extracted 12 pure functions
plus the `BillingValidationError` class they throw (billing interval/currency
normalization and validation, additional-business-count bounds checking,
internal-return-path sanitization against protocol-relative/CRLF injection,
checkout-return-path building, trial-reupgrade detection, US/Canada country
and currency resolution) into `services/billingInputValidationService.js`,
with 11 new direct unit tests — none of these had any direct test coverage
before, only indirect coverage through 7 HTTP-level billing test files.
`BillingValidationError` moved with its throwers since it's the connective
tissue between them and the route-level `catch` blocks that check
`err instanceof BillingValidationError`; the route file imports it back for
those. Route file: 1,981 → 1,864 lines. Full billing-adjacent HTTP suite (169
tests across 7 files, including the real Stripe checkout/webhook/portal
flows) passes unchanged.

**Fourth pass, same reasoning**: `routes/exports.routes.js` (1,783 lines) was
next up once auth/transactions/billing were done. Read all 14 of its
top-level functions before choosing anything; extracted the 9 that are pure
or near-pure (date-range/tax-ID validation, secure-export tax ID decryption
and format-checking, export metadata row building, CRA Quick Method supply
type inference from ledger data, PDF report ID and CSV filename generation,
export-artifact ID collection, export history row normalization) into
`services/exportRequestService.js`, along with the `DATE_PATTERN`,
`SSN_RE`/`EIN_RE`/`SIN_RE`/`BN_RE` constants they depend on. `DATE_PATTERN` is
also used by two route handlers outside the extraction, so it's re-exported
and imported back; `SUPPORTED_EXPORT_TYPES` wasn't used by anything moved, so
it stays untouched in the route file. Left everything DB-touching in place:
the `requireEmailVerified` middleware, `fetchUserDisplayName`,
`fetchExportSourceRows` (the large multi-table export data fetch),
`storeCompletedExport`, and `persistSnapshotBestEffort`. The now-unused
`decryptJwe` import was removed from the route file (still used indirectly
through the new service). Added 18 new direct unit tests — none of these 9
functions had any direct test coverage before, only indirect coverage
through 6 HTTP-level export test files; testing `resolveSecureExportTaxId`'s
decrypt-success and invalid-decrypted-format branches required a
`Module._load` mock for `jweDecryptService.js` (the same pattern the existing
`exportsRegression.test.js` already uses to mock that module at the
HTTP-request level). All 18 passed on the first run. Route file:
1,783 → 1,615 lines. Full export-adjacent HTTP suite (198 tests across 6
files) passes unchanged; full backend suite went from 1,328 to 1,346 tests
(the 18 new ones), same 1 pre-existing unrelated failure as always.

**Fifth pass, plus a real dedup**: `routes/businesses.routes.js`
(1,383 lines) is the same risk class as billing — Stripe subscription slot
management and business deletion, real money and real data-loss
consequences. Read all 27 top-level functions before choosing anything.
Extracted 9 pure/near-pure functions into `services/businessProfileService.js`
(`buildAppUrl`, `normalizeBillingCurrency`, `normalizeBillingInterval`,
`normalizeOptionalBillingInterval`, `normalizeOptionalCurrency`,
`formatBillingCurrencyAmount`, `normalizeBusinessPayload`,
`normalizeOptionalTrimmedString`, `normalizeBusinessProfileRow`,
`buildBusinessLimitError`) — all ten are re-imported back since the route
file's remaining handlers still call them. Left every Stripe-object-shape
function in place (`getStripeBaseItem`, `getStripeAddonItem`,
`resolveStripeAdditionalBusinesses`, `resolveStripeSubscriptionBillingTerms`,
`resolveAddonPriceIdForTerms`) and every DB/Stripe-API-touching function
(`buildVerifiedPricingTable`, `sendBusinessLifecycleEmail`,
`syncStripeSubscriptionForBusinessInTransaction`,
`setStripeBusinessSlotState`, `applyStripeBusinessSlotState`,
`migrateBillingAnchorSubscription`, `fetchOwnedBusinessProfile`,
`updateOwnedBusinessProfile`) — same caution as the billing pass, for the
same reason.

Along the way, found a genuine byte-identical duplicate: `parseStripeUnitAmount`
existed verbatim in both `billing.routes.js` and `businesses.routes.js`, not
a "looks similar" judgment call like the ones deliberately left alone
earlier in this effort — actually the same function, copy-pasted. Moved it
into the already-shared `services/stripePriceConfig.js` (both route files
already imported other things from it) and had both route files import the
one copy instead. This surfaced a real gap while re-running tests: one
existing test file (`businessLifecycleNotifications.test.js`) mocks
`stripePriceConfig.js` via `Module._load` and its mock didn't have
`parseStripeUnitAmount`, so two tests were silently swallowing a
`TypeError` inside `sendBusinessLifecycleEmail`'s catch-all and asserting
"0 emails sent" was actually 1 — fixed by adding the missing export to the
test's mock. Added 16 new direct unit tests across
`businessProfileService.test.js` and a new `stripePriceConfig.test.js`
(covering `parseStripeUnitAmount`, which also had zero direct coverage
before), all passing on the first run. Route file: 1,383 → 1,266 lines
(plus `billing.routes.js` loses its 8-line duplicate). Full
business/billing-adjacent HTTP suite (226 tests across 12 files) passes
unchanged. Full backend suite: **1,363/1,363 passing** — the first fully
green full-suite run in this entire remediation effort (see also the
standalone `fix/backslash-path-traversal-basename` PR that fixed the one
test that had been failing identically since PR 13).

## Phase 8 - V3 React Cleanup — 7 / 7
- [x] Internal path normalization shared for nav/`redirect_to` (`6960331b`, `normalizeLegacyAppV3Path`)
- [x] Large controller pages split by workflow (`Transactions` recurring/review, `Settings` data, `Messages` data workflow)
- [x] API/data orchestration moved into hooks/clients where it reduces local state (`useTransactionsPageData`, `useMessagesPageData`)
- [x] DOM-mutation i18n pattern confined/replaced (`useV3PhraseTranslations`)
- [x] Modal focus/body-scroll handling consolidated (`useBodyModalLock`)
- [x] Hard reloads replaced with state updates where SPA behavior expected
- [x] `PlanGate` usage normalized against backend feature keys

## Phase 9 - Integrations, Idempotency, Side Effects — 5 / 5
- [x] Stripe mutation idempotency keys reviewed beyond checkout, correctly this time. The
  earlier pass (below) had only checked that `buildStripeMutationIdempotencyKey` was
  *used* on cancel/resume/switch/additional-businesses, not that its output was actually
  correct — and it wasn't: the key was built purely from the operation name, business
  scope, and *desired end-state* (e.g. `subscription-cancel` + businessId +
  `cancel_at_period_end:true`), with no per-attempt component at all. That means cancel,
  then resume, then cancel again produced the *exact same key* for both cancel calls,
  since the desired state is identical both times — Stripe would have silently replayed
  the first cancel's cached response for the second one instead of actually performing
  it. Same bug for "set additional businesses to 2" repeated after an intervening change,
  and for repeating an interval switch later. Fixed by having the four affected routes
  (`POST /cancel`, `POST /customer-portal/cancel`, `POST /resume`, `PATCH
  /additional-businesses`) require a client-supplied `mutationAttemptId` (a fresh UUID
  per user-initiated action, mirroring `checkoutAttemptId`'s existing, already-correct
  pattern on `POST /checkout-session`) and fold it into the key. A genuine retry of the
  same attempt (same UUID) still reuses the same key; a later legitimate operation
  reaching the same desired state gets a new UUID and a new key. `tests/stripeMutationIdempotency.test.js`
  (new, 6 tests) proves this directly for all three named scenarios — cancel → resume →
  cancel, additional businesses 2 → 1 → 2, and a repeated interval switch — plus retry-key
  reuse and 400s for a missing/malformed attempt id. `customer-create` and
  `portal-configuration`'s existing desired-state-hash keys were left untouched since
  those two are correctly supposed to be idempotent forever (never create two Stripe
  customers or two portal configs for the same underlying resource) — the bug was
  specific to the four *mutation* routes, not the design of `buildStripeMutationIdempotencyKey` itself.
- [x] Durable dedupe/outbox behavior for important emails, with a real identity gap
  closed. The earlier pass (below) verified `email_delivery_dedupe` was *wired into*
  export-generated/failed emails, but not that its dedupe key actually identified the
  right thing: `sendExportGeneratedEmail`/`sendExportFailedEmail` keyed only on
  business/recipient/type/date-range, with no reference to *which* export. Two separate
  exports for the identical date range (a legitimate, expected user action) collided on
  the same key, so the second export's email was silently swallowed as a false
  duplicate. Fixed by threading the real per-operation identity through: `exportId` (from
  `storeCompletedExport`, which mints a fresh id per successful generation — never
  idempotent by content, so it's a genuine per-export identity) for the generated-email
  case, and an `exportAttemptId` for the failed-email case, since a failed generation
  never gets a stored id — the grant-based flow uses the grant's own single-use `jti`
  (already threaded elsewhere in that same code as `grantJti`), and the direct
  `secure-export` flow mints a fresh UUID once per request. `tests/exportEmailService.test.js`
  gained 4 tests proving two separate exports/attempts each get their own email while a
  retried identical operation is still suppressed. Separately, `email_delivery_dedupe`
  itself had a real reclaim gap unrelated to the key content: a row that crashed between
  `reserveEmailDelivery` and `markEmailDeliverySent`/`Failed` stayed `'reserved'` forever
  — the `ON CONFLICT ... WHERE status = 'failed'` clause only ever reclaimed `'failed'`
  rows, never a stuck `'reserved'` one, so every future genuine send attempt at that exact
  key would silently no-op indefinitely. Fixed with a 15-minute stale-reservation timeout
  added to the same `WHERE` clause (`status = 'reserved' AND updated_at` older than the
  timeout, parameterized rather than string-interpolated); `'sent'` rows are never matched
  by either branch and stay protected regardless of age, and `'failed'` rows keep their
  existing immediate-retry behavior unchanged. `tests/emailDeliveryDedupeService.test.js`
  gained 5 tests (stale reservation reclaimed, fresh reservation not stolen, sent rows
  protected indefinitely even 30 days later, failed rows still immediately retryable, and
  a direct assertion on the query text/params actually carrying the new timeout).
  Incidentally, while adding the `exportId`/`exportAttemptId` plumbing, found and fixed an
  unrelated pre-existing bug in the same file: `routes/exports.routes.js`'s
  `POST /secure-export` declared `user`/`businessId` with `const` *inside* its `try`
  block but referenced both in the `catch` block below it — invalid JS scoping that threw
  a `ReferenceError` on every genuine failure of that route (verified with a standalone
  repro), meaning the route's own failure-reporting (and the "export failed" email this
  PR was adding coverage for) had never actually run; the request would just hang instead
  of returning a response. Fixed by hoisting both declarations above the `try`. (Original
  pass, retained for history: `email_delivery_dedupe` covers billing lifecycle, invoice
  owner-activity, and export generated/failed emails, including the inbound-reply webhook
  path whose only prior replay guard was a 5-minute in-memory `svix-id` cache that doesn't
  survive redelivery outside that window or multiple app instances; `emailReminderService`'s
  three reminder flows — trial lifecycle, review-queue, cancellation-ending-soon — claim
  atomically via `business_email_reminders`' `(business_id, reminder_key)` unique
  constraint before sending, closing the cron-overlap double-send race.)
- [x] Plaid partial-failure/cursor/retry behavior hardened (row-level failures and unknown accounts mark the batch partial, keep the prior cursor, and surface connection error state)
- [x] Export/receipt cleanup paths made explicit and testable (export history deletion commits DB cleanup before best-effort file cleanup and returns cleanup status; receipt delete pending-rename path rechecked)
- [x] Required vs. best-effort side effects separated (completed export generation no longer fails or waits on audit/email side effects; failures are logged)

## Phase 10 - Documentation And Final Stabilization — 4 / 4
- [x] Source-of-truth docs updated to match code — two background-agent audits (one
  over `Work-Review`/`Work-To-Do`/`Work-Completed`, one over `Docs/`) found concrete
  drift, each independently spot-verified against real code before acting. Fixed:
  `Docs/DEPLOYMENT.md` (4 wrong defaults/paths: `JWT_EXPIRY_SECONDS`,
  `EXPORT_GRANT_TTL_MS`, `receiptStorage.configured` health field name, dead
  `/html/subscription.html` reference), `Docs/ACCOUNTING_TRUST_RULES.md` (wrong GDPR
  export route in two sections, stale "restore not supported" claim — restore is real,
  via `POST /api/transactions/undo-delete`), `Docs/BACKUP-RESTORE.md` (wrong
  `receiptStorage` mode value), `Docs/MAINTENANCE-SCRIPTS.md` (removed a subsection
  describing a root `scripts/log_scan.js` that doesn't exist), `Docs/API_ROUTE_INVENTORY.md`
  (added the 2 routes registered directly on `routes/index.js` that weren't in the
  mount-prefix table: `GET /api/arap-summary`, `GET /api/exports/history`, plus a
  Windows-path link fix), `Docs/CPA_CODEBASE_AUDIT_MATRIX.md` (dead pre-V3 frontend
  paths corrected to their `legacy/public-html/` archive locations),
  `Docs/PRODUCT-BACKLOG.md` and `Docs/REPO-GOVERNANCE.md` (dead `public/js`/`public/html`
  "files to audit" / owner-map paths replaced with the real `frontend-v3/` files).
  Two severely-stale specs (`Docs/STYLE_SPEC.md`'s exact color/radius token values,
  `Docs/CPA_EXPORT_DATASET_SPEC.md`'s exact field-level dataset shape) were judged too
  large to safely rewrite byte-accurate in this pass — each got an explicit staleness
  banner naming the concrete drift and pointing at the real source (the CSS file / the
  `exportDatasetService.js` function) instead of silently leaving them looking current.
- [x] Stale `Work-*` docs contradicting runtime behavior removed/archived — moved to
  `Work-Completed/` with a "STATUS: DONE" banner explaining the specific contradiction:
  `CRITICAL_SWEEP.md`, `CURRENT_LAUNCH_BLOCKERS_2026-06-07.md` (pre-V3-migration
  frontend described as current), `SECURITY-LEGAL-READINESS-US-CANADA.md`
  (self-contradicting closing verdict), `OWNER-FILE-FOLLOWUP-WORK.md` and
  `UX-FUNNEL-AND-SETTINGS-IMPROVEMENTS.md` (100%-complete checklists), and two
  frontend-cleanup plans (`UNFINISHED-CLEANUP-WORK.md`,
  `IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md`) whose entire premise — consolidating
  sidecar files in the pre-V3 vanilla frontend — is moot now that frontend is archived
  dead code, not an actively developed surface. `WORK-TO-DO-STATUS.md`, a 2026-05-22
  point-in-time snapshot that was itself out of date about where several of these files
  now live, moved the same way. `Docs/SECURITY_AUDIT_2026-06-10.md` moved to
  `Work-Review/` (per this repo's own Docs-vs-Work-Review placement rule for
  audit/findings documents) with a banner flagging its stale legacy-frontend findings.
  `Work-Review/MUTATION_AUDIT.md`, a near-duplicate of `Docs/ACCOUNTING_TRUST_RULES.md`,
  got a "duplicate, not canonical" banner rather than a silent second copy of the fix.
  `Work-To-Do/TERMS-OF-SERVICE-REVIEW-2026-05-20.md` was re-verified against the current
  `frontend-v3/src/pages/Terms.tsx` and correctly left open — its flagged gaps are real
  and unresolved.
- [x] Concise architecture notes added — `Docs/AUTHENTICATION.md` gained a "Backend
  Session Model" section (cookie policy, password hashing, MFA design,
  `asyncRoute`/`ApiError`, rate limiting); new `Docs/STARTUP_AND_MIGRATIONS.md` (boot
  order, migration runner, checksum-drift safety, retry behavior); new
  `Docs/PAID_FEATURE_ENFORCEMENT.md` covers both the primary catalog/bridge/route
  gating system and the separate, older `requireV2BusinessEnabled`/
  `requireV2Entitlement` gate found while auditing the route inventory (previously
  undocumented). `Docs/README.md` gained an "Architecture notes" index linking all six
  architecture docs (the three above plus the pre-existing `V3_ROUTE_INVENTORY.md`,
  `DYNAMIC_SQL_RULES.md`, `API_ROUTE_INVENTORY.md`).
- [x] Final targeted file inventory confirming no review-only/generated artifacts were
  promoted into runtime — checked for `.orig`/`.bak`/`.tmp`/`.rej` stray files, dated
  recovery folders, stray root-level `.md` files, and untracked files at the end of the
  pass (clean: only the two new architecture docs above were untracked, both
  intentional). `.gitignore` coverage for `test-results/`/`storage/`/logs re-confirmed.

## Phase 11 - Independent Code-Only Review (2026-08-18): Critical And High Severity — 11.5 / 12

Found by a fresh, code-only review after Phase 10 closed: five parallel background
agents each read one slice of the codebase in full (`routes/`, `services/`,
backend infra/plumbing, frontend `pages/`+`components/`, frontend `lib/`+`hooks/`),
explicitly barred from reading any `.md` doc so findings weren't just a rehash of prior
audits. Every item below was independently re-verified against real code (not just
trusted from the agent's report) before being added here — including one correction to
an agent's own claim (item 4: the agent said "every PDF a customer downloads is
invalid"; tracing the actual call chain showed the fake-PDF code path is dead/unreached,
not live — the real bug is a required-but-unused microservice, not broken customer
exports).

- [x] `services/projectService.js` and `services/billableExpenseService.js` call
  `db.any()`/`db.one()`/`db.oneOrNone()`/`db.result()` — a pg-promise API `db.js` does
  not implement (it exports a plain `pg.Pool` as `pool`, no such methods on the module
  itself). Every function in both services threw `TypeError` on every call. Confirmed
  wired into live, mounted routes (`routes/projects.routes.js`,
  `routes/billable-expenses.routes.js`, gated behind `ENABLE_V2_BUSINESS`) — the entire
  Projects and Billable Expenses feature area was 100% non-functional whenever that flag
  is on. **Fixed**: switched both files to `const { pool } = require('../db'); pool.query(...)`,
  the working pattern used elsewhere in this codebase. While fixing this, found the exact
  same bug in `services/vendorService.js`, `customerService.js`, `invoiceService.js`,
  `services/billService.js`, and `services/arApService.js` — all five called
  `db.query(...)` on the same non-existent method, so the entire V2/Business tier
  (Vendors, Customers, Invoices, Bills, AR/AP summary) was equally broken, not just
  Projects/Billable Expenses as originally scoped. Fixed all five the same way. New
  `tests/v2BusinessCrudServices.test.js` (8 tests) proves every function in all 7
  services now reaches `pool.query` — confirmed regression-proving by reverting the fix
  and re-running: all 8 fail with the original `TypeError` on the old code.
- [x] `services/pdfGeneratorService.js`'s `buildFooterText()` calls `maskTaxId(taxId)`
  unconditionally, ignoring the `isSecure` flag, so the "Redacted Export" variant still
  printed the first 5 characters of the real SSN/EIN on every page footer. **Fixed**:
  footer now shows `"Withheld"` when `!isSecure`, matching the identity page's own
  existing redaction convention.
- [x] Same file: `buildVehicleAuditSchedule` and `buildCapitalAssetSchedule` use `return`
  inside a `.forEach()` callback when a page fills up — this only skips one iteration,
  not the whole loop, so once a page fills, every remaining vehicle claim / capital
  asset was silently dropped from the CPA audit schedule instead of flowing to a new
  page, while the footer kept being redrawn at the same position for each dropped row.
  **Fixed**: both functions now paginate for real, chunking rows and rendering one
  `PdfCanvas` per page (mirroring this same file's own working `buildUnresolvedExceptionPages`
  pattern), with totals/notes only drawn on the last page. Also found and removed:
  `buildVehicleAuditSchedule` and `buildQuickMethodRemittancePage` were each declared
  *twice* in this file — function-declaration hoisting meant the second (buggy, for the
  vehicle schedule) declaration silently won and the first was 100% dead code; deleted
  the dead duplicates and kept the real content from whichever copy was live/current.
  Also removed a stray, nonsensical "Run VALIDATE CONSTRAINT after data cleanup..."
  engineering comment that had been shipping as customer-facing PDF content. New
  `tests/pdfGeneratorAuditSchedules.test.js` (6 tests, exported via `__private`) proves
  the tax-ID redaction and real pagination (60 claims → multiple pages, every claim's
  description present somewhere in the output, totals only on the last page) —
  confirmed regression-proving the same way (all 6 fail against the pre-fix code).
- [x] `pdf-worker/` is a deployed, CI-tested microservice that `services/envValidationService.js`
  required via `PDF_WORKER_URL`/`PDF_WORKER_SECRET` in production, with a comment
  claiming exports fail without it — but `pdfWorkerClient.js`'s `dispatchPdfJob` (the
  only caller of the worker) is never invoked anywhere in `routes/` or `services/`;
  `routes/exports.routes.js` calls `pdfGeneratorService.js`'s in-process
  `generatePdfExportPair` directly instead. **Fixed the misleading-required-env part**:
  moved `PDF_WORKER_URL`/`PDF_WORKER_SECRET` from the production-required tier to
  `OPTIONAL_FEATURE_ENV_VARIABLES` with an honest reason string, updated
  `Docs/PRODUCTION-READINESS.md`'s mirrored table and `tests/envValidationService.test.js`
  to match. **Also fixed two real security bugs in the worker itself** (since it's still
  a deployed, reachable service even though unreferenced by this app today): `getRemoteIp()`
  now only trusts `X-Forwarded-For` when an explicit `PDF_WORKER_TRUSTED_PROXY_HOPS` env
  var configures how many trusted hops are in front of it (default 0 = raw socket address
  only, closing the trivial IP-spoofing bypass), and the worker-token comparison now uses
  `crypto.timingSafeEqual` instead of `!==`, matching this codebase's own convention
  elsewhere (`middleware/requireSupportSecret.js`). **Not fixed**: `buildPdfContent()`
  still doesn't produce a real PDF (plain UTF-8 text, no PDF object structure) — left
  as-is since the function is confirmed dead code with no live caller; rewriting a fake
  PDF generator that nothing calls wasn't judged worth the risk/effort in this pass.
- [x] `frontend-v3/src/pages/Exports.tsx`'s "Custom" date-range preset button had no
  `onClick` handler at all — a dead, clickable-looking control — and the
  `className="is-selected"` preset highlight was hardcoded onto the "YTD" button, so it
  never moved when "Last tax year" or "Q1" was clicked instead. **Fixed**: added a
  `datePreset` state that all three preset buttons and the "Custom" button set on click
  (and that manually editing the Start/End date inputs also flips to `'custom'`), with
  the `is-selected` class now driven by that state instead of hardcoded.
- [x] `frontend-v3/src/pages/Invoices.tsx`'s `formatMoney()` normalizes any currency
  that isn't `'CAD'` to `'USD'`, but the invoice currency `<select>` offers
  USD/CAD/EUR/GBP/AUD — an invoice created in EUR/GBP/AUD silently displayed its
  subtotal/tax/total with a `$` symbol instead of the real currency. **Fixed** as part of
  a new shared `frontend-v3/src/lib/money.ts` (see the next two items and Phase 13's
  first item) — the shared `formatMoney` passes any valid ISO 4217 currency code through
  to `Intl`/`toLocaleString` as-is instead of collapsing non-CAD codes to USD.
- [x] `frontend-v3/src/components/transactions/RecurringTemplatesWorkflow.tsx`'s
  `getActiveCurrency()` was hardcoded to `return 'USD'` unconditionally, unlike every
  other page's identically-named helper (which reads the business's real currency off
  `window.__LUNA_ME__`) — recurring template amounts always showed `$` even for CAD
  businesses. **Fixed**: removed the local hardcoded copy entirely; now imports
  `formatMoney` from the new shared `lib/money.ts`, which resolves the real business
  currency.
- [x] `routes/exports.routes.js`'s `/secure-export` re-implemented the entire ~10-table
  compliance dataset query, category/support-artifact/vehicle-claim map building, and
  GST/HST Quick/Regular Method + home-office worksheet computation independently,
  instead of reusing the shared `fetchExportSourceRows()` helper that `/generate`
  already used. **Fixed**: `/secure-export` now calls `fetchExportSourceRows()` and a new
  shared `computeComplianceSchedules()` helper (extracted from the duplicated
  Quick/Regular Method + home-office blocks) instead of its own fork.
  `fetchExportSourceRows()` gained an `options` parameter so each caller can reproduce
  its own pre-existing, genuinely-different behavior exactly rather than silently picking
  one: `/generate` selects extended transaction fields (`description_encrypted`,
  `exchange_date`, `converted_amount`, `review_notes`) and reviewer-join columns that
  `/secure-export` never selected, includes the business `id` in metadata where
  `/secure-export` didn't, and fails hard (500) on a `vehicle_costs` query error where
  `/secure-export` has always tolerated that failure — all four differences were found,
  preserved exactly as they were, and are not part of what's now shared. Two new
  regression tests in `tests/exportsRegression.test.js` (35 total, all passing) prove
  `/secure-export` now goes through the shared pipeline and still tolerates the
  `vehicle_costs` failure the same way it always did.
- [x] `routes/email.routes.js` and `routes/supportEmail.routes.js` independently
  implemented ~200 near-identical lines of HMAC/Svix signature verification and
  replay-protection (`verifySvixSignature`, `timingSafeHexEqual`, the whole
  verify-request function, etc.) — and the two copies had already drifted:
  `email.routes.js` accepted multiple comma-separated secrets for key rotation;
  `supportEmail.routes.js` only checked a single secret. **Fixed**: extracted the shared
  logic into new `services/inboundWebhookVerificationService.js`
  (`resolveWebhookSecrets`/`createInboundWebhookVerifier` plus the individual
  timing-safe/signature helpers), with per-route error-message overrides so each route's
  existing user-facing text is unchanged. Both routes now support multi-secret rotation —
  `supportEmail.routes.js` gains the capability it was missing. New
  `tests/inboundWebhookVerificationService.test.js` (29 tests) covers every extracted
  helper plus route-level proof that multi-secret rotation now works identically on both
  routes; all pre-existing webhook tests for both routes still pass unmodified (52/52
  total across the touched test files).
- [x] `routes/me.routes.js`'s `DELETE /` (account deletion) leaked internal
  deployment/schema state to the authenticated caller on error: a pre-flight check
  returned the literal migration filename (`045_drop_cpa_audit_user_fks.sql`) in the JSON
  error body if that migration hadn't been applied, and the catch-all fallback for the
  same condition returned `` `Database error code: ${err.code}` `` directly to the client
  on any other unexpected failure. **Fixed**: both paths now return a generic
  `"Failed to delete account. Please try again later."` to the client; the same detail
  that used to leak is still captured server-side via the route's existing `logError`
  call, so nothing was lost for debugging. Updated `tests/accountDeletion.test.js`'s
  three affected tests to assert the leak is gone instead of asserting it was present.
- [x] `frontend-v3/src/lib/transactionsApi.ts`'s `resolveEstimatedTaxProfile`/
  `estimatedCanadianRate` hardcoded a flat 28% US rate and a per-province Canadian rate
  table client-side, which `pages/Transactions.tsx` multiplied against a page-local
  net-total to show an "estimated tax" figure — independent of, and inconsistent with,
  the backend's real `se_tax_estimate` already surfaced via `lib/analyticsApi.ts` and
  shown on Analytics/Dashboard. **Fixed**: added `loadTaxSetAside()` to `analyticsApi.ts`
  (fetches just `se_tax_estimate` without the extra cash-flow request `loadAnalytics()`
  also makes), wired it into `useTransactionsPageData`, and Transactions.tsx now displays
  that real backend value directly instead of computing its own. `resolveEstimatedTaxProfile`
  was simplified to only derive the display label (e.g. "ON tax estimate") — the
  fabricated `rate`/`note` fields and the `estimatedCanadianRate` table were deleted
  entirely. Updated two tests (`frontendV3ApiContracts.test.js`,
  `frontendV3Wiring.test.js`) that had been pinning the old hardcoded-rate behavior as
  expected — one of them literally asserted the exact per-province rates as correct,
  which was pinning the bug itself; both now assert the new backend-sourced behavior.
- [~] `services/vendorService.js`, `customerService.js`, `invoiceService.js`, and
  `services/billService.js` hard-`DELETE ... RETURNING id` financial records with no
  amount/currency/length validation before insert and no audit trail — unlike the
  careful soft-delete + `audit_events` + accounting-lock-check pattern
  (`transactionAuditService.js`, `accountingLockService.js`) used everywhere else in the
  app for transactions. **Validation fixed**: new `services/v2BusinessValidationService.js`
  (`V2BusinessValidationError`, 400-status, following the existing
  `BillingValidationError` convention) validates required fields, UUID shape, amounts
  (finite/non-negative/bounded), currency codes, dates, and status enums in all four
  services' create/update paths; `routes/*.routes.js` for all four need no changes since
  `asyncRoute` already forwards the new error type to the central handler as a 400. New
  `tests/v2BusinessValidationService.test.js` (28 tests) and
  `tests/v2BusinessServicesValidationAndDelete.test.js` prove invalid input is rejected
  before any query runs. **Audit-trail/soft-delete half deliberately NOT done**: checked
  `db/migrations/20260419_create_v2_business_tables.sql` — `vendors`/`customers`/`bills`/
  `invoices` have no `deleted_at` or any audit column, and no later migration adds one
  (the one soft-delete migration that exists, `20260513_add_invoice_soft_delete.sql`,
  targets the separate, older `invoices_v1` Pro-plan table, not this one). Rather than
  inventing a schema migration in this pass, each hard-delete function now carries a code
  comment naming the gap and pointing at `transactionAuditService.js` as the parity
  target — a real follow-up item, not silently dropped. Scored `[~]` rather than `[x]`
  for this reason.

## Phase 12 - Independent Code-Only Review (2026-08-18): Backend Consistency And Concurrency — 0 / 12

Medium-severity backend findings from the same review pass — real quality/consistency
problems, not launch-blocking on their own, but worth closing before they compound.

- [ ] Inconsistent `asyncRoute`/`ApiError` usage within the same files: GET routes in
  `transactions.routes.js`, `exports.routes.js`, `businesses.routes.js`, and
  `billing.routes.js` use the shared helper; most mutation routes (POST/PUT/PATCH/DELETE)
  in the same four files hand-roll `try/catch` with manual status codes instead, with no
  functional reason for the split.
- [ ] `routes/auth.routes.js` — the "resolve pending token → look up active challenge →
  check attempt count → compare code hash → record failure / consume" MFA email-code
  sequence is duplicated near-identically 5 times (`mfa/reauth`, `mfa/enable`,
  `mfa/disable`, `mfa/verify`, `verify-email/confirm-code`).
- [ ] `requireV2BusinessEnabled`/`requireV2Entitlement` run twice per request on the six
  V2 sub-routers: once from `routes/index.js`'s `...businessTierOnly` mount, and again
  from each sub-router's own `router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement)`.
- [ ] `routes/internalSupport.routes.js`, `supportEmail.routes.js`, and
  `email.routes.js` each define their own router-local `router.use((err, req, res, next) => ...)`
  error handler that re-implements — nearly line-for-line — the status/message-hiding
  logic already centralized in `server.js`'s error handler.
- [ ] `routes/receipts.routes.js`'s `ensureReceiptListSchema()` issues
  `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS` plus a backfill `UPDATE` reactively
  from inside `GET /` whenever a "column does not exist" Postgres error is caught — DDL
  triggered from live read traffic instead of a migration step.
- [ ] `routes/analytics.routes.js` has ~700 lines of CPP/CPP2/SE-tax computation and
  quarter-over-quarter/seasonal-deviation analysis embedded directly in route handlers,
  unlike every comparable domain area (mileage, vehicle claims, capital assets, home
  office, Quick/Regular Method) which delegates to a `services/*` module — this leaves
  the file's tax math untestable independent of Express.
- [ ] Check-then-act races with no locking: `services/basicPlanUsageService.js`'s
  `assertCanCreateTransactions`/`assertCanUploadReceipts`/`assertCanImportCsvRows` count
  usage and return an allowance with nothing enforcing it atomically, so concurrent
  requests can jointly exceed a Basic-tier business's monthly caps; and
  `services/vehicleClaimService.js`'s `assertConsistentClaimMethodForYear` SELECTs-then-
  throws with no lock around the later insert, so two concurrent claim submissions for
  the same tax year can both pass the "one method per year" check before either commits.
- [ ] Silent, unlogged decryption failures for sensitive financial identifiers in three
  services: `gstHstNumberService.js`'s `decryptGstHstNumber`, `taxIdService.js`'s
  `decryptTaxId`, and `bankConnectionService.js`'s `decryptAccessToken` each swallow any
  decrypt error into a bare `return null` with zero logging — a botched
  `FIELD_ENCRYPTION_KEY` rotation would be indistinguishable from "no value was ever
  stored" and silently blank out tax IDs/GST-HST numbers/bank tokens app-wide.
- [ ] `services/transactionImportService.js`'s `revertImportBatch` issues two separate
  `UPDATE`s (soft-deleting the batch's transactions, then marking the import row
  `reverted`) with no `BEGIN`/`COMMIT` around them — a crash between the two leaves an
  inconsistent state for a feature whose whole purpose is auditable reversibility.
- [ ] `db.js` duplicates `utils/dbSslConfig.js`'s DB SSL decision tree almost verbatim
  instead of importing the already-shared, tested version — confirmed the shared util is
  currently consumed only by tests, not by the real runtime pool.
- [ ] `pdf-worker/index.js` compares `WORKER_SECRET` with plain `!==` instead of a
  timing-safe comparison, inconsistent with every other secret/token comparison in the
  codebase (`csrf.middleware.js`, `requireSupportSecret.js`, `authUtils.js` all use
  timing-safe compares).
- [ ] `scripts/i18n-fix.js` is still wired as a repeatable `npm run i18n:fix` command,
  but its replacements are already applied to `public/js/i18n.js` and its matcher only
  checks that the "from" text is unique, never whether the "to" text already exists —
  re-running it today would silently insert duplicate i18n keys rather than failing
  cleanly.

## Phase 13 - Independent Code-Only Review (2026-08-18): Frontend Duplication And Races — 0 / 7

- [ ] Money-formatting/currency-resolution logic (`formatMoney`/`getActiveCurrency`) is
  independently redefined in 6 files (`pages/Transactions.tsx`, `pages/Mileage.tsx`,
  `pages/Analytics.tsx`, `pages/Invoices.tsx`, `pages/Exports.tsx`,
  `components/transactions/RecurringTemplatesWorkflow.tsx`) instead of one shared `lib`
  utility — this exact duplication is what let the Invoices and RecurringTemplatesWorkflow
  currency bugs in Phase 11 quietly diverge from the correct behavior undetected.
- [ ] Attachment-picker validation (file-size/count limits, add/remove handlers) is
  duplicated three times with independently-declared limits: `pages/Messages.tsx`'s
  `MessageDetailModal` and `ComposeModal`, and `pages/Invoices.tsx`'s own copy — a
  shared `useFileAttachments` hook would remove ~90 duplicated lines and the risk of the
  limits drifting apart.
- [ ] `frontend-v3/src/hooks/useTransactionsPageData.ts`'s `refreshPageData` and
  `frontend-v3/src/hooks/useMessagesPageData.ts`'s `openThread` have no
  `AbortController`/ignore-flag/request-ordering guard — rapid filter/page changes or
  fast thread-switching can let an earlier in-flight response resolve after a later one
  and silently overwrite fresher state with stale data.
- [ ] `frontend-v3/src/lib/apiClient.ts`'s `isCsrfFailure` decides whether to retry
  solely by string-comparing the backend's exact error message
  (`'CSRF token missing or invalid.'`) — a backend copy/wording change would silently
  stop the CSRF-refresh retry path from firing.
- [ ] `frontend-v3/src/lib/invoicesApi.ts`'s `mapStatus` derives "Overdue" by comparing
  `dueDate` to the browser's local-timezone `new Date()` rather than trusting a
  backend-computed status, so the same invoice can show as "Sent" vs. "Overdue"
  depending on the viewer's timezone relative to the due-date boundary.
- [ ] `frontend-v3/src/lib/transactionReview.ts`'s `canonicalReviewLabel` classifies
  which fields need review by regex-matching rendered label text
  (`/amount/i`, `/description|merchant|vendor/i`, etc.) instead of the structured
  `issueCode` already present on `ReviewQueueItem.issueEntries` — any backend wording
  change silently breaks which fields get flagged in this compliance-relevant workflow.
- [ ] `frontend-v3/src/lib/apiClient.ts`'s `apiRequest` and `apiBlobRequest` each
  independently repeat the full CSRF-retry/401-refresh-retry sequence instead of sharing
  one implementation — currently in sync, but any future fix to the retry semantics has
  to be applied in both places by hand.

## Phase 14 - Independent Code-Only Review (2026-08-18): Low Severity Polish And Dead Code — 0 / 7

- [ ] Small utilities duplicated verbatim across files instead of shared: CSV-cell
  escaping (`pages/Subscription.tsx` / `pages/Analytics.tsx`), blob-download-and-click
  (`lib/exportsApi.ts` / `lib/settingsApi.ts`), `isCanadaBusiness`
  (`components/AppShell.tsx` / `pages/Mileage.tsx`), `getPaginationPages`
  (`pages/Transactions.tsx` / `pages/Mileage.tsx` / `pages/Invoices.tsx`), and the AR/AP
  aging-bucket `CASE/SUM` SQL in `services/arApService.js`.
- [ ] Confirmed dead code: `pdfGeneratorService.js` declares `buildVehicleAuditSchedule`
  and `buildQuickMethodRemittancePage` twice each (function-declaration hoisting means
  the first ~140 lines of each pair never execute); `middleware/rateLimiter.js`'s
  `metrics = { increment() {} }` no-op stub is called from 4 sites but never wired to a
  real backend; `frontend-v3/src/lib/authApi.ts`'s `requestEmailChange` always returns
  `verificationCode: undefined`, unread by any caller; `routes/receipts.routes.js`
  imports `https` but never uses it; `supportEmail.routes.js` and `email.routes.js` each
  have a no-op `catch (err) { throw err; }` wrapping the whole handler, redundant with
  `asyncRoute`.
- [ ] `pdfGeneratorService.js`'s live Auto Audit Support Schedule "Method Reference"
  card contains an out-of-place engineering instruction as customer-facing PDF content:
  "Run VALIDATE CONSTRAINT after data cleanup to enable query-planner optimization" —
  unrelated to vehicle deduction methodology, reads like leftover placeholder text.
- [ ] `server.js` startup logs read as theatrical/AI-generated filler out of step with
  the rest of the file's structured logging convention (e.g.
  `'SYSTEM START: INEX_LEDGER_PROD_2026'`, `'SECURITY: JWT_SECRET detected:'`) —
  harmless (no secret value is actually logged) but stylistically inconsistent.
- [ ] `window.__LUNA_ME__` (an old internal codename unrelated to the product name) is
  read directly off `window` by 4 pages (`Analytics.tsx`, `Mileage.tsx`, `Invoices.tsx`,
  `Transactions.tsx`) for business currency instead of via props/context, bypassing
  React's normal data flow — deliberately wired in `App.tsx`, but an inconsistent escape
  hatch a reviewer would ask to be routed through context.
- [ ] `services/emailPreferencesService.js`'s `getSigningSecret()` falls back to a
  hardcoded literal secret (`"inex-ledger-email-preferences"`) if none of
  `EMAIL_PREFERENCES_SECRET`/`SUPPORT_REPLY_HMAC_SECRET`/`JWT_SECRET` are configured —
  low impact (forged tokens only unsubscribe from optional marketing email) but a
  hardcoded-secret anti-pattern.
- [ ] Misc naming/structure nits: duplicate migration filename number prefixes (`007`,
  `026`, `045`, three separate `048_*.sql` files — alphabetical sort currently keeps
  execution order deterministic, but there's no single source of truth for "next
  migration number"); `subscriptionService.js`'s `PLAN_FREE`/`PLAN_BASIC` and
  `PLAN_V1`/`PLAN_PRO` are redundant unlabeled aliases of the same two values;
  `middleware/requirePlanFeature.js` has a JSDoc block sitting above the wrong function;
  `accountingLockService.js`'s `assertNoLockedPeriodTransactionsForCategory`/
  `assertNoLockedPeriodTransactionsForAccount` are near-duplicates differing only by
  column name; `invoiceEmailService.js` has an indentation break for ~40 lines.

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

- **PR 15** (`refactor/extract-billing-input-normalization`): same path,
  `routes/billing.routes.js` (1,981 lines). This one is Stripe/payment code,
  a different risk class than the last two — a wrong extraction here means
  money moving incorrectly, not just a bug. Read all 60 top-level functions
  before choosing anything, and scoped deliberately narrower than the auth
  pass: only pure input normalization/validation
  (`normalizeBillingInterval`, `normalizeCurrency`, their optional variants,
  `normalizeAdditionalBusinesses`, `normalizeInternalReturnPath`,
  `buildCheckoutReturnPath`, `isTrialReupgradeAttempt`, `normalizeCountryCode`,
  `resolveCurrencyForCountry`, `isEnvFlagEnabled`,
  `normalizeTrialEndForCheckout`) plus the `BillingValidationError` class they
  throw. Left the Stripe-object-shape functions
  (`parseStripeUnitAmount`, `getStripeProductIdFromPrice`,
  `assertStripePriceMatchesBillingInterval`, and similar) and
  `verifyWebhookSignature` untouched — those need their exact Stripe API
  assumptions verified more carefully before moving, a follow-up rather than
  bundled into this pass. 12 functions + 1 error class extracted into
  `services/billingInputValidationService.js`, with 11 new direct unit tests
  (all passed on the first run, unlike the auth PR's two self-caught bugs).
  `BillingValidationError` moved with its throwers since the route file's own
  `catch` blocks check `err instanceof BillingValidationError` — imported back
  for that. Route file: 1,981 → 1,864 lines. Full billing-adjacent HTTP suite
  (169 tests across 7 files: addon management, currency resolution, mock
  routes, subscription recovery, webhooks, critical flows, CSRF) passes
  unchanged. Full suite: 1328/1329 passing (same pre-existing, unrelated
  failure as every prior PR). Not counted toward Phase 7's score, same
  reasoning as PR 13/14.

- **PR 16** (`refactor/extract-exports-request-helpers`): same path,
  `routes/exports.routes.js` (1,783 lines, the next-largest untouched route
  file once auth/transactions/billing were done). Read all 14 top-level
  functions before choosing anything. Extracted the 9 pure/near-pure ones —
  `validateDateRange`, `isValidTaxId`, `resolveSecureExportTaxId`,
  `buildExportMetadataRows`, `inferQuickMethodSupplyType`,
  `createPdfReportId`, `buildCsvFilename`, `collectExportArtifactIds`,
  `normalizeExportHistoryEntry` — into `services/exportRequestService.js`,
  along with the `DATE_PATTERN` and `SSN_RE`/`EIN_RE`/`SIN_RE`/`BN_RE`
  constants they use. `DATE_PATTERN` is also read by two route handlers
  outside the extraction, so it's re-exported and imported back;
  `SUPPORTED_EXPORT_TYPES` wasn't touched by any extracted function, so it
  stays put. Left the middleware and every DB-touching function alone:
  `requireEmailVerified`, `fetchUserDisplayName`, `fetchExportSourceRows`
  (the large multi-table export fetch), `storeCompletedExport`,
  `persistSnapshotBestEffort`. Removed the now-unused `decryptJwe` import
  from the route file (the new service imports it directly instead). 18 new
  direct unit tests, all passing on the first run; testing
  `resolveSecureExportTaxId`'s decrypt-success and invalid-format branches
  needed a `Module._load` mock for `jweDecryptService.js`, the same mocking
  pattern `tests/exportsRegression.test.js` already uses. Route file:
  1,783 → 1,615 lines. Full export-adjacent HTTP suite (198 tests across 6
  files: critical flows, CSRF E2E, exports regression, index route guards,
  integration flows, plan catalog) passes unchanged. Full suite: 1346/1347
  passing (same pre-existing, unrelated failure as every prior PR). Not
  counted toward Phase 7's score, same reasoning as PR 13/14/15.

- **PR 17** (`fix/backslash-path-traversal-basename`): not a decomposition
  PR — a real fix for the one test that had been failing identically across
  every single PR in this effort (`tests/securityRegressionSuite.test.js`:
  "support-artifact and receipt storage resolvers confine traversal
  candidates to their managed roots"). Root cause:
  `normalizeSupportArtifactCandidate`/`normalizeReceiptStorageCandidate`
  (`services/supportArtifactStorage.js`, `services/receiptStorage.js`) both
  sanitize a filename via `path.resolve(storageDir, path.basename(rawPath))`,
  but `path.basename()` only treats `\` as a separator on `win32` — on this
  repo's POSIX dev/CI environment a Windows-style traversal string like
  `..\..\Windows\system32\drivers\etc\hosts` wasn't being collapsed to a
  bare filename the way the sanitizer is designed to. It never actually
  escaped the storage directory (POSIX `path.resolve` doesn't treat `\` as a
  separator either), so there was no real vulnerability, but the resolvers
  weren't neutralizing the traversal string the way the regression test
  (correctly) expects, since request/DB data isn't guaranteed to match the
  host OS's path format. Fix: normalize `\` to `/` before calling
  `path.basename()` in both resolvers. Checked the only real call sites
  (`routes/supportArtifacts.routes.js`, `routes/receipts.routes.js`) — both
  only ever pass in a path the app generates and stores itself using
  forward slashes, so the fix changes nothing for real stored paths. Full
  backend suite: **1347/1347 passing** — first fully green run in this
  entire remediation effort.

- **PR 18** (`refactor/extract-business-profile-helpers`): same
  decomposition path, `routes/businesses.routes.js` (1,383 lines), same
  risk class as billing — Stripe subscription slot management plus business
  deletion, real money and real data-loss consequences. Read all 27
  top-level functions before choosing anything. Extracted 10 pure/near-pure
  functions into `services/businessProfileService.js` (`buildAppUrl`,
  `normalizeBillingCurrency`, `normalizeBillingInterval`,
  `normalizeOptionalBillingInterval`, `normalizeOptionalCurrency`,
  `formatBillingCurrencyAmount`, `normalizeBusinessPayload`,
  `normalizeOptionalTrimmedString`, `normalizeBusinessProfileRow`,
  `buildBusinessLimitError`) — all re-imported back since the route file's
  remaining handlers still call every one of them. Left every
  Stripe-object-shape function (`getStripeBaseItem`, `getStripeAddonItem`,
  `resolveStripeAdditionalBusinesses`, `resolveStripeSubscriptionBillingTerms`,
  `resolveAddonPriceIdForTerms`) and every DB/Stripe-API-touching function
  untouched, same caution as PR 15's billing pass. Also found and fixed a
  genuine byte-identical duplicate along the way: `parseStripeUnitAmount`
  existed verbatim in both `billing.routes.js` and `businesses.routes.js` —
  moved into the already-shared `services/stripePriceConfig.js` so both
  route files import the one copy. That surfaced a real gap in
  `tests/businessLifecycleNotifications.test.js`: its `Module._load` mock of
  `stripePriceConfig.js` didn't have `parseStripeUnitAmount`, so two tests
  were silently swallowing a `TypeError` inside
  `sendBusinessLifecycleEmail`'s catch-all and passing on a false "0 emails
  sent" assertion instead of the real "1 email sent" — fixed by adding the
  missing export to the test's mock. 16 new direct unit tests across
  `tests/businessProfileService.test.js` and a new
  `tests/stripePriceConfig.test.js` (covering `parseStripeUnitAmount`,
  which also had zero direct coverage before), all passing on the first
  run. Route file: 1,383 → 1,266 lines. Full business/billing-adjacent HTTP
  suite (226 tests across 12 files) passes unchanged. Full suite:
  **1363/1363 passing**. Not counted toward Phase 7's score, same reasoning
  as PR 13/14/15/16.

- **PR 19** (`fix/currency-code-validation`): back onto the audit checklist
  itself after five straight route-decomposition PRs went beyond it — this
  is Phase 5's "Account type/currency assumptions reviewed for closed-set
  constraints" (Pass 24). Read the actual current state on `main` for both
  halves before doing anything, since the audit's own suggested fix for both
  starts with "decide":
  - Traced `accounts.type`'s real write paths: `routes/accounts.routes.js`
    only accepts 6 values, but `services/plaidService.js`'s
    `plaidAccountToRow` writes Plaid's own subtype
    (`money market`/`cd`/`mortgage`/`brokerage`/etc.) into the same column
    unfiltered, confirmed via `routes/plaid.routes.js`'s insert. A DB
    `CHECK` matching the route's 6-value enum would reject live Plaid syncs,
    not just future bad rows. Confirmed the frontend already has a graceful
    fallback (`mapTypeFromLegacy` → `'Other'`) so this isn't an active bug,
    and confirmed unifying the taxonomy is a real product decision (which
    system's vocabulary wins, or does `type` need a separate constrained
    "category" alongside a free-er stored value) — flagged rather than
    picked unilaterally, same posture as the internal-support-identity and
    legacy-archive-vs-delete items already on record in this file.
  - Currency had one concrete, safe half: `normalizeCurrencyCode` in
    `routes/transactions.routes.js` only checked shape
    (`/^[A-Z]{3}$/`), so `"ZZZ"` — not a real currency — passed straight
    through instead of falling back the way malformed input already did.
    Fixed by checking against `Intl.supportedValuesOf("currency")` instead
    of the bare regex — same fallback contract, still accepts every real
    ISO-4217 code, doesn't narrow the product to USD/CAD-only (that would
    have been the same kind of unilateral scope call as the account-type
    side). Grepped the whole backend first and confirmed this was the only
    shape-only currency validator; billing's `normalizeCurrency` already
    uses a real closed `Set`. Added `normalizeCurrencyCode` to
    `transactions.routes.js`'s existing `__private` test export (already
    used for 3 other pure helpers, so this isn't a new pattern) and added
    `tests/transactionCurrencyNormalization.test.js` (4 tests, all passing
    first run, including a named regression case for the exact `"ZZZ"`
    bug — this function had zero direct coverage before). Full suite:
    1366/1367 passing; the one failure is the still-open PR #303's fix, not
    a regression from this change (this branch predates that merge).
    Phase 5: 3.5/5 → 4.0/5; overall 30.0/54 → **30.5/54 (~56%)**.

- **PR 20** (`fix/production-env-validation-gaps`): still on the checklist,
  Phase 3's "Environment validation for required production settings" (Pass
  10). Checked each variable the audit flagged as under-validated against
  its actual failure mode on `main`, rather than blanket-adding the whole
  list: `REDIS_URL` is unconditionally required in production per the app's
  own `isRateLimitingRequired() === isProduction()` logic; `PDF_WORKER_URL`/
  `PDF_WORKER_SECRET` and `EXPORT_PUBLIC_KEY_JWK`/`EXPORT_PRIVATE_KEY_JWK`
  back core, unconditionally-mounted features (PDF export, secure export)
  with no feature flag gating them. All 5 previously only failed at request
  time — added them to `envValidationService.js`'s production-required
  list so a misconfigured deploy fails at startup instead of shipping and
  silently degrading (Redis) or 500ing/503ing on first real use (PDF/secure
  export). Also found `EXPORT_PRIVATE_KEY_JWK` was undocumented in
  `.env.example` even though its public-key counterpart was already there —
  added it. Deliberately left the inbound-email/support-reply HMAC secrets
  (`INBOUND_EMAIL_WEBHOOK_SECRET`, `SUPPORT_INBOUND_WEBHOOK_SECRET`,
  `INVOICE_REPLY_HMAC_SECRET`, `SUPPORT_REPLY_HMAC_SECRET`) alone — the
  audit itself calls some of this list "optional by design," there's no
  `ENABLE_INBOUND_EMAIL`-style flag to key off of, and those routes already
  fail closed with a clear 503 rather than insecurely, so guessing which
  deployments need them would be a scope call, not a bug fix. 5 new/expanded
  tests in `tests/envValidationService.test.js`, all passing;
  `tests/launchBlockers.test.js` unaffected (its assertion is a
  `.includes()` check). Not marking the checklist item `[x]`: the audit's
  fuller design (a real core-vs-feature-gated validator, plus a
  `Docs/PRODUCTION-READINESS.md` matrix) still isn't built, so this stays at
  half credit — Phase 3's score and the overall percentage are unchanged by
  this PR.

- **Outside this PR sequence** (6 commits pushed directly to `main` on
  2026-08-10, `a4f29011`..`24931740`, reviewed and reconciled into this file
  after the fact): real, independent progress, not vibes-checked here before
  landing since it happened outside this session — verified each one against
  `main` before writing this entry, same bar as everything else in this file.
  - `a4f29011` + `3c7c43d0`: fixed the exact "`npm run test:all` has a stale
    hardcoded file list" gap this file's own prior PR narratives kept
    working around (running `node --test tests/*.test.js` directly instead
    of trusting `test:all`). First commit brought the hardcoded list current;
    second replaced the hardcoded list entirely with
    `scripts/run-all-node-tests.mjs`, which discovers every `tests/*.test.js`
    file at runtime. Added `tests/testAllInventory.test.js` as a
    self-enforcing guardrail — fails if `test:all` and the actual directory
    listing ever drift again. `npm run test:all` is now trustworthy; no more
    reason to hand-roll the file glob in this file's own PR checklists going
    forward.
  - `56624845` and `6f9d4477`: see the corrected Phase 5 entry above — fixed
    a real `ON DELETE` regression in `e018b6eb`'s composite FKs and added a
    readiness-check script for validating them later.
  - `897b8c1d`: same fix as the now-closed PR #303
    (`fix/backslash-path-traversal-basename`), independently reimplemented
    with `path.posix.basename()` instead of the platform `path.basename()`
    after backslash normalization — equivalent result, landed directly on
    `main` first. PR #303 closed as superseded rather than merged, since
    merging it now would just reintroduce a diff against an already-fixed
    file. **The Windows-path-traversal test that had been the sole failure
    across every PR in this entire remediation effort is now fixed on
    `main` for good** — confirmed via a full `npm run test:all` run:
    **1375/1375 passing** (plus 3/3 ASVS controls).
  - `24931740`: see the updated Phase 2 "Route-local error/log paths
    sanitized" entry above.
  - None of these move the headline percentage on their own beyond the
    corrections already folded into the Phase 2/3/5 entries above (Phase 5's
    correction was a fix to how a prior `[x]` was scored, not new points;
    Phase 1's item was already `[x]` and stays `[x]`, just more robust now).

- **PR 21** (`feat/api-error-async-route-pattern`): back on the checklist,
  Phase 4's "Consolidated `ApiError`/`sendError`/async-route pattern
  introduced" (Pass 27), the first fully-unstarted item in that phase.
  `server.js`'s central Express error handler already does everything Pass
  27 asks for (derives status from `err.status`, hides 500 details in
  production, logs structured fields) — it just never receives anything,
  because every route file catches its own errors locally instead of
  throwing and calling `next(err)`. Added `utils/apiError.js`: `ApiError`
  (typed error, `.status` + optional `.code`) and `asyncRoute` (wraps an
  async handler so `next(err)` fires for both a rejected promise and a
  synchronous throw). Caught a real bug in my own first version by running
  its unit tests rather than trusting the design: the wrapper didn't return
  its promise chain and didn't catch synchronous throws, so a caller
  awaiting the wrapped handler resolved before the async `.catch(next)`
  ever ran, and a plain synchronous throw propagated out of the wrapper
  instead of reaching `next`. Fixed both before writing anything else on
  top of it.

  Piloted on `routes/business.routes.js` — the audit's own cited example
  ("`business.routes.js` logs `err.stack || err` and returns bespoke 500
  messages"), and a good pilot target independent of that: small (314
  lines), always mounted (no feature flag), and had zero HTTP-level test
  coverage before this PR. Replaced every `try/catch` +
  `res.status(...).json(...)` with `throw new ApiError(status, message)`
  plus `asyncRoute(...)`; kept local `try/catch` only where genuinely
  needed — translating a DB `CHECK` constraint violation or
  `accountingLockService`'s date-validation error into an `ApiError`, not
  swallowing them. Every existing 400/404 message is preserved exactly; the
  one intentional behavior change is that a truly unexpected 500 now
  returns the same generic "Internal server error" text used everywhere
  else instead of 4 different bespoke per-route messages — which is the
  actual point of centralizing, not an accident. Added 27 HTTP-level tests
  (`tests/businessRouteErrors.test.js`, all passing) covering every
  validation branch, both success paths, all 3 `CHECK` constraint
  mappings, and the date-validation special case, plus 5 direct unit tests
  for `ApiError`/`asyncRoute` (`tests/apiError.test.js`). Full suite via
  `npm run test:all` (now trustworthy, see the outside-session entry
  above): **1407/1407 passing** (plus 3/3 ASVS controls) — 32 more than the
  prior clean baseline, all new. Phase 4: 3.0/5 → 3.5/5; overall
  30.5/54 → **31.0/54 (~57%)**. Staying at half credit on the checklist
  item itself: only 1 of ~15 route files has adopted the pattern; the rest
  is real, larger follow-up work.

- **PR 22** (`chore/expand-api-error-rollout`): same phase, same item,
  no new checklist points (correctly stays at half credit — see below).
  Converted 4 more small, always-mounted route files to the `ApiError`/
  `asyncRoute` pattern: `system.routes.js`, `bank-connections.routes.js`,
  `homeOffice.routes.js`, `entitlements.routes.js`. `homeOffice.routes.js`
  was a useful data point for the pattern's value: its service layer
  (`services/homeOfficeService.js`) already threw plain `Error`s with a
  `.status` property set — functionally identical to `ApiError` — so the
  route's `if (err?.status === 400) return res.status(400)...` re-wrap was
  pure boilerplate once `asyncRoute` let the error propagate straight to
  the central handler; deleted it rather than keeping a redundant
  translation step.

  Along the way, caught real duplication forming before it multiplied:
  4 route-specific test files were each about to grow an identical 6-line
  "minimal stand-in for server.js's central error handler" snippet (the
  same one `businessRouteErrors.test.js` already had inline from PR 21).
  Extracted `attachCentralErrorHandler` into the shared
  `tests/helpers/testPool.js` next to the existing `buildTestApp`, added
  5 direct unit tests for it (`tests/testPoolHelpers.test.js`), and
  switched `businessRouteErrors.test.js` over to the shared version too —
  one canonical implementation, not one exception plus four new copies.
  Updated the 4 route files' existing test files to match: the log
  assertions now check the central handler's structured
  `{status, method, path, message}` shape instead of each route's own
  log-string regex (which no longer exists, since the routes don't call
  `logError` locally anymore). Added 2 tests that had no coverage before
  (`homeOffice.routes.js`'s DELETE-404 and GET-500 paths). Full suite via
  `npm run test:all`: **1414/1414 passing** (plus 3/3 ASVS controls) — 7
  more than PR 21's baseline, all new (5 helper tests + 2 home-office
  tests). Now 5 of 41 route files use the pattern; the checklist item
  stays at half credit since the remaining 36 don't yet, but the pattern
  itself (plus its test infrastructure) is now proven across more than
  one shape of route file, not just the original pilot.

- **PR 23** (`chore/expand-api-error-rollout-2`): same phase, same item,
  no new checklist points. Converted 4 more route files:
  `vehicleClaims.routes.js`, `sessions.routes.js`, `consent.routes.js`,
  `capitalAssets.routes.js`. `vehicleClaims.routes.js` was a different data
  point than `homeOffice.routes.js`'s: its service
  (`services/vehicleClaimService.js`) throws plain `Error`s with no
  `.status` for 3 domain-validation cases (a same-tax-year claim-method
  conflict, and two CRA-region rules), so the route already had to detect
  these by matching on `err.message` substrings. Left that detection logic
  exactly as it was rather than reshaping the service (a bigger, separate
  change) or silently dropping the distinction — just throws
  `ApiError(400, err.message)` on a match now instead of responding
  directly, so the file still gets the pattern's benefit everywhere else.
  `consent.routes.js` is notable for being the one public (no `requireAuth`)
  route file converted so far — confirms the pattern isn't auth-specific.

  `vehicleClaims.routes.js` and `capitalAssets.routes.js` had zero test
  coverage before this PR — added 13 and 19 tests respectively, covering
  every validation branch, both 404 paths, and the domain-error
  translations. Added 4 more tests to `sessions.routes.js` (the 400/404/500
  paths existed in the code already but had no test) and 3 more to
  `consent.routes.js` (the 400 path plus two 500s). Full suite via
  `npm run test:all`: **1453/1453 passing** (plus 3/3 ASVS controls) — 39
  more than PR 22's baseline, all new. Now **9 of 41** route files use the
  pattern; checklist item stays at half credit — 32 to go, and that's
  still real, larger follow-up work rather than something to rush.

- **PR 24** (`chore/expand-api-error-rollout-3`): same phase, same item,
  no new checklist points. Converted 2 more route files —
  `accounts.routes.js` and `supportArtifacts.routes.js` — both a step up in
  complexity from the prior batches: a real DB transaction and real
  filesystem compensation logic, not just validation-then-CRUD.
  `accounts.routes.js`'s type-reclassification path surfaced a case the
  pattern hadn't hit yet: `AccountingPeriodLockedError` carries extra
  fields (`code`, `locked_through_date`) the shared central handler can't
  express, since it only ever emits `{error}` (plus `requestId` on 500s).
  Rather than stretching `ApiError`/the central handler to carry arbitrary
  extra fields, kept a narrow local catch that responds directly for that
  one case — the exception is intentional and documented inline, not a gap
  in the rollout. Its `DELETE /:id` transaction (`BEGIN`/`COMMIT`/`ROLLBACK`)
  and `supportArtifacts.routes.js`'s upload-then-cleanup-on-failure logic
  were both left as local try/catch/rethrow, matching the audit's own
  guidance to keep route-local catches only for true compensation work.
  One incidental fix worth calling out: `supportArtifacts.routes.js`'s old
  catch-all used to respond with the raw `err.message` for *any* unexpected
  error, including a bare DB failure — that leaked internal detail to the
  client. Now unmapped errors fall through to the central handler's generic
  message, which is strictly safer, not just more consistent.

  Converting `accounts.routes.js` also surfaced a real test-infrastructure
  bug: `tests/criticalFlows.test.js` and `tests/integrationFlows.test.js`
  each hand-roll their own copy of `buildApp` instead of using
  `testPool.js`'s shared `buildTestApp`, and neither had
  `attachCentralErrorHandler` wired in — so 3 tests in
  `integrationFlows.test.js` broke the moment the route started throwing
  instead of responding directly, despite the PR's diff never touching that
  file. Fixed both local helpers, then proactively checked the other 15
  test files sharing the same duplicated pattern against the growing list
  of converted route files — none of them currently overlap, so no other
  hidden breakage, but the duplication itself remains a standing risk for
  future conversions.

  Added `tests/accountsRouteErrors.test.js` (new file, 11 tests — every
  validation branch, the unique-name 409, the 404s, the locked-period
  extra-fields response, and the rollback-then-500 path with an explicit
  assertion that `ROLLBACK` actually ran) and 4 new tests to
  `tests/supportArtifactsRoutes.test.js` (a 400, an ownership 404, a
  generic 500, and a file-missing-on-disk 404). Full suite via
  `npm run test:all`: **1468/1468 passing** (plus 3/3 ASVS controls) — 15
  more than PR 23's baseline, all new. Now **11 of 41** route files use the
  pattern; checklist item stays at half credit — 30 to go.

- **PR 25** (`chore/expand-api-error-rollout-4`): same phase, same item,
  no new checklist points. Converted 4 more route files —
  `customers.routes.js`, `vendors.routes.js`, `projects.routes.js`,
  `billable-expenses.routes.js` — the easiest batch so far: all four are
  V2/Business CRUD routers with the identical shape (uniform
  `try/catch { logError(...); res.status(500).json({error}) }` boilerplate
  on every handler, no unique-constraint mapping, no compensation work).
  Pure mechanical conversion: validation/UUID checks became
  `throw new ApiError(400, ...)`, not-found checks became
  `throw new ApiError(404, ...)`, the per-route catch was deleted outright
  in all four rather than kept for any special case, because there wasn't
  one.

  While confirming the true total route-file count for this update, a
  fresh `find routes/*.routes.js` turned up **40** files, not the 41 this
  log has been counting against since PR 21 — corrected the running count
  here rather than perpetuate a stale number; nothing was added or removed,
  the earlier count was simply off by one.

  `tests/v2RouteHardening.test.js` runs all four of these routers (plus
  `bills.routes.js` and `invoices.routes.js`, untouched this PR) through
  one shared `loadRouter` fixture with no `attachCentralErrorHandler`
  wired in — the same category of gap as PR 24's `criticalFlows`/
  `integrationFlows` fixtures, just caught before shipping this time
  instead of after. Several of its existing tests asserted the exact old
  500 message (`"Failed to create project"`, `"Failed to create billable
  expense"`) and the route's own `logError` call shape, both of which stop
  being true once the routes throw instead of responding directly. Wired
  in the central handler and updated those assertions to the generic
  `"Internal server error"` message and the handler's
  `{status, method, path, message}` log shape, rather than leave the
  fixture asserting behavior the routes no longer have.

  Added `tests/v2RouteErrors.test.js` (new file, 16 tests, table-driven
  across all four routers): GET/PUT/DELETE 404-for-unknown-id and a
  non-UUID 400 for each — none of which had any coverage before, since
  the shared hardening-test file only exercised auth/CSRF/rate-limit
  boundaries and validation-before-service-call, never the not-found path.
  Full suite via `npm run test:all`: **1484/1484 passing** (plus 3/3 ASVS
  controls) — 16 more than PR 24's baseline, all new. Now **15 of 40**
  route files use the pattern; checklist item stays at half credit — 25
  to go.

- **PR 26** (`chore/expand-api-error-rollout-5`): same phase, same item,
  no new checklist points. Converted the last 2 files in the V2/Business
  CRUD family — `bills.routes.js` and `invoices.routes.js` — identical
  shape to PR 25's batch, same mechanical conversion (throw `ApiError` for
  validation/UUID/not-found, delete the per-route catch, no special case
  in either file). Between PR 25 and this PR, every router mounted under
  `requireV2BusinessEnabled` — customers, vendors, projects,
  billable-expenses, bills, invoices — now uses the pattern, closing out
  that entire family in two PRs.

  Fixed one more instance of the `v2RouteHardening.test.js` fixture gap
  PR 25 already found and partially fixed: the file's "invoices list logs
  service failures" test still asserted the old custom 500 message
  (`"Failed to load invoices."`) and the route's own `logError` shape —
  it hadn't been touched in PR 25 because `invoices.routes.js` wasn't
  converted yet. Updated it to the generic `"Internal server error"` and
  the central handler's `{status, method, path, message}` log shape,
  matching the fix already applied to the `projects`/`billable-expenses`
  tests in the same file.

  Extended `tests/v2RouteErrors.test.js` (added in PR 25) to cover `bills`
  and `invoices` in the same table-driven fixture — 8 more tests
  (GET/PUT/DELETE 404-for-unknown-id and a non-UUID 400 for each), 24
  tests total in that file now. Needed a per-route PUT payload builder
  since `bills`/`invoices` require a full valid payload
  (vendor_id/customer_id, number, status, issue_date, total_amount,
  currency) to reach the not-found check, unlike the simple `{name}`
  payload the first four routers accept. Full suite via
  `npm run test:all`: **1492/1492 passing** (plus 3/3 ASVS controls) — 8
  more than PR 25's baseline, all new. Now **17 of 40** route files use
  the pattern; checklist item stays at half credit — 23 to go.

- **PR 27** (`chore/expand-api-error-rollout-6`): same phase, same item,
  quarter-point progress for reaching the halfway mark on route conversion.
  Converted `check-email-verified.routes.js`, `review.routes.js`, and
  `analytics.routes.js` to the shared `asyncRoute`/`ApiError` pattern.

  `check-email-verified.routes.js` now preserves its specific 400/401
  verification-state responses while unexpected database failures go through
  the central generic 500 handler. `review.routes.js` now routes queue and
  review-issue failures through the shared handler, with explicit 400/404
  `ApiError`s for invalid IDs, invalid payloads, missing transactions, and
  missing review issues. `analytics.routes.js` keeps the analytics formulas and
  query behavior unchanged, but removes four local `try/catch` blocks and
  converts what-if validation failures to `ApiError(400, ...)`.

  Added `tests/analyticsRouteErrors.test.js` and expanded
  `tests/checkEmailVerifiedRoutes.test.js` plus
  `tests/reviewQueueRoutes.test.js` for central-handler 500s and
  representative validation/not-found cases. Full suite via
  `npm run test:all`: **1506/1506 passing** (plus 3/3 ASVS controls). Now
  **20 of 40** route files use the pattern. Phase 4: **3.5/5 → 3.75/5**;
  overall: **31.0/54 (~57%) → 31.25/54 (~58%)**.

- **PR 28** (`chore/expand-api-error-rollout-7`): same phase, same item,
  no new checklist points. Converted `internalSupport.routes.js`,
  `unsubscribe.routes.js`, and `crypto.routes.js` to the shared
  `asyncRoute`/`ApiError` pattern where those routes have async or expected
  error branches.

  `internalSupport.routes.js` keeps its support-console response contract
  (`{ ok: false, message }`) through one router-level error mapper rather than
  per-handler `try/catch` blocks; expected 400/404s remain specific and
  unexpected failures become generic 500s. `unsubscribe.routes.js` now wraps
  its async opt-out write so database errors reach the central handler.
  `crypto.routes.js` now throws `ApiError(503, ...)` for unavailable export
  public key configuration while preserving parse-failure logging. Added
  `tests/unsubscribeRoutes.test.js`, expanded `internalSupportRoutes.test.js`,
  and mounted `cryptoRoutes.test.js` with the central error helper. Focused
  suites: **14/14 passing**. Now **23 of 40** route files use the pattern;
  Phase 4 remains **3.75/5** pending the larger route families.

- **PR 29** (`chore/expand-api-error-rollout-8`): same phase, same item,
  no new checklist points. Converted `recurring.routes.js` to the shared
  `asyncRoute`/`ApiError` pattern while keeping local `try/catch` only where it
  still does real work: transaction rollback, recurring-template domain error
  translation, and Basic-plan limit detail preservation.

  Removed route-local logging/custom 500 responses from list/status/delete/
  restore/runs/upcoming handlers and moved unexpected failures to the central
  generic handler. Preserved specific invalid-id, validation, not-found,
  locked-period, plan-gate, and Basic-limit responses. Updated
  `tests/recurringRouteValidation.test.js` to mount the central error helper
  and assert that the rollback-on-materialization-failure path no longer leaks
  the raw internal error message. Focused suite: **12/12 passing**. Now
  **24 of 40** route files use the pattern; Phase 4 remains **3.75/5**.

- **PR 30** (`chore/expand-api-error-rollout-9`): same phase, same item,
  no new checklist points. Converted `categories.routes.js` to the shared
  `asyncRoute`/`ApiError` pattern while preserving the route's real special
  cases: unique-name conflict translation, accounting-period lock response
  fields, and merge rollback.

  Removed route-local custom 500 responses from the list/create/unmapped/
  defaults/update/delete/merge flows and moved unexpected failures to the
  central generic handler. Added `tests/categoriesRouteErrors.test.js` for
  generic 500, preserved 409 conflict, and preserved 404 delete behavior.
  Updated `categoryRegionGating.test.js` to use the central error helper.
  Focused category suites plus direct-mount integration/critical coverage:
  **153/153 passing**. Now **25 of 40** route files use the pattern; Phase 4
  remains **3.75/5** pending the larger route families.

- **PR 31** (`chore/align-inbound-email-api-errors`): same phase, same item,
  no new checklist points. Converted `supportEmail.routes.js` and
  `email.routes.js` to the shared `asyncRoute` pattern while preserving their
  webhook-specific `{ ok, error }` response envelope.

  Removed bespoke route-local 500 bodies for unexpected processing failures and
  moved those failures to router-level generic 500 handlers. Added insert-failure
  tests to both inbound email fixtures so support reply threading still works,
  while unexpected persistence failures return `{ ok: false, error: "Internal
  server error" }`. Focused inbound email suites: **5/5 passing**. Now **27 of
  40** route files use the pattern; Phase 4 remains **3.75/5** pending the
  larger route families.

- **PR 32** (`chore/align-invoices-v1-api-errors`): same phase, same item,
  no new checklist points. Converted `invoices-v1.routes.js` to the shared
  `asyncRoute`/`ApiError` pattern while preserving the route's meaningful local
  email-provider failure translation.

  Expected validation, missing invoice, conflict, and invalid-id cases now throw
  `ApiError`s. Unexpected list/create/read/update/status/delete/restore failures
  route through one `{ error }` mapper with a generic 500 body. The outbound
  email send catch remains local because it logs provider details, sends the
  owner failure notification, and returns the existing `email_failed` payload.
  Added focused tests for a preserved validation 400 and a generic unexpected
  list failure. Focused invoice suites: **23/23 passing**. Now **28 of 40**
  route files use the pattern; Phase 4 remains **3.75/5**.

- **PR 33** (`chore/remove-invoices-v1-error-mapper-drift`): correction pass
  after reviewing the code updated so far for over-engineering drift. Removed
  the unnecessary `invoices-v1.routes.js` router-level `{ error }` mapper
  because `server.js` already owns that standard envelope and request-id
  behavior. Updated the standalone invoice route tests to mount the shared
  `attachCentralErrorHandler` helper instead of relying on route-local
  duplication or Express's default error handler. Focused invoice suites:
  **23/23 passing**.

- **PR 34** (`chore/align-plaid-api-errors`): same phase, same item, no new
  checklist points. Converted the authenticated Plaid routes to `asyncRoute`
  and `ApiError` only where it removed generic route boilerplate: missing
  `public_token`, invalid sync ids, missing/invalid bank connections, unusable
  access tokens, and unexpected connection lookup/storage failures. Preserved
  direct Plaid provider translations (`502` with Plaid error codes), the
  deployment config gate's `plaid_not_configured` code, non-fatal account/
  transaction item warnings, and the public webhook's `{ ok }` envelope.
  Updated standalone Plaid tests to mount the shared central error helper and
  added focused sync fixture coverage for specific 400s and generic 500s.
  Focused Plaid suites: **38/38 passing**. Now **29 of 40** route files use the
  pattern; Phase 4 remains **3.75/5**.

- **PR 35** (`chore/align-mileage-api-errors`): same phase, same item, no new
  checklist points. Converted `mileage.routes.js` to `asyncRoute` and `ApiError`
  for generic validation/not-found paths and removed route-local custom 500
  responses from mileage listing, summary, trip create/update/delete, and
  vehicle-cost list/create/update/delete flows. Preserved the special response
  payloads for Pro feature gating (`pro_feature_required`) and accounting-period
  lock failures because those responses carry `code`, lock dates, and
  transaction dates that the central handler does not emit. Updated the mileage
  route fixture to mount the shared central error helper and added generic 500
  coverage for unexpected list failures. Focused mileage suites:
  **26/26 passing**. Now **30 of 40** route files use the pattern; Phase 4
  remains **3.75/5**.

- **PR 36** (`chore/close-out-email-dedupe`): Phase 9, closes the last item —
  picked up from the "NEXT UP" note left in this file, both families:
  1. `exportEmailService.js`'s `sendExportGeneratedEmail`/`sendExportFailedEmail`
     now wire the same `email_delivery_dedupe` pattern `invoiceOwnerEmailService.js`
     already used (commit `551fc223`): reserve a dedupe key before sending, mark
     it sent/failed after. The key is built from businessId + recipient email +
     exportType + date range (+ truncated failure reason for the failed-email
     case) rather than a per-request export id, since a client-side retry of the
     export POST re-runs the whole generation pipeline and would mint a new
     export id every time — a content-shaped key is what actually collapses
     retries. `sendExportStaleEmail` untouched, per the note (already guarded
     by `exportSnapshotService.js`'s atomic `UPDATE ... WHERE status <> 'invalidated'`).
  2. `emailReminderService.js`'s three reminder flows (trial lifecycle,
     review-queue, cancellation-ending-soon) replaced their non-atomic
     `loadReminderState` SELECT → send → `saveReminderState` upsert with a new
     `claimReminderState()` that claims atomically in one round trip via
     `business_email_reminders`' existing `(business_id, reminder_key)` unique
     constraint — `INSERT ... ON CONFLICT DO NOTHING` for the one-shot keys
     (trial/cancellation reminders, claimable exactly once ever), `ON CONFLICT
     DO UPDATE ... WHERE last_sent_at < NOW() - cooldown` for the repeatable
     review-queue key. Claim happens before the send, matching
     `usageLimitEmailService.js`'s `claimThresholds()` exactly, including its
     accepted trade-off: a send failure after a won claim is not retried until
     the key is eligible again, rather than inventing a rollback-on-failure
     scheme the reference implementation doesn't have either. Removed
     `saveReminderState`, dead after the replacement; kept `loadReminderState`
     as the review-queue flow's cheap non-atomic pre-filter (avoids a recipient
     lookup for businesses still inside the 14-day cooldown), with the atomic
     claim as the actual authoritative gate right before send — same
     two-layer shape `usageLimitEmailService.js` already uses.

  Both files had zero prior test coverage. Added `tests/exportEmailService.test.js`
  (8 tests: reserve-before-send, skip-on-lost-reservation, mark-failed-on-provider-error,
  distinct requests get distinct keys for both generated and failed emails, and a
  no-op-without-opt-in case) and `tests/emailReminderService.test.js` (14 tests
  covering `claimReminderState` directly for both the one-shot and cooldown
  shapes, all three send flows' claim-wins/claim-lost/pre-check paths, and — the
  test that actually demonstrates the bug is fixed — two concurrent
  `sendTrialLifecycleReminders` runs against one shared mock table, asserting
  exactly one of the two sends. Full suite via `npm run test:all`:
  **1588/1588 passing** (plus 3/3 ASVS controls) — 22 more than the pre-existing
  baseline, all new. Phase 9 reaches **5/5**.

- **PR 37** (`docs/recompute-tracker-percentage`): no code change, tracker
  correction. A user question about how "Phase 9 of 10 done" squared with a
  64% headline number prompted an actual recount instead of trusting either
  figure. Counting every `- [x]`/`- [~]`/`- [ ]` marker in the file directly
  (54 total, matching the stated denominator) gives 40 `[x]` + 10 `[~]` = 45.0,
  not the 34.75 the headline claimed after PR 36's edit. Two phase headers had
  independently drifted from their own item markers: Phase 2 said `6.0 / 7`
  against 4 `[x]` + 3 `[~]` = 5.5, and Phase 4 said `3.75 / 5` against 2 `[x]`
  + 3 `[~]` = 3.5 — the latter isn't even a value 5 items scored at
  {0, 0.5, 1.0} can produce, a clear sign of hand-adjusted drift rather than a
  real recompute. Every other phase header already matched its own markers.
  This confirms the "recompute before ever changing the headline number" rule
  in this file's own legend had been violated repeatedly, including by PR 36
  itself, which only added +0.5 for Phase 9 instead of recomputing from
  scratch. Corrected both stale phase headers and the Overall line; every
  header now reconciles exactly with a direct marker count. **Overall: 45.0 / 54
  (~83%)** — a large jump, but it reflects work already done across many prior
  PRs that the drifting headline simply hadn't been credited for, not new work
  in this PR.

- **PR 38** (`docs/accept-support-secret-scope`): Phase 2, closes one of the
  ten `[~]` items — a user asked to work through all ten half-credit items,
  starting with two flagged as requiring an actual product/scope decision
  rather than a code fix. Re-read `routes/internalSupport.routes.js` and
  `middleware/requireSupportSecret.js` to confirm nothing had changed since
  the item was last scored: still a single shared secret, timing-safe
  comparison, durable audit logging, and a dedicated rate limiter — only
  per-agent identity and role/scope checks remain unbuilt. Rather than
  building that unilaterally (real feature work: API keys per support agent,
  a role model, none of it implied by anything already in the codebase) or
  leaving it stuck at half credit indefinitely, asked the product owner
  directly. **Decision**: the internal support API's shared-secret model is
  an accepted risk for the current operating model (one support surface, no
  external tooling needing individual attribution) — per-agent identity is
  deferred until that changes, not a gap to keep chasing. No code change;
  closing the item at full credit on the strength of that decision, same as
  how other explicitly-scoped-out audit findings in this file are handled.
  Phase 2 moves to **6.0/7**; Overall to **45.5/54 (~84%)**.

- **PR 39** (`docs/verify-error-envelope-and-test-coverage`): Phase 4, closes
  two more of the ten `[~]` items — both turned out to already be
  substantially done by the natural progress of the `asyncRoute`/`ApiError`
  rollout, just never re-verified and re-credited. Checked rather than
  assumed: grepped every `routes/*.js` file for any response shape other
  than `{ error }` and read each hit. The remaining ones are all legitimate,
  already-precedented exceptions — three webhook route files respond with
  their own `{ ok, ... }` shape (server-to-server, not client-facing;
  Plaid's was already accepted in PR 34), and `internalSupport.routes.js`
  keeps its own internal-tooling envelope consistently (a different consumer
  from the V3 browser client). One narrow, real exception flagged and left
  alone rather than silently ignored: `businesses.routes.js`'s
  `POST /provision-add-on` still returns `{ success, error }`; it wraps a
  live Stripe-compensation transaction and no V3 frontend caller was found
  for it, so it's not a safe drive-by edit. With that mapped, the "client-
  facing error envelopes normalized" item closes at full credit — the
  `{ error }` shape is now the de facto repo-wide standard, not just
  route-file-local. Separately, "representative tests for error status/
  code/message" also closes: 7 dedicated `tests/*RouteErrors.test.js` files
  exist plus inline coverage from every rollout PR, spanning V1 CRUD, V2
  CRUD, business logic, and complex domain-error cases — a natural byproduct
  of the same rollout, not separate effort. No code change, both items
  closed by verification. Phase 4 moves to **4.5/5**; Overall to
  **46.5/54 (~86%)**.

- **PR 40** (`chore/test-webhook-signature-rejection`): Phase 2, closes
  another of the ten `[~]` items. The source finding was "Add CSRF/origin
  tests for representative mutating API routes **and allowed webhook
  exceptions**" — `tests/csrfE2E.test.js` already covered the CSRF half
  well (route-inventory + e2e token cases) and had a test confirming the
  billing webhook is *structurally* exempt from CSRF, but nothing verified
  the exemption is actually safe. Read `verifyWebhookSignature` in
  `routes/billing.routes.js` directly: it rejects a missing signature, a
  malformed header, a signature from the wrong secret, a tampered body, and
  a timestamp outside the 5-minute tolerance window — all correct — but
  zero test coverage exercised any of those paths at the HTTP level before
  this. Added 6 tests to `tests/billingWebhook.test.js` covering each
  rejection path (asserting 400 and that subscription sync/free-plan
  fallback never run) plus a secret-rotation case (a valid signature among
  multiple `v1=` values is still accepted). Full suite via
  `npm run test:all`: **1594/1594 passing** (plus 3/3 ASVS controls) — 6
  more than the pre-existing baseline, all new. Phase 2 moves to **6.5/7**;
  Overall to **47.0/54 (~87%)**.

- **PR 41** (`chore/test-migration-checksum-script-safety`): Phase 3, closes
  another of the ten `[~]` items. Read `scripts/repair-migration-checksums.js`
  directly instead of assuming the "split" needed new code: it already
  existed functionally — `migrations:verify-checksums`/
  `migrations:repair-checksums` are two distinctly-named npm commands
  resolving to the same script, gated by a hard default (no `--write` means
  read-only, reports drift and exits non-zero without mutating anything).
  What was missing was proof — zero test coverage meant nothing would catch
  a regression to that default. Added a `require.main === module` guard and
  exported `parseArgs`/`buildDriftReport`/`main` (same pattern as
  `scripts/check-child-business-fk-readiness.js`, which already does this
  for testability), then added 9 tests: argument parsing, drift/missing-file
  detection, and the actual safety property — no `--write` throws without
  issuing a single `UPDATE`, `--write` performs the scoped repair inside a
  transaction, no-drift is a no-op regardless of flags, and missing
  applied-migration files refuse to repair even with `--write`. Full suite
  via `npm run test:all`: **1603/1603 passing** (plus 3/3 ASVS controls) — 9
  more than the pre-existing baseline, all new. Phase 3 moves to **5.0/6**;
  Overall to **47.5/54 (~88%)**.

- **PR 42** (`chore/pin-nixpacks-node-version`): Phase 3, closes another of
  the ten `[~]` items. Checked both of the audit's original Docker/Nixpacks
  findings against current `main` before assuming either was still open —
  both were already fixed (Nixpacks has a real build phase verifying
  `public/app-v3/index.html`; every install step already uses `npm ci`).
  What was still genuinely inconsistent: `Dockerfile` pins
  `node:20-bookworm-slim` but both `nixpacks.toml` files used the
  unversioned `nixPkgs = ["nodejs"]`. Pinned both to `nixPkgs =
  ["nodejs_20"]` and added `"engines": {"node": "20.x"}` to `package.json`.
  Added 2 tests to `tests/frontendV3BuildPipeline.test.js`: Node major
  version agreement across Dockerfile/nixpacks/package.json, and that the
  root and API-local `nixpacks.toml` files stay semantic mirrors of each
  other (confirmed by diffing them directly — they differ only by a `cd
  In-Ex-Ledger-API && ` prefix and incidental TOML line-wrapping). Full
  suite via `npm run test:all`: **1605/1605 passing** (plus 3/3 ASVS
  controls) — 2 more than the pre-existing baseline, all new. Phase 3 moves
  to **5.5/6**; Overall to **48.0/54 (~89%)**.

- **PR 43** (`chore/enrich-central-error-handler`): Phase 2, closes the last
  of the ten `[~]` items in this phase (Phase 2 reaches **7/7**). Rather
  than rolling `buildRouteErrorContext` out file-by-file across the ~19
  remaining route files — a huge, mostly-redundant lift now that 38 of 40
  files already run through `asyncRoute` — enriched the one mechanism that
  already serves all of them: `server.js`'s central error handler. It was
  missing `err.code`, `err.constraint`, `userId`, and route params compared
  to `buildRouteErrorContext`'s shape. Route params turned out to be a real
  gap, not a cosmetic one: wrote the test first and watched it fail —
  Express resets `req.params` to `{}` as an error bubbles up past the
  route-specific layer that matched it, so a central app-level handler can
  never read `req.params` directly. Fixed properly instead of dropping the
  field: `asyncRoute` (`utils/apiError.js`) now snapshots non-empty
  `req.params` onto the error as `err.routeParams` while it's still valid,
  and the central handler reads that. Mirrored the same enrichment in
  `tests/helpers/testPool.js`'s `attachCentralErrorHandler` so the real
  handler and the shared test fixture stay in sync, per the project's own
  established discipline for that file. Also found and removed 3 redundant
  raw-`Error`-object `logError()` calls in `routes/receipts.routes.js`
  (`POST /`, `PATCH /:id/attach`, `DELETE /:id`) — each logged the
  unsanitized error and then rethrew it anyway, so it was already being
  logged a second time, more richly, by the central handler; pure
  duplication of the exact pattern this item exists to remove.
  `transactions.routes.js` keeps its existing direct `buildRouteErrorContext`
  usage as-is, since it threads route-specific `businessId` into `extra`,
  which the central handler can't do generically. Added 9 tests (5 in
  `testPoolHelpers.test.js`, 4 in `apiError.test.js`, including the
  no-clobber-if-`routeParams`-already-set case). Full suite via
  `npm run test:all`: **1614/1614 passing** (plus 3/3 ASVS controls) — 9
  more than the pre-existing baseline, all new. Overall to
  **48.5/54 (~90%)**.

- **PR 44** (`chore/two-tier-env-validator`): Phase 3, closes the last of
  the ten `[~]` items in this phase (Phase 3 reaches **6/6**). Asked the
  user directly what to do about the item's one remaining real open
  question (should the inbound-email secrets become required) rather than
  deciding unilaterally; the answer was to build the two-tier design and
  doc without changing which vars are currently required, leaving that
  question as a documented exception. Rewrote `envValidationService.js`'s
  flat required-list into an explicit `ENV_VARIABLE_REGISTRY`
  (`{ name, tier: "core" | "production", reason }`) plus a separate
  `OPTIONAL_FEATURE_ENV_VARIABLES` list documenting the inbound-email
  secrets and their fail-closed 503 behavior; `collectRequiredEnvironmentVariables`
  now derives its output from the registry. Verified behavior preservation
  the direct way: ran the full pre-existing `tests/envValidationService.test.js`
  unchanged against the new implementation — all 13 passed with zero edits,
  confirming the required-variable set for both `production` and
  non-production is byte-identical to before this PR. Added 4 tests locking
  in the registry's own shape. `Docs/PRODUCTION-READINESS.md` turned out to
  be badly stale (dated 2026-06-07) — missing 6 vars from its required list
  that code has actually required since an earlier PR
  (`INEX_LEDGER_SUPPORT_SECRET`, `REDIS_URL`, `PDF_WORKER_URL`,
  `PDF_WORKER_SECRET`, `EXPORT_PUBLIC_KEY_JWK`, `EXPORT_PRIVATE_KEY_JWK`).
  Rewrote its "Required environment variables" section as a real matrix
  matching the registry exactly, plus a feature-gated table with each
  optional secret's fail-closed behavior. Full suite via `npm run test:all`:
  **1618/1618 passing** (plus 3/3 ASVS controls) — 4 more than the
  pre-existing baseline, all new. Overall to **49.0/54 (~91%)**.

- **PR 45** (`chore/convert-auth-routes-batch-1`): Phase 4, first batch on
  the last of the ten `[~]` items — the `asyncRoute`/`ApiError` rollout is
  now down to one real file. 38 of 40 route files already use the pattern
  (8 more landed from outside this chat since PR 35); the only two holdouts
  were `auth.routes.js` (2551 lines, 23 routes, the largest remaining file
  by a wide margin) and `region.routes.js` (verified not applicable — a
  single sync handler with one static 503 branch, nothing to unify).
  Converted the first 7 of `auth.routes.js`'s 23 routes:
  `/register`, `/send-verification`, `/complete-verified-signup`, `/login`,
  `/refresh`, `/logout`, `GET /verify-email`. Given the file's size and
  security sensitivity, splitting the conversion into batches rather than
  one large diff, matching how every other large file in this rollout
  (`billing.routes.js`, `transactions.routes.js`, `exports.routes.js`) was
  handled.

  `/login` and `/refresh` needed real care: both had a `try/catch` whose
  `catch` translated one specific error into a specific response and
  otherwise fell back to a generic 500 — converting the 400/401/403/423
  branches to `throw new ApiError(...)` without also fixing the `catch`
  would have meant its own fallback caught those intentional throws too and
  reported them as 500. Fixed by having the `catch` only handle the one
  case it exists for and rethrow everything else unchanged.

  **Real bug caught by writing the test first, not by inspection**:
  `/login`'s transient-infrastructure-error path threw
  `ApiError(503, "Sign-in is temporarily unavailable...")`, but
  `server.js`'s central handler replaces the message of *any* status >= 500
  with a generic "Internal server error" by design. That deliberately
  user-facing 503 message would have been silently lost the moment this
  shipped. Fixed by keeping it a direct response instead of a throw — the
  same "extra info the central handler can't carry" exception class as
  `AccountingPeriodLockedError` elsewhere in this rollout, just for the
  message itself. Checked whether the same mistake already existed anywhere
  on `main`: it did, in two files converted in earlier, unrelated batches —
  `crypto.routes.js`'s `GET /export-public-key` and three spots in
  `messages.routes.js` — both silently swallowing a deliberate 503 message
  right now. Fixed all three the same way, and strengthened
  `tests/cryptoRoutes.test.js`'s existing test for that path (it asserted
  the status code but never the body, so it hadn't caught the bug it was
  sitting right next to).

  Added `tests/authRouteErrors.test.js` (10 tests) and one new test in
  `tests/cryptoRoutes.test.js`. Full suite via `npm run test:all`:
  **1629/1629 passing** (plus 3/3 ASVS controls) — 11 more than the
  pre-existing baseline, all new. Route-file count stays at **38 of 40**
  (not counting `auth.routes.js` until it's fully converted); Phase 4 and
  Overall unchanged — 16 more routes to go in follow-up PRs.

- **PR 46** (`chore/convert-brittle-source-shape-tests`): Phase 1, closes
  the last of the ten `[~]` items in this phase (Phase 1 reaches **6/6**).
  The user's instruction for this item was specific: don't convert
  everything that reads source as text — inventory first, convert only the
  genuinely brittle implementation-detail tests, and explicitly keep
  source-level checks where the thing being protected really is a
  source-level rule. Delegated the 22-file inventory to a background
  research agent while other work continued; it came back with roughly
  9 genuine offenders, concentrated in `tests/frontendV3ApiContracts.test.js`
  (2) and `tests/frontendV3Wiring.test.js` (5), plus one each in
  `tests/startupMigrationSafety.test.js` and `tests/internalSupportRoutes.test.js`.

  For the two API-contract mapper tests and three of the `frontendV3Wiring`
  tests, built a small `vm` + real-`typescript`-compiler loader (following
  the precedent already set by `tests/frontendV3Navigation.test.js`) that
  transpiles a `lib/*.ts` file and runs it in a sandbox with a stubbed
  `require` for its own relative imports, so the tests call the actual
  exported function against real inputs instead of regexing the source.
  `mapTransaction` (`transactionsApi.ts`), `mapLegacyUser` (`authApi.ts`),
  and `resolveEstimatedTaxProfile` (`transactionsApi.ts`) were all
  module-private — exported all three specifically to make this possible,
  the same "export the pure function for testability" pattern
  `navigation.ts` already used for its own tests. The two `apiClient.ts`
  tests needed a further step: `apiClient.ts` isn't a pure function, it
  drives `fetch`/`document.cookie`/`window.location`, none of which exist
  in a bare `vm` context — built a minimal sandbox providing a scripted
  `fetch` mock plus a cookie-jar-backed `document` stub, then asserted on
  the actual request sequence (a 401 triggers exactly one refresh and one
  retry; a stale-CSRF 403 on a multipart request triggers exactly one
  `/api/me` refresh and one retry carrying the new token, with the
  multipart body's `Content-Type` never set). Cross-realm `assert.deepEqual`
  on plain objects returned from the `vm` sandbox fails on prototype
  identity even when the values are equal — switched those specific
  assertions to a `JSON.stringify` comparison instead of chasing a false
  regression.

  For the two tests where full behavioral conversion wasn't proportionate
  (no React/jsdom harness exists in this repo to actually drive
  `Receipts.tsx`'s debounce, and `startServer()`'s DB-before-listen
  ordering needed real module mocking rather than a pure-function export),
  took the calibrated middle path the user's instruction allowed: relaxed
  the literal magic-number/private-var-name pins that made them brittle
  (`Receipts.tsx`'s debounce `275` and `searchSequenceRef` name; the
  root-landing favicon's exact `?v=20260726a` cache-bust value) while
  keeping them as source checks for the structural invariant that
  actually matters, and for `startupMigrationSafety.test.js`'s
  server-init-before-listen test, went ahead and built the real thing: it
  now requires `server.js`/`db.js` fresh, spies on the real `initDatabase`
  and `app.listen`, calls the real `startServer()`, and asserts the actual
  call order rather than comparing `indexOf` positions in a source slice.
  The legacy-auth-defaults test (JWT expiry / cookie maxAge / refresh rate
  limit) got a hybrid fix: the JWT expiry is now checked by signing a real
  token via the exported `signToken` and decoding its lifetime; the other
  two constants aren't exported, so they stay source checks but assert on
  numeric magnitude instead of pinning literal `60 * 60`/`120` formatting.

  Investigated `tests/internalSupportRoutes.test.js`'s rate-limiter-before-
  secret-check test last, expecting to convert it the same way (fire
  enough requests to trigger a real 429). Concluded it shouldn't change:
  unlike the other `indexOf` cases, `router.use(A); router.use(B)` order in
  an Express router *is* the actual runtime behavior (Express always runs
  middleware in registration order) — the existing check isn't a brittle
  proxy for the invariant, it already tests the invariant directly.
  Reaching a real 429 in this test environment would need either running
  in production mode or new rate-limiter store-injection plumbing, for a
  check that was already faithful — left unchanged as a legitimate
  source-level rule, per the user's own carve-out for exactly this case.

  Full suite via `npm run test:all`: **1631/1631 passing** (plus 3/3 ASVS
  controls) — 2 more than the pre-existing baseline (net, after removing
  and replacing several regex-only tests with fewer, higher-value behavior
  tests). `frontend-v3` type-checks (`tsc -b --noEmit`) and builds clean.
  Overall to **49.5/54 (~92%)**.

- **PR 47** (`chore/convert-auth-routes-batch-2`): Phase 4, final batch,
  closes the last of the ten `[~]` half-credit items identified at the
  start of this PR sequence (Phase 4 reaches **5/5**). Converted the
  remaining 16 of `auth.routes.js`'s 24 routes: `/change-password`, the
  full MFA cluster (`mfa/status`, `mfa/reauth`, `mfa/enable`,
  `mfa/disable`, `mfa/verify`, `mfa/resend`, `verify-email/send-code`,
  `verify-email/confirm-code`), the password/recovery cluster
  (`forgot-password`, `account-recovery`, `reset-password`,
  `recovery-email/request`), and the email-change cluster
  (`request-email-change`, `confirm-email-change` POST,
  `GET /confirm-email-change`, `GET /confirm-recovery-email`) — the last
  two of which are browser-opened email links, kept on their existing
  plain-text/redirect response bodies (same reasoning as `GET
  /verify-email` in the first batch), wrapped in `asyncRoute` purely for
  unhandled-throw safety. Route-file count reaches **39 of 40**
  (`region.routes.js` remains the one confirmed-N/A exception).

  Most of the converted routes' `try/catch` blocks were pure "log and
  return a generic 500" fallbacks with no real translation logic, so
  converting them meant deleting the `try/catch` outright — `asyncRoute`
  now does that job, and since the central handler already discards any
  message on a >=500 error, nothing observable changes by removing it.
  `/mfa/verify` and `/mfa/resend` needed the same restructuring `/login`
  needed in the first batch: their `catch` blocks translate *any* caught
  error (including a raw JWT-verify exception) into a specific non-500
  status, so converting their internal branches to `throw new
  ApiError(...)` without fixing the `catch` would have let it re-swallow
  those intentional throws into its own generic message. Fixed with the
  same pattern: `if (err instanceof ApiError) throw err;` before the
  route's own real translation logic.

  Re-running the full suite surfaced one unrelated, pre-existing gap:
  `tests/authDeviceVerification.test.js` had its own ad hoc `buildApp`
  error handler that always returned 500 regardless of `err.status` —
  stale infrastructure predating this rollout's shared
  `attachCentralErrorHandler` convention. It had gone unnoticed because
  none of that file's tests previously routed a genuinely-thrown non-500
  error through it; `/mfa/verify`'s newly-thrown `EmailNotVerifiedError`
  (403) was the first to, and a real test caught it (expected 403, got
  500). Fixed by swapping in the shared `attachCentralErrorHandler` from
  `tests/helpers/testPool.js` instead of patching the local one — the same
  fixture already used throughout this whole rollout.

  Full suite via `npm run test:all`: **1631/1631 passing** (plus 3/3 ASVS
  controls; net test count unchanged from the previous PR — this batch's
  fix was to an existing test's fixture, not new test additions). Overall
  to **50.0/54 (~93%)** — all ten of the original half-credit `[~]` items
  from this PR sequence are now closed.

- **PR 48** (`fix/stripe-idempotency-and-export-dedupe-identity`): Phase 9.
  With all ten original `[~]` items closed, went back and specifically
  re-verified the two Phase 9 items that had been marked `[x]` on the
  strength of "the dedupe/idempotency machinery is wired in," without
  independently checking that the *keys themselves* were correct. Both
  turned out to have real, user-identified bugs.

  **Stripe mutation idempotency**: `buildStripeMutationIdempotencyKey`'s
  keys on `/cancel`, `/customer-portal/cancel`, `/resume`, and `PATCH
  /additional-businesses` were built purely from the operation name,
  business scope, and *desired end-state* — no per-attempt component.
  Cancel, then resume, then cancel again produced the exact same key for
  both cancel calls, since both want `cancel_at_period_end: true`; Stripe
  would silently replay the first cancel's cached response instead of
  performing the second one. Same collision for repeating an
  additional-businesses quantity or an interval switch after an
  intervening change. Fixed by requiring a client-supplied
  `mutationAttemptId` (fresh UUID per user-initiated action) on all four
  routes and folding it into the key — mirroring `checkoutAttemptId`'s
  already-correct pattern on checkout, which was the one mutation route
  that had never had this bug. `customer-create` and
  `portal-configuration`'s desired-state-hash keys were deliberately left
  alone, since those two are supposed to be idempotent forever (one Stripe
  customer/portal-config per resource), unlike the four mutation routes.
  New `tests/stripeMutationIdempotency.test.js` (6 tests) proves all three
  scenarios the user named by name — cancel → resume → cancel, additional
  businesses 2 → 1 → 2, repeated interval switch — plus retry-key reuse and
  400s for a missing/malformed attempt id. Updated the existing billing
  route tests across `billingAddonManagement.test.js` and
  `billingCurrencyResolution.test.js` to send the now-required attempt id.

  **Export email dedupe identity**: `sendExportGeneratedEmail`/
  `sendExportFailedEmail` keyed their dedupe entries on
  business/recipient/type/date-range only — no reference to *which*
  export. Two separate exports for the identical date range collided on
  the same key, silently swallowing the second export's email as a false
  duplicate. Fixed by threading through the real per-operation identity:
  `exportId` (minted fresh per successful `storeCompletedExport` call) for
  the generated-email case, and an `exportAttemptId` for the failed-email
  case (the grant flow's own single-use `jti`; a fresh UUID minted once
  per request for the direct `secure-export` flow, since nothing gets
  persisted on failure). 4 new tests in `tests/exportEmailService.test.js`.

  **Stale reserved-email recovery**: separately, `email_delivery_dedupe`'s
  `reserveEmailDelivery` could only ever reclaim a `'failed'` row — a row
  stuck in `'reserved'` because the process died between reserving and
  marking sent/failed stayed reserved forever, silently blocking every
  future genuine send at that exact key. Added a 15-minute stale-reservation
  timeout to the same `ON CONFLICT ... WHERE` clause (parameterized, not
  string-interpolated, following this file's existing `$n::bigint *
  INTERVAL` convention); `'sent'` rows stay protected indefinitely
  regardless of age, `'failed'` rows keep their existing immediate-retry
  behavior. 5 new tests in `tests/emailDeliveryDedupeService.test.js`.

  **Incidental fix**: while adding the exportId/exportAttemptId plumbing,
  found `routes/exports.routes.js`'s `POST /secure-export` declaring
  `user`/`businessId` with `const` *inside* its `try` block while
  referencing both in the `catch` block — invalid JS scoping, confirmed
  with a standalone repro to throw `ReferenceError` on every genuine
  failure of that route. This meant the route's own failure response (and
  the "export failed" email this same PR was adding coverage for) had
  never actually run on a real failure; the request just hung. Fixed by
  hoisting both declarations above the `try`.

  Full suite via `npm run test:all`: **1646/1646 passing** (plus 3/3 ASVS
  controls) — 15 more than the pre-existing baseline, all new. Phase 9
  stays at **5/5** (both items' bullet text now documents the gap that was
  found and the fix that closed it, rather than silently keeping the old
  claim). Overall recomputed directly from the checklist markers (50 `[x]`
  + 4 `[ ]` = 54 total, matching every phase header's own sum): unchanged
  at **50.0/54 (~93%)**.

- **PR 49** (`claude/billing-ui-checkout-updates-673wux`): Phase 10, closes
  the initiative. All four items were documentation/archival work, no
  application code changed.

  Ran two background research agents first (one over
  `Work-Review`/`Work-To-Do`/`Work-Completed`, one over `Docs/`), each told
  explicitly to research only and not touch files, then independently
  spot-verified every finding against real code before acting — same
  discipline as every prior PR in this tracker.

  **Docs fixed to match code**: `Docs/DEPLOYMENT.md` (`JWT_EXPIRY_SECONDS`
  default was documented as 900, actually 3600; `EXPORT_GRANT_TTL_MS`
  default was documented as 300000, actually 60000; a `/health` field name
  was wrong; Stripe checkout's entry page was documented as a dead
  `/html/subscription.html`), `Docs/ACCOUNTING_TRUST_RULES.md` (wrong GDPR
  export route in two places; a "restore not supported" claim that's been
  false since `POST /api/transactions/undo-delete` shipped),
  `Docs/BACKUP-RESTORE.md` (wrong `receiptStorage` mode value),
  `Docs/MAINTENANCE-SCRIPTS.md` (a subsection about a root
  `scripts/log_scan.js` that doesn't exist — removed),
  `Docs/API_ROUTE_INVENTORY.md` (added `GET /api/arap-summary` and
  `GET /api/exports/history`, both registered directly on `routes/index.js`
  and missing from the mount-prefix table), `Docs/CPA_CODEBASE_AUDIT_MATRIX.md`,
  `Docs/PRODUCT-BACKLOG.md`, and `Docs/REPO-GOVERNANCE.md` (all three had
  "files to audit" / owner-map paths pointing at the pre-V3 vanilla frontend;
  corrected to the real `frontend-v3/` files or the `legacy/public-html/`
  archive location). `Docs/STYLE_SPEC.md` and `Docs/CPA_EXPORT_DATASET_SPEC.md`
  were too large to safely rewrite byte-accurate in one pass, so each got an
  explicit staleness banner naming the concrete drift instead of silently
  staying wrong.

  **Stale docs archived**: moved to `Work-Completed/` with a "STATUS: DONE"
  banner explaining the specific contradiction — `CRITICAL_SWEEP.md`,
  `CURRENT_LAUNCH_BLOCKERS_2026-06-07.md`, `SECURITY-LEGAL-READINESS-US-CANADA.md`,
  `OWNER-FILE-FOLLOWUP-WORK.md`, `UX-FUNNEL-AND-SETTINGS-IMPROVEMENTS.md`,
  `UNFINISHED-CLEANUP-WORK.md`, `IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md`
  (the latter two's entire premise — cleaning up the pre-V3 vanilla frontend —
  is moot now that frontend is archived, unreferenced dead code, not an
  actively developed surface), and `WORK-TO-DO-STATUS.md` (a stale
  2026-05-22 snapshot). `Docs/SECURITY_AUDIT_2026-06-10.md` moved to
  `Work-Review/` per this repo's own Docs-vs-Work-Review placement rule.
  `Work-Review/MUTATION_AUDIT.md`, a near-duplicate of
  `Docs/ACCOUNTING_TRUST_RULES.md`, got a "duplicate, not canonical" banner.
  `Work-To-Do/TERMS-OF-SERVICE-REVIEW-2026-05-20.md` was re-verified against
  the current `frontend-v3/src/pages/Terms.tsx` and correctly left open.

  **New architecture notes**: `Docs/AUTHENTICATION.md` gained a "Backend
  Session Model" section; new `Docs/STARTUP_AND_MIGRATIONS.md`; new
  `Docs/PAID_FEATURE_ENFORCEMENT.md` documents both the primary
  catalog/bridge/route gate and a second, separate, previously-undocumented
  gate (`api/utils/requireV2BusinessEnabled.js`'s `requireV2BusinessEnabled`/
  `requireV2Entitlement`) found while fixing the route inventory.
  `Docs/README.md` gained an "Architecture notes" index.

  **Final inventory**: no `.orig`/`.bak`/`.tmp`/`.rej` files, no dated
  recovery folders, no stray root `.md` files, no unexpected untracked files.

  Full suite via `npm run test:all`: **1646/1646 passing** (plus 3/3 ASVS
  controls) — unchanged from PR 48's baseline, as expected for a
  documentation-only PR. Phase 10 goes from 0/4 to **4/4**. Overall
  recomputed from the checklist markers (54 `[x]` + 0 `[ ]` = 54 total,
  matching every phase header's own sum): **54.0/54 (100%)** — this closes
  the AI-slop/overengineering remediation initiative tracked in this file.

- **PR 50** (`claude/billing-ui-checkout-updates-673wux`): tracker-only, no
  application code changed. After Phase 10 closed the initiative at 100%, the
  user asked for a fresh, independent, code-only review — explicitly
  excluding this tracker and every other doc, so the findings weren't just a
  rehash of prior audits. Five parallel background agents each read one full
  slice of the codebase (`routes/`, `services/`, backend infra/plumbing,
  frontend `pages/`+`components/`, frontend `lib/`+`hooks/`); every finding
  reported here was independently re-verified against real code (grep/read,
  not trust) before being added — including correcting one agent's own
  overstated claim (the pdf-worker item: verified the fake-PDF code path is
  actually dead/unreached in the live export flow, not "every customer
  download is invalid" as the agent first reported).

  Added four new phases (11-14, 38 action items, all `[ ]`) documenting what
  was found: Phase 11 (critical/high — a fully broken V2 feature area, a
  redacted-export tax-ID leak, a silent CPA-schedule-truncation bug, an
  orphaned pdf-worker microservice masquerading as required infrastructure,
  two frontend currency-display bugs, a dead UI button, duplicated
  compliance-critical export logic, duplicated-and-already-diverged webhook
  signature verification, an account-deletion endpoint leaking DB internals,
  a client-side tax estimate that can disagree with the backend's real one,
  and hard-deleted AR/AP records with no audit trail), Phase 12 (backend
  consistency/concurrency — inconsistent error-handling convention,
  duplicated MFA logic, double-applied entitlement middleware, DDL from a
  GET handler, untestable tax math embedded in routes, unlocked check-then-
  act races, silently swallowed decrypt failures, a non-transactional
  multi-step revert, a non-idempotent patch script still wired as an npm
  command), Phase 13 (frontend duplication/races — the duplicated
  currency-formatting helpers that directly caused two of Phase 11's bugs,
  duplicated attachment-validation logic, missing request-cancellation
  guards in two data hooks, brittle string-matched CSRF-retry detection,
  timezone-dependent invoice status, regex-over-label-text review
  classification), and Phase 14 (low-severity dead code and polish — two
  fully dead duplicate function declarations, a no-op metrics stub, an
  always-undefined API field, an out-of-place engineering comment shipped as
  PDF content, theatrical startup log lines, a global-window escape hatch
  around React's data flow, a hardcoded fallback secret, and assorted
  naming/duplication nits).

  Per this file's own stated rule ("recompute the overall score from the
  checklist instead of manually carrying the old number forward"), Overall
  changes from **54.0/54 (100%)** to **54.0/92 (~59%)** — not a regression in
  what shipped, but an honest reflection that a fresh independent pass found
  substantially more real work than the prior phases' scope covered. Fixing
  Phase 11-14 items is follow-up work, tracked here but not yet started.

- **PR 51**: Phase 11, 11.5/12. Worked through Phase 11 in the most
  efficient order available: the one confirmed-critical item first (a
  100%-broken feature), then batched the rest across direct edits and three
  parallel background implementation agents for the largest, most
  self-contained backend refactors (webhook-verification dedup,
  `/secure-export` dedup, AR/AP validation) — each agent's actual file
  changes were independently spot-verified (`node -c`, targeted
  `node --test` runs, and for the delegated work, re-reading the real diffs)
  before being trusted into this PR, per this file's own "verify, don't
  assume" discipline.

  Fixing item 1 (the critical `db.any`/`db.query` bug) surfaced a bigger
  problem than originally scoped: the identical bug existed in
  `vendorService.js`, `customerService.js`, `invoiceService.js`,
  `billService.js`, and `arApService.js` too — the entire V2/Business tier
  (Vendors, Customers, Invoices, Bills, AR/AP summary), not just
  Projects/Billable Expenses, was 100% non-functional. All seven services
  were fixed the same way and proven with a new regression test file
  (`tests/v2BusinessCrudServices.test.js`) confirmed to fail against the
  pre-fix code and pass against the fix.

  Fixing item 2 (the PDF redacted-export tax-ID leak) and item 3 (silent
  CPA-schedule row-truncation) in the same file surfaced dead code: two
  functions (`buildVehicleAuditSchedule`, `buildQuickMethodRemittancePage`)
  were each declared twice, with function-hoisting silently picking the
  second (buggy) copy — both dead first copies were deleted, and truncation
  was replaced with real multi-page chunking mirroring this file's own
  existing working pattern.

  Fixing item 4 (the pdf-worker item) split into what was and wasn't worth
  doing: the false "required in production" env-validation claim was
  corrected (moved to the optional-feature tier with an honest reason,
  keeping `Docs/PRODUCTION-READINESS.md` in sync per its own stated rule),
  and two real security bugs in the still-deployed worker were fixed
  (spoofable `X-Forwarded-For` trust, non-timing-safe secret comparison) —
  but the worker's fake-PDF-content generator itself was deliberately left
  alone since it's confirmed dead code with no live caller.

  Items 5-7 (Exports.tsx's dead "Custom" button and stuck preset highlight,
  Invoices.tsx's currency-collapsing bug, RecurringTemplatesWorkflow.tsx's
  hardcoded USD) were fixed together as one cohesive frontend pass: a new
  shared `frontend-v3/src/lib/money.ts` centralizes `formatMoney`/
  `getActiveCurrency` (removing the duplicated-and-buggy per-page copies
  that let two of these three bugs ship undetected — this is the same root
  cause flagged separately as Phase 13's first item), plus the Exports.tsx
  date-preset state fix.

  Item 11 (the frontend's own hardcoded, stale-every-tax-year tax-bracket
  estimate diverging from the backend's real `se_tax_estimate`) was fixed by
  adding `loadTaxSetAside()` to `analyticsApi.ts` and wiring the real
  backend figure into the Transactions page in place of the local
  computation — the fabricated per-province rate table was deleted outright.
  This required updating two tests that had been pinning the old bug as
  expected behavior, including one that literally asserted the exact
  per-province hardcoded rates were correct.

  Item 12 (AR/AP hard-delete with no validation or audit trail) is the one
  item scored `[~]` rather than `[x]`: validation was added in full (new
  `services/v2BusinessValidationService.js`, wired into all four services),
  but the soft-delete/audit-trail half was deliberately not implemented
  after confirming via the actual migrations
  (`db/migrations/20260419_create_v2_business_tables.sql`) that none of
  these four tables have the schema columns soft-delete would need — adding
  a migration was judged out of proportion for this pass, so each hard-delete
  function now carries a code comment naming the gap instead of silently
  leaving it undocumented.

  Full suite via `npm run test:all`: **1719/1719 passing** (plus 3/3 ASVS
  controls) — 73 more than the prior 1646 baseline, all new regression
  coverage for this PR's fixes. Frontend verified via `tsc -b` (clean) and
  `npm run build` (clean); no frontend test harness exists in this repo to
  extend, so type-checking plus a production build is this codebase's
  established verification bar for frontend-only changes. Phase 11 goes
  from 0/12 to **11.5/12**. Overall recomputed from the checklist markers
  (65 `[x]` + 1 `[~]` + 26 `[ ]` = 92 total, matching every phase header's
  own sum): **65.5/92 (~71%)**.
