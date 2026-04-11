# Accounting Mutation Path Audit

**Generated:** 2026-04-11  
**Scope:** All backend routes, service functions, and UI actions that can change accounting-related data  
**Purpose:** One source-of-truth inventory for lock enforcement, archive behavior, and report impact

---

## How to Read This Document

| Column | Meaning |
|--------|---------|
| **Mutation Name** | Short name for this action |
| **Route File** | File in `In-Ex-Ledger-API/routes/` |
| **Method + Path** | HTTP verb and endpoint (all under `/api`) |
| **Service / Helper** | Key function(s) called that write to DB |
| **Frontend Trigger** | JS file and action |
| **Affects History** | Does this alter financial history visible in reports/exports? |
| **Lock Required** | Should accounting-period lock apply? |
| **Lock Enforced** | Is the lock actually checked before the write? |
| **Lock Location** | Where in code the check happens |
| **Archive / Delete Rule** | Soft-archive (metadata preserved) or hard delete |
| **Report / Export Impact** | Are archived/deleted rows excluded from analytics and exports? |
| **Test Coverage** | Covered in automated tests? |
| **Status** | ✅ Protected · ⚠️ Gap · ❓ Unclear · 🔴 Unprotected |

---

## Section 1 — Core Transaction Mutations

These are the highest-stakes paths. Every write here directly changes accounting history.

### 1.1 Create Transaction

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Transaction |
| **Route File** | `routes/transactions.routes.js:447` |
| **Method + Path** | `POST /api/transactions` |
| **Service / Helper** | Direct `pool.query` INSERT; `assertUnlockedBusinessDates()` pre-check; `validateTransactionPayload()`; `resolveCategoryId()`; `tryEncryptDescription()` |
| **Frontend Trigger** | `public/js/transactions.js` → Save button in transaction form (new mode) |
| **Affects History** | **Yes** — adds a new row to `transactions` table |
| **Lock Required** | **Yes** — must not post into a locked period |
| **Lock Enforced** | **Yes** |
| **Lock Location** | `assertUnlockedBusinessDates(businessId, date)` called before INSERT; throws `AccountingPeriodLockedError` (409) on violation |
| **Archive / Delete Rule** | N/A (create path) |
| **Report / Export Impact** | Immediately visible in analytics and exports unless `deleted_at IS NULL` filters apply |
| **Test Coverage** | `tests/accountingControls.test.js`, `tests/criticalFlows.test.js` |
| **Status** | ✅ Protected |

---

### 1.2 Edit Transaction (Append-Only Audit Adjustment)

| Field | Value |
|-------|-------|
| **Mutation Name** | Edit Transaction |
| **Route File** | `routes/transactions.routes.js:522` |
| **Method + Path** | `PUT /api/transactions/:id` |
| **Service / Helper** | `assertUnlockedBusinessDates(businessId, originalDate, newDate)` checks **both** old and new dates; inserts a NEW row with `is_adjustment=true`, `original_transaction_id=:id`; no UPDATE to existing rows |
| **Frontend Trigger** | `public/js/transactions.js` → Save button in transaction form (edit mode) |
| **Affects History** | **Yes** — appends an adjustment row that supersedes the original |
| **Lock Required** | **Yes** — editing a transaction dated in a locked period must be blocked |
| **Lock Enforced** | **Yes** — both the old date (original) and the new date are checked |
| **Lock Location** | `assertUnlockedBusinessDates(businessId, originalResult.rows[0].date, date)` at `transactions.routes.js:541` |
| **Archive / Delete Rule** | N/A (no destructive write to existing rows) |
| **Report / Export Impact** | Analytics and exports filter `is_adjustment=false` and `deleted_at IS NULL`, so adjustment rows are excluded from live views. Original row remains in DB for full audit trail. |
| **Test Coverage** | `tests/accountingControls.test.js`, `tests/criticalFlows.test.js` |
| **Status** | ✅ Protected |

**Notes:**
- The original transaction row is never updated or deleted; the edit creates a new `is_adjustment=true` shadow row.
- The `adjusted_by_id` and `adjusted_at` fields are stamped on the new row.
- There is no "view full edit history" UI yet; audit data is preserved in DB.

---

### 1.3 Archive (Soft Delete) Transaction

| Field | Value |
|-------|-------|
| **Mutation Name** | Archive / Delete Transaction |
| **Route File** | `routes/transactions.routes.js:607` |
| **Method + Path** | `DELETE /api/transactions/:id` |
| **Service / Helper** | `assertUnlockedBusinessDates()` pre-check; `archiveTransaction()` in `services/transactionAuditService.js` |
| **Frontend Trigger** | `public/js/transactions.js` → Delete button on transaction row |
| **Affects History** | **Yes** — removes the transaction from all active accounting views |
| **Lock Required** | **Yes** — must not archive a transaction in a locked period |
| **Lock Enforced** | **Yes** |
| **Lock Location** | `assertUnlockedBusinessDates(businessId, existing.rows[0].date)` at `transactions.routes.js:617` |
| **Archive / Delete Rule** | **Soft archive** — `archiveTransaction()` sets `deleted_at=NOW()`, `is_void=true`, `voided_at`, `voided_by_id`, `deleted_by_id`, `deleted_reason`. Row is never removed from DB. |
| **Report / Export Impact** | Analytics queries filter `deleted_at IS NULL AND (is_void=false OR is_void IS NULL)`. Archived rows are excluded from all active reports and exports. Raw DB still contains full record. |
| **Test Coverage** | `tests/accountingControls.test.js`, `tests/criticalFlows.test.js` |
| **Status** | ✅ Protected |

