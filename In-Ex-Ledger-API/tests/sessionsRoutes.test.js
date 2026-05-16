"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/sessions.routes.js");

function loadSessionsRouter({ queryImpl } = {}) {
  const originalLoad = Module._load.bind(Module);
  const pool = {
    query: queryImpl || (async () => ({ rows: [], rowCount: 0 }))
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || requestName.endsWith("/db.js")) {
      return { pool };
    }
    if (requestName === "../middleware/auth.middleware.js" || requestName.endsWith("/auth.middleware.js")) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_123" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || requestName.endsWith("/csrf.middleware.js")) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../middleware/rate-limit.middleware.js" || requestName.endsWith("/rate-limit.middleware.js")) {
      return {
        createDataApiLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../utils/logger.js" || requestName.endsWith("/logger.js")) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../services/auditEventService.js" || requestName.endsWith("/auditEventService.js")) {
      return {
        AUDIT_ACTIONS: { SESSION_REVOKED: "session.revoked" },
        async recordAuditEventForRequest() {}
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/sessions.routes.js");

  const app = express();
  app.use(cookieParser());
  app.use("/api/sessions", router);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

test("sessions GET decorates current session details for the UI", async () => {
  const fixture = loadSessionsRouter({
    queryImpl: async (sql) => {
      if (String(sql).includes("FROM refresh_tokens")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              token_hash: require("node:crypto").createHash("sha256").update("refresh_cookie_value").digest("hex"),
              created_at: "2026-05-01T12:00:00.000Z",
              expires_at: "2026-05-08T12:00:00.000Z",
              last_used_at: "2026-05-02T08:30:00.000Z",
              ip_address: "203.0.113.10",
              user_agent: "Mozilla/5.0 (Macintosh) Chrome/124",
              device_label: null,
              mfa_authenticated: true
            }
          ]
        };
      }
      return { rowCount: 0, rows: [] };
    }
  });

  try {
    const response = await request(fixture.app)
      .get("/api/sessions")
      .set("Cookie", "refresh_token=refresh_cookie_value");

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.sessions[0].is_current, true);
    assert.equal(response.body.sessions[0].device_label, "Chrome on Mac");
    assert.equal(response.body.sessions[0].mfa_authenticated, true);
    assert.equal(response.body.sessions[0].last_active_at, "2026-05-02T08:30:00.000Z");
  } finally {
    fixture.cleanup();
  }
});

test("sessions DELETE current session clears the refresh cookie", async () => {
  let call = 0;
  const fixture = loadSessionsRouter({
    queryImpl: async () => {
      call += 1;
      if (call === 1) {
        return {
          rowCount: 1,
          rows: [{ id: "11111111-1111-4111-8111-111111111111" }]
        };
      }
      if (call === 2) {
        return {
          rowCount: 1,
          rows: [{ id: "11111111-1111-4111-8111-111111111111" }]
        };
      }
      return { rowCount: 0, rows: [] };
    }
  });

  try {
    const response = await request(fixture.app)
      .delete("/api/sessions/11111111-1111-4111-8111-111111111111")
      .set("Cookie", "refresh_token=refresh_cookie_value");

    assert.equal(response.status, 200);
    assert.equal(response.body.current_session_revoked, true);
    assert.ok(
      (response.headers["set-cookie"] || []).some((cookie) => cookie.startsWith("refresh_token=")),
      "current-session revoke should clear the refresh cookie"
    );
  } finally {
    fixture.cleanup();
  }
});

test("sessions DELETE all clears the refresh cookie when the caller has a current session", async () => {
  const fixture = loadSessionsRouter({
    queryImpl: async () => ({
      rowCount: 2,
      rows: [
        { id: "11111111-1111-4111-8111-111111111111" },
        { id: "22222222-2222-4222-8222-222222222222" }
      ]
    })
  });

  try {
    const response = await request(fixture.app)
      .delete("/api/sessions")
      .set("Cookie", "refresh_token=refresh_cookie_value");

    assert.equal(response.status, 200);
    assert.equal(response.body.current_session_revoked, true);
    assert.equal(response.body.revoked_count, 2);
    assert.ok(
      (response.headers["set-cookie"] || []).some((cookie) => cookie.startsWith("refresh_token=")),
      "revoke-all should clear the refresh cookie"
    );
  } finally {
    fixture.cleanup();
  }
});
