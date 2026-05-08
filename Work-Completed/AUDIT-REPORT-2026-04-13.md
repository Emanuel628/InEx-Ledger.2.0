> **STATUS: DONE — DO NOT USE THIS FILE.**
> All findings in this report have been addressed in the codebase. This file
> is retained for historical reference only. Do not consult it for current
> production-readiness assessments — the audit is stale relative to the live code.

# InEx Ledger 2.0 — Full Audit Report


**Date:** 2026-04-13  
> Archived snapshot only. Several findings below were fixed after this report was generated, so do not use it as the current repo status.
**Scope:** Frontend + backend static audit (no runtime testing)

---

## 🔴 CRITICAL (6 total)

### Backend

**BC-1 · `routes/messages.routes.js` — Authorization bypass: any user can message any user**  
`POST /messages` only checks that the receiver exists, not that the sender is permitted to contact them. The contact allowlist enforced by `GET /contacts` is cosmetic — any user can message any other user by ID.

**BC-2 · `routes/cpa-access.routes.js` — CPA portfolio exposes deleted/voided/adjustment rows**  
The CPA portfolio transaction query has no `deleted_at IS NULL`, `is_void`, or `is_adjustment` filters. CPAs see audit-pivot adjustment rows, voided entries, and soft-deleted transactions that the owner’s own UI correctly hides.

**BC-3 · `api/utils/seedDefaultsForBusiness.js` — Default accounts seeded with invalid `type` values**  
Seed data uses `type: "asset"` and `type: "liability"`, but the API only allows `["checking", "savings", "credit_card"]`. Every new business gets accounts that fail validation and can’t be updated via the API.

**BC-4 · `services/subscriptionService.js` — Race condition in `ensureBusinessSubscription`**  
The function does SELECT then INSERT without a transaction or `ON CONFLICT`. Concurrent requests pass the existence check and one INSERT fails with a unique-constraint violation → 500 to the user.

### Frontend

**FC-1 · `reset-password.js` — Passwords `.trim()`-ed before submission**  
Passwords are trimmed before being sent. Any user who sets a password with intentional leading/trailing spaces will be unable to log in from any form that does not also trim.

**FC-2 · `pdf_export.js` — Every transaction flagged as a CPA edge case**  
`reviewStatus` defaults to `"needs_review"` when missing. Ordinary transactions without the field are all marked as edge cases, making the CPA summary unusable.

---

## 🟠 HIGH (21 total)

### Backend

**BH-1 · `routes/analytics.routes.js` — NULL `is_adjustment` rows excluded from analytics**  
Queries use `AND is_adjustment = false` instead of allowing `NULL`. Ledger totals and analytics diverge.

**BH-2 · `routes/me.routes.js` — Account deletion does not require MFA**  
`DELETE /api/me` (full account destruction) lacks `requireMfa`, unlike business deletion.

**BH-3 · `routes/exports.routes.js` — `Content-Disposition` header injection**  
Date strings are not validated and are embedded into the filename header, enabling response header injection.

**BH-4 · `routes/analytics.routes.js` — Cash-flow projection double-counts recurring income**  
Projected income adds `recurringMonthlyIncome` on top of `avgHistIncome` that already includes recurring entries.

**BH-5 · `routes/cpa-access.routes.js` — Mileage query hardcodes `trip_date`**  
The CPA portfolio mileage query hardcodes `trip_date` and bypasses the dynamic column detection used elsewhere.

**BH-6 · `routes/auth.routes.js` — Password reset does not revoke sessions/MFA devices**  
`POST /reset-password` updates the hash but does not revoke refresh tokens or trusted MFA devices.

### Frontend

**FH-1 · `transactions.js` — `note` always sent as `""`**  
Transaction saves always send `note: ""` due to a missing `noteInput` reference. All notes are erased on save/edit.

**FH-2 · `transactions.js` — Edit button opens delete modal**  
`renderTransactionList` wires the edit button to `openTransactionModal`, which opens the delete confirmation.