**Notes:**
- Only original transactions (`is_adjustment=false`, `is_void=false`, `deleted_at IS NULL`) can be archived. Adjustment rows cannot be directly archived.
- Preservation metadata: `deleted_by_id`, `deleted_reason`, `voided_by_id`, `voided_at` all retained.
- No dedicated "view archived transactions" UI exists yet; data is accessible via direct DB query.

---

### 1.4 Toggle Cleared / Uncleared Status

| Field | Value |
|-------|-------|
| **Mutation Name** | Toggle Cleared Status |
| **Route File** | `routes/transactions.routes.js:639` |
| **Method + Path** | `PATCH /api/transactions/:id/cleared` |
| **Service / Helper** | Direct `pool.query` UPDATE to `transactions.cleared`; `assertUnlockedBusinessDates()` pre-check |
| **Frontend Trigger** | `public/js/transactions.js` → Cleared checkbox / toggle in transaction list |
| **Affects History** | **Moderate** — `cleared` is a reconciliation flag, not a financial amount. Affects bank-reconciliation views. |
| **Lock Required** | **Yes** — changing cleared status on a locked-period transaction should be blocked |
| **Lock Enforced** | **Yes** |
| **Lock Location** | `assertUnlockedBusinessDates(businessId, existing.rows[0].date)` at `transactions.routes.js:654` |
| **Archive / Delete Rule** | N/A (status flag update only) |
| **Report / Export Impact** | Cleared status is included in CSV exports. Does not affect income/expense totals. |
| **Test Coverage** | `tests/accountingControls.test.js` |
| **Status** | ✅ Protected |

---

## Section 2 — Recurring Transaction Mutations

Recurring templates are scheduling metadata. They generate real `transactions` rows when materialized. Lock enforcement is applied at the **materialization** step, not the template-edit step.

### 2.1 Create Recurring Template

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Recurring Template |
| **Route File** | `routes/recurring.routes.js:45` |
| **Method + Path** | `POST /api/recurring` |
| **Service / Helper** | `normalizeRecurringPayload()`; `verifyTemplateOwnership()`; `materializeTemplateRuns()` in `services/recurringTransactionsService.js` |
| **Frontend Trigger** | `public/js/transactions.js` → Recurring tab, Save button (new mode) |
| **Affects History** | **Indirectly** — creates future transaction runs; the template itself is metadata |
| **Lock Required** | **No** — creating a template for future dates is not a historical change |
| **Lock Enforced** | **No** — correct by design for the template itself |
| **Lock Location** | Lock is applied at `materializeTemplateRuns()` when individual occurrence dates are posted (skips locked dates automatically) |
| **Archive / Delete Rule** | N/A (create path) |
| **Report / Export Impact** | Template does not appear in reports; only materialized `transactions` rows do |
| **Test Coverage** | `tests/criticalFlows.test.js` |
| **Status** | ✅ Protected (by design — lock applied at run time) |

---

### 2.2 Edit Recurring Template

| Field | Value |
|-------|-------|
| **Mutation Name** | Edit Recurring Template |
| **Route File** | `routes/recurring.routes.js:107` |
| **Method + Path** | `PUT /api/recurring/:id` |
| **Service / Helper** | `normalizeRecurringPayload()`; `verifyTemplateOwnership()`; `computeNextRunDateForUpdate()`; `materializeTemplateRuns()` re-materializes future runs |
| **Frontend Trigger** | `public/js/transactions.js` → Recurring tab, Save button (edit mode) |
| **Affects History** | **Indirectly** — re-materializes future runs; already-posted transactions are not changed |
| **Lock Required** | **No** — edits only affect future scheduling, not past posted transactions |
| **Lock Enforced** | **No** — correct by design |
| **Lock Location** | Lock applied at run materialization step |
| **Archive / Delete Rule** | N/A (update to template metadata) |
| **Report / Export Impact** | No direct impact on historical reports |
| **Test Coverage** | `tests/criticalFlows.test.js` |
| **Status** | ✅ Protected (by design) |

---

### 2.3 Toggle Recurring Active Status

| Field | Value |
|-------|-------|
| **Mutation Name** | Toggle Recurring Active / Paused |
| **Route File** | `routes/recurring.routes.js:187` |
| **Method + Path** | `PATCH /api/recurring/:id/status` |
| **Service / Helper** | Direct `pool.query` UPDATE to `recurring_transactions.active` |
| **Frontend Trigger** | `public/js/transactions.js` → Pause/Resume button on recurring row |
| **Affects History** | **No** — affects future runs only, no past data changed |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Lock Location** | N/A |
| **Archive / Delete Rule** | N/A (status flag) |
| **Report / Export Impact** | None on historical data |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by design) |

---

### 2.4 Manual Run (Post Next Occurrence)

| Field | Value |
|-------|-------|
| **Mutation Name** | Post Recurring Occurrence (Manual) |
| **Route File** | `routes/recurring.routes.js:213` |
| **Method + Path** | `POST /api/recurring/:id/run` |
| **Service / Helper** | `materializeNextTemplateRun()` in `services/recurringTransactionsService.js` — inserts into `recurring_transaction_runs` and `transactions` |
| **Frontend Trigger** | `public/js/transactions.js` → "Post now" button on recurring row |
| **Affects History** | **Yes** — creates a real `transactions` row |
| **Lock Required** | **Yes** — must not post into a locked period |
| **Lock Enforced** | **Yes** |
| **Lock Location** | `isDateLocked(occurrenceDateText, lockState?.lockedThroughDate)` inside `materializeNextTemplateRun()` → returns `{ locked: true }` → route returns 409 |
| **Archive / Delete Rule** | N/A (create path) |
| **Report / Export Impact** | Posted transaction immediately appears in analytics and exports |
| **Test Coverage** | `tests/accountingControls.test.js` |
| **Status** | ✅ Protected |

