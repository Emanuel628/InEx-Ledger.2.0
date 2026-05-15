# Codebase Audit Triage - Medium

Source: Claude full-repo audit, reorganized for execution.

Rules used here:
- Sorted from shortest expected fix to longest expected fix.
- Grouped when the same fix shape touches nearby files.
- Estimates are rough engineering effort, not calendar time.

## 15-30 minutes

### Quick validation and copy fixes

- [ ] 15-30 min - Trim and reject blank account names consistently on create and update.
  Files: `In-Ex-Ledger-API/routes/accounts.routes.js`
  Group: Accounts validation
  Covers: whitespace-only names, `PUT` guard allowing silent no-op / null behavior

- [ ] 15-30 min - Add client-side MFA input sanity checks and make "Trust this device" opt-in.
  Files: `In-Ex-Ledger-API/public/html/mfa-challenge.html`, `In-Ex-Ledger-API/public/js/mfa-challenge.js`
  Group: MFA UX hardening
  Covers: pre-checked trust box, no 6-digit validation, no maxlength

- [ ] 15-30 min - Fix incorrect UI copy in change-email and transactions CSV import hints.
  Files: `In-Ex-Ledger-API/public/html/change-email.html`, `In-Ex-Ledger-API/public/html/transactions.html`
  Group: Auth and import copy
  Covers: change-email destination copy, duplicate-warning mismatch with `skip_duplicates`

- [ ] 15-30 min - Fix login password autocomplete to `current-password`.
  Files: `In-Ex-Ledger-API/public/html/login.html`
  Group: Login UX
  Covers: password manager autofill breakage

- [ ] 15-30 min - Add null checks in category modal reset and stop overwriting change handlers.
  Files: `In-Ex-Ledger-API/public/js/categories-backend.js`
  Group: Categories frontend safety
  Covers: missing null check on `category-color`, `select.onchange` overwrite

- [ ] 15-30 min - Fix the verify-email success/error styling regression in `consumeVerifiedSessionFromHash`.
  Files: `In-Ex-Ledger-API/public/js/verify-email.js`
  Group: Verify-email UX
  Covers: success message rendered with error styling

- [ ] 15-30 min - Add missing cache-buster consistency and asset hygiene where the page is already being touched.
  Files: `In-Ex-Ledger-API/public/html/pricing.html`, `In-Ex-Ledger-API/public/html/subscription.html`, legal page asset tags
  Group: Asset hygiene
  Covers: missing pricing CSS cache-buster, mixed asset versions on subscription page, uncached `privacy.js`

## 30-60 minutes

### Repeated app-shell and navigation issues

- [ ] 30-60 min - Replace the hardcoded user-pill content with the real authenticated user/business chrome on all affected pages.
  Files: `In-Ex-Ledger-API/public/html/accounts.html`, `categories.html`, `receipts.html`, `sessions.html`, `settings.html`, `help.html`, plus any remaining app pages using the same static pill
  Group: Shared app chrome
  Covers: hardcoded `U / InEx Ledger` or `U / Guide` across multiple pages

- [ ] 30-60 min - Standardize relative vs root-relative nav/footer links across auth, marketing, legal, and app pages.
  Files: `landing.html`, `pricing.html`, `register.html`, legal pages, sessions page, other affected templates
  Group: Link normalization
  Covers: `privacy` vs `/privacy`, `terms` vs `/terms`, broken relative app nav on sessions

- [ ] 30-60 min - Add `noindex` meta tags to authenticated app pages that currently rely only on server headers.
  Files: authenticated HTML templates broadly
  Group: Search indexing
  Covers: missing page-level `robots` meta on app pages

- [ ] 30-60 min - Add basic accessibility attributes to billing and modal controls that are already structurally present.
  Files: `subscription.html`, `pricing.html`, `transactions.html`
  Group: A11y markup
  Covers: missing dialog roles, missing `aria-pressed`, missing focus movement / announcement wiring targets

- [ ] 30-60 min - Add missing email-format and password-complexity client validation to recovery pages.
  Files: `In-Ex-Ledger-API/public/js/forgot-password.js`, `In-Ex-Ledger-API/public/js/reset-password.js`
  Group: Recovery page UX
  Covers: no email format check, no client-side password-strength feedback

- [ ] 30-60 min - Fix `POST /api/consent/cookie` to require CSRF protection.
  Files: `In-Ex-Ledger-API/routes/consent.routes.js`
  Group: Consent write protection
  Covers: cross-origin consent flipping

- [ ] 30-60 min - Add missing timeouts to slow external/network-backed requests.
  Files: `In-Ex-Ledger-API/routes/transactions.routes.js`, `In-Ex-Ledger-API/public/js/privacyService.js`
  Group: Request timeout hygiene
  Covers: Frankfurter FX proxy timeout, privacy health-check timeout

