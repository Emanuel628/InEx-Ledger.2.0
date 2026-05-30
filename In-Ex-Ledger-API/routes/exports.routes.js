const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const {
  createExportGrantLimiter,
  createSecureExportLimiter
} = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { issueExportGrant, verifyExportGrant } = require("../services/exportGrantService.js");
const { saveRedactedPdf, buildRedactedStream, deleteExportFile } = require("../services/exportStorage.js");
const { decryptJwe } = require("../services/jweDecryptService.js");
const { decryptTaxId } = require("../services/taxIdService.js");
const { decryptGstHstNumber } = require("../services/gstHstNumberService.js");
const { __private: pdfPrivate } = require("../services/pdfGeneratorService.js");
const { generatePdfExportPair } = require("../services/exportOrchestrationService.js");
const { buildNormalizedExportDataset } = require("../services/exportDatasetService.js");
const {
  hashValue,
  normalizeExportMode,
  summarizeInvalidationReason,
  deriveFinalizationDecision,
  createExportSnapshot
} = require("../services/exportSnapshotService.js");
const { decrypt: decryptField } = require("../services/encryptionService.js");
const { buildCsvBundle } = require("../services/csvExportService.js");
const { buildQuickMethodSchedule } = require("../services/quickMethodService.js");
const {
  sendExportGeneratedEmail,
  sendExportFailedEmail
} = require("../services/exportEmailService.js");
const { pool } = require("../db.js");
const { logError, logInfo } = require("../utils/logger.js");
const { sanitizePayload } = require("../utils/logSanitizer.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");

const exportGrantLimiter = createExportGrantLimiter();
const secureExportLimiter = createSecureExportLimiter();

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

function requireEmailVerified(req, res, next) {
  if (!req.user?.email_verified) {
    return res.status(403).json({ error: "Verify your email before requesting exports." });
  }
  next();
}

router.use(requireEmailVerified);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_EXPORT_TYPES = new Set(["pdf", "csv_basic", "csv_full", "csv_excluded", "csv_category_summary"]);
const SSN_RE = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
const EIN_RE = /^(\d{2}-\d{7}|\d{9})$/;
const SIN_RE = /^(\d{3}-\d{3}-\d{3}|\d{9})$/;
const BN_RE = /^(\d{9}|(?:\d{9}[A-Za-z]{2}\d{4})|(?:\d{9}\s?[A-Za-z]{2}\s?\d{4})|(?:\d{9}-[A-Za-z]{2}-\d{4}))$/;

function validateDateRange(range) {
  if (!range || typeof range !== "object") return null;
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) return null;
  if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

function isValidTaxId(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  return SSN_RE.test(trimmed) || EIN_RE.test(trimmed) || SIN_RE.test(trimmed) || BN_RE.test(trimmed);
}

function resolveSecureExportTaxId(body, includeTaxId) {
  if (!includeTaxId) {
    return "";
  }

  const encryptedTaxId = String(body?.taxId_jwe || "").trim();
  if (!encryptedTaxId) {
    const exportError = new Error("taxId_jwe is required when includeTaxId is true.");
    exportError.status = 400;
    throw exportError;
  }

  let decryptedTaxId = "";
  try {
    decryptedTaxId = decryptJwe(encryptedTaxId);
  } catch (error) {
    logError("Secure export JWE decrypt failed", { err: error.message });
    const exportError = new Error("Unable to decrypt Tax ID for secure export.");
    exportError.status = 400;
    throw exportError;
  }

  if (!isValidTaxId(decryptedTaxId)) {
    const exportError = new Error("Invalid Tax ID format.");
    exportError.status = 400;
    throw exportError;
  }

  return decryptedTaxId;
}

function buildExportMetadataRows(exportId, metadata) {
  return [
    ["start_date", metadata.startDate],
    ["end_date", metadata.endDate],
    ["include_tax_id", metadata.includeTaxId ? "true" : "false"],
    ["grant_jti", metadata.grantJti || ""],
    ["content_hash", metadata.contentHash || ""],
    ["file_path", metadata.filePath || ""],
    ["language", metadata.language || "en"],
    ["currency", metadata.currency || "USD"],
    ["page_count", String(Number(metadata.pageCount) || 0)],
    ["scope", metadata.scope || "active"],
    ["filename", metadata.filename || ""],
    ["notes", metadata.notes || ""],
    ["full_version_available", metadata.fullVersionAvailable ? "true" : "false"]
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [crypto.randomUUID(), exportId, key, String(value)]);
}

function inferQuickMethodSupplyType(transactions = [], categories = [], businessActivityCode = "") {
  const categoriesById = new Map((categories || []).map((category) => [category.id, category]));
  const incomeTransactions = (transactions || []).filter((row) => String(row.type || "").toLowerCase() === "income");
  const detectedTypes = new Set();

  incomeTransactions.forEach((row) => {
    const category = categoriesById.get(row.category_id);
    const taxKey = String(category?.tax_map_ca || category?.tax_map_us || "").trim().toLowerCase();
    const name = String(category?.name || row.description || "").trim().toLowerCase();
    if (["t4a_20", "nonemployee_compensation", "service_revenue"].includes(taxKey) || /(service|consult|design|repair|freelance|commission)/i.test(name)) {
      detectedTypes.add("services");
    } else if (["sales", "sales_revenue", "gross_receipts_sales"].includes(taxKey) || /(sale|retail|shop|store|inventory|product)/i.test(name)) {
      detectedTypes.add("goods");
    }
  });

  if (detectedTypes.size === 1) {
    return {
      supplyType: Array.from(detectedTypes)[0],
      source: "income_category_mapping",
      warning: null
    };
  }

  const naicsSector = String(businessActivityCode || "").replace(/\D+/g, "").slice(0, 2);
  if (["11", "21", "22", "23", "31", "32", "33", "42", "44", "45"].includes(naicsSector)) {
    return {
      supplyType: "goods",
      source: "naics_inference",
      warning: "Supply type was inferred from the business activity code. Confirm the CRA Quick Method rate with your preparer."
    };
  }
  if (["48", "49", "51", "52", "53", "54", "55", "56", "61", "62", "71", "72", "81"].includes(naicsSector)) {
    return {
      supplyType: "services",
      source: "naics_inference",
      warning: "Supply type was inferred from the business activity code. Confirm the CRA Quick Method rate with your preparer."
    };
  }

  return {
    supplyType: null,
    source: "unknown",
    warning: "Supply type could not be safely inferred from the current ledger data."
  };
}

