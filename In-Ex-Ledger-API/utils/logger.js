const { sanitizePayload } = require("./logSanitizer.js");

function formatContext(context) {
  if (!context) return "";
  try {
    const sanitized = sanitizePayload(context);
    return JSON.stringify(sanitized);
  } catch {
    return "[UNSANITIZABLE CONTEXT]";
  }
}

function logInfo(message, context) {
  const payload = formatContext(context);
  console.info(`[InEx][INFO] ${message}${payload ? ` ${payload}` : ""}`);
}

function logWarn(message, context) {
  const payload = formatContext(context);
  console.warn(`[InEx][WARN] ${message}${payload ? ` ${payload}` : ""}`);
}

function logError(message, context) {
  const payload = formatContext(context);
  console.error(`[InEx][ERROR] ${message}${payload ? ` ${payload}` : ""}`);
}

module.exports = { logInfo, logWarn, logError };
