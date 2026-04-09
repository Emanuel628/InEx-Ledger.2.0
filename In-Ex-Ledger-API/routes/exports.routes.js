const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth.middleware.js");
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

const secureExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many export requests. Please try again later." }
});

const router = express.Router();
router.use(requireAuth);

function requireEmailVerified(req, res, next) {
  if (!req.user?.email_verified) {
    return res.status(403).json({ error: "Verify your email before requesting exports." });
  }
  next();
}

router.use(requireEmailVerified);

const EXPORT_TTL_MS = Number(process.env.EXPORT_GRANT_TTL_MS || 60_000);

function validateDateRange(range) {
  if (!range || typeof range !== "object") return null;
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

router.post("/exports/request-grant", async (req, res) => {
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

    const grant = issueExportGrant({
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

router.post("/exports/generate", async (req, res) => {
  const token = req.body?.grantToken;
  if (!token) {
    return res.status(400).json({ error: "grantToken is required." });
  }

  let grantPayload;
  const sanitizedBody = sanitizePayload(req.body);
  try {
    grantPayload = verifyExportGrant(token);
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
    const jobId = crypto.randomUUID();
    const filename = `luna-business-export-${grantPayload.dateRange.startDate}_to_${grantPayload.dateRange.endDate}.pdf`;
    const job = {
      jobId,
      businessId,
      userId: user.id,
      startDate: grantPayload.dateRange.startDate,
      endDate: grantPayload.dateRange.endDate,
      includeTaxId: grantPayload.includeTaxId,
      taxId_jwe: grantPayload.includeTaxId ? req.body.taxId_jwe : undefined,
      exportLang: grantPayload.metadata?.language || "en",
      currency: grantPayload.metadata?.currency || "USD",
      templateVersion: grantPayload.metadata?.templateVersion || "v1"
    };

    const workerResult = await dispatchPdfJob(job);
    const redactedBuffer = workerResult.redactedPdfBuffer || Buffer.alloc(0);
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    const exportId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO exports (id, business_id, user_id, export_type, start_date, end_date, include_tax_id, grant_jti, content_hash, file_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        exportId,
        businessId,
        user.id,
        "pdf",
        grantPayload.dateRange.startDate,
        grantPayload.dateRange.endDate,
        grantPayload.includeTaxId,
        grantPayload.jti,
        hash,
        filePath
      ]
    );

    const metadataId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO export_metadata (id, export_id, language, currency, page_count, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        metadataId,
        exportId,
        job.exportLang,
        job.currency,
        Number(workerResult.metadata?.pageCount) || 0,
        workerResult.metadata?.notes || "Generated via trusted worker"
      ]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(workerResult.fullPdfBuffer);
  } catch (err) {
    logError("Export generation error", { body: sanitizedBody, err: err.message });
    return res.status(500).json({ error: "Failed to generate export." });
  }
});

router.get("/exports/history", async (req, res) => {
  try {
    const user = req.user;
    user.business_id = await resolveBusinessIdForUser(user);
    const businessId = user.business_id;
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "pdf_exports")) {
      return res.status(402).json({ error: "Export history requires an active InEx Ledger V1 plan." });
    }
    const result = await pool.query(
      `SELECT e.id, e.start_date, e.end_date, e.created_at, e.export_type, e.include_tax_id,
              e.content_hash, e.file_path, m.language, m.currency, m.page_count
       FROM exports e
       LEFT JOIN export_metadata m ON m.export_id = e.id
       WHERE e.business_id = $1
       ORDER BY e.created_at DESC
       LIMIT 50`,
      [businessId]
    );
    const history = result.rows.map((entry) => ({
      ...entry,
      storage_type: "redacted-only",
      full_version_available: true
    }));
    return res.json(history);
  } catch (err) {
    logError("Export history error", { err: err.message });
    return res.status(500).json({ error: "Unable to load export history." });
  }
});

router.get("/exports/history/:id/redacted", async (req, res) => {
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
      `SELECT file_path FROM exports WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [id, businessId]
    );

    if (!rows.length) {
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
router.post("/exports/secure-export", secureExportLimiter, async (req, res) => {
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

    const jobId = crypto.randomUUID();
    const filename = `luna-business-export-${dateRange.startDate}_to_${dateRange.endDate}.pdf`;

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
      templateVersion
    };

    const workerResult = await dispatchPdfJob(job);
    const redactedBuffer = workerResult.redactedPdfBuffer || Buffer.alloc(0);
    const { filePath, hash } = await saveRedactedPdf(jobId, redactedBuffer);
    const exportId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO exports (id, business_id, user_id, export_type, start_date, end_date, include_tax_id, grant_jti, content_hash, file_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [exportId, businessId, user.id, "pdf", dateRange.startDate, dateRange.endDate, includeTaxId, null, hash, filePath]
    );

    const metadataId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO export_metadata (id, export_id, language, currency, page_count, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [metadataId, exportId, exportLang, currency, Number(workerResult.metadata?.pageCount) || 0, workerResult.metadata?.notes || "Generated via secure export modal"]
    );

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
