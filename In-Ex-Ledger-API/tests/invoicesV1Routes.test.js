"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/invoices-v1.routes.js");

function loadInvoicesRouter() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    insertAttempts: 0,
    invoiceNumbersTried: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000131" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "00000000-0000-4000-8000-000000000231"
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "pro" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {}
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT COALESCE\(/i.test(sql) && /FROM invoices_v1/i.test(sql)) {
              if (state.insertAttempts === 0) {
                return { rows: [{ max_number: 1 }], rowCount: 1 };
              }
              return { rows: [{ max_number: 2 }], rowCount: 1 };
            }

            if (/INSERT INTO invoices_v1/i.test(sql)) {
              state.insertAttempts += 1;
              state.invoiceNumbersTried.push(params[2]);
              if (state.insertAttempts === 1) {
                const err = new Error("duplicate key value violates unique constraint");
                err.code = "23505";
                throw err;
              }
              return {
                rows: [{
                  id: params[0],
                  business_id: params[1],
                  invoice_number: params[2],
                  customer_name: params[3],
                  status: params[7],
                  currency: params[8],
                  line_items: JSON.parse(params[9]),
                  total_amount: params[13]
                }],
                rowCount: 1
              };
            }

            throw new Error(`Unhandled SQL in invoicesV1Routes.test.js: ${sql}`);
          }
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/invoices-v1.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    throw error;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/invoices-v1", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message || "error" });
  });
  return app;
}

test("invoice creation retries with a fresh invoice number after a uniqueness conflict", async () => {
  const fixture = loadInvoicesRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/invoices-v1")
      .send({
        customer_name: "Client A",
        issue_date: "2026-04-25",
        due_date: "2026-05-25",
        currency: "CAD",
        tax_rate: 0,
        line_items: [
          { description: "Consulting", quantity: 1, unit_price: 100 }
        ]
      });

    assert.equal(response.status, 201);
    assert.equal(fixture.state.insertAttempts, 2);
    assert.deepEqual(fixture.state.invoiceNumbersTried, [
      `INV-${new Date().getFullYear()}-0002`,
      `INV-${new Date().getFullYear()}-0003`
    ]);
    assert.equal(response.body.invoice_number, `INV-${new Date().getFullYear()}-0003`);
  } finally {
    fixture.cleanup();
  }
});
