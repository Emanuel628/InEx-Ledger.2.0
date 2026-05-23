# E2E Test Findings — Brand-new User Walkthrough

Two passes of end-to-end testing as a brand-new user.

- **Pass 1 — Navigation walkthrough**: visited every page, listed every visible button, registered/verified/logged in/out, walked through forgot-password and 404 routing.
- **Pass 2 — Functional walkthrough**: actually used the app — created accounts, categories, real transactions, mileage, receipts, invoices, imported a CSV, exported CSV, exported PDF.

Both runs were against a fresh local stack (Postgres 16, Node 22, `NODE_ENV=development`), driven by Playwright + Chromium. No application code was modified during testing.

---

## Severity legend

- 🔴 **Critical / blocking** — breaks core flow or silently corrupts user data
- 🟠 **High** — visible functional issue with workaround
- 🟡 **Medium / UX** — cosmetic, hygiene, or hard-to-discover behavior
- ✅ **Working** — confirmed working

---

## 🔴 Critical bugs

### 1. Migrations cannot run on a fresh database
- `db/migrations/007_add_marketing_email_opt_in.sql` does `ALTER TABLE user_privacy_settings`, but that table is only created in `026_create_user_privacy_settings.sql`. Migrations run in lexical order, so 007 fails with `relation "user_privacy_settings" does not exist`.
- The server retries forever on startup; a fresh DB never comes up.
- Workaround used during testing: manually `CREATE TABLE user_privacy_settings` before launching the server.

### 2. CSV and PDF exports silently lose every transaction description
- Created three transactions with descriptions: `"Consulting invoice #001 — Acme Co."`, `"Adobe Creative Cloud subscription"`, `"Client lunch — Bistro"`.
- Downloaded CSV — Description column blank on every row:
  ```
  Acme Freelance LLC,2026-05-01,,income,2500.00,USD,Business Checking,…
  Acme Freelance LLC,2026-05-02,,expense,54.99,USD,Business Checking,…
  Acme Freelance LLC,2026-05-03,,expense,87.45,USD,Business Checking,…
  ```
- Downloaded PDF — shows `(No description)` for every transaction:
  ```
  (\(No description\) - $2,500.00 - MD) Tj
  (\(No description\) - $87.45 - MD RS) Tj
  (\(No description\) - $54.99 - MD RS) Tj
  ```
- **Root cause:** descriptions are stored encrypted in `transactions.description_encrypted` (the plain `description` column is intentionally NULL). The export query in `routes/exports.routes.js:140` selects only `description`, never `description_encrypted`:
  ```js
  SELECT id, account_id, category_id, amount, type, description, date, note, …
  FROM transactions
  ```
- **Impact:** the entire tax-export feature — the product's headline use case — silently delivers descriptionless rows. CSV/PDF for CPA handoff is useless.

### 3. `GET /api/receipts` returns 500 for every authenticated user
- `routes/receipts.routes.js:192` selects `r.created_at` and orders by it. The `receipts` table only has `uploaded_at` (`db/migrations/003_add_receipt_storage.sql`).
- Postgres error: `column r.created_at does not exist (HINT: Perhaps you meant to reference the column "b.created_at")`.
- **Visible UX:** the receipts page shows **"Could not load receipts. Refresh the page to try again."** for every new user.
- This endpoint is also polled on every authenticated page, so the user sees 12+ persistent 500s in DevTools across the whole app (transactions, accounts, categories, mileage, exports, settings, …).
- Upload still works — the new receipt appears via local state, but on page refresh it disappears.

### 4. CSV import silently drops historical rows because of a hidden default date filter
- Uploaded `import.csv` with 5 rows dated `2026-04-15` → `2026-04-28`. API responded:
  ```json
  {"message":"Import complete. 0 imported, 0 skipped as duplicate, 0 skipped, 5 outside date range.",
   "start_date":"2026-05-18","end_date":null,…}
  ```
- **Cause:** `public/js/transactions.js:3707` silently pre-fills the start-date input with today when the modal opens, even though the label says `(optional)`:
  ```js
  if (startDateInput) startDateInput.value = todayIsoDate();
  ```
- **Impact:** any CSV row older than today is filtered out. The toast says "Import complete" so the user has no signal that they imported nothing. For a bookkeeping tool whose CSV-import job is to backfill old bank exports, this is a silent data-loss bug.

### 5. Stripe price env-var names don't match `.env.example`
- `.env.example` documents `STRIPE_PRICE_V1_MONTHLY_US`, `STRIPE_PRICE_V1_YEARLY_US`, `STRIPE_PRICE_ADDITIONAL_BUSINESS_MONTHLY_US`, …
- `services/stripePriceConfig.js` actually reads `STRIPE_PRO_M_US`, `STRIPE_PRO_Y_US`, `STRIPE_ADDL_M_US`, ….
- Result: anyone following `.env.example` literally cannot configure billing. `GET /api/billing/pricing` returns 500 (`"STRIPE_PRO_M_US is not configured"`) on `/pricing` and `/subscription` for everyone. Pricing page falls back to a hard-coded `$12/month` so it still renders, but no real price ever loads.

