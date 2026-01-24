import { initDatabase } from "./db.js";

async function runMigrations() {
  try {
    await initDatabase();
    console.log("✅ Migrations applied successfully.");
  } catch (error) {
    console.error("❌ Migration failed:", error?.message || error);
  }
}

runMigrations();
