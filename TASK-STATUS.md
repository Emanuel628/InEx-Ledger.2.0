# InEx Ledger 2.0 — Task Status

---

## Completed (All Phases)

All tasks from Phases 1–5 have been completed. Below is a summary of the major work done.

### Phase 1–3 Highlights
- Removed hardcoded Railway URLs across all frontend JS files
- Added `helmet` middleware, body-size limits, rate limiting on auth routes
- Moved tokens (verification, reset, export JTIs) from in-memory Maps to PostgreSQL
- Transactions, Categories, Mileage, Business profile fully wired to API
- Privacy routes: export, delete, erase, audit-log, settings
- Sessions listing + revocation, Change-email flow, PIPEDA consent
- PDF worker report formatting, Pricing section on landing page
- MFA middleware (`requireMfa`), CPA access/verification routes
- Analytics routes (`/api/analytics/*`), Goals routes (`/api/goals`)
- Billing routes with Stripe integration (checkout, cancel, history, webhook)
- Recurring transactions routes
- Businesses management routes (list, create, switch, delete)
- Messages routes with inbox, sent, archive, delete, resolve
- Schema migrations 001–040 applied

### Phase 4 Cleanup (Current)
| # | File | Fix |
|---|------|-----|
| 4-1 | `routes/messages.routes.js` | Fixed `mapMessageRow` conflating archive flags — now uses viewer's role |
| 4-2 | `routes/mileage.routes.js` | Cached `getMileageColumnMode()` result to avoid per-request schema introspection |
| 4-3 | `routes/index.js` | Removed duplicate `systemRoutes` mounting at `/` (kept `/system` only) |
| 4-4 | `db.js` | Removed unused `logDbIdentity()` function and export |
| 4-5 | `services/subscriptionService.js` | Removed unused `getSubscriptionSnapshotForUser()` function and export |
| 4-6 | `routes/privacy.routes.js` | Updated stale `schemaVersion` from `phase4-v1` to `phase5-v1` |

---

## Still Pending

| # | Fix | Notes |
|---|-----|-------|
| 37 | Implement full MFA TOTP setup + verify flow | Routes stub exists; UI + TOTP logic needed |
| 38 | Remove mock subscription, enforce tiers server-side | Depends on Stripe being fully wired end-to-end |
| L4 | Add screenshot or demo to `landing.html` | |
| Audit | Locked accounting periods | |
