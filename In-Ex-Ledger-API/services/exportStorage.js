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
  if (!fs.existsSync(filePath)) {
    throw new Error("Redacted export not found.");
  }

  const stream = fs.createReadStream(filePath);
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

module.exports = { saveRedactedPdf, buildRedactedStream };
