const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { migrationStats } = require("../db.js");
const { getRateLimiterHealth } = require("../middleware/rateLimiter.js");
const { getReceiptStorageStatus } = require("../services/receiptStorage.js");
const { buildDiagnostics } = require("../services/diagnosticsService.js");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "inex-ledger",
    timestamp: new Date().toISOString()
  });
});

router.get("/links", (req, res) => {
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
    res.status(500).json({ error: "Failed to load diagnostics." });
  }
});

module.exports = router;
