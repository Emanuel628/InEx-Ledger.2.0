const assert = require("node:assert");
const test = require("node:test");
const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");

const {
  createLimiter,
  getRateLimiterHealth,
  initializeRateLimiterProtection,
  resetRateLimiterHealthForTests,
  setRedisClientOverride
} = require("../middleware/rateLimiter.js");

const { MemoryStore } = rateLimit;
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
  REDIS_URL: process.env.REDIS_URL
};

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test.afterEach(() => {
  restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
  restoreEnv("RATE_LIMIT_ENABLED", originalEnv.RATE_LIMIT_ENABLED);
  restoreEnv("REDIS_URL", originalEnv.REDIS_URL);
  setRedisClientOverride(null);
  resetRateLimiterHealthForTests();
});

function createApp(limiter, userId = null) {
  const app = express();
  if (userId) {
    app.use((req, _res, next) => {
      req.user = { id: userId };
      next();
    });
  }
  app.use(limiter);
  app.get("/", (_req, res) => res.json({ ok: true }));
  return app;
}

async function sendRequests(app, count) {
  for (let index = 0; index < count; index += 1) {
    await request(app).get("/").expect(200);
  }
}

test("auth-style limiter blocks after 20 requests per IP", async () => {
  process.env.RATE_LIMIT_ENABLED = "true";
  const limiter = await createLimiter({
    windowMs: 900_000,
    max: 20,
    keyPrefix: "test-auth",
    keyStrategy: "ip",
    storeOverride: new MemoryStore()
  });
  const app = createApp(limiter);

  await sendRequests(app, 20);
  const blocked = await request(app).get("/").expect(429);
  const retryAfter = Number(blocked.headers["retry-after"]);
  assert(
    Number.isFinite(retryAfter) && retryAfter > 0,
    "Retry-After must be a positive integer"
  );
});

test("user-scoped limiter enforces authenticated windows", async () => {
  process.env.RATE_LIMIT_ENABLED = "true";
  const limiter = await createLimiter({
    windowMs: 60_000,
    max: 20,
    keyPrefix: "test-export",
    storeOverride: new MemoryStore()
  });
  const app = createApp(limiter, "export-user");

  await sendRequests(app, 20);
  await request(app).get("/").expect(429);
});

test("production limiter uses in-memory store when Redis is unavailable", async () => {
  process.env.NODE_ENV = "production";
  process.env.RATE_LIMIT_ENABLED = "true";
  delete process.env.REDIS_URL;
  const limiter = await createLimiter({
    windowMs: 1_000,
    max: 1,
    keyPrefix: "test-global"
  });
  const app = createApp(limiter);

  const first = await request(app).get("/").expect(200);
  assert.ok(first.body.ok);
  await request(app).get("/").expect(429);
  const health = getRateLimiterHealth();
  assert.strictEqual(health.mode, "enforced");
  assert.strictEqual(health.available, true);
});

test("production rate limiter health stays enforced during startup when Redis is not configured", async () => {
  process.env.NODE_ENV = "production";
  process.env.RATE_LIMIT_ENABLED = "true";
  delete process.env.REDIS_URL;

  const health = await initializeRateLimiterProtection();
  assert.strictEqual(health.mode, "enforced");
  assert.strictEqual(health.available, true);
  assert.strictEqual(health.redisConfigured, false);
  assert.strictEqual(health.redisConnected, false);
});

test("Retry-After header appears on 429 responses", async () => {
  process.env.RATE_LIMIT_ENABLED = "true";
  const limiter = await createLimiter({
    windowMs: 60_000,
    max: 1,
    keyPrefix: "test-retry",
    storeOverride: new MemoryStore()
  });
  const app = createApp(limiter);

  await request(app).get("/").expect(200);
  const response = await request(app).get("/").expect(429);
  const retryAfter = Number(response.headers["retry-after"]);
  assert(Number.isInteger(retryAfter) && retryAfter > 0);
});

test("disabling rate limiting bypasses all blocks", async () => {
  process.env.RATE_LIMIT_ENABLED = "false";
  const limiter = await createLimiter({
    windowMs: 60_000,
    max: 1,
    keyPrefix: "test-disabled",
    storeOverride: new MemoryStore()
  });
  const app = createApp(limiter);

  for (let index = 0; index < 5; index += 1) {
    const response = await request(app).get("/").expect(200);
    assert.strictEqual(response.headers["x-ratelimit-limit"], "unlimited");
  }
});

test("disabling rate limiting in production returns 503", async () => {
  process.env.NODE_ENV = "production";
  process.env.RATE_LIMIT_ENABLED = "false";
  const limiter = await createLimiter({
    windowMs: 60_000,
    max: 1,
    keyPrefix: "test-disabled-production"
  });
  const app = createApp(limiter);

  await request(app).get("/").expect(503);
  const health = getRateLimiterHealth();
  assert.strictEqual(health.mode, "degraded");
  assert.strictEqual(health.available, false);
});
