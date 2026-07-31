"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateManualReceiptStatusChange,
  syncReceiptStatusForTransaction,
  ReceiptStatusValidationError
} = require("../services/receiptStatusService.js");

function makeFakeClient({ receiptCount, currentStatus }) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (/SELECT COUNT\(\*\)::int AS count FROM receipts/i.test(sql)) {
        return { rows: [{ count: receiptCount }], rowCount: 1 };
      }
      if (/SET receipt_status = 'attached'/i.test(sql)) {
        if (currentStatus === "attached") {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: params[0], receipt_status: "attached" }], rowCount: 1 };
      }
      if (/SET receipt_status = 'pending'/i.test(sql)) {
        if (currentStatus !== "attached") {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: params[0], receipt_status: "pending" }], rowCount: 1 };
      }
      throw new Error(`Unhandled query: ${sql}`);
    }
  };
}

test("validateManualReceiptStatusChange rejects an unknown status", () => {
  assert.throws(
    () => validateManualReceiptStatusChange({ status: "confirmed" }),
    ReceiptStatusValidationError
  );
});

test("validateManualReceiptStatusChange rejects 'attached' — it cannot be set directly by a client", () => {
  assert.throws(
    () => validateManualReceiptStatusChange({ status: "attached" }),
    /cannot be set to 'attached' directly/
  );
});

test("validateManualReceiptStatusChange requires a reason when setting 'missing'", () => {
  assert.throws(
    () => validateManualReceiptStatusChange({ status: "missing", receiptMissingReason: "" }),
    /receipt_missing_reason is required/
  );
});

test("validateManualReceiptStatusChange accepts 'missing' with a reason", () => {
  const status = validateManualReceiptStatusChange({
    status: "Missing",
    receiptMissingReason: "Receipt lost in transit"
  });
  assert.equal(status, "missing");
});

test("validateManualReceiptStatusChange requires a business_purpose when setting 'not_required'", () => {
  assert.throws(
    () => validateManualReceiptStatusChange({ status: "not_required", businessPurpose: "   " }),
    /business_purpose is required/
  );
});

test("validateManualReceiptStatusChange accepts 'not_required' with a business_purpose", () => {
  const status = validateManualReceiptStatusChange({
    status: "not_required",
    businessPurpose: "Bank fee assessed automatically, no receipt is issued."
  });
  assert.equal(status, "not_required");
});

test("validateManualReceiptStatusChange accepts 'pending' with no reason or purpose", () => {
  const status = validateManualReceiptStatusChange({ status: "pending" });
  assert.equal(status, "pending");
});

test("syncReceiptStatusForTransaction sets status to attached when a receipt exists and status was pending", async () => {
  const client = makeFakeClient({ receiptCount: 1, currentStatus: "pending" });
  const result = await syncReceiptStatusForTransaction(client, {
    businessId: "biz-1",
    transactionId: "tx-1",
    actorUserId: "user-1"
  });
  assert.equal(result.receipt_status, "attached");
});

test("syncReceiptStatusForTransaction is a no-op when a receipt exists and status is already attached", async () => {
  const client = makeFakeClient({ receiptCount: 1, currentStatus: "attached" });
  const result = await syncReceiptStatusForTransaction(client, {
    businessId: "biz-1",
    transactionId: "tx-1",
    actorUserId: "user-1"
  });
  assert.equal(result, null);
});

test("syncReceiptStatusForTransaction reverts attached back to pending once the last receipt is removed", async () => {
  const client = makeFakeClient({ receiptCount: 0, currentStatus: "attached" });
  const result = await syncReceiptStatusForTransaction(client, {
    businessId: "biz-1",
    transactionId: "tx-1"
  });
  assert.equal(result.receipt_status, "pending");
});

test("syncReceiptStatusForTransaction never overwrites an explicit 'missing' attestation when no receipts exist", async () => {
  const client = makeFakeClient({ receiptCount: 0, currentStatus: "missing" });
  const result = await syncReceiptStatusForTransaction(client, {
    businessId: "biz-1",
    transactionId: "tx-1"
  });
  // The UPDATE ... WHERE receipt_status = 'attached' guard means a 'missing'
  // row is never matched, so no rows are touched.
  assert.equal(result, null);
});

test("syncReceiptStatusForTransaction never overwrites an explicit 'not_required' attestation when no receipts exist", async () => {
  const client = makeFakeClient({ receiptCount: 0, currentStatus: "not_required" });
  const result = await syncReceiptStatusForTransaction(client, {
    businessId: "biz-1",
    transactionId: "tx-1"
  });
  assert.equal(result, null);
});

test("syncReceiptStatusForTransaction returns null immediately when no transactionId is given", async () => {
  const client = { async query() { throw new Error("should not be called"); } };
  const result = await syncReceiptStatusForTransaction(client, { businessId: "biz-1", transactionId: null });
  assert.equal(result, null);
});
