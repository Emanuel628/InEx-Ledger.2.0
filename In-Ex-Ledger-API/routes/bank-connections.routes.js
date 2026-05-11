"use strict";

const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError } = require("../utils/logger.js");
const {
  listBankConnectionsForBusiness,
  disconnectBankConnection
} = require("../services/bankConnectionService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/bank-connections
 * Returns the user's bank connections (Plaid items, CSV-only placeholders).
 * Never exposes access tokens.
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const connections = await listBankConnectionsForBusiness(pool, businessId);
    res.json({ connections, count: connections.length });
  } catch (err) {
    logError("GET /bank-connections error:", err.message);
    res.status(500).json({ error: "Failed to load bank connections." });
  }
});

/**
 * DELETE /api/bank-connections/:id
 * Disconnect a bank connection. Sets status='disconnected' and clears the
 * stored access token. Linked accounts remain (with bank_connection_id set
 * to NULL via FK on delete behavior at the row level — here we just keep
 * the audit trail by flipping status).
 */
router.delete("/:id", async (req, res) => {
  const connectionId = String(req.params.id || "").trim();
  if (!UUID_RE.test(connectionId)) {
    return res.status(400).json({ error: "Invalid connection id." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const ok = await disconnectBankConnection(pool, businessId, connectionId);
    if (!ok) {
      return res.status(404).json({ error: "Connection not found or already disconnected." });
    }
    res.json({ message: "Bank connection disconnected." });
  } catch (err) {
    logError("DELETE /bank-connections/:id error:", err.message);
    res.status(500).json({ error: "Failed to disconnect bank connection." });
  }
});

module.exports = router;
