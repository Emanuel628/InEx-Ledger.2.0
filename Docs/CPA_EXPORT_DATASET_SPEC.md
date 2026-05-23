# CPA Export Dataset Spec

This document defines the canonical export dataset for InEx Ledger's CPA-ready export system.

It is the contract that sits between:

- database facts and review state
- backend export orchestration
- PDF / CSV renderers
- future finalized-package validation

If this contract changes, export services, renderers, and validations must change with it.

## 1. Goals

The export dataset must:

- represent immutable facts separately from derived readiness
- support both US and Canada export rules
- support draft and finalized CPA packages
- support transaction-level, schedule-level, business-level, and export-level evidence
- be renderable to PDF and CSV without reaching back into raw DB rows

## 2. Design Rules

### 2.1 Facts vs derived state

Do not store every export-ready state directly on `transactions`.

Use this pattern:

- store raw facts
- store review overrides / approvals
- derive readiness in services

Examples:

- `bookkeeping_status` may be stored when it reflects explicit review workflow
- `tax_support_status` should usually be derived from linked support artifacts plus overrides
- `filing_readiness` should be derived from facts, evidence, jurisdiction rules, and review decisions

### 2.2 Renderers only consume the dataset

`pdfGeneratorService.js` and `csvExportService.js` should render only from the canonical dataset.

They should not:

- infer missing business logic from raw DB rows
- run jurisdiction mapping rules directly
- make ad hoc support assumptions

### 2.3 Export snapshots must be reproducible

Every generated export must be traceable to:

- the exact business
- the exact date range
- the exact transaction and artifact set
- the exact rule version / export schema version

## 3. Canonical Top-Level Shape

```json
{
  "schemaVersion": "cpa-export-dataset/v1",
  "exportContext": {},
  "businessProfile": {},
  "reviewSummary": {},
  "transactions": [],
  "supportArtifacts": [],
  "schedules": {},
  "finalization": {},
  "audit": {}
}
```

## 4. Top-Level Sections

### 4.1 `schemaVersion`

String identifier for the canonical dataset contract.

Initial value:

```json
"schemaVersion": "cpa-export-dataset/v1"
```

### 4.2 `exportContext`

Defines what this export is.

```json
{
  "exportId": "uuid-or-report-id",
  "exportMode": "draft",
  "exportFormat": "pdf",
  "jurisdiction": "US",
  "taxForm": "Schedule C",
  "businessId": "uuid",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "currency": "USD",
  "language": "en",
  "generatedAt": "ISO-8601",
  "generatedByUserId": "uuid",
  "ruleVersion": "2026-05-23",
  "snapshotStatus": "ephemeral"
}
```

Notes:

- `exportMode`: `draft` | `workpaper` | `finalized`
- `snapshotStatus`: `ephemeral` | `snapshotted` | `invalidated`
- `ruleVersion` should version the backend tax/export rule set

### 4.3 `businessProfile`

Defines the business identity and filing context used by the export.

```json
{
  "businessId": "uuid",
  "legalName": "string",
  "operatingName": "string",
  "businessType": "sole_proprietorship",
  "region": "US",
  "province": "",
  "address": "string",
  "businessActivityCode": "541611",
  "accountingMethod": "cash",
  "materialParticipation": true,
  "fiscalYearStart": "01-01",
  "gstHstRegistered": false,
  "gstHstNumberPresent": false,
  "gstHstMethod": "",
  "exportIdentityComplete": true,
  "missingProfileFields": []
}
```

Important:

- the dataset should avoid exposing decrypted sensitive IDs unless the secure export path explicitly requires it
- the profile section should say whether identity/profile blockers exist, not just omit fields

### 4.4 `reviewSummary`

This is the authoritative summary for badges, checklist cards, and blockers.

```json
{
  "transactionCount": 0,
  "includedTransactionCount": 0,
  "excludedTransactionCount": 0,
  "bookkeepingReadyCount": 0,
  "supportReadyCount": 0,
  "filingReadyCount": 0,
  "needsCategoryCount": 0,
  "needsPayeeCount": 0,
  "needsDescriptionCount": 0,
  "missingReceiptExpenseCount": 0,
  "transactionsWithAnySupportCount": 0,
  "supportArtifactCount": 0,
  "vehicleReviewCount": 0,
  "mealsReviewCount": 0,
  "allocationReviewCount": 0,
  "capitalAssetReviewCount": 0,
  "hardBlockerCount": 0,
  "warningCount": 0,
  "totals": {
    "grossIncome": 0,
    "totalExpenses": 0,
    "netProfit": 0
  },
  "readiness": {
    "bookkeepingStatus": "in_progress",
    "supportStatus": "in_progress",
    "filingReadiness": "blocked"
  }
}
```

Recommended enums:

