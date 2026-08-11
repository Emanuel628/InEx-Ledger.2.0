"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const NOT_FOUND_ID = "00000000-0000-4000-8000-00000000dead";

const ROUTES = {
  customers: {
    routePath: require.resolve("../routes/customers.routes.js"),
    servicePath: "../services/customerService",
    serviceName: "customerService",
    methods: ["listCustomers", "createCustomer", "getCustomer", "updateCustomer", "deleteCustomer"],
    notFoundMessage: "Customer not found."
  },
  vendors: {
    routePath: require.resolve("../routes/vendors.routes.js"),
    servicePath: "../services/vendorService",
    serviceName: "vendorService",
    methods: ["listVendors", "createVendor", "getVendor", "updateVendor", "deleteVendor"],
    notFoundMessage: "Vendor not found."
  },
  projects: {
    routePath: require.resolve("../routes/projects.routes.js"),
    servicePath: "../services/projectService",
    serviceName: "projectService",
    methods: ["listProjects", "createProject", "getProject", "updateProject", "deleteProject"],
    notFoundMessage: "Project not found"
  },
  "billable-expenses": {
    routePath: require.resolve("../routes/billable-expenses.routes.js"),
    servicePath: "../services/billableExpenseService",
    serviceName: "billableExpenseService",
    methods: [
      "listBillableExpenses",
      "createBillableExpense",
      "getBillableExpense",
      "updateBillableExpense",
      "deleteBillableExpense"
    ],
    notFoundMessage: "Billable expense not found"
  }
};

function loadFixture(routeKey) {
  const config = ROUTES[routeKey];
  const originalLoad = Module._load.bind(Module);
  const [listFn, createFn, getFn, updateFn, deleteFn] = config.methods;

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user_1" }; next(); } };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }
    if (requestName === "../api/utils/requireV2BusinessEnabled" || /requireV2BusinessEnabled\.js$/.test(requestName)) {
      return {
        requireV2BusinessEnabled(req, _res, next) { req.business = { id: "biz_1" }; next(); },
        requireV2Entitlement(_req, _res, next) { next(); }
      };
    }
    if (requestName === config.servicePath || new RegExp(`${config.serviceName}\\.js$|${config.serviceName}$`).test(requestName)) {
      return {
        [listFn]: async () => [],
        [createFn]: async () => ({ id: "created_1" }),
        [getFn]: async (_businessId, id) => (id === NOT_FOUND_ID ? null : { id }),
        [updateFn]: async (_businessId, id) => (id === NOT_FOUND_ID ? null : { id }),
        [deleteFn]: async (_businessId, id) => id !== NOT_FOUND_ID
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[config.routePath];
  const router = require(config.routePath);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/test", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[config.routePath];
    }
  };
}

for (const [routeKey, config] of Object.entries(ROUTES)) {
  test(`${routeKey}: GET /:id returns 404 for an unknown id`, async () => {
    const fixture = loadFixture(routeKey);
    try {
      const response = await request(fixture.app).get(`/api/test/${NOT_FOUND_ID}`);
      assert.equal(response.status, 404);
      assert.equal(response.body.error, config.notFoundMessage);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${routeKey}: PUT /:id returns 404 for an unknown id`, async () => {
    const fixture = loadFixture(routeKey);
    try {
      const response = await request(fixture.app)
        .put(`/api/test/${NOT_FOUND_ID}`)
        .send(routeKey === "billable-expenses"
          ? {
            project_id: "00000000-0000-4000-8000-000000000001",
            description: "Travel",
            amount: 10,
            currency: "USD",
            expense_date: "2026-05-14"
          }
          : { name: "Updated name" });
      assert.equal(response.status, 404);
      assert.equal(response.body.error, config.notFoundMessage);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${routeKey}: DELETE /:id returns 404 for an unknown id`, async () => {
    const fixture = loadFixture(routeKey);
    try {
      const response = await request(fixture.app).delete(`/api/test/${NOT_FOUND_ID}`);
      assert.equal(response.status, 404);
      assert.equal(response.body.error, config.notFoundMessage);
    } finally {
      fixture.cleanup();
    }
  });

  test(`${routeKey}: GET /:id rejects a non-UUID id before the service layer`, async () => {
    const fixture = loadFixture(routeKey);
    try {
      const response = await request(fixture.app).get("/api/test/not-a-uuid");
      assert.equal(response.status, 400);
    } finally {
      fixture.cleanup();
    }
  });
}
