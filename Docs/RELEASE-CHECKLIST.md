# Release Checklist

Run this checklist for every production release.

See:

- `PRODUCTION-READINESS.md` for the production gate
- `CURRENT_STATUS.md` for the current launch posture

## Pre-release

- run `npm run test:all` and confirm 0 failures
- run `npm run log_scan`
- run `npm run verify:redacted-storage`
- verify schema migrations are applied
- verify production environment variables are present
- confirm latest `main` commit matches the deploy target SHA

## Smoke tests

- verify `/health` returns healthy
- verify signup, email verification, and login
- verify trial state for a fresh account
- verify first transaction create and review workflow
- verify receipt upload and linking
- verify invoice send and reply
- verify support send and reply back into the app
- verify Stripe checkout
- verify Stripe billing portal
- verify cancel and reactivate flow
- verify exports and export history

## UI checks

- verify no console errors on landing, login, transactions, receipts, settings, subscription, messages, and exports
- verify mobile layout on iPhone Safari and Android Chrome for key pages
- verify onboarding flow
- verify settings security section
- verify subscription page pricing and business-count behavior

## Post-release

- check Railway deploy logs for unexpected warnings or errors
- check Stripe webhook logs for delivery successes
- check support email inbound logs
- check export history downloads work
- record the release commit SHA and deploy time