- `bookkeepingStatus`: `not_started` | `in_progress` | `ready`
- `supportStatus`: `not_started` | `in_progress` | `ready`
- `filingReadiness`: `blocked` | `warning_only` | `ready`

### 4.5 `transactions`

Each exported transaction becomes one normalized export row.

```json
{
  "id": "uuid",
  "businessId": "uuid",
  "date": "YYYY-MM-DD",
  "type": "expense",
  "amount": 24.0,
  "signedAmount": -24.0,
  "currency": "USD",
  "description": "Client lunch",
  "payeeName": "Restaurant Name",
  "account": {
    "id": "uuid",
    "name": "Checking"
  },
  "category": {
    "id": "uuid",
    "name": "Meals",
    "kind": "expense"
  },
  "tax": {
    "jurisdiction": "US",
    "taxForm": "Schedule C",
    "taxLineCode": "24b",
    "taxLineLabel": "Line 24b - Meals",
    "transactionNature": "operating_expense"
  },
  "inclusion": {
    "includedInPnl": true,
    "inclusionStatus": "included",
    "exclusionCode": "",
    "exclusionReason": ""
  },
  "readiness": {
    "bookkeepingStatus": "ready",
    "taxSupportStatus": "needs_business_purpose",
    "filingReadiness": "blocked"
  },
  "review": {
    "mappingStatus": "mapped",
    "supportStatus": "business_purpose_needed",
    "reviewStatus": "needs_review",
    "flags": ["BP", "FC"],
    "blockers": [
      {
        "code": "business_purpose_missing",
        "severity": "hard",
        "message": "Business purpose is required for meals."
      }
    ],
    "warnings": [],
    "notes": "string",
    "resolvedByUserId": "",
    "resolvedAt": ""
  },
  "amounts": {
    "grossAmount": 24.0,
    "deductibleAmount": 12.0,
    "nonDeductibleAmount": 12.0,
    "personalUsePct": 0
  },
  "support": {
    "artifactIds": ["uuid"],
    "artifactCount": 1,
    "receiptAttached": true,
    "receiptFileCount": 1,
    "supportSummary": "Receipt attached; business purpose still required"
  },
  "audit": {
    "sourceType": "manual",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "lockedBySnapshot": false
  }
}
```

Notes:

- `readiness` values should be derived from facts and review overrides
- `review.blockers` and `review.warnings` are what the triage UI and finalized export logic should consume
- `support.artifactIds` should reference top-level `supportArtifacts`

### 4.6 `supportArtifacts`

This replaces a receipts-only worldview.

```json
{
  "id": "uuid",
  "artifactType": "receipt",
  "scopeType": "transaction",
  "scopeId": "transaction-uuid",
  "businessId": "uuid",
  "filename": "receipt.pdf",
  "mimeType": "application/pdf",
  "storageStatus": "present",
  "reviewStatus": "accepted",
  "linkedTransactionId": "uuid",
  "notes": "",
  "uploadedAt": "ISO-8601",
  "uploadedByUserId": "uuid",
  "hash": "sha256-or-null"
}
```

Recommended enums:

- `artifactType`:
  - `receipt`
  - `invoice`
  - `mileage_log`
  - `allocation_worksheet`
  - `home_office_worksheet`
  - `capital_asset_support`
  - `tax_profile_support`
  - `review_note`
- `scopeType`:
  - `transaction`
  - `business`
  - `schedule`
  - `export`
- `storageStatus`:
  - `present`
  - `missing`
  - `deleted`
  - `unavailable`
- `reviewStatus`:
  - `pending`
  - `accepted`
  - `rejected`

### 4.7 `schedules`

This section gives the PDF renderer clean schedule inputs.

```json
{
  "unclearedIssues": [],
  "excludedTransactions": [],
  "receiptSupport": [],
  "vehicleSupport": [],
  "capitalAssets": [],
  "allocations": [],
  "taxMapping": [],
  "jurisdictionAdjustments": []
}
```

Minimum required schedule groups:

- `unclearedIssues`
- `excludedTransactions`
- `receiptSupport`
- `vehicleSupport`
- `capitalAssets`
- `taxMapping`

Example `unclearedIssues` row:

```json
{
  "transactionId": "uuid",
  "date": "YYYY-MM-DD",
  "description": "string",
  "issueCode": "missing_category",
  "severity": "hard",
  "message": "Transaction needs a business category before final export."
}
```

### 4.8 `finalization`

This controls whether the package may be marked final.

