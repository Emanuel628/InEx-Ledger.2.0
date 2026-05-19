"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const RECEIPTS_ROUTE_PATH = require.resolve("../routes/receipts.routes.js");

const TEST_BUSINESS_ID = "00000000-0000-4000-8000-000000000201";
const TEST_RECEIPT_ID = "00000000-0000-4000-8000-000000000202";

function buildReceiptsApp({ poolQuery, logEvents }) {
  const originalLoad = Module._load.bind(Module);
  delete require.cache[RECEIPTS_ROUTE_PATH];

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          query: poolQuery,
          async connect() {
            return {
              query: poolQuery,
              release() {}
            };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000203", email: "owner@example.com" };
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
        async resolveBusinessIdForUser() {
          return TEST_BUSINESS_ID;
        },
        async getBusinessScopeForUser() {
          return { businessIds: [TEST_BUSINESS_ID], activeBusinessId: TEST_BUSINESS_ID };
        }
      };
    }

    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        getReceiptStorageDir() {
          return "/tmp/inex-ledger-test-receipts";
        },
        isManagedReceiptPath() {
          return true;
        },
        resolveReceiptFilePath() {
          return null;
        },
        getReceiptStorageStatus() {
          return { available: true, mode: "test", persistentConfirmed: true };
        }
      };
    }

    if (requestName === "../services/subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        async getSubscriptionSnapshotForBusiness() {
          return { effectiveTier: "v1", effectiveStatus: "active" };
        },
        hasFeatureAccess() {
          return true;
        }
      };
    }

    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        async loadAccountingLockState() {
          return { isLocked: false, lockedThroughDate: null };
        },
        assertDateUnlocked() {}
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(...args) {
          logEvents.push({ level: "error", args });
        },
        logWarn(...args) {
          logEvents.push({ level: "warn", args });
        },
        logInfo(...args) {
          logEvents.push({ level: "info", args });
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  try {
    const receiptsRouter = require(RECEIPTS_ROUTE_PATH);
    const app = express();
    app.use(express.json());
    app.use("/api/receipts", receiptsRouter);
    return { app, restore: () => { Module._load = originalLoad; delete require.cache[RECEIPTS_ROUTE_PATH]; } };
  } catch (err) {
    Module._load = originalLoad;
    delete require.cache[RECEIPTS_ROUTE_PATH];
    throw err;
  }
}

test("GET /api/receipts heals missing receipt metadata columns and retries the list query", async () => {
  let selectCalls = 0;
  const repairStatements = [];
  const logEvents = [];

  async function poolQuery(sql) {
    const text = String(sql || "");

    if (/information_schema\.columns/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }

    if (/ALTER\s+TABLE\s+receipts/i.test(text) || /ADD\s+COLUMN/i.test(text)) {
      repairStatements.push(text);
      return { rows: [], rowCount: 0 };
    }

    if (/SELECT\s+r\.id/i.test(text) && /FROM\s+receipts\s+r/i.test(text)) {
      selectCalls += 1;
      if (selectCalls === 1) {
        const err = new Error("column r.file_hash does not exist");
        err.code = "42703";
        err.column = "file_hash";
        throw err;
      }

      return {
        rowCount: 1,
        rows: [{
          id: TEST_RECEIPT_ID,
          business_id: TEST_BUSINESS_ID,
          business_name: "Test Business",
          transaction_id: null,
          filename: "receipt.pdf",
          mime_type: "application/pdf",
          storage_path: null,
          uploaded_at: "2026-05-19T12:00:00.000Z",
          created_at: "2026-05-19T12:00:00.000Z",
          file_hash: "abc123",
          has_file_bytes: false,
          file_bytes: Buffer.from("must-not-leak")
        }]
      };
    }

    throw new Error(`Unexpected SQL in receipt resilience test: ${text.slice(0, 160)}`);
  }

  const { app, restore } = buildReceiptsApp({ poolQuery, logEvents });
  try {
    const res = await request(app).get("/api/receipts");

    assert.equal(res.status, 200);
    assert.equal(selectCalls, 2, "receipt list query should retry once after healing schema drift");
    assert.ok(repairStatements.length > 0, "schema healing should run before retrying the receipt list query");
    assert.ok(
      repairStatements.some((statement) => /file_hash|storage_path|file_bytes|uploaded_at/i.test(statement)),
      "schema healing should target receipt metadata/storage columns"
    );
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, TEST_RECEIPT_ID);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body[0], "file_bytes"), false);
  } finally {
    restore();
  }
});

test("GET /api/receipts logs structured diagnostics for unrecoverable database errors", async () => {
  const logEvents = [];

  async function poolQuery(sql) {
    const text = String(sql || "");
    if (/SELECT\s+r\.id/i.test(text) && /FROM\s+receipts\s+r/i.test(text)) {
      const err = new Error("database offline during receipt list");
      err.code = "XXTEST";
      err.detail = "simulated receipt failure";
      throw err;
    }
    return { rows: [], rowCount: 0 };
  }

  const { app, restore } = buildReceiptsApp({ poolQuery, logEvents });
  try {
    const res = await request(app).get("/api/receipts");

    assert.equal(res.status, 500);
    const errorLog = logEvents.find((event) => event.level === "error");
    assert.ok(errorLog, "receipt load failure should be logged");
    const diagnostic = errorLog.args.find(
      (arg) => arg && typeof arg === "object" && !(arg instanceof Error) && arg.code === "XXTEST"
    );
    assert.ok(diagnostic, "receipt load failure should log a plain diagnostic object with the database code");
    assert.match(String(diagnostic.message || ""), /database offline/i);
    assert.equal(diagnostic.detail, "simulated receipt failure");
  } finally {
    restore();
  }
});
