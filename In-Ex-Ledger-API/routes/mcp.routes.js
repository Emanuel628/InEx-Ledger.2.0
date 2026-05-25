"use strict";

const express = require("express");
const {
  CONNECTOR_CLIENT_ID,
  DEFAULT_SCOPE,
  SUPPORTED_SCOPES,
  buildAppOrigin,
  isOauthConnectorConfigured,
  validateOauthClient,
  getAuthorizedUserFromRefreshCookie,
  createConsent,
  revokeConnectorAccess,
  createAuthCode,
  consumeAuthCode,
  issueConnectorAccessToken,
  authenticateConnectorToken,
  handleMcpRequest,
  recordConnectorAudit
} = require("../services/chatgptConnectorService.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();

function buildAuthorizeHtml(req, {
  user,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod
}) {
  const approveHref = buildDecisionHref(req, {
    decision: "approve",
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod
  });
  const denyHref = buildDecisionHref(req, {
    decision: "deny",
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Connect ChatGPT | InEx Ledger</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
</head>
<body bgcolor="#f5f8fc" text="#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f8fc">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellpadding="32" cellspacing="0" border="1" bgcolor="#ffffff">
          <tr>
            <td>
              <font face="Arial, Helvetica, sans-serif" color="#0f172a">
                <p><b>ChatGPT connector</b></p>
                <h1>Connect ChatGPT to InEx Ledger</h1>
                <p>Signed in as <b>${escapeHtml(user.email)}</b>. This grants read-only access to your active business ledger through the MCP endpoint.</p>
                <p><b>Client:</b> <code>${escapeHtml(clientId)}</code></p>
                <p><b>Scope:</b> <code>${escapeHtml(scope)}</code></p>
                <p><b>MCP endpoint:</b> <code>${escapeHtml(buildAppOrigin(req))}/mcp</code></p>
                <p>ChatGPT will be able to read bookkeeping summaries, transactions, receipt coverage, export readiness, invoice activity, and tax reminders. It will not be able to write changes in this phase.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <a href="${escapeHtml(approveHref)}">Allow read-only access</a>
                    </td>
                    <td width="20"></td>
                    <td>
                      <a href="${escapeHtml(denyHref)}">Cancel</a>
                    </td>
                  </tr>
                </table>
              </font>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDecisionHref(req, {
  decision,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    decision
  });
  if (state) {
    params.set("state", state);
  }
  return `${buildAppOrigin(req)}/mcp/oauth/authorize?${params.toString()}`;
}

function resolveAuthorizationInput(req) {
  const source = req.method === "POST" ? req.body : req.query;
  return {
    responseType: String(source.response_type || "code").trim(),
    clientId: String(source.client_id || "").trim(),
    redirectUri: String(source.redirect_uri || "").trim(),
    scope: String(source.scope || DEFAULT_SCOPE).trim(),
    state: String(source.state || "").trim(),
    codeChallenge: String(source.code_challenge || "").trim(),
    codeChallengeMethod: String(source.code_challenge_method || "S256").trim()
  };
}

function buildLoginRedirect(req) {
  const next = encodeURIComponent(req.originalUrl || "/mcp/oauth/authorize");
  return `/login?next=${next}`;
}

router.get("/.well-known/oauth-authorization-server", (req, res) => {
  const origin = buildAppOrigin(req);
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/oauth/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: SUPPORTED_SCOPES
  });
});

router.get("/.well-known/oauth-protected-resource", (req, res) => {
  const origin = buildAppOrigin(req);
  res.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: SUPPORTED_SCOPES
  });
});

router.get("/oauth/authorize", async (req, res) => {
  try {
    const params = resolveAuthorizationInput(req);
    if (params.responseType !== "code") {
      return res.status(400).send("Unsupported response_type.");
    }
    validateOauthClient(params.clientId, params.redirectUri);
    if (!params.codeChallenge) {
      return res.status(400).send("Missing code_challenge.");
    }
    const user = await getAuthorizedUserFromRefreshCookie(req);
    if (!user) {
      return res.redirect(302, buildLoginRedirect(req));
    }
    const decision = String(req.query?.decision || "").trim().toLowerCase();
    if (decision === "approve" || decision === "deny") {
      return finishAuthorization(req, res, { params, user, decision });
    }
    res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    res.send(buildAuthorizeHtml(req, { user, ...params }));
  } catch (error) {
    res.status(error.status || 500).send(error.message || "Unable to start authorization.");
  }
});

