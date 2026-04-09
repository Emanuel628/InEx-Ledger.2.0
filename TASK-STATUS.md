# InEx Ledger 2.0 — Task Status

---

## Already Completed Before This Session

Tasks **1–8**, F1–F6, F8–F17, F19, JS1, L1, L2 were marked done before the session began.

| # | File | Fix |
|---|------|-----|
| 1 | `public/html/forgot-password.html` | Remove "Password reset coming soon" text |
| 2 | `In-Ex-Ledger-API/server.js` | Remove duplicate `GET /api/me` route |
| 3 | `In-Ex-Ledger-API/db.js` | Wrap DB credential logs in `NODE_ENV !== production` check |
| 4 | `In-Ex-Ledger-API/server.js` | Add body size limits to `express.json()` and `express.urlencoded()` |
| 5 | `routes/auth.routes.js` | Fix `sameSite`/`secure` cookie mismatch |
| 6 | `routes/receipts.routes.js` | Sanitize `Content-Disposition` filename header |
| 7 | `routes/transactions.routes.js` + `seedDefaultsForBusiness.js` | Replace `uuid_generate_v4()` with `crypto.randomUUID()` |
| 8 | `routes/auth.routes.js` | Replace both `transporter.sendMail()` calls with `resend.emails.send()` |
| F1 | `InEx-Ledger-Frontend/html/landing.html` | Replace full app nav with Sign In + Pricing only |
| F2 | `InEx-Ledger-Frontend/html/landing.html` | Remove duplicate Sign In button |
| F3 | `InEx-Ledger-Frontend/html/landing.html` | Fix Railway hardcoded URLs to relative paths |
| F4 | 8 HTML files | Fix corrupted `ƒ?"` in `<title>` tags |
| F5 | `terms.html` + `privacy.html` | Replace `support@lunabusiness.com` |
| F6 | `subscription.html` | Fix title from "InEx Ledger Sheets" |
| F8 | All HTML files | Add `2026` to every footer copyright line |
| F9 | `legal.html` | Rebuilt as proper index page |
| F10 | `landing.html` | Added meta description and Open Graph tags |
| F11 | All public HTML pages | Standardized nav across public pages |
| F12 | `subscription.html` | Fixed with F11 |
| F13 | `transactions.html` | Fixed broken `A-` dismiss button to `✕` |
| F14 | 4 settings pages | Added nav to dead-end pages |
| F15 | `mfa.html`, `reset-password.html` | Added footers |
| F16 | `upgrade.html` | Fixed footer links |
| F17 | `landing.html` | Fixed `<title>` tag |
| F19 | `landing.html` | Fixed heading hierarchy |
| JS1 | `auth.js`, `accounts.js`, `privacyService.js` | Removed hardcoded Railway URLs (InEx-Ledger-Frontend copy) |
| L1 | `terms.html` | Fixed ToS billing language |
| L2 | `README.md` | Added proper README |

---

## Completed During This Session

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
| 36 | `pdf-worker/index.js` `buildPdfContent()` | Formatted text report with header, transactions table, and footer |
| L3 | `public/html/landing.html` + `css/pages/landing.css` | Pricing section added to landing page |
| P5 | `public/html/landing.html`, `public/html/sessions.html`, `public/js/sessions.js` | Synced new and updated files to root `public/` folder |
| 34 | `public/js/account-profile.js` + route | User profile PUT (`/api/me`) |
| 35 | `public/js/fiscal-settings.js` + `region-settings.js` | Fiscal + region settings persisted via `/api/business` PUT |
| 39 | `region-settings.html` | Province selector added |
| Migrations | `db/migrations/007–011` | `email_verified`/`role` columns, exports tables, auth token tables, export JTI table, fiscal year, province, user profile fields, email change requests |
| CI fix | `db.js` | SSL only enabled when `NODE_ENV === "production"` |
| CI fix | `test-export-grant.mjs` | Added `await` to async token function calls |

| P6 | `routes/messages.routes.js` | Fix `mapMessageRow` archive flags to be sender/receiver role-aware |
| P7 | `routes/mileage.routes.js` | Cache `getMileageColumnMode()` to eliminate per-request schema introspection |
| P8 | `routes/index.js` | Remove duplicate `router.use('/', systemRoutes)` mounting |
| P9 | `db.js` | Remove unused `logDbIdentity` function and export |
| P10 | `services/subscriptionService.js` | Remove unused `getSubscriptionSnapshotForUser` function and export |
| P11 | `routes/privacy.routes.js` | Update stale `schemaVersion` from `phase4-v1` to `phase5-v1` |

---

## Still Pending

| # | Fix | Notes |
|---|-----|-------|
| 20 | Integrate Stripe payment processor | Blocks 21, 31, 38 |
| 21 | Add real billing/cancel section to `settings.html` | Depends on Stripe (20) |
| 31 | Replace localStorage tier enforcement with server-side | Depends on Stripe (20) |
| 37 | Implement MFA (new routes + `public/js/mfa.js`) | |
| 38 | Remove mock subscription, enforce tiers server-side | Depends on Stripe (20) |
| L4 | Add screenshot or demo to `landing.html` | |
| Audit | Immutable transaction history (edits create reversals, not overwrites) | |
| Audit | Locked accounting periods | |
| Audit | Audit trail for logins and data changes | |
