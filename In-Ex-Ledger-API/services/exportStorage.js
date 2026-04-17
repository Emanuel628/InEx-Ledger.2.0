const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXPORT_STORAGE_DIR = path.resolve(process.cwd(), "storage", "exports");

function ensureStorageDir() {
  if (!fs.existsSync(EXPORT_STORAGE_DIR)) {
    fs.mkdirSync(EXPORT_STORAGE_DIR, { recursive: true });
  }
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
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(EXPORT_STORAGE_DIR + path.sep) && resolvedPath !== EXPORT_STORAGE_DIR) {
    throw new Error("Invalid export path");
  }
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

async function deleteExportFile(filePath) {
  if (!filePath) return;
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(EXPORT_STORAGE_DIR + path.sep) && resolvedPath !== EXPORT_STORAGE_DIR) {
    throw new Error("Invalid export path");
  }
  try {
    await fs.promises.unlink(resolvedPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { saveRedactedPdf, buildRedactedStream, deleteExportFile };