### Data-shape and input validation

- [ ] 30-60 min - Add server-side max-length validation for the common free-text fields already identified.
  Files: `accounts.routes.js`, `transactions.routes.js`, `me.routes.js`
  Group: Text input bounds
  Covers: account names, transaction descriptions, transaction notes, onboarding/business/profile names

- [ ] 30-60 min - Add explicit whitelists and normalization for category tax mapping and region/fiscal-year inputs.
  Files: `categories.routes.js`, `businesses.routes.js`, `settings.html` / `settings.js`
  Group: Tax and region normalization
  Covers: arbitrary `tax_map_us` / `tax_map_ca`, untrimmed region values, `YYYY-MM-DD` vs `MM-DD` fiscal-year mismatch

- [ ] 30-60 min - Normalize email parsing behavior across auth and email-verification code paths.
  Files: `auth.routes.js`, `check-email-verified.routes.js`
  Group: Email normalization
  Covers: different normalization rules between route files

## 1-2 hours

### Frontend state and lifecycle issues

- [ ] 1-2 hours - Stop long-lived background fetchers and window/global data leaks on Accounts and Receipts.
  Files: `In-Ex-Ledger-API/public/js/accounts.js`, `In-Ex-Ledger-API/public/js/receipts.js`
  Group: Frontend lifecycle cleanup
  Covers: leaked `window.__accountsCache`, uncleared `setInterval`, repeated full `/api/transactions` refresh, bare `fetch()` on upload/preview, object URL timeout behavior

- [ ] 1-2 hours - Replace the verify-email infinite poll loop with a bounded retry window and a visible fallback state.
  Files: `In-Ex-Ledger-API/public/js/verify-email.js`
  Group: Verify-email polling
  Covers: endless 3-second polling loop

- [ ] 1-2 hours - Fix onboarding tour/runtime issues and province validation bypass.
  Files: `In-Ex-Ledger-API/public/js/onboarding.js`, `In-Ex-Ledger-API/public/js/onboarding-page.js`, `In-Ex-Ledger-API/public/html/onboarding.html`
  Group: Onboarding runtime
  Covers: missing `getWorkTypeTourNote`, JS-submitted form bypassing native province validation, dead hidden business type field, duplicated region storage keys

- [ ] 1-2 hours - Fix transactions pagination/selection implementation drift caused by duplicate function definitions and dead header-selection code.
  Files: `In-Ex-Ledger-API/public/js/transactions.js`
  Group: Transactions frontend consistency
  Covers: duplicate `renderPagination`, duplicate `wirePagination`, no-op `updateTransactionSelectionHeader`

- [ ] 1-2 hours - Fix the receipts confirm-dialog and date-parsing issues without relying on unsafe browser-native dialogs.
  Files: `In-Ex-Ledger-API/public/js/receipts.js`
  Group: Receipts UX integrity
  Covers: filename-fed `window.confirm()` spoofing, UTC-to-local receipt date drift

- [ ] 1-2 hours - Remove sensitive or semi-sensitive auth/bootstrap values from durable browser storage where session-scoped storage is sufficient.
  Files: `register.js`, `login.js`, `auth.js`
  Group: Frontend auth storage
  Covers: `verification_state`, `signup_bootstrap_token`, pending MFA token, full subscription object in localStorage

### Route correctness and guard consistency

- [ ] 1-2 hours - Add CSRF or more appropriate protection to the remaining state-changing auth routes and consistency-check their limiters.
  Files: `auth.routes.js`
  Group: Auth route consistency
  Covers: `POST /complete-verified-signup`, `POST /mfa/enable` limiter inconsistency

- [ ] 1-2 hours - Fix sessions route behavior around self-revoke, current-session visibility, and browser cookie cleanup.
  Files: `sessions.routes.js`, `public/js/sessions.js`
  Group: Sessions behavior
  Covers: dangling refresh cookie after revoke-all, no warning on revoking current session, missing current/IP/device/MFA render data

- [ ] 1-2 hours - Fix `POST /api/privacy/delete` cleanup and export completeness gaps.
  Files: `privacy.routes.js`
  Group: Privacy export/delete integrity
  Covers: incomplete cleanup join, incomplete exported data set, duplicate Quebec consent log writes

- [ ] 1-2 hours - Fix `POST /api/me/onboarding` race behavior and missing transaction-safe sequencing.
  Files: `me.routes.js`
  Group: Onboarding backend consistency
  Covers: duplicate simultaneous deletes without locking

- [ ] 1-2 hours - Harden `GET /api/region/detect` and `getBearerToken`.
  Files: `region.routes.js`
  Group: Region route correctness
  Covers: lowercasing the full Authorization header, no rate limiter

