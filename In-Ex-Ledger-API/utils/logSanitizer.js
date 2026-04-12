const SENSITIVE_KEYS = new Set([
  // Tax identifiers — snake_case, camelCase, hyphen, JWE variants
  "taxid", "taxid_jwe", "tax_id", "tax_id_jwe", "tax-id",
  "taxId", "taxIdJwe", "taxIdjwe",
  // US / Canada employer / business numbers
  "ein", "ein_jwe", "einJwe",
  "bn", "bn_jwe", "bnJwe",
  // Social / national identifiers
  "ssn", "ssn_jwe", "ssnJwe",
  "sin", "sin_jwe", "sinJwe",
  // Generic secrets / credentials that must never reach logs
  "password", "password_hash", "passwordHash",
  "token", "access_token", "refresh_token", "accessToken", "refreshToken",
  "secret", "api_key", "apiKey", "private_key", "privateKey",
  "credit_card", "creditCard", "card_number", "cardNumber", "cvv", "cvc"
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