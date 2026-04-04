#!/usr/bin/env node
/**
 * sync-frontend.js
 *
 * Copies built frontend assets from InEx-Ledger-Frontend/ into the API's
 * public/ directory so the server always serves the latest frontend build.
 *
 * Usage:
 *   node scripts/sync-frontend.js
 *   node scripts/sync-frontend.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'InEx-Ledger-Frontend');
const DEST = path.join(ROOT, 'In-Ex-Ledger-API', 'public');

const isDryRun = process.argv.includes('--dry-run');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (!isDryRun) fs.mkdirSync(dir, { recursive: true });
    console.log(`  [mkdir] ${path.relative(ROOT, dir)}`);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const rel = path.relative(ROOT, dest);
    if (!isDryRun) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
    console.log(`  [copy]  ${rel}`);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`Source directory not found: ${SRC}`);
  console.error('Make sure the InEx-Ledger-Frontend directory exists at the repo root.');
  process.exit(1);
}

console.log(`Syncing frontend assets${isDryRun ? ' (dry run)' : ''}...`);
console.log(`  src:  ${SRC}`);
console.log(`  dest: ${DEST}`);
console.log('');

copyRecursive(SRC, DEST);

console.log('');
console.log(`✅ Sync ${isDryRun ? 'preview' : 'complete'}.`);
