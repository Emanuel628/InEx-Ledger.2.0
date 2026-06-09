"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const MESSAGES_ROUTE_PATH = require.resolve("../routes/messages.routes.js");

function loadMessagesRouter({ contactRows = [], archivedRows = [], receiverRows = null } = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = { auditCalls: [], sentEmails: [], insertedMessages: [] };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/FROM users u/i.test(sql)) {
              return { rows: contactRows, rowCount: contactRows.length };
            }

            if (/FROM messages\s+WHERE receiver_id = \$1\s+AND is_read = FALSE\s+AND is_deleted_by_receiver = FALSE/i.test(sql.replace(/\s+/g, " "))) {
              return {
                rows: [{
                  total_count: 4,
                  support_count: 1,
                  notification_count: 2,
                  message_count: 1
                }],
                rowCount: 1
              };
            }

            if (/SELECT id, role FROM users WHERE id = \$1 LIMIT 1/i.test(sql)) {
              const rows = receiverRows || [{ id: params[0], role: "it_support" }];
              return { rows, rowCount: rows.length };
            }

            if (/INSERT INTO messages/i.test(sql)) {
              state.insertedMessages.push({ sql, params });
              return {
                rows: [{
                  id: "55555555-5555-4555-8555-555555555555"
                }],
                rowCount: 1
              };
            }

            if (/WHERE m.id = \$1$/i.test(sql.trim())) {
              return {
                rows: [{
                  id: "55555555-5555-4555-8555-555555555555",
                  sender_id: "11111111-1111-4111-8111-111111111111",
                  receiver_id: params[0] ? "22222222-2222-4222-8222-222222222222" : null,
                  sender_name: "Owner Example",
                  sender_email: "owner@example.com",
                  receiver_name: "Support Example",
                  receiver_email: "support@example.com",
                  message_type: "support_request",
                  subject: "Need help",
                  body: "Please help with export cleanup",
                  invoice_number: null
                }],
                rowCount: 1
              };
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
          req.user = {
            id: "11111111-1111-4111-8111-111111111111",
            email: "owner@example.com"
          };
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

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return {
        AUDIT_ACTIONS: {
          SUPPORT_REQUEST_CREATED: "support.request.created"
        },
        async recordAuditEventForRequest(_pool, _req, payload) {
          state.auditCalls.push(payload);
          return "audit-1";
        }
      };
    }

    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {
            this.emails = {
              send: async (payload) => {
                state.sentEmails.push(payload);
                return { data: { id: "resend-msg-1" } };
              }
            };
          }
        }
      };
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
      state,
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

test("messages POST records an audit event for support requests", async () => {
  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app)
      .post("/api/messages")
      .send({
        receiver_id: "22222222-2222-4222-8222-222222222222",
        message_type: "support_request",
        subject: "Need help",
        body: "Please help with export cleanup"
      });

    assert.equal(res.status, 201);
    assert.equal(fixture.state.auditCalls.length, 1);
    assert.equal(fixture.state.auditCalls[0].action, "support.request.created");
    assert.equal(fixture.state.auditCalls[0].metadata.messageType, "support_request");
  } finally {
    fixture.cleanup();
  }
});

