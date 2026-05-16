"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

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
    forceProjectListError: false
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, res, next) {
          if (!req.headers.authorization) {
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
          return { id: "project_1" };
        },
        updateProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateProject", args });
          return { id: "project_1" };
        },
        deleteProject: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteProject", args });
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
          return { id: "expense_1" };
        },
        getBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getBillableExpense", args });
          return null;
        },
        updateBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateBillableExpense", args });
          return { id: "expense_1" };
        },
        deleteBillableExpense: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteBillableExpense", args });
          return true;
        }
      };
    }
    if (requestName === "../services/invoiceService") {
      return {
        listInvoices: async () => [],
        createInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "createInvoice", args });
          return { id: "invoice_1" };
        },
        getInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "getInvoice", args });
          return null;
        },
        updateInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "updateInvoice", args });
          return { id: "invoice_1" };
        },
        deleteInvoice: async (...args) => {
          state.serviceCalls.push({ routeName, method: "deleteInvoice", args });
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
  return agent.set("Authorization", "Bearer test-token");
}

function authedWithCsrf(agent) {
  return authed(agent).set("x-csrf-token", "test-csrf");
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

test("projects list logs service failures instead of swallowing them silently", async () => {
  const fixture = loadRouter(PROJECTS_ROUTE_PATH, "projects");
  try {
    fixture.state.forceProjectListError = true;
    const response = await authed(request(fixture.app).get("/api/test"));

    assert.equal(response.status, 500);
    assert.equal(fixture.state.logErrors.length, 1);
    assert.match(fixture.state.logErrors[0].message, /GET \/projects failed/);
    assert.match(String(fixture.state.logErrors[0].context?.err || ""), /project list exploded/);
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
