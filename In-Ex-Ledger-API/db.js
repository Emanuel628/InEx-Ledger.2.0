const pg = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Pool } = pg;

// Validate SSL configuration explicitly
const isProduction = process.env.NODE_ENV === 'production';
const sslConfig = isProduction
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

if (!isProduction) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    console.log('=== DB URL PARSED ===');
    console.log('HOST:', dbUrl.host);
    console.log('USER:', dbUrl.username);
    console.log('DB NAME:', dbUrl.pathname.replace('/', ''));
    console.log('========================');
  } catch (e) {
    console.error('Failed to parse DATABASE_URL variable.');
  }
}

async function logDbIdentity() {
  try {
    const res = await pool.query(
      'SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port()'
    );
    const row = res.rows[0];
    console.log('=== DB PHYSICAL IDENTITY ===');
    console.log('DB NAME:', row.current_database);
    console.log('SCHEMA:', row.current_schema);
    console.log('SERVER IP:', row.inet_server_addr);
    console.log('DB PORT:', row.inet_server_port);
    console.log('===============================');
  } catch (err) {
    console.error('DB IDENTITY ERROR:', err.message);
  }
}

// Thrown when a previously-applied migration file has been edited after the fact
class MigrationContentDriftError extends Error {
  constructor(filename) {
    super(
      `Migration content changed since last run (${filename}). ` +
      'Re-running a previously applied migration is unsafe. ' +
      'Create a new migration file to make incremental schema changes.'
    );
    this.name = 'MigrationContentDriftError';
    this.filename = filename;
  }
}

// Provides visibility into the outcome of the last initDatabase() call
const migrationStats = {
  total: 0,
  applied: 0,
  skipped: 0,
  lastCheckedAt: null,
  lastAppliedAt: null
};

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

// Compute a SHA-256 checksum of migration SQL content for drift detection
function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
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
  const applied = await getAppliedMigrations();

  let newCount = 0;
  let skippedCount = 0;

  for (const filename of migrationFiles) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = computeChecksum(sql);

    if (applied.has(filename)) {
      const storedChecksum = applied.get(filename);
      if (storedChecksum !== checksum) {
        const err = new MigrationContentDriftError(filename);
        console.error(err.message);
        throw err;
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

  const now = new Date().toISOString();
  migrationStats.total = migrationFiles.length;
  migrationStats.applied = newCount;
  migrationStats.skipped = skippedCount;
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
  MigrationContentDriftError,
  migrationStats
};