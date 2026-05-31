# CPA Codebase Audit Matrix

Last updated: 2026-05-30

## Purpose
This document catalogs the accounting, bookkeeping, tax, and export surfaces in the codebase so CPA-sensitive problems can be found systematically instead of by ad hoc review.

Status legend:
- `correct`: code path appears implemented and materially aligned with current intended behavior
- `partial`: some meaningful coverage exists, but the rule is incomplete, conservative, or structurally limited
- `wrong`: known implementation gap or materially incorrect behavior
- `unknown`: not fully traced yet

## Domain Map

| Domain | Main code surfaces | Main tests | Current status |
| --- | --- | --- | --- |
| Business profile and jurisdiction | `routes/business.routes.js`, `routes/businesses.routes.js`, `public/html/settings.html`, `public/html/business-settings-cpa.html` | `businessProfileNormalization.test.js`, `regionRoutes.test.js` | `partial` |
| Transaction entry and editing | `routes/transactions.routes.js`, `public/js/transactions.js` | `transactionsListFilters.test.js`, `transactionsFeatureGating.test.js`, `criticalFlows.test.js` | `partial` |
| Category and tax mapping | `services/pdf/taxMappings.js`, `routes/categories.routes.js`, `routes/transactions.routes.js` | `categoryTaxMappings.test.js`, `categoryRegionGating.test.js`, `seedDefaultCategoriesRegion.test.js` | `partial` |
| Review queue and compliance flags | `routes/review.routes.js`, `services/transactionReviewFlagService.js` | `reviewQueueRoutes.test.js`, `transactionReviewFlagService.test.js` | `partial` |
| Tax summaries and payer thresholds | `services/taxSummaryService.js`, `routes/transactions.routes.js` | `taxSummaryService.test.js`, `pdfTaxPacketHelpers.test.js` | `partial` |
| Tax dashboard and reminders | `services/taxDashboardService.js`, `services/quarterlyTaxReminderService.js` | `taxDashboardService.test.js`, `quarterlyTaxReminderService.test.js` | `partial` |
| Vehicle deductions and support | `services/vehicleClaimService.js`, `routes/vehicleClaims.routes.js`, `public/html/compliance-dashboard.html` | `vehicleClaimService.test.js`, `reviewQueueRoutes.test.js` | `partial` |
| Capital assets and depreciation | `services/capitalAssetService.js`, `utils/depreciationSchedules.js`, `routes/capitalAssets.routes.js` | `depreciationSchedules.test.js` | `partial` |
| GST/HST registration and Quick Method | `services/quickMethodService.js`, `services/gstHstNumberService.js`, `routes/exports.routes.js`, `routes/business.routes.js` | `quickMethodService.test.js`, `gstHstNumberService.test.js`, `taxDashboardService.test.js` | `partial` |
| Exports, workpapers, tax packet PDF | `routes/exports.routes.js`, `services/exportDatasetService.js`, `services/exportSnapshotService.js`, `services/pdfGeneratorService.js` | `exportsRegression.test.js`, `exportDatasetService.test.js`, `exportSnapshotService.test.js`, `pdfTaxPacketHelpers.test.js` | `partial` |
| A/R, A/P, invoices, bills | `services/arApService.js`, `routes/invoices-v1.routes.js`, `routes/bills.routes.js` | `invoicesV1Routes.test.js` | `partial` |
| Accounts and balances | `routes/accounts.routes.js`, `public/json/accounts.json`, `public/html/accounts.html` | `accountingControls.test.js`, `accountsOpeningBalanceRoutes.test.js` | `partial` |
| Accounting period locks and audit controls | `services/accountingLockService.js`, `routes/business.routes.js`, `routes/transactions.routes.js` | `accountingControls.test.js` | `correct` |

## Rule Matrix

