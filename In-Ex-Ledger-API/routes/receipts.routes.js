const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createReceiptLimiter } = require("../middleware/rateLimitTiers.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const {
  getReceiptStorageDir,
  isManagedReceiptPath,
  resolveReceiptFilePath,
  getReceiptStorageStatus
} = require("../services/receiptStorage.js");
const {
  loadAccountingLockState,
  assertDateUnlocked
} = require("../services/accountingLockService.js");

const router = express.Router();
const storageDir = getReceiptStorageDir();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createReceiptLimiter());

/* =========================================================
   Receipt Upload Guards
   ========================================================= */

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif"
]);

const MIME_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"]
]);

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* =========================================================
   Multer Config (Disk + UUID)
   ========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  fileFilter(_req, file, cb) {
    if (!normalizeUploadedReceiptMimeType(file)) {
      const error = new Error("Unsupported file type. Only receipt images or PDFs are allowed.");
      error.status = 400;
      return cb(error);
    }

    cb(null, true);
  },

  limits: {
    fileSize: MAX_RECEIPT_BYTES
  }
});

/* =========================================================
   Helpers
   ========================================================= */

function normalizeUploadedReceiptMimeType(file) {
  const rawMime = String(file?.mimetype || "").trim().toLowerCase();
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  const inferredMime = MIME_BY_EXTENSION.get(ext) || null;

  if (
    ALLOWED_MIME_TYPES.has(rawMime) &&
    ALLOWED_EXTENSIONS.has(ext) &&
    inferredMime === rawMime
  ) {
    return rawMime;
  }

  return null;
}

function getSafeReceiptResponseMimeType(mimeType) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalizedMime) ? normalizedMime : "application/octet-stream";
}

function shouldInlineReceiptMimeType(mimeType) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalizedMime);
}

async function writeReceiptMirror(buffer, originalName) {
  if (!buffer?.length) {
    return null;
  }

  const ext = path.extname(String(originalName || "")).toLowerCase();
  const storagePath = path.join(storageDir, `${crypto.randomUUID()}${ext}`);
  await fsp.mkdir(storageDir, { recursive: true });
  await fsp.writeFile(storagePath, buffer);
  return storagePath;
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return;
    }
    logError("Failed to delete file:", filePath, err);
  }
}

async function moveFileIfExists(fromPath, toPath) {
  if (!fromPath || !toPath) {
    return false;
  }
  try {
    await fsp.rename(fromPath, toPath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

/* =========================================================
   GET /receipts — List Receipts (Newest First)
   ========================================================= */

router.get("/", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, req.query?.scope);

    if (!scope.businessIds.length) {
      return res.status(400).json({
        error: "Missing business context"
      });
    }

    const sql = `
      SELECT
        r.id,
        r.business_id,
        b.name AS business_name,
        r.transaction_id,
        r.filename,
        r.mime_type,
        r.storage_path,
        r.created_at,
        r.file_hash
      FROM receipts r
      JOIN businesses b ON b.id = r.business_id
      WHERE r.business_id = ANY($1::uuid[])
      ORDER BY b.name ASC, r.created_at DESC NULLS LAST
      LIMIT 500
    `;
    const result = await pool.query(sql, [scope.businessIds]);

    const rows = (result.rows || []).map((row) => {
      const resolvedStoragePath = resolveReceiptFilePath(row.storage_path);
      return {
        ...row,
        is_viewable: !!resolvedStoragePath || !!row.file_bytes
      };
    });

    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).json(rows);
  } catch (err) {
    logError("Receipts load error:", err);
    return res.status(500).json({
      error: "Failed to load receipts"
    });
  }
});

/* =========================================================
   POST /receipts — Upload Receipt
   ========================================================= */

