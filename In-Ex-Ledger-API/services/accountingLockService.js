class AccountingPeriodLockedError extends Error {
  constructor({ lockedThroughDate, transactionDate }) {
    super(`Transactions dated on or before ${lockedThroughDate} are locked for this business.`);
    this.name = "AccountingPeriodLockedError";
    this.status = 409;
    this.code = "accounting_period_locked";
    this.lockedThroughDate = lockedThroughDate;
    this.transactionDate = transactionDate;
  }
}

function normalizeDateOnly(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Date value is invalid.");
    }
    return value.toISOString().slice(0, 10);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Date value is invalid.");
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeAccountingLockRow(row) {
  return {
    lockedThroughDate: normalizeDateOnly(row?.locked_through_date),
    note: String(row?.locked_period_note || "").trim() || null,
    updatedAt: row?.locked_period_updated_at || null,
    updatedById: row?.locked_period_updated_by || null,
    isLocked: Boolean(row?.locked_through_date)
  };
}

function isDateLocked(transactionDate, lockedThroughDate) {
  const txDate = normalizeDateOnly(transactionDate);
  const lockDate = normalizeDateOnly(lockedThroughDate);
  if (!txDate || !lockDate) {
    return false;
  }
  return txDate <= lockDate;
}

function assertDateUnlocked(lockState, transactionDate) {
  const txDate = normalizeDateOnly(transactionDate);
  const lockDate = normalizeDateOnly(lockState?.lockedThroughDate);
  if (!txDate || !lockDate) {
    return;
  }

  if (isDateLocked(txDate, lockDate)) {
    throw new AccountingPeriodLockedError({
      lockedThroughDate: lockDate,
      transactionDate: txDate
    });
  }
}

async function loadAccountingLockState(pool, businessId) {
  const result = await pool.query(
    `SELECT locked_through_date, locked_period_note, locked_period_updated_at, locked_period_updated_by
       FROM businesses
      WHERE id = $1
      LIMIT 1`,
    [businessId]
  );

  return normalizeAccountingLockRow(result.rows[0] || null);
}

async function saveAccountingLockState(pool, businessId, userId, payload = {}) {
  const lockDate = normalizeDateOnly(payload.lockedThroughDate);
  const note = String(payload.note || "").trim() || null;

  const result = await pool.query(
    `UPDATE businesses
        SET locked_through_date = $1,
            locked_period_note = $2,
            locked_period_updated_at = NOW(),
            locked_period_updated_by = $3
      WHERE id = $4
      RETURNING locked_through_date, locked_period_note, locked_period_updated_at, locked_period_updated_by`,
    [lockDate, note, userId, businessId]
  );

  return normalizeAccountingLockRow(result.rows[0] || null);
}

const LOCKED_REFERENCE_COLUMNS = new Set(["category_id", "account_id"]);

async function assertNoLockedPeriodTransactionsForReference(pool, businessId, referenceColumn, referenceId, lockState) {
  if (!LOCKED_REFERENCE_COLUMNS.has(referenceColumn)) {
    throw new Error(`Unsupported locked-period transaction reference: ${referenceColumn}`);
  }

  const lockDate = normalizeDateOnly(lockState?.lockedThroughDate);
  if (!lockDate || !referenceId) {
    return;
  }

  const result = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM transactions
        WHERE ${referenceColumn} = $1
          AND business_id = $2
          AND date::date <= $3::date
          AND deleted_at IS NULL
          AND (is_adjustment = false OR is_adjustment IS NULL)
     ) AS has_locked`,
    [referenceId, businessId, lockDate]
  );

  if (result.rows[0]?.has_locked) {
    throw new AccountingPeriodLockedError({
      lockedThroughDate: lockDate,
      transactionDate: null
    });
  }
}

/**
 * Throws AccountingPeriodLockedError if any non-archived, non-adjustment
 * transaction inside the locked period references the given category.
 * Safe to call with a null/empty lockState (no-ops when no lock is active).
 *
 * @param {object} pool         - pg Pool
 * @param {string} businessId
 * @param {string} categoryId
 * @param {object|null} lockState - result of loadAccountingLockState
 */
async function assertNoLockedPeriodTransactionsForCategory(pool, businessId, categoryId, lockState) {
  return assertNoLockedPeriodTransactionsForReference(pool, businessId, "category_id", categoryId, lockState);
}

/**
 * Throws AccountingPeriodLockedError if any non-archived, non-adjustment
 * transaction inside the locked period references the given account.
 * Safe to call with a null/empty lockState (no-ops when no lock is active).
 *
 * @param {object} pool         - pg Pool
 * @param {string} businessId
 * @param {string} accountId
 * @param {object|null} lockState - result of loadAccountingLockState
 */
async function assertNoLockedPeriodTransactionsForAccount(pool, businessId, accountId, lockState) {
  return assertNoLockedPeriodTransactionsForReference(pool, businessId, "account_id", accountId, lockState);
}

module.exports = {
  AccountingPeriodLockedError,
  normalizeDateOnly,
  normalizeAccountingLockRow,
  isDateLocked,
  assertDateUnlocked,
  loadAccountingLockState,
  saveAccountingLockState,
  assertNoLockedPeriodTransactionsForReference,
  assertNoLockedPeriodTransactionsForCategory,
  assertNoLockedPeriodTransactionsForAccount
};
