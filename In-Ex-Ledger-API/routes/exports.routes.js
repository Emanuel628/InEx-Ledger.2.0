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
const { buildPdfExport, buildPdfExportDocument, __private: pdfPrivate } = require("../services/pdfGeneratorService.js");
const { buildNormalizedExportDataset } = require("../services/exportDatasetService.js");
const { decrypt: decryptField } = require("../services/encryptionService.js");
const { buildCsvBundle } = require("../services/csvExportService.js");
const { buildQuickMethodSchedule } = require("../services/quickMethodService.js");
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

async function fetchExportSourceRows(businessId, startDate, endDate) {
  const taxYear = Number(String(endDate || "").slice(0, 4)) || new Date().getFullYear();

  const [txResult, accountResult, categoryResult, receiptResult, mileageResult, vehicleCostResult, bizResult, vehicleClaimResult, capitalAssetResult] =
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

  return {
    transactions,
    accounts: accountResult.rows,
    categories: categoryResult.rows,
    receipts: receiptResult.rows,
    mileage: mileageResult.rows,
    vehicleCosts: vehicleCostResult.rows,
    business: bizResult.rows[0] || {},
    vehicleClaimMap,
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
    full_version_available: String(entry.full_version_available || "true").toLowerCase() !== "false"
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
    const categories = sourceRows.categories.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));
    const dataset = buildNormalizedExportDataset({
      transactions: sourceRows.transactions,
      accounts: sourceRows.accounts,
      categories,
      receipts: sourceRows.receipts,
      business,
      region,
      province: business.province || "",
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    });
    res.json({ rows: dataset.rows, totals: dataset.totals, metadata: dataset.metadata });
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

    const sourceRows = await fetchExportSourceRows(businessId, grantStartDate, grantEndDate);
    const business = sourceRows.business || {};
    const region = String(business.region || "us").toLowerCase();
    const categories = sourceRows.categories.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));

    const taxId = resolveSecureExportTaxId(req.body, includeTaxId);

    const generatedAt = new Date().toISOString();
    const reportId = createPdfReportId(generatedAt);

    // Phase 2: compute Quick Method remittance schedule if applicable
    let quickMethodSchedule = null;
    if (region === "ca" && business.gst_hst_registered === true && business.gst_hst_method === "quick") {
      try {
        const grossSalesInclTax = sourceRows.transactions
          .filter((t) => String(t.type || "").toLowerCase() === "income")
          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
        quickMethodSchedule = await buildQuickMethodSchedule({
          businessId,
          province: business.province || "ON",
          supplyType: "services",
          taxYear: sourceRows.taxYear,
          grossSalesInclTax
        });
      } catch (qmErr) {
        logError("Quick Method schedule computation failed (non-fatal)", { err: qmErr.message });
      }
    }

    const sharedOptions = {
      transactions: sourceRows.transactions,
      accounts: sourceRows.accounts,
      categories,
      receipts: sourceRows.receipts,
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
      capitalAssets: sourceRows.capitalAssets,
      capitalAssetTxMap: sourceRows.capitalAssetTxMap,
      quickMethodSchedule
    };

    if (exportType !== "pdf") {
      if (includeTaxId) {
        return res.status(400).json({ error: "Tax ID may not be requested for CSV exports." });
      }

      const dataset = buildNormalizedExportDataset({
        transactions: sourceRows.transactions,
        accounts: sourceRows.accounts,
        categories,
        receipts: sourceRows.receipts,
        mileage: sourceRows.mileage,
        vehicleCosts: sourceRows.vehicleCosts,
        business,
        region,
        province: business.province || "",
        startDate: grantStartDate,
        endDate: grantEndDate,
        currency
      });
      const csvBuffer = buildCsvBundle(dataset, {
        exportType,
        includeBusiness: exportType !== "csv_basic"
      });
      const contentHash = crypto.createHash("sha256").update(csvBuffer).digest("hex");
      const filename = buildCsvFilename(exportType, grantStartDate, grantEndDate);
      await storeCompletedExport({
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
      logInfo("CSV export generated via grant", {
        userId: user.id,
        businessId,
        startDate: grantStartDate,
        endDate: grantEndDate,
        exportType
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.send(csvBuffer);
    }

    const fullPdf = buildPdfExportDocument({ ...sharedOptions, taxId });
    const redactedPdf = buildPdfExportDocument({ ...sharedOptions, taxId: "" });
    const fullPdfBuffer = fullPdf.buffer;
    const redactedBuffer = redactedPdf.buffer;

    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${grantStartDate}_to_${grantEndDate}.pdf`;
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    await storeCompletedExport({
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
      pageCount: redactedPdf.pageCount,
      notes: "Generated via grant",
      fullVersionAvailable: false
    });
    logInfo("Secure export PDF generated via grant", {
      userId: user.id,
      businessId,
      startDate: grantStartDate,
      endDate: grantEndDate,
      includeTaxId,
      exportLang
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
              m.full_version_available
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
    const templateVersion = req.body?.templateVersion || "v1";

    const [txResult, accountResult, categoryResult, receiptResult, mileageResult, bizResult] =
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
    const categories = categoryResult.rows.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));

    const taxId = resolveSecureExportTaxId(req.body, includeTaxId);

    const generatedAt = new Date().toISOString();
    const reportId = createPdfReportId(generatedAt);

    const sharedOptions = {
      transactions: txResult.rows,
      accounts: accountResult.rows,
      categories,
      receipts: receiptResult.rows,
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
    };

    const fullPdf = buildPdfExportDocument({ ...sharedOptions, taxId });
    const redactedPdf = buildPdfExportDocument({ ...sharedOptions, taxId: "" });
    const fullPdfBuffer = fullPdf.buffer;
    const redactedBuffer = redactedPdf.buffer;

    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    await storeCompletedExport({
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
      pageCount: redactedPdf.pageCount,
      notes: "Generated via secure export",
      fullVersionAvailable: false
    });
    logInfo("Secure export PDF generated", {
      userId: user.id,
      businessId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      includeTaxId,
      exportLang
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
