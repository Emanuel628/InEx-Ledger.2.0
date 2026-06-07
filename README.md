# InEx Ledger

InEx Ledger is a focused bookkeeping app for solo operators and very small service businesses that need clean books, receipt-backed records, invoices, and CPA hand-off exports without a full accounting-suite workflow.

## Repo Status

As of 2026-06-07, the product is in final launch stabilization.

Major foundation work is done:

- transaction import, mapping, review, receipts, invoices, and exports are implemented
- support email threading back into the app is working
- Stripe billing, add-on businesses, cancellation, reactivation, and customer portal flows are wired
- export packet and review logic have had multiple hardening passes
- major roadmap cleanup and product-scope tightening has already happened

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
