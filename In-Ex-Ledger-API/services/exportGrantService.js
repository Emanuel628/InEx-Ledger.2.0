const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db.js");

const EXPORT_GRANT_SECRET = process.env.EXPORT_GRANT_SECRET;
const EXPORT_GRANT_TTL_MS = Number(process.env.EXPORT_GRANT_TTL_MS || 60_000);
const JWT_ALGORITHM = "HS512";
const ACTION_SCOPE = "generate_pdf";

if (!EXPORT_GRANT_SECRET) {
  console.warn("EXPORT_GRANT_SECRET is not configured; export grants cannot be issued.");
}

function ensureSecret() {
  if (!EXPORT_GRANT_SECRET) {
    throw new Error("EXPORT_GRANT_SECRET environment variable is required.");
  }
}

async function issueExportGrant({ businessId, userId, exportType = "pdf", includeTaxId = false, dateRange, metadata = {} }) {
  ensureSecret();
  const now = Date.now();
  const expiresAt = now + EXPORT_GRANT_TTL_MS;
  const jti = crypto.randomUUID();
  const payload = {
    jti,
    action: ACTION_SCOPE,
    businessId,
    userId,
    exportType,
    includeTaxId,
    dateRange,
    metadata,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expiresAt / 1000)
  };

  const token = jwt.sign(payload, EXPORT_GRANT_SECRET, {
    algorithm: JWT_ALGORITHM
  });

  await pool.query(
    "INSERT INTO export_grant_jtis (jti, expires_at) VALUES ($1, $2)",
    [jti, new Date(expiresAt)]
  );

  return { token, expiresAt, jti };
}

async function verifyExportGrant(token) {
  ensureSecret();
  const payload = jwt.verify(token, EXPORT_GRANT_SECRET, {
    algorithms: [JWT_ALGORITHM]
  });

  if (payload.action !== ACTION_SCOPE) {
    throw new Error("Grant token action is not supported.");
  }

  // Atomically consume the JTI — if it was already used or expired, rowCount will be 0
  await pool.query("DELETE FROM export_grant_jtis WHERE expires_at <= NOW()");
  const result = await pool.query(
    "DELETE FROM export_grant_jtis WHERE jti = $1 AND expires_at > NOW() RETURNING jti",
    [payload.jti]
  );

  if (result.rowCount === 0) {
    throw new Error("Grant token has already been used or expired.");
  }

  return payload;
}

module.exports = { issueExportGrant, verifyExportGrant };