router.post("/", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "receipts")) {
      return res.status(402).json({ error: "Receipt uploads require an active InEx Ledger Pro plan." });
    }

    let transactionId = req.body.transaction_id;
    if (typeof transactionId === "string") {
      transactionId = transactionId.trim();
    }
    if (!transactionId) {
      transactionId = null;
    }

    if (transactionId !== null) {
      if (!isUuid(transactionId)) {
        return res.status(400).json({
          error: "transaction_id must be a valid UUID when provided."
        });
      }

      const txCheck = await pool.query(
        `SELECT id, date
         FROM transactions
         WHERE id = $1 AND business_id = $2
         LIMIT 1`,
        [transactionId, businessId]
      );

      if (!txCheck.rowCount) {
        return res.status(404).json({
          error: "Transaction not found or does not belong to this business."
        });
      }

      const lockState = await loadAccountingLockState(pool, businessId);
      assertDateUnlocked(lockState, txCheck.rows[0].date);
    }

    const receiptId = crypto.randomUUID();
    const fileBytes = req.file.buffer;
    const fileHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
    const normalizedMimeType = normalizeUploadedReceiptMimeType(req.file);
    let storagePath = null;

    if (!normalizedMimeType) {
      return res.status(400).json({
        error: "Unsupported file type. Only receipt images or PDFs are allowed."
      });
    }

    try {
      storagePath = await writeReceiptMirror(fileBytes, req.file.originalname);
    } catch (mirrorErr) {
      const storageStatus = getReceiptStorageStatus();
      logWarn("Receipt disk mirror unavailable; storing receipt in database only", {
        receiptId,
        directory: storageStatus.directory,
        mode: storageStatus.mode,
        error: mirrorErr.message
      });
    }

    await pool.query(
      `INSERT INTO receipts
        (id, business_id, transaction_id, filename, mime_type, storage_path, file_hash, file_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        receiptId,
        businessId,
        transactionId,
        req.file.originalname,
        normalizedMimeType,
        storagePath,
        fileHash,
        fileBytes
      ]
    );

    return res.status(201).json({
      id: receiptId,
      filename: req.file.originalname,
      mime_type: normalizedMimeType,
      transaction_id: transactionId,
      created_at: new Date().toISOString(),
      is_viewable: true,
      url: `/api/receipts/${receiptId}`
    });
  } catch (err) {
    if (err.name === "AccountingPeriodLockedError") {
      await safeUnlink(req.file?.path);
      return res.status(409).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("POST /receipts error:", err);

    // Orphan cleanup
    return res.status(500).json({ error: "Failed to save receipt." });
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Detach to Transaction
   ========================================================= */

router.patch("/:id/attach", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, "all");
    const receiptId = req.params.id;

    if (!UUID_RE.test(receiptId)) {
      return res.status(400).json({ error: "Invalid receipt ID." });
    }

    if (!("transaction_id" in (req.body || {}))) {
      return res.status(400).json({
        error: "transaction_id must be provided (uuid or null)."
      });
    }

    const transactionId = req.body.transaction_id;

    if (transactionId !== null && transactionId !== undefined) {
      if (typeof transactionId !== "string" || !UUID_RE.test(transactionId)) {
        return res.status(400).json({
          error: "transaction_id must be a valid UUID when provided."
        });
      }
    }

    const receiptLookup = await pool.query(
      `SELECT id, business_id
       FROM receipts
       WHERE id = $1
         AND business_id = ANY($2::uuid[])
       LIMIT 1`,
      [receiptId, scope.businessIds]
    );

    if (!receiptLookup.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const receiptBusinessId = receiptLookup.rows[0].business_id;
    const lockState = await loadAccountingLockState(pool, receiptBusinessId);

    if (transactionId !== null) {
      // Attaching to a transaction → verify ownership and lock state
      const txCheck = await pool.query(
        `SELECT id, date
         FROM transactions
         WHERE id = $1 AND business_id = $2
         LIMIT 1`,
        [transactionId, receiptBusinessId]
      );

      if (!txCheck.rowCount) {
        return res.status(404).json({
          error: "Transaction not found or does not belong to this business."
        });
      }

      assertDateUnlocked(lockState, txCheck.rows[0].date);
    } else {
      // Detaching (null) → check if the receipt is currently linked to a locked-period transaction
      const currentLink = await pool.query(
        `SELECT t.date
         FROM receipts r
         JOIN transactions t ON t.id = r.transaction_id
        WHERE r.id = $1
          AND r.business_id = $2
          AND r.transaction_id IS NOT NULL
        LIMIT 1`,
        [receiptId, receiptBusinessId]
      );

      if (currentLink.rowCount) {
        assertDateUnlocked(lockState, currentLink.rows[0].date);
      }
    }

    const result = await pool.query(
      `UPDATE receipts
       SET transaction_id = $1
       WHERE id = $2 AND business_id = $3
       RETURNING id, transaction_id`,
      [transactionId, receiptId, receiptBusinessId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    if (err.name === "AccountingPeriodLockedError") {
      return res.status(409).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("PATCH /receipts/:id/attach error:", err);
    return res.status(500).json({
      error: "Failed to update receipt attachment."
    });
  }
});

/* =========================================================
   GET /receipts/:id — Secure Download
   ========================================================= */

router.get("/:id", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, "all");
    const receiptId = String(req.params.id || "").trim();
    if (!isUuid(receiptId)) {
      return res.status(400).json({ error: "Invalid receipt ID." });
    }

    const result = await pool.query(
      `SELECT id, filename, mime_type, storage_path, file_bytes
       FROM receipts
       WHERE id = $1 AND business_id = ANY($2::uuid[])
       LIMIT 1`,
      [receiptId, scope.businessIds]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const { id, filename, mime_type, storage_path, file_bytes } = result.rows[0];
    const resolvedStoragePath = resolveReceiptFilePath(storage_path);

    if (resolvedStoragePath && !isManagedReceiptPath(resolvedStoragePath) && path.isAbsolute(String(storage_path || "").trim())) {
      logWarn("Blocked receipt download for unmanaged storage path", {
        receiptId,
        businessIds: scope.businessIds
      });
      return res.status(404).json({ error: "Receipt file missing." });
    }

    if (!resolvedStoragePath && !file_bytes) {
      logWarn("Receipt file missing for preview", {
        receiptId,
        businessIds: scope.businessIds,
        storagePath: storage_path
      });
      return res.status(404).json({ error: "Receipt file missing." });
    }

    // Zero trust cache protection
    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const responseMimeType = getSafeReceiptResponseMimeType(mime_type);
    const dispositionType = shouldInlineReceiptMimeType(mime_type) ? "inline" : "attachment";

    res.setHeader("Content-Type", responseMimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${dispositionType}; filename*=UTF-8''${encodeURIComponent(filename)}`);

    if (file_bytes) {
      return res.send(Buffer.isBuffer(file_bytes) ? file_bytes : Buffer.from(file_bytes));
    }

    if (resolvedStoragePath) {
      return res.sendFile(resolvedStoragePath);
    }

    return res.status(404).json({ error: "Receipt file missing." });
  } catch (err) {
    logError("GET /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to load receipt." });
  }
});

