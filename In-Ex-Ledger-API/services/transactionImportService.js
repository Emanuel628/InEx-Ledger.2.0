"use strict";

const crypto = require("crypto");

const VALID_SOURCES = new Set(["csv", "plaid", "manual"]);

function normalizeSource(source) {
  const s = String(source || "csv").toLowerCase().trim();
  return VALID_SOURCES.has(s) ? s : "csv";
}

function normalizeDescription(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createImportBatch(pool, {
  businessId,
  accountId,
  source = "csv",
  filename,
  importedByUserId
}) {
  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO transaction_imports
       (id, business_id, account_id, source, filename, imported_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      id,
      businessId,
      accountId || null,
      normalizeSource(source),
      filename ? String(filename).slice(0, 255) : null,
      importedByUserId || null
    ]
  );
  return result.rows[0];
}

async function finalizeImportBatch(pool, batchId, counts) {
  const imported = Number(counts?.imported || 0);
  const duplicate = Number(counts?.duplicate || 0);
  const failed = Number(counts?.failed || 0);
  const totalRows = Number(counts?.totalRows || (imported + duplicate + failed));

  const status = imported === 0 ? "partial" : (failed > 0 ? "partial" : "completed");

  await pool.query(
    `UPDATE transaction_imports
        SET imported_count = $2,
            duplicate_count = $3,
            failed_count = $4,
            total_rows = $5,
            status = $6
      WHERE id = $1`,
    [batchId, imported, duplicate, failed, totalRows, status]
  );
}

/**
 * Returns rows of nearby potential duplicates given a candidate row.
 * Compares within +/- dateWindowDays on date, account, amount, type and
 * a normalized substring of the description.
 */
async function findDuplicateCandidates(pool, {
  businessId,
  accountId,
  date,
  amount,
  type,
  description,
  dateWindowDays = 2
}) {
  const normalized = normalizeDescription(description);
  if (!date || !amount || !type) return [];

  const lowerDate = addDays(date, -Math.abs(dateWindowDays));
  const upperDate = addDays(date, Math.abs(dateWindowDays));

  const params = [businessId, accountId || null, lowerDate, upperDate, amount, type];

  const result = await pool.query(
    `SELECT id, description, date, amount, type
       FROM transactions
      WHERE business_id = $1
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
        AND ($2::uuid IS NULL OR account_id = $2)
        AND date BETWEEN $3::date AND $4::date
        AND ROUND(amount::numeric, 2) = ROUND($5::numeric, 2)
        AND type = $6
      LIMIT 25`,
    params
  );

  if (!normalized) {
    return result.rows.filter((row) => row.date && row.date.toString().slice(0, 10) === date);
  }

  return result.rows.filter((row) => {
    const rowNorm = normalizeDescription(row.description);
    if (!rowNorm) return false;
    if (rowNorm === normalized) return true;
    const shorter = rowNorm.length < normalized.length ? rowNorm : normalized;
    const longer = rowNorm.length < normalized.length ? normalized : rowNorm;
    if (shorter.length >= 6 && longer.includes(shorter)) return true;
    const a = rowNorm.split(" ").filter(Boolean);
    const b = normalized.split(" ").filter(Boolean);
    if (!a.length || !b.length) return false;
    const setA = new Set(a);
    const overlap = b.filter((tok) => setA.has(tok)).length;
    return overlap / Math.max(a.length, b.length) >= 0.6;
  });
}

async function listImportBatches(pool, businessId, { limit = 25 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const result = await pool.query(
    `SELECT ti.id,
            ti.source,
            ti.filename,
            ti.imported_count,
            ti.duplicate_count,
            ti.failed_count,
            ti.total_rows,
            ti.status,
            ti.reverted_at,
            ti.created_at,
            ti.account_id,
            a.name AS account_name
       FROM transaction_imports ti
  LEFT JOIN accounts a ON a.id = ti.account_id
      WHERE ti.business_id = $1
      ORDER BY ti.created_at DESC
      LIMIT $2`,
    [businessId, safeLimit]
  );
  return result.rows;
}

async function getImportBatch(pool, businessId, batchId) {
  const result = await pool.query(
    `SELECT id, business_id, account_id, source, filename, imported_count,
            duplicate_count, failed_count, total_rows, status, reverted_at,
            reverted_by_user_id, created_at
       FROM transaction_imports
      WHERE id = $1 AND business_id = $2
      LIMIT 1`,
    [batchId, businessId]
  );
  return result.rows[0] || null;
}

/**
 * Undoes an import batch by soft-deleting every transaction that still belongs
 * to it and isn't already deleted. Refuses if any belonging transaction sits in
 * a locked accounting period.
 */
async function revertImportBatch(pool, {
  businessId,
  batchId,
  userId,
  lockState
}) {
  const lockedDate = lockState?.lockedThroughDate || null;
  if (lockedDate) {
    const locked = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM transactions
        WHERE business_id = $1
          AND import_batch_id = $2
          AND deleted_at IS NULL
          AND date <= $3::date`,
      [businessId, batchId, lockedDate]
    );
    if ((locked.rows[0]?.n || 0) > 0) {
      const err = new Error("Some transactions in this import batch fall within a locked accounting period and cannot be reverted.");
      err.status = 409;
      err.code = "accounting_period_locked";
      throw err;
    }
  }

  const updated = await pool.query(
    `UPDATE transactions
        SET deleted_at = NOW(),
            is_void = true,
            voided_at = NOW(),
            voided_by_id = $3,
            deleted_by_id = $3,
            deleted_reason = COALESCE(deleted_reason, 'import_batch_reverted')
      WHERE business_id = $1
        AND import_batch_id = $2
        AND deleted_at IS NULL
      RETURNING id`,
    [businessId, batchId, userId || null]
  );

  await pool.query(
    `UPDATE transaction_imports
        SET status = 'reverted',
            reverted_at = NOW(),
            reverted_by_user_id = $2
      WHERE id = $1
        AND business_id = $3`,
    [batchId, userId || null, businessId]
  );

  return { revertedCount: updated.rowCount };
}

module.exports = {
  createImportBatch,
  finalizeImportBatch,
  findDuplicateCandidates,
  listImportBatches,
  getImportBatch,
  revertImportBatch,
  normalizeDescription,
  __private: { addDays, normalizeSource }
};
