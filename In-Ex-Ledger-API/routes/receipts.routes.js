const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createReceiptLimiter } = require("../middleware/rateLimitTiers.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");
const { pool } = require("../db.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const {
  AccountingPeriodLockedError,
  assertDateUnlocked,
  buildAccountingLockErrorPayload,
  loadAccountingLockState
} = require("../services/accountingLockService.js");

const router = express.Router();
const storageDir = path.join(process.cwd(), "storage", "receipts");
fs.mkdirSync(storageDir, { recursive: true });
router.use(requireAuth);
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

function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("Failed to delete file:", filePath, err);
  }
}

function moveFileIfExists(fromPath, toPath) {
  if (!fromPath || !fs.existsSync(fromPath)) {
    return false;
  }
  fs.renameSync(fromPath, toPath);
  return true;
}

function handleReceiptMutationError(res, err, fallbackMessage) {
  if (err instanceof AccountingPeriodLockedError) {
    return res.status(err.status).json(buildAccountingLockErrorPayload(err));
  }

  return res.status(500).json({
    error: fallbackMessage
  });
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
    `;
    const result = await pool.query(sql, [scope.businessIds]);

    return res.status(200).json(result.rows || []);
  } catch (err) {
    console.error("Receipts load error:", err);
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
      safeUnlink(req.file?.path);
      return res.status(402).json({ error: "Receipt uploads require an active InEx Ledger V1 plan." });
    }

    // optional
    const transactionId = req.body.transaction_id || null;
    if (transactionId) {
      const transactionResult = await pool.query(
        `SELECT id, date
           FROM transactions
          WHERE id = $1
            AND business_id = $2
          LIMIT 1`,
        [transactionId, businessId]
      );

      if (!transactionResult.rowCount) {
        safeUnlink(req.file?.path);
        return res.status(404).json({ error: "Transaction not found or does not belong to this business." });
      }

      const lockState = await loadAccountingLockState(pool, businessId);
      assertDateUnlocked(lockState, transactionResult.rows[0].date);
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
    console.error("POST /receipts error:", err);

    // Orphan cleanup
    safeUnlink(req.file?.path);

    return handleReceiptMutationError(res, err, "Failed to save receipt.");
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Detach to Transaction
   ========================================================= */

router.patch("/:id/attach", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;

    if (!("transaction_id" in (req.body || {}))) {
      return res.status(400).json({
        error: "transaction_id must be provided (uuid or null)."
      });
    }

    const transactionId = req.body.transaction_id;
    const receiptResult = await pool.query(
      `SELECT r.id,
              r.transaction_id,
              t.date AS transaction_date
         FROM receipts r
         LEFT JOIN transactions t
           ON t.id = r.transaction_id
          AND t.business_id = r.business_id
        WHERE r.id = $1
          AND r.business_id = $2
        LIMIT 1`,
      [receiptId, businessId]
    );

    if (!receiptResult.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const receipt = receiptResult.rows[0];
    const lockState = await loadAccountingLockState(pool, businessId);
    if (receipt.transaction_date) {
      assertDateUnlocked(lockState, receipt.transaction_date);
    }

    // If attaching to a transaction → verify ownership
    if (transactionId !== null) {
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
    }

    const result = await pool.query(
      `UPDATE receipts
       SET transaction_id = $1
       WHERE id = $2 AND business_id = $3
       RETURNING id, transaction_id`,
      [transactionId, receiptId, businessId]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /receipts/:id/attach error:", err);
    return handleReceiptMutationError(res, err, "Failed to update receipt attachment.");
  }
});

/* =========================================================
   GET /receipts/:id — Secure Download
   ========================================================= */

router.get("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `SELECT filename, mime_type, storage_path
       FROM receipts
       WHERE id = $1 AND business_id = $2
       LIMIT 1`,
      [req.params.id, businessId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const { filename, mime_type, storage_path } = result.rows[0];

    if (!storage_path || !fs.existsSync(storage_path)) {
      return res.status(404).json({ error: "Receipt file missing." });
    }

    // Zero trust cache protection
    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.setHeader("Content-Type", mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);


    return res.sendFile(storage_path);
  } catch (err) {
    console.error("GET /receipts/:id error:", err);
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

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT r.storage_path,
              t.date AS transaction_date
         FROM receipts r
         LEFT JOIN transactions t
           ON t.id = r.transaction_id
          AND t.business_id = r.business_id
        WHERE r.id = $1
          AND r.business_id = $2
        FOR UPDATE
        LIMIT 1`,
      [receiptId, businessId]
    );

    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Receipt not found." });
    }

    const lockState = await loadAccountingLockState(client, businessId);
    if (found.rows[0]?.transaction_date) {
      assertDateUnlocked(lockState, found.rows[0].transaction_date);
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
      console.error("DELETE /receipts/:id rollback error:", rollbackErr);
    }
    if (movedToPending && pendingDeletePath && storagePath && fs.existsSync(pendingDeletePath)) {
      try {
        fs.renameSync(pendingDeletePath, storagePath);
      } catch (restoreErr) {
        console.error("Failed to restore receipt after delete error:", restoreErr);
      }
    }
    console.error("DELETE /receipts/:id error:", err);
    return handleReceiptMutationError(res, err, "Failed to delete receipt.");
  } finally {
    client.release();
  }
});

module.exports = router;
