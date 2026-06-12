"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const cookieParser = require("cookie-parser");
const request = require("supertest");

const { COOKIE_OPTIONS } = require("../utils/authUtils.js");

const SUPPORT_ROUTE_PATH = require.resolve("../routes/supportArtifacts.routes.js");
const SESSIONS_ROUTE_PATH = require.resolve("../routes/sessions.routes.js");

function loadScript(relativePath, contextExtras = {}) {
  const scriptPath = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = vm.createContext({
    window: { location: { href: "/" } },
    console,
    setTimeout,
    clearTimeout,
    URL: {
      createObjectURL() { return "blob:test"; },
      revokeObjectURL() {}
    },
    document: {
      cookie: "",
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() {
        return {
          click() {},
          remove() {}
        };
      },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    localStorage: {
      _store: new Map(),
      getItem(key) {
        return this._store.has(key) ? this._store.get(key) : null;
      },
      setItem(key, value) {
        this._store.set(key, String(value));
      },
      removeItem(key) {
        this._store.delete(key);
      }
    },
    sessionStorage: {
      _store: new Map(),
      getItem(key) {
        return this._store.has(key) ? this._store.get(key) : null;
      },
      setItem(key, value) {
        this._store.set(key, String(value));
      },
      removeItem(key) {
        this._store.delete(key);
      }
    },
    FormData: class FormData {},
    ...contextExtras
  });
  vm.runInContext(source, context, { filename: scriptPath });
  return context;
}

function loadSupportArtifactsRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "support-artifacts-asvs-"));
  fs.writeFileSync(path.join(tempDir, "support.html"), "<html>evil</html>");

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT id, filename, mime_type, storage_path/i.test(sql)) {
              return {
                rows: [{
                  id: "artifact_file",
                  filename: "support.html",
                  mime_type: "text/html",
                  storage_path: path.join(tempDir, "support.html")
                }],
                rowCount: 1
              };
            }
            throw new Error(`Unhandled SQL: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_1" };
          next();
        }
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return {
        createRouteLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_1"
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logInfo() {},
        logWarn() {}
      };
    }

    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return {
        invalidateSnapshotsForBusiness() {
          return Promise.resolve();
        }
      };
    }

    if (requestName === "../services/supportArtifactStorage.js" || /supportArtifactStorage\.js$/.test(requestName)) {
      return {
        ensureSupportArtifactStorageDir() {
          return tempDir;
        },
        resolveSupportArtifactFilePath(filePath) {
          return fs.existsSync(filePath) ? filePath : null;
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[SUPPORT_ROUTE_PATH];
  const router = require(SUPPORT_ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/support-artifacts", router);
  return {
    app,
    cleanup() {
      delete require.cache[SUPPORT_ROUTE_PATH];
    }
  };
}

function loadSessionsRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    auditCalls: []
  };
  let call = 0;

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || requestName.endsWith("/db.js")) {
      return {
        pool: {
          async query() {
            call += 1;
            if (call === 1) {
              return { rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
            }
            if (call === 2) {
              return { rowCount: 1, rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
            }
            return { rowCount: 0, rows: [] };
          }
        }
      };
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
        async recordAuditEventForRequest(_pool, _req, payload) {
          state.auditCalls.push(payload);
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[SESSIONS_ROUTE_PATH];
  const router = require(SESSIONS_ROUTE_PATH);

  const app = express();
  app.use(cookieParser());
  app.use("/api/sessions", router);

  return {
    app,
    state,
    cleanup() {
      delete require.cache[SESSIONS_ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

// ASVS 5.0.0 - Session Management
test("ASVS session controls keep browser auth cookie-only and suppress bearer header reuse", async () => {
  const context = loadScript("public/js/auth.js", {
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      },
      clone() {
        return this;
      }
    })
  });

  assert.equal(COOKIE_OPTIONS.httpOnly, true);
  assert.equal(COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(COOKIE_OPTIONS.path, "/");

  context.localStorage.setItem("token", "attacker_local_token");
  context.sessionStorage.setItem("token", "attacker_session_token");
  context.setToken("attacker_runtime_token");

  assert.equal(context.getToken(), "");
  assert.equal(Object.keys(context.authHeader()).length, 0);
});

// ASVS 5.0.0 - File Handling
test("ASVS file handling controls force safe download headers for unsafe support artifact MIME types", async () => {
  const fixture = loadSupportArtifactsRouterFixture();
  try {
    const response = await request(fixture.app)
      .get("/api/support-artifacts/11111111-1111-4111-8111-111111111111");

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/octet-stream");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.match(String(response.headers["content-disposition"] || ""), /^attachment;/i);
    assert.match(String(response.headers["cache-control"] || ""), /no-store/i);
  } finally {
    fixture.cleanup();
  }
});

// ASVS 5.0.0 - Audit Logging
test("ASVS audit controls record session revocation metadata for sensitive session management actions", async () => {
  const fixture = loadSessionsRouterFixture();
  try {
    const response = await request(fixture.app)
      .delete("/api/sessions/11111111-1111-4111-8111-111111111111")
      .set("Cookie", "refresh_token=refresh_cookie_value");

    assert.equal(response.status, 200);
    assert.equal(fixture.state.auditCalls.length, 1);
    assert.equal(fixture.state.auditCalls[0].action, "session.revoked");
    assert.equal(fixture.state.auditCalls[0].metadata.session_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(fixture.state.auditCalls[0].metadata.scope, "single");
    assert.equal(fixture.state.auditCalls[0].metadata.current_session, true);
  } finally {
    fixture.cleanup();
  }
});
