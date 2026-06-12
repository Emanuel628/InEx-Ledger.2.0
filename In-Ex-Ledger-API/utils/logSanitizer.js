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
  "credit_card", "creditcard", "card_number", "cardnumber", "cvv", "cvc",
  "authorization", "cookie", "set-cookie", "setcookie",
  "forwardedfor", "forwarded_for", "x-forwarded-for"
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

const EMAIL_PATTERN = /([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})/gi;

function maskEmailString(value) {
  return String(value).replace(EMAIL_PATTERN, (_full, localPart, domainPart) => {
    const safeLocal = String(localPart || "");
    const safeDomain = String(domainPart || "");
    const maskedLocal = safeLocal.length <= 2
      ? `${safeLocal.charAt(0) || "*"}*`
      : `${safeLocal.slice(0, 2)}***`;
    const domainSegments = safeDomain.split(".");
    const root = domainSegments.shift() || "";
    const maskedRoot = root.length <= 2
      ? `${root.charAt(0) || "*"}*`
      : `${root.slice(0, 2)}***`;
    return `${maskedLocal}@${[maskedRoot, ...domainSegments].join(".")}`;
  });
}

function maskString(value) {
  if (typeof value !== "string") return value;
  let redacted = value;
  for (const pattern of STRING_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return maskEmailString(redacted);
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
