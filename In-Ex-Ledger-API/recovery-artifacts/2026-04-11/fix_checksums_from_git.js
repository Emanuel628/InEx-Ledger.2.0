require('dotenv').config();
const { execSync } = require('child_process');
const crypto = require('crypto');
const { Client } = require('pg');
const path = require('path');

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const output = execSync('git ls-files "db/migrations/"').toString().trim().split('\n').filter(f => f.endsWith('.sql')).sort();
  await client.connect();
  for (const gitPath of output) {
    const filename = path.basename(gitPath);
    const content = execSync(`git show HEAD:In-Ex-Ledger-API/${gitPath}`);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const result = await client.query(
      'UPDATE schema_migrations SET checksum = $1 WHERE filename = $2',
      [checksum, filename]
    );
    if (result.rowCount > 0) console.log('Updated:', filename, checksum);
    else console.log('Skipped (not in DB):', filename);
  }
  client.end();
}

main().catch(e => { console.error(e.message); client.end(); });