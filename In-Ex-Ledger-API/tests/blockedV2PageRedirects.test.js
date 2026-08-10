"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret";

// ENABLE_V2_BUSINESS is unset in the test env, matching production's default
// (no test in this suite sets it), so this exercises the real default-blocked
// behavior rather than a mocked one.
const { app } = require("../server.js");

const V2_BUSINESS_PAGES = ["ar-ap", "billable-expenses", "bills", "customers", "projects", "vendors"];

test("blocked V2 business pages redirect to Settings with the v2-business feature flag, at every URL alias", async () => {
  for (const page of V2_BUSINESS_PAGES) {
    for (const path of [`/${page}`, `/${page}.html`, `/html/${page}`, `/html/${page}.html`]) {
      const response = await request(app).get(path).expect(302);
      assert.equal(response.headers.location, "/settings?feature=v2-business", `${path} should redirect to the gated Settings page`);
    }
  }
});

test("blocked V2 business pages never serve their HTML directly", async () => {
  for (const page of V2_BUSINESS_PAGES) {
    const response = await request(app).get(`/${page}`);
    assert.notEqual(response.status, 200, `/${page} should not return the raw placeholder page while gated`);
  }
});

test("non-V2 canonical pages are unaffected by the V2 block", async () => {
  const response = await request(app).get("/pricing").expect(200);
  assert.notEqual(response.headers.location, "/settings?feature=v2-business");
});
