"use strict";

const VALID_RECEIPT_STATUSES = new Set(["pending", "attached", "missing", "not_required"]);
const MANUALLY_SETTABLE_STATUSES = new Set(["pending", "missing", "not_required"]);

class ReceiptStatusValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReceiptStatusValidationError";
    this.status = 400;
    this.code = "receipt_status_invalid";
  }
}

class ReceiptStatusConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReceiptStatusConflictError";
    this.status = 409;
    this.code = "receipt_status_conflict";
  }
}

/**
 * Re-derives a transaction's receipt_status from the receipts actually on
 * file. This is the only path that may ever set status to 'attached' — a
 * client can never assert "attached" directly, since that would let a user
 * claim evidence exists without an actual receipt file backing it up.
 *
 * Called after every upload, attach/detach, and delete so the transaction's
 * receipt_status always reflects reality. Never touches `cleared` or any
 * other transaction field.
 */
async function syncReceiptStatusForTransaction(client, { businessId, transactionId, actorUserId = null }) {
  if (!transactionId) return null;

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS count FROM receipts WHERE transaction_id = $1 AND business_id = $2`,
    [transactionId, businessId]
  );
  const hasReceipts = Number(countResult.rows[0]?.count || 0) > 0;

  if (hasReceipts) {
    const result = await client.query(
      `UPDATE transactions
          SET receipt_status = 'attached',
              receipt_missing_reason = NULL,
              receipt_status_confirmed_at = NOW(),
              receipt_status_confirmed_by = $3
        WHERE id = $1
          AND business_id = $2
          AND receipt_status <> 'attached'
      RETURNING id, receipt_status`,
      [transactionId, businessId, actorUserId]
    );
    return result.rows[0] || null;
  }

  // No receipts remain. Only auto-revert a status that was itself
  // auto-derived ('attached'); an explicit user attestation of 'missing' or
  // 'not_required' is never overwritten by this sync — those are terminal
  // until the user (or a new upload) changes them.
  const result = await client.query(
    `UPDATE transactions
        SET receipt_status = 'pending'
      WHERE id = $1
        AND business_id = $2
        AND receipt_status = 'attached'
    RETURNING id, receipt_status`,
    [transactionId, businessId]
  );
  return result.rows[0] || null;
}

/**
 * Validates a client-requested manual receipt_status change. Does not talk to
 * the database — callers run this after loading the transaction row and
 * before issuing the UPDATE, so lock-state and existing-receipt checks can be
 * layered on by the caller.
 */
function validateManualReceiptStatusChange({ status, receiptMissingReason, businessPurpose }) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (!VALID_RECEIPT_STATUSES.has(normalizedStatus)) {
    throw new ReceiptStatusValidationError(
      "receipt_status must be one of pending, missing, or not_required."
    );
  }

  if (normalizedStatus === "attached") {
    throw new ReceiptStatusValidationError(
      "receipt_status cannot be set to 'attached' directly — upload a receipt file to attach evidence."
    );
  }

  if (normalizedStatus === "missing" && !String(receiptMissingReason || "").trim()) {
    throw new ReceiptStatusValidationError(
      "receipt_missing_reason is required when setting receipt_status to 'missing'."
    );
  }

  if (normalizedStatus === "not_required" && !String(businessPurpose || "").trim()) {
    throw new ReceiptStatusValidationError(
      "business_purpose is required when setting receipt_status to 'not_required'."
    );
  }

  return normalizedStatus;
}

module.exports = {
  VALID_RECEIPT_STATUSES,
  MANUALLY_SETTABLE_STATUSES,
  ReceiptStatusValidationError,
  ReceiptStatusConflictError,
  syncReceiptStatusForTransaction,
  validateManualReceiptStatusChange
};
