import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { pool } = require("../db.js");
const { seedDefaultCategoriesForBusiness } = require("../api/utils/seedDefaultsForBusiness.js");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const result = await pool.query(`
    SELECT id, name, region
      FROM businesses
     WHERE region IN ('US', 'CA')
     ORDER BY created_at ASC
  `);

  const businesses = result.rows || [];

  console.log(`[default-category-backfill] Found ${businesses.length} US/CA business(es).`);

  let processed = 0;
  let failed = 0;

  for (const business of businesses) {
    try {
      if (dryRun) {
        console.log(
          `[dry-run] Would backfill default category mappings for ${business.id} (${business.name || "Unnamed"}, ${business.region})`
        );
      } else {
        await seedDefaultCategoriesForBusiness(pool, business.id);
        console.log(
          `[ok] Backfilled default category mappings for ${business.id} (${business.name || "Unnamed"}, ${business.region})`
        );
      }

      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[error] Failed backfill for business ${business.id}: ${error?.message || error}`
      );
    }
  }

  console.log(
    `[default-category-backfill] Done. processed=${processed}, failed=${failed}, dryRun=${dryRun}`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[default-category-backfill] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });