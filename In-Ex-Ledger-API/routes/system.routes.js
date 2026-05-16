const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { migrationStats } = require("../db.js");
const { getRateLimiterHealth } = require("../middleware/rateLimiter.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { getReceiptStorageStatus } = require("../services/receiptStorage.js");
const { buildDiagnostics } = require("../services/diagnosticsService.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();
const publicSystemLimiter = createDataApiLimiter({
  keyPrefix: "rl:system:public",
  keyStrategy: "ip",
  max: 60
});

router.get("/health", publicSystemLimiter, (req, res) => {
  res.json({
    status: "ok",
    service: "inex-ledger",
    timestamp: new Date().toISOString()
  });
});

router.get("/links", publicSystemLimiter, (req, res) => {
  res.json({
    login: "/login",
    register: "/register",
    transactions: "/transactions",
    settings: "/settings",
    exports: "/exports"
  });
});

/**
 * GET /api/system/diagnostics
 * Auth-required diagnostics. Returns only booleans / counts / uptime —
 * never secrets, IPs, PII, or customer data. Useful for the settings
 * Diagnostics panel and for support.
 */
router.get("/diagnostics", requireAuth, (req, res) => {
  try {
    const diagnostics = buildDiagnostics({
      migrationStats,
      rateLimiting: getRateLimiterHealth(),
      receiptStorage: getReceiptStorageStatus()
    });
    res.json(diagnostics);
  } catch (err) {
    logError("GET /api/system/diagnostics error:", err.stack || err);
    res.status(500).json({ error: "Failed to load diagnostics." });
  }
});

module.exports = router;
