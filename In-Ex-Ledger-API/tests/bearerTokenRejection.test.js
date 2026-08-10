"use strict";

// The product's auth contract is cookie-only (Docs/AUTHENTICATION.md), and
// commit 6a075ad1 removed Authorization: Bearer acceptance from
// middleware/auth.middleware.js's getRequestToken (routes/consent.routes.js
// has its own separate resolver, read directly rather than HTTP-tested here
// since it's a short, single-purpose function that only ever reads
// req.cookies). This guards requireAuth's behavior directly: a validly-signed
// token sent only as a Bearer header, with no access_token cookie, must be
// treated exactly like an anonymous request -- not "invalid token" (which
// would imply the server tried to read it), but genuinely absent.

const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { requireAuth, signToken } = require("../middleware/auth.middleware.js");

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/protected", requireAuth, (req, res) => res.json({ id: req.user.id }));
  return app;
}

const validToken = signToken({ id: "00000000-0000-4000-8000-000000000abc", email: "bearer-test@example.com" });

test("requireAuth accepts a valid access_token cookie", async () => {
  const response = await request(buildApp())
    .get("/protected")
    .set("Cookie", `access_token=${validToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.id, "00000000-0000-4000-8000-000000000abc");
});

test("requireAuth rejects a validly-signed token sent only as an Authorization: Bearer header, identically to no auth at all", async () => {
  const app = buildApp();
  const anonymous = await request(app).get("/protected");
  const bearerOnly = await request(app)
    .get("/protected")
    .set("Authorization", `Bearer ${validToken}`);

  assert.equal(bearerOnly.status, 401);
  assert.equal(bearerOnly.status, anonymous.status);
  assert.deepEqual(bearerOnly.body, anonymous.body);
});

test("a Bearer header cannot rescue a request with an invalid cookie", async () => {
  const response = await request(buildApp())
    .get("/protected")
    .set("Authorization", `Bearer ${validToken}`)
    .set("Cookie", "access_token=not-a-real-token");

  assert.equal(response.status, 401);
});
