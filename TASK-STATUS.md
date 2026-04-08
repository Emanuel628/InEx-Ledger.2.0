# InEx Ledger 2.0 - Current Status

## Live App Structure

- The live app is served from `In-Ex-Ledger-API/public/`.
- The repo-root `public/` folder is a legacy mirror and is not the Railway production bundle.
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
- Expand automated coverage for auth, billing, and settings-critical flows.
- Remove or consolidate the remaining legacy root-level `public/` mirror when safe.
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

- `node --test tests/rateLimiter.test.js`
- `node --test tests/subscriptionService.test.js`
- `npm run log_scan`
- `npm run verify:redacted-storage`
