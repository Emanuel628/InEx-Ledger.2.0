import fs from "node:fs";
import path from "node:path";

const EXPORT_DIR = path.join(process.cwd(), "storage", "exports");

if (!fs.existsSync(EXPORT_DIR)) {
  console.log(`Export storage directory not found at ${EXPORT_DIR}; nothing to verify.`);
  process.exit(0);
}

const entries = fs.readdirSync(EXPORT_DIR).filter((entry) => entry.endsWith(".redacted.pdf"));
const allFiles = fs.readdirSync(EXPORT_DIR);

const invalidFiles = allFiles.filter((entry) => !entry.endsWith(".redacted.pdf"));

if (invalidFiles.length) {
  console.error("Detected non-redacted artifacts in export storage:");
  invalidFiles.forEach((file) => console.error(` - ${file}`));
  process.exit(1);
}

console.log(`Verified ${entries.length} redacted exports only (${EXPORT_DIR}).`);
