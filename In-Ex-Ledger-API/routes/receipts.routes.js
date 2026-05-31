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
  getSubscriptionSnapshotForBusiness
} = require("../services/subscriptionService.js");
const {
  BasicPlanLimitError,
  assertCanUploadReceipts,
  incrementReceiptUsage
} = require("../services/basicPlanUsageService.js");
const { evaluateUsageLimitEmails } = require("../services/usageLimitEmailService.js");
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
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");
const { sendBookkeepingActivityEmail } = require("../services/bookkeepingEmailService.js");

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
const MAX_RECEIPTS_PER_TRANSACTION = 10;
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

function getErrorDiagnostic(err) {
  return {
    name: err?.name || null,
    message: err?.message || String(err || "Unknown error"),
    code: err?.code || null,
    severity: err?.severity || null,
    detail: err?.detail || null,
    hint: err?.hint || null,
    table: err?.table || null,
    column: err?.column || null,
    constraint: err?.constraint || null,
    routine: err?.routine || null
  };
}

function isRecoverableReceiptSchemaError(err) {
  const message = String(err?.message || "").toLowerCase();
  return err?.code === "42703" || /column\s+.*\s+does not exist/.test(message);
}

async function ensureReceiptListSchema() {
  await pool.query(`
    ALTER TABLE receipts
      ADD COLUMN IF NOT EXISTS storage_path TEXT,
      ADD COLUMN IF NOT EXISTS file_hash TEXT,
      ADD COLUMN IF NOT EXISTS file_bytes BYTEA,
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'receipts'
           AND column_name = 'created_at'
      ) THEN
        EXECUTE 'UPDATE receipts SET uploaded_at = COALESCE(uploaded_at, created_at, now()) WHERE uploaded_at IS NULL';
      ELSE
        UPDATE receipts SET uploaded_at = COALESCE(uploaded_at, now()) WHERE uploaded_at IS NULL;
      END IF;
    END $$
  `);
}

function buildReceiptListSql() {
  return `
    SELECT
      r.id,
      r.business_id,
      b.name AS business_name,
      r.transaction_id,
      r.filename,
      r.mime_type,
      r.storage_path,
      r.uploaded_at,
      r.uploaded_at AS created_at,
      r.file_hash,
      (r.file_bytes IS NOT NULL) AS has_file_bytes
    FROM receipts r
    JOIN businesses b ON b.id = r.business_id
    WHERE r.business_id = ANY($1::uuid[])
    ORDER BY b.name ASC, r.uploaded_at DESC NULLS LAST
    LIMIT 500
  `;
}

function mapReceiptListRows(rows = []) {
  return rows.map((row) => {
    const resolvedStoragePath = resolveReceiptFilePath(row.storage_path);
    return {
      id: row.id,
      business_id: row.business_id,
      business_name: row.business_name,
      transaction_id: row.transaction_id,
      filename: row.filename,
      mime_type: row.mime_type,
      storage_path: row.storage_path,
      uploaded_at: row.uploaded_at,
      created_at: row.created_at,
      file_hash: row.file_hash,
      has_file_bytes: !!row.has_file_bytes,
      is_viewable: !!resolvedStoragePath || !!row.has_file_bytes
    };
  });
}

function setNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

    const sql = buildReceiptListSql();
    let result;

    try {
      result = await pool.query(sql, [scope.businessIds]);
    } catch (err) {
      if (!isRecoverableReceiptSchemaError(err)) {
        throw err;
      }

      logWarn("Receipts schema drift detected; applying safe receipt metadata guards before retry", getErrorDiagnostic(err));
      await ensureReceiptListSchema();
      result = await pool.query(sql, [scope.businessIds]);
    }

    const rows = mapReceiptListRows(result.rows || []);

    setNoStoreHeaders(res);

    return res.status(200).json(rows);
  } catch (err) {
    logError("Receipts load error:", getErrorDiagnostic(err));
    return res.status(500).json({
      error: "Failed to load receipts"
    });
  }
});

/* =========================================================
   POST /receipts — Upload Receipt
   ========================================================= */