function createPdfReportId(rawDate = new Date()) {
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  return `EXP-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function buildCsvFilename(exportType, startDate, endDate) {
  const suffixMap = {
    csv_basic: "basic-ledger",
    csv_full: "cpa-workpaper",
    csv_excluded: "excluded-items",
    csv_category_summary: "category-summary"
  };
  const suffix = suffixMap[exportType] || "export";
  return `inex-ledger-${suffix}-${startDate}_to_${endDate}.csv`;
}

async function fetchUserDisplayName(userId) {
  if (!userId) return "";
  const result = await pool.query(
    `SELECT COALESCE(display_name, full_name, email) AS name
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return String(result.rows[0]?.name || "").trim();
}

function collectExportArtifactIds(sourceRows = {}) {
  const artifactIds = [];
  for (const receipt of sourceRows.receipts || []) {
    if (receipt?.id) artifactIds.push(receipt.id);
  }
  const supportArtifactMap = sourceRows.supportArtifactMap;
  if (supportArtifactMap instanceof Map) {
    for (const artifacts of supportArtifactMap.values()) {
      for (const artifact of artifacts || []) {
        if (artifact?.id) artifactIds.push(artifact.id);
      }
    }
  }
  return Array.from(new Set(artifactIds));
}

async function fetchExportSourceRows(businessId, startDate, endDate) {
  const taxYear = Number(String(endDate || "").slice(0, 4)) || new Date().getFullYear();

  const [txResult, accountResult, categoryResult, receiptResult, mileageResult, vehicleCostResult, bizResult, vehicleClaimResult, capitalAssetResult, supportArtifactResult, reviewStateResult] =
    await Promise.all([
      pool.query(
        `SELECT id, account_id, category_id, amount, type, description, description_encrypted, date, note,
                currency, source_amount, exchange_rate, exchange_date, converted_amount, tax_treatment,
                indirect_tax_amount, indirect_tax_recoverable, personal_use_pct,
                review_status, review_notes, payer_name, tax_form_type
         FROM transactions
         WHERE business_id = $1
           AND date >= $2 AND date <= $3
           AND deleted_at IS NULL
           AND (is_void = false OR is_void IS NULL)
           AND (is_adjustment = false OR is_adjustment IS NULL)
         ORDER BY date ASC, created_at ASC`,
        [businessId, startDate, endDate]
      ),
      pool.query(`SELECT id, name, type FROM accounts WHERE business_id = $1`, [businessId]),
      pool.query(`SELECT id, name, kind, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1`, [businessId]),
      pool.query(
        `SELECT r.id, r.transaction_id, r.filename
         FROM receipts r
         JOIN transactions t ON t.id = r.transaction_id
         WHERE r.business_id = $1 AND t.date >= $2 AND t.date <= $3 AND t.deleted_at IS NULL`,
        [businessId, startDate, endDate]
      ),
      pool.query(
        `SELECT id, trip_date, purpose, destination, miles, km, odometer_start, odometer_end
         FROM mileage WHERE business_id = $1 AND trip_date >= $2 AND trip_date <= $3
         ORDER BY trip_date ASC`,
        [businessId, startDate, endDate]
      ),
      pool.query(
        `SELECT id, entry_type, entry_date, title, vendor, amount, notes, created_at
         FROM vehicle_costs
         WHERE business_id = $1 AND entry_date >= $2 AND entry_date <= $3
         ORDER BY entry_date ASC, created_at ASC`,
        [businessId, startDate, endDate]
      ),
      pool.query(
        `SELECT id, name, region, province, operating_name, business_activity_code,
                fiscal_year_start, address, tax_id, accounting_method,
                material_participation, gst_hst_registered, gst_hst_number, gst_hst_method,
                business_type
           FROM businesses WHERE id = $1`,
        [businessId]
      ),
      // Phase 2: vehicle claim details — join transactions to attach date + description for PDF rendering
      pool.query(
        `SELECT ved.*, t.date AS transaction_date, t.description AS description
         FROM vehicle_expense_details ved
         JOIN transactions t ON t.id = ved.transaction_id
         WHERE ved.business_id = $1
           AND t.date >= $2 AND t.date <= $3
           AND t.deleted_at IS NULL`,
        [businessId, startDate, endDate]
      ),
      // Phase 2: capital assets for the tax year derived from endDate
      pool.query(
        `SELECT * FROM capital_assets
         WHERE business_id = $1 AND tax_year = $2 AND is_disposed = FALSE
         ORDER BY purchase_date ASC, name ASC`,
        [businessId, taxYear]
      ),
      pool.query(
        `SELECT id, transaction_id, artifact_type, filename, mime_type, storage_path, review_status, notes, uploaded_at
           FROM support_artifacts
          WHERE business_id = $1
            AND transaction_id IS NOT NULL`,
        [businessId]
      ),
      pool.query(
        `SELECT trs.id, trs.transaction_id, trs.issue_code, trs.issue_severity, trs.issue_status,
                trs.review_notes, trs.resolved_at, trs.updated_at, trs.created_at,
                COALESCE(creator.display_name, creator.full_name, creator.email) AS created_by_name,
                COALESCE(resolver.display_name, resolver.full_name, resolver.email) AS resolved_by_name
           FROM transaction_review_states trs
           LEFT JOIN users creator ON creator.id = trs.created_by_user_id
           LEFT JOIN users resolver ON resolver.id = trs.resolved_by_user_id
          WHERE trs.business_id = $1`,
        [businessId]
      )
    ]);

  const transactions = txResult.rows.map((row) => {
    let resolvedDescription = row.description;
    if (row.description_encrypted) {
      try {
        resolvedDescription = decryptField(row.description_encrypted);
      } catch (decryptErr) {
        logError("Export: failed to decrypt description_encrypted for transaction", {
          transactionId: row.id,
          err: decryptErr.message
        });
        resolvedDescription = row.description;
      }
    }
    const { description_encrypted, ...rest } = row;
    return { ...rest, description: resolvedDescription };
  });

  // Build compliance maps keyed by transaction_id for O(1) lookup in the PDF engine
  const vehicleClaimMap = new Map(
    vehicleClaimResult.rows.map((row) => [row.transaction_id, row])
  );
  const capitalAssetTxMap = new Map(
    capitalAssetResult.rows
      .filter((row) => row.transaction_id)
      .map((row) => [row.transaction_id, row])
  );
  const supportArtifactMap = new Map();
  for (const row of supportArtifactResult.rows) {
    if (!row.transaction_id) continue;
    const current = supportArtifactMap.get(row.transaction_id) || [];
    current.push(row);
    supportArtifactMap.set(row.transaction_id, current);
  }

  return {
    transactions,
    accounts: accountResult.rows,
    categories: categoryResult.rows,
    receipts: receiptResult.rows,
    mileage: mileageResult.rows,
    vehicleCosts: vehicleCostResult.rows,
    business: bizResult.rows[0] || {},
    vehicleClaimMap,
    supportArtifactMap,
    reviewStateRows: reviewStateResult.rows,
    capitalAssets: capitalAssetResult.rows,
    capitalAssetTxMap,
    taxYear
  };
}

