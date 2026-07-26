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

test("CSS assets disable browser caching without a version query", async () => {
  const response = await request(app).get("/css/app.css").expect(200);
  assertNoStore(response);
});

test("versioned JavaScript assets use long immutable caching", async () => {
  const response = await request(app).get("/js/global.js?v=20260725a").expect(200);

  assert.strictEqual(response.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.ok(!response.headers.pragma);
  assert.ok(!response.headers.expires);
});

test("versioned CSS assets use long immutable caching", async () => {
  const response = await request(app).get("/css/app.css?v=20260725a").expect(200);

  assert.strictEqual(response.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.ok(!response.headers.pragma);
  assert.ok(!response.headers.expires);
});

test("private app pages send noindex headers", async () => {
  const response = await request(app).get("/transactions").expect(200);
  assert.strictEqual(response.headers["x-robots-tag"], "noindex, nofollow");
});

test("core app routes serve the v3 frontend shell", async () => {
  for (const route of ["/transactions", "/billing"]) {
    const response = await request(app).get(route).expect(200);

    assert.match(response.text, /\/app-v3\/assets\//);
    assert.strictEqual(response.headers["x-robots-tag"], "noindex, nofollow");
    assertNoStore(response);
  }
});

test("legacy app-v3 page routes redirect to canonical bare app routes", async () => {
  const response = await request(app)
    .get("/app-v3/transactions?type=income")
    .expect(301);

  assert.strictEqual(response.headers.location, "/transactions?type=income");
});

test("legacy app-v3 root redirects to canonical landing route", async () => {
  const response = await request(app).get("/app-v3").expect(301);

  assert.strictEqual(response.headers.location, "/");

  const trailingSlashResponse = await request(app).get("/app-v3/").expect(301);

  assert.strictEqual(trailingSlashResponse.headers.location, "/");
});

test("v3 frontend static assets are served from the side-by-side build", async () => {
  const index = await request(app).get("/transactions").expect(200);
  const assetPath = index.text.match(/\/app-v3\/assets\/[^"]+\.js/)?.[0];
  assert.ok(assetPath, "expected v3 JavaScript asset path in index");

  const response = await request(app)
    .get(assetPath)
    .expect(200);

  assert.match(response.headers["content-type"] || "", /javascript/i);
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
