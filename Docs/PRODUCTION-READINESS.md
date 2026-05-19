# Production Readiness

This document is the release gate for public production deploys of InEx Ledger.
Last updated alongside PRs #201–#206 (CSV batches, tax summaries, audit log,
session history, bank-import abstraction, year-end tax dashboard).

## Required environment variables

Always required (any environment):

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_BASE_URL`
- `RESEND_API_KEY`

Production-required (fail-closed at startup via `envValidationService`):

- `CSRF_SECRET`
- `FIELD_ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EXPORT_GRANT_SECRET`
- `RECEIPT_STORAGE_DIR`
- Every `STRIPE_PRICE_*` entry from `services/stripePriceConfig.js`
  - `STRIPE_PRO_M_US`, `STRIPE_PRO_Y_US`, `STRIPE_PRO_M_CA`, `STRIPE_PRO_Y_CA`
  - `STRIPE_ADDL_M_US`, `STRIPE_ADDL_Y_US`, `STRIPE_ADDL_M_CA`, `STRIPE_ADDL_Y_CA`

Recommended supporting variables:

- `EMAIL_FROM` (or `RESEND_FROM_EMAIL`)
- `STRIPE_API_VERSION`
- `EXPORT_GRANT_TTL_MS`
- `RECEIPT_STORAGE_PERSISTENT`
- `DB_SSL_REJECT_UNAUTHORIZED`
- `REDIS_URL` (rate-limiter falls back to in-memory when absent)
- `RAILWAY_GIT_COMMIT_SHA` / `GIT_COMMIT` / `SOURCE_VERSION` (surfaced in `/api/system/diagnostics`)

## Deployment commands

```bash
npm install --omit=dev
npm start
```

The `prestart` script runs `repair-migration-checksums.js`. After boot,
verify `/health` returns `200`.

## Required regression commands

Run all of these before public release:

```bash
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

`npm run test:all` should report **462+ tests pass, 0 fail** (current baseline
after PR #206).

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

- Verify Stripe checkout starts successfully (USD and CAD).
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

## CSV import verification

- Verify CSV import creates a `transaction_imports` batch row.
- Verify duplicates (±2 days, same account, same amount/type, fuzzy
  description) are skipped when `skip_duplicates` is on.
- Verify `GET /api/transactions/import/history` lists recent batches.
- Verify `POST /api/transactions/import/:id/revert` soft-deletes the
  batch's transactions and refuses on locked-period overlap.

## Tax surface verification

- Verify `GET /api/transactions/tax-summary/payers?year=YYYY` returns
  declared/expected form per payer.
- Verify `GET /api/transactions/tax-summary/tax-lines?year=YYYY[&region=...]`
  groups by Schedule C / T2125 line and includes unmapped categories.
- Verify `GET /api/transactions/tax-summary/quarterly` returns the right
  next deadline (US: 4/15, 6/15, 9/15, 1/15; CA: 3/15, 6/15, 9/15, 12/15).
- Verify `GET /api/transactions/tax-summary/dashboard?year=YYYY` matches
  the standalone endpoints.
- Verify `GET /api/categories/unmapped?region=US|CA`.

## Security / audit verification

- Verify `GET /api/me/audit-events` shows recent login success / failure
  events for the current user.
- Verify `GET /api/sessions` returns device label, IP, `last_active_at`,
  and an `is_current` flag.
- Verify `DELETE /api/sessions/:id` and `DELETE /api/sessions` both write
  an `auth.session.revoked` row to `audit_events`.
- Verify `audit_events` rejects UPDATE / DELETE (insert-only via pg rules).
- Verify `GET /api/system/diagnostics` (auth-required) never includes raw
  secret values — only booleans / counts / uptime.

## Database and migration verification

- Verify all expected migrations have run (`schema_migrations` row count).
- Verify transaction payer fields exist (`payer_name`, `tax_form_type`).
- Verify accounting lock columns exist on `businesses`.
- Verify recurring run tables exist (`recurring_transactions`, `recurring_transaction_runs`).
- Verify import batch tables exist (`transaction_imports`, plus
  `transactions.import_batch_id` / `import_source`).
- Verify session enrichment columns exist (`refresh_tokens.last_used_at`,
  `ip_address`, `user_agent`, `device_label`).
- Verify audit log table exists (`audit_events`) with insert-only pg rules.
- Verify bank-import scaffolding exists (`bank_connections` table;
  `accounts.bank_connection_id`/`source`; `transactions.external_id`,
  `posted_date`, `merchant_name`, `pending`).

## End-to-end test workflow

`.github/workflows/e2e-smoke.yml` runs the Playwright suite under
`In-Ex-Ledger-API/tests/e2e/*.spec.js` against a Postgres 15 service.

- Triggers: `workflow_dispatch` (manual) and a daily `cron` at 08:00 UTC.
- Not yet wired as a required PR check — the workflow is intentionally
  isolated so it does not slow the merge queue while the suite stabilizes.
- The workflow installs Playwright browsers (`chromium`) before running.
- Failure uploads `playwright-report` and `test-results` as a 7-day
  artifact.
- The workflow asserts that `playwright.config.js` and at least one
  `tests/e2e/*.spec.js` exist before running. If either is missing, the
  workflow fails with a clear `::error::` message rather than reporting
  a no-op green run.

Before promoting this workflow to a required PR check, address the
known flake/runtime gaps in `Work-To-Do/E2E-FINDINGS-NEW-USER.md` and
move it to a `pull_request` trigger on relevant paths.

## Rate limiting degradation behavior

The API has a layered rate-limiting contract that is enforced at startup
and at request time:

- Production requires `RATE_LIMIT_ENABLED=true`. When this is not set (or
  is any value other than `"true"`) and `NODE_ENV=production`, every API
  request returns `503 Service temporarily unavailable due to rate
  limiting requirements.` until the configuration is corrected. The API
  fails closed; no traffic is served without limiter enforcement.
- When `RATE_LIMIT_ENABLED=true` and Redis is unreachable, the limiter
  falls back to a per-process in-memory store and reports
  `rateLimiting.mode = "degraded"` in `/health`. The API stays available,
  but each Node.js process maintains its own counters. In a
  multi-instance deployment (e.g. Railway with horizontal scaling), this
  means rate limits are **not global** across instances; a determined
  attacker can divide their request volume across instances to multiply
  their effective allowance.
- Redis should therefore be treated as **required** for production-grade,
  multi-instance abuse protection. The in-memory fallback exists to keep
  the API serving traffic during transient Redis outages, not as a
  long-running production configuration.

Operational checks:
- `/health` returns `503` whenever the rate limiter is `degraded` and the
  limiter is required (production with `RATE_LIMIT_ENABLED=true`).
- `GET /api/system/diagnostics` (auth-required) exposes the limiter mode
  for operators.
- If Redis is unavailable for more than a brief outage, treat the
  deployment as degraded and restore Redis before the next traffic peak.

## Rollback notes

- Keep a production database backup before deploy. See `BACKUP-RESTORE.md`.
- If rollback is required, redeploy the previous release first.
- Restore the database only if data integrity was affected.
- Re-verify `/health`, auth, billing, receipts, and exports after rollback.
- `audit_events` and `transaction_imports` rows are insert-only / append-only
  by design — do not attempt to "clean up" rows during rollback.
