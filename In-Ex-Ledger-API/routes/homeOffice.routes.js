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
const { ApiError, asyncRoute } = require("../utils/apiError.js");

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
router.get("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const taxYear = resolveTaxYear(req.query.tax_year);
  const worksheet = await getHomeOfficeWorksheet(businessId, taxYear);
  res.json({ worksheet: worksheet || null, taxYear });
}));

// PUT /api/home-office-worksheet  (upsert for the given tax year)
// upsertHomeOfficeWorksheet already throws Error instances carrying a
// .status (e.g. 400 for invalid area inputs), so no translation is needed
// here -- they reach the central handler already in ApiError-compatible shape.
router.put("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const body = req.body ?? {};
  const taxYear = resolveTaxYear(body.tax_year);
  const worksheet = await upsertHomeOfficeWorksheet(businessId, taxYear, body);
  invalidateHomeOfficeSnapshots(businessId);
  res.json({ worksheet, taxYear });
}));

// DELETE /api/home-office-worksheet?tax_year=2026
router.delete("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const taxYear = resolveTaxYear(req.query.tax_year);
  const deleted = await deleteHomeOfficeWorksheet(businessId, taxYear);
  if (!deleted) {
    throw new ApiError(404, "Home-office worksheet not found.");
  }
  invalidateHomeOfficeSnapshots(businessId);
  res.json({ ok: true, taxYear });
}));

module.exports = router;
