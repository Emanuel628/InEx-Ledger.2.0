require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect().then(() =>
  client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename')
).then(r => { r.rows.forEach(row => console.log(row.filename, row.checksum)); client.end(); })
.catch(e => { console.error(e.message); client.end(); });
