const pg = require('pg');
const path = require('path');
const fs = require('fs');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

if (process.env.NODE_ENV !== 'production') {
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
      await pool.query(sql);
      console.log(`Migration applied: ${filename}`);
    } catch (err) {
      if (err.code === '42P07' || err.code === '42710') {
        console.log(`Migration already applied (ignored): ${filename}`);
        continue;
      }
      console.error(`Migration failed (${filename}):`, err.message);
      throw err;
    }
  }
}

module.exports = {
  pool,
  logDbIdentity,
  initDatabase
};