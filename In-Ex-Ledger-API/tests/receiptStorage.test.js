const assert = require("node:assert");
const test = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const request = require("supertest");

const {
  getReceiptStorageStatus,
  requirePersistentReceiptStorage,
  resetReceiptStorageStatusForTests
} = require("../services/receiptStorage.js");

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RECEIPT_STORAGE_DIR: process.env.RECEIPT_STORAGE_DIR,
  RECEIPT_STORAGE_PERSISTENT: process.env.RECEIPT_STORAGE_PERSISTENT
};

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test.afterEach(() => {
  restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
  restoreEnv("RECEIPT_STORAGE_DIR", originalEnv.RECEIPT_STORAGE_DIR);
  restoreEnv("RECEIPT_STORAGE_PERSISTENT", originalEnv.RECEIPT_STORAGE_PERSISTENT);
  resetReceiptStorageStatusForTests();
});

test("receipt storage is degraded in production without persistence confirmation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-storage-"));
  process.env.NODE_ENV = "production";
  process.env.RECEIPT_STORAGE_DIR = tempDir;
  process.env.RECEIPT_STORAGE_PERSISTENT = "false";

  const status = getReceiptStorageStatus();

  assert.strictEqual(status.available, false);
  assert.strictEqual(status.mode, "degraded");
  assert.strictEqual(status.writable, true);
  assert.strictEqual(status.persistentConfirmed, false);
});

test("receipt storage is enforced in production when directory is writable and persistence is confirmed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-storage-"));
  process.env.NODE_ENV = "production";
  process.env.RECEIPT_STORAGE_DIR = tempDir;
  process.env.RECEIPT_STORAGE_PERSISTENT = "true";

  const status = getReceiptStorageStatus();

  assert.strictEqual(status.available, true);
  assert.strictEqual(status.mode, "enforced");
  assert.strictEqual(status.writable, true);
  assert.strictEqual(status.persistentConfirmed, true);
});

test("receipt upload guard returns 503 when production persistence is not confirmed", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-storage-"));
  process.env.NODE_ENV = "production";
  process.env.RECEIPT_STORAGE_DIR = tempDir;
  process.env.RECEIPT_STORAGE_PERSISTENT = "false";

  const app = express();
  app.post("/receipts", requirePersistentReceiptStorage, (_req, res) => {
    res.status(204).end();
  });

  const response = await request(app).post("/receipts").expect(503);
  assert.match(response.body.error, /persistent storage/i);
});

test("receipt upload guard allows upload in production when persistence is confirmed", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-storage-"));
  process.env.NODE_ENV = "production";
  process.env.RECEIPT_STORAGE_DIR = tempDir;
  process.env.RECEIPT_STORAGE_PERSISTENT = "true";

  const app = express();
  app.post("/receipts", requirePersistentReceiptStorage, (_req, res) => {
    res.status(204).end();
  });

  await request(app).post("/receipts").expect(204);
});
