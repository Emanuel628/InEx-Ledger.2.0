import express from "express";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";
import { issueExportGrant, verifyExportGrant } from "../services/exportGrantService.js";
import { dispatchPdfJob } from "../services/pdfWorkerClient.js";
import { saveRedactedPdf, buildRedactedStream } from "../services/exportStorage.js";
import { pool } from "../db.js";

const router = express.Router();
router.use(requireAuth);

const EXPORT_TTL_MS = Number(process.env.EXPORT_GRANT_TTL_MS || 60_000);

function validateDateRange(range) {
  if (!range || typeof range !== "object") return null;
  const { startDate, endDate } = range;
  if (!startDate || !endDate) return null;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

router.post("/exports/request-grant", async (req, res) => {
  try {
    const user = req.user;
    const businessId = user.business_id || (await resolveBusinessIdForUser(user));
    const exportType = (req.body?.exportType || "pdf").toLowerCase();
    const includeTaxId = Boolean(req.body?.includeTaxId);
    const dateRange = validateDateRange(req.body?.dateRange);

    if (!dateRange) {
      return res.status(400).json({ error: "Valid startDate and endDate are required." });
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
    console.error("Export grant error:", err.message);
    return res.status(500).json({ error: "Unable to issue export grant." });
  }
});

router.post("/exports/generate", async (req, res) => {
  const token = req.body?.grantToken;
  if (!token) {
    return res.status(400).json({ error: "grantToken is required." });
  }

  let grantPayload;
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
  const businessId = user.business_id || (await resolveBusinessIdForUser(user));

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
    console.error("Export generation error:", err.message);
    return res.status(500).json({ error: "Failed to generate export." });
  }
});

router.get("/exports/history", async (req, res) => {
  try {
    const user = req.user;
    const businessId = user.business_id || (await resolveBusinessIdForUser(user));
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
    return res.json(result.rows);
  } catch (err) {
    console.error("Export history error:", err.message);
    return res.status(500).json({ error: "Unable to load export history." });
  }
});

router.get("/exports/history/:id/redacted", async (req, res) => {
  try {
    const user = req.user;
    const businessId = user.business_id || (await resolveBusinessIdForUser(user));
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
    console.error("Redacted download error:", err.message);
    return res.status(500).json({ error: "Cannot download redacted export." });
  }
});

export default router;
