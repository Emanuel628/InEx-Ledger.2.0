const SENSITIVE_KEYS = new Set([
  "taxid",
  "taxid_jwe",
  "ein",
  "bn",
  "tax_id",
  "tax-id",
  "ssn",
  "sin"
]);

const STRING_PATTERNS = [
  /taxId/gi,
  /tax_id/gi,
  /taxid/gi,
  /ein/gi,
  /bn/gi
];

function maskString(value) {
  if (typeof value !== "string") return value;
  let redacted = value;
  for (const pattern of STRING_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return maskString(payload);
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizePayload(entry));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = maskString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((entry) => sanitizePayload(entry));
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = { sanitizePayload };