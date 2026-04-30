const pg = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Pool } = pg;

// ── SSL configuration ───────────────────────────────────────────────────────
//
// Controls (evaluated in priority order):
//
//   DB_SSL=disable | false   → SSL disabled entirely (local dev / private nets)
//   DB_SSL=true | require    → SSL enabled, honours DB_SSL_REJECT_UNAUTHORIZED
//   sslmode=disable (in DATABASE_URL querystring) → SSL disabled
//   sslmode=require | verify-full (in DATABASE_URL querystring) → SSL enabled
//   NODE_ENV=production      → SSL enabled by default (no DB_SSL needed)
//   (none of the above)      → SSL disabled (dev/test default)
//
// DB_SSL_REJECT_UNAUTHORIZED:
//   "true"  → strict CA-chain validation (production default, recommended for
//              managed Postgres services such as Railway, Supabase, RDS)
//   "false" → allow self-signed / private CA chains — must be set EXPLICITLY;
//              never use NODE_TLS_REJECT_UNAUTHORIZED=0 as a workaround
//
// DB_SSL_CA_CERT:
//   Absolute path to a PEM-encoded CA certificate bundle.  Use this when
//   connecting to Postgres with a private CA instead of disabling validation.
//
const isProduction = process.env.NODE_ENV === 'production';

function buildSslConfig() {
  const dbSslEnv = (process.env.DB_SSL || '').trim().toLowerCase();

  // ── Explicit disable ──────────────────────────────────────────────────────
  if (dbSslEnv === 'disable' || dbSslEnv === 'false') {
    return false;
  }

  // ── sslmode from DATABASE_URL querystring ─────────────────────────────────
  let sslmodeFromUrl = null;
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    sslmodeFromUrl = url.searchParams.get('sslmode');
  } catch (err) {
    console.warn(`[DB] Could not parse DATABASE_URL to read sslmode: ${err.message}`);
  }

  if (sslmodeFromUrl === 'disable') {
    return false;
  }

  // ── Decide whether SSL should be enabled ─────────────────────────────────
  const sslEnabled =
    dbSslEnv === 'true' || dbSslEnv === 'require' ||
    sslmodeFromUrl === 'require' || sslmodeFromUrl === 'verify-full' ||
    isProduction;

  if (!sslEnabled) {
    return false;
  }

  // ── rejectUnauthorized ────────────────────────────────────────────────────
  // Default: true in production (strict CA validation), false in other envs.
  // Override with DB_SSL_REJECT_UNAUTHORIZED=false only for self-signed chains.
  const rejectUnauthorizedDefault = isProduction ? 'true' : 'false';
  const rejectUnauthorized =
    (process.env.DB_SSL_REJECT_UNAUTHORIZED !== undefined
      ? process.env.DB_SSL_REJECT_UNAUTHORIZED
      : rejectUnauthorizedDefault
    ).trim().toLowerCase() === 'true';

  const config = { rejectUnauthorized };

  // ── Optional custom CA certificate ───────────────────────────────────────
  if (process.env.DB_SSL_CA_CERT) {
    try {
      config.ca = fs.readFileSync(process.env.DB_SSL_CA_CERT, 'utf8');
    } catch (err) {
      const msg = `[DB] Failed to read DB_SSL_CA_CERT: ${err.message}`;
      if (isProduction) {
        // A missing CA cert in production is a deployment error — fail fast.
        console.error(msg);
        process.exit(1);
      }
      console.error(msg);
    }
  }

  return config;
}

const sslConfig = buildSslConfig();

// Log effective SSL settings at startup (no secrets printed)
const sslSummary =
  sslConfig === false
    ? 'disabled'
    : `enabled (rejectUnauthorized=${sslConfig.rejectUnauthorized}, customCA=${!!sslConfig.ca})`;
