const assert = require("node:assert");
const test = require("node:test");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { app } = require("../server.js");

function assertNoStore(response) {
  assert.match(response.headers["cache-control"] || "", /no-store/i);
  assert.match(response.headers.pragma || "", /no-cache/i);
  assert.strictEqual(response.headers.expires, "0");
}

test("canonical HTML pages disable browser caching", async () => {
  const response = await request(app).get("/transactions").expect(200);
  assertNoStore(response);
});

test("JavaScript assets disable browser caching", async () => {
  const response = await request(app).get("/js/global.js").expect(200);
  assertNoStore(response);
});

test("CSS assets disable browser caching", async () => {
  const response = await request(app).get("/css/app.css").expect(200);
  assertNoStore(response);
});
