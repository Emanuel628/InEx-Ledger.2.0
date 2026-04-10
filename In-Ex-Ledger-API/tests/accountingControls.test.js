const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AccountingPeriodLockedError,
  assertDateUnlocked,
  isDateLocked,
  normalizeAccountingLockRow,
  normalizeDateOnly
} = require("../services/accountingLockService.js");
const { archiveTransaction } = require("../services/transactionAuditService.js");

test("normalizeDateOnly returns YYYY-MM-DD and accepts nullish values", () => {
  assert.equal(normalizeDateOnly("2026-04-08T10:15:00Z"), "2026-04-08");
  assert.equal(normalizeDateOnly("2026-04-08"), "2026-04-08");
  assert.equal(normalizeDateOnly(null), null);
  assert.equal(normalizeDateOnly(""), null);
});

test("normalizeDateOnly throws for an invalid date string", () => {
  assert.throws(
    () => normalizeDateOnly("not-a-date"),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /invalid/i);
      return true;
    }
  );
});

test("normalizeAccountingLockRow returns a stable lock payload", () => {
  const normalized = normalizeAccountingLockRow({
    locked_through_date: "2026-03-31",
    locked_period_note: " Q1 closed ",
    locked_period_updated_at: "2026-04-01T00:00:00Z",
    locked_period_updated_by: "user_1"
  });

  assert.deepEqual(normalized, {
    lockedThroughDate: "2026-03-31",
    note: "Q1 closed",
    updatedAt: "2026-04-01T00:00:00Z",
    updatedById: "user_1",
    isLocked: true
  });
});

test("normalizeAccountingLockRow with null row returns a safe unlocked state", () => {
  const normalized = normalizeAccountingLockRow(null);
  assert.deepEqual(normalized, {
    lockedThroughDate: null,
    note: null,
    updatedAt: null,
    updatedById: null,
    isLocked: false
  });
});

test("isDateLocked returns true only when the transaction date is inside the locked period", () => {
  assert.equal(isDateLocked("2026-03-31", "2026-03-31"), true);
  assert.equal(isDateLocked("2026-03-15", "2026-03-31"), true);
  assert.equal(isDateLocked("2026-04-01", "2026-03-31"), false);
  assert.equal(isDateLocked("2026-04-01", null), false);
});

test("isDateLocked returns false when transaction date is null", () => {
  assert.equal(isDateLocked(null, "2026-03-31"), false);
});

test("assertDateUnlocked throws a typed lock error for protected periods", () => {
  assert.throws(
    () => assertDateUnlocked({ lockedThroughDate: "2026-03-31" }, "2026-03-30"),
    (error) => {
      assert.ok(error instanceof AccountingPeriodLockedError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "accounting_period_locked");
      assert.equal(error.lockedThroughDate, "2026-03-31");
      assert.equal(error.transactionDate, "2026-03-30");
      return true;
    }
  );
});

test("assertDateUnlocked does not throw when lockState is null (no lock configured)", () => {
  assert.doesNotThrow(() => assertDateUnlocked(null, "2026-03-30"));
});

test("AccountingPeriodLockedError carries the correct status, code, and date fields", () => {
  const err = new AccountingPeriodLockedError({
    lockedThroughDate: "2026-03-31",
    transactionDate: "2026-03-15"
  });
  assert.ok(err instanceof Error);
  assert.equal(err.status, 409);
  assert.equal(err.code, "accounting_period_locked");
  assert.equal(err.lockedThroughDate, "2026-03-31");
  assert.equal(err.transactionDate, "2026-03-15");
  assert.match(err.message, /2026-03-31/);
});

test("archiveTransaction updates transaction metadata instead of hard deleting rows", async () => {
  let capturedQuery = "";
  let capturedParams = null;

  const fakePool = {
    async query(sql, params) {
      capturedQuery = sql;
      capturedParams = params;
      return {
        rows: [
          {
            id: "tx_123",
            deleted_at: "2026-04-08T12:00:00Z",
            deleted_by_id: "user_123",
            deleted_reason: "duplicate"
          }
        ]
      };
    }
  };

  const archived = await archiveTransaction({
    pool: fakePool,
    businessId: "biz_123",
    transactionId: "tx_123",
    userId: "user_123",
    reason: " duplicate "
  });

  assert.match(capturedQuery, /UPDATE transactions/i);
  assert.doesNotMatch(capturedQuery, /DELETE FROM transactions/i);
  assert.deepEqual(capturedParams, ["tx_123", "biz_123", "user_123", "duplicate"]);
  assert.deepEqual(archived, {
    id: "tx_123",
    deleted_at: "2026-04-08T12:00:00Z",
    deleted_by_id: "user_123",
    deleted_reason: "duplicate"
  });
});

test("archiveTransaction SQL guards prevent re-archiving already-deleted or voided rows", async () => {
  let capturedSql = "";

  const fakePool = {
    async query(sql) {
      capturedSql = sql;
      return { rows: [] };
    }
  };

  await archiveTransaction({
    pool: fakePool,
    businessId: "biz_guard",
    transactionId: "tx_guard",
    userId: "user_guard",
    reason: null
  });

  assert.match(capturedSql, /UPDATE transactions/i);
  assert.doesNotMatch(capturedSql, /DELETE FROM transactions/i);
  assert.match(capturedSql, /deleted_at IS NULL/i);
  assert.match(capturedSql, /is_void/i);
});

test("archiveTransaction with an already-archived transaction returns null", async () => {
  const fakePool = {
    async query() {
      return { rows: [] };
    }
  };

  const result = await archiveTransaction({
    pool: fakePool,
    businessId: "biz_123",
    transactionId: "tx_already_archived",
    userId: "user_123",
    reason: "duplicate"
  });

  assert.equal(result, null);
});

test("archiveTransaction stores null when reason is empty", async () => {
  let capturedParams = null;

  const fakePool = {
    async query(_sql, params) {
      capturedParams = params;
      return {
        rows: [
          {
            id: "tx_1",
            deleted_at: "2026-04-10T12:00:00Z",
            deleted_by_id: "user_1",
            deleted_reason: null,
            is_void: true,
            voided_at: "2026-04-10T12:00:00Z",
            voided_by_id: "user_1"
          }
        ]
      };
    }
  };

  await archiveTransaction({
    pool: fakePool,
    businessId: "biz_1",
    transactionId: "tx_1",
    userId: "user_1",
    reason: ""
  });

  assert.equal(capturedParams[3], null, "empty reason must be stored as null");
});

test("archiveTransaction returns all required audit fields including is_void and voided metadata", async () => {
  const now = "2026-04-10T12:00:00.000Z";

  const fakePool = {
    async query() {
      return {
        rows: [
          {
            id: "tx_audit",
            deleted_at: now,
            deleted_by_id: "user_audit",
            deleted_reason: "test reason",
            is_void: true,
            voided_at: now,
            voided_by_id: "user_audit"
          }
        ]
      };
    }
  };

  const result = await archiveTransaction({
    pool: fakePool,
    businessId: "biz_a",
    transactionId: "tx_audit",
    userId: "user_audit",
    reason: "test reason"
  });

  assert.equal(result.is_void, true);
  assert.equal(result.voided_by_id, "user_audit");
  assert.ok(result.voided_at, "voided_at must be present");
  assert.equal(result.deleted_by_id, "user_audit");
  assert.ok(result.deleted_at, "deleted_at must be present");
});
