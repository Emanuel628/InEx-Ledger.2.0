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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const FLAG_TO_ISSUE_CODE = {
  NC: "needs_category",
  UM: "needs_tax_mapping",
  FC: "final_confirmation_needed",
  RS: "needs_receipt_support",
  BP: "needs_business_purpose",
  AL: "needs_allocation",
  ML: "needs_mileage_log",
  HO: "needs_home_office_support",
  CA: "needs_capital_asset_review",
  PR: "possible_personal_item",
  TR: "transfer_review",
  RR: "refund_reversal_review",
  DUP: "possible_duplicate",
  MD: "missing_description",
  FX: "foreign_currency_review",
  IT: "indirect_tax_review",
  RV: "cpa_review_required"
};

const ISSUE_CODE_LABELS = {
  needs_category: "Assign a business category",
  needs_tax_mapping: "Map to a tax line",
  final_confirmation_needed: "Final confirmation needed",
  needs_receipt_support: "Receipt or support missing",
  needs_business_purpose: "Business purpose needed",
  needs_allocation: "Business-use allocation needed",
  needs_mileage_log: "Mileage log needed",
  needs_home_office_support: "Home-office support needed",
  needs_capital_asset_review: "Capital asset review needed",
  possible_personal_item: "Possible personal item",
  transfer_review: "Transfer or balance movement",
  refund_reversal_review: "Refund or reversal review",
  possible_duplicate: "Possible duplicate",
  missing_description: "Description is missing",
  foreign_currency_review: "Foreign currency review",
  indirect_tax_review: "Indirect tax review",
  cpa_review_required: "CPA review required",
  excluded_review: "Excluded item still needs review",
  reviewer_note: "Reviewer note"
};

const ISSUE_PRIORITY = {
  needs_category: 0,
  needs_tax_mapping: 1,
  missing_description: 2,
  needs_mileage_log: 3,
  needs_allocation: 4,
  needs_home_office_support: 5,
  needs_capital_asset_review: 6,
  needs_receipt_support: 7,
  needs_business_purpose: 8,
  indirect_tax_review: 9,
  cpa_review_required: 10,
  final_confirmation_needed: 11,
  possible_duplicate: 12,
  possible_personal_item: 13,
  foreign_currency_review: 14,
  transfer_review: 15,
  refund_reversal_review: 16,
  reviewer_note: 17,
  excluded_review: 18
};

const VALID_ISSUE_SEVERITIES = new Set(["warning", "hard"]);
const VALID_ISSUE_STATUSES = new Set(["open", "resolved", "waived"]);
const USER_NAME_SQL = "COALESCE(u.display_name, u.full_name, u.email)";

function parseDateFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!DATE_PATTERN.test(raw)) return null;
  return raw;
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function normalizeIssueCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized && /^[a-z_]+$/.test(normalized) ? normalized : "";
}

function buildDerivedIssueEntries(row) {
  const derived = [];
  for (const flag of row.reviewFlags || []) {
    const issueCode = FLAG_TO_ISSUE_CODE[flag];
    const label = FLAG_LABELS[flag];
    if (!issueCode || !label) continue;
    derived.push({
      issue_code: issueCode,
      label,
      issue_severity: ["NC", "UM", "RS", "BP", "AL", "ML", "HO", "CA", "MD", "RV"].includes(flag) ? "hard" : "warning",
      source: "derived"
    });
  }
  if (row.reviewStatus === "Excluded - review schedule") {
    derived.push({
      issue_code: "excluded_review",
      label: ISSUE_CODE_LABELS.excluded_review,
      issue_severity: "warning",
      source: "derived"
    });
  }
  return derived;
}

function mergeIssueState(row, stateRows = []) {
  const latestStateByCode = new Map();
  for (const stateRow of stateRows) {
    const issueCode = normalizeIssueCode(stateRow.issue_code);
    if (!issueCode) continue;
    latestStateByCode.set(issueCode, stateRow);
  }

  const merged = [];
  for (const derived of buildDerivedIssueEntries(row)) {
    const override = latestStateByCode.get(derived.issue_code);
    if (override?.issue_status === "resolved" || override?.issue_status === "waived") {
      continue;
    }
    merged.push({
      id: override?.id || "",
      issueCode: derived.issue_code,
      label: derived.label,
      severity: override?.issue_severity || derived.issue_severity,
      status: override?.issue_status || "open",
      notes: override?.review_notes || "",
      source: "derived"
    });
  }

  for (const stateRow of stateRows) {
    const issueCode = normalizeIssueCode(stateRow.issue_code);
    if (!issueCode || stateRow.issue_status !== "open") continue;
    if (merged.some((entry) => entry.issueCode === issueCode)) continue;
    merged.push({
      id: stateRow.id,
      issueCode,
      label: ISSUE_CODE_LABELS[issueCode] || issueCode.replace(/_/g, " "),
      severity: stateRow.issue_severity || "warning",
      status: stateRow.issue_status,
      notes: stateRow.review_notes || "",
      source: "reviewer"
    });
  }

  return merged;
}

function issueSeverityWeight(entry) {
  return entry?.severity === "hard" ? 0 : 1;
}

