"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const MESSAGES_ROUTE_PATH = require.resolve("../routes/messages.routes.js");
const TEST_BUSINESS_ID = "33333333-3333-4333-8333-333333333333";

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

            if (/FROM messages\s+WHERE receiver_id = \$1\s+AND business_id = \$2\s+AND is_read = FALSE\s+AND is_deleted_by_receiver = FALSE/i.test(sql.replace(/\s+/g, " "))) {
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
      requestName === "../api/utils/resolveBusinessIdForUser.js" ||
      /resolveBusinessIdForUser\.js$/.test(requestName)
    ) {
      return { resolveBusinessIdForUser: async () => TEST_BUSINESS_ID };
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
    assert.match(String(fixture.state.sentEmails[0].replyTo || ""), /support\+s\.[0-9a-f]{32}\.[A-Za-z0-9_-]{16}@/i);
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
    assert.match(String(fixture.state.sentEmails[0].replyTo || ""), /support\+s\.[0-9a-f]{32}\.[A-Za-z0-9_-]{16}@/i);
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

function loadMessagesRouterForReply() {
  const originalLoad = Module._load.bind(Module);
  const state = { sentEmails: [], insertedMessages: [] };
  const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
  const OWNER_ID = "11111111-1111-4111-8111-111111111111";

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/FROM messages m\s+LEFT JOIN invoices_v1/i.test(sql.replace(/\s+/g, " "))) {
              return {
                rows: [{
                  id: MESSAGE_ID,
                  sender_id: OWNER_ID,
                  receiver_id: OWNER_ID,
                  is_deleted_by_receiver: false,
                  is_deleted_by_sender: false,
                  invoice_id: null,
                  invoice_number: null,
                  business_id: null,
                  business_name: "Test Business",
                  owner_id: OWNER_ID,
                  thread_root_id: MESSAGE_ID,
                  external_sender_email: "client@example.com",
                  external_sender_name: "Client Example",
                  external_message_id: null,
                  external_references: null,
                  subject: "Need help"
                }],
                rowCount: 1
              };
            }

            if (/INSERT INTO messages/i.test(sql)) {
              state.insertedMessages.push({ sql, params });
              return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth: (req, _res, next) => { req.user = { id: OWNER_ID, email: "owner@example.com" }; next(); } };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => TEST_BUSINESS_ID };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return { AUDIT_ACTIONS: {}, async recordAuditEventForRequest() { return "audit-1"; } };
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

test("messages reply-email attaches an uploaded file to the outbound email", async () => {
  const beforeApiKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_123";

  const fixture = loadMessagesRouterForReply();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/55555555-5555-4555-8555-555555555555/reply-email")
      .field("body", "Please see the attached file.")
      .attach("attachment", Buffer.from("id,amount\n1,2.50"), { filename: "export.csv", contentType: "text/csv" });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.sentEmails.length, 1);
    const sent = fixture.state.sentEmails[0];
    assert.equal(sent.attachments?.length, 1);
    assert.equal(sent.attachments[0].filename, "export.csv");
    assert.equal(sent.attachments[0].contentType, "text/csv");
    assert.ok(Buffer.isBuffer(sent.attachments[0].content));
  } finally {
    fixture.cleanup();
    if (beforeApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeApiKey;
  }
});

test("messages reply-email rejects an unsupported attachment type", async () => {
  const beforeApiKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_123";

  const fixture = loadMessagesRouterForReply();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/55555555-5555-4555-8555-555555555555/reply-email")
      .field("body", "Please see the attached file.")
      .attach("attachment", Buffer.from("#!/bin/sh\necho hi"), { filename: "script.sh", contentType: "application/x-sh" });

    assert.equal(res.status, 400);
    assert.equal(fixture.state.sentEmails.length, 0);
  } finally {
    fixture.cleanup();
    if (beforeApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeApiKey;
  }
});

test("messages reply-email without an attachment still sends normally", async () => {
  const beforeApiKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_123";

  const fixture = loadMessagesRouterForReply();

  try {
    const res = await request(fixture.app)
      .post("/api/messages/55555555-5555-4555-8555-555555555555/reply-email")
      .send({ body: "No attachment here." });

    assert.equal(res.status, 200);
    assert.equal(fixture.state.sentEmails.length, 1);
    assert.equal(fixture.state.sentEmails[0].attachments, undefined);
  } finally {
    fixture.cleanup();
    if (beforeApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeApiKey;
  }
});

// Regression coverage for the business-isolation fix: a user with more than
// one business must only ever see messages tagged with the currently active
// business_id — never messages created while a different business was
// active. This is what "messages bleed into a second business" looked like
// before messages.business_id existed.
function loadMessagesRouterForIsolation({ activeBusinessId, rows }) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/WITH visible_messages AS/i.test(sql)) {
              const requestedBusinessId = params[params.length - 1];
              const matches = rows.filter((row) => row.business_id === requestedBusinessId);
              return { rows: matches, rowCount: matches.length };
            }
            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return { requireAuth: (req, _res, next) => { req.user = { id: "owner-1", email: "owner@example.com" }; next(); } };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => activeBusinessId };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }

    if (requestName === "../middleware/rate-limit.middleware.js" || /rate-limit\.middleware\.js$/.test(requestName)) {
      return { createDataApiLimiter: () => (_req, _res, next) => next() };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../services/auditEventService.js" || /auditEventService\.js$/.test(requestName)) {
      return { AUDIT_ACTIONS: {}, async recordAuditEventForRequest() { return "audit-1"; } };
    }

    if (requestName === "resend") {
      return { Resend: class Resend {} };
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

test("messages inbox only returns rows tagged with the currently active business", async () => {
  const businessA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const businessB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const rows = [
    { id: "m-a", business_id: businessA, created_at: "2026-01-01", receiver_id: "owner-1", sender_id: "other", is_read: false },
    { id: "m-b", business_id: businessB, created_at: "2026-01-02", receiver_id: "owner-1", sender_id: "other", is_read: false }
  ];

  const fixtureA = loadMessagesRouterForIsolation({ activeBusinessId: businessA, rows });
  try {
    const res = await request(fixtureA.app).get("/api/messages/inbox");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.messages.map((m) => m.id), ["m-a"]);
  } finally {
    fixtureA.cleanup();
  }

  const fixtureB = loadMessagesRouterForIsolation({ activeBusinessId: businessB, rows });
  try {
    const res = await request(fixtureB.app).get("/api/messages/inbox");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.messages.map((m) => m.id), ["m-b"]);
  } finally {
    fixtureB.cleanup();
  }
});