async function storeCompletedExport({
  businessId,
  userId,
  exportType = "pdf",
  startDate,
  endDate,
  includeTaxId,
  grantJti,
  contentHash,
  filePath,
  language,
  currency,
  pageCount,
  scope,
  filename,
  notes,
  fullVersionAvailable = false
}) {
  const exportId = crypto.randomUUID();
  const metadataRows = buildExportMetadataRows(exportId, {
    startDate,
    endDate,
    includeTaxId,
    grantJti,
    contentHash,
    filePath,
    language,
    currency,
    pageCount,
    scope,
    filename,
    notes,
    fullVersionAvailable
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO exports (id, business_id, user_id, export_type)
       VALUES ($1, $2, $3, $4)`,
      [exportId, businessId, userId, exportType]
    );

    if (metadataRows.length) {
      const values = [];
      const placeholders = metadataRows.map((row, index) => {
        const base = index * 4;
        values.push(...row);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });
      await client.query(
        `INSERT INTO export_metadata (id, export_id, key, value)
         VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
    return exportId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function persistSnapshotBestEffort(snapshotInput) {
  try {
    await createExportSnapshot(snapshotInput);
  } catch (error) {
    logError("Export snapshot persistence skipped", { err: error.message, exportId: snapshotInput?.exportId || null });
  }
}

function normalizeExportHistoryEntry(entry) {
  return {
    id: entry.id,
    start_date: entry.start_date || null,
    end_date: entry.end_date || null,
    created_at: entry.created_at,
    export_type: entry.export_type || "pdf",
    include_tax_id: String(entry.include_tax_id || "").toLowerCase() === "true",
    content_hash: entry.content_hash || null,
    language: entry.language || "en",
    currency: entry.currency || "USD",
    page_count: Number(entry.page_count) || 0,
    scope: entry.scope || "active",
    filename: entry.filename || null,
    storage_type: "redacted-only",
    full_version_available: String(entry.full_version_available || "true").toLowerCase() !== "false",
    export_mode: entry.export_mode || "workpaper",
    snapshot_status: entry.snapshot_status || null,
    invalidated_at: entry.invalidated_at || null,
    invalidation_reason: entry.invalidation_reason || null
  };
}

router.post("/history", exportGrantLimiter, async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Export history requires an active Pro plan." });
    }
    const format = String(req.body?.format || "").toLowerCase();
    const dateRange = validateDateRange(req.body);
    const language = String(req.body?.language || "en").toLowerCase();
    const scope = req.body?.scope === "all" ? "all" : "active";
    const filename = String(req.body?.filename || "").trim();
    const batchMode = req.body?.batchMode === true;

    if (!dateRange) {
      return res.status(400).json({ error: "Valid startDate and endDate are required." });
    }
    if (!SUPPORTED_EXPORT_TYPES.has(format)) {
      return res.status(400).json({ error: "Unsupported export format." });
    }

    const exportId = await storeCompletedExport({
      businessId,
      userId: user.id,
      exportType: format,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      includeTaxId: false,
      grantJti: null,
      contentHash: null,
      filePath: null,
      language,
      currency: null,
      pageCount: 0,
      scope,
      filename,
      notes: batchMode ? "Client-generated batch export history entry" : "Client-generated export history entry",
      fullVersionAvailable: false
    });
    logInfo("Export history recorded", {
      userId: user.id,
      businessId,
      exportId,
      format,
      scope,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });

    return res.status(201).json({ id: exportId });
  } catch (err) {
    logError("Export history create error", { err: err.message });
    return res.status(500).json({ error: "Unable to record export history." });
  }
});

router.get("/tax-mapping-rules", exportGrantLimiter, async (_req, res) => {
  return res.json({
    source: "backend-authoritative",
    rules: pdfPrivate.getTaxMappingRules()
  });
});

