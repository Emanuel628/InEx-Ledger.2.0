const SENSITIVE_PATTERNS = [/taxId/i, /tax_id/i, /taxid/i, /taxId_jwe/i, /ein/i, /bn/i];

function safeLog(label, payload) {
  const contents = JSON.stringify(payload, (key, value) => {
    if (typeof value === "string") {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(value)) {
          return "[REDACTED]";
        }
      }
    }
    return value;
  });
  console.log(`${label}: ${contents}`);
}

function safeError(label, err, context = {}) {
  const sanitizedContext = {};
  for (const [key, value] of Object.entries(context)) {
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    sanitizedContext[key] = SENSITIVE_PATTERNS.some((pat) => pat.test(stringValue))
      ? "[REDACTED]"
      : value;
  }
  console.error(`${label}:`, err?.message || err, "context:", sanitizedContext);
}

module.exports = { safeLog, safeError };
