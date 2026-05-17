const assert = require("node:assert");
const test = require("node:test");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret";

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

test("private app pages send noindex headers", async () => {
  const response = await request(app).get("/transactions").expect(200);
  assert.strictEqual(response.headers["x-robots-tag"], "noindex, nofollow");
});

test("public legal pages remain indexable", async () => {
  const response = await request(app).get("/privacy").expect(200);
  assert.ok(!response.headers["x-robots-tag"]);
});

test("apex host redirects HTML traffic to canonical www host", async () => {
  const response = await request(app)
    .get("/pricing")
    .set("Host", "inexledger.com")
    .expect(301);

  assert.strictEqual(response.headers.location, "https://www.inexledger.com/pricing");
});

test("spoofed x-forwarded-host does not trigger canonical redirect when host is already canonical", async () => {
  const response = await request(app)
    .get("/pricing")
    .set("Host", "www.inexledger.com")
    .set("X-Forwarded-Host", "inexledger.com")
    .expect(200);

  assertNoStore(response);
});

test("originless unsafe API writes are rejected before the API stack", async () => {
  const response = await request(app)
    .post("/api/auth/refresh")
    .send({})
    .expect(403);

  assert.match(String(response.body.error || ""), /origin header required/i);
});

test("originless webhook-style API writes remain allowed through CORS", async () => {
  const response = await request(app)
    .post("/api/email/inbound")
    .send({})
    .expect(503);

  assert.match(String(response.body.error || ""), /service starting up|not configured/i);
});