// Lightweight dataset endpoint for the Compliance Dashboard UI.
// Returns normalized transaction rows with status flags without requiring a grant token.
router.get("/dataset", exportGrantLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const dateRange = validateDateRange({ startDate: req.query.startDate, endDate: req.query.endDate });
    if (!dateRange) {
      return res.status(400).json({ error: "startDate and endDate query parameters are required (YYYY-MM-DD)." });
    }
    const sourceRows = await fetchExportSourceRows(businessId, dateRange.startDate, dateRange.endDate);
    const business = sourceRows.business || {};
    const region = String(business.region || "us").toLowerCase();
    const jurisdiction = region === "ca" ? "CA" : "US";
    const categories = sourceRows.categories.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));
    const dataset = buildNormalizedExportDataset({
      transactions: sourceRows.transactions,
      accounts: sourceRows.accounts,
      categories,
      receipts: sourceRows.receipts,
      supportArtifactMap: sourceRows.supportArtifactMap,
      reviewStateRows: sourceRows.reviewStateRows,
      business,
      region,
      province: business.province || "",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });
    const finalization = deriveFinalizationDecision({
      dataset,
      business,
      requestedMode: "workpaper",
      exportFormat: "pdf",
      jurisdiction,
      certifiedByUser: false,
      includeTaxId: false
    });
    res.json({
      rows: dataset.rows,
      totals: dataset.totals,
      metadata: dataset.metadata,
      finalization
    });
  } catch (err) {
    logError("GET /exports/dataset error", { err: err.message });
    res.status(500).json({ error: "Failed to load compliance dataset." });
  }
});

router.post("/request-grant", exportGrantLimiter, async (req, res) => {
  const sanitizedBody = sanitizePayload(req.body);
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const exportType = (req.body?.exportType || "pdf").toLowerCase();
    const includeTaxId = Boolean(req.body?.includeTaxId);
    const dateRange = validateDateRange(req.body?.dateRange);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    if (!dateRange) {
      return res.status(400).json({ error: "Valid startDate and endDate are required." });
    }

    if (!SUPPORTED_EXPORT_TYPES.has(exportType)) {
      return res.status(400).json({ error: "Unsupported export type." });
    }

    if (exportType !== "csv_basic" && !hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Premium exports require an active InEx Ledger Pro plan." });
    }

    if (includeTaxId && exportType !== "pdf") {
      return res.status(400).json({ error: "Tax ID may only be requested for PDF exports." });
    }

    const metadata = {
      language: req.body?.language || "en",
      currency: req.body?.currency || "USD",
      templateVersion: req.body?.templateVersion || "v1"
    };

    const grant = await issueExportGrant({
      businessId,
      userId: user.id,
      exportType,
      includeTaxId,
      dateRange,
      metadata
    });

    return res.status(200).json({
      grantToken: grant.token,
      expiresAt: new Date(grant.expiresAt).toISOString()
    });
  } catch (err) {
    logError("Export grant error", { body: sanitizedBody, err: err.message });
    return res.status(500).json({ error: "Unable to issue export grant." });
  }
});

