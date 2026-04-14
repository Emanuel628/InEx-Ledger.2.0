const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
  requirePersistentReceiptStorage
} = require("../services/receiptStorage.js");
const {
  loadAccountingLockState,
  assertDateUnlocked
} = require("../services/accountingLockService.js");

const router = express.Router();
const storageDir = getReceiptStorageDir();
fs.mkdirSync(storageDir, { recursive: true });
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

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* =========================================================
   Multer Config (Disk + UUID)
   ========================================================= */

const upload = multer({
  storage: multer.diskStorage({
    destination: storageDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),

  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();

    // Mobile browsers sometimes send blank/odd mimetype; allow extension fallback
    const okByMime = ALLOWED_MIME_TYPES.has(file.mimetype);
    const okByExt = ALLOWED_EXTENSIONS.has(ext);

    if (!okByMime && !okByExt) {
      return cb(
        new Error("Unsupported file type. Only receipt images or PDFs are allowed.")
      );
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

async function sha256File(storagePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(storagePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logError("Failed to delete file:", filePath, err);
  }
}

function moveFileIfExists(fromPath, toPath) {
  if (!fromPath || !fs.existsSync(fromPath)) {
    return false;
  }
  fs.renameSync(fromPath, toPath);
  return true;
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

    return res.status(200).json(result.rows || []);
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

router.post("/", requirePersistentReceiptStorage, upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "receipts")) {
      safeUnlink(req.file?.path);
      return res.status(402).json({ error: "Receipt uploads require an active InEx Ledger V1 plan." });
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
        safeUnlink(req.file?.path);
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
        safeUnlink(req.file?.path);
        return res.status(404).json({
          error: "Transaction not found or does not belong to this business."
        });
      }

      const lockState = await loadAccountingLockState(pool, businessId);
      assertDateUnlocked(lockState, txCheck.rows[0].date);
    }

    const receiptId = crypto.randomUUID();
    const storagePath = req.file.path;

    const fileHash = await sha256File(storagePath);

    await pool.query(
      `INSERT INTO receipts
        (id, business_id, transaction_id, filename, mime_type, storage_path, file_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        receiptId,
        businessId,
        transactionId,
        req.file.originalname,
        req.file.mimetype,
        storagePath,
        fileHash
      ]
    );

    return res.status(201).json({
      id: receiptId,
      filename: req.file.originalname,
      mime_type: req.file.mimetype,
      transaction_id: transactionId,
      url: `/api/receipts/${receiptId}`
    });
  } catch (err) {
    if (err.name === "AccountingPeriodLockedError") {
      safeUnlink(req.file?.path);
      return res.status(409).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("POST /receipts error:", err);

    // Orphan cleanup
    safeUnlink(req.file?.path);

    return res.status(500).json({ error: "Failed to save receipt." });
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Detach to Transaction
   ========================================================= */

router.patch("/:id/attach", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
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

    const lockState = await loadAccountingLockState(pool, businessId);

    if (transactionId !== null) {
      // Attaching to a transaction → verify ownership and lock state
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
        [receiptId, businessId]
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
      [transactionId, receiptId, businessId]
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
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = String(req.params.id || "").trim();
    if (!isUuid(receiptId)) {
      return res.status(400).json({ error: "Invalid receipt ID." });
    }

    const result = await pool.query(
      `SELECT filename, mime_type, storage_path
       FROM receipts
       WHERE id = $1 AND business_id = $2
       LIMIT 1`,
      [receiptId, businessId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const { filename, mime_type, storage_path } = result.rows[0];
    const resolvedStoragePath = path.resolve(storage_path || "");

    if (!isManagedReceiptPath(resolvedStoragePath)) {
      logWarn("Blocked receipt download for unmanaged storage path", {
        receiptId,
        businessId
      });
      return res.status(404).json({ error: "Receipt file missing." });
    }

    if (!fs.existsSync(resolvedStoragePath)) {
      return res.status(404).json({ error: "Receipt file missing." });
    }

    // Zero trust cache protection
    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.setHeader("Content-Type", mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);


    return res.sendFile(resolvedStoragePath);
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
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;
    if (!isUuid(receiptId)) {
      return res.status(400).json({ error: "Invalid receipt ID." });
    }

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT r.storage_path, t.date AS tx_date
       FROM receipts r
       LEFT JOIN transactions t ON t.id = r.transaction_id
       WHERE r.id = $1 AND r.business_id = $2
       FOR UPDATE
       LIMIT 1`,
      [receiptId, businessId]
    );

    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Receipt not found." });
    }

    // Block deleting a receipt that is evidence for a locked-period transaction
    const txDate = found.rows[0]?.tx_date || null;
    if (txDate) {
      const lockState = await loadAccountingLockState(pool, businessId);
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
      movedToPending = moveFileIfExists(storagePath, pendingDeletePath);
    }

    await client.query(
      `DELETE FROM receipts
       WHERE id = $1 AND business_id = $2`,
      [receiptId, businessId]
    );

    await client.query("COMMIT");

    if (movedToPending) {
      safeUnlink(pendingDeletePath);
    }

    return res.json({ ok: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logError("DELETE /receipts/:id rollback error:", rollbackErr);
    }
    if (movedToPending && pendingDeletePath && storagePath && fs.existsSync(pendingDeletePath)) {
      try {
        fs.renameSync(pendingDeletePath, storagePath);
      } catch (restoreErr) {
        logError("Failed to restore receipt after delete error:", restoreErr);
      }
    }
    logError("DELETE /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to delete receipt." });
  } finally {
    client.release();
  }
});

module.exports = router;
