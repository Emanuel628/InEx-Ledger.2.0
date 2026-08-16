"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  cleanupExportFile,
  __private: {
    resolveManagedExportPath
  }
} = require("../services/exportStorage.js");

const exportStorageDir = path.resolve(process.cwd(), "storage", "exports");

test("cleanupExportFile deletes managed export files and reports the outcome", async () => {
  fs.mkdirSync(exportStorageDir, { recursive: true });
  const filePath = path.join(exportStorageDir, `${crypto.randomUUID()}.redacted.pdf`);
  fs.writeFileSync(filePath, "pdf");

  const result = await cleanupExportFile(filePath);

  assert.deepEqual(result, { status: "deleted" });
  assert.equal(fs.existsSync(filePath), false);
});

test("cleanupExportFile treats an already-missing managed file as cleanup-complete", async () => {
  const filePath = path.join(exportStorageDir, `${crypto.randomUUID()}.redacted.pdf`);

  const result = await cleanupExportFile(filePath);

  assert.deepEqual(result, { status: "missing" });
});

test("cleanupExportFile refuses paths outside managed export storage", async () => {
  const result = await cleanupExportFile(path.resolve(process.cwd(), "outside-export.pdf"));

  assert.equal(result.status, "failed");
  assert.match(result.reason, /Invalid export path/);
});

test("resolveManagedExportPath keeps export files inside storage/exports", () => {
  const filePath = path.join(exportStorageDir, "safe.redacted.pdf");

  assert.equal(resolveManagedExportPath(filePath), filePath);
  assert.throws(
    () => resolveManagedExportPath(path.resolve(process.cwd(), "safe.redacted.pdf")),
    /Invalid export path/
  );
});
