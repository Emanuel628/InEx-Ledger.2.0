"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SUPPORT_ARTIFACT_STORAGE_DIR = path.join(process.cwd(), "storage", "support-artifacts");

function getSupportArtifactStorageDir() {
  return path.resolve(process.env.SUPPORT_ARTIFACT_STORAGE_DIR || DEFAULT_SUPPORT_ARTIFACT_STORAGE_DIR);
}

function ensureSupportArtifactStorageDir() {
  const directory = getSupportArtifactStorageDir();
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function normalizeSupportArtifactCandidate(filePath) {
  const storageDir = getSupportArtifactStorageDir();
  const rawPath = String(filePath || "").trim();
  if (!rawPath) {
    return null;
  }

  // path.basename() only treats "\" as a separator on win32; normalize it to
  // "/" first so a Windows-style traversal string is stripped down to a bare
  // filename on every host OS, not just Windows.
  const candidate = path.resolve(storageDir, path.basename(rawPath.replace(/\\/g, "/")));
  const storageRoot = `${storageDir}${path.sep}`;
  if (!candidate.startsWith(storageRoot)) {
    return null;
  }
  return candidate;
}

function resolveSupportArtifactFilePath(filePath) {
  const candidate = normalizeSupportArtifactCandidate(filePath);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

module.exports = {
  ensureSupportArtifactStorageDir,
  getSupportArtifactStorageDir,
  normalizeSupportArtifactCandidate,
  resolveSupportArtifactFilePath
};