/* =========================================================
   DELETE /receipts/:id — Delete Receipt (DB + Disk)
   ========================================================= */

router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  let storagePath = null;
  let pendingDeletePath = null;
  let movedToPending = false;

  try {
    const scope = await getBusinessScopeForUser(req.user, "all");
    const receiptId = req.params.id;
    if (!isUuid(receiptId)) {
      return res.status(400).json({ error: "Invalid receipt ID." });
    }

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT r.storage_path,
              r.business_id,
              (
                SELECT t.date
                  FROM transactions t
                 WHERE t.id = r.transaction_id
                   AND t.business_id = r.business_id
                 LIMIT 1
              ) AS tx_date
       FROM receipts r
       WHERE r.id = $1 AND r.business_id = ANY($2::uuid[])
       FOR UPDATE
       LIMIT 1`,
      [receiptId, scope.businessIds]
    );

    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Receipt not found." });
    }

    // Block deleting a receipt that is evidence for a locked-period transaction
    const txDate = found.rows[0]?.tx_date || null;
    const receiptBusinessId = found.rows[0]?.business_id || null;
    if (txDate) {
      const lockState = await loadAccountingLockState(pool, receiptBusinessId);
      try {
        assertDateUnlocked(lockState, txDate);
      } catch (lockErr) {
        await client.query("ROLLBACK");
        return res.status(lockErr.status).json({
          error: lockErr.message,
          code: lockErr.code,
          locked_through_date: lockErr.lockedThroughDate
        });
      }
    }

    storagePath = found.rows[0]?.storage_path || null;
    pendingDeletePath = storagePath
      ? `${storagePath}.pending-delete-${receiptId}`
      : null;

    if (storagePath && pendingDeletePath) {
      movedToPending = await moveFileIfExists(storagePath, pendingDeletePath);
    }

    await client.query(
      `DELETE FROM receipts
       WHERE id = $1 AND business_id = $2`,
      [receiptId, receiptBusinessId]
    );

    await client.query("COMMIT");

    if (movedToPending) {
      await safeUnlink(pendingDeletePath);
    }

    return res.json({ ok: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logError("DELETE /receipts/:id rollback error:", rollbackErr);
    }
    if (movedToPending && pendingDeletePath && storagePath) {
      try {
        await fsp.rename(pendingDeletePath, storagePath);
      } catch (restoreErr) {
        if (restoreErr?.code === "ENOENT") {
          return res.status(500).json({ error: "Failed to delete receipt." });
        }
        logError("Failed to restore receipt after delete error:", restoreErr);
      }
    }
    logError("DELETE /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to delete receipt." });
  } finally {
    client.release();
  }
});

/* =========================================================
   POST /receipts/:id/extract — OCR via Claude vision API
   Requires ANTHROPIC_API_KEY env var; gracefully degrades if absent.
   ========================================================= */

const ANTHROPIC_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ANTHROPIC_RECEIPT_OCR_MODEL = String(
  process.env.ANTHROPIC_RECEIPT_OCR_MODEL || "claude-3-5-haiku-20241022"
).trim();

async function extractReceiptDataWithClaude(filePath, mimeType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { available: false, reason: "OCR is not configured on this server. Set ANTHROPIC_API_KEY to enable receipt scanning." };
  }

  const resolvedMime = String(mimeType || "").trim().toLowerCase();
  if (!ANTHROPIC_MEDIA_TYPES.has(resolvedMime)) {
    return {
      available: false,
      reason: "Receipt scan currently supports JPG, PNG, GIF, and WEBP images only."
    };
  }
  const imageData = (await fsp.readFile(filePath)).toString("base64");

  const requestBody = JSON.stringify({
    model: ANTHROPIC_RECEIPT_OCR_MODEL,
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: resolvedMime, data: imageData }
        },
        {
          type: "text",
          text: `Extract the key financial details from this receipt image and respond ONLY with a JSON object. Use this exact shape:
{
  "merchant": "store or vendor name",
  "date": "YYYY-MM-DD or null",
  "total": number or null,
  "subtotal": number or null,
  "tax": number or null,
  "currency": "CAD or USD or null",
  "description": "brief description of what was purchased (max 120 chars)"
}
If a field cannot be determined, use null. Do not include any other text.`
        }
      ]
    }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            resolve({ available: false, reason: `Anthropic API error: ${parsed.error.message || parsed.error.type}` });
            return;
          }
          const text = parsed.content?.[0]?.text || "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            resolve({ available: true, extracted: null, raw: text });
            return;
          }
          const extracted = JSON.parse(jsonMatch[0]);
          resolve({ available: true, extracted });
        } catch (parseErr) {
          resolve({ available: true, extracted: null, raw: body });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ available: false, reason: `Network error calling OCR service: ${err.message}` });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ available: false, reason: "OCR service timed out." });
    });

    req.write(requestBody);
    req.end();
  });
}

router.post("/:id/extract", async (req, res) => {
  const receiptId = String(req.params.id || "").trim();
  if (!isUuid(receiptId)) {
    return res.status(400).json({ error: "Invalid receipt ID." });
  }

  try {
    const scope = await getBusinessScopeForUser(req.user, "all");

    const result = await pool.query(
      `SELECT filename, mime_type, storage_path, file_bytes
       FROM receipts
       WHERE id = $1 AND business_id = ANY($2::uuid[])
       LIMIT 1`,
      [receiptId, scope.businessIds]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const { mime_type, storage_path, file_bytes } = result.rows[0];
    const resolvedPath = resolveReceiptFilePath(storage_path);

    if (!resolvedPath && !file_bytes) {
      return res.status(404).json({ error: "Receipt file missing." });
    }

    if (resolvedPath && !isManagedReceiptPath(resolvedPath) && path.isAbsolute(String(storage_path || "").trim())) {
      return res.status(404).json({ error: "Receipt file missing." });
    }

    if (mime_type === "application/pdf") {
      return res.status(422).json({ available: false, reason: "PDF receipts cannot be scanned. Please use an image file (JPG, PNG, GIF, or WEBP)." });
    }

    if (!ANTHROPIC_MEDIA_TYPES.has(String(mime_type || "").trim().toLowerCase())) {
      return res.status(422).json({
        available: false,
        reason: "Receipt scan currently supports JPG, PNG, GIF, and WEBP images only."
      });
    }

    let ocrSourcePath = resolvedPath;
    let tempPath = null;

    if (file_bytes) {
      const ext = path.extname(String(storage_path || "")).toLowerCase() || ".bin";
      tempPath = path.join(storageDir, `${crypto.randomUUID()}-ocr${ext}`);
      await fsp.writeFile(tempPath, Buffer.isBuffer(file_bytes) ? file_bytes : Buffer.from(file_bytes));
      ocrSourcePath = tempPath;
    }

    const ocrResult = await extractReceiptDataWithClaude(ocrSourcePath, mime_type);
    if (tempPath) {
      await safeUnlink(tempPath);
    }
    return res.json(ocrResult);
  } catch (err) {
    logError("POST /receipts/:id/extract error:", err);
    return res.status(500).json({ error: "Failed to extract receipt data." });
  }
});

module.exports = router;
