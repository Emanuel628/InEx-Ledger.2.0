#!/usr/bin/env node
/**
 * check-bundle-drift.js
 *
 * Verifies that every <script src="..."> reference in the HTML pages under
 * In-Ex-Ledger-API/public/html/ resolves to a real file on disk.
 *
 * A "bundle drift" occurs when a JS file is referenced from HTML but the file
 * itself no longer exists (e.g., it was renamed or deleted without updating the
 * HTML).  This check runs in CI to catch those mismatches early.
 *
 * Exit codes:
 *   0 — no drift detected
 *   1 — one or more referenced scripts are missing from disk
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HTML_DIR = path.join(__dirname, "..", "In-Ex-Ledger-API", "public", "html");
const PUBLIC_DIR = path.join(__dirname, "..", "In-Ex-Ledger-API", "public");

// Regex that matches <script src="..."> attributes (with or without query strings)
const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"'?#]+)[^"']*["']/gi;

let drift = false;
let checkedFiles = 0;
let checkedRefs = 0;

const htmlFiles = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith(".html"));

for (const htmlFile of htmlFiles) {
  const htmlPath = path.join(HTML_DIR, htmlFile);
  const content = fs.readFileSync(htmlPath, "utf8");

  let match;
  SCRIPT_SRC_RE.lastIndex = 0;

  while ((match = SCRIPT_SRC_RE.exec(content)) !== null) {
    const rawSrc = match[1].trim();

    // Skip external URLs (http/https/protocol-relative)
    if (/^https?:\/\//.test(rawSrc) || rawSrc.startsWith("//")) {
      continue;
    }

    // Normalise relative paths like ../js/foo.js or ../../js/foo.js → /js/foo.js
    const normalised = rawSrc.replace(/^(\.\.\/)+/, "/");
    const filePath = path.join(PUBLIC_DIR, normalised);

    // Guard against path traversal: resolved path must stay inside PUBLIC_DIR
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
      console.error(
        `[bundle-drift] SKIP: "${rawSrc}" resolves outside public directory — skipping`
      );
      continue;
    }

    checkedRefs += 1;

    if (!fs.existsSync(filePath)) {
      console.error(
        `[bundle-drift] MISSING: ${htmlFile} references "${rawSrc}" but "${filePath}" does not exist`
      );
      drift = true;
    }
  }

  checkedFiles += 1;
}

if (drift) {
  console.error(`[bundle-drift] FAIL — script references are missing from disk.`);
  process.exit(1);
} else {
  console.log(
    `[bundle-drift] OK — checked ${checkedFiles} HTML file(s), ${checkedRefs} script reference(s), no drift detected.`
  );
  process.exit(0);
}