test("messages support-email stores an outbound support thread and reply-to routing", async () => {
  const beforeApiKey = process.env.RESEND_API_KEY;
  const beforeReplyBase = process.env.SUPPORT_REPLY_BASE_EMAIL;
  const beforeReplySecret = process.env.SUPPORT_REPLY_HMAC_SECRET;
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.SUPPORT_REPLY_BASE_EMAIL = "support@inex.app";
  process.env.SUPPORT_REPLY_HMAC_SECRET = "support-reply-secret-32-bytes-aaaa";

  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/support-email")
      .send({
        subject: "Need help",
        body: "Please help with export cleanup"
      });

    assert.equal(res.status, 201);
    assert.equal(fixture.state.sentEmails.length, 1);
    assert.match(String(fixture.state.sentEmails[0].reply_to || ""), /support\+s\.[0-9a-f]{32}\.[A-Za-z0-9_-]{16}@/i);
    assert.equal(fixture.state.insertedMessages.length, 1);
    assert.equal(fixture.state.auditCalls.length, 1);
    assert.equal(fixture.state.auditCalls[0].metadata.delivery, "email");
  } finally {
    fixture.cleanup();
    if (beforeApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeApiKey;
    if (beforeReplyBase === undefined) delete process.env.SUPPORT_REPLY_BASE_EMAIL;
    else process.env.SUPPORT_REPLY_BASE_EMAIL = beforeReplyBase;
    if (beforeReplySecret === undefined) delete process.env.SUPPORT_REPLY_HMAC_SECRET;
    else process.env.SUPPORT_REPLY_HMAC_SECRET = beforeReplySecret;
  }
});

test("messages send-email delivers to typed external recipients and stores the outbound thread", async () => {
  const beforeApiKey = process.env.RESEND_API_KEY;
  const beforeReplyBase = process.env.SUPPORT_REPLY_BASE_EMAIL;
  const beforeReplySecret = process.env.SUPPORT_REPLY_HMAC_SECRET;
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.SUPPORT_REPLY_BASE_EMAIL = "support@inex.app";
  process.env.SUPPORT_REPLY_HMAC_SECRET = "support-reply-secret-32-bytes-aaaa";

  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/send-email")
      .send({
        to_email: "client@example.com; second@example.com",
        message_type: "general",
        subject: "Brief Subject",
        body: "Thanks for reaching out."
      });

    assert.equal(res.status, 201);
    assert.equal(fixture.state.sentEmails.length, 1);
    assert.deepEqual(fixture.state.sentEmails[0].to, ["client@example.com", "second@example.com"]);
    assert.match(String(fixture.state.sentEmails[0].reply_to || ""), /support\+s\.[0-9a-f]{32}\.[A-Za-z0-9_-]{16}@/i);
    assert.equal(fixture.state.insertedMessages.length, 1);
    assert.equal(fixture.state.auditCalls.length, 0);
    assert.match(fixture.state.insertedMessages[0].params[6], /client@example\.com/i);
    assert.match(fixture.state.insertedMessages[0].params[6], /second@example\.com/i);
  } finally {
    fixture.cleanup();
    if (beforeApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeApiKey;
    if (beforeReplyBase === undefined) delete process.env.SUPPORT_REPLY_BASE_EMAIL;
    else process.env.SUPPORT_REPLY_BASE_EMAIL = beforeReplyBase;
    if (beforeReplySecret === undefined) delete process.env.SUPPORT_REPLY_HMAC_SECRET;
    else process.env.SUPPORT_REPLY_HMAC_SECRET = beforeReplySecret;
  }
});

test("messages send-email rejects malformed email inside a recipient list", async () => {
  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/send-email")
      .send({
        to_email: "client@example.com, bad-address",
        message_type: "general",
        subject: "Brief Subject",
        body: "Thanks for reaching out."
      });

    assert.equal(res.status, 400);
    assert.match(String(res.body?.error || ""), /invalid recipient email/i);
    assert.equal(fixture.state.sentEmails.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("messages send-email rejects invalid recipient email", async () => {
  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/send-email")
      .send({
        to_email: "not-an-email",
        message_type: "general",
        subject: "Brief Subject",
        body: "Thanks for reaching out."
      });

    assert.equal(res.status, 400);
    assert.match(String(res.body?.error || ""), /valid recipient email/i);
    assert.equal(fixture.state.sentEmails.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("messages unread-count returns split unread buckets", async () => {
  const fixture = loadMessagesRouter();

  try {
    const res = await request(fixture.app).get("/api/messages/unread-count");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      total: 4,
      messages: 1,
      support: 1,
      notifications: 2
    });
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
