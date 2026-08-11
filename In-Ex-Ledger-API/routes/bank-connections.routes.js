"use strict";

const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  listBankConnectionsForBusiness,
  disconnectBankConnection
} = require("../services/bankConnectionService.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");

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
router.get("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const connections = await listBankConnectionsForBusiness(pool, businessId);
  res.json({ connections, count: connections.length });
}));

/**
 * DELETE /api/bank-connections/:id
 * Disconnect a bank connection. Sets status='disconnected' and clears the
 * stored access token. Linked accounts remain (with bank_connection_id set
 * to NULL via FK on delete behavior at the row level — here we just keep
 * the audit trail by flipping status).
 */
router.delete("/:id", asyncRoute(async (req, res) => {
  const connectionId = String(req.params.id || "").trim();
  if (!UUID_RE.test(connectionId)) {
    throw new ApiError(400, "Invalid connection id.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);
  const ok = await disconnectBankConnection(pool, businessId, connectionId);
  if (!ok) {
    throw new ApiError(404, "Connection not found or already disconnected.");
  }
  res.json({ message: "Bank connection disconnected." });
}));

module.exports = router;
