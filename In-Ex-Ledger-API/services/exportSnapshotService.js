"use strict";

const crypto = require("crypto");
const { pool } = require("../db.js");

const DATASET_SCHEMA_VERSION = "cpa-export-dataset/v1";
const RULE_VERSION = "2026-05-23";
const VALID_EXPORT_MODES = new Set(["draft", "workpaper", "finalized"]);

function normalizeExportMode(value, fallback = "workpaper") {
  const normalized = String(value || "").trim().toLowerCase();
  return VALID_EXPORT_MODES.has(normalized) ? normalized : fallback;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(value[key]);
    return acc;
  }, {});
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(sortObjectKeys(value))).digest("hex");
}

function pushIssue(target, issue) {
  target.push({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    count: Number(issue.count) || 0
  });
}

function buildBusinessProfileSummary(business = {}, jurisdiction = "US") {
  const missingFieldKeys = [];

  if (!String(business.name || "").trim()) missingFieldKeys.push("name");
  if (!String(business.business_type || "").trim()) missingFieldKeys.push("business_type");
  if (!String(business.business_activity_code || "").trim()) missingFieldKeys.push("business_activity_code");
  if (!String(business.accounting_method || "").trim()) missingFieldKeys.push("accounting_method");
  if (!String(business.fiscal_year_start || "").trim()) missingFieldKeys.push("fiscal_year_start");

  if (jurisdiction === "US" && typeof business.material_participation !== "boolean") {
    missingFieldKeys.push("material_participation");
  }

  if (jurisdiction === "CA" && business.gst_hst_registered === true && !String(business.gst_hst_number || "").trim()) {
    missingFieldKeys.push("gst_hst_number");
  }

  return {
    exportIdentityComplete: missingFieldKeys.length === 0,
    missingFieldKeys
  };
}

function deriveFinalizationDecision({
  dataset,
  business = {},
  requestedMode = "workpaper",
  exportFormat = "pdf",
  jurisdiction = "US",
  certifiedByUser = false,
  includeTaxId = false
}) {
  const hardBlockers = [];
  const warnings = [];
  const rows = Array.isArray(dataset?.includedRows) ? dataset.includedRows : [];
  const totals = dataset?.totals || {};
  const supportSummary = dataset?.supportSummary || {};
  const profile = buildBusinessProfileSummary(business, jurisdiction);

  if (!profile.exportIdentityComplete) {
    pushIssue(hardBlockers, {
      code: "business_profile_incomplete",
      severity: "hard",
      message: `Business profile is incomplete: ${profile.missingFieldKeys.join(", ")}`,
      count: profile.missingFieldKeys.length
    });
  }

  if (Number(totals.needsCategoryCount || 0) > 0) {
    pushIssue(hardBlockers, {
      code: "needs_category",
      severity: "hard",
      message: "Some transactions still need a real category assignment.",
      count: totals.needsCategoryCount
    });
  }

  if (Number(totals.trulyUnmappedCount || 0) > 0) {
    pushIssue(hardBlockers, {
      code: "truly_unmapped_transactions",
      severity: "hard",
      message: "Some categorized transactions still remain truly unmapped for filing.",
      count: totals.trulyUnmappedCount
    });
  }

  const missingDescriptionCount = rows.filter((row) => !String(row.description || "").trim()).length;
  if (missingDescriptionCount > 0) {
    pushIssue(hardBlockers, {
      code: "missing_description",
      severity: "hard",
      message: "Some included transactions are missing a usable description or payee narrative.",
      count: missingDescriptionCount
    });
  }

  const supportRiskCount = rows.filter((row) => Array.isArray(row.reviewFlags) && row.reviewFlags.some((flag) => (
    ["RS", "BP", "AL", "ML", "HO", "CA", "FC", "RV"].includes(flag)
  ))).length;
  if (supportRiskCount > 0) {
    pushIssue(hardBlockers, {
      code: "support_follow_up_required",
      severity: "hard",
      message: "Some included transactions still require support, allocation, or final reviewer confirmation.",
      count: supportRiskCount
    });
  }

  const missingPayerCount = rows.filter((row) => row.rawType === "income" && !String(row.payerName || "").trim()).length;
  if (missingPayerCount > 0) {
    pushIssue(warnings, {
      code: "missing_payer_name",
      severity: "warning",
      message: "Some income transactions do not include a payer name.",
      count: missingPayerCount
    });
  }

  if (includeTaxId && !certifiedByUser) {
    pushIssue(hardBlockers, {
      code: "tax_id_certification_required",
      severity: "hard",
      message: "User certification is required before including Tax ID in an export.",
      count: 1
    });
  }

  if (requestedMode === "finalized" && !certifiedByUser) {
    pushIssue(hardBlockers, {
      code: "finalization_certification_required",
      severity: "hard",
      message: "User certification is required before a package can be finalized.",
      count: 1
    });
  }

  const eligibleForFinalization = hardBlockers.length === 0;

  return {
    requestedMode,
    resolvedMode: requestedMode === "finalized" && !eligibleForFinalization ? "workpaper" : requestedMode,
    exportFormat,
    jurisdiction,
    eligibleForFinalization,
    hardBlockers,
    warnings,
    materialityPolicy: {
      missingDescriptionsAreHardBlockers: true,
      supportRiskTransactions: Number(supportSummary.mappedReviewCount || 0),
      warningCount: warnings.length
    },
    certification: {
      required: requestedMode === "finalized" || includeTaxId,
      acknowledged: certifiedByUser === true
    },
    businessProfile: profile
  };
}