// Resolves the business and subscription for a receipt upload. Receipt uploads
// are available on every tier; Basic businesses are metered by the monthly
// receipt cap, enforced inside the POST handler before any insert.
async function checkReceiptPlanAccess(req, res, next) {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    req._receiptsBusinessId = businessId;
    req._receiptsSubscription = await getSubscriptionSnapshotForBusiness(businessId);
    next();
  } catch (err) {
    logError("Receipt plan gate error:", err);
    res.status(500).json({ error: "Failed to verify plan access." });
  }
}

router.post("/", checkReceiptPlanAccess, upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  const client = await pool.connect();
  let storagePath = null;
  let inTransaction = false;
  let committed = false;
  const businessId = req._receiptsBusinessId;
  const subscription = req._receiptsSubscription || null;

  try {
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

    if (!normalizedMimeType) {
      return res.status(400).json({
        error: "Unsupported file type. Only receipt images or PDFs are allowed."
      });
    }

    // Acquire a per-business advisory lock so the monthly-cap check, the insert,
    // and the usage-counter increment are atomic. Two concurrent uploads at the
    // Basic cap cannot both pass the check.
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [businessId]);
    await assertCanUploadReceipts(client, businessId, 1, { subscription });

    // Cap the number of receipt files a single transaction can carry. The
    // count runs under the advisory lock so concurrent uploads to the same
    // transaction cannot both slip past the cap.
    if (transactionId !== null) {
      const countResult = await client.query(
        "SELECT COUNT(*)::int AS count FROM receipts WHERE transaction_id = $1 AND business_id = $2",
        [transactionId, businessId]
      );
      if (Number(countResult.rows[0]?.count || 0) >= MAX_RECEIPTS_PER_TRANSACTION) {
        const limitError = new Error(
          `This transaction already has ${MAX_RECEIPTS_PER_TRANSACTION} receipt files. Remove one before uploading another.`
        );
        limitError.status = 409;
        limitError.code = "transaction_receipt_limit_reached";
        throw limitError;
      }
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

    await client.query(
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

    // Authoritative monthly receipt counter (never decremented on delete).
    await incrementReceiptUsage(client, businessId, 1);

    await client.query("COMMIT");
    committed = true;
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Receipt evidence changed after export."
    }).catch((error) => logWarn("Receipt snapshot invalidation failed", { businessId, err: error.message }));

    // Best-effort: notify Basic businesses as they approach their monthly cap.
    void evaluateUsageLimitEmails({ businessId, resources: ["receipts"], subscription });
    void sendBookkeepingActivityEmail({
      businessId,
      userId: req.user?.id,
      kind: "receipt_uploaded",
      actionPath: "/receipts",
      details: [
        { label: "Filename", value: req.file.originalname },
        ...(transactionId ? [{ label: "Attached to transaction", value: "Yes" }] : []),
        { label: "Saved on", value: new Date().toISOString().slice(0, 10) }
      ]
    });

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
    if (inTransaction && !committed) {
      await client.query("ROLLBACK").catch(() => {});
    }
    if (!committed && storagePath) {
      await safeUnlink(storagePath);
    }

    if (err instanceof BasicPlanLimitError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        ...err.details
      });
    }
    if (err.status === 409 && err.code === "transaction_receipt_limit_reached") {
      return res.status(409).json({
        error: err.message,
        code: err.code,
        limit: MAX_RECEIPTS_PER_TRANSACTION
      });
    }
    if (err.name === "AccountingPeriodLockedError") {
      return res.status(409).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("POST /receipts error:", err);
    return res.status(500).json({ error: "Failed to save receipt." });
  } finally {
    client.release();
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Detach to Transaction
   ========================================================= */

router.patch("/:id/attach", async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;

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

    await client.query("BEGIN");
    inTransaction = true;

    const receiptLookup = await client.query(
      `SELECT id, business_id
       FROM receipts
       WHERE id = $1
         AND business_id = ANY($2::uuid[])
       FOR UPDATE
       LIMIT 1`,
      [receiptId, scope.businessIds]
    );

    if (!receiptLookup.rowCount) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(404).json({ error: "Receipt not found." });
    }

    const receiptBusinessId = receiptLookup.rows[0].business_id;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [receiptBusinessId]);
    const lockState = await loadAccountingLockState(client, receiptBusinessId);

    if (transactionId !== null) {
      // Attaching to a transaction -> verify ownership and lock state.
      const txCheck = await client.query(
        `SELECT id, date
         FROM transactions
         WHERE id = $1 AND business_id = $2
         LIMIT 1`,
        [transactionId, receiptBusinessId]
      );

      if (!txCheck.rowCount) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(404).json({
          error: "Transaction not found or does not belong to this business."
        });
      }

      assertDateUnlocked(lockState, txCheck.rows[0].date);

      // Run the count and update under the same lock so concurrent attach
      // requests cannot both slip past the 10-receipt cap.
      const attachedCount = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM receipts
          WHERE transaction_id = $1 AND business_id = $2 AND id <> $3`,
        [transactionId, receiptBusinessId, receiptId]
      );
      if (Number(attachedCount.rows[0]?.count || 0) >= MAX_RECEIPTS_PER_TRANSACTION) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(409).json({
          error: `This transaction already has ${MAX_RECEIPTS_PER_TRANSACTION} receipt files. Remove one before attaching another.`,
          code: "transaction_receipt_limit_reached",
          limit: MAX_RECEIPTS_PER_TRANSACTION
        });
      }
    } else {
      // Detaching (null) -> check if the receipt is currently linked to a
      // locked-period transaction.
      const currentLink = await client.query(
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

    const result = await client.query(
      `UPDATE receipts
       SET transaction_id = $1
       WHERE id = $2 AND business_id = $3
       RETURNING id, transaction_id`,
      [transactionId, receiptId, receiptBusinessId]
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(404).json({ error: "Receipt not found." });
    }

    await client.query("COMMIT");
    inTransaction = false;
    void invalidateSnapshotsForBusiness({
      businessId: receiptBusinessId,
      reason: "Receipt evidence changed after export."
    }).catch((error) => logWarn("Receipt snapshot invalidation failed", {
      businessId: receiptBusinessId,
      err: error.message
    }));
    return res.json(result.rows[0]);
  } catch (err) {
    if (inTransaction) {
      await client.query("ROLLBACK").catch(() => {});
    }
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
  } finally {
    client.release();
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
    void invalidateSnapshotsForBusiness({
      businessId: receiptBusinessId,
      reason: "Receipt evidence changed after export."
    }).catch((error) => logWarn("Receipt snapshot invalidation failed", {
      businessId: receiptBusinessId,
      err: error.message
    }));

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
            const type = parsed.error.type || "";
            const isBilling = type === "invalid_request_error" && /credit|balance|billing/i.test(parsed.error.message || "");
            const reason = isBilling
              ? "Receipt scanning is temporarily unavailable. Please try again later."
              : "Receipt scanning could not be completed. Please try again.";
            resolve({ available: false, reason });
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

  let primaryBusinessId = null;
  try {
    const scope = await getBusinessScopeForUser(req.user, "all");
    primaryBusinessId = Array.isArray(scope.businessIds) ? scope.businessIds[0] || null : null;

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
    if (!ocrResult?.available || !ocrResult?.extracted) {
      void sendBookkeepingActivityEmail({
        businessId: primaryBusinessId,
        userId: req.user?.id,
        kind: "receipt_processing_failed",
        actionPath: "/receipts",
        details: [
          { label: "Receipt", value: result.rows[0]?.filename || "Receipt" },
          { label: "Issue", value: String(ocrResult?.reason || "No structured data could be extracted.").slice(0, 240) }
        ]
      });
    }
    return res.json(ocrResult);
  } catch (err) {
    if (primaryBusinessId) {
      void sendBookkeepingActivityEmail({
        businessId: primaryBusinessId,
        userId: req.user?.id,
        kind: "receipt_processing_failed",
        actionPath: "/receipts",
        details: [
          { label: "Receipt", value: receiptId },
          { label: "Issue", value: String(err?.message || "Receipt scan failed.").slice(0, 240) }
        ]
      });
    }
    logError("POST /receipts/:id/extract error:", err);
    return res.status(500).json({ error: "Failed to extract receipt data." });
  }
});

module.exports = router;
