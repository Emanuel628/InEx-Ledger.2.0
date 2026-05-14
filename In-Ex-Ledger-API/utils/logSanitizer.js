const SENSITIVE_KEYS = new Set([
  // Compare against lowercased keys only.
  "taxid", "taxid_jwe", "tax_id", "tax_id_jwe", "tax-id", "taxidjwe",
  "ein", "ein_jwe", "einjwe",
  "bn", "bn_jwe", "bnjwe",
  "ssn", "ssn_jwe", "ssnjwe",
  "sin", "sin_jwe", "sinjwe",
  "password", "password_hash", "passwordhash",
  "token", "access_token", "refresh_token", "accesstoken", "refreshtoken",
  "secret", "api_key", "apikey", "private_key", "privatekey",
  "credit_card", "creditcard", "card_number", "cardnumber", "cvv", "cvc"
]);

const STRING_PATTERNS = [
  /taxId/gi,
  /tax_id/gi,
  /taxid/gi,
  /\bein\b/gi,
  /\bbn\b/gi,
  /\bssn\b/gi,
  /\bsin\b/gi
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
