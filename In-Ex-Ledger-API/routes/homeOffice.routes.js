"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  getHomeOfficeWorksheet,
  upsertHomeOfficeWorksheet,
  deleteHomeOfficeWorksheet
} = require("../services/homeOfficeService.js");
const { logError } = require("../utils/logger.js");
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

function resolveTaxYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2010 ? year : new Date().getFullYear();
}

function invalidateHomeOfficeSnapshots(businessId) {
  void invalidateSnapshotsForBusiness({
    businessId,
    reason: "Home-office worksheet changed after export."
  }).catch((error) => logError("Home-office snapshot invalidation failed:", error));
}

// GET /api/home-office-worksheet?tax_year=2026
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const taxYear = resolveTaxYear(req.query.tax_year);
    const worksheet = await getHomeOfficeWorksheet(businessId, taxYear);
    res.json({ worksheet: worksheet || null, taxYear });
  } catch (err) {
    logError("GET /home-office-worksheet error:", err.stack || err);
    res.status(500).json({ error: "Server error loading home-office worksheet." });
  }
});

// PUT /api/home-office-worksheet  (upsert for the given tax year)
router.put("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const body = req.body ?? {};
    const taxYear = resolveTaxYear(body.tax_year);
    const worksheet = await upsertHomeOfficeWorksheet(businessId, taxYear, body);
    invalidateHomeOfficeSnapshots(businessId);
    res.json({ worksheet, taxYear });
  } catch (err) {
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    logError("PUT /home-office-worksheet error:", err.stack || err);
    res.status(500).json({ error: "Server error saving home-office worksheet." });
  }
});

// DELETE /api/home-office-worksheet?tax_year=2026
router.delete("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const taxYear = resolveTaxYear(req.query.tax_year);
    const deleted = await deleteHomeOfficeWorksheet(businessId, taxYear);
    if (!deleted) return res.status(404).json({ error: "Home-office worksheet not found." });
    invalidateHomeOfficeSnapshots(businessId);
    res.json({ ok: true, taxYear });
  } catch (err) {
    logError("DELETE /home-office-worksheet error:", err.stack || err);
    res.status(500).json({ error: "Server error deleting home-office worksheet." });
  }
});

module.exports = router;
