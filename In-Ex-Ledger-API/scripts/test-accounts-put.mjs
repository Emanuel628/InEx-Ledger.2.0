/**
 * Unit tests for accounts PUT /:id route validation logic.
 * Tests the validation rules applied before hitting the database.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

console.log("Running accounts PUT validation tests");

// ── Constants mirrored from accounts.routes.js ──────────────────────────────
const ALLOWED_ACCOUNT_TYPES = ["checking", "savings", "credit_card"];

function validateAccountUpdate({ name, type }) {
  if (!name && !type) {
    return { status: 400, error: "At least one of name or type is required." };
  }
  if (type && !ALLOWED_ACCOUNT_TYPES.includes(type)) {
    return { status: 400, error: `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.` };
  }
  return { status: 200, error: null };
}

// ── Test suite ───────────────────────────────────────────────────────────────

console.log("\n[1] Empty body — should reject");
{
  const result = validateAccountUpdate({});
  assert(result.status === 400, "Returns 400 when no fields provided");
  assert(result.error.includes("At least one"), "Error message mentions 'At least one'");
}

console.log("\n[2] Invalid account type — should reject");
{
  const result = validateAccountUpdate({ type: "crypto_wallet" });
  assert(result.status === 400, "Returns 400 for unknown type");
  assert(result.error.includes("checking"), "Error lists valid types");
}

console.log("\n[3] Valid name only — should pass");
{
  const result = validateAccountUpdate({ name: "Business Checking" });
  assert(result.status === 200, "Returns 200 for name-only update");
}

console.log("\n[4] Valid type only — should pass");
{
  for (const type of ALLOWED_ACCOUNT_TYPES) {
    const result = validateAccountUpdate({ type });
    assert(result.status === 200, `Returns 200 for type: ${type}`);
  }
}

console.log("\n[5] Both name and type — should pass");
{
  const result = validateAccountUpdate({ name: "Savings Account", type: "savings" });
  assert(result.status === 200, "Returns 200 for name + type update");
}

console.log("\n[6] Null/empty type with valid name — should pass");
{
  const result = validateAccountUpdate({ name: "Main Account", type: "" });
  // empty string type is falsy — treated as not provided — only name matters
  assert(result.status === 200, "Empty string type is treated as not provided when name present");
}

console.log("\nAll accounts PUT validation tests passed.");
