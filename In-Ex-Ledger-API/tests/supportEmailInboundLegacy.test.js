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

function signSvix(secret, rawBody, id = "msg_test_123", timestamp = String(Math.floor(Date.now() / 1000))) {
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const keyBytes = Buffer.from(keyMaterial, "base64");
  const signature = crypto
    .createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

function signLegacy(secret, rawBody, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return { timestamp, signature };
}

function loadLegacySupportInboundApp() {
  const originalLoad = Module._load.bind(Module);
  const state = { insertedMessages: [] };

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            if (/SELECT id, sender_id, subject\s+FROM messages/i.test(sql)) {
              return {
                rows: [{
                  id: "77777777-7777-4777-8777-777777777777",
                  sender_id: "11111111-1111-4111-8111-111111111111",
                  subject: "Need help"
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

  const routePath = require.resolve("../routes/supportEmail.routes.js");
  delete require.cache[routePath];

  try {
    const router = require("../routes/supportEmail.routes.js");
    const app = express();
    app.use("/api/support-email/inbound", express.raw({ type: "*/*", limit: "256kb" }));
    app.use("/api/support-email", router);
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

test("legacy support inbound route stores unread threaded support replies", async () => {
  await withEnv({
    SUPPORT_INBOUND_WEBHOOK_SECRET: `whsec_${Buffer.from("legacy-support-secret-123").toString("base64")}`,
    SUPPORT_REPLY_BASE_EMAIL: "support@inex.app",
    SUPPORT_REPLY_HMAC_SECRET: "support-reply-secret-32-bytes-aaaa"
  }, async () => {
    const fixture = loadLegacySupportInboundApp();

    try {
      const { buildSupportReplyToAddress } = require("../services/supportEmailService.js");
      const replyTo = buildSupportReplyToAddress("77777777-7777-4777-8777-777777777777");
      const rawBody = JSON.stringify({
        from: { email: "support.inex@gmail.com", name: "InEx Support" },
        to: [{ email: replyTo }],
        subject: "Re: Need help",
        text: "Here is the next step."
      });
      const signed = signSvix(process.env.SUPPORT_INBOUND_WEBHOOK_SECRET, rawBody);

      const res = await request(fixture.app)
        .post("/api/support-email/inbound")
        .set("Content-Type", "application/json")
        .set("svix-id", signed.id)
        .set("svix-timestamp", signed.timestamp)
        .set("svix-signature", signed.signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(fixture.state.insertedMessages.length, 1);
      assert.equal(fixture.state.insertedMessages[0].params[1], "11111111-1111-4111-8111-111111111111");
      assert.equal(fixture.state.insertedMessages[0].params[4], "77777777-7777-4777-8777-777777777777");
    } finally {
      fixture.cleanup();
    }
  });
});

test("legacy support inbound route also accepts x-inbound signature headers", async () => {
  await withEnv({
    SUPPORT_INBOUND_WEBHOOK_SECRET: "legacy-hex-secret-123",
    SUPPORT_REPLY_BASE_EMAIL: "support@inex.app",
    SUPPORT_REPLY_HMAC_SECRET: "support-reply-secret-32-bytes-aaaa"
  }, async () => {
    const fixture = loadLegacySupportInboundApp();

    try {
      const { buildSupportReplyToAddress } = require("../services/supportEmailService.js");
      const replyTo = buildSupportReplyToAddress("77777777-7777-4777-8777-777777777777");
      const rawBody = JSON.stringify({
        from: { email: "support.inex@gmail.com", name: "InEx Support" },
        to: [{ email: replyTo }],
        subject: "Re: Need help",
        text: "Header-signed support reply."
      });
      const signed = signLegacy(process.env.SUPPORT_INBOUND_WEBHOOK_SECRET, rawBody);

      const res = await request(fixture.app)
        .post("/api/support-email/inbound")
        .set("Content-Type", "application/json")
        .set("x-inbound-timestamp", signed.timestamp)
        .set("x-inbound-signature", signed.signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(fixture.state.insertedMessages.length, 1);
    } finally {
      fixture.cleanup();
    }
  });
});
