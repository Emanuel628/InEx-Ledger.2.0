# Release Checklist

Run this checklist for every production release.

## Pre-release

- Run `npm run test:all`
- Run `npm run log_scan`
- Run `npm run verify:redacted-storage`
- Verify schema migrations are applied
- Verify production environment variables are present

## Smoke tests

- Verify `/health`
- Verify signup
- Verify login
- Verify trial state
- Verify first transaction create/edit/delete
- Verify bulk delete respects accounting locks
- Verify receipt upload
- Verify CSV import
- Verify export generation
- Verify Stripe checkout
- Verify Stripe billing portal
- Verify resume/cancel billing flows

## UI checks

- Verify no console errors
- Verify mobile layout on key pages
- Verify transaction table and drawers
- Verify subscription page
- Verify settings page
- Verify onboarding flow

## Post-release

- Check deploy logs
- Check webhook logs
- Check receipt storage status
- Check export history
- Record release commit SHA and deploy time
