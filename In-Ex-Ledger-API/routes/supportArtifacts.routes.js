"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createRouteLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError } = require("../utils/logger.js");
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");
const {
  ensureSupportArtifactStorageDir,
  resolveSupportArtifactFilePath
} = require("../services/supportArtifactStorage.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createRouteLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "rl:support-artifacts",
  keyStrategy: "user",
  message: "Too many support artifact requests. Please slow down and try again."
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NOTE_LENGTH = 4000;
const FILE_ARTIFACT_TYPES = new Set([
  "receipt",
  "invoice",
  "mileage_log",
  "allocation_worksheet",
  "home_office_worksheet",
  "capital_asset_support",
  "tax_profile_support"
]);
const ALL_ARTIFACT_TYPES = new Set([...FILE_ARTIFACT_TYPES, "review_note"]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
  ".csv",
  ".xls",
  ".xlsx"
]);

const MIME_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".txt", "text/plain"],
  [".csv", "text/csv"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
]);

const INLINE_SAFE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter(_req, file, cb) {
    const mimeType = normalizeUploadedSupportMimeType(file);
    if (!mimeType) {
      const error = new Error("Unsupported support file type.");
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  }
});

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function normalizeUploadedSupportMimeType(file) {
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

function getSafeSupportArtifactResponseMimeType(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  return INLINE_SAFE_MIME_TYPES.has(normalized)
    ? normalized
    : "application/octet-stream";
}

function shouldInlineSupportArtifactMimeType(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  return INLINE_SAFE_MIME_TYPES.has(normalized);
}

async function writeSupportArtifactFile(buffer, originalName) {
  const storageDir = ensureSupportArtifactStorageDir();
  const ext = path.extname(String(originalName || "")).toLowerCase();
  const storagePath = path.join(storageDir, `${crypto.randomUUID()}${ext}`);
  await fsp.writeFile(storagePath, buffer);
  return storagePath;
}

async function verifyTransactionOwnership(transactionId, businessId) {
  const result = await pool.query(
    `SELECT id
       FROM transactions
      WHERE id = $1
        AND business_id = $2
      LIMIT 1`,
    [transactionId, businessId]
  );
  return result.rowCount > 0;
}

router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = String(req.query.transaction_id || "").trim();
    if (!isUuid(transactionId)) {
      return res.status(400).json({ error: "transaction_id is required." });
    }

    const result = await pool.query(
      `SELECT id, transaction_id, artifact_type, filename, mime_type, review_status, notes, uploaded_at
         FROM support_artifacts
        WHERE business_id = $1
          AND transaction_id = $2
        ORDER BY uploaded_at DESC, created_at DESC`,
      [businessId, transactionId]
    );

    return res.json(result.rows);
  } catch (err) {
    logError("GET /support-artifacts error:", err);
    return res.status(500).json({ error: "Failed to load support artifacts." });
  }
});

router.post("/review-note", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = String(req.body?.transaction_id || "").trim();
    const notes = String(req.body?.notes || "").trim();

    if (!isUuid(transactionId)) {
      return res.status(400).json({ error: "transaction_id must be a valid UUID." });
    }
    if (!notes) {
      return res.status(400).json({ error: "notes are required." });
    }
    if (notes.length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `notes must be ${MAX_NOTE_LENGTH} characters or fewer.` });
    }
    if (!(await verifyTransactionOwnership(transactionId, businessId))) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    const artifactId = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO support_artifacts (
         id, business_id, transaction_id, artifact_type, scope_type, scope_id,
         filename, review_status, notes, uploaded_by_user_id
       ) VALUES ($1, $2, $3, 'review_note', 'transaction', $3, $4, 'accepted', $5, $6)
       RETURNING id, transaction_id, artifact_type, filename, mime_type, review_status, notes, uploaded_at`,
      [artifactId, businessId, transactionId, "Review note", notes, req.user.id]
    );
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Support artifacts changed after export."
    }).catch((error) => logError("Support artifact snapshot invalidation failed:", error));

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logError("POST /support-artifacts/review-note error:", err);
    return res.status(500).json({ error: "Failed to save review note." });
  }
});

router.post("/upload", upload.single("artifact"), async (req, res) => {
  let storagePath = null;

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const transactionId = String(req.body?.transaction_id || "").trim();
    const artifactType = String(req.body?.artifact_type || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim();

    if (!req.file) {
      return res.status(400).json({ error: "artifact file is required." });
    }
    if (!isUuid(transactionId)) {
      return res.status(400).json({ error: "transaction_id must be a valid UUID." });
    }
    if (!FILE_ARTIFACT_TYPES.has(artifactType)) {
      return res.status(400).json({ error: "artifact_type is invalid for file upload." });
    }
    if (notes.length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `notes must be ${MAX_NOTE_LENGTH} characters or fewer.` });
    }
    if (!(await verifyTransactionOwnership(transactionId, businessId))) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    storagePath = await writeSupportArtifactFile(req.file.buffer, req.file.originalname);
    const artifactId = crypto.randomUUID();
    const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const result = await pool.query(
      `INSERT INTO support_artifacts (
         id, business_id, transaction_id, artifact_type, scope_type, scope_id,
         filename, mime_type, storage_path, file_hash, storage_status, review_status,
         notes, uploaded_by_user_id
       ) VALUES ($1, $2, $3, $4, 'transaction', $3, $5, $6, $7, $8, 'present', 'accepted', $9, $10)
       RETURNING id, transaction_id, artifact_type, filename, mime_type, review_status, notes, uploaded_at`,
      [
        artifactId,
        businessId,
        transactionId,
        artifactType,
        req.file.originalname,
        String(req.file.mimetype || "").trim().toLowerCase(),
        storagePath,
        fileHash,
        notes || null,
        req.user.id
      ]
    );
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Support artifacts changed after export."
    }).catch((error) => logError("Support artifact snapshot invalidation failed:", error));

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (storagePath) {
      await fsp.unlink(storagePath).catch(() => {});
    }
    const status = Number(err?.status || 0) || 500;
    logError("POST /support-artifacts/upload error:", err);
    return res.status(status).json({ error: err.message || "Failed to upload support artifact." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const artifactId = String(req.params.id || "").trim();
    if (!isUuid(artifactId)) {
      return res.status(400).json({ error: "Invalid support artifact ID." });
    }

    const result = await pool.query(
      `SELECT id, filename, mime_type, storage_path
         FROM support_artifacts
        WHERE id = $1
          AND business_id = $2
        LIMIT 1`,
      [artifactId, businessId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: "Support artifact not found." });
    }

    const row = result.rows[0];
    const resolvedPath = resolveSupportArtifactFilePath(row.storage_path);
    if (!resolvedPath) {
      return res.status(404).json({ error: "Support file missing." });
    }

    const responseMimeType = getSafeSupportArtifactResponseMimeType(row.mime_type);
    const dispositionType = shouldInlineSupportArtifactMimeType(row.mime_type) ? "inline" : "attachment";
    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", responseMimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${dispositionType}; filename*=UTF-8''${encodeURIComponent(row.filename || "support-file")}`);
    return res.sendFile(resolvedPath);
  } catch (err) {
    logError("GET /support-artifacts/:id error:", err);
    return res.status(500).json({ error: "Failed to load support artifact." });
  }
});

module.exports = router;
