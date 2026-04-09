# InEx Ledger 2.0 — Task Status

---

## Phases 1–4 Completed

All Phase 1 (critical fixes), Phase 2 (security & hardening), Phase 3 (missing routes & features), and Phase 4 (cleanup & consistency) tasks have been resolved.

### Phase 4 Fixes Applied

| # | File | Fix |
|---|------|-----|
| P4-1 | `routes/messages.routes.js` | Fixed `mapMessageRow` conflating `is_archived_by_sender`/`is_archived_by_receiver` — `is_archived` is now role-aware based on the viewer's user ID |
| P4-2 | `routes/mileage.routes.js` | Cached `getMileageColumnMode()` result in a module-level variable to eliminate repeated `information_schema` introspection at runtime |
| P4-3 | `routes/index.js` | Removed redundant `router.use('/', systemRoutes)` — system routes are correctly mounted only at `/system` |
| P4-4 | `db.js` | Removed unused `logDbIdentity()` function and its export |
| P4-5 | `services/subscriptionService.js` | Removed unused `getSubscriptionSnapshotForUser()` function and its export |
| P4-6 | `routes/privacy.routes.js` | Updated stale `schemaVersion` from `phase4-v1` to `phase5-v1` |

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
