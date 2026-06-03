"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

async function withEnv(overrides, fn) {
  const before = {};
  for (const key of Object.keys(overrides)) {
    before[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(before)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

function signInboundPayload(secret, bodyObject, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(bodyObject ?? {});
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return { rawBody, signature, timestampSeconds };
}

function loadInboundEmailApp() {
  const originalLoad = Module._load.bind(Module);
  const state = { insertedMessages: [] };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT id, sender_id\s+FROM messages/i.test(sql)) {
              return {
                rows: [{
                  id: "77777777-7777-4777-8777-777777777777",
                  sender_id: "11111111-1111-4111-8111-111111111111"
                }],
                rowCount: 1
              };
            }

            if (/INSERT INTO messages/i.test(sql)) {
              state.insertedMessages.push({ sql, params });
              return { rows: [], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
          }
        }
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }

    if (requestName === "../services/invoiceOwnerEmailService.js" || /invoiceOwnerEmailService\.js$/.test(requestName)) {
      return { sendInvoiceOwnerActivityEmail: async () => {} };
    }

    if (requestName === "resend") {
      return {
        Resend: class Resend {
          constructor() {
            this.emails = {
              receiving: {
                get: async () => ({ data: null })
              }
            };
          }
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  const routePath = require.resolve("../routes/email.routes.js");
  delete require.cache[routePath];

  try {
    const router = require("../routes/email.routes.js");
    const app = express();
    app.use("/api/email/inbound", express.raw({ type: "*/*", limit: "256kb" }));
    app.use("/api/email", router);
    return {
      app,
      state,
      cleanup() {
        delete require.cache[routePath];
        Module._load = originalLoad;
      }
    };
  } catch (err) {
    Module._load = originalLoad;
    throw err;
  }
}

test("POST /api/email/inbound routes support reply tokens into the user's message inbox", async () => {
  await withEnv({
    INBOUND_EMAIL_WEBHOOK_SECRET: "test-inbound-secret",
    SUPPORT_REPLY_BASE_EMAIL: "support@inex.app",
    SUPPORT_REPLY_HMAC_SECRET: "support-reply-secret-32-bytes-aaaa"
  }, async () => {
    const fixture = loadInboundEmailApp();

    try {
      const { buildSupportReplyToAddress } = require("../services/supportEmailService.js");
      const replyTo = buildSupportReplyToAddress("77777777-7777-4777-8777-777777777777");
      const { rawBody, signature, timestampSeconds } = signInboundPayload("test-inbound-secret", {
        from: { email: "support.inex@gmail.com", name: "InEx Support" },
        to: [{ email: replyTo }],
        subject: "Re: Need help",
        text: "Here is the next step."
      });

      const res = await request(fixture.app)
        .post("/api/email/inbound")
        .set("Content-Type", "application/json")
        .set("x-inbound-timestamp", String(timestampSeconds))
        .set("x-inbound-signature", signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(fixture.state.insertedMessages.length, 1);
      assert.equal(fixture.state.insertedMessages[0].params[2], "it_support");
      assert.equal(fixture.state.insertedMessages[0].params[8], "77777777-7777-4777-8777-777777777777");
    } finally {
      fixture.cleanup();
    }
  });
});
