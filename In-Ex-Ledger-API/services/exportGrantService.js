const crypto = require("crypto");
const { pool } = require("../db.js");
const { logWarn } = require("../utils/logger.js");

const DEFAULT_EXPORT_GRANT_TTL_MS = 60_000;
const ACTION_SCOPE = "generate_pdf";

let warnedAboutMissingSecret = false;

function ensureSecret() {
  const EXPORT_GRANT_SECRET = process.env.EXPORT_GRANT_SECRET;
  if (!EXPORT_GRANT_SECRET) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      logWarn("EXPORT_GRANT_SECRET is not configured; export grant endpoints will reject requests.");
    }
    throw new Error("EXPORT_GRANT_SECRET environment variable is required.");
  }
  return EXPORT_GRANT_SECRET;
}

function encodeSegment(value) {
  const payload = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeSegment(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signWithGrantSecret(message) {
  const EXPORT_GRANT_SECRET = ensureSecret();
  return crypto.createHmac("sha256", EXPORT_GRANT_SECRET).update(message).digest("base64url");
}

function resolveGrantTtlMs() {
  const parsed = Number(process.env.EXPORT_GRANT_TTL_MS || DEFAULT_EXPORT_GRANT_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPORT_GRANT_TTL_MS;
}

function signGrantToken(payload, expiresAtMs) {
  const header = encodeSegment({ alg: "HS256", typ: "JWT" });
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const bodyPayload = {
    ...payload,
    iat: now,
    iat_ms: nowMs,
    exp: Math.ceil(expiresAtMs / 1000),
    exp_ms: expiresAtMs
  };
  const body = encodeSegment(bodyPayload);
  const signature = signWithGrantSecret(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

function verifyGrantToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [header, body, signature] = parts;
  const expected = signWithGrantSecret(`${header}.${body}`);
  const bufferSignature = Buffer.from(signature, "base64url");
  const bufferExpected = Buffer.from(expected, "base64url");
  if (
    bufferSignature.length !== bufferExpected.length ||
    !crypto.timingSafeEqual(bufferSignature, bufferExpected)
  ) {
    throw new Error("Invalid grant token signature");
  }
  const decoded = JSON.parse(decodeSegment(body));
  const nowMs = Date.now();
  if (typeof decoded.exp_ms === "number") {
    if (decoded.exp_ms <= nowMs) {
      throw new Error("Grant token expired");
    }
    return decoded;
  }

  const now = Math.floor(nowMs / 1000);
  if (typeof decoded.exp === "number" && decoded.exp <= now) {
    throw new Error("Grant token expired");
  }
  return decoded;
}

async function issueExportGrant({ businessId, userId, exportType = "pdf", includeTaxId = false, dateRange, metadata = {} }) {
  ensureSecret();
  const ttlMs = resolveGrantTtlMs();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const jti = crypto.randomUUID();
  const payload = {
    jti,
    action: ACTION_SCOPE,
    businessId,
    userId,
    exportType,
    includeTaxId,
    dateRange,
    metadata
  };

  const token = signGrantToken(payload, expiresAt);

  await pool.query(
    "INSERT INTO export_grant_jtis (jti, expires_at) VALUES ($1, $2)",
    [jti, new Date(expiresAt)]
  );

  return { token, expiresAt, jti };
}

async function verifyExportGrant(token) {
  ensureSecret();
  const payload = verifyGrantToken(token);

  if (payload.action !== ACTION_SCOPE) {
    throw new Error("Grant token action is not supported.");
  }

  // Opportunistic TTL cleanup — runs on ~1% of calls to keep the table bounded
  if (Math.random() < 0.01) {
    await pool.query("DELETE FROM export_grant_jtis WHERE expires_at <= NOW()");
  }
  // Atomically consume the JTI — if it was already used or expired, rowCount will be 0
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
