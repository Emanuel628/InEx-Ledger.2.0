const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXPORT_STORAGE_DIR = path.resolve(process.cwd(), "storage", "exports");

function ensureStorageDir() {
  if (!fs.existsSync(EXPORT_STORAGE_DIR)) {
    fs.mkdirSync(EXPORT_STORAGE_DIR, { recursive: true });
  }
}

function resolveManagedExportPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(EXPORT_STORAGE_DIR + path.sep) && resolvedPath !== EXPORT_STORAGE_DIR) {
    throw new Error("Invalid export path");
  }
  return resolvedPath;
}

async function saveRedactedPdf(jobId, buffer) {
  ensureStorageDir();
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-_]/g, "") || crypto.randomUUID();
  const filename = `${safeJobId}.redacted.pdf`;
  const filePath = path.join(EXPORT_STORAGE_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return { filePath, hash };
}

function buildRedactedStream(res, filePath) {
  const resolvedPath = resolveManagedExportPath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Redacted export not found.");
  }

  const stream = fs.createReadStream(resolvedPath);
  stream.on("error", (err) => {
    stream.destroy();
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
}

async function cleanupExportFile(filePath) {
  if (!filePath) {
    return { status: "not_applicable" };
  }

  let resolvedPath;
  try {
    resolvedPath = resolveManagedExportPath(filePath);
  } catch (err) {
    return { status: "failed", reason: err.message };
  }

  try {
    await fs.promises.unlink(resolvedPath);
    return { status: "deleted" };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { status: "missing" };
    }
    return { status: "failed", reason: err.message };
  }
}

async function deleteExportFile(filePath) {
  const result = await cleanupExportFile(filePath);
  if (result.status === "failed") {
    throw new Error(result.reason || "Export file cleanup failed");
  }
}

module.exports = {
  saveRedactedPdf,
  buildRedactedStream,
  cleanupExportFile,
  deleteExportFile,
  __private: {
    resolveManagedExportPath
  }
};
