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
router.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.join(process.cwd(), "storage", "receipts");
fs.mkdirSync(storageDir, { recursive: true });

/* =========================================================
   MIME Allowlist (Receipt Only)
   ========================================================= */

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp"
]);

/* =========================================================
   Multer Upload Config
   ========================================================= */

const upload = multer({
  storage: multer.diskStorage({
    destination: storageDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new Error("Unsupported file type. Only receipt images or PDFs are allowed.")
      );
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/* =========================================================
   Helper: Streaming SHA-256 (memory safe)
   ========================================================= */

function sha256File(storagePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(storagePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/* =========================================================
   GET /receipts — List Receipts (for UI table)
   ========================================================= */

router.get("/receipts", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    // Assumes receipts table has created_at; if not, ORDER BY will still work if you change it to filename/id.
    const result = await pool.query(
      `SELECT
         id,
         filename,
         mime_type,
         transaction_id,
         created_at,
         file_hash
       FROM receipts
       WHERE business_id = $1
       ORDER BY created_at DESC NULLS LAST`,
      [businessId]
    );

    const receipts = result.rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mime_type: r.mime_type,
      transaction_id: r.transaction_id,
      created_at: r.created_at,
      file_hash: r.file_hash,
      url: `/api/receipts/${r.id}`
    }));

    return res.json({ receipts });
  } catch (err) {
    console.error("GET /receipts error:", err);
    return res.status(500).json({ error: "Failed to load receipts." });
  }
});

/* =========================================================
   POST /receipts — Upload Receipt
   ========================================================= */

router.post("/receipts", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = req.body.transaction_id || null;
    const receiptId = crypto.randomUUID();
    const storagePath = req.file.path;

    const fileHash = await sha256File(storagePath);

    await pool.query(
      `INSERT INTO receipts
        (id, business_id, transaction_id, filename, mime_type, storage_path, file_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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

    // Orphan file cleanup
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.warn("Orphan receipt file deleted:", req.file.path);
      } catch (cleanupErr) {
        console.error("Failed to cleanup orphan receipt file:", cleanupErr);
      }
    }

    return res.status(500).json({ error: "Failed to save receipt." });
  }
});

/* =========================================================
   PATCH /receipts/:id/attach — Attach/Unattach to Transaction
   Body: { "transaction_id": "<uuid>" } or { "transaction_id": null }
   ========================================================= */

router.patch("/receipts/:id/attach", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;
    const transactionId =
      Object.prototype.hasOwnProperty.call(req.body || {}, "transaction_id")
        ? req.body.transaction_id
        : undefined;

    if (transactionId === undefined) {
      return res.status(400).json({ error: "transaction_id is required (uuid or null)." });
    }

    // NOTE: We do not validate transaction ownership here because schemas vary.
    // If your transactions table includes business_id, we can hard-enforce it later.
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

    return res.json({
      id: result.rows[0].id,
      transaction_id: result.rows[0].transaction_id
    });
  } catch (err) {
    console.error("PATCH /receipts/:id/attach error:", err);
    return res.status(500).json({ error: "Failed to update receipt attachment." });
  }
});

/* =========================================================
   DELETE /receipts/:id — Delete Receipt (DB + File)
   ========================================================= */

router.delete("/receipts/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const receiptId = req.params.id;

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT storage_path FROM receipts
       WHERE id = $1 AND business_id = $2
       LIMIT 1`,
      [receiptId, businessId]
    );

    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Receipt not found." });
    }

    const storagePath = found.rows[0].storage_path;

    await client.query(
      `DELETE FROM receipts
       WHERE id = $1 AND business_id = $2`,
      [receiptId, businessId]
    );

    await client.query("COMMIT");

    // Best-effort delete file AFTER DB commit
    if (storagePath && fs.existsSync(storagePath)) {
      try {
        fs.unlinkSync(storagePath);
      } catch (fileErr) {
        console.error("DELETE receipt file failed:", fileErr);
        // We do not fail the request because DB is already correct.
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("DELETE /receipts/:id error:", err);
    return res.status(500).json({ error: "Failed to delete receipt." });
  } finally {
    client.release();
  }
});

/* =========================================================
   GET /receipts/:id — Secure Download
   ========================================================= */

router.get("/receipts/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `SELECT filename, mime_type, storage_path FROM receipts
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
    console.error("GET /receipts error:", err);
    return res.status(500).json({ error: "Failed to load receipt." });
  }
});

export default router;