### 6. `CSRF_SECRET` is required in dev but only validated in production
- The variable itself is well-known: documented in `Docs/PROJECT-README.md:184`, `Docs/PRODUCTION-READINESS.md:18`, `Docs/BACKUP-RESTORE.md:21`, and listed in `services/envValidationService.js:22`.
- However `envValidationService.collectRequiredEnvironmentVariables()` only adds it to the required list when `NODE_ENV === "production"`. In development the validator passes startup without it.
- `middleware/csrf.middleware.js:17` then throws `Missing CSRF signing secret. Set CSRF_SECRET.` on the very first request, returning HTTP 500 for everything — including `/health`.
- Net effect for a developer: server starts cleanly, `npm start` looks healthy, then every request 500s with no startup hint.
- Same gap for `INBOUND_EMAIL_WEBHOOK_SECRET` and `INVOICE_REPLY_HMAC_SECRET`: required by routes/services at runtime but not in the validator's dev list, and not in `.env.example`.
- Either add these to the dev required list in `envValidationService.js`, or include them with placeholder values in `.env.example`.

---

## 🟠 High-severity functional issues

### 7. New users cannot export PDF until they hunt down four hidden fields
- Clicking **Export PDF** on the just-finished onboarding returned:
  ```
  HTTP 400 {"error":"Export blocked due to missing required business details: Business activity code, Business address, Accounting method, Material participation"}
  ```
- Onboarding only collects: business name, primary account type, account name, region. None of the four PDF-required fields are mentioned anywhere in onboarding.
- The user has to (a) click Export, (b) read the error, (c) find Settings → Business, (d) fill four fields manually, (e) come back.
- After manually `UPDATE`-ing those four columns, the same export succeeded (23,910-byte valid `%PDF-` file, 6 pages). The generator works; the funnel doesn't.

### 8. Privacy-consent persistence fails right after registration
- `POST /api/auth/register` succeeds (201), then `js/register.js` immediately calls `POST /api/privacy/settings`, which returns **401 "Authentication required"**.
- Visible browser console error on every registration:
  ```
  Register request failed: Error: Authentication required
    at Object.setPrivacySettings (privacyService.js:141)
    at async persistConsent (register.js:415)
  ```
- The cookie banner / privacy consent record is silently lost. Looks like the auth cookie isn't available to the very next request (timing of cookie set vs. follow-up call).

### 9. Cookie-banner POST is unconditionally CSRF-blocked
- `routes/consent.routes.js:124` puts `requireCsrfProtection` on `POST /api/consent/cookie`.
- The client (`public/js/global.js:1771`) does not send an `X-CSRF-Token` header.
- Result: every unauthenticated visit returns 403. Decision is kept in `localStorage` so functionally the banner still works, but the server-side audit trail the comment in the route file describes is never recorded.

### 10. Several V2 feature pages return raw `Not Found` text
- `bills`, `billable-expenses`, `customers`, `vendors`, `projects`, `ar-ap` return HTTP 404 with literal `Not Found` body when `ENABLE_V2_BUSINESS` is not set, even though their HTML files exist in `public/html/`.
- Intentional feature-gating (`server.js:298-303`), but the response is unstyled. Stale bookmarks, old links, or Google results show a broken page.

### 11. `/upgrade` page exposes a dev-only "Activate Pro for testing" button that always 404s
- `public/html/upgrade.html` (and `js/upgrade.js:19`) renders a **DEV ONLY → Activate Pro for testing** card.
- Clicking it calls `GET /api/billing/mock-v1`, which returns 404 unless `ENABLE_MOCK_BILLING=true`.
- In a normal install the user sees a dev-affordance that doesn't work. The "DEV ONLY" label should be the condition for *rendering* the card, not just decoration on it.

### 12. Auth-page redirect uses only `localStorage`, not server state
- `js/auth.js:744 redirectIfAuthenticated()` reads the JWT from `localStorage` and redirects `/login` → `/onboarding` (or post-onboarding) before any server check completes.
- Clearing cookies does **not** log a user out — the bearer token in `localStorage` still authenticates `/api/me`. For users on shared machines this is a soft data-privacy concern.

---

## 🟡 Medium-severity UX / hygiene issues

### 13. CSP `upgrade-insecure-requests` breaks favicons in HTTP dev
- Every page emits CSP `upgrade-insecure-requests`, which forces the browser to retry `http://localhost:8080/favicon.svg` as `https://...`. Persistent `ERR_SSL_PROTOCOL_ERROR` in the console on every page when running locally over HTTP (the default in `.env.example`).
- Cosmetic in dev, but it muddies every test and screenshot.

### 14. Cookie banner overlaps content
- The "We use essential cookies…" banner sits over the bottom 60-80px of the page rather than pushing content. On the Receipts page it overlaps the "Upload receipt" CTA; on `/transactions` it overlaps the empty-state CTA.

### 15. Onboarding is only nominally a multi-step flow
- `onboarding.html` advertises a 4-step setup ("Your work / Where you file / First account / Guided setup"), but the rendered form has every field pre-filled (`My Business`, `Checking`, `Primary Checking`, `United States`) and a single "Get started" button.
- A user clicking through with defaults ends up with a business literally called "My Business" with a "Primary Checking" account.

