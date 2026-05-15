# Codebase Audit Triage - High

Source: Claude full-repo audit, reorganized for execution.

Rules used here:
- Sorted from shortest expected fix to longest expected fix.
- Grouped when the same fix shape touches nearby files.
- Estimates are rough engineering effort, not calendar time.

## 15-30 minutes

### Auth and session breakages

- [x] 15-30 min - Restore password recovery endpoints by moving the catch-all 404 handler below the real recovery POST handlers.
  Files: `In-Ex-Ledger-API/routes/auth.routes.js`
  Group: Auth recovery
  Covers: unreachable `POST /forgot-password`, `POST /account-recovery`, `POST /reset-password`

- [x] 15-30 min - Fix the sessions page so it renders `res.sessions` instead of the entire response object.
  Files: `In-Ex-Ledger-API/public/js/sessions.js`
  Group: Sessions frontend
  Covers: session list always rendering empty

- [x] 15-30 min - Fix the landing pricing toggle selector mismatch so monthly/yearly switching actually works.
  Files: `In-Ex-Ledger-API/public/html/landing.html`, `In-Ex-Ledger-API/public/js/landing.js`
  Group: Marketing landing pricing
  Covers: `data-billing-toggle` vs `data-billing-mode` / `data-billing-interval` / `data-pricing-toggle`

- [x] 15-30 min - Stop exposing `GET /api/billing/mock-v1` publicly and hard-disable it unless an authenticated, explicitly non-production mock path is intended.
  Files: `In-Ex-Ledger-API/routes/billing.routes.js`
  Group: Billing mock access
  Covers: public environment flag leak

- [x] 15-30 min - Enforce UUID validation on recurring mutation routes instead of returning database cast 500s.
  Files: `In-Ex-Ledger-API/routes/recurring.routes.js`
  Group: Recurring route validation
  Covers: `DELETE /:id`, `PATCH /:id/status`, `PUT /:id`

- [x] 15-30 min - Add missing route-level auth and validation guards to the V2 routers before service code is reached.
  Files: `In-Ex-Ledger-API/routes/projects.routes.js`, `In-Ex-Ledger-API/routes/vendors.routes.js`, `In-Ex-Ledger-API/routes/customers.routes.js`, `In-Ex-Ledger-API/routes/bills.routes.js`, `In-Ex-Ledger-API/routes/billable-expenses.routes.js`
  Group: V2 route hardening
  Covers: missing `requireAuth` safety dependence on V2 middleware, no UUID validation, raw body pass-through, invalid bill status handling, `total_amount: 0` rejection

## 30-60 minutes

### High-risk security switches

- [x] 30-60 min - Require webhook verification for inbound email and refuse operation when the secret is missing.
  Files: `In-Ex-Ledger-API/routes/email.routes.js`
  Group: Inbound webhook auth
  Covers: unauthenticated inbound message creation when `INBOUND_EMAIL_WEBHOOK_SECRET` is unset

- [x] 30-60 min - Require Plaid webhook signature verification before processing any Plaid webhook payload.
  Files: `In-Ex-Ledger-API/routes/plaid.routes.js`
  Group: Plaid webhook auth
  Covers: no Plaid webhook signature check

- [x] 30-60 min - Fix the business creation runtime bug by using the imported Node crypto API consistently.
  Files: `In-Ex-Ledger-API/routes/businesses.routes.js`
  Group: Business creation stability
  Covers: bare global `crypto.randomUUID()` on Node 18

- [x] 30-60 min - Cap `GET /api/me/audit-events` server-side.
  Files: `In-Ex-Ledger-API/routes/me.routes.js`
  Group: Audit events safety
  Covers: unbounded user-supplied limit causing massive reads

- [x] 30-60 min - Fix the pricing display and checkout trust boundary so browser-side price tables are advisory only.
  Files: `In-Ex-Ledger-API/public/js/billing-pricing.js`, related checkout callers
  Group: Client pricing tamper resistance
  Covers: mutable `window.billingPricing`, client-side total tampering prior to checkout

## 1-2 hours

### Sensitive token and credential handling

- [x] 1-2 hours - Hash email-change tokens at rest the same way password-reset tokens are hashed.
  Files: `In-Ex-Ledger-API/routes/auth.routes.js`
  Group: Token storage hardening
  Covers: plaintext pending email-change tokens in the database

- [x] 1-2 hours - Stop relying on stale JWT `mfa_enabled` claims for destructive account deletion checks and load the live MFA state from the database.
  Files: `In-Ex-Ledger-API/routes/me.routes.js`
  Group: Account deletion auth
  Covers: MFA bypass when a JWT was minted before MFA was enabled

- [x] 1-2 hours - Fix the log sanitizer so lowercased key comparisons actually redact tokens, API keys, tax IDs, and private keys.
  Files: `In-Ex-Ledger-API/utils/logSanitizer.js`
  Group: Secret redaction
  Covers: plain-text leakage of `taxId`, `taxIdJwe`, `accessToken`, `refreshToken`, `apiKey`, `privateKey`, and similar fields

- [x] 1-2 hours - Lock down receipt upload and preview so MIME type, extension, and inline serving cannot be used for stored XSS.
  Files: `In-Ex-Ledger-API/routes/receipts.routes.js`
  Group: Receipt file validation
  Covers: permissive Multer OR check, DB-stored `mime_type` trusted on inline download, HTML upload/render vector

- [x] 1-2 hours - Require a password confirmation on `POST /api/privacy/erase` to match the deletion path.
  Files: `In-Ex-Ledger-API/routes/privacy.routes.js`
  Group: Privacy destructive actions
  Covers: irreversible erasure with MFA only

