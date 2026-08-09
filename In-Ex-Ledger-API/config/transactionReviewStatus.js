"use strict";

const TRANSACTION_REVIEW_STATUSES = Object.freeze([
  "needs_review",
  "ready",
  "matched",
  "locked"
]);

const TRANSACTION_REVIEW_STATUS_SET = new Set(TRANSACTION_REVIEW_STATUSES);

function isTransactionReviewStatus(value) {
  return TRANSACTION_REVIEW_STATUS_SET.has(String(value || "").trim().toLowerCase());
}

function transactionReviewStatusList() {
  return TRANSACTION_REVIEW_STATUSES.join(", ");
}

module.exports = {
  TRANSACTION_REVIEW_STATUSES,
  TRANSACTION_REVIEW_STATUS_SET,
  isTransactionReviewStatus,
  transactionReviewStatusList
};