---

### 2.5 Delete Recurring Template

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Recurring Template |
| **Route File** | `routes/recurring.routes.js:252` |
| **Method + Path** | `DELETE /api/recurring/:id` |
| **Service / Helper** | Direct `pool.query` DELETE from `recurring_transactions` |
| **Frontend Trigger** | `public/js/transactions.js` → Delete button on recurring row |
| **Affects History** | **No** — only the template (scheduling metadata) is deleted; already-posted `transactions` rows are unaffected |
| **Lock Required** | **No** — deleting a schedule template is not a historical accounting change |
| **Lock Enforced** | **No** — correct by design |
| **Lock Location** | N/A |
| **Archive / Delete Rule** | **Hard delete** of the template row. Future unposted runs are also removed via cascade. Already-posted transactions are retained. |
| **Report / Export Impact** | No impact on existing posted transactions |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by design) |

---

## Section 3 — Receipt Mutations

Receipts are supporting documents. They do not carry financial values themselves, but attaching/detaching one to a transaction that falls in a locked period is still controlled.

### 3.1 Upload Receipt

| Field | Value |
|-------|-------|
| **Mutation Name** | Upload Receipt |
| **Route File** | `routes/receipts.routes.js:171` |
| **Method + Path** | `POST /api/receipts` |
| **Service / Helper** | `multer` disk storage; `sha256File()`; INSERT into `receipts`; `getSubscriptionSnapshotForBusiness()` feature gate |
| **Frontend Trigger** | `public/js/transactions.js` → file upload widget; `public/js/receipts.js` → upload button |
| **Affects History** | **No** — upload alone does not affect accounting history until attached to a transaction |
| **Lock Required** | **No** — uploading a file is not a historical write |
| **Lock Enforced** | **No** — correct by design |
| **Lock Location** | N/A |
| **Archive / Delete Rule** | N/A (create path) |
| **Report / Export Impact** | Unattached receipts do not appear in financial reports |
| **Test Coverage** | Integration tests |
| **Status** | ✅ Protected (by design) |

---

### 3.2 Attach / Detach Receipt to Transaction

| Field | Value |
|-------|-------|
| **Mutation Name** | Attach / Detach Receipt |
| **Route File** | `routes/receipts.routes.js:228` |
| **Method + Path** | `PATCH /api/receipts/:id/attach` |
| **Service / Helper** | `loadAccountingLockState()` + `assertDateUnlocked()`; UPDATE `receipts.transaction_id` |
| **Frontend Trigger** | `public/js/receipts.js` → attach/detach dropdown |
| **Affects History** | **Moderate** — associating a receipt changes the audit trail for a transaction |
| **Lock Required** | **Yes** — cannot attach/detach if the target transaction is in a locked period |
| **Lock Enforced** | **Yes** |
| **Lock Location** | `assertDateUnlocked(lockState, txCheck.rows[0].date)` at `receipts.routes.js:247` |
| **Archive / Delete Rule** | N/A (metadata update) |
| **Report / Export Impact** | Receipt attachment metadata is included in exports. Does not affect financial totals. |
| **Test Coverage** | `tests/accountingControls.test.js` |
| **Status** | ✅ Protected |

**Notes:**
- Lock is only checked when `transaction_id` is non-null (attaching). Detaching (`transaction_id: null`) does not check the lock — this is a **gap**: detaching a receipt from a locked-period transaction is currently allowed.

---

### 3.3 Delete Receipt

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Receipt |
| **Route File** | `routes/receipts.routes.js:335` |
| **Method + Path** | `DELETE /api/receipts/:id` |
| **Service / Helper** | Transactional: moves disk file to `.pending-delete-*` staging path, DELETEs DB row, then unlinks file. Rollback restores file on error. |
| **Frontend Trigger** | `public/js/receipts.js` → Delete button |
| **Affects History** | **Moderate** — removes evidence document; the linked transaction is not deleted but loses its receipt association |
| **Lock Required** | **No** — lock is not checked here |
| **Lock Enforced** | **No** |
| **Lock Location** | N/A |
| **Archive / Delete Rule** | **Hard delete** (DB row + disk file). No audit trail for the receipt itself after deletion. |
| **Report / Export Impact** | Deleting the receipt does not affect financial totals, but exports that reference receipts will no longer have the file. |
| **Test Coverage** | Basic |
| **Status** | ⚠️ Gap — Receipt deletion from a locked-period transaction is not blocked. The financial transaction itself is protected, but the associated evidence file can be removed without lock check. |

---

## Section 4 — Account Mutations

Accounts are reference data. Editing an account's type/name retroactively changes how historical transactions are classified. There is no lock enforcement on account mutations.

### 4.1 Create Account

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Account |
| **Route File** | `routes/accounts.routes.js:45` |
| **Method + Path** | `POST /api/accounts` |
| **Service / Helper** | Direct INSERT |
| **Frontend Trigger** | `public/js/accounts.js` → Add Account button |
| **Affects History** | **No** — new account has no transactions |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | None until transactions are assigned |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by design) |

---

