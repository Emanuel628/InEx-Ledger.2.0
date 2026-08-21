"use strict";

/**
 * Validation and delete-behavior coverage for the V2/Business CRUD services
 * (vendorService, customerService, invoiceService, billService), added on
 * top of tests/v2BusinessCrudServices.test.js (which only proves pool.query
 * is reached correctly and does not exercise validation or delete
 * semantics).
 *
 * This file asserts:
 *   - create()/update() reject invalid input (negative amount, missing
 *     required field, oversized string) by throwing a 400-shaped error
 *     (V2BusinessValidationError, err.status === 400) *before* pool.query
 *     is ever called.
 *   - create()/update() still succeed for valid input and pass sane values
 *     through to pool.query.
 *   - delete* remain hard deletes (`DELETE ... RETURNING id`) -- the
 *     `vendors`/`customers`/`invoices`/`bills` tables have no
 *     `deleted_at`/audit columns (see db/migrations/20260419_create_v2_
 *     business_tables.sql), so soft-delete parity with `transactions`
 *     (services/transactionAuditService.js) was intentionally left as a
 *     flagged follow-up rather than an invented schema change in this pass.
 *     These tests pin that decision down: if a future change adds
 *     deleted_at columns and switches these to soft delete, they should be
 *     updated (not silently left asserting hard-delete SQL).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const { V2BusinessValidationError } = require("../services/v2BusinessValidationService");

function loadServiceWithFakePool(modulePath, queryImpl) {
  const originalLoad = Module._load.bind(Module);
  const capturedQueries = [];

  const fakePool = {
    async query(sql, params) {
      capturedQueries.push({ sql, params });
      return queryImpl(sql, params);
    }
  };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db" || requestName === "../db.js") {
      return { pool: fakePool };
    }
    return originalLoad(requestName, parent, isMain);
  };

  let service;
  try {
    delete require.cache[require.resolve(modulePath)];
    service = require(modulePath);
  } finally {
    Module._load = originalLoad;
  }

  return { service, capturedQueries };
}

function assertRejectsWith400(promise) {
  return assert.rejects(promise, (err) => {
    assert.ok(err instanceof V2BusinessValidationError, `expected V2BusinessValidationError, got ${err.name}`);
    assert.equal(err.status, 400);
    return true;
  });
}

// ---------------------------------------------------------------------------
// vendorService
// ---------------------------------------------------------------------------

test("vendorService.createVendor rejects missing name without querying the db", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/vendorService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(service.createVendor("biz-1", { name: "" }));
  await assertRejectsWith400(service.createVendor("biz-1", {}));
  assert.equal(capturedQueries.length, 0);
});

test("vendorService.createVendor rejects an oversized name and a malformed email", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/vendorService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(service.createVendor("biz-1", { name: "A".repeat(500) }));
  await assertRejectsWith400(service.createVendor("biz-1", { name: "Acme", email: "not-an-email" }));
  assert.equal(capturedQueries.length, 0);
});

test("vendorService.createVendor/updateVendor succeed for valid input", async () => {
  const row = { id: "vendor-1", business_id: "biz-1", name: "Acme Supplies" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/vendorService.js",
    () => ({ rows: [row], rowCount: 1 })
  );

  const created = await service.createVendor("biz-1", {
    name: "Acme Supplies",
    email: "billing@acme.example",
    phone: "555-0100",
    address: { city: "Toronto" }
  });
  assert.deepEqual(created, row);

  const updated = await service.updateVendor("biz-1", "vendor-1", { name: "Acme Supplies Inc" });
  assert.deepEqual(updated, row);
  assert.equal(capturedQueries.length, 2);
});

test("vendorService.deleteVendor still issues a hard DELETE (no soft-delete columns exist)", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/vendorService.js",
    (sql) => {
      assert.match(sql, /^\s*DELETE FROM vendors/i);
      assert.doesNotMatch(sql, /deleted_at/i);
      return { rows: [{ id: "vendor-1" }], rowCount: 1 };
    }
  );
  const deleted = await service.deleteVendor("biz-1", "vendor-1");
  assert.equal(deleted, true);
  assert.equal(capturedQueries.length, 1);
  assert.match(capturedQueries[0].sql, /DELETE/i);
});

// ---------------------------------------------------------------------------
// customerService
// ---------------------------------------------------------------------------

test("customerService.createCustomer rejects missing name and oversized phone", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/customerService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(service.createCustomer("biz-1", {}));
  await assertRejectsWith400(service.createCustomer("biz-1", { name: "Jane", phone: "5".repeat(60) }));
  assert.equal(capturedQueries.length, 0);
});

test("customerService.createCustomer succeeds for valid input", async () => {
  const row = { id: "cust-1", business_id: "biz-1", name: "Jane Client" };
  const { service } = loadServiceWithFakePool(
    "../services/customerService.js",
    () => ({ rows: [row], rowCount: 1 })
  );
  const created = await service.createCustomer("biz-1", { name: "Jane Client" });
  assert.deepEqual(created, row);
});

test("customerService.deleteCustomer still issues a hard DELETE (no soft-delete columns exist)", async () => {
  const { service } = loadServiceWithFakePool(
    "../services/customerService.js",
    (sql) => {
      assert.match(sql, /^\s*DELETE FROM customers/i);
      return { rows: [{ id: "cust-1" }], rowCount: 1 };
    }
  );
  assert.equal(await service.deleteCustomer("biz-1", "cust-1"), true);
});

// ---------------------------------------------------------------------------
// invoiceService
// ---------------------------------------------------------------------------

const VALID_INVOICE_INPUT = {
  customer_id: "00000000-0000-4000-8000-000000000251",
  number: "INV-1001",
  status: "draft",
  issue_date: "2026-08-01",
  due_date: "2026-08-31",
  total_amount: 500,
  currency: "usd"
};

test("invoiceService.createInvoice rejects a negative total_amount without querying the db", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(
    service.createInvoice("biz-1", { ...VALID_INVOICE_INPUT, total_amount: -50 })
  );
  assert.equal(capturedQueries.length, 0);
});

test("invoiceService.createInvoice rejects a missing customer_id and an invalid currency", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  const { customer_id, ...withoutCustomer } = VALID_INVOICE_INPUT;
  await assertRejectsWith400(service.createInvoice("biz-1", withoutCustomer));
  await assertRejectsWith400(
    service.createInvoice("biz-1", { ...VALID_INVOICE_INPUT, currency: "dollars" })
  );
  assert.equal(capturedQueries.length, 0);
});

test("invoiceService.createInvoice rejects an oversized invoice number", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(
    service.createInvoice("biz-1", { ...VALID_INVOICE_INPUT, number: "N".repeat(200) })
  );
  assert.equal(capturedQueries.length, 0);
});

test("invoiceService.createInvoice/updateInvoice succeed for valid input", async () => {
  const row = { id: "inv-1", business_id: "biz-1", customer_id: VALID_INVOICE_INPUT.customer_id, total_amount: "500.00" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    () => ({ rows: [row], rowCount: 1 })
  );

  const created = await service.createInvoice("biz-1", VALID_INVOICE_INPUT);
  assert.deepEqual(created, row);

  const updated = await service.updateInvoice("biz-1", "inv-1", VALID_INVOICE_INPUT);
  assert.deepEqual(updated, row);
  assert.equal(capturedQueries.length, 2);
});

test("invoiceService.deleteInvoice still issues a hard DELETE (no soft-delete columns exist)", async () => {
  const { service } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    (sql) => {
      assert.match(sql, /^\s*DELETE FROM invoices/i);
      return { rows: [{ id: "inv-1" }], rowCount: 1 };
    }
  );
  assert.equal(await service.deleteInvoice("biz-1", "inv-1"), true);
});

// ---------------------------------------------------------------------------
// billService
// ---------------------------------------------------------------------------

const VALID_BILL_INPUT = {
  vendor_id: "00000000-0000-4000-8000-000000000451",
  number: "BILL-2001",
  status: "open",
  issue_date: "2026-08-01",
  due_date: "2026-08-31",
  total_amount: 250,
  currency: "cad"
};

test("billService.createBill rejects a non-finite total_amount without querying the db", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/billService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(
    service.createBill("biz-1", { ...VALID_BILL_INPUT, total_amount: NaN })
  );
  await assertRejectsWith400(
    service.createBill("biz-1", { ...VALID_BILL_INPUT, vendor_id: "not-a-uuid" })
  );
  assert.equal(capturedQueries.length, 0);
});

test("billService.createBill rejects an unknown status value", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/billService.js",
    () => { throw new Error("pool.query should not be called for invalid input"); }
  );
  await assertRejectsWith400(
    service.createBill("biz-1", { ...VALID_BILL_INPUT, status: "archived" })
  );
  assert.equal(capturedQueries.length, 0);
});

test("billService.createBill/updateBill succeed for valid input", async () => {
  const row = { id: "bill-1", business_id: "biz-1", vendor_id: VALID_BILL_INPUT.vendor_id, total_amount: "250.00" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/billService.js",
    () => ({ rows: [row], rowCount: 1 })
  );

  const created = await service.createBill("biz-1", VALID_BILL_INPUT);
  assert.deepEqual(created, row);

  const updated = await service.updateBill("biz-1", "bill-1", VALID_BILL_INPUT);
  assert.deepEqual(updated, row);
  assert.equal(capturedQueries.length, 2);
});

test("billService.deleteBill still issues a hard DELETE (no soft-delete columns exist)", async () => {
  const { service } = loadServiceWithFakePool(
    "../services/billService.js",
    (sql) => {
      assert.match(sql, /^\s*DELETE FROM bills/i);
      return { rows: [{ id: "bill-1" }], rowCount: 1 };
    }
  );
  assert.equal(await service.deleteBill("biz-1", "bill-1"), true);
});
