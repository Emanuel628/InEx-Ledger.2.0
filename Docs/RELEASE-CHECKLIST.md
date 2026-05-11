# Release Checklist

Run this checklist for every production release. See
`PRODUCTION-READINESS.md` for the canonical surface list and required env vars.

## Pre-release

- Run `npm run test:all` and confirm **0 failures**
- Run `npm run log_scan`
- Run `npm run verify:redacted-storage`
- Verify schema migrations are applied (`npm run migrations:verify-checksums`)
- Verify production environment variables are present
  (see `services/envValidationService.js`)
- Confirm latest commit on `main` matches the deploy target SHA

## Smoke tests

- Verify `/health` returns `200` with `status: "healthy"`
- Verify `GET /api/system/diagnostics` shows expected `*_configured: true`
  flags for Stripe, Resend, encryption, auth secrets
- Verify signup → email verification → login round-trip
- Verify trial state for a fresh account
- Verify first transaction create / edit / delete
- Verify bulk delete respects accounting locks
- Verify single delete + undo-delete respect accounting locks
- Verify receipt upload, attach, detach, restore
- Verify CSV import creates a batch and reports duplicate/imported counts
- Verify `POST /api/transactions/import/:id/revert` rolls a batch back
- Verify export generation, redacted history, secure download
- Verify Stripe checkout (USD and CAD)
- Verify Stripe billing portal opens
- Verify resume / cancel-at-period-end / immediate cancel flows
- Verify payer summary + tax-line summary + quarterly + dashboard endpoints
  return sensible data for a real account

## Security / audit checks

- Sign in and confirm a row appears in `audit_events` with
  `action = 'auth.login.success'`
- Sign in with a wrong password and confirm `auth.login.failure`
- `GET /api/sessions` shows the current session with `is_current: true`
- `DELETE /api/sessions/:id` records `auth.session.revoked` with
  `metadata.scope = 'single'`
- Confirm `audit_events` is insert-only (any direct UPDATE / DELETE is silently
  dropped — pg rules)

## UI checks

- Verify no console errors on landing, login, dashboard, transactions,
  receipts, settings, billing, exports
- Verify mobile layout on iPhone Safari + Android Chrome for key pages
- Verify transaction table and drawers
- Verify subscription page (current plan, renewal/cancel date, invoice list)
- Verify settings page
- Verify onboarding flow

## Post-release

- Check Railway deploy logs for unexpected warnings or errors
- Check Stripe webhook logs for delivery successes
- Check receipt storage status in `/api/system/diagnostics`
- Check export history downloads work
- Record the release commit SHA and deploy time
- Spot-check `/api/me/audit-events` for a real user — events for the
  release flow (logins, exports) should appear

## Rollback

- See `BACKUP-RESTORE.md` for the database backup + restore procedure.
- Redeploy the previous release tag in Railway before considering a DB
  restore.