**FH-3 · `auth.js` — Network error destroys valid token**  
Any fetch error calls `clearToken()` and forces a logout, even when the token is still valid.

**FH-4 · `settings.js` — Password strength meter always “weak” in non-English locales**  
Strength labels are translated, but comparisons are hardcoded to `"Strong"`/`"Fair"` in English.

**FH-5 · `settings.js` — Quebec Law 25 opt-out default never activates**  
`dataSharingOptOut` initializes to `false`, so the `== null` default path never runs for Quebec users.

**FH-6 · `subscription.js` — Duplicate event listeners on cancel button**  
`loadSubscription()` registers a click handler every time it runs, causing duplicate requests after each cancel.

**FH-7 · `subscription.js` — Cancellation modal shows 1970 date for Unix timestamps**  
`new Date(sub.currentPeriodEnd)` is used instead of `fmtDate()` (seconds → ms), rendering epoch dates.

**FH-8 · `messages.js` — Uncaught null crash before `try/catch`**  
`list.innerHTML = ...` executes before the `try` block; if the element is missing, the module crashes.

**FH-9 · `register.js` — Bare `t()` calls crash on missing i18n**  
`updateStrengthMeter()` and `updateMatchMessage()` use `t()` directly; if i18n is late, every keystroke throws.

**FH-10 · `pdf_export.js` — Wrong field `record.kilometers`**  
API field is `km`. Totals and business-use percentage in PDFs are always `0`.

**FH-11 · `forgot-password.js` & `reset-password.js` — `init()` runs before DOM**  
Scripts call `init()` at parse time; `getElementById()` returns null and the submit handler is never wired.

**FH-12 · `onboarding-page.js` — Missing null checks in 7 DOM writes**  
Any missing element throws, halting form hydration and subsequent logic.

**FH-13 · `privacyService.js` — API readiness cached forever**  
If the API is down at page load, `apiReady=false` forever and no retries are made.

**FH-14 · `privacyService.js` — Fetch calls lack `try/catch`**  
All four service functions call `fetch()` without error handling; network errors cause unhandled rejections.

---

## 🟡 MEDIUM (41 total)

### Backend

**BM-1 · `routes/transactions.routes.js` — Missing UUID validation on PUT/DELETE/PATCH**  
Invalid IDs trigger PostgreSQL errors and return 500 instead of 400.

**BM-2 · `routes/receipts.routes.js` — `PATCH /:id/attach` missing UUID validation**  
Non-UUID `transaction_id` values hit the DB and return 500.

**BM-3 · `routes/exports.routes.js` — Export grant tokens can be replayed**  
No JTI storage or single-use enforcement; the same grant can be reused within the TTL.

**BM-4 · `routes/privacy.routes.js` — GDPR export covers only active business**  
Users with multiple businesses receive only the active business data.

**BM-5 · `routes/categories.routes.js` — PUT allows `name = null`**  
Sending `{ "name": "" }` results in `name = NULL`.

**BM-6 · `routes/accounts.routes.js` & `categories.routes.js` — Deletion checks ignore soft-delete**  
Usage checks count soft-deleted transactions, blocking deletion incorrectly.

**BM-7 · `routes/me.routes.js` — `POST /onboarding/tour` accepts unbounded key**  
User-controlled JSONB keys are stored without allowlist or length limit.

**BM-8 · `routes/auth.routes.js` — `request-email-change` lacks MFA**  
Email changes only require password, not MFA.

**BM-9 · `routes/billing.routes.js` — `POST /customer-portal` lacks MFA**  
Stripe portal access is not MFA-protected.

**BM-10 · `services/exportGrantService.js` — Missing secret only warns**  
Server continues when `EXPORT_GRANT_SECRET` is missing; first export request 500s.

**BM-11 · `services/recurringTransactionsService.js` — Past `next_run_date` can stay active**  
`computeNextRunDateForUpdate` may write an active template with a past next-run date.

