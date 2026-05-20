"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const RECEIPTS_ROUTE_PATH = require.resolve("../routes/receipts.routes.js");

function loadReceiptsRouter(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-upload-route-"));
  const state = {
    businessId: options.businessId || "00000000-0000-4000-8000-0000000000b1",
    transactionRow: options.transactionRow,
    insertParams: null,
    attachUpdateParams: null,
    lockCheckDate: null,
    queryCount: 0,
    receiptRow: options.receiptRow || null
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "00000000-0000-4000-8000-000000000171" };
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
        resolveBusinessIdForUser: async () => state.businessId,
        getBusinessScopeForUser: async () => ({ businessIds: [state.businessId] })
      };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      const periodRow = () => ({ id: "period-test", receipts_used: options.receiptsUsed || 0 });
      const outerQuery = async (sql, params) => {
        state.queryCount += 1;
        if (/business_usage_periods/i.test(sql)) {
          return { rowCount: 1, rows: [periodRow()] };
        }
        if (/SELECT id, filename, mime_type, storage_path, file_bytes\s+FROM receipts/i.test(sql)) {
          if (!state.receiptRow) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [state.receiptRow] };
        }
        if (/FROM transactions/i.test(sql)) {
          if (!state.transactionRow) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [state.transactionRow] };
        }
        return { rowCount: 0, rows: [] };
      };
      const clientQuery = async (sql, params) => {
        state.queryCount += 1;
        const text = String(sql || "");
        if (/business_usage_periods/i.test(text)) {
          return { rowCount: 1, rows: [periodRow()] };
        }
        if (/SELECT id, business_id\s+FROM receipts/i.test(text)) {
          if (options.receiptExists === false) {
            return { rowCount: 0, rows: [] };
          }
          return {
            rowCount: 1,
            rows: [{
              id: options.receiptId || "00000000-0000-4000-8000-000000000901",
              business_id: state.businessId
            }]
          };
        }
        if (/FROM transactions/i.test(text)) {
          if (!state.transactionRow) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [state.transactionRow] };
        }
        if (/INSERT INTO receipts/i.test(text)) {
          state.insertParams = params;
          return { rowCount: 1, rows: [] };
        }
        if (/COUNT\(\*\)[\s\S]*FROM receipts/i.test(text)) {
          return { rowCount: 1, rows: [{ count: options.attachedReceiptCount || 0 }] };
        }
        if (/SELECT t\.date\s+FROM receipts r/i.test(text)) {
          if (!options.currentLinkedDate) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [{ date: options.currentLinkedDate }] };
        }
        if (/UPDATE receipts\s+SET transaction_id/i.test(text)) {
          state.attachUpdateParams = params;
          return { rowCount: 1, rows: [{ id: params[1], transaction_id: params[0] }] };
        }
        return { rowCount: 0, rows: [] };
      };
      return {
        pool: {
          query: outerQuery,
          async connect() {
            return {
              query: clientQuery,
              release() {}
            };
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
        getSubscriptionSnapshotForBusiness: async () => ({ plan: "test" }),
        hasFeatureAccess: () => true
      };
    }
    if (requestName === "../services/receiptStorage.js" || /receiptStorage\.js$/.test(requestName)) {
      return {
        getReceiptStorageDir: () => storageDir,
        resolveReceiptFilePath: (filePath) => filePath,
        isManagedReceiptPath: () => true,
        getReceiptStorageStatus: () => ({ directory: storageDir, mode: "filesystem" }),
        requirePersistentReceiptStorage(_req, _res, next) {
          next();
        }
      };
    }
    if (requestName === "../services/accountingLockService.js" || /accountingLockService\.js$/.test(requestName)) {
      return {
        loadAccountingLockState: async () => ({
          lockedThroughDate: options.lockedThroughDate || null
        }),
        assertDateUnlocked(_lockState, transactionDate) {
          state.lockCheckDate = transactionDate;
          if (options.lockError) {
            throw options.lockError;
          }
        }
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[RECEIPTS_ROUTE_PATH];

  try {
    const router = require("../routes/receipts.routes.js");
    return {
      router,
      state,
      cleanup() {
        delete require.cache[RECEIPTS_ROUTE_PATH];
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    };
  } finally {
    Module._load = originalLoad;
  }
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/api/receipts", router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

function uploadReceipt(agent, transactionId) {
  return agent
    .post("/api/receipts")
    .field("transaction_id", transactionId)
    .attach("receipt", Buffer.from("fake-image"), {
      filename: "receipt.png",
      contentType: "image/png"
    });
}

test("receipt upload rejects malformed transaction_id values before any database write", async () => {
  const fixture = loadReceiptsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), "not-a-uuid");

    assert.equal(response.status, 400);
    assert.match(response.body.error, /valid uuid/i);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload rejects linked transactions that do not belong to the current business", async () => {
  const fixture = loadReceiptsRouter({
    transactionRow: null
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(
      request(app),
      "00000000-0000-4000-8000-000000000111"
    );

    assert.equal(response.status, 404);
    assert.match(response.body.error, /does not belong to this business/i);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload rejects transactions inside a locked accounting period", async () => {
  const fixture = loadReceiptsRouter({
    transactionRow: {
      id: "00000000-0000-4000-8000-000000000222",
      date: "2026-03-15"
    },
    lockError: {
      name: "AccountingPeriodLockedError",
      status: 409,
      code: "accounting_period_locked",
      lockedThroughDate: "2026-03-31",
      message: "This accounting period is locked."
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(
      request(app),
      "00000000-0000-4000-8000-000000000222"
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "accounting_period_locked");
    assert.equal(response.body.locked_through_date, "2026-03-31");
    assert.equal(fixture.state.insertParams, null);
    assert.equal(fixture.state.lockCheckDate, "2026-03-15");
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload inserts only after transaction ownership and lock checks pass", async () => {
  const transactionId = "00000000-0000-4000-8000-000000000333";
  const fixture = loadReceiptsRouter({
    transactionRow: {
      id: transactionId,
      date: "2026-04-15"
    }
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), transactionId);

    assert.equal(response.status, 201);
    assert.equal(response.body.transaction_id, transactionId);
    assert.ok(Array.isArray(fixture.state.insertParams));
    assert.equal(fixture.state.insertParams[1], fixture.state.businessId);
    assert.equal(fixture.state.insertParams[2], transactionId);
    assert.equal(fixture.state.lockCheckDate, "2026-04-15");
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload rejects mismatched MIME types even when the filename extension looks allowed", async () => {
  const fixture = loadReceiptsRouter();
  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .post("/api/receipts")
      .attach("receipt", Buffer.from("<html>evil</html>"), {
        filename: "receipt.jpg",
        contentType: "text/html"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /unsupported file type/i);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt download forces attachment and octet-stream for unsafe stored mime types", async () => {
  const fixture = loadReceiptsRouter({
    receiptRow: {
      id: "00000000-0000-4000-8000-000000000444",
      filename: "receipt.jpg",
      mime_type: "text/html",
      storage_path: null,
      file_bytes: Buffer.from("<html>evil</html>")
    }
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .get("/api/receipts/00000000-0000-4000-8000-000000000444");

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "application/octet-stream");
    assert.match(String(response.headers["content-disposition"] || ""), /^attachment;/i);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload is blocked once a transaction already has 10 receipt files", async () => {
  const transactionId = "00000000-0000-4000-8000-000000000444";
  const fixture = loadReceiptsRouter({
    transactionRow: { id: transactionId, date: "2026-05-01" },
    attachedReceiptCount: 10
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), transactionId);

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "transaction_receipt_limit_reached");
    assert.equal(response.body.limit, 10);
    assert.equal(fixture.state.insertParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt upload succeeds when a transaction is below the 10-file limit", async () => {
  const transactionId = "00000000-0000-4000-8000-000000000555";
  const fixture = loadReceiptsRouter({
    transactionRow: { id: transactionId, date: "2026-05-01" },
    attachedReceiptCount: 4
  });
  try {
    const app = buildApp(fixture.router);
    const response = await uploadReceipt(request(app), transactionId);

    assert.equal(response.status, 201);
    assert.ok(Array.isArray(fixture.state.insertParams));
  } finally {
    fixture.cleanup();
  }
});

test("receipt attach is blocked once a transaction already has 10 receipt files", async () => {
  const receiptId = "00000000-0000-4000-8000-000000000777";
  const transactionId = "00000000-0000-4000-8000-000000000778";
  const fixture = loadReceiptsRouter({
    receiptId,
    transactionRow: { id: transactionId, date: "2026-05-01" },
    attachedReceiptCount: 10
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .patch(`/api/receipts/${receiptId}/attach`)
      .send({ transaction_id: transactionId });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "transaction_receipt_limit_reached");
    assert.equal(fixture.state.attachUpdateParams, null);
  } finally {
    fixture.cleanup();
  }
});

test("receipt attach succeeds when a transaction is below the 10-file limit", async () => {
  const receiptId = "00000000-0000-4000-8000-000000000779";
  const transactionId = "00000000-0000-4000-8000-000000000780";
  const fixture = loadReceiptsRouter({
    receiptId,
    transactionRow: { id: transactionId, date: "2026-05-01" },
    attachedReceiptCount: 4
  });

  try {
    const app = buildApp(fixture.router);
    const response = await request(app)
      .patch(`/api/receipts/${receiptId}/attach`)
      .send({ transaction_id: transactionId });

    assert.equal(response.status, 200);
    assert.deepEqual(fixture.state.attachUpdateParams, [
      transactionId,
      receiptId,
      fixture.state.businessId
    ]);
  } finally {
    fixture.cleanup();
  }
});
