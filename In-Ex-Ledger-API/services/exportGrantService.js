import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const EXPORT_GRANT_SECRET = process.env.EXPORT_GRANT_SECRET;
const EXPORT_GRANT_TTL_MS = Number(process.env.EXPORT_GRANT_TTL_MS || 60_000);
const JWT_ALGORITHM = "HS512";
const ACTION_SCOPE = "generate_pdf";

if (!EXPORT_GRANT_SECRET) {
  console.warn("EXPORT_GRANT_SECRET is not configured; export grants cannot be issued.");
}

const activeJtis = new Map();

function scheduleCleanup(jti, expiresAt) {
  const delay = Math.max(0, expiresAt - Date.now());
  setTimeout(() => {
    activeJtis.delete(jti);
  }, delay + 1000);
}

function ensureSecret() {
  if (!EXPORT_GRANT_SECRET) {
    throw new Error("EXPORT_GRANT_SECRET environment variable is required.");
  }
}

export function issueExportGrant({ businessId, userId, exportType = "pdf", includeTaxId = false, dateRange, metadata = {} }) {
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

  activeJtis.set(jti, expiresAt);
  scheduleCleanup(jti, expiresAt);

  return { token, expiresAt, jti };
}

export function verifyExportGrant(token) {
  ensureSecret();
  const payload = jwt.verify(token, EXPORT_GRANT_SECRET, {
    algorithms: [JWT_ALGORITHM]
  });

  if (payload.action !== ACTION_SCOPE) {
    throw new Error("Grant token action is not supported.");
  }

  const storedExpiry = activeJtis.get(payload.jti);
  if (!storedExpiry) {
    throw new Error("Grant token has already been used or expired.");
  }

  activeJtis.delete(payload.jti);

  if (storedExpiry < Date.now()) {
    throw new Error("Grant token has expired.");
  }

  return payload;
}