### 4.2 Edit Account (Name / Type)

| Field | Value |
|-------|-------|
| **Mutation Name** | Edit Account |
| **Route File** | `routes/accounts.routes.js:83` |
| **Method + Path** | `PUT /api/accounts/:id` |
| **Service / Helper** | Direct UPDATE to `accounts.name`, `accounts.type` |
| **Frontend Trigger** | `public/js/accounts.js` → Edit Account button (not currently exposed in UI) |
| **Affects History** | **Yes** — retroactively changes how all historical transactions for this account are labeled/classified in exports and reports |
| **Lock Required** | **Debatable** — renaming doesn't change numbers, but reclassifying `type` (checking→credit_card) changes reconciliation context |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | N/A (UPDATE) |
| **Report / Export Impact** | All historical exports and reports will reflect the new name/type immediately |
| **Test Coverage** | None |
| **Status** | ❓ Unclear — no lock is applied; changing account type on a locked period is not blocked. Low risk for name-only edits; higher risk if type classification changes. |

---

### 4.3 Delete Account

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Account |
| **Route File** | `routes/accounts.routes.js:135` |
| **Method + Path** | `DELETE /api/accounts/:id` |
| **Service / Helper** | Pre-check: blocks if any `transactions` or `recurring_transactions` reference this account (409); then hard DELETE |
| **Frontend Trigger** | `public/js/accounts.js` → Delete button |
| **Affects History** | **No** — delete is blocked if any transactions exist; safe to delete only empty accounts |
| **Lock Required** | **No** — account with transactions cannot be deleted anyway |
| **Lock Enforced** | **No** — not needed by design |
| **Archive / Delete Rule** | **Hard delete** — but only possible if no transactions exist |
| **Report / Export Impact** | Cannot delete an account with historical transactions; safe |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by constraint) |

---

## Section 5 — Category Mutations

Categories are reference data, similar to accounts. Editing a category's `kind` (income/expense) or `tax_map_us`/`tax_map_ca` retroactively changes tax classification of all historical transactions in that category.

### 5.1 Create Category

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Category |
| **Route File** | `routes/categories.routes.js:47` |
| **Method + Path** | `POST /api/categories` |
| **Service / Helper** | Direct INSERT |
| **Frontend Trigger** | `public/js/categories-backend.js` → Add Category button |
| **Affects History** | **No** — new category has no transactions |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | None until transactions are assigned |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by design) |

---

### 5.2 Edit Category (Name / Kind / Tax Map)

| Field | Value |
|-------|-------|
| **Mutation Name** | Edit Category |
| **Route File** | `routes/categories.routes.js:78` |
| **Method + Path** | `PUT /api/categories/:id` |
| **Service / Helper** | Direct UPDATE to `categories.name`, `.kind`, `.color`, `.tax_map_us`, `.tax_map_ca` |
| **Frontend Trigger** | `public/js/categories-backend.js` → Edit button |
| **Affects History** | **Yes** — retroactively changes tax classification and income/expense kind for all historical transactions in this category |
| **Lock Required** | **Debatable** — `kind` and `tax_map_*` changes have significant retroactive impact on locked-period tax reports |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | N/A (UPDATE) |
| **Report / Export Impact** | All historical exports immediately reflect new kind/tax classification |
| **Test Coverage** | None |
| **Status** | ⚠️ Gap — Changing `kind` or `tax_map_*` on a locked-period category is not blocked. This can retroactively alter the tax treatment of locked historical transactions. |

---

### 5.3 Delete Category

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Category |
| **Route File** | `routes/categories.routes.js:130` |
| **Method + Path** | `DELETE /api/categories/:id` |
| **Service / Helper** | Pre-check: blocks if any `transactions` or `recurring_transactions` reference it (409); then hard DELETE |
| **Frontend Trigger** | `public/js/categories-backend.js` → Delete button |
| **Affects History** | **No** — delete is blocked if transactions exist |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — not needed by design |
| **Archive / Delete Rule** | **Hard delete** — only possible if no transactions exist |
| **Report / Export Impact** | Cannot delete a category with historical transactions; safe |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by constraint) |

---

## Section 6 — Mileage Mutations

Mileage records are tracked separately from `transactions`. They have no lock enforcement at all. Whether they should is a product decision — if mileage is used for tax deduction reporting, it arguably should be locked.

### 6.1 Create Mileage Record

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Mileage Record |
| **Route File** | `routes/mileage.routes.js:81` |
| **Method + Path** | `POST /api/mileage` |
| **Service / Helper** | `buildMileageInsertSql()`, `buildMileageInsertValues()`, direct INSERT |
| **Frontend Trigger** | `public/js/mileage.js` → Log Trip button |
| **Affects History** | **Yes** (for mileage deduction reporting) — adds a new dated record |
| **Lock Required** | **Debatable** — mileage is a separate ledger but used in tax reporting |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | N/A (create path) |
| **Report / Export Impact** | Mileage records appear in mileage exports. No direct transaction/analytics impact. |
| **Test Coverage** | None |
| **Status** | ⚠️ Gap — No lock check. Mileage can be posted into locked accounting periods. |

---

### 6.2 Edit Mileage Record

