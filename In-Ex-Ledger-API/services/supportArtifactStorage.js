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

function resolveSupportArtifactFilePath(filePath) {
  if (!filePath) return null;
  const rawPath = String(filePath).trim();
  if (!rawPath) return null;

  const candidates = [];
  candidates.push(path.resolve(rawPath));
  if (!path.isAbsolute(rawPath)) {
    candidates.push(path.resolve(process.cwd(), rawPath));
  }
  const basename = path.basename(rawPath);
  if (basename) {
    candidates.push(path.join(getSupportArtifactStorageDir(), basename));
  }

  for (const candidate of [...new Set(candidates)]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  ensureSupportArtifactStorageDir,
  getSupportArtifactStorageDir,
  resolveSupportArtifactFilePath
};