router.post("/generate", exportGrantLimiter, async (req, res) => {
  const token = req.body?.grantToken;
  if (!token) {
    return res.status(400).json({ error: "grantToken is required." });
  }

  let grantPayload;
  const sanitizedBody = sanitizePayload(req.body);
  try {
    grantPayload = await verifyExportGrant(token);
  } catch (err) {
    return res.status(401).json({ error: err.message || "Invalid grant token." });
  }

  if (!SUPPORTED_EXPORT_TYPES.has(String(grantPayload.exportType || "").toLowerCase())) {
    return res.status(400).json({ error: "Unsupported export type." });
  }

  if (grantPayload.includeTaxId && !req.body?.taxId_jwe) {
    return res.status(400).json({ error: "taxId_jwe is required when includeTaxId is true." });
  }

  const user = req.user;
  user.business_id = await resolveBusinessIdForUser(user);
  const businessId = user.business_id;

  if (grantPayload.businessId !== businessId || grantPayload.userId !== user.id) {
    return res.status(403).json({ error: "Grant token does not match requester." });
  }

  try {
    const grantStartDate = grantPayload.dateRange?.startDate;
    const grantEndDate = grantPayload.dateRange?.endDate;
    if (!DATE_PATTERN.test(grantStartDate) || !DATE_PATTERN.test(grantEndDate)) {
      return res.status(400).json({ error: "Grant token contains invalid date range." });
    }

    const exportType = String(grantPayload.exportType || "pdf").toLowerCase();
    const exportLang = grantPayload.metadata?.language || "en";
    const currency = grantPayload.metadata?.currency || "USD";
    const includeTaxId = grantPayload.includeTaxId;
    const requestedMode = normalizeExportMode(
      req.body?.exportMode,
      exportType === "pdf" ? "workpaper" : "draft"
    );

    const sourceRows = await fetchExportSourceRows(businessId, grantStartDate, grantEndDate);
    const business = sourceRows.business || {};
    const region = String(business.region || "us").toLowerCase();
    const jurisdiction = region === "ca" ? "CA" : "US";
    const categories = sourceRows.categories.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));

    const certifiedByUser = Boolean(req.body?.certifiedByUser);
    if (includeTaxId && !certifiedByUser) {
      return res.status(400).json({ error: "certifiedByUser must be acknowledged to include Tax ID in the export." });
    }

    const dataset = buildNormalizedExportDataset({
      transactions: sourceRows.transactions,
      accounts: sourceRows.accounts,
      categories,
      receipts: sourceRows.receipts,
      supportArtifactMap: sourceRows.supportArtifactMap,
      reviewStateRows: sourceRows.reviewStateRows,
      mileage: sourceRows.mileage,
      vehicleCosts: sourceRows.vehicleCosts,
      business,
      region,
      province: business.province || "",
      startDate: grantStartDate,
      endDate: grantEndDate,
      currency
    });
    const finalization = deriveFinalizationDecision({
      dataset,
      business,
      requestedMode,
      exportFormat: exportType === "pdf" ? "pdf" : "csv",
      jurisdiction,
      certifiedByUser,
      includeTaxId
    });
    if (requestedMode === "finalized" && !finalization.eligibleForFinalization) {
      return res.status(409).json({
        error: "This export is not eligible for finalized CPA package status yet.",
        finalization
      });
    }
    const datasetHash = hashValue({
      dataset,
      finalization,
      exportContext: {
        businessId,
        exportType,
        jurisdiction,
        startDate: grantStartDate,
        endDate: grantEndDate,
        language: exportLang,
        currency
      }
    });

    const taxId = resolveSecureExportTaxId(req.body, includeTaxId);

    const generatedAt = new Date().toISOString();
    const reportId = createPdfReportId(generatedAt);
    const actorDisplayName = await fetchUserDisplayName(user.id);

    // Phase 2: compute Quick Method remittance schedule if applicable
    let quickMethodSchedule = null;
    if (region === "ca" && business.gst_hst_registered === true && business.gst_hst_method === "quick") {
      try {
        const quickMethodSupply = inferQuickMethodSupplyType(sourceRows.transactions, categories, business.business_activity_code || "");
        const grossSalesInclTax = sourceRows.transactions
          .filter((t) => String(t.type || "").toLowerCase() === "income")
          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
        quickMethodSchedule = await buildQuickMethodSchedule({
          businessId,
          province: business.province || "ON",
          supplyType: quickMethodSupply.supplyType,
          supplyTypeSource: quickMethodSupply.source,
          taxYear: sourceRows.taxYear,
          grossSalesInclTax,
          businessActivityCode: business.business_activity_code || ""
        });
        if (quickMethodSchedule && quickMethodSupply.warning && !quickMethodSchedule.warning) {
          quickMethodSchedule.warning = quickMethodSupply.warning;
        }
      } catch (qmErr) {
        logError("Quick Method schedule computation failed (non-fatal)", { err: qmErr.message });
      }
    }

    const sharedOptions = {
      transactions: sourceRows.transactions,
      accounts: sourceRows.accounts,
      categories,
      receipts: sourceRows.receipts,
      supportArtifactMap: sourceRows.supportArtifactMap,
      mileage: sourceRows.mileage,
      vehicleCosts: sourceRows.vehicleCosts,
      startDate: grantStartDate,
      endDate: grantEndDate,
      exportLang,
      currency,
      businessName: business.name || "",
      legalName: business.name || "",
      operatingName: business.operating_name || "",
      entityType: business.business_type || "",
      naics: business.business_activity_code || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || "",
      storedTaxId: decryptTaxId(business.tax_id) || "",
      accountingMethod: business.accounting_method || "",
      materialParticipation: business.material_participation,
      gstHstRegistered: business.gst_hst_registered === true,
      gstHstNumber: decryptGstHstNumber(business.gst_hst_number) || "",
      gstHstMethod: business.gst_hst_method || "",
      generatedAt,
      reportId,
      region,
      province: business.province || "",
      // Phase 2 compliance data
      vehicleClaimMap: sourceRows.vehicleClaimMap,
      supportArtifactMap: sourceRows.supportArtifactMap,
      reviewStateRows: sourceRows.reviewStateRows,
      capitalAssets: sourceRows.capitalAssets,
      capitalAssetTxMap: sourceRows.capitalAssetTxMap,
      quickMethodSchedule,
      packageAttribution: {
        generatedByName: actorDisplayName,
        generatedAt,
        certifiedByName: certifiedByUser ? actorDisplayName : "",
        certifiedAt: certifiedByUser ? generatedAt : ""
      }
    };

    if (exportType !== "pdf") {
      if (includeTaxId) {
        return res.status(400).json({ error: "Tax ID may not be requested for CSV exports." });
      }

      const csvBuffer = buildCsvBundle(dataset, {
        exportType,
        includeBusiness: exportType !== "csv_basic"
      });
      const contentHash = crypto.createHash("sha256").update(csvBuffer).digest("hex");
      const filename = buildCsvFilename(exportType, grantStartDate, grantEndDate);
      const exportId = await storeCompletedExport({
        businessId,
        userId: user.id,
        exportType,
        startDate: grantStartDate,
        endDate: grantEndDate,
        includeTaxId: false,
        grantJti: grantPayload.jti,
        contentHash,
        filePath: null,
        language: exportLang,
        currency,
        pageCount: 0,
        scope: "active",
        filename,
        notes: "CSV generated via grant",
        fullVersionAvailable: false
      });
      await persistSnapshotBestEffort({
        exportId,
        businessId,
        userId: user.id,
        exportMode: finalization.resolvedMode,
        exportFormat: "csv",
        jurisdiction,
        startDate: grantStartDate,
        endDate: grantEndDate,
        datasetHash,
        certifiedByUser,
        includedTransactionIds: dataset.rows.map((row) => row.id),
        includedArtifactIds: collectExportArtifactIds(sourceRows)
      });
      logInfo("CSV export generated via grant", {
        userId: user.id,
        businessId,
        startDate: grantStartDate,
        endDate: grantEndDate,
        exportType
      });
      await sendExportGeneratedEmail({
        businessId,
        userId: user.id,
        exportType,
        startDate: grantStartDate,
        endDate: grantEndDate
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.send(csvBuffer);
    }

    const { fullBuffer: fullPdfBuffer, redactedBuffer, pageCount: pdfPageCount } =
      generatePdfExportPair({ sharedOptions, taxId });

    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${grantStartDate}_to_${grantEndDate}.pdf`;
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    const exportId = await storeCompletedExport({
      businessId,
      userId: user.id,
      exportType: "pdf",
      startDate: grantStartDate,
      endDate: grantEndDate,
      includeTaxId,
      grantJti: grantPayload.jti,
      contentHash: hash,
      filePath,
      language: exportLang,
      currency,
      pageCount: pdfPageCount,
      notes: "Generated via grant",
      fullVersionAvailable: false
    });
    await persistSnapshotBestEffort({
      exportId,
      businessId,
      userId: user.id,
      exportMode: finalization.resolvedMode,
      exportFormat: "pdf",
      jurisdiction,
      startDate: grantStartDate,
      endDate: grantEndDate,
      datasetHash,
      certifiedByUser,
      includedTransactionIds: dataset.rows.map((row) => row.id),
      includedArtifactIds: collectExportArtifactIds(sourceRows)
    });
    logInfo("Secure export PDF generated via grant", {
      userId: user.id,
      businessId,
      startDate: grantStartDate,
      endDate: grantEndDate,
      includeTaxId,
      exportLang
    });
    await sendExportGeneratedEmail({
      businessId,
      userId: user.id,
      exportType: "pdf",
      startDate: grantStartDate,
      endDate: grantEndDate
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(fullPdfBuffer);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({
        error: err.message,
        missingFields: Array.isArray(err.missingFields) ? err.missingFields : undefined,
        missingFieldKeys: Array.isArray(err.missingFieldKeys) ? err.missingFieldKeys : undefined
      });
    }
    await sendExportFailedEmail({
      businessId,
      userId: user?.id,
      exportType: grantPayload?.exportType || "pdf",
      startDate: grantPayload?.dateRange?.startDate || null,
      endDate: grantPayload?.dateRange?.endDate || null,
      reason: err.message
    });
    logError("Export generation error", { body: sanitizedBody, err: err.message });
    return res.status(500).json({ error: "Failed to generate export." });
  }
});

router.get("/history", exportGrantLimiter, async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Export history requires an active InEx Ledger Pro plan." });
    }
    const result = await pool.query(
      `SELECT e.id,
              e.created_at,
              e.export_type,
              m.start_date,
              m.end_date,
              m.include_tax_id,
              m.content_hash,
              m.language,
              COALESCE(m.currency, CASE WHEN b.region = 'CA' THEN 'CAD' ELSE 'USD' END) AS currency,
              m.page_count,
              m.scope,
              m.filename,
              m.full_version_available,
              s.export_mode,
              s.status AS snapshot_status,
              s.invalidated_at,
              s.invalidation_reason
         FROM exports e
         JOIN businesses b ON b.id = e.business_id
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'start_date' THEN value END) AS start_date,
                  MAX(CASE WHEN key = 'end_date' THEN value END) AS end_date,
                  MAX(CASE WHEN key = 'include_tax_id' THEN value END) AS include_tax_id,
                  MAX(CASE WHEN key = 'content_hash' THEN value END) AS content_hash,
                  MAX(CASE WHEN key = 'language' THEN value END) AS language,
                  MAX(CASE WHEN key = 'currency' THEN value END) AS currency,
                  MAX(CASE WHEN key = 'page_count' THEN value END) AS page_count,
                  MAX(CASE WHEN key = 'scope' THEN value END) AS scope,
                  MAX(CASE WHEN key = 'filename' THEN value END) AS filename,
                  MAX(CASE WHEN key = 'full_version_available' THEN value END) AS full_version_available
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
         LEFT JOIN LATERAL (
           SELECT export_mode, status, invalidated_at, invalidation_reason
             FROM export_snapshots
            WHERE export_id = e.id
            ORDER BY created_at DESC
            LIMIT 1
         ) s ON TRUE
        WHERE e.business_id = $1
        ORDER BY e.created_at DESC
        LIMIT 50`,
      [businessId]
    );
    const history = result.rows.map(normalizeExportHistoryEntry);
    return res.json(history);
  } catch (err) {
    logError("Export history error", { err: err.message });
    return res.status(500).json({ error: "Unable to load export history." });
  }
});

router.get("/history/:id/diagnostics", exportGrantLimiter, async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Export history requires an active InEx Ledger Pro plan." });
    }

    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT e.id,
              e.created_at,
              e.export_type,
              m.start_date,
              m.end_date,
              m.filename,
              m.language,
              COALESCE(m.currency, CASE WHEN b.region = 'CA' THEN 'CAD' ELSE 'USD' END) AS currency,
              m.page_count,
              s.id AS snapshot_id,
              s.export_mode,
              s.export_format,
              s.jurisdiction,
              s.start_date AS snapshot_start_date,
              s.end_date AS snapshot_end_date,
              s.status AS snapshot_status,
              s.invalidated_at,
              s.invalidation_reason,
              s.created_at AS snapshot_created_at,
              s.certified_at,
              s.dataset_schema_version,
              s.rule_version,
              COALESCE(generator.display_name, generator.full_name, generator.email) AS generated_by_name,
              COALESCE(certifier.display_name, certifier.full_name, certifier.email) AS certified_by_name,
              COALESCE(si.transaction_count, 0) AS transaction_count,
              COALESCE(si.artifact_count, 0) AS artifact_count
         FROM exports e
         JOIN businesses b ON b.id = e.business_id
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'start_date' THEN value END) AS start_date,
                  MAX(CASE WHEN key = 'end_date' THEN value END) AS end_date,
                  MAX(CASE WHEN key = 'filename' THEN value END) AS filename,
                  MAX(CASE WHEN key = 'language' THEN value END) AS language,
                  MAX(CASE WHEN key = 'currency' THEN value END) AS currency,
                  MAX(CASE WHEN key = 'page_count' THEN value END) AS page_count
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
         LEFT JOIN LATERAL (
           SELECT id, export_mode, export_format, jurisdiction, start_date, end_date, status,
                  invalidated_at, invalidation_reason, created_at, dataset_schema_version, rule_version,
                  generated_by_user_id, certified_at, certified_by_user_id
             FROM export_snapshots
            WHERE export_id = e.id
            ORDER BY created_at DESC
            LIMIT 1
         ) s ON TRUE
         LEFT JOIN users generator ON generator.id = s.generated_by_user_id
         LEFT JOIN users certifier ON certifier.id = s.certified_by_user_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE item_type = 'transaction') AS transaction_count,
                  COUNT(*) FILTER (WHERE item_type = 'artifact') AS artifact_count
             FROM export_snapshot_items
            WHERE snapshot_id = s.id
         ) si ON TRUE
        WHERE e.id = $1
          AND e.business_id = $2
        LIMIT 1`,
      [id, businessId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Export not found." });
    }

    const row = rows[0];
    const invalidation = summarizeInvalidationReason(row.invalidation_reason || "");
    return res.json({
      exportId: row.id,
      filename: row.filename || null,
      exportType: row.export_type || "pdf",
      exportMode: row.export_mode || "workpaper",
      status: row.snapshot_status || "current",
      generatedAt: row.created_at || row.snapshot_created_at || null,
      invalidatedAt: row.invalidated_at || null,
      dateRange: {
        startDate: row.start_date || row.snapshot_start_date || null,
        endDate: row.end_date || row.snapshot_end_date || null
      },
      jurisdiction: row.jurisdiction || null,
      language: row.language || "en",
      currency: row.currency || "USD",
      pageCount: Number(row.page_count) || 0,
      snapshot: {
        id: row.snapshot_id || null,
        datasetSchemaVersion: row.dataset_schema_version || null,
        ruleVersion: row.rule_version || null,
        generatedBy: row.generated_by_name || null,
        certifiedBy: row.certified_by_name || null,
        certifiedAt: row.certified_at || null,
        itemCounts: {
          transactions: Number(row.transaction_count) || 0,
          artifacts: Number(row.artifact_count) || 0
        }
      },
      invalidation: {
        code: invalidation.code,
        label: invalidation.label,
        reason: invalidation.reason,
        nextStep: invalidation.nextStep
      }
    });
  } catch (err) {
    logError("Export history diagnostics error", { err: err.message });
    return res.status(500).json({ error: "Unable to load export diagnostics." });
  }
});