### Frontend

**FM-1 · `transactions.js` — Drawer stays open after receipt upload failure**  
Transaction saves succeed but the drawer remains open, implying failure.

**FM-2 · `transactions.js` — Recurring submit handler has no `catch`**  
Network failures re-enable the button but show no error.

**FM-3 · `transactions.js` — `mapById` crashes on null array items**  
No guard for `item?.id`, unlike the equivalent in `exports.js`.

**FM-4 · `transactions.js` — `validateTransactionForm` never validates description**  
Empty descriptions reach the API and produce generic errors.

**FM-5 · `transactions.js` — `document.querySelector("form")` may target wrong form**  
If the recurring form appears first, transaction wiring targets the wrong element.

**FM-6 · `auth.js` — Auth guard returns `undefined` on concurrent calls**  
Second concurrent call returns `undefined` and page continues without verified auth.

**FM-7 · `auth.js` — 500/503 from `/api/me` leaves page unauthenticated**  
Server errors return `undefined` and protected pages continue without valid auth state.

**FM-8 · `exports.js` — YTD date preset hardcoded to `2026-04-04`**  
End date is frozen in time; should be computed dynamically.

**FM-9 · `settings.js` — Strength score contradicts checklist rules**  
Passwords that satisfy all displayed rules can still score “Fair.”

**FM-10 · `settings.js` — Password change submit button not disabled**  
Double-clicking sends multiple change-password requests.

**FM-11 · `settings.js` — CPA access invite submit button not disabled**  
Rapid submissions can create duplicate CPA access grants.

**FM-12 · `subscription.js` — `res?.json().catch()` throws when `res` is null**  
`res?.json()` returns `undefined`, calling `.catch()` throws synchronously.

**FM-13 · `cpa-dashboard.js` — `activePortfolio.businesses` lacks null guard**  
Missing `businesses` crashes the CPA dashboard.

**FM-14 · `cpa-dashboard.js` — Data silently truncated without pagination**  
Lists are sliced to 8–12 items with no “show more” or truncation indicator.

**FM-15 · `messages.js` — `m.body.replace()` crashes on null body**  
Messages with `body = null` throw and wipe the list.

**FM-16 · `messages.js` — `res.json()` called on null in send functions**  
`apiFetch` returning `null` causes synchronous throws before `.catch()`.

**FM-17 · `sessions.js` — Buttons not disabled during revoke requests**  
Double-clicks issue duplicate DELETEs; second request errors.

**FM-18 · `mfa-challenge.js` — Path-relative redirects break navigation**  
Redirects use `"login"` / `"transactions"` instead of absolute `"/login"` / `"/transactions"`.

**FM-19 · `mfa-challenge.js` — MFA verify uses raw fetch (no CSRF)**  
`POST /api/auth/mfa/verify` bypasses the CSRF header from `apiFetch`.

**FM-20 · `verify-email.js` — Resend verification uses raw fetch (no CSRF)**  
`POST /api/auth/send-verification` bypasses `apiFetch`.

**FM-21 · `verify-email.js` — Path-relative `"login"` redirect**  
Same issue as FM-18.

**FM-22 · `onboarding.js` — Tour can render twice after dismissal**  
Event listener + sync profile check create a race that can re-render the tour.

**FM-23 · `mileage.js` — Bare `t()` calls + unguarded DOM writes**  
Missing element or late-loading i18n causes crashes in label refresh.

**FM-24 · `analytics.js` — `.toFixed(1)` on null `estimated_tax_liability_pct`**  
Null field crashes `renderDashboard` and leaves the page blank.

**FM-25 · `global.js` — Polling continues after 401 via `apiFetch` path**  
The `apiFetch` path returns `true` for all non-OK responses, so polling never stops after auth loss.

**FM-26 · `filters.js` — `wireFilterActions()` runs before DOM exists**  
Listeners never attach; all filter buttons are permanently dead.

