# InEx Ledger

InEx Ledger is a streamlined bookkeeping app for solo operators, 1099 workers, freelancers, independent contractors, and small service businesses that need clean income and expense records without a full accounting-suite workflow.

The app is built around a simple promise: track income, expenses, receipts, mileage, and export-ready records in a calm, organized interface that is practical for tax season and business review.

## Live App

https://inexledger.com

## Current Status

InEx Ledger is in final production stabilization.

The core product is implemented and the repo is now focused on launch polish, smoke testing, and production verification rather than major new feature development.

Current readiness estimate:

- Product completeness: 89-93%
- Technical foundation: 90-93%
- Security/auth structure: 88-91%
- Frontend polish: 84-88%
- Production readiness: 82-87%

Recommended launch posture:

- Soft launch: ready after smoke testing
- Paid/public launch: ready after live billing, receipt upload, export, auth, and mobile flows are verified end-to-end

## Product Scope

InEx Ledger is not trying to be QuickBooks.

It is designed to be a clean, CPA-safe bookkeeping tool for users who need:

- Income tracking
- Expense tracking
- Account and category organization
- Receipt uploads
- Mileage tracking
- CSV and PDF exports
- Subscription billing
- Multi-business support
- US and Canada support
- English, Spanish, and French UI support

## Core Features

### Bookkeeping

- Income and expense transactions
- Business-scoped accounts and categories
- Transaction edits using accounting-safe adjustment behavior
- Transaction delete/archive behavior instead of destructive hard deletes
- Accounting period lock support
- CSV import/export support
- Tax-prep focused export workflows

### Receipts

- Receipt upload support
- Receipt metadata handling
- Production guardrails for persistent storage
- Receipt storage health/status checks

### Mileage

- Mileage tracking routes and UI
- Mileage history and mutation support

### Authentication and Security

- Email/password account creation
- Email verification
- Short-lived access tokens
- Refresh-token backed sessions
- MFA support using emailed 6-digit verification codes
- Trusted-device handling
- Account-switch MFA trust handling
- Session listing and revocation
- CSRF protection
- Rate limiting
- Helmet security headers
- CORS allowlisting

### Billing

- Stripe checkout sessions
- Stripe customer portal
- Subscription status sync
- Billing cancellation flow
- Webhook idempotency handling
- Plan/add-on support
- Billing lifecycle email support
- Server-side subscription enforcement for paid features

### App Experience

- Vanilla HTML, CSS, and JavaScript frontend
- Express-served frontend bundle under `In-Ex-Ledger-API/public/`
- Light-mode locked UI while dark mode is redesigned
- Mobile-responsive app shell
- Shared topbar/account menu behavior
- Multi-language frontend support

## Stack

- Backend: Node.js, Express
- Database: PostgreSQL
- Frontend: Vanilla HTML, CSS, JavaScript
- Email: Resend
- Billing: Stripe
- Rate limiting: Redis-backed when enabled
- Deployment: Railway
- PDF/export worker: separate `pdf-worker/` service

## Project Structure

```text
InEx-Ledger.2.0/
├── In-Ex-Ledger-API/
│   ├── public/                 # Live frontend bundle served by Express
│   ├── routes/                 # API route modules
│   ├── middleware/             # Auth, CSRF, rate limit, MFA trust middleware
│   ├── services/               # Business logic and external integrations
│   ├── db/                     # SQL migrations
│   ├── tests/                  # Node test suite
│   ├── scripts/                # Verification and maintenance scripts
│   ├── server.js               # Express app entry point
│   └── package.json
├── pdf-worker/                 # PDF export worker service
├── docs/                       # Supporting architecture, security, and compliance notes
└── README.md
```

## Production Readiness Checklist

Before a public paid launch, verify these flows on the deployed production app:

1. Register a new account.
2. Verify email.
3. Log in.
4. Enable MFA.
5. Log out.
6. Log into another account on the same device.
7. Confirm account-switch MFA behavior.
8. Create, edit, and archive a transaction.
9. Upload a receipt.
10. Export records.
11. Open subscription page.
12. Start Stripe checkout.
13. Open Stripe billing portal.
14. Cancel/manage subscription.
15. Verify mobile header, navigation, and account menu on iPhone.

## Useful Commands

Run from `In-Ex-Ledger-API/`:

```bash
npm install
npm start
```

Regression and verification commands:

```bash
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

Targeted tests are also available through the scripts in `In-Ex-Ledger-API/package.json`.

## Environment

Use `In-Ex-Ledger-API/.env.example` as the baseline for local or production configuration.

Important production variables include:

```text
DATABASE_URL
JWT_SECRET
CSRF_SECRET
APP_BASE_URL
RESEND_API_KEY
EMAIL_FROM or RESEND_FROM_EMAIL
REDIS_URL
RATE_LIMIT_ENABLED
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_V1_MONTHLY_USD
STRIPE_PRICE_V1_YEARLY_USD
STRIPE_PRICE_V1_MONTHLY_CAD
STRIPE_PRICE_V1_YEARLY_CAD
RECEIPT_STORAGE_DIR
RECEIPT_STORAGE_PERSISTENT
NODE_ENV=production
```

The exact Stripe price variable names should match `services/stripePriceConfig.js`.

## Development Notes

- The live frontend is served from `In-Ex-Ledger-API/public/`.
- Avoid changing DOM IDs, form IDs, route paths, or JS hooks during UI-only polish.
- Keep UI work scoped to HTML/CSS unless behavior changes are intentionally required.
- Keep major changes out of launch stabilization unless they fix production blockers.
- Prefer focused commits over broad rewrites.

## License

All rights reserved.
