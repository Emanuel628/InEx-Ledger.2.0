async function archiveTransaction({ pool, businessId, transactionId, userId, reason = null }) {
  const trimmedReason = String(reason || "").trim() || null;

  const result = await pool.query(
    `UPDATE transactions
        SET deleted_at = NOW(),
            deleted_by_id = $3,
            deleted_reason = COALESCE($4, deleted_reason)
      WHERE id = $1
        AND business_id = $2
        AND deleted_at IS NULL
      RETURNING id, deleted_at, deleted_by_id, deleted_reason`,
    [transactionId, businessId, userId, trimmedReason]
  );

  return result.rows[0] || null;
}

module.exports = {
  archiveTransaction
};
