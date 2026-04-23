# InEx Ledger 2.0 - Current Status

## Live App Structure

- The live app is served from `In-Ex-Ledger-API/public/`.
- The current settings hub layout lives in `In-Ex-Ledger-API/public/html/settings.html`.

## Implemented

- Stripe billing routes exist: checkout session, customer portal, cancel, history, and webhook.
- Server-side subscription state exists in `services/subscriptionService.js`.
- Paid-feature enforcement exists server-side for receipts and premium export flows.
- MFA routes and settings UI are implemented.
- Redis-backed rate limiting is implemented.
- Settings has been restructured into an overview plus focused sections.
- CPA access includes active access, invite, history, and audit views.
- Transaction edits are append-only adjustments instead of in-place overwrites.
- Transaction deletes are now archival updates instead of hard deletes.
- Accounting period locks now exist in the backend and can be managed from Settings.

## Still Remaining

- Configure real production Stripe secrets in Railway.
- Verify the Stripe webhook endpoint against the production deploy.
- Run the production checkout and billing portal flows against live Stripe after the Railway secrets are set.
- Keep expanding automated coverage for end-to-end auth, billing, and settings-critical flows.
- Add audit-grade accounting controls:
  - apply period-lock enforcement to additional mutation surfaces beyond transactions when needed
  - add dedicated reporting/audit views for archived transaction history

## Immediate Deployment Inputs

The production billing flow needs these Railway variables set:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_V1_MONTHLY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL`
- optionally `STRIPE_API_VERSION`

## Verification Commands

- `npm run test:all`
- `npm run log_scan`
- `npm run verify:redacted-storage`

## Additional Completed Work

| # | File | Fix |
|---|------|-----|
| P1 | `public/js/auth.js` line 18 | Remove Railway URL → `window.API_BASE = ""` |
| P2 | `public/js/accounts.js` line 1 | Remove Railway URL → `const API_BASE = ""` |
| P3 | `public/js/privacyService.js` line 9 | Remove Railway URL → `const API_BASE = ""` |
| P4 | `public/js/settings.js` line 40 | Remove Railway URL → `const API_BASE = ""` |
| L5 | `terms.html` + `privacy.html` | Set real support email `support@inexledger.com` |
| F7 | `subscription.html` | Created `subscription.css`, fixed HTML path, fixed title |
| F18 | `server.js` + `public/` | Created `favicon.svg` (`iX` logo on blue), server now serves it |
| 10 | `server.js` | Added `helmet` middleware (CSP disabled for inline scripts) |
| 11 | `routes/transactions.routes.js` | Validate `account_id` belongs to user's business |
| 12 | `routes/auth.routes.js` | Password minimum 8 chars on `/register` and `/reset-password` |
| 13 | `public/js/settings.js` | Fixed `${API_BASE}/me` → `/api/me` in delete-account |
| 17 | `routes/auth.routes.js` | `express-rate-limit`: 20 req/15min on login/register, 5/hr on password routes |
| 18 | `routes/auth.routes.js` | Moved verification/reset tokens from in-memory Maps to PostgreSQL |
| 19 | `services/exportGrantService.js` | Moved export grant JTIs from in-memory to PostgreSQL |
| 22 | `public/js/transactions.js` + `routes/transactions.routes.js` | Transactions fully wired to API (was localStorage only) |
| 23 | `public/js/categories.js` + `routes/categories.routes.js` | Categories API — GET/POST/PUT fully implemented |
| 24 | `public/js/mileage.js` + `routes/mileage.routes.js` | Mileage API — GET (paginated)/POST/DELETE |
| 25 | `public/js/business-profile.js` + `routes/business.routes.js` | Business profile GET/PUT |
| 26 | `public/js/change-email.js` + auth route | Change-email flow — `POST /request-email-change` + `GET /confirm-email-change` |
| 27 | New `routes/privacy.routes.js` | Privacy routes — `/api/privacy/export` + `/api/privacy/delete` |
| 28 | `public/html/register.html` + `public/js/register.js` | Added PIPEDA (Canadian) consent checkbox |
| 29 | `routes/transactions.routes.js` + `public/js/transactions.js` | Transactions PUT + DELETE |
| 30 | `routes/transactions.routes.js` | Pagination (`limit`/`offset`) on GET /transactions |
| 32 | `db.js` | SSL `rejectUnauthorized` now controlled by `DB_SSL_REJECT_UNAUTHORIZED` env var |
| 33 | New `routes/sessions.routes.js` + `public/html/sessions.html` + `public/js/sessions.js` | Sessions listing + revocation (dedicated page) |
| 37 | `routes/auth.routes.js` + `middleware/auth.middleware.js` | MFA (TOTP setup, enable, disable, recovery codes, challenge flow) |
| Recurring | New `routes/recurring.routes.js` | Recurring transactions — CRUD + manual run + status |
| 36 | `pdf-worker/index.js` `buildPdfContent()` | Formatted text report with header, transactions table, and footer |
| L3 | `public/html/landing.html` + `css/pages/landing.css` | Pricing section added to landing page |
| P5 | `public/html/landing.html`, `public/html/sessions.html`, `public/js/sessions.js` | Synced new and updated files to root `public/` folder |
| 34 | `public/js/account-profile.js` + route | User profile PUT (`/api/me`) |
| 35 | `public/js/fiscal-settings.js` + `region-settings.js` | Fiscal + region settings persisted via `/api/business` PUT |
| 39 | `region-settings.html` | Province selector added |
| Migrations | `db/migrations/007–011` | `email_verified`/`role` columns, exports tables, auth token tables, export JTI table, fiscal year, province, user profile fields, email change requests |
| CI fix | `db.js` | SSL only enabled when `NODE_ENV === "production"` |
| CI fix | `test-export-grant.mjs` | Added `await` to async token function calls |

## Follow-Up Backlog

| # | Fix | Notes |
|---|-----|-------|
| Billing | Set live Railway Stripe env vars and verify webhook delivery end to end | Operational work; app routes and server-side subscription state already exist |
| Coverage | Keep auth, billing, onboarding, and settings-critical tests in the main regression suite | `npm run test:all` now runs the full 21-file test set under `--experimental-test-isolation=none` |
| L4 | Add screenshot or demo to `landing.html` | Marketing/UX improvement |
| Audit | Extend period-lock enforcement to any remaining mutation surfaces that need it | Core transaction/mileage/archive lock controls already exist |
| Audit | Add dedicated reporting/audit views for archived transaction history | Improves auditability of append-only/delete-archive flows |
| Mileage | Expand mileage with expense and maintenance tracking plus filterable history and summary cards | Requested follow-up; model after the transactions page history and summary surface |
