function formatContext(context) {
  if (!context) return "";
  try {
    return JSON.stringify(context);
  } catch {
    return String(context);
  }
}

export function logInfo(message, context) {
  const payload = formatContext(context);
  console.info(`[pdf-worker][INFO] ${message}${payload ? ` ${payload}` : ""}`);
}

export function logError(message, error, context) {
  const payload = formatContext(context);
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[pdf-worker][ERROR] ${message} - ${errorMessage}${payload ? ` ${payload}` : ""}`);
}
