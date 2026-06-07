# Current Launch Blockers

Last repo audit: 2026-06-03

This list is based on the current codebase state, not the roadmap docs.

## Must Fix Before Launch

### 1. Full browser QA has not been proven from the current repo state
- The repo has had many recent backend, export, messaging, and settings changes.
- Current confidence is mostly route tests and helper tests, not full browser verification.
- Core flows that still need live end-to-end verification:
  - onboarding and `trial-setup`
  - active business switching
  - transaction import and review cleanup
  - receipts link, unlink, relink
  - invoice create, send, reply
  - support message send and email reply back into the app
  - export packet generation and review queue behavior

### 2. Multi-business premium export batching is still disabled
- This is explicitly blocked in the frontend today.
- Evidence:
  - [exports.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/exports.js:1593)
  - [exports.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/exports.js:1680)
- Current behavior:
  - premium CSV export: one business at a time
  - premium PDF export: one business at a time

### 3. Support email replies require correct inbound-domain configuration, not just Gmail
- Current code supports app threading for replies, but only if the reply domain is webhook-controlled.
- `SUPPORT_TO_EMAIL` can be Gmail.
- `SUPPORT_REPLY_BASE_EMAIL` cannot be Gmail if replies are expected to land back in-app.
- Evidence:
  - [supportEmailService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/supportEmailService.js:35)
  - [messages.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/messages.routes.js:594)
  - [email.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/email.routes.js:418)
  - [supportEmail.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/supportEmail.routes.js:1)
- Launch blocker if production inbound mail is not fully configured.

### 4. Export/compliance outputs are still intentionally partial when ledger data is insufficient
- These are not code bugs, but they are real product limits that must be acceptable for launch.
- Evidence:
  - Quick Method can return unsupported results in [quickMethodService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/quickMethodService.js:198)
  - Regular GST/HST can return unsupported results in [regularMethodService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/regularMethodService.js:74)
  - Home office can return unsupported results in [homeOfficeService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/homeOfficeService.js:83)
  - Packet surfaces these unsupported conditions in [pdfGeneratorService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/pdfGeneratorService.js:2685)
- Launch decision required:
  - acceptable as `CPA hand-off ready with clear review-required cases`
  - not acceptable if marketed as fully automated tax/compliance output

### 5. Some exposed product surfaces are still placeholder or “coming later” pages
- If reachable from users, these weaken trust and muddy scope.
- Evidence:
  - [ar-ap.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/ar-ap.html:1)
  - [bills.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/bills.html:1)
  - [customers.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/customers.html:1)
  - [projects.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/projects.html:1)
  - [vendors.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/vendors.html:1)
  - [billable-expenses.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/billable-expenses.html:1)
- Launch blocker if these are discoverable from primary user paths.

## High-Risk Product Quality Issues

### 6. Encoding / mojibake is still present in frontend strings
- This is a visible polish and trust issue.
- Evidence:
  - [i18n.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/i18n.js:5048)
  - [categories-backend.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/categories-backend.js:153)
- This should be cleaned before launch traffic.

### 7. `accounting_method` is enforced as required profile data, but still looks only partially operational
- It is required in business profile and export readiness logic.
- I did not verify a true cash-vs-accrual engine across transaction timing and reporting.
- Evidence:
  - [business.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/business.routes.js:209)
  - [exportSnapshotService.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/exportSnapshotService.js:133)
- Launch blocker if the app is presented as meaningfully supporting both accounting methods.

### 8. Secondary and legacy surfaces still need exposure review
- These may be fine if internal or hidden, but not if user-facing in the main flow.
- Candidates to verify:
  - [business-settings-cpa.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/business-settings-cpa.html:1)
  - [compliance-dashboard.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/compliance-dashboard.html:1)
  - [review.html](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/html/review.html:1) is correctly a redirect now, but should stay that way

## Operational Prerequisites

### 9. Production env configuration must be complete
- The current code has hard runtime dependencies on configured services and secrets.
- Important examples:
  - email delivery: `RESEND_API_KEY`
  - billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, pricing envs
  - exports: `EXPORT_GRANT_SECRET`, `EXPORT_PUBLIC_KEY_JWK`, `EXPORT_PRIVATE_KEY_JWK`
  - support reply threading: `SUPPORT_REPLY_BASE_EMAIL`, `SUPPORT_REPLY_HMAC_SECRET`, inbound webhook secret
- Evidence:
  - [auth.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/auth.routes.js:63)
  - [billing.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/billing.routes.js:1292)
  - [crypto.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/crypto.routes.js:44)
  - [pdfWorkerClient.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/services/pdfWorkerClient.js:9)
  - [supportEmail.routes.js](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/routes/supportEmail.routes.js:76)

### 10. Latest migrations must be applied before release
- Especially the new required business contact field:
  - [20260603_add_business_contact_full_name.sql](/c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/db/migrations/20260603_add_business_contact_full_name.sql:1)
- Launch blocker if production schema lags behind code.

## Recommended Final Pre-Launch Pass

1. Browser-level QA on the core workflow.
2. Confirm production inbound support reply path works with the live webhook URL.
3. Hide or remove any reachable placeholder pages.
4. Clean visible mojibake / encoding issues.
5. Decide whether `accounting_method` is real product scope or should be demoted in UX/copy.
6. Run one accountant/bookkeeper sanity review on the actual generated export packet.

## Bottom Line

The app is not blocked by a huge unknown feature gap.

The current blockers are:
- launch QA proof
- operational support-email reply configuration
- disabled multi-business export batching
- placeholder/legacy surfaces if still reachable
- a few trust/polish issues in strings and scope messaging