router.get("/history/:id/redacted", exportGrantLimiter, async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Export history requires an active InEx Ledger Pro plan." });
    }
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT m.file_path
         FROM exports e
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'file_path' THEN value END) AS file_path
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
        WHERE e.id = $1
          AND e.business_id = $2
        LIMIT 1`,
      [id, businessId]
    );

    if (!rows.length || !rows[0].file_path) {
      return res.status(404).json({ error: "Export not found." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    logInfo("Redacted export downloaded", {
      userId: user.id,
      businessId,
      exportId: id
    });
    buildRedactedStream(res, rows[0].file_path);
  } catch (err) {
    if (err.message === "Redacted export not found." || err.message === "Invalid export path") {
      return res.status(404).json({ error: "Export file is no longer available. Please regenerate the export." });
    }
    logError("Redacted download error", { err: err.message });
    return res.status(500).json({ error: "Cannot download redacted export." });
  }
});

// POST /exports/secure-export — single-step secure PDF export for the Secure Export Modal.
// Accepts an encrypted tax ID (JWE) and date range, generates a PDF, and returns it directly.
// Sensitive fields (ssn, sin, taxId_jwe) are redacted from all log output.
router.post("/secure-export", secureExportLimiter, async (req, res) => {
  const sanitizedBody = sanitizePayload(req.body);
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;

    const dateRange = validateDateRange(req.body?.dateRange);
    if (!dateRange) {
      return res.status(400).json({ error: "Valid startDate and endDate are required." });
    }

    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "PDF exports require an active InEx Ledger Pro plan." });
    }

    const includeTaxId = Boolean(req.body?.includeTaxId);
    if (includeTaxId && !req.body?.taxId_jwe) {
      return res.status(400).json({ error: "taxId_jwe is required when includeTaxId is true." });
    }

    const exportLang = req.body?.language || "en";
    const currency = req.body?.currency || "USD";
    const requestedMode = normalizeExportMode(req.body?.exportMode, "workpaper");
    const certifiedByUser = Boolean(req.body?.certifiedByUser);
    if (includeTaxId && !certifiedByUser) {
      return res.status(400).json({ error: "certifiedByUser must be acknowledged to include Tax ID in the export." });
    }

    const [txResult, accountResult, categoryResult, receiptResult, mileageResult, bizResult, supportArtifactResult, reviewStateResult] =
      await Promise.all([
        pool.query(
          `SELECT id, account_id, category_id, amount, type, description, date, note,
                  currency, source_amount, exchange_rate, tax_treatment,
                  indirect_tax_amount, indirect_tax_recoverable, personal_use_pct,
                  review_status, payer_name, tax_form_type
           FROM transactions
           WHERE business_id = $1
             AND date >= $2 AND date <= $3
             AND deleted_at IS NULL
             AND (is_void = false OR is_void IS NULL)
             AND (is_adjustment = false OR is_adjustment IS NULL)
           ORDER BY date ASC, created_at ASC`,
          [businessId, dateRange.startDate, dateRange.endDate]
        ),
        pool.query(
          `SELECT id, name, type FROM accounts WHERE business_id = $1`,
          [businessId]
        ),
        pool.query(
          `SELECT id, name, kind, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1`,
          [businessId]
        ),
        pool.query(
          `SELECT r.id, r.transaction_id, r.filename
           FROM receipts r
           JOIN transactions t ON t.id = r.transaction_id
           WHERE r.business_id = $1
             AND t.date >= $2 AND t.date <= $3
             AND t.deleted_at IS NULL`,
          [businessId, dateRange.startDate, dateRange.endDate]
        ),
        pool.query(
          `SELECT id, trip_date, purpose, destination, miles, km, odometer_start, odometer_end
           FROM mileage
           WHERE business_id = $1
             AND trip_date >= $2 AND trip_date <= $3
           ORDER BY trip_date ASC`,
          [businessId, dateRange.startDate, dateRange.endDate]
        ),
        pool.query(
          `SELECT name, region, province, operating_name, business_activity_code,
                  fiscal_year_start, address, tax_id, accounting_method,
                  material_participation, gst_hst_registered, gst_hst_number, gst_hst_method,
                  business_type
             FROM businesses WHERE id = $1`,
          [businessId]
        ),
        pool.query(
          `SELECT id, transaction_id, artifact_type, filename, mime_type, storage_path, review_status, notes, uploaded_at
             FROM support_artifacts
            WHERE business_id = $1
              AND transaction_id IS NOT NULL`,
          [businessId]
        ),
        pool.query(
          `SELECT id, transaction_id, issue_code, issue_severity, issue_status, review_notes, resolved_at, updated_at
             FROM transaction_review_states
            WHERE business_id = $1`,
          [businessId]
        )
      ]);

    let vehicleCostResult = { rows: [] };
    try {
      vehicleCostResult = await pool.query(
        `SELECT id, entry_type, entry_date, title, vendor, amount, notes, created_at
         FROM vehicle_costs
         WHERE business_id = $1
           AND entry_date >= $2 AND entry_date <= $3
         ORDER BY entry_date ASC, created_at ASC`,
        [businessId, dateRange.startDate, dateRange.endDate]
      );
    } catch (vcErr) {
      logError("vehicle_costs query failed (migration pending?)", { err: vcErr.message });
    }

    const business = bizResult.rows[0] || {};
    const region = String(business.region || "us").toLowerCase();
    const jurisdiction = region === "ca" ? "CA" : "US";
    const categories = categoryResult.rows.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));
    const supportArtifactMap = new Map();
    for (const row of supportArtifactResult.rows) {
      if (!row.transaction_id) continue;
      const current = supportArtifactMap.get(row.transaction_id) || [];
      current.push(row);
      supportArtifactMap.set(row.transaction_id, current);
    }
    const dataset = buildNormalizedExportDataset({
      transactions: txResult.rows,
      accounts: accountResult.rows,
      categories,
      receipts: receiptResult.rows,
      supportArtifactMap,
      reviewStateRows: reviewStateResult.rows,
      mileage: mileageResult.rows,
      vehicleCosts: vehicleCostResult.rows,
      business,
      region,
      province: business.province || "",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      currency
    });
    const finalization = deriveFinalizationDecision({
      dataset,
      business,
      requestedMode,
      exportFormat: "pdf",
      jurisdiction,
      certifiedByUser,
      includeTaxId
    });
    if (requestedMode === "finalized" && !finalization.eligibleForFinalization) {
      return res.status(409).json({
        error: "This export is not eligible for finalized CPA package status yet.",
        finalization
      });
    }
    const datasetHash = hashValue({
      dataset,
      finalization,
      exportContext: {
        businessId,
        exportType: "pdf",
        jurisdiction,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        language: exportLang,
        currency
      }
    });

    const taxId = resolveSecureExportTaxId(req.body, includeTaxId);

    const generatedAt = new Date().toISOString();
    const reportId = createPdfReportId(generatedAt);

    const sharedOptions = {
      transactions: txResult.rows,
      accounts: accountResult.rows,
      categories,
      receipts: receiptResult.rows,
      supportArtifactMap,
      mileage: mileageResult.rows,
      vehicleCosts: vehicleCostResult.rows,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      exportLang,
      currency,
      businessName: business.name || "",
      legalName: business.name || "",
      operatingName: business.operating_name || "",
      entityType: business.business_type || "",
      naics: business.business_activity_code || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || "",
      storedTaxId: decryptTaxId(business.tax_id) || "",
      accountingMethod: business.accounting_method || "",
      materialParticipation: business.material_participation,
      gstHstRegistered: business.gst_hst_registered === true,
      gstHstNumber: decryptGstHstNumber(business.gst_hst_number) || "",
      gstHstMethod: business.gst_hst_method || "",
      generatedAt,
      reportId,
      region,
      province: business.province || ""
      ,
      reviewStateRows: reviewStateResult.rows
    };

    const { fullBuffer: fullPdfBuffer, redactedBuffer, pageCount: pdfPageCount } =
      generatePdfExportPair({ sharedOptions, taxId });

    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    const exportId = await storeCompletedExport({
      businessId,
      userId: user.id,
      exportType: "pdf",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      includeTaxId,
      grantJti: null,
      contentHash: hash,
      filePath,
      language: exportLang,
      currency,
      pageCount: pdfPageCount,
      notes: "Generated via secure export",
      fullVersionAvailable: false
    });
    await persistSnapshotBestEffort({
      exportId,
      businessId,
      userId: user.id,
      exportMode: finalization.resolvedMode,
      exportFormat: "pdf",
      jurisdiction,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      datasetHash,
      certifiedByUser,
      includedTransactionIds: dataset.rows.map((row) => row.id),
      includedArtifactIds: [
        ...receiptResult.rows.map((row) => row.id).filter(Boolean),
        ...supportArtifactResult.rows.map((row) => row.id).filter(Boolean)
      ]
    });
    logInfo("Secure export PDF generated", {
      userId: user.id,
      businessId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      includeTaxId,
      exportLang
    });
    await sendExportGeneratedEmail({
      businessId,
      userId: user.id,
      exportType: "pdf",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(fullPdfBuffer);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({
        error: err.message,
        missingFields: Array.isArray(err.missingFields) ? err.missingFields : undefined,
        missingFieldKeys: Array.isArray(err.missingFieldKeys) ? err.missingFieldKeys : undefined
      });
    }
    await sendExportFailedEmail({
      businessId,
      userId: user?.id,
      exportType: "pdf",
      startDate: req.body?.dateRange?.startDate || null,
      endDate: req.body?.dateRange?.endDate || null,
      reason: err.message
    });
    logError("Secure export error", { body: sanitizedBody, err: err.message });
    return res.status(500).json({ error: "Failed to generate secure export." });
  }
});

router.delete("/history/:id", exportGrantLimiter, async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;

    const { rows } = await pool.query(
      `SELECT m.file_path
         FROM exports e
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'file_path' THEN value END) AS file_path
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
        WHERE e.id = $1
          AND e.business_id = $2
        LIMIT 1`,
      [req.params.id, businessId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Export not found." });
    }

    if (rows[0].file_path) {
      await deleteExportFile(rows[0].file_path).catch(() => {});
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM export_metadata WHERE export_id = $1", [req.params.id]);
      await client.query("DELETE FROM exports WHERE id = $1 AND business_id = $2", [req.params.id, businessId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    logInfo("Export deleted", {
      userId: user.id,
      businessId,
      exportId: req.params.id
    });

    return res.json({ message: "Export deleted." });
  } catch (err) {
    logError("Export delete error", { err: err.message });
    return res.status(500).json({ error: "Failed to delete export." });
  }
});

module.exports = router;
