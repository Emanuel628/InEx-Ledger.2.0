"use strict";

const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { buildNormalizedExportDataset } = require("../services/exportDatasetService.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FLAG_LABELS = {
  NC: "Assign a business category",
  UM: "Map to a tax line",
  FC: "Final confirmation needed",
  RS: "Receipt or support missing",
  BP: "Business purpose needed",
  AL: "Business-use allocation needed",
  ML: "Mileage log needed",
  HO: "Home-office support needed",
  CA: "Capital asset review needed",
  PR: "Possible personal item",
  TR: "Transfer or balance movement",
  RR: "Refund or reversal review",
  DUP: "Possible duplicate",
  MD: "Description is missing",
  FX: "Foreign currency review",
  IT: "Indirect tax review",
  RV: "CPA review required"
};

function parseDateFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!DATE_PATTERN.test(raw)) return null;
  return raw;
}

function buildIssueLabels(row) {
  const labels = [];
  for (const flag of row.reviewFlags || []) {
    if (FLAG_LABELS[flag]) {
      labels.push(FLAG_LABELS[flag]);
    }
  }
  if (row.reviewStatus === "Excluded - review schedule") {
    labels.push("Excluded item still needs review");
  }
  return Array.from(new Set(labels));
}

function deriveActionTarget(row) {
  const flags = new Set(row.reviewFlags || []);
  if (flags.has("RS")) return { href: "/receipts", label: "Open receipts" };
  if (flags.has("ML")) return { href: "/mileage", label: "Open mileage" };
  if (flags.has("NC") || flags.has("UM") || flags.has("MD") || flags.has("DUP") || flags.has("RV")) {
    return { href: "/transactions", label: "Review transaction" };
  }
  if (flags.has("AL") || flags.has("HO") || flags.has("CA") || flags.has("IT") || flags.has("BP")) {
    return { href: "/transactions", label: "Update details" };
  }
  if (row.reviewStatus === "Excluded - review schedule") {
    return { href: "/exports", label: "Review exclusions" };
  }
  return { href: "/transactions", label: "Review transaction" };
}

function buildQueueRows(rows) {
  return (rows || [])
    .filter((row) => (
      row.reviewStatus === "Action needed" ||
      row.reviewStatus === "Needs review" ||
      row.reviewStatus === "Excluded - review schedule"
    ))
    .map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description || "(No description)",
      amount: row.amount,
      signedAmount: row.signedAmount,
      type: row.rawType,
      currency: row.currency,
      accountName: row.accountName,
      categoryName: row.categoryName,
      taxLineLabel: row.taxLineLabel,
      mappingStatus: row.mappingStatus,
      supportStatus: row.supportStatus,
      reviewStatus: row.reviewStatus,
      reviewFlags: row.reviewFlags || [],
      issueLabels: buildIssueLabels(row),
      receiptCount: row.receiptCount || 0,
      receiptAttached: row.receiptAttached === true,
      supportSummary: row.supportSummary || "",
      reviewNotes: row.reviewNotes || "",
      actionTarget: deriveActionTarget(row)
    }))
    .sort((left, right) => {
      const statusWeight = (status) => {
        if (status === "Action needed") return 0;
        if (status === "Needs review") return 1;
        return 2;
      };
      const byStatus = statusWeight(left.reviewStatus) - statusWeight(right.reviewStatus);
      if (byStatus !== 0) return byStatus;
      const byDate = String(left.date || "").localeCompare(String(right.date || ""));
      if (byDate !== 0) return byDate;
      return String(left.description || "").localeCompare(String(right.description || ""));
    });
}

function summarizeQueue(queue) {
  const summary = {
    total: queue.length,
    actionNeededCount: 0,
    needsReviewCount: 0,
    excludedReviewCount: 0,
    missingReceiptCount: 0,
    missingCategoryCount: 0,
    missingDescriptionCount: 0,
    byFlag: {}
  };

  for (const item of queue) {
    if (item.reviewStatus === "Action needed") summary.actionNeededCount += 1;
    else if (item.reviewStatus === "Needs review") summary.needsReviewCount += 1;
    else if (item.reviewStatus === "Excluded - review schedule") summary.excludedReviewCount += 1;

    const flagSet = new Set(item.reviewFlags || []);
    if (flagSet.has("RS")) summary.missingReceiptCount += 1;
    if (flagSet.has("NC")) summary.missingCategoryCount += 1;
    if (flagSet.has("MD")) summary.missingDescriptionCount += 1;

    for (const flag of flagSet) {
      summary.byFlag[flag] = (summary.byFlag[flag] || 0) + 1;
    }
  }

  return summary;
}

