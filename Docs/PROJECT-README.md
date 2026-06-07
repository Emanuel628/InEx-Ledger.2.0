# InEx Ledger

InEx Ledger is a focused bookkeeping app for solo operators and very small service businesses that need clean books, receipt-backed records, invoices, and CPA hand-off exports without a full accounting-suite workflow.

## Live App

https://inexledger.com

## Current Status

InEx Ledger is in final production stabilization.

The core product is implemented and the repo is now focused on launch polish, smoke testing, production verification, and targeted UX cleanup rather than major new feature development.

Recommended launch posture:

- soft launch: ready after live smoke verification
- public paid launch: ready after final Stripe, support email, export, and mobile verification

See [CURRENT_STATUS.md](CURRENT_STATUS.md) for the current repo-level launch posture.

## Product Scope

InEx Ledger is not trying to be QuickBooks.

It is designed to be a clean bookkeeping product for users who need:

- income tracking
- expense tracking
- account and category organization
- receipt uploads and linking
- mileage tracking
- invoices and message replies
- CSV and PDF exports
- subscription billing
- multi-business account support
- US and Canada support
- English, Spanish, and French UI support

## Core Features

### Bookkeeping

- income and expense transactions
- business-scoped accounts and categories
- CSV import support
- review queue and fix-next workflow
- tax-prep focused export workflows

### Receipts and Support

- receipt upload
- receipt linking, unlinking, and relinking
- support artifacts and notes tied to records
- production guardrails for persistent storage

### Billing

- Stripe checkout sessions
- Stripe customer portal
- subscription status sync
- business add-on provisioning
- cancellation and reactivation flow
- repeat-trial prevention for reopened accounts
- billing lifecycle email support

### Messaging

- in-app messages
- invoice reply threading
- support email replies routed back into the app
- notification routing for unread activity

### App Experience

- vanilla HTML, CSS, and JavaScript frontend
- Express-served frontend bundle under `In-Ex-Ledger-API/public/`
- mobile-responsive app shell
- shared topbar/account menu behavior
- multi-language frontend support

## Stack

- Backend: Node.js, Express
- Database: PostgreSQL
- Frontend: Vanilla HTML, CSS, JavaScript
- Email: Resend
- Billing: Stripe
- Deployment: Railway
- PDF/export worker: separate `pdf-worker/` service

## Project Structure

```text
InEx-Ledger.2.0/
|- In-Ex-Ledger-API/   # Main app
|- pdf-worker/         # PDF export worker
|- Docs/               # Active docs
|- Work-To-Do/         # Active work trackers
|- Work-Review/        # Audit/review docs
`- Work-Completed/     # Archived completed/stale docs
```

## Production Verification

Before public paid launch, verify these flows on the deployed production app:

1. register a new account
2. verify email
3. log in
4. enable MFA
5. create, edit, and review transactions
6. upload and link a receipt
7. send an invoice and verify a reply comes back in-app
8. send a support request and verify reply threading back in-app
9. open Subscription, Stripe checkout, and Stripe billing portal
10. cancel and reactivate a subscription
11. export records and review the final packet
12. verify key mobile pages on iPhone and Android widths

## Useful Commands

Run from `In-Ex-Ledger-API/`:

```bash
npm install
npm start
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

## License

All rights reserved.
