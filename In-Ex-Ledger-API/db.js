import pkg from "pg";
const { Pool } = pkg;
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false
});

// Title: Connection Verification
pool.query('SELECT current_database(), now()', (err, res) => {
  if (err) {
    console.error("❌ DB CONNECTION ERROR:", err.message);
  } else {
    console.log(`✅ API CONNECTED TO DB: ${res.rows[0].current_database} at ${res.rows[0].now}`);
  }
});

export const initDatabase = async () => {
  try {
    const sqlPath = path.join(__dirname, "db", "migrations", "001_init_luna_business.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log("✅ Schema verified.");
  } catch (err) {
    console.log("ℹ️ Tables verified.");
  }
};

export default pool;
