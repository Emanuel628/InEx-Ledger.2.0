import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Title: Database Identity & URL Parsing
try {
  const dbUrl = new URL(process.env.DATABASE_URL);
  console.log("=== DB URL PARSED ===");
  console.log("HOST:", dbUrl.host);
  console.log("USER:", dbUrl.username);
  console.log("DB NAME:", dbUrl.pathname.replace('/', ''));
  console.log("========================");
} catch (e) {
  console.error("Failed to parse DATABASE_URL variable.");
}

export async function logDbIdentity() {
  try {
    const res = await pool.query(
      'SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port()'
    );
    const row = res.rows[0];
    console.log("=== DB PHYSICAL IDENTITY ===");
    console.log("DB NAME:", row.current_database);
    console.log("SCHEMA:", row.current_schema);
    console.log("SERVER IP:", row.inet_server_addr);
    console.log("DB PORT:", row.inet_server_port);
    console.log("===============================");
  } catch (err) {
    console.error("DB IDENTITY ERROR:", err.message);
  }
}

// Title: Transparent Migration Runner
export const initDatabase = async () => {
  const sqlPath = path.join(__dirname, "db", "migrations", "001_init_luna_business.sql");
  
  if (!fs.existsSync(sqlPath)) {
    console.warn("Migration file missing at:", sqlPath);
    console.log("Skipping auto-migration. Ensure tables are created manually or add the file.");
    return;
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  
  try {
    await pool.query(sql);
    console.log("DATABASE SCHEMA APPLIED SUCCESSFULLY.");
  } catch (err) {
    // If it's just a "relation already exists" error, that's fine.
    if (err.code === '42P07') {
      console.log("Tables already exist. Skipping creation.");
    } else {
      console.error("SCHEMA MIGRATION FAILED:", err.message);
      throw err; // Don't hide real errors
    }
  }
};

export default pool;
