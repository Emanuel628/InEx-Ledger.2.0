"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/supportArtifacts.routes.js");

function loadSupportArtifactsRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "support-artifacts-test-"));
  const state = {
    queries: [],
    logErrors: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queries.push({ sql, params });
            if (/FROM transactions/i.test(sql)) {
              return { rows: [{ id: "tx_1" }], rowCount: 1 };
            }
            if (/SELECT id, transaction_id, artifact_type/i.test(sql)) {
              return {
                rows: [{
                  id: "artifact_1",
                  transaction_id: "tx_1",
                  artifact_type: "review_note",
                  filename: "Review note",
                  mime_type: null,
                  review_status: "accepted",
                  notes: "Business purpose",
                  uploaded_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            if (/INSERT INTO support_artifacts/i.test(sql)) {
              return {
                rows: [{
                  id: "artifact_created",
                  transaction_id: params[2],
                  artifact_type: /review_note/.test(sql) ? "review_note" : params[3],
                  filename: params[3] === "receipt" ? params[4] : "Review note",
                  mime_type: /mime_type/.test(sql) ? params[5] : null,
                  review_status: "accepted",
                  notes: params[4] === "Review note" ? params[4] : (params[8] || params[4] || null),
                  uploaded_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            if (/SELECT id, filename, mime_type, storage_path/i.test(sql)) {
              return {
                rows: [{
                  id: "artifact_file",
                  filename: "support.txt",
                  mime_type: "text/plain",
                  storage_path: path.join(tempDir, "support.txt")
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

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_1"
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(...args) {
          state.logErrors.push(args);
        },
        logInfo() {},
        logWarn() {}
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

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/support-artifacts", router);
  attachCentralErrorHandler(app);

  return { app, state, tempDir };
}

test("GET /api/support-artifacts lists transaction support artifacts", async () => {
  const { app } = loadSupportArtifactsRouterFixture();

  const response = await request(app).get("/api/support-artifacts?transaction_id=3fa85f64-5717-4562-b3fc-2c963f66afa6");

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].artifact_type, "review_note");
});

test("POST /api/support-artifacts/review-note saves a transaction note", async () => {
  const { app } = loadSupportArtifactsRouterFixture();

  const response = await request(app)
    .post("/api/support-artifacts/review-note")
    .send({
      transaction_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      notes: "Business purpose documented"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.artifact_type, "review_note");
});

test("GET /api/support-artifacts requires a valid transaction_id", async () => {
  const { app } = loadSupportArtifactsRouterFixture();
  const response = await request(app).get("/api/support-artifacts?transaction_id=not-a-uuid");
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "transaction_id is required.");
});

test("POST /api/support-artifacts/review-note returns 404 when the transaction isn't owned by the business", async () => {
  const originalLoad = Module._load.bind(Module);
  Module._load = function (requestName, parent, isMain) {
    if (/db\.js$/.test(requestName)) {
      return { pool: { async query() { return { rows: [], rowCount: 0 }; } } };
    }
    if (/auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user_1" }; next(); } };
    }
    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_1" };
    }
    if (/logger\.js$/.test(requestName)) {
      return { logError() {}, logInfo() {}, logWarn() {} };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/support-artifacts", router);
  attachCentralErrorHandler(app);

  const response = await request(app)
    .post("/api/support-artifacts/review-note")
    .send({ transaction_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", notes: "Some notes" });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Transaction not found.");
  delete require.cache[ROUTE_PATH];
});

test("POST /api/support-artifacts/review-note returns a generic 500 for an unexpected DB failure", async () => {
  const originalLoad = Module._load.bind(Module);
  Module._load = function (requestName, parent, isMain) {
    if (/db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/FROM transactions/i.test(sql)) return { rows: [{ id: "tx_1" }], rowCount: 1 };
            throw new Error("connection reset");
          }
        }
      };
    }
    if (/auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth(req, _res, next) { req.user = { id: "user_1" }; next(); } };
    }
    if (/csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection(_req, _res, next) { next(); } };
    }
    if (/resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_1" };
    }
    if (/logger\.js$/.test(requestName)) {
      return { logError() {}, logInfo() {}, logWarn() {} };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/support-artifacts", router);
  attachCentralErrorHandler(app);

  const response = await request(app)
    .post("/api/support-artifacts/review-note")
    .send({ transaction_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", notes: "Some notes" });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Internal server error" });
  delete require.cache[ROUTE_PATH];
});

test("GET /api/support-artifacts/:id returns 404 when the stored file is missing from disk", async () => {
  const { app } = loadSupportArtifactsRouterFixture();
  // Fixture's DB mock always returns a row pointing at tempDir/support.txt,
  // but nothing has written that file in this test, so resolution 404s.
  const response = await request(app).get("/api/support-artifacts/3fa85f64-5717-4562-b3fc-2c963f66afa6");
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Support file missing.");
});

test("POST /api/support-artifacts/upload stores a support file", async () => {
  const { app, tempDir } = loadSupportArtifactsRouterFixture();
  const uploadPath = path.join(tempDir, "upload.txt");
  fs.writeFileSync(uploadPath, "support");

  const response = await request(app)
    .post("/api/support-artifacts/upload")
    .field("transaction_id", "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    .field("artifact_type", "receipt")
    .field("notes", "Fuel receipt")
    .attach("artifact", uploadPath);

  assert.equal(response.status, 201);
  assert.equal(response.body.artifact_type, "receipt");
});
