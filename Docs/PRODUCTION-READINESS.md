# Production Readiness

This document is the release gate for public production deploys of InEx Ledger.

Last updated: 2026-08-17.

## Required environment variables

This is the same list `services/envValidationService.js`'s
`collectRequiredEnvironmentVariables()` enforces at startup — it's the
source of truth; this table exists so the reasoning behind each entry
doesn't only live in code comments. Keep the two in sync when either
changes; `tests/envValidationService.test.js` will fail if they drift
apart from each other in behavior (though not from this doc, since a
markdown file can't be asserted against — review this table by eye
whenever `ENV_VARIABLE_REGISTRY` changes).

**Core tier** — required in every environment; nothing meaningful works without these:

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Database connection string; nothing works without it. |
| `JWT_SECRET` | Signs and verifies every auth token. |
| `APP_BASE_URL` | Builds absolute links used in emails and redirects. |
| `RESEND_API_KEY` | Required for all outbound transactional email. |

**Production tier** — required only in production, but unconditionally
(the feature is core and unconditionally mounted, not behind a flag):

| Variable | Why |
| --- | --- |
| `CSRF_SECRET` | Signs the CSRF double-submit token; the CSRF middleware throws on every request if unset. |
| `FIELD_ENCRYPTION_KEY` | Encrypts sensitive stored fields (e.g. tax IDs) at rest. |
| `STRIPE_SECRET_KEY` | Required for every billing/Stripe API call. |
| `STRIPE_WEBHOOK_SECRET` | Verifies inbound Stripe webhook signatures; `POST /api/billing/webhook` rejects everything without it. |
| `EXPORT_GRANT_SECRET` | Signs short-lived export download grants. |
| `RECEIPT_STORAGE_DIR` | Filesystem path receipts are persisted to. |
| `INEX_LEDGER_SUPPORT_SECRET` | Shared secret gating the internal support API. |
| `REDIS_URL` | Rate limiting is unconditionally required in production; missing this previously degraded silently to a per-instance in-memory limiter instead of failing startup. |
| `EXPORT_PUBLIC_KEY_JWK` | Public key for verifying secure export grants; the crypto route degrades to 503 without it. |
| `EXPORT_PRIVATE_KEY_JWK` | Private key for signing secure export grants. |
| every Stripe price env in `services/stripePriceConfig.js` | Pricing/checkout resolution needs a real Stripe price ID for every plan/interval/currency/region combination. |

**Feature-gated, deliberately not required** — these secrets gate specific
inbound webhook features, but there's no code-level flag (no
`ENABLE_INBOUND_EMAIL`-style toggle) to know whether a given deployment
actually uses them, so requiring them unconditionally would be guessing at
product scope rather than validating a known contract. Both routes already
fail closed with a clean `503` when unconfigured — this is an
ops-observability gap (only surfaces at request time, not startup), not a
security gap:

| Variable | Gates | Behavior when unset |
| --- | --- | --- |
| `SUPPORT_INBOUND_WEBHOOK_SECRET` / `INBOUND_EMAIL_WEBHOOK_SECRET` | Support-reply inbound email webhook | `503 "Support inbound webhook is not configured."` |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | General inbound email webhook | `503` in the same way |
| `SUPPORT_REPLY_HMAC_SECRET` | Signs support-reply email links | Only exercised by the inbound-email features above |
| `PDF_WORKER_URL` / `PDF_WORKER_SECRET` | Would authenticate calls to the pdf-worker microservice via `dispatchPdfJob` | Not currently required for any live code path — live PDF export goes through `pdfGeneratorService.js`'s in-process `generatePdfExportPair` instead; nothing calls `dispatchPdfJob` today |

Recommended supporting variables (not enforced by `envValidationService.js`,
but worth setting in production):

- `EMAIL_FROM` or `RESEND_FROM_EMAIL`
- `STRIPE_API_VERSION`
- `RECEIPT_STORAGE_PERSISTENT`
- deploy SHA metadata envs
- support reply threading envs: `SUPPORT_TO_EMAIL`, `SUPPORT_REPLY_BASE_EMAIL`

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
