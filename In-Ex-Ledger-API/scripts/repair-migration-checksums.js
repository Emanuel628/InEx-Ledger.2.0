"use strict";

const fs = require("fs");
const path = require("path");

const { pool, withRetry, computeChecksum } = require("../db.js");

const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum   TEXT        NOT NULL
  )
`;

function parseArgs(argv) {
  let write = false;
  let file = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--file") {
      file = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      file = arg.slice("--file=".length) || null;
    }
  }

  return { help: false, write, file };
}

function printHelp() {
  console.log("Usage: node scripts/repair-migration-checksums.js [--write] [--file <migration.sql>]");
  console.log("");
  console.log("Default mode is dry-run verification and exits non-zero when checksum drift is found.");
  console.log("--write updates schema_migrations.checksum to match the current migration file content.");
  console.log("--file limits verification/repair to a single applied migration filename.");
}

function getMigrationsDir() {
  return path.join(__dirname, "..", "db", "migrations");
}

function loadCurrentMigrationChecksums(migrationsDir) {
  const filenames = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const checksums = new Map();
  for (const filename of filenames) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, "utf8");
    checksums.set(filename, computeChecksum(sql));
  }
  return checksums;
}

async function loadAppliedMigrations() {
  await withRetry(() => pool.query(BOOTSTRAP_SQL));
  const result = await withRetry(() =>
    pool.query("SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename")
  );
  return result.rows;
}

function buildDriftReport(appliedRows, currentChecksums, fileFilter) {
  const drifted = [];
  const missingFiles = [];

  for (const row of appliedRows) {
    if (fileFilter && row.filename !== fileFilter) {
      continue;
    }

    if (!currentChecksums.has(row.filename)) {
      missingFiles.push({
        filename: row.filename,
        appliedAt: row.applied_at
      });
      continue;
    }

    const currentChecksum = currentChecksums.get(row.filename);
    if (currentChecksum !== row.checksum) {
      drifted.push({
        filename: row.filename,
        appliedAt: row.applied_at,
        storedChecksum: row.checksum,
        currentChecksum
      });
    }
  }

  return { drifted, missingFiles };
}

function printReport({ drifted, missingFiles }) {
  if (!drifted.length && !missingFiles.length) {
    console.log("Migration checksums match the current files.");
    return;
  }

  if (missingFiles.length) {
    console.error("Applied migrations missing from disk:");
    for (const item of missingFiles) {
      console.error(`- ${item.filename} (applied ${item.appliedAt})`);
    }
  }

  if (drifted.length) {
    console.error("Applied migrations with checksum drift:");
    for (const item of drifted) {
      console.error(`- ${item.filename}`);
      console.error(`  stored:  ${item.storedChecksum}`);
      console.error(`  current: ${item.currentChecksum}`);
    }
  }
}

async function writeRepairs(drifted) {
  const client = await withRetry(() => pool.connect());
  try {
    await client.query("BEGIN");
    for (const item of drifted) {
      await client.query(
        "UPDATE schema_migrations SET checksum = $2 WHERE filename = $1",
        [item.filename, item.currentChecksum]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(`Rollback failed while repairing migration checksums: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const migrationsDir = getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const currentChecksums = loadCurrentMigrationChecksums(migrationsDir);
  const appliedRows = await loadAppliedMigrations();

  if (args.file && !appliedRows.some((row) => row.filename === args.file)) {
    throw new Error(`Applied migration not found in schema_migrations: ${args.file}`);
  }

  const report = buildDriftReport(appliedRows, currentChecksums, args.file);
  printReport(report);

  if (!report.drifted.length && !report.missingFiles.length) {
    return;
  }

  if (report.missingFiles.length) {
    throw new Error("Cannot repair checksum drift while applied migration files are missing from disk.");
  }

  if (!args.write) {
    throw new Error(
      "Migration checksum drift detected. Re-run with --write only after confirming the live schema already matches the current migration files."
    );
  }

  await writeRepairs(report.drifted);
  console.log(`Updated checksum metadata for ${report.drifted.length} migration(s).`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