```json
{
  "requestedMode": "finalized",
  "resolvedMode": "draft",
  "eligibleForFinalization": false,
  "hardBlockers": [
    {
      "code": "missing_category",
      "count": 4,
      "message": "4 transactions still need category assignment."
    }
  ],
  "warnings": [
    {
      "code": "low_materiality_missing_description",
      "count": 2,
      "message": "2 low-value transactions are missing descriptions."
    }
  ],
  "materialityPolicy": {
    "version": "v1",
    "currency": "USD"
  },
  "certification": {
    "certifiedByUser": false,
    "certifiedAt": "",
    "certifiedByUserId": ""
  }
}
```

### 4.9 `audit`

This is export-level audit metadata.

```json
{
  "datasetHash": "sha256",
  "sourceSnapshotId": "",
  "invalidated": false,
  "invalidatedAt": "",
  "invalidationReason": "",
  "includedTransactionIds": [],
  "includedArtifactIds": []
}
```

This section should support later snapshot invalidation if linked data changes.

## 5. Stored Facts vs Derived Fields

### 5.1 Store directly

These belong in persistent tables:

- transactions
- accounts
- categories
- receipts and future support artifacts
- business export profile fields
- review overrides / approvals
- export snapshots
- export snapshot membership

### 5.2 Derive in services

These should be computed from facts plus overrides:

- tax line mapping
- mapping status
- support status
- filing readiness
- blocker lists
- warning lists
- readiness summary counts
- finalized eligibility

## 6. Recommended Persistence Model

This spec implies the following persistence direction.

### 6.1 `transactions`

Keep core facts here.

Add only workflow fields that represent explicit human review state, not all derived readiness.

Good candidates:

- `bookkeeping_review_status`
- `reviewed_at`
- `reviewed_by_user_id`

Avoid storing:

- final computed `filing_readiness`
- final computed `support_status`

unless there is a strong performance reason and a clear recomputation strategy.

### 6.2 `support_artifacts`

Create a generalized support table that can supersede receipt-only logic.

Required fields:

- `id`
- `business_id`
- `artifact_type`
- `scope_type`
- `scope_id`
- `transaction_id` nullable
- `filename`
- `mime_type`
- `storage_path`
- `file_hash`
- `status`
- `review_status`
- `notes`
- `uploaded_by_user_id`
- `uploaded_at`

### 6.3 `transaction_review_states`

Recommended separate table for review overrides and triage outcomes.

Suggested fields:

- `transaction_id`
- `bookkeeping_override_status`
- `support_override_status`
- `filing_override_status`
- `review_notes`
- `resolved_by_user_id`
- `resolved_at`

### 6.4 `export_snapshots`

Recommended fields:

- `id`
- `business_id`
- `generated_by_user_id`
- `export_mode`
- `export_format`
- `jurisdiction`
- `start_date`
- `end_date`
- `dataset_schema_version`
- `rule_version`
- `dataset_hash`
- `status`
- `invalidated_at`
- `invalidation_reason`
- `created_at`

### 6.5 `export_snapshot_items`

This is required for trustworthy invalidation.

Suggested fields:

- `snapshot_id`
- `item_type` (`transaction` | `artifact` | `schedule_input`)
- `item_id`
- `item_hash`

## 7. Renderer Requirements

### 7.1 PDF renderer

Must consume only:

- `exportContext`
- `businessProfile`
- `reviewSummary`
- `transactions`
- `supportArtifacts`
- `schedules`
- `finalization`
- `audit`

It should not:

- query DB rows directly
- infer category rules itself
- infer blocker severity itself

### 7.2 CSV renderer

Must consume the same dataset, with format-specific row selection only.

The CSV export should be a different rendering of the same truth, not a parallel business-logic path.

## 8. Finalization Policy

The canonical dataset must support three export modes:

- `draft`
- `workpaper`
- `finalized`

Suggested meaning:

- `draft`: unresolved blockers allowed
- `workpaper`: no major bookkeeping blockers, but reviewer warnings allowed
- `finalized`: no hard blockers, certification complete, snapshot recorded, and package eligible under jurisdiction rules

## 9. Immediate Refactor Target

Before new SQL migrations are written, refactor toward this sequence:

1. make `exportDatasetService.js` produce this canonical dataset
2. make `pdfGeneratorService.js` render only from this dataset
3. make `csvExportService.js` render only from this dataset
4. then add the new persistence tables and review workflow tables

## 10. Out of Scope for v1

These are important, but not required for the first canonical dataset version:

- multi-reviewer CPA workflow
- signed preparer attestations
- jurisdiction plugin loading
- cross-business consolidated exports
- accountant portal package exchange

## 11. Acceptance Criteria

The export system meets this spec when:

- one canonical dataset can drive both PDF and CSV outputs
- all readiness decisions can be explained from dataset fields
- every blocker and warning is queryable, not hidden in prose
- support artifacts are not limited to receipts
- snapshot invalidation can be implemented using exported membership records
- finalized export eligibility is enforceable from dataset state alone
