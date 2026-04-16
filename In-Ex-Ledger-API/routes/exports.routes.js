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
const { dispatchPdfJob } = require("../services/pdfWorkerClient.js");
const { saveRedactedPdf, buildRedactedStream } = require("../services/exportStorage.js");
const { pool } = require("../db.js");
const { logError } = require("../utils/logger.js");
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

function validateDateRange(range) {
  if (!range || typeof range !== "object") return null;
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) return null;
  if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
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
    ["notes", metadata.notes || ""],
    ["full_version_available", "true"]
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [crypto.randomUUID(), exportId, key, String(value)]);
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
  notes
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
    notes
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO exports (id, business_id, user_id, type)
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
    storage_type: "redacted-only",
    full_version_available: String(entry.full_version_available || "true").toLowerCase() !== "false"
  };
}

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

    if (exportType === "pdf" && !hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "PDF exports require an active InEx Ledger V1 plan." });
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

  if (grantPayload.action !== "generate_pdf") {
    return res.status(400).json({ error: "Only PDF generation is supported via this endpoint." });
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
    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${grantStartDate}_to_${grantEndDate}.pdf`;
    const job = {
      jobId,
      businessId,
      userId: user.id,
      startDate: grantStartDate,
      endDate: grantEndDate,
      includeTaxId: grantPayload.includeTaxId,
      taxId_jwe: grantPayload.includeTaxId ? req.body.taxId_jwe : undefined,
      exportLang: grantPayload.metadata?.language || "en",
      currency: grantPayload.metadata?.currency || "USD",
      templateVersion: grantPayload.metadata?.templateVersion || "v1"
    };

    const workerResult = await dispatchPdfJob(job);
    const redactedBuffer = workerResult.redactedPdfBuffer || Buffer.alloc(0);
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    await storeCompletedExport({
      businessId,
      userId: user.id,
      exportType: "pdf",
      startDate: grantStartDate,
      endDate: grantEndDate,
      includeTaxId: grantPayload.includeTaxId,
      grantJti: grantPayload.jti,
      contentHash: hash,
      filePath,
      language: job.exportLang,
      currency: job.currency,
      pageCount: Number(workerResult.metadata?.pageCount) || 0,
      notes: workerResult.metadata?.notes || "Generated via trusted worker"
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(workerResult.fullPdfBuffer);
  } catch (err) {
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
      return res.status(402).json({ error: "Export history requires an active InEx Ledger V1 plan." });
    }
    const result = await pool.query(
      `SELECT e.id,
              e.created_at,
              e.type AS export_type,
              m.start_date,
              m.end_date,
              m.include_tax_id,
              m.content_hash,
              m.language,
              COALESCE(m.currency, CASE WHEN b.region = 'CA' THEN 'CAD' ELSE 'USD' END) AS currency,
              m.page_count,
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
      return res.status(402).json({ error: "Export history requires an active InEx Ledger V1 plan." });
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
      return res.status(402).json({ error: "PDF exports require an active InEx Ledger V1 plan." });
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
                  review_status
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
          `SELECT name, region, province FROM businesses WHERE id = $1`,
          [businessId]
        )
      ]);

    const business = bizResult.rows[0] || {};
    const region = String(business.region || "us").toLowerCase();
    const categories = categoryResult.rows.map((c) => ({
      ...c,
      taxLabel: region === "ca" ? (c.tax_map_ca || "") : (c.tax_map_us || "")
    }));

    const jobId = crypto.randomUUID();
    const filename = `inex-ledger-export-${dateRange.startDate}_to_${dateRange.endDate}.pdf`;

    const job = {
      jobId,
      businessId,
      userId: user.id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      includeTaxId,
      taxId_jwe: includeTaxId ? req.body.taxId_jwe : undefined,
      exportLang,
      currency,
      templateVersion,
      businessName: business.name || "",
      region,
      province: business.province || "",
      transactions: txResult.rows,
      accounts: accountResult.rows,
      categories,
      receipts: receiptResult.rows,
      mileage: mileageResult.rows
    };

    const workerResult = await dispatchPdfJob(job);
    const redactedBuffer = workerResult.redactedPdfBuffer || Buffer.alloc(0);
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
      pageCount: Number(workerResult.metadata?.pageCount) || 0,
      notes: workerResult.metadata?.notes || "Generated via secure export modal"
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(workerResult.fullPdfBuffer);
  } catch (err) {
    logError("Secure export error", { body: sanitizedBody, err: err.message });
    return res.status(500).json({ error: "Failed to generate secure export." });
  }
});

module.exports = router;
