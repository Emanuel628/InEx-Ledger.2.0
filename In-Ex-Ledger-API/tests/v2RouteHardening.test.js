"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const PROJECTS_ROUTE_PATH = require.resolve("../routes/projects.routes.js");
const VENDORS_ROUTE_PATH = require.resolve("../routes/vendors.routes.js");
const CUSTOMERS_ROUTE_PATH = require.resolve("../routes/customers.routes.js");
const BILLS_ROUTE_PATH = require.resolve("../routes/bills.routes.js");
const BILLABLE_EXPENSES_ROUTE_PATH = require.resolve("../routes/billable-expenses.routes.js");
const INVOICES_ROUTE_PATH = require.resolve("../routes/invoices.routes.js");

function loadRouter(routePath, routeName) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    serviceCalls: [],
    logErrors: [],
    forceProjectListError: false,
    forceServiceErrorFor: null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (!String(req.headers.cookie || "").includes("access_token=")) {
            return res.status(401).json({ error: "Authentication required" });
          }
          req.user = { id: "00000000-0000-4000-8000-000000009001" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(req, res, next) {
          if (!req.headers["x-csrf-token"]) {
            return res.status(403).json({ error: "CSRF token required" });
          }
          next();
        }
      };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createDataApiLimiter() {
          return (req, res, next) => {
            if (req.headers["x-test-rate-limit"] === "block") {
              return res.status(429).json({ error: "Too many requests." });
            }
            next();
          };
        }
      };
    }
    if (requestName === "../api/utils/requireV2BusinessEnabled" || /requireV2BusinessEnabled\.js$/.test(requestName)) {
      return {
        requireV2BusinessEnabled(req, _res, next) {
          req.business = { id: "00000000-0000-4000-8000-000000009002" };
          next();
        },
        requireV2Entitlement(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(message, context) {
          state.logErrors.push({ message, context });
        }
      };
    }
    if (requestName === "../services/projectService") {
      return {
        listProjects: async () => {
          if (state.forceProjectListError) {
            throw new Error("project list exploded");
          }
          return [];
        },
        getProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getProject", args });
          return null;
        },
        createProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createProject", args });
          if (state.forceServiceErrorFor === "createProject") {
            throw new Error("project create exploded");
          }
          return { id: "project_1" };
        },
        updateProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateProject", args });
          if (state.forceServiceErrorFor === "updateProject") {
            throw new Error("project update exploded");
          }
          return { id: "project_1" };
        },
        deleteProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteProject", args });
          if (state.forceServiceErrorFor === "deleteProject") {
            throw new Error("project delete exploded");
          }
          return true;
        }
      };
    }
    if (requestName === "../services/vendorService") {
      return {
        listVendors: async () => [],
        createVendor: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createVendor", args });
          return { id: "vendor_1" };
        },
        getVendor: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getVendor", args });
          return null;
        },
        updateVendor: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateVendor", args });
          return { id: "vendor_1" };
        },
        deleteVendor: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteVendor", args });
          return true;
        }
      };
    }
    if (requestName === "../services/customerService") {
      return {
        listCustomers: async () => [],
        createCustomer: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createCustomer", args });
          return { id: "customer_1" };
        },
        getCustomer: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getCustomer", args });
          return null;
        },
        updateCustomer: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateCustomer", args });
          return { id: "customer_1" };
        },
        deleteCustomer: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteCustomer", args });
          return true;
        }
      };
    }
    if (requestName === "../services/billService") {
      return {
        listBills: async () => [],
        createBill: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createBill", args });
          return { id: "bill_1" };
        },
        getBill: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getBill", args });
          return null;
        },
        updateBill: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateBill", args });
          return { id: "bill_1" };
        },
        deleteBill: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteBill", args });
          return true;
        }
      };
    }
    if (requestName === "../services/billableExpenseService") {
      return {
        listBillableExpenses: async () => [],
        createBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createBillableExpense", args });
          if (state.forceServiceErrorFor === "createBillableExpense") {
            throw new Error("billable expense create exploded");
          }
          return { id: "expense_1" };
        },
        getBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getBillableExpense", args });
          return null;
        },
        updateBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateBillableExpense", args });
          if (state.forceServiceErrorFor === "updateBillableExpense") {
            throw new Error("billable expense update exploded");
          }
          return { id: "expense_1" };
        },
        deleteBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteBillableExpense", args });
          if (state.forceServiceErrorFor === "deleteBillableExpense") {
            throw new Error("billable expense delete exploded");
          }
          return true;
        }
      };
    }
    if (requestName === "../services/invoiceService") {
      return {
        listInvoices: async (...args) => {
          state.serviceCalls.push({ routeName, method: "listInvoices", args });
          if (state.forceServiceErrorFor === "listInvoices") {
            throw new Error("invoice list exploded");
          }
          return [];
        },
        createInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createInvoice", args });
          if (state.forceServiceErrorFor === "createInvoice") {
            throw new Error("invoice create exploded");
          }
          return { id: "invoice_1" };
        },
        getInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getInvoice", args });
          if (state.forceServiceErrorFor === "getInvoice") {
            throw new Error("invoice get exploded");
          }
          return null;
        },
        updateInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateInvoice", args });
          if (state.forceServiceErrorFor === "updateInvoice") {
            throw new Error("invoice update exploded");
          }
          return { id: "invoice_1" };
        },
        deleteInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteInvoice", args });
          if (state.forceServiceErrorFor === "deleteInvoice") {
            throw new Error("invoice delete exploded");
          }
          return true;
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[routePath];

  try {
    const router = require(routePath);
    const app = express();
    app.use(express.json());
    app.use("/api/test", router);
    attachCentralErrorHandler(app, {
      logError: (message, context) => state.logErrors.push({ message, context })
    });
    return {
      app,
      state,
      cleanup() {
        delete require.cache[routePath];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function authed(agent) {
  return agent.set("Cookie", "access_token=test-token");
}

function authedWithCsrf(agent) {
  return authed(agent).set("x-csrf-token", "test-csrf");
}

const TEST_PROJECT_ID = "00000000-0000-4000-8000-000000009005";
const TEST_EXPENSE_ID = "00000000-0000-4000-8000-000000009007";

function validBillableExpensePayload() {
  return {
    project_id: TEST_PROJECT_ID,
    description: "Travel expense",
    amount: 12.5,
    currency: "USD",
    expense_date: "2026-05-14"
  };
}

test("projects routes require auth independently of V2 middleware", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    const response = await request(fixture.app).get("/api/test");
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("projects routes enforce their route-level limiter before the service layer", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    const response = await authed(
      request(fixture.app)
        .get("/api/test")
        .set("x-test-rate-limit", "block")
    );

    assert.equal(response.status, 429);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("projects create rejects missing names before the service layer", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({ description: "missing name" });

    assert.equal(response.status, 400);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("projects create rejects non-object metadata before the service layer", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        name: "Website refresh",
        metadata: ["not", "an", "object"]
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /metadata must be a json object/i);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("vendors read rejects invalid ids before the service layer", async () => {
  const fixture = loadRouter(VENDORS_ROUTE_PATH, "vendors");
  try {
    const response = await authed(request(fixture.app).get("/api/test/not-a-uuid"));

    assert.equal(response.status, 400);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("customers update enforces CSRF on mutations", async () => {
  const fixture = loadRouter(CUSTOMERS_ROUTE_PATH, "customers");
  try {
    const response = await authed(
      request(fixture.app)
        .put("/api/test/00000000-0000-4000-8000-000000009003")
    ).send({ name: "Acme" });

    assert.equal(response.status, 403);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("bills create accepts zero-amount bills when the rest of the payload is valid", async () => {
  const fixture = loadRouter(BILLS_ROUTE_PATH, "bills");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        vendor_id: "00000000-0000-4000-8000-000000009004",
        number: "BILL-001",
        status: "draft",
        issue_date: "2026-05-14",
        due_date: "2026-06-14",
        total_amount: 0,
        currency: "USD"
      });

    assert.equal(response.status, 201);
    assert.equal(fixture.state.serviceCalls.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("bills create rejects arbitrary status strings before the service layer", async () => {
  const fixture = loadRouter(BILLS_ROUTE_PATH, "bills");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        vendor_id: "00000000-0000-4000-8000-000000009004",
        number: "BILL-001",
        status: "wild-status",
        issue_date: "2026-05-14",
        total_amount: 50,
        currency: "USD"
      });

    assert.equal(response.status, 400);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("bills create rejects metadata with invalid keys before the service layer", async () => {
  const fixture = loadRouter(BILLS_ROUTE_PATH, "bills");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        vendor_id: "00000000-0000-4000-8000-000000009004",
        number: "BILL-001",
        status: "draft",
        issue_date: "2026-05-14",
        total_amount: 50,
        currency: "USD",
        metadata: {
          "bad key": "nope"
        }
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /invalid key/i);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("billable expenses create rejects malformed payloads before the service layer", async () => {
  const fixture = loadRouter(BILLABLE_EXPENSES_ROUTE_PATH, "billable-expenses");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        project_id: "00000000-0000-4000-8000-000000009005",
        amount: 12.5,
        currency: "USD",
        expense_date: "2026-05-14"
      });

    assert.equal(response.status, 400);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("billable expenses create rejects deeply nested metadata before the service layer", async () => {
  const fixture = loadRouter(BILLABLE_EXPENSES_ROUTE_PATH, "billable-expenses");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        project_id: "00000000-0000-4000-8000-000000009005",
        description: "Travel expense",
        amount: 12.5,
        currency: "USD",
        expense_date: "2026-05-14",
        metadata: {
          one: {
            two: {
              three: {
                four: {
                  five: true
                }
              }
            }
          }
        }
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /maximum nesting depth/i);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("projects list logs service failures instead of swallowing them silently", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    fixture.state.forceProjectListError = true;
    const response = await authed(request(fixture.app).get("/api/test"));

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.equal(fixture.state.logErrors[0].message, "Unhandled error");
    assert.match(String(fixture.state.logErrors[0].context?.message || ""), /project list exploded/);
  } finally {
    fixture.cleanup();
  }
});

test("projects create service failures return 500, not validation-shaped 400", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    fixture.state.forceServiceErrorFor = "createProject";
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({ name: "Website refresh" });

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");
    assert.equal(fixture.state.serviceCalls.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("projects update and delete service failures return 500", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    fixture.state.forceServiceErrorFor = "updateProject";
    const updateResponse = await authedWithCsrf(
      request(fixture.app).put(`/api/test/${TEST_PROJECT_ID}`)
    ).send({ name: "Website refresh" });

    fixture.state.forceServiceErrorFor = "deleteProject";
    const deleteResponse = await authedWithCsrf(
      request(fixture.app).delete(`/api/test/${TEST_PROJECT_ID}`)
    );

    assert.equal(updateResponse.status, 500);
    assert.equal(deleteResponse.status, 500);
  } finally {
    fixture.cleanup();
  }
});

test("billable expense create service failures return 500, not validation-shaped 400", async () => {
  const fixture = loadRouter(BILLABLE_EXPENSES_ROUTE_PATH, "billable-expenses");
  try {
    fixture.state.forceServiceErrorFor = "createBillableExpense";
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send(validBillableExpensePayload());

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");
    assert.equal(fixture.state.serviceCalls.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("billable expense update and delete service failures return 500", async () => {
  const fixture = loadRouter(BILLABLE_EXPENSES_ROUTE_PATH, "billable-expenses");
  try {
    fixture.state.forceServiceErrorFor = "updateBillableExpense";
    const updateResponse = await authedWithCsrf(
      request(fixture.app).put(`/api/test/${TEST_EXPENSE_ID}`)
    ).send(validBillableExpensePayload());

    fixture.state.forceServiceErrorFor = "deleteBillableExpense";
    const deleteResponse = await authedWithCsrf(
      request(fixture.app).delete(`/api/test/${TEST_EXPENSE_ID}`)
    );

    assert.equal(updateResponse.status, 500);
    assert.equal(deleteResponse.status, 500);
  } finally {
    fixture.cleanup();
  }
});

test("invoices routes require auth independently of V2 middleware", async () => {
  const fixture = loadRouter(INVOICES_ROUTE_PATH, "invoices");
  try {
    const response = await request(fixture.app).get("/api/test");
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test("invoices routes enforce their route-level limiter before the service layer", async () => {
  const fixture = loadRouter(INVOICES_ROUTE_PATH, "invoices");
  try {
    const response = await authed(
      request(fixture.app)
        .get("/api/test")
        .set("x-test-rate-limit", "block")
    );

    assert.equal(response.status, 429);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("invoices delete enforces CSRF on mutations at the router level", async () => {
  const fixture = loadRouter(INVOICES_ROUTE_PATH, "invoices");
  try {
    const response = await authed(
      request(fixture.app)
        .delete("/api/test/00000000-0000-4000-8000-000000009006")
    );

    assert.equal(response.status, 403);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("invoices list logs service failures instead of swallowing them silently", async () => {
  const fixture = loadRouter(INVOICES_ROUTE_PATH, "invoices");
  try {
    fixture.state.forceServiceErrorFor = "listInvoices";
    const response = await authed(request(fixture.app).get("/api/test"));

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Failed to load invoices.");
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/invoices failed/);
    assert.match(String(fixture.state.logErrors[0].context?.err || ""), /invoice list exploded/);
  } finally {
    fixture.cleanup();
  }
});

test("invoices create rejects oversized metadata before the service layer", async () => {
  const fixture = loadRouter(INVOICES_ROUTE_PATH, "invoices");
  try {
    const response = await authedWithCsrf(request(fixture.app).post("/api/test"))
      .send({
        customer_id: "00000000-0000-4000-8000-000000009006",
        number: "INV-001",
        status: "draft",
        issue_date: "2026-05-14",
        total_amount: 120,
        currency: "USD",
        metadata: {
          notes: "x".repeat(5000)
        }
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.error || ""), /500 characters|4096 bytes/i);
    assert.equal(fixture.state.serviceCalls.length, 0);
  } finally {
    fixture.cleanup();
  }
});