function uniqueIds(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

async function createExportSnapshot({
  exportId,
  businessId,
  userId,
  exportMode,
  exportFormat,
  jurisdiction,
  startDate,
  endDate,
  datasetHash,
  certifiedByUser = false,
  includedTransactionIds = [],
  includedArtifactIds = [],
  executor = pool
}) {
  const snapshotId = crypto.randomUUID();
  const itemRows = [
    ...uniqueIds(includedTransactionIds).map((itemId) => ({
      itemType: "transaction",
      itemId
    })),
    ...uniqueIds(includedArtifactIds).map((itemId) => ({
      itemType: "artifact",
      itemId
    }))
  ];

  await executor.query(
    `INSERT INTO export_snapshots (
       id, export_id, business_id, generated_by_user_id, export_mode, export_format,
       jurisdiction, start_date, end_date, dataset_schema_version, rule_version,
       dataset_hash, status, certified_by_user, certified_at, certified_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12, 'snapshotted', $13, CASE WHEN $13 THEN NOW() ELSE NULL END, CASE WHEN $13 THEN $4 ELSE NULL END
     )`,
    [
      snapshotId,
      exportId || null,
      businessId,
      userId || null,
      exportMode,
      exportFormat,
      jurisdiction,
      startDate,
      endDate,
      DATASET_SCHEMA_VERSION,
      RULE_VERSION,
      datasetHash,
      certifiedByUser === true
    ]
  );

  if (itemRows.length) {
    const values = [];
    const placeholders = itemRows.map((row, index) => {
      const id = crypto.randomUUID();
      const base = index * 5;
      const itemHash = hashValue({ itemType: row.itemType, itemId: row.itemId });
      values.push(id, snapshotId, row.itemType, row.itemId, itemHash);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    await executor.query(
      `INSERT INTO export_snapshot_items (id, snapshot_id, item_type, item_id, item_hash)
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }

  return snapshotId;
}

async function invalidateSnapshotsForBusiness({
  businessId,
  reason,
  executor = pool
}) {
  if (!businessId) return 0;
  const result = await executor.query(
    `UPDATE export_snapshots
        SET status = 'invalidated',
            invalidated_at = COALESCE(invalidated_at, NOW()),
            invalidation_reason = COALESCE($2, invalidation_reason, 'Underlying source data changed after export.')
      WHERE business_id = $1
        AND status <> 'invalidated'`,
    [businessId, reason || null]
  );
  return Number(result.rowCount || 0);
}

module.exports = {
  DATASET_SCHEMA_VERSION,
  RULE_VERSION,
  hashValue,
  normalizeExportMode,
  deriveFinalizationDecision,
  createExportSnapshot,
  invalidateSnapshotsForBusiness
};
