"use strict";

const express = require("express");
const { requireAuth, requireMfaIfEnabled } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  DEFAULT_SCOPE,
  PERSONAL_TOKEN_TTL_SECONDS,
  getConnectorStatusForUser,
  createConsent,
  issueConnectorAccessToken,
  revokeConnectorAccess,
  recordConnectorAudit
} = require("../services/chatgptConnectorService.js");

const router = express.Router();
router.use(requireAuth);

router.get("/status", async (req, res) => {
  try {
    const status = await getConnectorStatusForUser(req.user);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to load ChatGPT connector status." });
  }
});

router.post("/personal-token", requireCsrfProtection, requireMfaIfEnabled, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    await revokeConnectorAccess({ userId: req.user.id, businessId });
    const consent = await createConsent({
      userId: req.user.id,
      businessId,
      clientId: "manual-chatgpt",
      scope: DEFAULT_SCOPE,
      consentType: "personal_access"
    });
    const token = await issueConnectorAccessToken({
      consentId: consent.id,
      clientId: "manual-chatgpt",
      userId: req.user.id,
      businessId,
      scope: DEFAULT_SCOPE,
      tokenKind: "personal_access",
      label: "ChatGPT manual token",
      ttlSeconds: PERSONAL_TOKEN_TTL_SECONDS
    });
    await recordConnectorAudit(req, {
      action: "chatgpt.connector.personal_token.created",
      businessId,
      metadata: { consent_id: consent.id, expires_at: token.expiresAt }
    });
    res.status(201).json({
      token: token.accessToken,
      expires_at: token.expiresAt,
      scope: DEFAULT_SCOPE
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Failed to create ChatGPT token." });
  }
});

router.post("/revoke", requireCsrfProtection, requireMfaIfEnabled, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    await revokeConnectorAccess({ userId: req.user.id, businessId });
    await recordConnectorAudit(req, {
      action: "chatgpt.connector.revoked",
      businessId,
      metadata: { source: "settings" }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to revoke ChatGPT connector access." });
  }
});

module.exports = router;
