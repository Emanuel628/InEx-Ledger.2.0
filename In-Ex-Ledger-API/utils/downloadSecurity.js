const path = require("path");

function resolvePathWithinDir(baseDir, candidatePath) {
  if (typeof candidatePath !== "string" || !candidatePath.trim()) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(candidatePath);
  if (
    resolvedCandidate === resolvedBase ||
    resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`)
  ) {
    return resolvedCandidate;
  }

  return null;
}

function sanitizeDownloadFilename(filename, fallback = "download") {
  const raw = String(filename || fallback || "download").trim() || fallback;
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  const withoutReserved = withoutControls.replace(/[\\/:*?"<>|]/g, "-");
  const collapsed = withoutReserved.replace(/\s+/g, " ").trim();
  return collapsed || fallback;
}

function buildAttachmentDisposition(filename, fallback = "download") {
  const safeUtf8 = sanitizeDownloadFilename(filename, fallback);
  const asciiFallback =
    safeUtf8
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "")
      .trim() || fallback;

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeUtf8)}`;
}

module.exports = {
  resolvePathWithinDir,
  sanitizeDownloadFilename,
  buildAttachmentDisposition
};
