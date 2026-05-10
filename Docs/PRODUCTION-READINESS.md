# Production Readiness

This document is the release gate for public production deploys of InEx Ledger.

## Required environment variables

Always required:

- `DATABASE_URL`
- `JWT_SECRET`
- `CSRF_SECRET`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `FIELD_ENCRYPTION_KEY`

Production-required billing and export variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EXPORT_GRANT_SECRET`
- `RECEIPT_STORAGE_DIR`
- `STRIPE_PRO_M_US`
- `STRIPE_PRO_Y_US`
- `STRIPE_PRO_M_CA`
- `STRIPE_PRO_Y_CA`
- `STRIPE_ADDL_M_US`
- `STRIPE_ADDL_Y_US`
- `STRIPE_ADDL_M_CA`
- `STRIPE_ADDL_Y_CA`

Recommended supporting variables:

- `EMAIL_FROM`
- `STRIPE_API_VERSION`
- `EXPORT_GRANT_TTL_MS`
- `RECEIPT_STORAGE_PERSISTENT`
- `DB_SSL_REJECT_UNAUTHORIZED`
- `REDIS_URL`

## Deployment commands

1. Install dependencies:

```bash
npm install --omit=dev
```

2. Start the API:

```bash
npm start
```

3. Verify the app starts cleanly and `/health` responds.

## Required regression commands

Run all of these before public release:

```bash
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

Focused release checks:

```bash
npm run test:billing-addon
npm run test:subscription-service
npm run test:accounting-controls
npm run test:receipts-upload
npm run test:csrf
npm run test:auth-flows
npm run test:critical-flows
npm run test:integration
```

## Billing verification

- Verify Stripe checkout starts successfully.
- Verify Stripe webhook delivery succeeds with the deployed webhook secret.
- Verify subscription activation updates the app state.
- Verify billing portal opens.
- Verify cancel-at-period-end flow.
- Verify resume/reactivate flow.
- Verify invoice history loads.
- Verify USD and CAD pricing for monthly and yearly plans.
- Verify add-on business pricing.

## Export verification

- Verify secure PDF export completes.
- Verify redacted export history download works.
- Verify no non-redacted PDFs are written to export storage.
- Verify payer and tax-form metadata round-trip into exports when present.

## Email verification

- Verify signup verification email is sent.
- Verify password reset email is sent.
- Verify billing and MFA emails are delivered.

## Receipt verification

- Verify upload, attach, detach, delete, and restore flows.
- Verify production receipt storage is persistent.

## Database and migration verification

- Verify all expected migrations have run.
- Verify transaction payer fields exist.
- Verify accounting lock columns exist.
- Verify recurring run tables exist.

## Rollback notes

- Keep a production database backup before deploy.
- If rollback is required, redeploy the previous release first.
- Restore the database only if data integrity was affected.
- Re-verify `/health`, auth, billing, receipts, and exports after rollback.
