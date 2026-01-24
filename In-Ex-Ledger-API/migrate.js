import { initDatabase } from "./db.js";

async function runMigrations() {
  try {
    await initDatabase();
    console.log("✅ Migrations applied successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error?.message || error);
    process.exit(1);
  }
}

runMigrations();
