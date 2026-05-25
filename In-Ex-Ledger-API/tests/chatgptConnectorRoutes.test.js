"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/chatgptConnector.routes.js");

function loadChatgptConnectorRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    revokeCalls: 0,
    auditCalls: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_1" };
          next();
        },
        requireMfaIfEnabled(_req, _res, next) {
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

    if (requestName === "../services/chatgptConnectorService.js" || /chatgptConnectorService\.js$/.test(requestName)) {
      return {
        DEFAULT_SCOPE: "read:businesses read:exports",
        PERSONAL_TOKEN_TTL_SECONDS: 7776000,
        getConnectorStatusForUser: async () => ({
          businessId: "biz_1",
          oauthConfigured: true,
          clientId: "client_1",
          mcpUrl: "https://app.example.com/mcp",
          connected: false,
          current: null
        }),
        createConsent: async () => ({ id: "consent_1" }),
        issueConnectorAccessToken: async () => ({
          accessToken: "token_value",
          expiresAt: "2026-08-01T00:00:00.000Z"
        }),
        revokeConnectorAccess: async () => {
          state.revokeCalls += 1;
        },
        recordConnectorAudit: async (_req, payload) => {
          state.auditCalls.push(payload);
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
  app.use("/api/chatgpt-connector", router);

  return { app, state };
}

test("GET /api/chatgpt-connector/status returns connector status", async () => {
  const { app } = loadChatgptConnectorRouterFixture();

  const response = await request(app).get("/api/chatgpt-connector/status");

  assert.equal(response.status, 200);
  assert.equal(response.body.mcpUrl, "https://app.example.com/mcp");
  assert.equal(response.body.connected, false);
});

test("POST /api/chatgpt-connector/personal-token creates a manual token", async () => {
  const { app, state } = loadChatgptConnectorRouterFixture();

  const response = await request(app)
    .post("/api/chatgpt-connector/personal-token")
    .send({});

  assert.equal(response.status, 201);
  assert.equal(response.body.token, "token_value");
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.auditCalls.length, 1);
  assert.equal(state.auditCalls[0].action, "chatgpt.connector.personal_token.created");
});

test("POST /api/chatgpt-connector/revoke revokes connector access", async () => {
  const { app, state } = loadChatgptConnectorRouterFixture();

  const response = await request(app)
    .post("/api/chatgpt-connector/revoke")
    .send({});

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.auditCalls.length, 1);
  assert.equal(state.auditCalls[0].action, "chatgpt.connector.revoked");
});