router.get("/queue", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const startDate = parseDateFilter(req.query.startDate);
    const endDate = parseDateFilter(req.query.endDate);

    const dateFilterSql = startDate && endDate ? "AND t.date >= $2 AND t.date <= $3" : "";
    const transactionParams = startDate && endDate ? [businessId, startDate, endDate] : [businessId];
    const receiptParams = startDate && endDate ? [businessId, startDate, endDate] : [businessId];
    const vehicleClaimParams = startDate && endDate ? [businessId, startDate, endDate] : [businessId];
    const capitalAssetParams = [businessId];

    const [
      transactionResult,
      accountResult,
      categoryResult,
      receiptResult,
      supportArtifactResult,
      businessResult,
      vehicleClaimResult,
      capitalAssetResult
    ] = await Promise.all([
      pool.query(
        `SELECT t.id, t.account_id, t.category_id, t.amount, t.type, t.description, t.note, t.date,
                t.currency, t.source_amount, t.exchange_rate, t.exchange_date, t.converted_amount,
                t.tax_treatment, t.indirect_tax_amount, t.indirect_tax_recoverable, t.personal_use_pct,
                t.review_status, t.review_notes, t.payer_name, t.tax_form_type
           FROM transactions t
          WHERE t.business_id = $1
            AND t.deleted_at IS NULL
            AND (t.is_void = false OR t.is_void IS NULL)
            AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
            ${dateFilterSql}
          ORDER BY t.date ASC, t.created_at ASC`,
        transactionParams
      ),
      pool.query("SELECT id, name, type FROM accounts WHERE business_id = $1", [businessId]),
      pool.query("SELECT id, name, kind, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1", [businessId]),
      pool.query(
        `SELECT r.id, r.transaction_id, r.filename
           FROM receipts r
           JOIN transactions t ON t.id = r.transaction_id
          WHERE r.business_id = $1
            AND t.deleted_at IS NULL
            ${startDate && endDate ? "AND t.date >= $2 AND t.date <= $3" : ""}
          ORDER BY r.created_at ASC`,
        receiptParams
      ),
      pool.query(
        `SELECT id, transaction_id, artifact_type, filename, mime_type, storage_path, storage_status, review_status, notes, uploaded_at
           FROM support_artifacts
          WHERE business_id = $1
            AND transaction_id IS NOT NULL`,
        [businessId]
      ),
      pool.query(
        `SELECT id, name, region, province, currency, gst_hst_registered, gst_hst_method
           FROM businesses
          WHERE id = $1
          LIMIT 1`,
        [businessId]
      ),
      pool.query(
        `SELECT ved.*
           FROM vehicle_expense_details ved
           JOIN transactions t ON t.id = ved.transaction_id
          WHERE ved.business_id = $1
            AND t.deleted_at IS NULL
            ${startDate && endDate ? "AND t.date >= $2 AND t.date <= $3" : ""}`,
        vehicleClaimParams
      ),
      pool.query(
        `SELECT *
           FROM capital_assets
          WHERE business_id = $1
            AND is_disposed = FALSE`,
        capitalAssetParams
      )
    ]);

    const supportArtifactMap = new Map();
    for (const row of supportArtifactResult.rows) {
      if (!row.transaction_id) continue;
      const current = supportArtifactMap.get(row.transaction_id) || [];
      current.push(row);
      supportArtifactMap.set(row.transaction_id, current);
    }
    const vehicleClaimMap = new Map(
      vehicleClaimResult.rows
        .filter((row) => row.transaction_id)
        .map((row) => [row.transaction_id, row])
    );
    const capitalAssetTxMap = new Map(
      capitalAssetResult.rows
        .filter((row) => row.transaction_id)
        .map((row) => [row.transaction_id, row])
    );

    const dataset = buildNormalizedExportDataset({
      transactions: transactionResult.rows,
      accounts: accountResult.rows,
      categories: categoryResult.rows,
      receipts: receiptResult.rows,
      supportArtifactMap,
      business: businessResult.rows[0] || {},
      vehicleClaimMap,
      capitalAssetTxMap,
      startDate: startDate || "",
      endDate: endDate || ""
    });

    const queue = buildQueueRows(dataset.rows);
    return res.json({
      queue,
      summary: summarizeQueue(queue),
      supportSummary: dataset.supportSummary,
      totals: dataset.totals,
      metadata: dataset.metadata
    });
  } catch (err) {
    logError("GET /review/queue error:", err);
    return res.status(500).json({ error: "Failed to load review queue." });
  }
});

module.exports = router;
