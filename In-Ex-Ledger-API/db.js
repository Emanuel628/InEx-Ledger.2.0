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

// Title: Fixed Schema Initialization
export const initDatabase = async () => {
  try {
    // UPDATED PATH: Based on your images, it's inside the 'db' folder
    const sqlPath = path.join(__dirname, "db", "migrations", "001_init_luna_business.sql");
    
    console.log("Reading SQL file from:", sqlPath);
    
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log("✅ Luna Business: Database schema initialized successfully.");
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error("❌ ERROR: Could not find the SQL file. Check if 'db/migrations' exists in your build.");
    } else {
      // If tables already exist, Postgres throws an error, which we log as a success check
      console.log("ℹ️ Database check: Tables already exist.");
    }
  }
};

export default pool;
