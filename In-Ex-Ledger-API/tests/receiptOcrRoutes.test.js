"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/receipts.routes.js");

function loadReceiptsRouter() {
  const originalLoad = Module._load.bind(Module);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-ocr-route-"));
  const storagePath = path.join(storageDir, "receipt.heic");
  fs.writeFileSync(storagePath, "fake-heic-data");

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user-test" };
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
    if (requestName === "../middleware/rateLimitTiers.js" || /rateLimitTiers\.js$/.test(requestName)) {
      return {
        createReceiptLimiter() {
          return (_req, _res, next) => next();
        }
      };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz-test",
        getBusinessScopeForUser: async () => ({ businessIds: ["biz-test"] })
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/SELECT filename, mime_type, storage_path/i.test(sql)) {
              return {
                rows: [{
                  filename: "receipt.heic",
                  mime_type: "image/heic",
                  storage_path: storagePath
                }],
                rowCount: 1
              };
            }
            throw new Error(`Unexpected query in receiptOcrRoutes.test.js: ${sql}`);
          }
        }
      };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError() {},
        logWarn() {},
        logInfo() {}
      };
    }
    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "pro" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        getReceiptStorageDir: () => storageDir,
        isManagedReceiptPath: () => true,
        requirePersistentReceiptStorage(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => null,
        assertDateUnlocked() {}
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];

  try {
    const router = require("../routes/receipts.routes.js");
    return {
      router,
      cleanup() {
        delete require.cache[ROUTE_PATH];
        Module._load = originalLoad;
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    Module._load = originalLoad;
    fs.rmSync(storageDir, { recursive: true, force: true });
    throw error;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/receipts", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || "error" });
  });
  return app;
}

test("receipt OCR rejects unsupported image formats before calling the OCR provider", async () => {
  const fixture = loadReceiptsRouter();

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/receipts/00000000-0000-4000-8000-000000000111/extract")
      .send({});

    assert.equal(response.status, 422);
    assert.equal(response.body.available, false);
    assert.match(String(response.body.reason || ""), /supports jpg, png, gif, and webp/i);
  } finally {
    fixture.cleanup();
  }
});
