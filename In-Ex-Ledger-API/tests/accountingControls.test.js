const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AccountingPeriodLockedError,
  assertDateUnlocked,
  buildAccountingLockErrorPayload,
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

test("isDateLocked returns true only when the transaction date is inside the locked period", () => {
  assert.equal(isDateLocked("2026-03-31", "2026-03-31"), true);
  assert.equal(isDateLocked("2026-03-15", "2026-03-31"), true);
  assert.equal(isDateLocked("2026-04-01", "2026-03-31"), false);
  assert.equal(isDateLocked("2026-04-01", null), false);
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

test("buildAccountingLockErrorPayload returns the shared API contract", () => {
  const payload = buildAccountingLockErrorPayload(
    new AccountingPeriodLockedError({
      lockedThroughDate: "2026-03-31",
      transactionDate: "2026-03-30"
    })
  );

  assert.deepEqual(payload, {
    error: "This accounting period is locked. Data dated on or before 2026-03-31 cannot be changed.",
    code: "accounting_period_locked",
    locked_through_date: "2026-03-31",
    transaction_date: "2026-03-30"
  });
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
