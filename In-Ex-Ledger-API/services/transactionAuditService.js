async function archiveTransaction({ pool, businessId, transactionId, userId, reason = null }) {
  const trimmedReason = String(reason || "").trim() || null;

  const result = await pool.query(
    `UPDATE transactions
        SET deleted_at = NOW(),
            is_void = true,
            voided_at = NOW(),
            voided_by_id = $3,
            deleted_by_id = $3,
            deleted_reason = COALESCE($4, deleted_reason)
      WHERE id = $1
        AND business_id = $2
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
      RETURNING id, deleted_at, deleted_by_id, deleted_reason, is_void, voided_at, voided_by_id`,
    [transactionId, businessId, userId, trimmedReason]
  );

  return result.rows[0] || null;
}

async function restoreMostRecentArchivedTransaction({ pool, businessId, userId, transactionId = null }) {
  let resolvedTransactionId = transactionId;
  if (!resolvedTransactionId) {
    const candidate = await pool.query(
      `SELECT id
         FROM transactions
        WHERE business_id = $1
          AND deleted_at IS NOT NULL
          AND (is_void = true OR is_void IS NULL)
          AND (is_adjustment = false OR is_adjustment IS NULL)
        ORDER BY deleted_at DESC, voided_at DESC, created_at DESC
        LIMIT 1`,
      [businessId]
    );

    resolvedTransactionId = candidate.rows[0]?.id || null;
  }

  if (!resolvedTransactionId) {
    return null;
  }

  const restored = await pool.query(
    `UPDATE transactions
        SET deleted_at = NULL,
            is_void = false,
            voided_at = NULL,
            voided_by_id = NULL,
            deleted_by_id = NULL,
            deleted_reason = NULL,
            adjusted_by_id = COALESCE(adjusted_by_id, $3)
      WHERE id = $1
        AND business_id = $2
        AND deleted_at IS NOT NULL
      RETURNING *`,
    [resolvedTransactionId, businessId, userId]
  );

  return restored.rows[0] || null;
}

async function countRestorableArchivedTransactions({ pool, businessId, limit = 20 }) {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Number(limit))) : 20;
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM (
         SELECT id
           FROM transactions
          WHERE business_id = $1
            AND deleted_at IS NOT NULL
            AND (is_void = true OR is_void IS NULL)
            AND (is_adjustment = false OR is_adjustment IS NULL)
          ORDER BY deleted_at DESC, voided_at DESC, created_at DESC
          LIMIT $2
       ) recent_archived`,
    [businessId, normalizedLimit]
  );

  return Number(result.rows[0]?.total || 0);
}

module.exports = {
  archiveTransaction,
  restoreMostRecentArchivedTransaction,
  countRestorableArchivedTransactions
};
