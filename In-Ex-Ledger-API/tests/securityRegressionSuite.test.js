"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const request = require("supertest");

const SUPPORT_ROUTE_PATH = require.resolve("../routes/supportArtifacts.routes.js");
const {
  normalizeSupportArtifactCandidate
} = require("../services/supportArtifactStorage.js");
const {
  normalizeReceiptStorageCandidate
} = require("../services/receiptStorage.js");

const originalEnv = {
  SUPPORT_ARTIFACT_STORAGE_DIR: process.env.SUPPORT_ARTIFACT_STORAGE_DIR,
  RECEIPT_STORAGE_DIR: process.env.RECEIPT_STORAGE_DIR
};

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test.afterEach(() => {
  restoreEnv("SUPPORT_ARTIFACT_STORAGE_DIR", originalEnv.SUPPORT_ARTIFACT_STORAGE_DIR);
  restoreEnv("RECEIPT_STORAGE_DIR", originalEnv.RECEIPT_STORAGE_DIR);
});

function loadScript(relativePath, contextExtras = {}) {
  const scriptPath = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = vm.createContext({
    window: {
      location: { href: "/" }
    },
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "support-artifacts-security-"));

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/FROM transactions/i.test(sql)) {
              return { rows: [{ id: "tx_1" }], rowCount: 1 };
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
          fs.mkdirSync(tempDir, { recursive: true });
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
  app.use((err, _req, res, _next) => {
    res.status(Number(err?.status || 500)).json({ error: err?.message || "error" });
  });
  return { app };
}

test("security regression: support artifact upload rejects MIME/extension mismatch before any file is stored", async () => {
  const { app } = loadSupportArtifactsRouterFixture();

  const response = await request(app)
    .post("/api/support-artifacts/upload")
    .field("transaction_id", "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    .field("artifact_type", "receipt")
    .field("notes", "bad upload")
    .attach("artifact", Buffer.from("<html>evil</html>"), {
      filename: "receipt.pdf",
      contentType: "text/html"
    });

  assert.equal(response.status, 400);
  assert.match(String(response.body?.error || ""), /unsupported support file type/i);
});

test("security regression: support-artifact and receipt storage resolvers confine traversal candidates to their managed roots", () => {
  const supportDir = fs.mkdtempSync(path.join(os.tmpdir(), "support-storage-"));
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-storage-"));
  process.env.SUPPORT_ARTIFACT_STORAGE_DIR = supportDir;
  process.env.RECEIPT_STORAGE_DIR = receiptDir;

  const supportCandidate = normalizeSupportArtifactCandidate("..\\..\\Windows\\system32\\drivers\\etc\\hosts");
  const receiptCandidate = normalizeReceiptStorageCandidate("..\\..\\Windows\\system32\\drivers\\etc\\hosts");

  assert.equal(supportCandidate, path.join(supportDir, "hosts"));
  assert.equal(receiptCandidate, path.join(receiptDir, "hosts"));
});

test("security regression: browser auth ignores attacker-planted bearer tokens and omits Authorization headers", async () => {
  const fetchCalls = [];
  const context = loadScript("public/js/auth.js", {
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        },
        clone() {
          return this;
        }
      };
    }
  });

  context.localStorage.setItem("token", "attacker_local_token");
  context.sessionStorage.setItem("token", "attacker_session_token");
  context.setToken("attacker_runtime_token");

  assert.equal(context.getToken(), "");
  assert.equal(Object.keys(context.authHeader()).length, 0);

  await context.apiFetch("/api/security-check", {
    method: "POST",
    body: JSON.stringify({ ok: true })
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options?.headers?.Authorization, undefined);
  assert.equal(fetchCalls[0].options?.credentials, "include");
});