function issuePriority(entry) {
  return ISSUE_PRIORITY[entry?.issueCode] ?? 99;
}

function compareIssueEntries(left, right) {
  const bySeverity = issueSeverityWeight(left) - issueSeverityWeight(right);
  if (bySeverity !== 0) return bySeverity;
  const byPriority = issuePriority(left) - issuePriority(right);
  if (byPriority !== 0) return byPriority;
  return String(left?.label || "").localeCompare(String(right?.label || ""));
}

function deriveActionTargetFromIssue(issueEntry, row) {
  if (!issueEntry) {
    return { href: "/transactions", label: "Review transaction" };
  }

  switch (issueEntry.issueCode) {
    case "needs_tax_mapping":
      return { href: "/categories", label: "Open categories" };
    case "needs_receipt_support":
      return { href: "/receipts", label: "Open receipts" };
    case "needs_mileage_log":
      return { href: "/mileage", label: "Open mileage" };
    case "excluded_review":
      return { href: "/exports", label: "Review exclusions" };
    case "needs_allocation":
    case "needs_business_purpose":
    case "needs_home_office_support":
    case "needs_capital_asset_review":
    case "indirect_tax_review":
      return { href: "/transactions", label: "Update details" };
    default:
      if (row.reviewStatus === "Excluded - review schedule") {
        return { href: "/exports", label: "Review exclusions" };
      }
      return { href: "/transactions", label: "Review transaction" };
  }
}

function deriveQuickActionFromIssue(issueEntry, row) {
  if (row?.reviewStatus === "Excluded - review schedule") {
    return { label: "Review exclusions", action: "navigate", href: "/exports" };
  }
  if (!issueEntry) return null;

  switch (issueEntry.issueCode) {
    case "needs_receipt_support":
      return { label: "Attach receipt", action: "support", supportType: "receipt" };
    case "needs_mileage_log":
      return { label: "Open mileage", action: "navigate", href: "/mileage" };
    case "needs_tax_mapping":
      return { label: "Open categories", action: "navigate", href: "/categories" };
    case "needs_business_purpose":
      return { label: "Add business note", action: "transactions" };
    case "needs_allocation":
      return { label: "Set business-use %", action: "transactions" };
    case "needs_category":
      return { label: "Assign category", action: "transactions" };
    case "missing_description":
      return { label: "Edit details", action: "transactions" };
    case "needs_home_office_support":
      return { label: "Add home-office support", action: "support", supportType: "home_office_worksheet" };
    case "needs_capital_asset_review":
      return { label: "Add asset support", action: "support", supportType: "capital_asset_support" };
    case "final_confirmation_needed":
      return { label: "Add support", action: "support", supportType: "review_note" };
    case "cpa_review_required":
      return { label: "Open review", action: "transactions" };
    case "excluded_review":
      return { label: "Review exclusions", action: "navigate", href: "/exports" };
    default:
      return null;
  }
}

