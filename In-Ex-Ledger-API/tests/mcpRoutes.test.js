"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/mcp.routes.js");

function loadMcpRouterFixture() {
  const originalLoad = Module._load.bind(Module);
  const state = {
    auditCalls: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../services/chatgptConnectorService.js" || /chatgptConnectorService\.js$/.test(requestName)) {
      return {
        CONNECTOR_CLIENT_ID: "chatgpt-client",
        DEFAULT_SCOPE: "read:businesses read:exports",
        SUPPORTED_SCOPES: ["read:businesses", "read:exports"],
        buildAppOrigin: () => "https://app.example.com",
        isOauthConnectorConfigured: () => true,
        validateOauthClient(clientId, redirectUri) {
          assert.equal(clientId, "chatgpt-client");
          assert.equal(redirectUri, "https://chat.openai.com/aip/oauth/callback");
        },
        getAuthorizedUserFromRefreshCookie: async () => ({ id: "user_1", email: "owner@example.com" }),
        createConsent: async () => ({ id: "consent_1" }),
        revokeConnectorAccess: async () => {},
        createAuthCode: async () => ({ code: "auth_code_value" }),
        consumeAuthCode: async () => ({
          consent_id: "consent_1",
          user_id: "user_1",
          business_id: "biz_1",
          scope: "read:businesses read:exports"
        }),
        issueConnectorAccessToken: async () => ({
          accessToken: "access_token_value"
        }),
        authenticateConnectorToken: async (token) => {
          if (token === "good-token") {
            return {
              user_id: "user_1",
              business_id: "biz_1",
              scope: "read:businesses read:exports",
              token_kind: "personal_access",
              client_id: "manual-chatgpt"
            };
          }
          return null;
        },
        handleMcpRequest: async (body, auth) => {
          if (body.method === "tools/list") {
            return { jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "get_businesses" }] } };
          }
          return { jsonrpc: "2.0", id: body.id, result: { ok: true, auth } };
        },
        recordConnectorAudit: async (_req, payload) => {
          state.auditCalls.push(payload);
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_1"
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/mcp", router);

  return { app, state };
}

test("GET /mcp returns connector metadata", async () => {
  const { app } = loadMcpRouterFixture();

  const response = await request(app).get("/mcp");

  assert.equal(response.status, 200);
  assert.equal(response.body.mcp_endpoint, "https://app.example.com/mcp");
  assert.equal(response.body.scope, "read:businesses read:exports");
});

test("GET /mcp/oauth/authorize renders a CSP-safe consent page", async () => {
  const { app } = loadMcpRouterFixture();

  const response = await request(app).get("/mcp/oauth/authorize")
    .query({
      response_type: "code",
      client_id: "chatgpt-client",
      redirect_uri: "https://chat.openai.com/aip/oauth/callback",
      scope: "read:businesses read:exports",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      state: "state_1"
    });

  assert.equal(response.status, 200);
  assert.match(response.text, /<form method="post" action="\/mcp\/oauth\/authorize">/);
  assert.doesNotMatch(response.text, /<style>/);
});

test("POST /mcp/oauth/token exchanges an auth code", async () => {
  const { app } = loadMcpRouterFixture();

  const response = await request(app)
    .post("/mcp/oauth/token")
    .type("form")
    .send({
      grant_type: "authorization_code",
      client_id: "chatgpt-client",
      redirect_uri: "https://chat.openai.com/aip/oauth/callback",
      code: "auth_code_value",
      code_verifier: "verifier"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.access_token, "access_token_value");
});

test("POST /mcp forwards authenticated MCP requests", async () => {
  const { app } = loadMcpRouterFixture();

  const response = await request(app)
    .post("/mcp")
    .set("Authorization", "Bearer good-token")
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.result.tools, [{ name: "get_businesses" }]);
});