**FM-27 · `tax-widget.js` — `wireTaxWidget()` runs before DOM exists**  
All tax widget controls are permanently unwired.

**FM-28 · `privacyService.js` — `setPrivacySettings` ignores PUT response errors**  
Local state persists even when the server rejects the change.

**FM-29 · `pdf_labels.js` — Missing CPA edge-case labels in FR/ES locales**  
Nine CPA edge-case labels are English-only.

**FM-30 · `forgot-password.js` & `reset-password.js` — `button.disabled` on null**  
If the form has no button, `button.disabled = true` throws.

---

## 🔵 LOW (15 total)

### Backend

**BL-1 · `db.js` — Database host/user/IP logged in non-prod**  
`logDbIdentity()` prints sensitive connection metadata to stdout by default.

### Frontend

**FL-1 · `transactions.js` — Expense YoY delta always green**  
Expense deltas always use `stat-delta-positive`, even when expenses increase.

**FL-2 · `transactions.js` — `reviewStatus` defaults to `"needs_review"` on edit**  
Editing a transaction with no status sets it to `"needs_review"` on save.

**FL-3 · `exports.js` — `downloadFile` ternary has identical branches**  
`Uint8Array` branch likely should use `content.buffer`.

**FL-4 · `exports.js` — `hydrateCategoriesCache` reads `category.kind` only**  
If the API returns `type` instead of `kind`, categories are misclassified.

**FL-5 · `settings.js` — Confirm input not cleared between delete modals**  
`confirmInput` retains `"DELETE"` from prior modal.

**FL-6 · `settings.js` — MFA toggle shows “off” on status load failure**  
Unknown state is presented as disabled instead of indeterminate.

**FL-7 · `login.js` — Wrong i18n key for email validation**  
Uses `register_alert_valid_email` in login context.

**FL-8 · `change-email.js` — Clearing status applies error CSS**  
`setStatus("", false, ...)` adds the error class transiently.

**FL-9 · `verify-email.js` — Debug `console.log` left in production**  
`console.log("Verify email page loaded.")` remains in shipped code.

**FL-10 · `trial.js` — `startTrial` hardcodes `30`**  
Does not reference `DEFAULT_TRIAL_DAYS`.

**FL-11 · `trial.js` — “Manage plan” text not localized**  
The trial banner uses hardcoded English text.

**FL-12 · `analytics.js` — `fmt()` hardcodes `$` and `en-CA`**  
All analytics are displayed as CAD regardless of locale.

**FL-13 · `i18n.js` — UTF-8 BOM at file start**  
Can break BOM-unaware bundlers or ES module usage.

**FL-14 · `accounts.js` — `deleteAccount` lacks `try/catch`**  
Network errors raise unhandled rejections with no user feedback.

---

## Summary

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| 🔴 Critical | 4 | 2 | **6** |
| 🟠 High | 6 | 15 | **21** |
| 🟡 Medium | 11 | 30 | **41** |
| 🔵 Low | 1 | 14 | **15** |
| **Total** | **22** | **61** | **83** |

---

## Top Fixes Before Release

1. **BC-3** — Seed accounts use invalid types; every new business is broken on creation.
2. **BC-1** — Any user can message any other user; remove the authorization gate entirely.
3. **BC-2** — CPAs see audit adjustment rows and soft-deleted data in the portfolio view.
4. **BH-6** — Password reset doesn’t invalidate sessions or trusted MFA devices.
5. **FC-1** — Password trimming corrupts credentials silently.
6. **FC-2** — Every transaction flagged as a CPA edge case; breaks CPA PDF workflow.
7. **FH-1** — Transaction notes are erased on every save.
8. **FH-2** — Edit button opens delete modal.
9. **FH-3** — Network hiccups force-logout users.
10. **FM-26 / FM-27** — Filters and tax widget never initialize because scripts run before DOM.
> Archived snapshot only. Several findings below were fixed after this report was generated, so do not use it as the current repo status.