| Area | Rule or expectation | Status | Code surfaces | Coverage | Notes |
| --- | --- | --- | --- | --- | --- |
| Business profile | Region, province, fiscal year, accounting method, activity code, and GST/HST profile are captured and validated | `partial` | `routes/business.routes.js`, `routes/businesses.routes.js`, `public/html/settings.html`, `public/html/business-settings-cpa.html` | `businessProfileNormalization.test.js` | Data collection is stronger than downstream enforcement. |
| Accounting method | Cash vs accrual basis should change recognition timing and reporting logic | `wrong` | `routes/business.routes.js`, `routes/me.routes.js`, `services/exportSnapshotService.js` | none found that prove recognition behavior | `accounting_method` is required and exported, but there is no traced timing engine in transaction, invoice, bill, or tax summary logic. |
| Fiscal year | Canadian and non-calendar businesses should summarize by configured fiscal-year bounds | `correct` | `utils/fiscalYear.js`, `services/taxSummaryService.js`, `services/taxDashboardService.js`, `routes/transactions.routes.js` | `taxSummaryService.test.js`, `taxDashboardService.test.js` | Fixed and now wired into summary/dashboard paths. |
| Opening balances | Businesses adopting midstream need account opening balances for correct balance carryforward | `partial` | `public/json/accounts.json`, `routes/accounts.routes.js`, `public/html/accounts.html` | `accountsOpeningBalanceRoutes.test.js` | The field is now stored and editable, but broader balance-sheet rollforward logic still needs work. |
| Transaction model | Income and expense entry should preserve tax-relevant fields consistently | `partial` | `routes/transactions.routes.js`, `routes/plaid.routes.js`, `public/js/transactions.js` | `criticalFlows.test.js`, `transactionsFeatureGating.test.js`, `transactionCategorizationService.test.js` | Import mapping now uses business history, merchant normalization, and canonical bookkeeping rules, but review exceptions still matter. |
| CSV import | Imported rows should land in categories with valid jurisdiction-aware tax mapping | `partial` | `routes/transactions.routes.js`, `services/transactionCategorizationService.js` | `transactionImportService.test.js`, `transactionCsvImportHelpers.test.js`, `transactionCategorizationService.test.js`, `transactionsCsvImportLimit.test.js` | CSV imports now use shared categorization logic and region-valid templates instead of only a loose keyword list. |
| Review queue | Compliance issues should be surfaced for unsupported or weakly evidenced transactions | `partial` | `routes/review.routes.js`, `services/transactionReviewFlagService.js` | `reviewQueueRoutes.test.js`, `transactionReviewFlagService.test.js` | Queue works again, but scope is still narrower than a full accountant review workflow. |
| 1099 and T4A | Payer thresholds should be year-aware and based on gross receipts from payer | `correct` | `services/taxSummaryService.js`, `services/pdfGeneratorService.js`, `utils/taxFormThresholds.js` | `taxSummaryService.test.js`, `pdfTaxPacketHelpers.test.js` | Thresholds are centralized and year-keyed. Gross treatment appears intentional. |
| Tax line summaries | Auto-deductible totals should exclude areas that require separate schedules or elections | `partial` | `services/taxSummaryService.js`, `services/pdf/taxMappings.js` | `taxSummaryService.test.js` | Home office and capital-asset lines are now review-only, but there is no full schedule engine behind them. |
| Home office | Business-use-of-home should be calculated from dedicated inputs, not raw transaction totals | `wrong` | `services/pdf/taxMappings.js`, `services/taxSummaryService.js` | limited negative coverage only | Current behavior is defensive only: summaries avoid over-deducting, but there is no real calculator. |
| Vehicle, US | Standard mileage vs actual should follow election-style consistency and supporting-data rules | `partial` | `services/vehicleClaimService.js`, `routes/vehicleClaims.routes.js`, `public/html/compliance-dashboard.html` | `vehicleClaimService.test.js` | Now enforces one method per business tax year, but not a true per-vehicle election model. |
| Vehicle, Canada | Self-employed vehicle deductions should use actual expenses with business-use allocation | `partial` | `services/vehicleClaimService.js`, `routes/vehicleClaims.routes.js`, `public/html/compliance-dashboard.html` | `vehicleClaimService.test.js` | Invalid flat mileage path is blocked, but broader motor-vehicle workflow is still limited. |
| Capital assets | Asset records should support depreciation or CCA schedules and roll into tax outputs safely | `partial` | `services/capitalAssetService.js`, `utils/depreciationSchedules.js`, `routes/capitalAssets.routes.js` | `depreciationSchedules.test.js` | Aggregate depreciation path exists. Export does not yet render a detailed per-asset tax packet schedule. |
| Depreciation rules | Section 179 and bonus-depreciation rules should be year-accurate and date-aware where required | `partial` | `utils/depreciationSchedules.js`, `services/capitalAssetService.js` | `depreciationSchedules.test.js` | 2025/2026 helper corrections were made, but more edge-case elections may still exist. |
| GST/HST registration | CRA threshold monitoring should use quarter-based tests, not annual totals | `partial` | `services/taxDashboardService.js` | `taxDashboardService.test.js` | Logic is now quarter-based, but it still depends on transaction classification quality and not a full worldwide taxable-supplies engine. |
| GST/HST numbers | Registration number capture and validation should be enforced when applicable | `correct` | `services/gstHstNumberService.js`, `routes/business.routes.js` | `gstHstNumberService.test.js` | Validation exists for formatting and profile completeness. |
| Quick Method eligibility | Quick Method should only be offered when province, supply type, activity, and revenue support it | `partial` | `services/quickMethodService.js`, `routes/exports.routes.js`, `routes/business.routes.js` | `quickMethodService.test.js` | The code now fails closed more often, which is safer. It is still not a complete CRA engine for every edge case. |
| Quick Method rates | Rate tables must be year-appropriate and handle known province changes | `partial` | `services/quickMethodService.js`, `db/migrations/20260530_correct_quick_method_rates.sql` | `quickMethodService.test.js` | Exact 2026 groups are seeded. Intra-year rule changes still need conservative handling. |
| Export readiness | Exports should fail or warn when key tax profile data is missing | `correct` | `services/exportSnapshotService.js`, `services/pdfGeneratorService.js` | `exportSnapshotService.test.js`, `pdfTaxPacketHelpers.test.js` | Snapshot layer checks profile completeness and surfaces readiness issues. |
| Export dataset | Workpaper dataset should preserve mapping, support, review status, and exclusions coherently | `partial` | `services/exportDatasetService.js`, `routes/exports.routes.js` | `exportDatasetService.test.js`, `exportsRegression.test.js` | Stronger than before, but correctness still depends on upstream tax categorization. |
| PDF tax packet | CPA hand-off packet should not overstate certainty or auto-calculate unsupported schedules | `partial` | `services/pdfGeneratorService.js`, `routes/exports.routes.js` | `pdfTaxPacketHelpers.test.js` | Packet is safer and more review-oriented now, but still not equivalent to a formal tax-prep package. |
| A/R and A/P | Invoices and bills should support receivable and payable tracking and aging | `partial` | `services/arApService.js`, `routes/invoices-v1.routes.js`, `routes/bills.routes.js` | `invoicesV1Routes.test.js` | Operational tracking exists, but this does not by itself deliver accrual-basis accounting. |
| Balance sheet integrity | Accounts, balances, and ledger carryforwards should support trustworthy balance-sheet style reporting | `partial` | `routes/accounts.routes.js`, `public/html/accounts.html`, `public/json/accounts.json` | `accountsOpeningBalanceRoutes.test.js`, limited control tests | Opening balances now exist, but broader ledger-state completeness is still not strong enough for confidence. |
| Audit controls | Locked periods, soft-delete, and audit-oriented safeguards should reduce accidental ledger drift | `correct` | `services/accountingLockService.js`, `routes/transactions.routes.js` | `accountingControls.test.js` | This is one of the stronger areas in the codebase. |

## Immediate Priority Backlog

### Must fix before stronger CPA-facing claims
1. Decide and implement actual cash-vs-accrual behavior, or stop collecting `accounting_method`.
2. Build a dedicated home-office workflow if the app intends to support that line beyond review-only handoff.
3. Add real balance-sheet rollforward logic on top of the new opening-balance storage.

### Important but may be launch-deferrable with careful copy
1. Expand vehicle handling from "safe guardrails" into a true per-vehicle workflow.
2. Build a detailed capital asset export schedule instead of only rolling into aggregate depreciation totals.
3. Keep Quick Method logic conservative and add more eligibility/rate coverage before promoting it heavily.
4. Add explicit balance-sheet integrity checks once opening balances exist.

## How to Use This Matrix
1. When reviewing a bug or feature, start with the matching domain row.
2. Trace the user-visible number or promise back through every listed code surface.
3. Update the status only when code, tests, and exported output all agree.
4. Treat every `unknown` or untraced field as a bug until proven otherwise.
