import pkg from "pg";
const { Pool } = pkg;
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false
});

// Title: Schema Initialization Helper
export const initSchema = async () => {
  try {
    // Path to your migration file
    const sqlPath = path.join(__dirname, "migrations", "001_init_luna_business.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    
    await pool.query(sql);
    console.log("Luna Business schema initialized/verified.");
  } catch (err) {
    // We ignore errors if the table already exists, but log other issues
    console.error("Schema Init Note:", err.message);
  }
};

export default pool;
