/**
 * Unit tests for mapMessageRow archive flag behavior.
 * Verifies that is_archived reflects the correct flag for the current viewer role.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

// ── mapMessageRow mirrored from messages.routes.js ───────────────────────────
function mapMessageRow(row, viewerUserId) {
  let isArchived;
  if (viewerUserId && row.receiver_id === viewerUserId) {
    isArchived = row.is_archived_by_receiver || false;
  } else if (viewerUserId && row.sender_id === viewerUserId) {
    isArchived = row.is_archived_by_sender || false;
  } else {
    isArchived = row.is_archived_by_sender || row.is_archived_by_receiver || false;
  }

  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.sender_name || null,
    sender_email: row.sender_email || null,
    receiver_id: row.receiver_id,
    receiver_name: row.receiver_name || null,
    receiver_email: row.receiver_email || null,
    message_type: row.message_type,
    subject: row.subject || null,
    body: row.body,
    is_read: row.is_read,
    is_archived: isArchived,
    parent_id: row.parent_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ── Base row fixture ──────────────────────────────────────────────────────────
const SENDER_ID = "user-sender-001";
const RECEIVER_ID = "user-receiver-002";

function makeRow(overrides = {}) {
  return {
    id: "msg-001",
    sender_id: SENDER_ID,
    receiver_id: RECEIVER_ID,
    message_type: "general",
    subject: "Test",
    body: "Hello",
    is_read: false,
    is_archived_by_sender: false,
    is_archived_by_receiver: false,
    parent_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    sender_name: "Alice",
    sender_email: "alice@example.com",
    receiver_name: "Bob",
    receiver_email: "bob@example.com",
    ...overrides
  };
}

console.log("\nRunning mapMessageRow archive flag tests\n");

// ── Test: receiver views non-archived message ─────────────────────────────────
{
  const mapped = mapMessageRow(makeRow(), RECEIVER_ID);
  assert(mapped.is_archived === false, "receiver sees is_archived=false when not archived by receiver");
}

// ── Test: receiver views message archived by receiver ─────────────────────────
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_receiver: true }), RECEIVER_ID);
  assert(mapped.is_archived === true, "receiver sees is_archived=true when archived by receiver");
}

// ── Test: receiver is NOT misled by sender archive flag ───────────────────────
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_sender: true }), RECEIVER_ID);
  assert(mapped.is_archived === false, "receiver sees is_archived=false even when sender has archived");
}

// ── Test: sender views non-archived message ───────────────────────────────────
{
  const mapped = mapMessageRow(makeRow(), SENDER_ID);
  assert(mapped.is_archived === false, "sender sees is_archived=false when not archived by sender");
}

// ── Test: sender views message archived by sender ─────────────────────────────
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_sender: true }), SENDER_ID);
  assert(mapped.is_archived === true, "sender sees is_archived=true when archived by sender");
}

// ── Test: sender is NOT misled by receiver archive flag ───────────────────────
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_receiver: true }), SENDER_ID);
  assert(mapped.is_archived === false, "sender sees is_archived=false even when receiver has archived");
}

// ── Test: no viewer ID falls back to OR behavior ──────────────────────────────
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_sender: true, is_archived_by_receiver: false }));
  assert(mapped.is_archived === true, "no viewer: fallback OR — archived by sender → true");
}
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_sender: false, is_archived_by_receiver: true }));
  assert(mapped.is_archived === true, "no viewer: fallback OR — archived by receiver → true");
}
{
  const mapped = mapMessageRow(makeRow({ is_archived_by_sender: false, is_archived_by_receiver: false }));
  assert(mapped.is_archived === false, "no viewer: fallback OR — neither archived → false");
}

// ── Test: both archived ───────────────────────────────────────────────────────
{
  const row = makeRow({ is_archived_by_sender: true, is_archived_by_receiver: true });
  assert(mapMessageRow(row, SENDER_ID).is_archived === true, "sender: both archived → true");
  assert(mapMessageRow(row, RECEIVER_ID).is_archived === true, "receiver: both archived → true");
}

console.log("\nAll mapMessageRow archive flag tests passed.\n");
