# Production Readiness

This document is the release gate for public production deploys of InEx Ledger.

Last updated: 2026-06-07.

## Required environment variables

Always required:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_BASE_URL`
- `RESEND_API_KEY`

Production-required:

- `CSRF_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EXPORT_GRANT_SECRET`
- `RECEIPT_STORAGE_DIR`
- every Stripe price env required by `services/stripePriceConfig.js`

Recommended supporting variables:

- `EMAIL_FROM` or `RESEND_FROM_EMAIL`
- `STRIPE_API_VERSION`
- `RECEIPT_STORAGE_PERSISTENT`
- `REDIS_URL`
- deploy SHA metadata envs
- support reply threading envs
  - `SUPPORT_TO_EMAIL`
  - `SUPPORT_REPLY_BASE_EMAIL`
  - `SUPPORT_REPLY_HMAC_SECRET`
  - inbound webhook secret used by the live webhook route

## Required verification commands

Run all of these before public release:

```bash
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

The requirement is simple: 0 failures.

## Billing verification

- verify Stripe checkout starts successfully
- verify Stripe webhook delivery succeeds with the deployed secret
- verify subscription activation updates app state
- verify billing portal opens
- verify cancel-at-period-end flow
- verify reactivation flow
- verify live pricing shown in-app matches Stripe
- verify add-on business pricing and proration behavior
- verify automatic tax is correctly configured in Stripe itself

## Export verification

- verify secure PDF export completes
- verify redacted export history download works
- verify support evidence appears where expected
- verify unresolved blockers are surfaced honestly in the packet

## Email verification

- verify signup verification email
- verify password reset email
- verify billing and MFA emails
- verify cancellation confirmation email
- verify support replies route back into the app
- verify invoice replies route back into the app

## Receipt verification

- verify upload, attach, detach, unlink, relink, and delete flows
- verify production receipt storage is persistent

## End-to-end verification

The Playwright smoke workflow exists, but final launch still requires live browser proof on the deployed app for:

- signup and onboarding
- business switching
- transactions and review
- receipts
- invoices and replies
- support messages and replies
- subscription and billing
- exports

## Rollback notes

- keep a production database backup before deploy
- redeploy the previous release first if rollback is needed
- restore the database only if data integrity was affected
- re-verify health, auth, billing, receipts, and exports after rollback
