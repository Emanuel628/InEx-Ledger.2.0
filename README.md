# InEx Ledger

InEx Ledger is a focused bookkeeping app for solo operators and very small service businesses that need clean books, receipt-backed records, invoices, and CPA hand-off exports without a full accounting-suite workflow.

## Repo Status

As of 2026-08-17, the product is in final launch stabilization.

Major foundation work is done:

- transaction import, mapping, review, receipts, invoices, and exports are implemented
- support email threading back into the app is working
- Stripe billing, add-on businesses, cancellation, reactivation, and customer portal flows are wired
- export packet and review logic have had multiple hardening passes
- major roadmap cleanup and product-scope tightening has already happened
- the frontend has migrated from vanilla HTML/CSS/JS to a React + TypeScript SPA (`In-Ex-Ledger-API/frontend-v3`), which is now the canonical logged-in product experience, including the full auth bridge (login, register, password reset, email verification, MFA) and live English/Spanish/French UI switching
- a full code-quality/security remediation pass across error handling, dynamic SQL, idempotency/dedupe correctness, route decomposition, and documentation is complete (`Work-Review/AI-SLOP-REMEDIATION-PROGRESS.md`)

What remains is mostly final QA, production verification, and targeted polish rather than large product construction.

## Start Here

- product overview: [Docs/PROJECT-README.md](Docs/PROJECT-README.md)
- current status and launch posture: [Docs/CURRENT_STATUS.md](Docs/CURRENT_STATUS.md)
- production gate: [Docs/PRODUCTION-READINESS.md](Docs/PRODUCTION-READINESS.md)
- release steps: [Docs/RELEASE-CHECKLIST.md](Docs/RELEASE-CHECKLIST.md)

## Repo Layout

```text
InEx-Ledger.2.0/
|- In-Ex-Ledger-API/   # Main app
|- pdf-worker/         # PDF export worker
|- Docs/               # Active docs
|- Work-To-Do/         # Active work trackers
|- Work-Review/        # Audit/review docs
`- Work-Completed/     # Archived completed/stale docs
```

## Development

Run from `In-Ex-Ledger-API/`:

```bash
npm install
npm start
npm run test:all
npm run log_scan
npm run verify:redacted-storage
```

## Frontend V3

The React + TypeScript UI builds from `In-Ex-Ledger-API/frontend-v3` into `In-Ex-Ledger-API/public/app-v3` and is served at canonical bare routes (e.g. `/transactions`, `/login`); `/app-v3` and `/app-v3/<page>` 301-redirect to the canonical path, and built assets remain under `/app-v3/assets`. It uses the existing 2.0 backend/auth/session/CSRF APIs. The v3 SPA is now the canonical logged-in product experience and the entire auth bridge (login, register, forgot/reset password, verify-email, MFA challenge); legacy HTML remains only for marketing/SEO pages and gated Business-tier placeholders. See [Docs/V3_ROUTE_INVENTORY.md](Docs/V3_ROUTE_INVENTORY.md) for the authoritative per-route status.
