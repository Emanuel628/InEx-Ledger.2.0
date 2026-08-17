"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");

const SCRIPT_PATH = require.resolve("../scripts/repair-migration-checksums.js");

function computeChecksum(content) {
  return crypto.createHash("sha256").update(String(content), "utf8").digest("hex");
}

function loadScript({ appliedRows = [], onUpdate = null } = {}) {
  const originalLoad = Module._load.bind(Module);
  const queries = [];

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params) {
            queries.push({ sql, params });
            if (/CREATE TABLE/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }
            if (/SELECT filename, checksum, applied_at FROM schema_migrations/i.test(sql)) {
              return { rows: appliedRows, rowCount: appliedRows.length };
            }
            if (/UPDATE schema_migrations SET checksum/i.test(sql)) {
              if (onUpdate) onUpdate(params);
              return { rows: [], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
          async connect() {
            return {
              async query(sql, params) {
                queries.push({ sql, params });
                if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                  return { rows: [], rowCount: 0 };
                }
                if (/UPDATE schema_migrations SET checksum/i.test(sql)) {
                  if (onUpdate) onUpdate(params);
                  return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
              },
              release() {}
            };
          },
          async end() {}
        },
        withRetry: (fn) => fn(),
        computeChecksum,
        getCanonicalMigrationFilename: (filename) => filename
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[SCRIPT_PATH];
  const script = require(SCRIPT_PATH);
  Module._load = originalLoad;

  return {
    script,
    queries,
    cleanup() {
      delete require.cache[SCRIPT_PATH];
    }
  };
}

test("parseArgs defaults to read-only verification (write: false)", () => {
  const { script, cleanup } = loadScript();
  try {
    assert.deepEqual(script.parseArgs([]), { help: false, write: false, file: null });
  } finally {
    cleanup();
  }
});

test("parseArgs recognizes --write, --file, and --help", () => {
  const { script, cleanup } = loadScript();
  try {
    assert.equal(script.parseArgs(["--write"]).write, true);
    assert.equal(script.parseArgs(["--file", "0001_init.sql"]).file, "0001_init.sql");
    assert.equal(script.parseArgs(["--file=0002_next.sql"]).file, "0002_next.sql");
    assert.equal(script.parseArgs(["--help"]).help, true);
    assert.equal(script.parseArgs(["-h"]).help, true);
  } finally {
    cleanup();
  }
});

test("buildDriftReport detects checksum drift and missing files separately", () => {
  const { script, cleanup } = loadScript();
  try {
    const appliedRows = [
      { filename: "0001_init.sql", checksum: "stale-checksum", applied_at: new Date() },
      { filename: "0002_ok.sql", checksum: "matches", applied_at: new Date() },
      { filename: "0003_deleted.sql", checksum: "whatever", applied_at: new Date() }
    ];
    const currentChecksums = new Map([
      ["0001_init.sql", "fresh-checksum"],
      ["0002_ok.sql", "matches"]
    ]);

    const report = script.buildDriftReport(appliedRows, currentChecksums, null);

    assert.equal(report.drifted.length, 1);
    assert.equal(report.drifted[0].filename, "0001_init.sql");
    assert.equal(report.drifted[0].storedChecksum, "stale-checksum");
    assert.equal(report.drifted[0].currentChecksum, "fresh-checksum");

    assert.equal(report.missingFiles.length, 1);
    assert.equal(report.missingFiles[0].filename, "0003_deleted.sql");
  } finally {
    cleanup();
  }
});

test("buildDriftReport reports nothing when every checksum matches", () => {
  const { script, cleanup } = loadScript();
  try {
    const appliedRows = [{ filename: "0001_init.sql", checksum: "same", applied_at: new Date() }];
    const currentChecksums = new Map([["0001_init.sql", "same"]]);

    const report = script.buildDriftReport(appliedRows, currentChecksums, null);
    assert.deepEqual(report.drifted, []);
    assert.deepEqual(report.missingFiles, []);
  } finally {
    cleanup();
  }
});

test("buildDriftReport --file scopes the report to a single migration", () => {
  const { script, cleanup } = loadScript();
  try {
    const appliedRows = [
      { filename: "0001_init.sql", checksum: "stale-a", applied_at: new Date() },
      { filename: "0002_other.sql", checksum: "stale-b", applied_at: new Date() }
    ];
    const currentChecksums = new Map([
      ["0001_init.sql", "fresh-a"],
      ["0002_other.sql", "fresh-b"]
    ]);

    const report = script.buildDriftReport(appliedRows, currentChecksums, "0001_init.sql");
    assert.equal(report.drifted.length, 1);
    assert.equal(report.drifted[0].filename, "0001_init.sql");
  } finally {
    cleanup();
  }
});

// --- main(): the actual read-only-verification-vs-explicit-repair split ---

test("main() with no flags and drift present throws without writing anything", async () => {
  const content = "CREATE TABLE foo (id int);";
  const staleChecksum = "not-the-real-checksum";
  const { script, queries, cleanup } = loadScript({
    appliedRows: [{ filename: "0001_init.sql", checksum: staleChecksum, applied_at: new Date() }]
  });
  try {
    const fs = require("node:fs");
    const originalReaddirSync = fs.readdirSync;
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;
    fs.readdirSync = () => ["0001_init.sql"];
    fs.readFileSync = () => content;
    try {
      await assert.rejects(
        () => script.main([]),
        /Migration checksum drift detected/
      );
    } finally {
      fs.readdirSync = originalReaddirSync;
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
    assert.ok(
      !queries.some((q) => /UPDATE schema_migrations SET checksum/i.test(q.sql)),
      "must not write checksum metadata without --write"
    );
  } finally {
    cleanup();
  }
});

test("main() with --write and drift present repairs the checksum", async () => {
  const content = "CREATE TABLE foo (id int);";
  const staleChecksum = "not-the-real-checksum";
  const freshChecksum = computeChecksum(content);
  const updates = [];
  const { script, cleanup } = loadScript({
    appliedRows: [{ filename: "0001_init.sql", checksum: staleChecksum, applied_at: new Date() }],
    onUpdate: (params) => updates.push(params)
  });
  try {
    const fs = require("node:fs");
    const originalReaddirSync = fs.readdirSync;
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;
    fs.readdirSync = () => ["0001_init.sql"];
    fs.readFileSync = () => content;
    try {
      await script.main(["--write"]);
    } finally {
      fs.readdirSync = originalReaddirSync;
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], ["0001_init.sql", freshChecksum]);
  } finally {
    cleanup();
  }
});

test("main() with no drift is a no-op regardless of --write", async () => {
  const content = "CREATE TABLE foo (id int);";
  const matchingChecksum = computeChecksum(content);
  const { script, queries, cleanup } = loadScript({
    appliedRows: [{ filename: "0001_init.sql", checksum: matchingChecksum, applied_at: new Date() }]
  });
  try {
    const fs = require("node:fs");
    const originalReaddirSync = fs.readdirSync;
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;
    fs.readdirSync = () => ["0001_init.sql"];
    fs.readFileSync = () => content;
    try {
      await script.main(["--write"]);
    } finally {
      fs.readdirSync = originalReaddirSync;
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
    assert.ok(!queries.some((q) => /UPDATE schema_migrations SET checksum/i.test(q.sql)));
  } finally {
    cleanup();
  }
});

test("main() refuses to repair when an applied migration file is missing from disk, even with --write", async () => {
  const { script, queries, cleanup } = loadScript({
    appliedRows: [{ filename: "0001_deleted.sql", checksum: "whatever", applied_at: new Date() }]
  });
  try {
    const fs = require("node:fs");
    const originalReaddirSync = fs.readdirSync;
    const originalReadFileSync = fs.readFileSync;
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;
    fs.readdirSync = () => [];
    fs.readFileSync = () => "";
    try {
      await assert.rejects(
        () => script.main(["--write"]),
        /missing from disk/
      );
    } finally {
      fs.readdirSync = originalReaddirSync;
      fs.readFileSync = originalReadFileSync;
      fs.existsSync = originalExistsSync;
    }
    assert.ok(!queries.some((q) => /UPDATE schema_migrations SET checksum/i.test(q.sql)));
  } finally {
    cleanup();
  }
});