- [x] 1-2 hours - Restrict `DELETE /api/transactions/bulk-delete-all` to the intended privileged role instead of any authenticated business member.
  Files: `In-Ex-Ledger-API/routes/transactions.routes.js`
  Group: Transaction destructive actions
  Covers: no RBAC check on full-business transaction wipe

- [x] 1-2 hours - Add the missing accounting-lock guard to `PATCH /api/transactions/:id/review-status`.
  Files: `In-Ex-Ledger-API/routes/transactions.routes.js`
  Group: Locked-period consistency
  Covers: review status mutating locked transactions

### Frontend auth-flow safety

- [x] 1-2 hours - Replace inline handlers and introduce a real CSP rollout plan for authenticated and auth pages.
  Files: `In-Ex-Ledger-API/public/html/transactions.html`, `In-Ex-Ledger-API/public/html/login.html`, app/auth page HTML broadly
  Group: CSP enablement
  Covers: inline `onclick`, inline `onfocus`, and the current inability to deploy a strict CSP

- [x] 1-2 hours - Stop exposing live session/bootstrap tokens in URL-based auth flows.
  Files: `In-Ex-Ledger-API/routes/auth.routes.js`, `In-Ex-Ledger-API/public/js/verify-email.js`, `In-Ex-Ledger-API/public/html/reset-password.html`, related auth pages
  Group: URL token exposure
  Covers: verify-email access token in URL fragment, reset token in query string

## Half day

### Data integrity and at-rest protections

- [ ] Half day - Remove the plain-text transaction description storage path or fully document why encrypted descriptions are duplicated in plain text.
  Files: `In-Ex-Ledger-API/routes/transactions.routes.js`, related transaction storage code
  Group: Encryption consistency
  Covers: plaintext plus encrypted description stored simultaneously

- [x] Half day - Fix `privacyService.js` so server failures do not create split-brain local-vs-server privacy settings and real server error messages propagate back to the caller.
  Files: `In-Ex-Ledger-API/public/js/privacyService.js`
  Group: Privacy client state
  Covers: localStorage writes on network failure, swallowed server error messages in delete flow

- [ ] Half day - Move recurring template creation and initial materialization into a single consistent unit or provide a compensating recovery path.
  Files: `In-Ex-Ledger-API/routes/recurring.routes.js`
  Group: Recurring consistency
  Covers: template committed before `materializeTemplateRuns`, 500 after partial success

- [x] Half day - Fix `routes/index.js` pre-checks so they fail closed instead of throwing or silently allowing access when dependencies fail.
  Files: `In-Ex-Ledger-API/routes/index.js`
  Group: Core route gating
  Covers: `/arap-summary` `req.business` crash, dead recurring pre-load guard, `/exports/history` guard falling through on DB error

- [ ] Half day - Make trial enforcement server-authoritative instead of localStorage-authoritative.
  Files: `In-Ex-Ledger-API/public/js/trial.js`, backend subscription/trial enforcement paths
  Group: Trial entitlement integrity
  Covers: editable localStorage trial expiry, undeclared globals, fresh private-window trial reset

### Expensive blocking operations

- [x] Half day - Replace synchronous receipt OCR and mirror file operations with non-blocking I/O.
  Files: `In-Ex-Ledger-API/routes/receipts.routes.js`
  Group: Receipt I/O performance
  Covers: `fs.readFileSync`, `fs.mkdirSync`, `fs.writeFileSync`, dead sync helper

- [x] Half day - Fix the JWE utility concurrency and response validation path so encryption bootstrapping is safe under parallel callers.
  Files: `In-Ex-Ledger-API/public/js/jwe-utils.js`
  Group: Browser JWE bootstrap
  Covers: `keyPromise` race, masked `alg`/`use`, missing response validation

## 1 day or more

### Billing and compliance correctness

- [x] 1 day+ - Hard-disable direct mock subscription writes in any environment that can reach real users or real Stripe, and add explicit safety checks around `ENABLE_MOCK_BILLING`.
  Files: `In-Ex-Ledger-API/routes/billing.routes.js`
  Group: Billing environment safety
  Covers: authenticated self-upgrade path via `POST /api/billing/mock-v1`

- [ ] 1 day+ - Rework billing checkout idempotency and state guards so retries do not create duplicate checkout sessions and `past_due` accounts cannot open conflicting billing flows.
  Files: `In-Ex-Ledger-API/routes/billing.routes.js`
  Group: Billing session lifecycle
  Covers: defeated idempotency key, second checkout exposure for `past_due`

- [x] 1 day+ - Make region detection a read-only, trusted-header-aware flow instead of an unaudited DB write on GET.
  Files: `In-Ex-Ledger-API/routes/region.routes.js`
  Group: Region and compliance
  Covers: header spoofing, DB mutation on GET, no CSRF, tax/compliance side effects

- [ ] 1 day+ - Correct PDF tax estimation logic before treating it as real user-facing tax guidance.
  Files: `In-Ex-Ledger-API/public/js/pdf_export.js`
  Group: Tax estimate correctness
  Covers: flat US 24 percent estimate, HST/GST used as Canadian income tax, non-income transactions counted as expenses

- [x] 1 day+ - Add a real CSP across app and auth pages once inline handlers and unsafe patterns are removed.
  Files: app/auth HTML templates broadly, `server.js` CSP configuration
  Group: Platform XSS hardening
  Covers: current absence of CSP on app pages and auth pages
