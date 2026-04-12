require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

async function main() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from .env');
  }

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No .sql migration files found.');
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto
        .createHash('sha256')
        .update(content, 'utf8')
        .digest('hex');

      const result = await client.query(
        'UPDATE schema_migrations SET checksum = $1 WHERE filename = $2',
        [checksum, file]
      );

      if (result.rowCount === 0) {
        console.warn(`No schema_migrations row found for: ${file}`);
      } else {
        console.log(`Updated checksum for ${file}: ${checksum}`);
      }
    }
    console.log('All migration checksum updates finished.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Failed to fix migration checksums:', err.message);
  process.exit(1);
});