function buildQueueRows(rows, issueStateRowsByTransaction = new Map()) {
  return (rows || [])
    .map((row) => {
      const issueEntries = mergeIssueState(row, issueStateRowsByTransaction.get(row.id) || [])
        .sort(compareIssueEntries);
      if (!issueEntries.length) {
        return null;
      }
      const primaryIssue = issueEntries[0] || null;
      return {
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
        issueLabels: issueEntries.map((entry) => entry.label),
        issueEntries,
        receiptCount: row.receiptCount || 0,
        receiptAttached: row.receiptAttached === true,
        supportSummary: row.supportSummary || "",
        reviewNotes: row.reviewNotes || "",
        actionTarget: deriveActionTargetFromIssue(primaryIssue, row),
        quickAction: deriveQuickActionFromIssue(primaryIssue, row)
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const bySeverity = issueSeverityWeight(left.issueEntries[0]) - issueSeverityWeight(right.issueEntries[0]);
      if (bySeverity !== 0) return bySeverity;
      const byPriority = issuePriority(left.issueEntries[0]) - issuePriority(right.issueEntries[0]);
      if (byPriority !== 0) return byPriority;
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
      capitalAssetResult,
      reviewStateResult
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
        `SELECT id, name, region, province, gst_hst_registered, gst_hst_method
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
      ),
      pool.query(
        `SELECT id, transaction_id, issue_code, issue_severity, issue_status, review_notes, resolved_at, updated_at
           FROM transaction_review_states
          WHERE business_id = $1
          ORDER BY updated_at DESC`,
        [businessId]
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
    const issueStateRowsByTransaction = new Map();
    for (const row of reviewStateResult.rows) {
      if (!row.transaction_id) continue;
      const current = issueStateRowsByTransaction.get(row.transaction_id) || [];
      current.push(row);
      issueStateRowsByTransaction.set(row.transaction_id, current);
    }

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

    const queue = buildQueueRows(dataset.rows, issueStateRowsByTransaction);
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

router.get("/issues/:transactionId", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = String(req.params.transactionId || "").trim();
    if (!isUuid(transactionId)) {
      return res.status(400).json({ error: "Invalid transaction ID." });
    }

    const result = await pool.query(
      `SELECT trs.id, trs.transaction_id, trs.issue_code, trs.issue_severity, trs.issue_status,
              trs.review_notes, trs.resolved_at, trs.updated_at, trs.created_at,
              ${USER_NAME_SQL.replaceAll("u.", "creator.")} AS created_by_name,
              ${USER_NAME_SQL.replaceAll("u.", "resolver.")} AS resolved_by_name
         FROM transaction_review_states trs
         LEFT JOIN users creator ON creator.id = trs.created_by_user_id
         LEFT JOIN users resolver ON resolver.id = trs.resolved_by_user_id
        WHERE trs.business_id = $1
          AND trs.transaction_id = $2
        ORDER BY trs.updated_at DESC, trs.created_at DESC`,
      [businessId, transactionId]
    );
    return res.json(result.rows);
  } catch (err) {
    logError("GET /review/issues/:transactionId error:", err);
    return res.status(500).json({ error: "Failed to load review issues." });
  }
});

router.post("/issues", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = String(req.body?.transaction_id || "").trim();
    const issueCode = normalizeIssueCode(req.body?.issue_code);
    const issueSeverity = String(req.body?.issue_severity || "warning").trim().toLowerCase();
    const issueStatus = String(req.body?.issue_status || "open").trim().toLowerCase();
    const reviewNotes = String(req.body?.review_notes || "").trim() || null;

    if (!isUuid(transactionId)) {
      return res.status(400).json({ error: "transaction_id must be a valid UUID." });
    }
    if (!issueCode) {
      return res.status(400).json({ error: "issue_code is required." });
    }
    if (!VALID_ISSUE_SEVERITIES.has(issueSeverity)) {
      return res.status(400).json({ error: "issue_severity must be warning or hard." });
    }
    if (!VALID_ISSUE_STATUSES.has(issueStatus)) {
      return res.status(400).json({ error: "issue_status must be open, resolved, or waived." });
    }

    const txCheck = await pool.query(
      `SELECT id FROM transactions WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [transactionId, businessId]
    );
    if (!txCheck.rowCount) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    const result = await pool.query(
      `INSERT INTO transaction_review_states (
         id, transaction_id, business_id, issue_code, issue_severity, issue_status,
         review_notes, created_by_user_id, resolved_by_user_id, resolved_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5,
         $6, $7, CASE WHEN $5 IN ('resolved', 'waived') THEN $7 ELSE NULL END,
         CASE WHEN $5 IN ('resolved', 'waived') THEN NOW() ELSE NULL END
       )
       RETURNING id, transaction_id, issue_code, issue_severity, issue_status, review_notes, resolved_at, updated_at, created_at`,
      [transactionId, businessId, issueCode, issueSeverity, issueStatus, reviewNotes, req.user.id]
    );
    return res.status(201).json({
      ...result.rows[0],
      created_by_name: req.user.display_name || req.user.full_name || req.user.email || "",
      resolved_by_name: issueStatus === "resolved" || issueStatus === "waived"
        ? (req.user.display_name || req.user.full_name || req.user.email || "")
        : ""
    });
  } catch (err) {
    logError("POST /review/issues error:", err);
    return res.status(500).json({ error: "Failed to save review issue." });
  }
});

router.patch("/issues/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const issueId = String(req.params.id || "").trim();
    const issueStatus = req.body?.issue_status == null
      ? null
      : String(req.body.issue_status).trim().toLowerCase();
    const reviewNotes = req.body?.review_notes == null
      ? null
      : String(req.body.review_notes).trim();

    if (!isUuid(issueId)) {
      return res.status(400).json({ error: "Invalid review issue ID." });
    }
    if (issueStatus && !VALID_ISSUE_STATUSES.has(issueStatus)) {
      return res.status(400).json({ error: "issue_status must be open, resolved, or waived." });
    }

    const result = await pool.query(
      `UPDATE transaction_review_states
          SET issue_status = COALESCE($1, issue_status),
              review_notes = COALESCE($2, review_notes),
              resolved_by_user_id = CASE
                WHEN COALESCE($1, issue_status) IN ('resolved', 'waived') THEN $3
                ELSE NULL
              END,
              resolved_at = CASE
                WHEN COALESCE($1, issue_status) IN ('resolved', 'waived') THEN NOW()
                ELSE NULL
              END,
              updated_at = NOW()
        WHERE id = $4
          AND business_id = $5
        RETURNING id, transaction_id, issue_code, issue_severity, issue_status, review_notes, resolved_at, updated_at, created_at`,
      [issueStatus, reviewNotes || null, req.user.id, issueId, businessId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Review issue not found." });
    }
    return res.json({
      ...result.rows[0],
      created_by_name: "",
      resolved_by_name: result.rows[0].issue_status === "resolved" || result.rows[0].issue_status === "waived"
        ? (req.user.display_name || req.user.full_name || req.user.email || "")
        : ""
    });
  } catch (err) {
    logError("PATCH /review/issues/:id error:", err);
    return res.status(500).json({ error: "Failed to update review issue." });
  }
});

module.exports = router;
