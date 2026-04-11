class AccountingPeriodLockedError extends Error {
  constructor({ lockedThroughDate, transactionDate = null }) {
    super(`This accounting period is locked. Data dated on or before ${lockedThroughDate} cannot be changed.`);
    this.name = "AccountingPeriodLockedError";
    this.status = 409;
    this.code = "accounting_period_locked";
    this.lockedThroughDate = lockedThroughDate;
    this.transactionDate = transactionDate;
  }
}

function isAccountingPeriodLockedError(error) {
  return error instanceof AccountingPeriodLockedError;
}

function buildAccountingLockErrorPayload(error) {
  return {
    error: error.message,
    code: error.code,
    locked_through_date: error.lockedThroughDate,
    transaction_date: error.transactionDate || null
  };
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

module.exports = {
  AccountingPeriodLockedError,
  isAccountingPeriodLockedError,
  buildAccountingLockErrorPayload,
  normalizeDateOnly,
  normalizeAccountingLockRow,
  isDateLocked,
  assertDateUnlocked,
  loadAccountingLockState,
  saveAccountingLockState
};
