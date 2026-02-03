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

    // Streaming hash to avoid memory spikes
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

    /* =========================================================
       Orphan File Cleanup (Critical Integrity Layer)
       ========================================================= */

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

    /* =========================================================
       Zero Trust Cache Protection
       ========================================================= */

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