console.log(`[DB] SSL config: ${sslSummary}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

const MIGRATION_CHECKSUM_COMPATIBILITY = {
  "20260419_create_billable_expenses_table.sql": new Set([
    // Historical applied form with inline projects FK.
    "d25041a060a490bb68b9d783adeeb87f6a72ec0aae4858e8f80369c264e639dc",
    // Historical applied form after the inline FK was removed.
    "fb3d6f923d83707347a58d95dd7b9e6557b98c903fd1d1d060af81088986eebf"
  ])
};

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

// Detailed connection metadata is only logged when LOG_DB_IDENTITY=true is set
// explicitly. Never enable this in production — host/user/IP must not appear in logs.
async function logDbIdentity() {
  if (process.env.LOG_DB_IDENTITY !== 'true') {
    return;
  }
  if (isProduction) {
    console.warn('[DB] logDbIdentity: disabled in production to prevent credential exposure.');
    return;
  }
  try {
    const res = await pool.query(
      'SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port()'
    );
    const row = res.rows[0];
    console.log('[DB] identity — database:', row.current_database, '| schema:', row.current_schema,
      '| server:', row.inet_server_addr, '| port:', row.inet_server_port);
  } catch (err) {
    console.error('[DB] logDbIdentity error:', err.message);
  }
}

// Transient PostgreSQL/TCP error codes that warrant a retry
const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P03', '08006']);

// Retry a database operation on transient connection errors
async function withRetry(fn, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = TRANSIENT_CODES.has(err.code);
      if (!isTransient || attempt === retries) throw err;
      console.warn(`DB transient error (attempt ${attempt}/${retries}): ${err.message}. Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function normalizeChecksumContent(content) {
  return String(content).replace(/\r\n/g, '\n');
}

// Compute a SHA-256 checksum of migration SQL content for drift detection
function computeChecksum(content) {
  return crypto.createHash('sha256').update(normalizeChecksumContent(content), 'utf8').digest('hex');
}

// Create the schema_migrations tracking table if it does not already exist
async function bootstrapMigrationsTable() {
  await withRetry(() =>
    pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum   TEXT        NOT NULL
      )
    `)
  );
}

// Return a Map of filename -> checksum for every already-applied migration
async function getAppliedMigrations() {
  const result = await withRetry(() =>
    pool.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename')
  );
  const applied = new Map();
  for (const row of result.rows) {
    applied.set(row.filename, row.checksum);
  }
  return applied;
}

function isCompatibleHistoricalMigrationChecksum(filename, storedChecksum) {
  const allowedChecksums = MIGRATION_CHECKSUM_COMPATIBILITY[filename];
  return !!allowedChecksums && allowedChecksums.has(storedChecksum);
}

async function repairAppliedMigrationChecksum(filename, checksum) {
  await withRetry(() =>
    pool.query(
      'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1',
      [filename, checksum]
    )
  );
}

// Run a single migration file inside a transaction and record it on success
async function runMigration(filename, sql, checksum) {
  const client = await withRetry(() => pool.connect());
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) {
      console.error(`ROLLBACK failed after migration error (${filename}): ${rollbackErr.message}`);
    }
    throw err;
  } finally {
    client.release();
  }
}

// Sentinel error class for content-drift — lets server.js detect it without string matching
class MigrationContentDriftError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationContentDriftError';
  }
}

// Cached stats updated by initDatabase() — safe to read any time after startup
const migrationStats = {
  total: 0,
  applied: 0,
  skipped: 0,
  lastAppliedAt: null,
  lastCheckedAt: null
};

// Migration Runner with explicit tracking
async function initDatabase() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.warn('Migrations directory missing at:', migrationsDir);
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (!migrationFiles.length) {
    console.warn('No migration files found under:', migrationsDir);
    return;
  }

  await bootstrapMigrationsTable();
  const appliedMap = await getAppliedMigrations();

  let newCount = 0;
  let skippedCount = 0;

  for (const filename of migrationFiles) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = computeChecksum(sql);

    if (appliedMap.has(filename)) {
      const storedChecksum = appliedMap.get(filename);
      if (storedChecksum !== checksum) {
        if (isCompatibleHistoricalMigrationChecksum(filename, storedChecksum)) {
          console.warn(
            `Repairing historical migration checksum drift for ${filename}. ` +
            'Stored checksum matched a known previously-applied file variant.'
          );
          await repairAppliedMigrationChecksum(filename, checksum);
          skippedCount++;
          continue;
        }
        const msg = `Migration content changed since last run (${filename}). ` +
          'Re-running a previously applied migration is unsafe. ' +
          'Create a new migration file to make incremental schema changes.';
        console.error(msg);
        throw new MigrationContentDriftError(msg);
      }
      skippedCount++;
      continue;
    }

    console.log(`Applying migration: ${filename}`);
    try {
      await runMigration(filename, sql, checksum);
      console.log(`Migration applied: ${filename}`);
      newCount++;
    } catch (err) {
      console.error(`Migration failed (${filename}): [${err.code}] ${err.message}`);
      throw err;
    }
  }

  migrationStats.total = migrationFiles.length;
  migrationStats.applied = newCount;
  migrationStats.skipped = skippedCount;
  const now = new Date().toISOString();
  migrationStats.lastCheckedAt = now;
  if (newCount > 0) {
    migrationStats.lastAppliedAt = now;
  }

  console.log(`Migrations complete: ${newCount} applied, ${skippedCount} already up to date.`);
}

module.exports = {
  pool,
  initDatabase,
  withRetry,
  computeChecksum,
  normalizeChecksumContent,
  isCompatibleHistoricalMigrationChecksum,
  migrationStats,
  MigrationContentDriftError
};