### 16. `<input readonly>` autofill suppression on login form is fragile
- `login.html` ships `#email` and `#password` with `readonly`, removed only on `focus` (`login.js:75-86`). Password managers, automated tests, and accessibility tooling see a non-editable form by default.

### 17. Account-menu / sign-out is hard to discover
- The visible "Sign out everywhere" button on `/settings` and `/sessions` revokes *all* sessions. The actual single-session "Sign out" lives in the `.user-pill` dropdown in the topbar — no `aria-label` or obvious affordance.

### 18. Pricing/Subscription pages render but with empty data
- Because of issue #5, live prices never load. `/pricing` falls back to "$0 Basic / $12/month Pro", `/subscription` does too. A real customer can't see which Stripe price they'd actually pay.

### 19. Invoice form opens with one empty starter line item plus an "+ Add line item" button
- Clicking "+ Add line item" adds a *second* row; the first stays empty. The save-side filter (`invoices.js:278`) drops empty-description lines, so it works by accident, but the UI shows two rows when the user wanted one.

### 20. Default income categories are alphabetized; "Interest Income" appears first
- For a freelancer, the most natural first pick should be **Service Income** or **Sales Revenue**, not interest. Worth surfacing more useful defaults first.

### 21. Mileage form is rendered always-visible — inconsistent with other entities
- Every other entity (transactions, accounts, invoices) hides the form behind an Add button. Mileage shows it inline. Either is fine; inconsistency is the issue.

### 22. "Material participation" is required for PDF export with no in-context explanation
- The PDF blocker (issue #7) lists "Material participation" as a required business detail. A new user has no context for what that means or where to find it in Settings.

### 23. Invoice form doesn't surface server errors field-by-field
- API returned `400 {"error":"customer_name is required."}` when the field was empty. The form's red error region renders but is easy to miss; no field-level red highlight on `#invClientName`.

---

## ✅ Confirmed working when actually exercised

- Register → email-verification → auto-login → onboarding → first protected page
- `Add default categories` → 17 expense + 4 income categories created
- Account creation with chip-based type selector (`checking`, `savings`, `credit_card`, `cash`, `custom`)
- Transaction create (income + expense) with date, description, account, category, amount, currency, indirect tax, review status, notes
- Mileage trip create (date, purpose, destination, distance)
- Receipt upload (binary PNG via `multipart/form-data`)
- Invoice draft create with multi-field line item, currency, tax rate, notes, status=draft (`invoices_v1` table populated correctly)
- CSV import endpoint itself (blocked only by issue #4)
- CSV export streams a clean text/csv (38 columns: business, dates, signed amounts, tax form lines, categories, currencies, FX, indirect-tax recoverability, review status, …)
- PDF export, once business profile is complete: valid 6-page PDF, signed report ID, redacted footer
- Analytics dashboard: 12-month chart, monthly breakdown, top categories all populate from real data ($2,500 income / $142.44 expenses / $2,357.56 net / $333.11 SE-tax estimate)
- Logout via topbar `.user-pill` menu → `POST /api/auth/logout` 204 → redirected to `/`; visiting `/transactions` afterwards correctly redirects to `/login`
- Forgot password POST returns 200; reset page with bogus token loads its UI without crashing
- 404 routing returns 404 (unstyled, see issue #10)

---

## Suggested fix priority

1. Read `description_encrypted` (and decrypt) in `routes/exports.routes.js fetchExportSourceRows()` — currently broken for both CSV and PDF (issue #2).
2. Fix migration ordering of `007_add_marketing_email_opt_in.sql` (rename to `027_…` or rewrite to be idempotent) — fresh installs can't boot (issue #1).
3. Fix `routes/receipts.routes.js:192` `r.created_at` → `r.uploaded_at` (issue #3).
4. Remove the silent `startDateInput.value = todayIsoDate()` default in the CSV import modal, or change the label to "Date range (defaults to today onward)" (issue #4).
5. Reconcile Stripe env-var names between `.env.example` and `stripePriceConfig.js` (issue #5).
6. Move `CSRF_SECRET` (and `INBOUND_EMAIL_WEBHOOK_SECRET`, `INVOICE_REPLY_HMAC_SECRET`) out of the production-only block in `envValidationService.js` so dev startups also fail fast — or include them with placeholder values in `.env.example` (issue #6).
7. Add Business activity code / address / Accounting method / Material participation to onboarding, or warn before letting the user click Export PDF (issue #7).
8. Make `js/register.js` defer the `setPrivacySettings()` call until the auth cookie is observable, or accept the bearer just returned in the register response (issue #8).
9. Either send the CSRF header from `js/global.js` consent calls, or move `POST /api/consent/cookie` to the CSRF-exempt list (issue #9).
10. Hide the "DEV ONLY: Activate Pro for testing" card when `ENABLE_MOCK_BILLING !== 'true'` (issue #11).
11. Give V2-gated routes a styled 404 (or redirect to `/`) instead of `text/plain "Not Found"` (issue #10).
