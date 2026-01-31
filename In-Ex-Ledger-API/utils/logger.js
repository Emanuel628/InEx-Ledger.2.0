import { sanitizePayload } from "./logSanitizer.js";

function formatContext(context) {
  if (!context) return "";
  try {
    const sanitized = sanitizePayload(context);
    return JSON.stringify(sanitized);
  } catch {
    return "[UNSANITIZABLE CONTEXT]";
  }
}

export function logInfo(message, context) {
  const payload = formatContext(context);
  console.info(`[InEx][INFO] ${message}${payload ? ` ${payload}` : ""}`);
}

export function logWarn(message, context) {
  const payload = formatContext(context);
  console.warn(`[InEx][WARN] ${message}${payload ? ` ${payload}` : ""}`);
}

export function logError(message, context) {
  const payload = formatContext(context);
  console.error(`[InEx][ERROR] ${message}${payload ? ` ${payload}` : ""}`);
}
