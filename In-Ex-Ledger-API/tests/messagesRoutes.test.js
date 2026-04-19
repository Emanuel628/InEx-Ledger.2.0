"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const MESSAGES_ROUTE_PATH = require.resolve("../routes/messages.routes.js");

function loadMessagesRouter({ contactRows = [], archivedRows = [] } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql) {
            if (/FROM users u/i.test(sql)) {
              return { rows: contactRows, rowCount: contactRows.length };
            }

            if (/GET \/messages\/archived/i.test(sql)) {
              return { rows: archivedRows, rowCount: archivedRows.length };
            }

            if (/is_archived_by_receiver = TRUE/i.test(sql) && /is_archived_by_sender = TRUE/i.test(sql)) {
              return { rows: archivedRows, rowCount: archivedRows.length };
            }

            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (
      requestName === "../middleware/auth.middleware.js" ||
      /auth\.middleware\.js$/.test(requestName)
    ) {
      return {
        requireAuth: (req, _res, next) => {
          req.user = { id: "11111111-1111-4111-8111-111111111111" };
          next();
        }
      };
    }

    if (
      requestName === "../middleware/csrf.middleware.js" ||
      /csrf\.middleware\.js$/.test(requestName)
    ) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (
      requestName === "../middleware/rate-limit.middleware.js" ||
      /rate-limit\.middleware\.js$/.test(requestName)
    ) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[MESSAGES_ROUTE_PATH];

  try {
    const router = require("../routes/messages.routes.js");
    const app = express();
    app.use(express.json());
    app.use("/api/messages", router);

    return {
      app,
      cleanup() {
        delete require.cache[MESSAGES_ROUTE_PATH];
        Module._load = originalLoad;
      }
    };
  } catch (err) {
    Module._load = originalLoad;
    throw err;
  }
}

test("messages contacts do not inject a non-UUID support placeholder", async () => {
  const fixture = loadMessagesRouter({ contactRows: [] });

  try {
    const res = await request(fixture.app).get("/api/messages/contacts");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { contacts: [] });
  } finally {
    fixture.cleanup();
  }
});

test("messages archived route returns archived inbox and sent messages", async () => {
  const archivedRows = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      sender_id: "11111111-1111-4111-8111-111111111111",
      receiver_id: "44444444-4444-4444-8444-444444444444",
      sender_name: "Owner Example",
      sender_email: "owner@example.com",
      receiver_name: "Support Example",
      receiver_email: "support@example.com",
      message_type: "support_request",
      subject: "Archived thread",
      body: "Need help with export history",
      is_read: true,
      is_archived_by_sender: true,
      is_archived_by_receiver: false,
      parent_id: null,
      created_at: "2026-04-19T12:00:00.000Z",
      updated_at: "2026-04-19T12:00:00.000Z"
    }
  ];

  const fixture = loadMessagesRouter({ archivedRows });

  try {
    const res = await request(fixture.app).get("/api/messages/archived");
    assert.equal(res.status, 200);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].id, archivedRows[0].id);
    assert.equal(res.body.messages[0].is_archived, true);
  } finally {
    fixture.cleanup();
  }
});
