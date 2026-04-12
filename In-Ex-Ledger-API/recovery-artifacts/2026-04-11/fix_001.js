require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect().then(() =>
  client.query(
    'UPDATE schema_migrations SET checksum = $1 WHERE filename = $2',
    ['09e23c1ff201aa63084d7fab220007dcb3b3d1df59f17a21d30209177a7ddde0', '001_init_luna_business.sql']
  )
).then(r => { console.log('Rows updated:', r.rowCount); client.end(); })
.catch(e => { console.error(e.message); client.end(); });
