#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.LOG_DIR || "./logs";
const SENSITIVE_PATTERNS = [/taxId/i, /tax_id/i, /taxid/i, /taxId_jwe/i, /ein/i, /bn/i];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      return { file: filePath, pattern: pattern.source };
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(LOG_DIR)) {
    console.log(`Log directory not found: ${LOG_DIR}`);
    return;
  }
  const files = fs.readdirSync(LOG_DIR);
  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    if (!fs.statSync(filePath).isFile()) continue;
    const violation = scanFile(filePath);
    if (violation) {
      console.error("Sensitive pattern detected:", violation);
      process.exit(1);
    }
  }
  console.log("No sensitive patterns detected.");
}

main();
