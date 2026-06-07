# Current Launch Status

Last updated: 2026-06-07

This is the current repo-level status document.

## Where We Stand

InEx Ledger is in final launch stabilization.

The app is no longer in major feature-build mode. The remaining work is mostly:

- live browser and production-like smoke verification
- Stripe-side validation
- final UX and copy polish
- final documentation and launch discipline

## Completed Work

### Core bookkeeping loop

Completed:

- transaction import
- mapping and learned-rule persistence
- review queue and fix-next workflow
- receipt linking, unlinking, relinking, and support handling
- invoice workflow and reply threading
- export packet and category/tax-map hardening

### Billing and subscription

Completed:

- Stripe checkout
- Stripe billing portal
- subscription status sync
- business add-on provisioning
- business deletion with Stripe slot sync
- cancellation and reactivation flow
- repeat-trial prevention for reopened accounts
- automatic tax enabled in checkout by default

### Messaging and support

Completed:

- in-app threads
- support send flow
- support reply threading back into the app
- invoice reply threading
- internal support lookup endpoints protected by shared secret

### Product cleanup

Completed:

- review folded back into Exports instead of standalone nav
- Business-tier public messaging removed until defined
- MCP surface removed from the app
- major nav and page-scope cleanup

## Intentionally Not In Launch Scope

These are not launch blockers if they remain hidden or locked:

- Business Tier placeholder pages such as AR/AP, vendors, bills, customers, and projects
- deeper CPA/admin surfaces that are hidden or redirected
- combined multi-business exports

## Active Launch Work

### 1. Live QA proof

Still required:

- fresh-account signup flow
- onboarding flow
- Stripe checkout and portal flow
- cancellation and reactivation flow
- support message send and reply
- invoice send and reply
- receipts workflow
- exports workflow

### 2. Stripe-side verification

Still required:

- confirm monthly plan behavior matches the intended offer
- confirm yearly is only surfaced where Stripe actually supports it
- confirm automatic tax registration and config in Stripe itself
- confirm proration behavior for additional businesses in live mode

### 3. Final polish

Still required:

- remaining mojibake and i18n cleanup
- final visual cleanup on rough settings/subscription surfaces
- final premium-email polish where needed

### 4. External sanity pass

Still required:

- one accountant or bookkeeper review of export wording and hand-off usefulness

## Launch Posture

Current practical posture:

- soft-launch readiness: near
- public paid launch readiness: pending final smoke verification and Stripe validation

## Source Of Truth

Use this file for current status.

Older roadmap and blocker snapshots belong in `Work-Completed/` once they stop describing active work accurately.
