require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(
  'UPDATE schema_migrations SET checksum = $1 WHERE filename = $2',
  ['b67d298cc4a8ee59dfc953aa9bda9b2e2e6cca967897143e174f0a518527438c', '001_init_luna_business.sql']
).then(r => { console.log('Rows updated:', r.rowCount); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