| Field | Value |
|-------|-------|
| **Mutation Name** | Edit Mileage Record |
| **Route File** | `routes/mileage.routes.js:315` |
| **Method + Path** | `PUT /api/mileage/:id` |
| **Service / Helper** | Dynamic UPDATE, no audit trail |
| **Frontend Trigger** | Edit button on mileage record (if exposed) |
| **Affects History** | **Yes** — in-place UPDATE, no audit pivot, overwrites original |
| **Lock Required** | **Debatable** |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | N/A (UPDATE) — no audit trail; original values are lost |
| **Report / Export Impact** | Updated immediately in mileage reports |
| **Test Coverage** | None |
| **Status** | ⚠️ Gap — Mileage edits have no lock check and no audit trail. Unlike transactions, this is an in-place UPDATE, not an append-only pattern. |

---

### 6.3 Delete Mileage Record

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Mileage Record |
| **Route File** | `routes/mileage.routes.js:470` |
| **Method + Path** | `DELETE /api/mileage/:id` |
| **Service / Helper** | Hard DELETE |
| **Frontend Trigger** | `public/js/mileage.js` → Delete button |
| **Affects History** | **Yes** — permanently removes a mileage deduction record |
| **Lock Required** | **Debatable** |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | **Hard delete** — no archive, no audit trail |
| **Report / Export Impact** | Record is permanently gone from mileage reports |
| **Test Coverage** | None |
| **Status** | ⚠️ Gap — Hard delete with no lock check and no audit preservation. |

---

## Section 7 — Business Profile Mutations

Business profile mutations change the context in which historical data is interpreted. Changing `region`, `fiscal_year_start`, or `tax_id` can alter the meaning of all historical reports.

### 7.1 Update Business Profile

| Field | Value |
|-------|-------|
| **Mutation Name** | Update Business Profile |
| **Route File** | `routes/business.routes.js:95` |
| **Method + Path** | `PUT /api/business` |
| **Service / Helper** | `updateBusinessRow()` → UPDATE `businesses` (name, region, language, fiscal_year_start, province, business_type, tax_id, address); `encryptTaxId()` for tax ID |
| **Frontend Trigger** | `public/js/settings.js` → Business Profile save button |
| **Affects History** | **Yes (partially)** — `region`, `fiscal_year_start`, `province` changes affect how historical transactions are interpreted in reports and tax exports |
| **Lock Required** | **No** — lock is for transactions, not business metadata |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | N/A (UPDATE) |
| **Report / Export Impact** | `fiscal_year_start` and `region` changes affect all future and retrospective report rendering |
| **Test Coverage** | Basic |
| **Status** | ❓ Unclear — Changing fiscal year start or region after locking a period could create inconsistency between what the lock was set for and how reports now interpret the history. Low priority but worth noting. |

---

### 7.2 Set / Update Accounting Period Lock

| Field | Value |
|-------|-------|
| **Mutation Name** | Set Accounting Period Lock |
| **Route File** | `routes/business.routes.js:168` |
| **Method + Path** | `PUT /api/business/accounting-lock` |
| **Service / Helper** | `saveAccountingLockState()` → UPDATE `businesses.locked_through_date`, `.locked_period_note`, `.locked_period_updated_at`, `.locked_period_updated_by` |
| **Frontend Trigger** | `public/js/settings.js` → Lock / Unlock Accounting Period button |
| **Affects History** | **Yes (meta)** — this controls whether all other mutations are locked |
| **Lock Required** | **No** — the owner controls the lock itself; no external lock protects this |
| **Lock Enforced** | **No** — by design; the lock manager can always change the lock date |
| **Lock Location** | N/A |
| **Archive / Delete Rule** | N/A (UPDATE) |
| **Report / Export Impact** | Changing the lock date immediately affects which mutations are allowed going forward |
| **Test Coverage** | `tests/accountingControls.test.js` |
| **Status** | ✅ Correct by design — No lock protects the lock-setter itself. Owner-level control. |

**Notes:**
- There is no role-based access control preventing a basic user from changing the lock. In the current model, the authenticated business owner is assumed to be the lock controller.
- No MFA required to change the accounting lock.

---

### 7.3 Create New Business

| Field | Value |
|-------|-------|
| **Mutation Name** | Create Business |
| **Route File** | `routes/businesses.routes.js:86` |
| **Method + Path** | `POST /api/businesses` |
| **Service / Helper** | `createBusinessForUser()` → INSERT into `businesses`; `seedDefaultsForBusiness()` creates default accounts and categories |
| **Frontend Trigger** | `public/js/settings.js` → Add Business button |
| **Affects History** | **No** — new business, no historical data |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | None |
| **Test Coverage** | Basic |
| **Status** | ✅ Protected (by design) |

---

### 7.4 Delete Business (CASCADE)

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete Business |
| **Route File** | `routes/businesses.routes.js:136` |
| **Method + Path** | `DELETE /api/businesses/:id` |
| **Service / Helper** | Explicit DELETE: `recurring_transaction_runs`, `recurring_transactions`, then `businesses` (CASCADE deletes: transactions, receipts, mileage, accounts, categories, exports, subscriptions, cpa_access_grants); also updates `users.active_business_id` |
| **Frontend Trigger** | `public/js/settings.js` → Delete Business (requires password confirmation in body) |
| **Affects History** | **Catastrophic** — permanently destroys all accounting data for the business |
| **Lock Required** | **No** — lock is not checked (lock belongs to the business being deleted) |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | **Hard delete** — all data including locked-period transactions is permanently removed |
| **Report / Export Impact** | All data permanently gone |
| **Test Coverage** | Basic |
| **Status** | ⚠️ Gap — The accounting period lock is not checked before business deletion. A locked business can still be deleted. This is intentional (owner-controlled) but should be documented. Mitigation: requires MFA (`requireMfa`) + password confirmation + cannot delete only business. |