async function finishAuthorization(req, res, { params, user, decision }) {
  try {
    if (decision === "deny") {
      const denied = new URL(params.redirectUri);
      denied.searchParams.set("error", "access_denied");
      if (params.state) denied.searchParams.set("state", params.state);
      return res.redirect(302, denied.toString());
    }
    const businessId = await resolveBusinessIdForUser(user);
    await revokeConnectorAccess({ userId: user.id, businessId });
    const consent = await createConsent({
      userId: user.id,
      businessId,
      clientId: params.clientId,
      scope: params.scope,
      consentType: "oauth"
    });
    const code = await createAuthCode({
      consentId: consent.id,
      clientId: params.clientId,
      userId: user.id,
      businessId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod
    });
    await recordConnectorAudit(req, {
      action: "chatgpt.connector.oauth.approved",
      businessId,
      metadata: { client_id: params.clientId, consent_id: consent.id }
    });
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code.code);
    if (params.state) redirect.searchParams.set("state", params.state);
    return res.redirect(302, redirect.toString());
  } catch (error) {
    res.status(error.status || 500).send(error.message || "Unable to finish authorization.");
  }
}

router.post("/oauth/authorize", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const params = resolveAuthorizationInput(req);
    validateOauthClient(params.clientId, params.redirectUri);
    const user = await getAuthorizedUserFromRefreshCookie(req);
    if (!user) {
      return res.redirect(302, buildLoginRedirect(req));
    }
    return finishAuthorization(req, res, {
      params,
      user,
      decision: String(req.body?.decision || "").trim().toLowerCase()
    });
  } catch (error) {
    res.status(error.status || 500).send(error.message || "Unable to finish authorization.");
  }
});

router.post("/oauth/token", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const grantType = String(req.body?.grant_type || "").trim();
    const clientId = String(req.body?.client_id || "").trim();
    const redirectUri = String(req.body?.redirect_uri || "").trim();
    const code = String(req.body?.code || "").trim();
    const codeVerifier = String(req.body?.code_verifier || "").trim();
    if (grantType !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }
    validateOauthClient(clientId, redirectUri);
    const authCode = await consumeAuthCode({
      code,
      clientId,
      redirectUri,
      codeVerifier
    });
    if (!authCode) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    const token = await issueConnectorAccessToken({
      consentId: authCode.consent_id,
      clientId,
      userId: authCode.user_id,
      businessId: authCode.business_id,
      scope: authCode.scope,
      tokenKind: "oauth_access"
    });
    return res.json({
      access_token: token.accessToken,
      token_type: "Bearer",
      expires_in: 60 * 60 * 24 * 30,
      scope: authCode.scope
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: "server_error", error_description: error.message || "Failed to issue token." });
  }
});

router.get("/", (req, res) => {
  const origin = buildAppOrigin(req);
  res.json({
    name: "InEx Ledger MCP",
    oauth_configured: isOauthConnectorConfigured(),
    client_id: CONNECTOR_CLIENT_ID || null,
    mcp_endpoint: `${origin}/mcp`,
    authorize_endpoint: `${origin}/mcp/oauth/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    scope: DEFAULT_SCOPE
  });
});

router.post("/", async (req, res) => {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const auth = bearer ? await authenticateConnectorToken(bearer) : null;
  const normalizedAuth = auth
    ? {
        user_id: auth.user_id,
        business_id: auth.business_id,
        scope: auth.scope,
        token_kind: auth.token_kind,
        client_id: auth.client_id
      }
    : null;
  const payload = await handleMcpRequest(req.body, normalizedAuth, req);
  res.json(payload);
});

module.exports = router;
