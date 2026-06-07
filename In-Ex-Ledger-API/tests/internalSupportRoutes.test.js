"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/internalSupport.routes.js");

function loadInternalSupportRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = { queryCount: 0 };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queryCount += 1;
            if (/SELECT id\s+FROM users\s+WHERE lower\(email\) = lower\(\$1\)/i.test(sql)) {
              if (String(params[0]).toLowerCase() === "owner@example.com") {
                return { rows: [{ id: "user_support_1" }], rowCount: 1 };
              }
              return { rows: [], rowCount: 0 };
            }
            if (/FROM users\s+WHERE id = \$1/i.test(sql)) {
              return {
                rows: [{
                  id: "user_support_1",
                  email: "owner@example.com",
                  display_name: "Owner Example",
                  email_verified: true,
                  role: "user",
                  created_at: "2026-06-01T12:00:00.000Z",
                  active_business_id: "biz_support_1"
                }],
                rowCount: 1
              };
            }
            if (/SELECT id, region, language\s+FROM businesses\s+WHERE user_id = \$1/i.test(sql.replace(/\s+/g, " "))) {
              return {
                rows: [{
                  id: "biz_support_1",
                  region: "US",
                  language: "en"
                }],
                rowCount: 1
              };
            }
            if (/FROM businesses b\s+JOIN users u/i.test(sql.replace(/\s+/g, " "))) {
              return {
                rows: [{
                  id: "biz_support_1",
                  name: "Support Business",
                  user_id: "user_support_1",
                  region: "US",
                  language: "en",
                  created_at: "2026-06-02T09:00:00.000Z",
                  owner_email: "owner@example.com",
                  active_business_id: "biz_support_1"
                }],
                rowCount: 1
              };
            }
            throw new Error(`Unhandled SQL: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        findBillingAnchorBusinessIdForUser: async () => "biz_support_1",
        getSubscriptionSnapshotForBusiness: async () => ({
          effectiveTier: "v1",
          effectiveStatus: "active",
          additionalBusinesses: 2,
          maxBusinessesAllowed: 3,
          currentPeriodEnd: "2026-07-01T00:00:00.000Z",
          cancelAtPeriodEnd: false
        })
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/internalSupport.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/internal/support", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("internal support routes reject invalid secrets before any DB query", async () => {
  process.env.INEX_LEDGER_SUPPORT_SECRET = "support-secret-test";
  const fixture = loadInternalSupportRouterFixture();

  try {
    const response = await request(fixture.app)
      .get("/api/internal/support/users/owner@example.com")
      .set("x-support-secret", "wrong-secret");

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { ok: false, message: "Unauthorized." });
    assert.equal(fixture.state.queryCount, 0);
  } finally {
    fixture.cleanup();
  }
});

test("internal support user lookup returns subscription and locale context", async () => {
  process.env.INEX_LEDGER_SUPPORT_SECRET = "support-secret-test";
  const fixture = loadInternalSupportRouterFixture();

  try {
    const response = await request(fixture.app)
      .get("/api/internal/support/users/owner@example.com")
      .set("x-support-secret", "support-secret-test");

    assert.equal(response.status, 200);
    assert.equal(response.body?.ok, true);
    assert.equal(response.body?.item?.displayName, "Owner Example");
    assert.equal(response.body?.item?.plan, "v1");
    assert.equal(response.body?.item?.subscriptionStatus, "active");
    assert.equal(response.body?.item?.region, "US");
    assert.equal(response.body?.item?.language, "en");
  } finally {
    fixture.cleanup();
  }
});

test("internal support business and subscription lookups return bounded context only", async () => {
  process.env.INEX_LEDGER_SUPPORT_SECRET = "support-secret-test";
  const fixture = loadInternalSupportRouterFixture();

  try {
    const businessResponse = await request(fixture.app)
      .get("/api/internal/support/businesses/biz_support_1")
      .set("x-support-secret", "support-secret-test");
    assert.equal(businessResponse.status, 200);
    assert.equal(businessResponse.body?.item?.includedBusinesses, 1);
    assert.equal(businessResponse.body?.item?.additionalBusinessSlots, 2);
    assert.equal(businessResponse.body?.item?.businessLimit, 3);

    const subscriptionResponse = await request(fixture.app)
      .get("/api/internal/support/users/user_support_1/subscription")
      .set("x-support-secret", "support-secret-test");
    assert.equal(subscriptionResponse.status, 200);
    assert.equal(subscriptionResponse.body?.item?.plan, "v1");
    assert.equal(subscriptionResponse.body?.item?.subscriptionStatus, "active");
    assert.equal(subscriptionResponse.body?.item?.additionalBusinessSlots, 2);
    assert.equal(subscriptionResponse.body?.item?.cancelAtPeriodEnd, false);
  } finally {
    fixture.cleanup();
  }
});