---

## Section 8 — User Account Mutations

These affect all businesses owned by a user.

### 8.1 Update User Profile

| Field | Value |
|-------|-------|
| **Mutation Name** | Update User Profile |
| **Route File** | `routes/me.routes.js:280` |
| **Method + Path** | `PUT /api/me` |
| **Service / Helper** | UPDATE `users.display_name`, `.locale` |
| **Frontend Trigger** | `public/js/settings.js` → Profile settings |
| **Affects History** | **No** — display metadata only |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | None |
| **Test Coverage** | Basic |
| **Status** | ✅ Not accounting-related |

---

### 8.2 Delete User Account (Nuclear)

| Field | Value |
|-------|-------|
| **Mutation Name** | Delete User Account |
| **Route File** | `routes/me.routes.js:304` |
| **Method + Path** | `DELETE /api/me` |
| **Service / Helper** | Logs to `user_action_audit_log`; explicit DELETEs: `recurring_transaction_runs`, `recurring_transactions`, then `businesses` (CASCADE), `verification_tokens`, `password_reset_tokens`, then `users` |
| **Frontend Trigger** | Account deletion flow (separate page/modal) |
| **Affects History** | **Catastrophic** — permanently destroys all data for all businesses owned by user |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** |
| **Lock Location** | None |
| **Archive / Delete Rule** | **Hard delete** — everything gone |
| **Report / Export Impact** | All data permanently gone |
| **Test Coverage** | Basic |
| **Status** | ⚠️ Gap — Same as business deletion: accounting lock is not a gate to self-deletion. Mitigation: rate-limited (`accountDeleteLimiter`); `user_action_audit_log` entry is written before deletion. |

---

### 8.3 Onboarding Setup (Creates Accounts)

| Field | Value |
|-------|-------|
| **Mutation Name** | Onboarding Setup |
| **Route File** | `routes/me.routes.js:122` |
| **Method + Path** | `PUT /api/me/onboarding` |
| **Service / Helper** | UPDATE `businesses` (name, region, fiscal year); INSERT into `accounts` for each provided account; UPDATE `users.onboarding_complete` |
| **Frontend Trigger** | `public/js/onboarding.js` → onboarding wizard completion |
| **Affects History** | **No** — account setup on a new business, no historical data exists |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | None (new accounts, no transactions) |
| **Test Coverage** | None |
| **Status** | ✅ Protected (by design) |

---

## Section 9 — Export Mutations

Exports read accounting data and produce documents. They do not mutate financial records but do write export metadata/files to the database.

### 9.1 Generate PDF/CSV Export

| Field | Value |
|-------|-------|
| **Mutation Name** | Generate Export |
| **Route File** | `routes/exports.routes.js:95` |
| **Method + Path** | `POST /api/exports/generate` |
| **Service / Helper** | Reads `transactions`, `accounts`, `categories`; generates PDF via `pdfWorkerClient`; INSERTs into `exports` and `export_metadata` |
| **Frontend Trigger** | `public/js/exports.js` → Generate Report button |
| **Affects History** | **No** (reads only; creates an export record) |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | Reads only; includes all non-archived, non-adjustment transactions |
| **Test Coverage** | Integration tests |
| **Status** | ✅ Read-only path |

---

### 9.2 Secure CPA Export

| Field | Value |
|-------|-------|
| **Mutation Name** | Secure CPA Export |
| **Route File** | `routes/exports.routes.js:249` |
| **Method + Path** | `POST /api/exports/secure-export` |
| **Service / Helper** | Reads transactions; generates export file; INSERTs into `exports` and `export_metadata` with CPA grant JWT |
| **Frontend Trigger** | CPA dashboard |
| **Affects History** | **No** (reads only) |
| **Lock Required** | **No** |
| **Lock Enforced** | **No** — correct by design |
| **Archive / Delete Rule** | N/A |
| **Report / Export Impact** | Reads only |
| **Test Coverage** | Basic |
| **Status** | ✅ Read-only path |

---

## Section 10 — Billing Mutations

Not accounting-related, but included for completeness.

| Mutation Name | Route File | Method + Path | Notes |
|---------------|-----------|---------------|-------|
| Start Checkout | `billing.routes.js:128` | `POST /api/billing/checkout-session` | Stripe session; no accounting data |
| Open Portal | `billing.routes.js:155` | `POST /api/billing/customer-portal` | Stripe portal redirect |
| Cancel Subscription | `billing.routes.js:170` | `POST /api/billing/cancel` | Updates subscription state |
| Stripe Webhook | `billing.routes.js:291` | `POST /api/billing/webhook` | Updates `subscriptions` table |

**Status:** Not accounting-related — no lock enforcement needed or appropriate.

**Dead/Legacy billing routes in auth.routes.js:** Lines 1449, 1476, 1491, 1612 in `auth.routes.js` contain identical billing routes (`/checkout-session`, `/customer-portal`, `/cancel`, `/webhook`) mounted under `/api/auth/`. These are reachable but are not called by any frontend JS (which always uses `/api/billing/`). These are **duplicate dead paths** and should be removed to avoid confusion.

---

## Section 11 — Auth / Session / CPA / Privacy Mutations

Not directly accounting-related. Listed for completeness.