- [ ] 1-2 hours - Make crypto public-key serving safer under rotation and anonymous polling.
  Files: `crypto.routes.js`
  Group: Public key distribution
  Covers: stale parsed key at module load, anonymous unlimited polling, cache semantics

- [ ] 1-2 hours - Add rate limits and logging to V2 and system routes that currently have neither.
  Files: `system.routes.js`, V2 route files
  Group: Route observability and abuse control
  Covers: unauthenticated `/health`, unauthenticated `/links`, no rate limiting on V2 routers, missing `logError` usage

## Half day

### Billing, subscription, and customer state

- [ ] Half day - Make billing caches safe for multi-worker deployments and per-user currency context.
  Files: `In-Ex-Ledger-API/routes/billing.routes.js`
  Group: Billing cache consistency
  Covers: in-process `Map` caches, shared NAT currency bleed, stale worker-local price data

- [ ] Half day - Make Stripe customer creation and business-anchor migration resilient to partial failure.
  Files: `billing.routes.js`, `businesses.routes.js`
  Group: Stripe consistency
  Covers: dangling Stripe customers, webhook race during billing-anchor migration, 500 after already-committed business deletion

- [ ] Half day - Fix `subscriptionService` trial-plan persistence bugs before doing more billing work on top of it.
  Files: `In-Ex-Ledger-API/services/subscriptionService.js`
  Group: Subscription state correctness
  Covers: free selection during trial still writing `PLAN_V1`, `current_period_end = null` treated as indefinite access

- [ ] Half day - Tighten `subscription.js` redirect, invoice link, polling, and timestamp handling.
  Files: `In-Ex-Ledger-API/public/js/subscription.js`
  Group: Subscription frontend safety
  Covers: redirect URL parsing, unvalidated invoice URLs, 8-call activation polling loop, millisecond timestamp misformatting

- [ ] Half day - Replace silent theme resets and unsafe global state mutation in Settings with explicit, versioned preference migration.
  Files: `In-Ex-Ledger-API/public/js/settings.js`
  Group: Settings state management
  Covers: theme reset on version mismatch, direct `window.__LUNA_ME__` mutation, newline-corrupted address storage

### Platform and middleware

- [ ] Half day - Stop sharing JWT and CSRF secrets by fallback, and report rate-limiter health truthfully when Redis is degraded.
  Files: `In-Ex-Ledger-API/middleware/csrf.middleware.js`, `middleware/rateLimiter.js`, `services/healthCheckService.js`
  Group: Security middleware truthfulness
  Covers: CSRF fallback to `JWT_SECRET`, in-memory fallback still reported as healthy/enforced

- [ ] Half day - Harden server redirect/CORS behavior around forwarded headers and originless callers.
  Files: `In-Ex-Ledger-API/server.js`
  Group: Edge request handling
  Covers: `X-Forwarded-Host` redirect trust, blanket allow on missing `Origin`

- [ ] Half day - Review and restrict outbound geolocation configuration and encryption-key lifecycle behavior.
  Files: `signInSecurityService.js`, `encryptionService.js`, `taxIdService.js`
  Group: Service configuration safety
  Covers: configurable geolocation SSRF risk, forever-cached encryption key, JWT-secret-derived legacy tax ID key

## 1 day or more

### Scaling and data-volume behavior

- [ ] 1 day+ - Replace repeated fixed `LIMIT 500` list endpoints with real pagination metadata where the UI actually needs full datasets.
  Files: `accounts.routes.js`, `categories.routes.js`, related list endpoints and clients
  Group: List pagination
  Covers: silent truncation without client signal across multiple pages

- [ ] 1 day+ - Move transaction list paging/filtering back to the server instead of loading up to 50,000 rows into the browser.
  Files: `transactions.routes.js`, `public/js/transactions.js`
  Group: Transaction scalability
  Covers: client-side pagination on full in-memory transaction loads

- [ ] 1 day+ - Revisit plan limits and TOCTOU enforcement around imports and transaction creation.
  Files: `transactions.routes.js`, `services/basicPlanUsageService.js`
  Group: Plan-limit race conditions
  Covers: CSV import row-limit race, transaction-cap TOCTOU race

- [ ] 1 day+ - Add missing tests for privacy service and the untested route families.
  Files: `In-Ex-Ledger-API/tests/*`, plus new test files for `privacyService.js`, V2 routes, `system.routes.js`, `crypto.routes.js`, `bank-connections.routes.js`, entitlements
  Group: Test coverage expansion
  Covers: zero tests for V2 routes, no `privacyService` tests, missing entitlements/system/crypto/bank-connections coverage

