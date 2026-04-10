const fs = require("fs");
const path = require("path");
const { logError, logInfo, logWarn } = require("../utils/logger.js");

const DEFAULT_RECEIPT_STORAGE_DIR = path.join(process.cwd(), "storage", "receipts");

let lastReceiptStorageStatus = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getReceiptStorageDir() {
  return path.resolve(process.env.RECEIPT_STORAGE_DIR || DEFAULT_RECEIPT_STORAGE_DIR);
}

function isReceiptStoragePersistenceConfirmed() {
  return process.env.RECEIPT_STORAGE_PERSISTENT === "true";
}

function buildReceiptStorageStatus(error = null) {
  const directory = getReceiptStorageDir();
  const writable = !error;
  const persistentConfirmed = isReceiptStoragePersistenceConfirmed() && writable;
  const persistenceRequired = isProduction();
  const available = writable && (!persistenceRequired || persistentConfirmed);
  let mode = "development";

  if (persistenceRequired && !available) {
    mode = "degraded";
  } else if (persistenceRequired) {
    mode = "enforced";
  } else if (persistentConfirmed) {
    mode = "persistent-confirmed";
  }

  return {
    available,
    backend: "local-disk",
    directory,
    lastError: error ? error.message : null,
    mode,
    persistenceRequired,
    persistentConfirmed,
    writable
  };
}

function verifyDirectoryWritable(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
}

function refreshReceiptStorageStatus() {
  const directory = getReceiptStorageDir();
  let status;

  try {
    verifyDirectoryWritable(directory);
    status = buildReceiptStorageStatus();
  } catch (error) {
    status = buildReceiptStorageStatus(error);
  }

  lastReceiptStorageStatus = status;
  return status;
}

function getReceiptStorageStatus() {
  return refreshReceiptStorageStatus();
}

function logReceiptStorageStatus(status) {
  if (status.available) {
    logInfo("Receipt storage ready", {
      backend: status.backend,
      directory: status.directory,
      mode: status.mode,
      persistentConfirmed: status.persistentConfirmed
    });
    return;
  }

  const context = {
    backend: status.backend,
    directory: status.directory,
    lastError: status.lastError,
    mode: status.mode,
    persistentConfirmed: status.persistentConfirmed,
    writable: status.writable
  };

  if (status.persistenceRequired && !status.persistentConfirmed) {
    logError("Receipt storage persistence is not confirmed for production", context);
    return;
  }

  logError("Receipt storage is unavailable", context);
}

function initializeReceiptStorage() {
  const status = refreshReceiptStorageStatus();
  logReceiptStorageStatus(status);
  return status;
}

function isManagedReceiptPath(filePath) {
  if (!filePath) {
    return false;
  }

  const storageDir = `${getReceiptStorageDir()}${path.sep}`;
  return path.resolve(filePath).startsWith(storageDir);
}

function requirePersistentReceiptStorage(req, res, next) {
  const status = refreshReceiptStorageStatus();
  if (status.available) {
    return next();
  }

  logWarn("Receipt upload blocked because storage is not production-safe", {
    directory: status.directory,
    lastError: status.lastError,
    path: req.originalUrl || req.path,
    persistentConfirmed: status.persistentConfirmed,
    writable: status.writable
  });

  const error = status.persistenceRequired && !status.persistentConfirmed
    ? "Receipt uploads are unavailable until persistent storage is confirmed."
    : "Receipt storage is temporarily unavailable.";

  return res.status(503).json({ error });
}

function resetReceiptStorageStatusForTests() {
  lastReceiptStorageStatus = null;
}

module.exports = {
  getReceiptStorageDir,
  getReceiptStorageStatus,
  initializeReceiptStorage,
  isManagedReceiptPath,
  requirePersistentReceiptStorage,
  resetReceiptStorageStatusForTests
};
