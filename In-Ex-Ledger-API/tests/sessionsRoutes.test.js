const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  const hadOriginal = Object.prototype.hasOwnProperty.call(require.cache, resolved);
  const original = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };

  return () => {
    if (hadOriginal) {
      require.cache[resolved] = original;
    } else {
      delete require.cache[resolved];
    }
  };
}

function createSessionsApp(pool) {
  const routeResolved = require.resolve("../routes/sessions.routes.js");
  delete require.cache[routeResolved];

  const restores = [
    mockModule("../db.js", { pool }),
    mockModule("../middleware/auth.middleware.js", {
      requireAuth(req, _res, next) {
        req.user = { id: "user_123" };
        next();
      }
    }),
    mockModule("../middleware/csrf.middleware.js", {
      requireCsrfProtection(_req, _res, next) {
        next();
      }
    }),
    mockModule("../middleware/rate-limit.middleware.js", {
      createDataApiLimiter() {
        return (_req, _res, next) => next();
      }
    })
  ];

  const router = require("../routes/sessions.routes.js");
  const app = express();
  app.use(express.json());
  app.use(router);

  return {
    app,
    restore() {
      delete require.cache[routeResolved];
      while (restores.length) {
        restores.pop()();
      }
    }
  };
}

test("sessions route lists active sessions for the current user", async () => {
  const fakePool = {
    async query(sql, params) {
      assert.match(sql, /FROM refresh_tokens/i);
      assert.deepEqual(params, ["user_123"]);
      return {
        rows: [
          { id: "session_1", created_at: "2026-04-01T00:00:00Z", expires_at: "2026-04-08T00:00:00Z" }
        ]
      };
    }
  };

  const harness = createSessionsApp(fakePool);
  try {
    const response = await request(harness.app)
      .get("/")
      .expect(200);

    assert.deepEqual(response.body, [
      { id: "session_1", created_at: "2026-04-01T00:00:00Z", expires_at: "2026-04-08T00:00:00Z" }
    ]);
  } finally {
    harness.restore();
  }
});

test("sessions route revokes a single session by id", async () => {
  const fakePool = {
    async query(sql, params) {
      assert.match(sql, /UPDATE refresh_tokens SET revoked = true WHERE id = \$1 AND user_id = \$2/i);
      assert.deepEqual(params, ["session_1", "user_123"]);
      return { rowCount: 1, rows: [{ id: "session_1" }] };
    }
  };

  const harness = createSessionsApp(fakePool);
  try {
    const response = await request(harness.app)
      .delete("/session_1")
      .expect(200);

    assert.deepEqual(response.body, { message: "Session revoked." });
  } finally {
    harness.restore();
  }
});

test("sessions route revokes all sessions for the current user", async () => {
  let called = false;
  const fakePool = {
    async query(sql, params) {
      called = true;
      assert.match(sql, /UPDATE refresh_tokens SET revoked = true WHERE user_id = \$1 AND revoked = false/i);
      assert.deepEqual(params, ["user_123"]);
      return { rowCount: 3, rows: [] };
    }
  };

  const harness = createSessionsApp(fakePool);
  try {
    const response = await request(harness.app)
      .delete("/")
      .expect(200);

    assert.equal(called, true);
    assert.deepEqual(response.body, { message: "All sessions revoked." });
  } finally {
    harness.restore();
  }
});
