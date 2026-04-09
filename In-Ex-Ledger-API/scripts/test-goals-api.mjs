/**
 * Unit tests for goals API route validation logic.
 * Tests the validation rules applied before hitting the database.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

console.log("Running goals API validation tests");

// ── Constants mirrored from goals.routes.js ──────────────────────────────────
const ALLOWED_GOAL_TYPES = ["savings", "spending_limit", "income_target"];

function validateGoalCreate(body) {
  const { name, type, target_amount, current_amount, due_date } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return { status: 400, error: "Goal name is required." };
  }
  if (!type) {
    return { status: 400, error: `Goal type is required. Must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` };
  }
  if (!ALLOWED_GOAL_TYPES.includes(type)) {
    return { status: 400, error: `Goal type must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` };
  }
  const parsedTarget = Number.parseFloat(target_amount);
  if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
    return { status: 400, error: "target_amount must be a positive number." };
  }
  if (current_amount !== undefined && current_amount !== null && current_amount !== "") {
    const parsedCurrent = Number.parseFloat(current_amount);
    if (!Number.isFinite(parsedCurrent) || parsedCurrent < 0) {
      return { status: 400, error: "current_amount must be a non-negative number." };
    }
  }
  if (due_date && Number.isNaN(Date.parse(due_date))) {
    return { status: 400, error: "due_date must be a valid date." };
  }
  return { status: 201, error: null };
}

function validateGoalUpdate(body) {
  const { type, target_amount, current_amount, due_date } = body ?? {};

  if (type !== undefined && !ALLOWED_GOAL_TYPES.includes(type)) {
    return { status: 400, error: `Goal type must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` };
  }
  if (target_amount !== undefined) {
    const p = Number.parseFloat(target_amount);
    if (!Number.isFinite(p) || p <= 0) {
      return { status: 400, error: "target_amount must be a positive number." };
    }
  }
  if (current_amount !== undefined) {
    const p = Number.parseFloat(current_amount);
    if (!Number.isFinite(p) || p < 0) {
      return { status: 400, error: "current_amount must be a non-negative number." };
    }
  }
  if (due_date !== undefined && due_date !== null && due_date !== "" && Number.isNaN(Date.parse(due_date))) {
    return { status: 400, error: "due_date must be a valid date." };
  }
  return { status: 200, error: null };
}

// ── POST validation tests ────────────────────────────────────────────────────

console.log("\n[POST 1] Missing name — should reject");
{
  const result = validateGoalCreate({ type: "savings", target_amount: 5000 });
  assert(result.status === 400, "Returns 400 when name missing");
  assert(result.error.includes("name"), "Error mentions name");
}

console.log("\n[POST 2] Empty name — should reject");
{
  const result = validateGoalCreate({ name: "   ", type: "savings", target_amount: 5000 });
  assert(result.status === 400, "Returns 400 for whitespace-only name");
}

console.log("\n[POST 3] Missing type — should reject");
{
  const result = validateGoalCreate({ name: "Emergency fund", target_amount: 5000 });
  assert(result.status === 400, "Returns 400 when type missing");
  assert(result.error.includes("type"), "Error mentions type");
}

console.log("\n[POST 4] Invalid type — should reject");
{
  const result = validateGoalCreate({ name: "Test", type: "retirement", target_amount: 5000 });
  assert(result.status === 400, "Returns 400 for unsupported type");
  assert(result.error.includes("savings"), "Error lists valid types");
}

console.log("\n[POST 5] Zero target — should reject");
{
  const result = validateGoalCreate({ name: "Test", type: "savings", target_amount: 0 });
  assert(result.status === 400, "Returns 400 for zero target");
}

console.log("\n[POST 6] Negative target — should reject");
{
  const result = validateGoalCreate({ name: "Test", type: "savings", target_amount: -100 });
  assert(result.status === 400, "Returns 400 for negative target");
}

console.log("\n[POST 7] Negative current_amount — should reject");
{
  const result = validateGoalCreate({ name: "Test", type: "savings", target_amount: 1000, current_amount: -50 });
  assert(result.status === 400, "Returns 400 for negative current_amount");
}

console.log("\n[POST 8] Invalid due_date — should reject");
{
  const result = validateGoalCreate({ name: "Test", type: "savings", target_amount: 1000, due_date: "bad-date" });
  assert(result.status === 400, "Returns 400 for invalid due_date");
  assert(result.error.includes("due_date"), "Error mentions due_date");
}

console.log("\n[POST 9] Valid full payload — should pass");
{
  for (const type of ALLOWED_GOAL_TYPES) {
    const result = validateGoalCreate({ name: "My Goal", type, target_amount: 5000, current_amount: 1000, due_date: "2027-01-01" });
    assert(result.status === 201, `Returns 201 for type: ${type}`);
  }
}

console.log("\n[POST 10] Minimal valid payload — should pass");
{
  const result = validateGoalCreate({ name: "Savings goal", type: "savings", target_amount: "500" });
  assert(result.status === 201, "Returns 201 for minimal valid payload");
}

// ── PUT validation tests ─────────────────────────────────────────────────────

console.log("\n[PUT 1] Invalid type — should reject");
{
  const result = validateGoalUpdate({ type: "vacation" });
  assert(result.status === 400, "Returns 400 for invalid type in PUT");
}

console.log("\n[PUT 2] Valid type — should pass");
{
  for (const type of ALLOWED_GOAL_TYPES) {
    const result = validateGoalUpdate({ type });
    assert(result.status === 200, `Returns 200 for valid type: ${type}`);
  }
}

console.log("\n[PUT 3] Zero target_amount — should reject");
{
  const result = validateGoalUpdate({ target_amount: 0 });
  assert(result.status === 400, "Returns 400 for zero target in PUT");
}

console.log("\n[PUT 4] Negative current_amount — should reject");
{
  const result = validateGoalUpdate({ current_amount: -1 });
  assert(result.status === 400, "Returns 400 for negative current in PUT");
}

console.log("\n[PUT 5] Zero current_amount — should pass");
{
  const result = validateGoalUpdate({ current_amount: 0 });
  assert(result.status === 200, "Returns 200 for zero current_amount in PUT");
}

console.log("\n[PUT 6] Invalid due_date — should reject");
{
  const result = validateGoalUpdate({ due_date: "nope" });
  assert(result.status === 400, "Returns 400 for invalid due_date in PUT");
}

console.log("\n[PUT 7] Null due_date clears it — should pass");
{
  const result = validateGoalUpdate({ due_date: null });
  assert(result.status === 200, "Returns 200 when due_date is null");
}

console.log("\n[PUT 8] Empty body — should pass");
{
  const result = validateGoalUpdate({});
  assert(result.status === 200, "Returns 200 for empty PUT body");
}

console.log("\n[PUT 9] is_completed flag — should pass validation");
{
  const result = validateGoalUpdate({ is_completed: true });
  assert(result.status === 200, "Returns 200 for is_completed update");
}

console.log("\nAll goals API validation tests passed.");
