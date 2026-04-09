const pg = require('pg');
const path = require('path');
const fs = require('fs');

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

// Transparent Migration Runner
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

  for (const filename of migrationFiles) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await withRetry(() => pool.query(sql));
      console.log(`Migration applied: ${filename}`);
    } catch (err) {
      // Ignore errors for objects that already exist (idempotent migrations)
      const IGNORABLE_CODES = new Set([
        '42P07', // duplicate_table
        '42710', // duplicate_object
        '42701', // duplicate_column
        '23505', // unique_violation (e.g. duplicate INSERT in seed data)
        '42P16', // invalid_table_definition (some ALTER IF NOT EXISTS variants)
      ]);
      if (IGNORABLE_CODES.has(err.code)) {
        console.log(`Migration already applied (ignored): ${filename}`);
        continue;
      }
      console.error(`Migration failed (${filename}): [${err.code}] ${err.message}`);
      throw err;
    }
  }
}

module.exports = {
  pool,
  initDatabase,
  withRetry
};