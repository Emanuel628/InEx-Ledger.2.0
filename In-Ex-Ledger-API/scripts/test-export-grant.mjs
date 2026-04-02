const TTL_OVERRIDE_MS = process.env.EXPORT_GRANT_TTL_MS || "1000";
const EXPORT_SECRET = process.env.EXPORT_GRANT_SECRET || "test-export-secret";

process.env.EXPORT_GRANT_SECRET = EXPORT_SECRET;
process.env.EXPORT_GRANT_TTL_MS = TTL_OVERRIDE_MS;

const { issueExportGrant, verifyExportGrant } = await import(
  "../services/exportGrantService.js"
);

const testContext = {
  businessId: "test-business",
  userId: "test-user",
  exportType: "pdf",
  includeTaxId: false,
  dateRange: { startDate: "2026-01-01", endDate: "2026-01-07" },
  metadata: {
    language: "en",
    currency: "USD",
    templateVersion: "v1"
  }
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log("Running export grant regression script");
console.log("EXPORT_GRANT_SECRET:", EXPORT_SECRET);
console.log("EXPORT_GRANT_TTL_MS:", TTL_OVERRIDE_MS);

// 1. Initial Issuance
const grant = await issueExportGrant(testContext);
console.log("Issued grant:", { tokenLength: grant.token.length, expiresAt: grant.expiresAt });

// 2. Verification
const payload = await verifyExportGrant(grant.token);
console.log("Verified grant payload:", {
  action: payload.action,
  includeTaxId: payload.includeTaxId,
  jti: payload.jti
});

// 3. One-time use test
let reuseError = null;
try {
  await verifyExportGrant(grant.token);
} catch (err) {
  reuseError = err.message;
}

assert(
  reuseError && reuseError.toLowerCase().includes("already been used"),
  "Expected grant reuse to fail with one-time token error"
);
console.log("One-time use enforcement confirmed");

// 4. Expiration test issuance
const expiringGrant = await issueExportGrant(testContext);
console.log("Issued expiring grant, waiting for TTL to pass...");
await wait(Number(TTL_OVERRIDE_MS) + 50);

// 5. Expiration verification
let expiredError = null;
try {
  await verifyExportGrant(expiringGrant.token);
} catch (err) {
  expiredError = err.message;
}

assert(
  expiredError && expiredError.toLowerCase().includes("expired"),
  "Expected expired grant to be rejected after TTL"
);
console.log("Grant expiration enforced");
console.log("Export grant tests passed ✅");
