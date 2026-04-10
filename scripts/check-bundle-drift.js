#!/usr/bin/env node
/**
 * check-bundle-drift.js
 *
 * Ensures that shared JS files in public/js/ remain in sync with
 * the canonical copies in In-Ex-Ledger-API/public/js/.
 *
 * Files that exist only in In-Ex-Ledger-API/public/js/ (like landing.js)
 * are allowed and not treated as drift.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const CANONICAL_DIR = path.join(ROOT_DIR, "In-Ex-Ledger-API", "public", "js");
const MIRROR_DIR = path.join(ROOT_DIR, "public", "js");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const mirrorFiles = fs.readdirSync(MIRROR_DIR).filter((f) => f.endsWith(".js"));

let driftDetected = false;

for (const file of mirrorFiles) {
  const canonicalPath = path.join(CANONICAL_DIR, file);
  const mirrorPath = path.join(MIRROR_DIR, file);

  if (!fs.existsSync(canonicalPath)) {
    console.error(`[DRIFT] ${file}: exists in public/js/ but not in In-Ex-Ledger-API/public/js/`);
    driftDetected = true;
    continue;
  }

  const canonicalHash = sha256(canonicalPath);
  const mirrorHash = sha256(mirrorPath);

  if (canonicalHash !== mirrorHash) {
    console.error(`[DRIFT] ${file}: content differs between public/js/ and In-Ex-Ledger-API/public/js/`);
    driftDetected = true;
  }
}

if (driftDetected) {
  console.error("\nBundle drift detected. Sync public/js/ from In-Ex-Ledger-API/public/js/ before merging.");
  process.exit(1);
} else {
  console.log("Bundle check passed: public/js/ is in sync with In-Ex-Ledger-API/public/js/");
  process.exit(0);
}
