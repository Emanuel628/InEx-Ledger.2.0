/**
 * Regression tests for Phase 4 cleanup:
 *   - Task 3: systemRoutes not double-mounted at '/'
 *   - Task 4: logDbIdentity and getSubscriptionSnapshotForUser are not exported
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

console.log("\nRunning Phase 4 cleanup regression tests\n");

// ── Task 3: routes/index.js should not mount systemRoutes at '/' ──────────────
{
  const src = fs.readFileSync(path.join(__dirname, "../routes/index.js"), "utf8");

  const systemMountMatches = src.match(/router\.use\([^)]*systemRoutes\)/g) || [];
  assert(
    systemMountMatches.length === 1,
    `systemRoutes mounted exactly once (found ${systemMountMatches.length})`
  );
  assert(
    systemMountMatches[0].includes("'/system'") || systemMountMatches[0].includes('"/system"'),
    "systemRoutes is mounted at '/system'"
  );
}

// ── Task 4: db.js must NOT export logDbIdentity ───────────────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, "../db.js"), "utf8");
  assert(
    !src.includes("logDbIdentity"),
    "db.js does not contain logDbIdentity"
  );
  assert(
    src.includes("initDatabase"),
    "db.js still contains initDatabase"
  );
  assert(
    src.includes("withRetry"),
    "db.js still contains withRetry"
  );
}

// ── Task 4: subscriptionService must NOT export getSubscriptionSnapshotForUser ─
{
  const src = fs.readFileSync(path.join(__dirname, "../services/subscriptionService.js"), "utf8");
  assert(
    !src.includes("getSubscriptionSnapshotForUser"),
    "subscriptionService does not contain getSubscriptionSnapshotForUser"
  );
  assert(
    src.includes("getSubscriptionSnapshotForBusiness"),
    "subscriptionService still contains getSubscriptionSnapshotForBusiness"
  );
}

console.log("\nAll Phase 4 cleanup regression tests passed.\n");