| Mutation | Route File | Method + Path | Accounting Impact |
|----------|-----------|---------------|-------------------|
| Register | `auth.routes.js:483` | `POST /api/auth/register` | None |
| Login | `auth.routes.js:643` | `POST /api/auth/login` | None |
| Logout | `auth.routes.js:775` | `POST /api/auth/logout` | None |
| Change Password | `auth.routes.js:812` | `POST /api/auth/change-password` | None |
| MFA Setup/Enable/Disable | `auth.routes.js:874,882,978` | `POST /api/auth/mfa/*` | None |
| Request Email Change | `auth.routes.js:1219` | `POST /api/auth/request-email-change` | None |
| Forgot / Reset Password | `auth.routes.js:1133,1191` | `POST /api/auth/*` | None |
| Delete Session | `sessions.routes.js:51` | `DELETE /api/sessions/:id` | None |
| Delete All Sessions | `sessions.routes.js:71` | `DELETE /api/sessions` | None |
| Create CPA Grant | `cpa-access.routes.js:602` | `POST /api/cpa-access/grants` | None (access control) |
| Accept CPA Grant | `cpa-access.routes.js:619` | `POST /api/cpa-access/grants/:id/accept` | None |
| Revoke CPA Grant | `cpa-access.routes.js:633` | `DELETE /api/cpa-access/grants/:id` | None |
| Permanent Delete Grant | `cpa-access.routes.js:646` | `DELETE /api/cpa-access/grants/:id/permanent` | None |
| CPA Verify | `cpa-verification.routes.js:43` | `POST /api/cpa-verification/verify` | None |
| Privacy Settings | `privacy.routes.js:114` | `POST /api/privacy/settings` | None |
| GDPR Export | `privacy.routes.js:194` | `POST /api/privacy/export` | Reads only |
| Data Erasure | `privacy.routes.js:358` | `POST /api/privacy/erase` | Nuclear — all data |
| Privacy Delete | `privacy.routes.js:443` | `POST /api/privacy/delete` | Nuclear — all data |
| Message Create | `messages.routes.js:229` | `POST /api/messages` | None |
| Message Status | `messages.routes.js:320,345,388` | `PATCH /api/messages/:id/*` | None |
| Delete Message | `messages.routes.js:413` | `DELETE /api/messages/:id` | None |
| Analytics What-If | `analytics.routes.js:414` | `POST /api/analytics/whatif` | Read-only simulation |

---

## Section 12 — Gap Summary

The following mutations have identified gaps or unclear status relative to the accounting period lock:

### 12.1 Unprotected Paths That Should Be Considered

| # | Path | Gap Description | Risk Level |
|---|------|-----------------|------------|
| 1 | `DELETE /api/receipts/:id` | Lock not checked when deleting a receipt attached to a locked-period transaction | Low — does not change financial totals |
| 2 | `PATCH /api/receipts/:id/attach` (detach only) | Lock not checked when detaching a receipt from a locked-period transaction | Low |
| 3 | `PUT /api/categories/:id` (kind/tax_map) | Changing category `kind` or `tax_map_*` retroactively changes tax classification of all locked-period transactions in that category | Medium — affects tax reports |
| 4 | `PUT /api/accounts/:id` (type) | Changing account `type` retroactively changes classification context for locked-period transactions | Low |
| 5 | `POST /api/mileage` | Mileage records for locked periods can be created | Low-Medium |
| 6 | `PUT /api/mileage/:id` | In-place update with no audit trail; no lock check | Low-Medium |
| 7 | `DELETE /api/mileage/:id` | Hard delete with no lock check and no audit trail | Low-Medium |
| 8 | `DELETE /api/businesses/:id` | Destroys all accounting data including locked-period transactions | High — but mitigated by MFA + password |
| 9 | `DELETE /api/me` | Same as business deletion, times all businesses owned | High — but mitigated by rate limiting + audit log |

### 12.2 Dead / Duplicate Paths

| Path | Location | Status |
|------|----------|--------|
| `POST /api/auth/checkout-session` | `auth.routes.js:1449` | Dead — duplicate of `billing.routes.js`; frontend never calls this path |
| `POST /api/auth/customer-portal` | `auth.routes.js:1476` | Dead — duplicate |
| `POST /api/auth/cancel` | `auth.routes.js:1491` | Dead — duplicate |
| `POST /api/auth/webhook` | `auth.routes.js:1612` | Dead — duplicate; if it ever received a Stripe webhook event it would process it without being the registered endpoint |

### 12.3 Paths With No Test Coverage

| Path | File |
|------|------|
| `PUT /api/accounts/:id` | `accounts.routes.js:83` |
| `PUT /api/categories/:id` | `categories.routes.js:78` |
| `POST /api/mileage` | `mileage.routes.js:81` |
| `PUT /api/mileage/:id` | `mileage.routes.js:315` |
| `DELETE /api/mileage/:id` | `mileage.routes.js:470` |
| `PUT /api/me/onboarding` | `me.routes.js:122` |

---

## Section 13 — Complete Inventory Table

Quick-reference table of all accounting-relevant mutation paths.

| Mutation Name | Method | Path | Route File | Affects History | Lock Required | Lock Enforced | Archive Rule | Status |
|---------------|--------|------|-----------|-----------------|---------------|---------------|--------------|--------|
| Create Transaction | POST | /api/transactions | transactions.routes.js | Yes | Yes | ✅ Yes | N/A (create) | ✅ |
| Edit Transaction | PUT | /api/transactions/:id | transactions.routes.js | Yes | Yes | ✅ Yes | Append-only (no delete) | ✅ |
| Archive Transaction | DELETE | /api/transactions/:id | transactions.routes.js | Yes | Yes | ✅ Yes | Soft archive (is_void, deleted_at) | ✅ |
| Toggle Cleared | PATCH | /api/transactions/:id/cleared | transactions.routes.js | Moderate | Yes | ✅ Yes | N/A (flag update) | ✅ |
| Create Recurring Template | POST | /api/recurring | recurring.routes.js | Indirect | No | N/A | N/A | ✅ |
| Edit Recurring Template | PUT | /api/recurring/:id | recurring.routes.js | Indirect | No | N/A | N/A | ✅ |
| Toggle Recurring Active | PATCH | /api/recurring/:id/status | recurring.routes.js | No | No | N/A | N/A | ✅ |
| Post Recurring Occurrence | POST | /api/recurring/:id/run | recurring.routes.js | Yes | Yes | ✅ Yes | N/A (creates tx) | ✅ |
| Delete Recurring Template | DELETE | /api/recurring/:id | recurring.routes.js | No (templates only) | No | N/A | Hard delete (template only; posted txns kept) | ✅ |
| Upload Receipt | POST | /api/receipts | receipts.routes.js | No | No | N/A | N/A | ✅ |
| Attach / Detach Receipt | PATCH | /api/receipts/:id/attach | receipts.routes.js | Moderate | Yes (attach) | ⚠️ Partial (attach only) | N/A | ⚠️ |
| Delete Receipt | DELETE | /api/receipts/:id | receipts.routes.js | Moderate | Debatable | 🔴 No | Hard delete (file + DB row) | ⚠️ |
| Create Account | POST | /api/accounts | accounts.routes.js | No | No | N/A | N/A | ✅ |
| Edit Account | PUT | /api/accounts/:id | accounts.routes.js | Yes (retroactive) | Debatable | 🔴 No | N/A | ❓ |
| Delete Account | DELETE | /api/accounts/:id | accounts.routes.js | No (blocked by constraint) | No | N/A | Hard delete (blocked if in use) | ✅ |
| Create Category | POST | /api/categories | categories.routes.js | No | No | N/A | N/A | ✅ |
| Edit Category | PUT | /api/categories/:id | categories.routes.js | Yes (retroactive tax) | Debatable | 🔴 No | N/A | ⚠️ |
| Delete Category | DELETE | /api/categories/:id | categories.routes.js | No (blocked by constraint) | No | N/A | Hard delete (blocked if in use) | ✅ |
| Create Mileage | POST | /api/mileage | mileage.routes.js | Yes (mileage deductions) | Debatable | 🔴 No | N/A | ⚠️ |
| Edit Mileage | PUT | /api/mileage/:id | mileage.routes.js | Yes | Debatable | 🔴 No | In-place update, no audit trail | ⚠️ |
| Delete Mileage | DELETE | /api/mileage/:id | mileage.routes.js | Yes | Debatable | 🔴 No | Hard delete, no audit trail | ⚠️ |
| Update Business Profile | PUT | /api/business | business.routes.js | Yes (fiscal year/region) | No | N/A | N/A | ❓ |
| Set Accounting Lock | PUT | /api/business/accounting-lock | business.routes.js | Meta | N/A | N/A | N/A | ✅ |
| Create Business | POST | /api/businesses | businesses.routes.js | No | No | N/A | N/A | ✅ |
| Delete Business | DELETE | /api/businesses/:id | businesses.routes.js | Catastrophic | No | 🔴 No | Hard delete cascade | ⚠️ |
| Update User Profile | PUT | /api/me | me.routes.js | No | No | N/A | N/A | ✅ |
| Delete User Account | DELETE | /api/me | me.routes.js | Catastrophic | No | 🔴 No | Hard delete cascade | ⚠️ |
| Onboarding Setup | PUT | /api/me/onboarding | me.routes.js | No (new business) | No | N/A | N/A | ✅ |
| Generate Export | POST | /api/exports/generate | exports.routes.js | No (read) | No | N/A | N/A | ✅ |
| Secure CPA Export | POST | /api/exports/secure-export | exports.routes.js | No (read) | No | N/A | N/A | ✅ |

---

## Section 14 — Recommended Actions

Based on this audit, the following actions are recommended in priority order:

### Priority 1 — Product Decision Required

These gaps require a product decision before code changes are made:

1. **Mileage lock enforcement** — Decide whether mileage records should be subject to accounting period locks. If yes, apply `assertDateUnlocked` in all three mileage mutation routes, and migrate mileage deletes to a soft-archive pattern.

2. **Category `kind` / `tax_map_*` edits** — Decide whether changing the income/expense kind or tax mapping of a category should be blocked if any locked-period transactions reference it. A softer approach: warn the user but allow it. A harder approach: block it.

3. **Account type edits** — Lower priority than categories, but the same question applies.

4. **Receipt deletion from locked periods** — Decide whether deleting a receipt attached to a locked-period transaction should be blocked.

### Priority 2 — Code Cleanup

1. **Remove dead billing routes from `auth.routes.js`** (lines 1449–1616). These are unreachable duplicates of `billing.routes.js` endpoints and create confusion. If the Stripe webhook route in `auth.routes.js` ever accidentally received a real webhook, it would process it unauthenticated.

### Priority 3 — Test Coverage

1. Add accounting-lock tests for mileage mutations (if lock enforcement is added).
2. Add tests for category `kind` / `tax_map_*` edit lock behavior.
3. Add tests for account type edit lock behavior.
4. Add tests for `PUT /api/me/onboarding`.

---

*Last updated: 2026-04-11. Regenerate this document after any route-level change to confirm all paths are still covered.*
