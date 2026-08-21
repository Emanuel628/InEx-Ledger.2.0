"use strict";

/**
 * Regression coverage for the V2/Business CRUD service layer
 * (projectService, billableExpenseService, vendorService, customerService,
 * invoiceService, billService, arApService).
 *
 * Every one of these services previously called methods that do not exist
 * on the `db` module exported by `db.js` (`db.any`/`db.one`/`db.oneOrNone`/
 * `db.result`/`db.query` — a pg-promise-shaped API this codebase's plain
 * `pg.Pool` does not implement), so every function threw `TypeError` on
 * every real call. There was zero test coverage for any of these files,
 * which is how the bug shipped undetected. These tests intercept `../db`
 * with a fake `pool.query`-based double (matching the fix) and assert each
 * function actually reaches `pool.query` and returns the expected shape.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

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

test("projectService reaches pool.query (not db.any/db.one/db.result) for every CRUD op", async () => {
  const row = { id: "proj-1", business_id: "biz-1", name: "Website Redesign" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/projectService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );

  const listed = await service.listProjects("biz-1");
  assert.deepEqual(listed, [row]);

  const created = await service.createProject("biz-1", { name: "Website Redesign" });
  assert.deepEqual(created, row);

  const fetched = await service.getProject("biz-1", "proj-1");
  assert.deepEqual(fetched, row);

  const updated = await service.updateProject("biz-1", "proj-1", { name: "Website Redesign v2" });
  assert.deepEqual(updated, row);

  const deleted = await service.deleteProject("biz-1", "proj-1");
  assert.equal(deleted, true);

  assert.equal(capturedQueries.length, 5);
});

test("projectService.getProject returns null (not throw) when no row matches", async () => {
  const { service } = loadServiceWithFakePool(
    "../services/projectService.js",
    () => ({ rows: [], rowCount: 0 })
  );
  assert.equal(await service.getProject("biz-1", "missing"), null);
  assert.equal(await service.deleteProject("biz-1", "missing"), false);
});

test("billableExpenseService reaches pool.query for every CRUD op", async () => {
  const row = { id: "exp-1", business_id: "biz-1", project_id: "proj-1", amount: "125.00" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/billableExpenseService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );

  assert.deepEqual(await service.listBillableExpenses("biz-1"), [row]);
  assert.deepEqual(await service.createBillableExpense("biz-1", { amount: "125.00" }), row);
  assert.deepEqual(await service.getBillableExpense("biz-1", "exp-1"), row);
  assert.deepEqual(
    await service.updateBillableExpense("biz-1", "exp-1", { amount: "150.00" }),
    row
  );
  assert.equal(await service.deleteBillableExpense("biz-1", "exp-1"), true);
  assert.equal(capturedQueries.length, 5);
});

test("vendorService reaches pool.query for every CRUD op", async () => {
  const row = { id: "vendor-1", business_id: "biz-1", name: "Acme Supplies" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/vendorService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [{ id: "vendor-1" }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );

  assert.deepEqual(await service.listVendors("biz-1"), [row]);
  assert.deepEqual(await service.createVendor("biz-1", { name: "Acme Supplies" }), row);
  assert.deepEqual(await service.getVendor("biz-1", "vendor-1"), row);
  assert.deepEqual(await service.updateVendor("biz-1", "vendor-1", { name: "Acme Supplies Inc" }), row);
  assert.equal(await service.deleteVendor("biz-1", "vendor-1"), true);
  assert.equal(capturedQueries.length, 5);
});

test("customerService reaches pool.query for every CRUD op", async () => {
  const row = { id: "cust-1", business_id: "biz-1", name: "Jane Client" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/customerService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [{ id: "cust-1" }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );

  assert.deepEqual(await service.listCustomers("biz-1"), [row]);
  assert.deepEqual(await service.createCustomer("biz-1", { name: "Jane Client" }), row);
  assert.deepEqual(await service.getCustomer("biz-1", "cust-1"), row);
  assert.deepEqual(await service.updateCustomer("biz-1", "cust-1", { name: "Jane Client Jr" }), row);
  assert.equal(await service.deleteCustomer("biz-1", "cust-1"), true);
  assert.equal(capturedQueries.length, 5);
});

test("invoiceService reaches pool.query for every CRUD op", async () => {
  const row = { id: "inv-1", business_id: "biz-1", customer_id: "cust-1", total_amount: "500.00" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/invoiceService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [{ id: "inv-1" }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );
  // NOTE: customer_id/number/status/issue_date/currency below are complete
  // and well-formed (a real UUID, a real ISO date, a 3-letter currency code)
  // because services/invoiceService.js now validates input before querying
  // (see services/v2BusinessValidationService.js and
  // tests/v2BusinessServicesValidationAndDelete.test.js for validation
  // rejection coverage) -- this test only asserts pool.query is reached and
  // its return value passed through, so the payload just needs to be valid.
  const validInvoicePayload = {
    customer_id: "00000000-0000-4000-8000-000000000251",
    number: "INV-1001",
    status: "draft",
    issue_date: "2026-08-01",
    total_amount: "500.00",
    currency: "usd"
  };

  assert.deepEqual(await service.listInvoices("biz-1"), [row]);
  assert.deepEqual(await service.createInvoice("biz-1", validInvoicePayload), row);
  assert.deepEqual(await service.getInvoice("biz-1", "inv-1"), row);
  assert.deepEqual(
    await service.updateInvoice("biz-1", "inv-1", { ...validInvoicePayload, total_amount: "600.00" }),
    row
  );
  assert.equal(await service.deleteInvoice("biz-1", "inv-1"), true);
  assert.equal(capturedQueries.length, 5);
});

test("billService reaches pool.query for every CRUD op", async () => {
  const row = { id: "bill-1", business_id: "biz-1", vendor_id: "vendor-1", total_amount: "250.00" };
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/billService.js",
    (sql) => {
      if (/^DELETE/i.test(sql)) return { rows: [{ id: "bill-1" }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    }
  );
  // NOTE: see the equivalent comment in the invoiceService test above --
  // billService now validates input before querying, so this payload is
  // complete and well-formed rather than a minimal partial one.
  const validBillPayload = {
    vendor_id: "00000000-0000-4000-8000-000000000451",
    number: "BILL-2001",
    status: "open",
    issue_date: "2026-08-01",
    total_amount: "250.00",
    currency: "cad"
  };

  assert.deepEqual(await service.listBills("biz-1"), [row]);
  assert.deepEqual(await service.createBill("biz-1", validBillPayload), row);
  assert.deepEqual(await service.getBill("biz-1", "bill-1"), row);
  assert.deepEqual(
    await service.updateBill("biz-1", "bill-1", { ...validBillPayload, total_amount: "300.00" }),
    row
  );
  assert.equal(await service.deleteBill("biz-1", "bill-1"), true);
  assert.equal(capturedQueries.length, 5);
});

test("arApService.getArApSummary reaches pool.query and aggregates AR/AP aging buckets", async () => {
  const { service, capturedQueries } = loadServiceWithFakePool(
    "../services/arApService.js",
    (sql) => {
      if (/FROM invoices/i.test(sql)) {
        return { rows: [{ current: "100.00", overdue_1_30: "50.00", overdue_31_60: null, overdue_61_90: null, overdue_90_plus: null }], rowCount: 1 };
      }
      if (/FROM bills/i.test(sql)) {
        return { rows: [{ current: "40.00", overdue_1_30: null, overdue_31_60: "10.00", overdue_61_90: null, overdue_90_plus: null }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  );

  const summary = await service.getArApSummary("biz-1");
  assert.equal(capturedQueries.length, 2);
  assert.deepEqual(summary, {
    ar: { current: 100, overdue_1_30: 50, overdue_31_60: 0, overdue_61_90: 0, overdue_90_plus: 0 },
    ap: { current: 40, overdue_1_30: 0, overdue_31_60: 10, overdue_61_90: 0, overdue_90_plus: 0 }
  });
});
