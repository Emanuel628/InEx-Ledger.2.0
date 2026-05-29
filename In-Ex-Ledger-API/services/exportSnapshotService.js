"use strict";

const crypto = require("crypto");
const { pool } = require("../db.js");
const { clearExportStaleReminderState, sendExportStaleEmail } = require("./exportEmailService.js");

const DATASET_SCHEMA_VERSION = "cpa-export-dataset/v1";
const RULE_VERSION = "2026-05-23";
const VALID_EXPORT_MODES = new Set(["draft", "workpaper", "finalized"]);
const ISSUE_LABELS = {
  needs_category: "Some transactions still need a real category assignment.",
  needs_tax_mapping: "Some transactions still remain unmapped to a filing line.",
  final_confirmation_needed: "Some transactions still need final reviewer confirmation.",
  needs_receipt_support: "Some transactions still need receipt or source support.",
  needs_business_purpose: "Some transactions still need documented business purpose.",
  needs_allocation: "Some transactions still need business-use allocation support.",
  needs_mileage_log: "Some transactions still need mileage log support.",
  needs_home_office_support: "Some transactions still need home-office support.",
  needs_capital_asset_review: "Some transactions still need capital asset review.",
  missing_description: "Some transactions are missing usable description detail.",
  cpa_review_required: "Some transactions still require CPA review.",
  reviewer_note: "Open reviewer notes remain on the package."
};
const INVALIDATION_REASON_MAP = [
  {
    match: /transactions changed after export/i,
    code: "transactions",
    label: "Transactions",
    nextStep: "Review edited, deleted, or newly imported transactions and regenerate the package."
  },
  {
    match: /receipt evidence changed after export/i,
    code: "receipts",
    label: "Receipt evidence",
    nextStep: "Review receipt attachments on included transactions and regenerate the package."
  },
  {
    match: /support artifacts changed after export/i,
    code: "support_artifacts",
    label: "Support artifacts",
    nextStep: "Review linked support files or notes and regenerate the package."
  },
  {
    match: /category mappings changed after export/i,
    code: "categories",
    label: "Category mappings",
    nextStep: "Review category assignments or tax mappings and regenerate the package."
  },
  {
    match: /capital asset schedules changed after export/i,
    code: "capital_assets",
    label: "Capital assets",
    nextStep: "Review capital asset schedules and regenerate the package."
  },
  {
    match: /business filing profile changed after export/i,
    code: "business_profile",
    label: "Business filing profile",
    nextStep: "Review filing profile details in Settings and regenerate the package."
  },
  {
    match: /mileage or vehicle support changed after export/i,
    code: "mileage",
    label: "Mileage and vehicle support",
    nextStep: "Review mileage or vehicle support entries and regenerate the package."
  },
  {
    match: /vehicle claim details changed after export/i,
    code: "vehicle_claims",
    label: "Vehicle claim details",
    nextStep: "Review vehicle claim details and regenerate the package."
  }
];

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

function summarizeInvalidationReason(reason) {
  const text = String(reason || "").trim()
    || "Underlying source data changed after export.";
  const match = INVALIDATION_REASON_MAP.find((entry) => entry.match.test(text));
  if (match) {
    return {
      code: match.code,
      label: match.label,
      reason: text,
      nextStep: match.nextStep
    };
  }
  return {
    code: "generic",
    label: "Source data",
    reason: text,
    nextStep: "Review the underlying source data changes and regenerate the package."
  };
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
  const profile = buildBusinessProfileSummary(business, jurisdiction);

  if (!profile.exportIdentityComplete) {
    pushIssue(hardBlockers, {
      code: "business_profile_incomplete",
      severity: "hard",
      message: `Business profile is incomplete: ${profile.missingFieldKeys.join(", ")}`,
      count: profile.missingFieldKeys.length
    });
  }

  const openIssuesByCode = new Map();
  for (const row of rows) {
    for (const issue of row.reviewIssueEntries || []) {
      if (String(issue?.status || "open").trim().toLowerCase() !== "open") continue;
      const code = String(issue.issueCode || "").trim();
      if (!code) continue;
      const current = openIssuesByCode.get(code) || { count: 0, severity: issue.severity === "hard" ? "hard" : "warning" };
      current.count += 1;
      if (issue.severity === "hard") current.severity = "hard";
      openIssuesByCode.set(code, current);
    }
  }

  for (const [code, issue] of openIssuesByCode.entries()) {
    const target = issue.severity === "hard" ? hardBlockers : warnings;
    pushIssue(target, {
      code,
      severity: issue.severity,
      message: ISSUE_LABELS[code] || code.replace(/_/g, " "),
      count: issue.count
    });
  }

  if (!openIssuesByCode.size) {
    const missingDescriptionCount = rows.filter((row) => !String(row.description || "").trim()).length;
    if (missingDescriptionCount > 0) {
      pushIssue(hardBlockers, {
        code: "missing_description",
        severity: "hard",
        message: ISSUE_LABELS.missing_description,
        count: missingDescriptionCount
      });
    }
  }

  const missingPayerCount = rows.filter((row) => row.rawType === "income" && !String(row.payerName || "").trim()).length;
  if (missingPayerCount > 0 && !openIssuesByCode.has("missing_payer_name")) {
    pushIssue(warnings, {
      code: "missing_payer_name",
      severity: "warning",
      message: "Some income transactions do not include a payer name.",
      count: missingPayerCount
    });
  }

  if (Number(totals.openHardReviewerIssueCount || 0) > 0 || Number(totals.openWarningReviewerIssueCount || 0) > 0) {
    // counts already represented via issueEntries above; this branch only preserves summary policy fields
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

  const dedupedHardBlockers = Array.from(new Map(hardBlockers.map((issue) => [issue.code, issue])).values());
  const dedupedWarnings = Array.from(new Map(warnings.map((issue) => [issue.code, issue])).values());
  const eligibleForFinalization = dedupedHardBlockers.length === 0;

  return {
    requestedMode,
    resolvedMode: requestedMode === "finalized" && !eligibleForFinalization ? "workpaper" : requestedMode,
    exportFormat,
    jurisdiction,
    eligibleForFinalization,
    hardBlockers: dedupedHardBlockers,
    warnings: dedupedWarnings,
    materialityPolicy: {
      openHardReviewerIssueCount: Number(totals.openHardReviewerIssueCount || 0),
      openWarningReviewerIssueCount: Number(totals.openWarningReviewerIssueCount || 0),
      warningCount: dedupedWarnings.length
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
       $12, 'snapshotted', $13, CASE WHEN $13::boolean THEN NOW() ELSE NULL END, CASE WHEN $13::boolean THEN $4::uuid ELSE NULL END
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

  await clearExportStaleReminderState(businessId, executor).catch(() => {});

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
  if (Number(result.rowCount || 0) > 0) {
    await sendExportStaleEmail({
      businessId,
      reason: reason || null
    }, { db: executor }).catch(() => {});
  }
  return Number(result.rowCount || 0);
}

module.exports = {
  DATASET_SCHEMA_VERSION,
  RULE_VERSION,
  hashValue,
  normalizeExportMode,
  summarizeInvalidationReason,
  deriveFinalizationDecision,
  createExportSnapshot,
  invalidateSnapshotsForBusiness
};
