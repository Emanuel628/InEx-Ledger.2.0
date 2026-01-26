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

const upload = multer({
  storage: multer.diskStorage({
    destination: storageDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

router.post("/receipts", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Receipt file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = req.body.transaction_id || null;
    const receiptId = crypto.randomUUID();
    const storagePath = req.file.path;

    await pool.query(
      `INSERT INTO receipts
        (id, business_id, transaction_id, filename, mime_type, storage_path)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        receiptId,
        businessId,
        transactionId,
        req.file.originalname,
        req.file.mimetype,
        storagePath
      ]
    );

    res.status(201).json({
      id: receiptId,
      filename: req.file.originalname,
      mime_type: req.file.mimetype,
      transaction_id: transactionId,
      url: `/api/receipts/${receiptId}`
    });
  } catch (err) {
    console.error("POST /receipts error:", err);
    res.status(500).json({ error: "Failed to save receipt." });
  }
});

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

    res.setHeader("Content-Type", mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.sendFile(storage_path);
  } catch (err) {
    console.error("GET /receipts error:", err);
    res.status(500).json({ error: "Failed to load receipt." });
  }
});

export default router;
