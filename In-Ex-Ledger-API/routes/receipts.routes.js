import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";
import { pool } from "../db.js";

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.join(process.cwd(), "storage", "receipts");
fs.mkdirSync(storageDir, { recursive: true });

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

/* =========================================================
   GET /receipts — List Receipts (Newest First)
   ========================================================= */

router.get("/", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    if (!businessId) {
      return res.status(400).json({
        error: "Missing business context"
      });
    }

    const sql = `
      SELECT
        id,
        transaction_id,
        file_url AS filename,
        storage_path,
        created_at,
        file_hash
      FROM receipts
      WHERE business_id = $1
      ORDER BY created_at DESC NULLS LAST
    `;
    const result = await pool.query(sql, [businessId]);

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

router.post("/", requireAuth, upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    // optional
    const transactionId = req.body.transaction_id || null;

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

    return res.status(500).json({ error: "Failed to save receipt." });
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Detach to Transaction
   ========================================================= */

router.patch("/:id/attach", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;

    if (!("transaction_id" in (req.body || {}))) {
      return res.status(400).json({
        error: "transaction_id must be provided (uuid or null)."
      });
    }

    const transactionId = req.body.transaction_id;

    // If attaching to a transaction → verify ownership
    if (transactionId !== null) {
      const txCheck = await pool.query(
        `SELECT id
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
    console.error("PATCH /receipts/:id/attach error:", err);
    return res.status(500).json({
      error: "Failed to update receipt attachment."
    });
  }
});

/* =========================================================
   GET /receipts/:id — Secure Download
   ========================================================= */

router.get("/:id", requireAuth, async (req, res) => {
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
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.sendFile(storage_path);
  } catch (err) {
    console.error("GET /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to load receipt." });
  }
});

/* =========================================================
   DELETE /receipts/:id — Delete Receipt (DB + Disk)
   ========================================================= */

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;

    // Get file path first (so we can delete disk after DB delete)
    const found = await pool.query(
      `SELECT storage_path
       FROM receipts
       WHERE id = $1 AND business_id = $2
       LIMIT 1`,
      [receiptId, businessId]
    );

    if (!found.rowCount) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const storagePath = found.rows[0]?.storage_path || null;

    // Delete DB row
    await pool.query(
      `DELETE FROM receipts
       WHERE id = $1 AND business_id = $2`,
      [receiptId, businessId]
    );

    // Delete disk file
    safeUnlink(storagePath);

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to delete receipt." });
  }
});

export default router;
