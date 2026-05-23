"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { pool } = require("../db.js");
const {
  listCapitalAssets,
  getCapitalAsset,
  createCapitalAsset,
  updateCapitalAsset,
  disposeCapitalAsset,
  getTotalDepreciationForYear
} = require("../services/capitalAssetService.js");
const { logError } = require("../utils/logger.js");
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const VALID_CCA_CLASSES = new Set(["Class 8", "Class 10", "Class 12", "Class 50", "Class 14.1"]);
const VALID_MACRS_CLASSES = new Set(["5-year", "7-year"]);
const VALID_ASSET_CATEGORIES = new Set(["equipment", "vehicle", "computer", "software", "intangible", "other"]);

async function resolveBusinessRegion(businessId) {
  const result = await pool.query(`SELECT region FROM businesses WHERE id = $1`, [businessId]);
  return result.rows[0]?.region || "US";
}

function invalidateCapitalAssetSnapshots(businessId) {
  void invalidateSnapshotsForBusiness({
    businessId,
    reason: "Capital asset schedules changed after export."
  }).catch((error) => logError("Capital asset snapshot invalidation failed:", error));
}

// GET /api/capital-assets?tax_year=2024
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const taxYear = Number(req.query.tax_year) || new Date().getFullYear();
    const assets = await listCapitalAssets(businessId, taxYear);
    const totalDepreciation = await getTotalDepreciationForYear(businessId, taxYear);
    res.json({ assets, totalDepreciation, taxYear });
  } catch (err) {
    logError("GET /capital-assets error:", err.stack || err);
    res.status(500).json({ error: "Server error loading capital assets." });
  }
});

// GET /api/capital-assets/:assetId
router.get("/:assetId", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const asset = await getCapitalAsset(req.params.assetId, businessId);
    if (!asset) return res.status(404).json({ error: "Capital asset not found." });
    res.json(asset);
  } catch (err) {
    logError("GET /capital-assets/:assetId error:", err.stack || err);
    res.status(500).json({ error: "Server error loading capital asset." });
  }
});

// POST /api/capital-assets
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const { name, purchase_date, original_cost, asset_category, cca_class, macrs_class, tax_year } = body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required." });
  }
  if (!purchase_date) {
    return res.status(400).json({ error: "purchase_date is required." });
  }
  if (!original_cost || Number(original_cost) <= 0) {
    return res.status(400).json({ error: "original_cost must be a positive number." });
  }
  if (!asset_category || !VALID_ASSET_CATEGORIES.has(asset_category)) {
    return res.status(400).json({ error: `asset_category must be one of: ${[...VALID_ASSET_CATEGORIES].join(", ")}.` });
  }
  if (cca_class && !VALID_CCA_CLASSES.has(cca_class)) {
    return res.status(400).json({ error: `cca_class must be one of: ${[...VALID_CCA_CLASSES].join(", ")}.` });
  }
  if (macrs_class && !VALID_MACRS_CLASSES.has(macrs_class)) {
    return res.status(400).json({ error: `macrs_class must be one of: ${[...VALID_MACRS_CLASSES].join(", ")}.` });
  }
  if (!tax_year || !Number.isInteger(Number(tax_year)) || Number(tax_year) < 2010) {
    return res.status(400).json({ error: "tax_year must be a valid year (2010+)." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const region = await resolveBusinessRegion(businessId);

    const asset = await createCapitalAsset(businessId, {
      transactionId: body.transaction_id || null,
      name: String(name).trim(),
      purchaseDate: purchase_date,
      originalCost: Number(original_cost),
      assetCategory: asset_category,
      ccaClass: cca_class || null,
      macrsClass: macrs_class || null,
      section179Elected: body.section_179_elected === true,
      bonusDepreciationPct: body.bonus_depreciation_pct != null ? Number(body.bonus_depreciation_pct) : null,
      taxYear: Number(tax_year)
    }, region);

    invalidateCapitalAssetSnapshots(businessId);
    res.status(201).json(asset);
  } catch (err) {
    logError("POST /capital-assets error:", err.stack || err);
    res.status(500).json({ error: "Server error creating capital asset." });
  }
});

// PUT /api/capital-assets/:assetId
router.put("/:assetId", async (req, res) => {
  const body = req.body ?? {};

  if (body.asset_category && !VALID_ASSET_CATEGORIES.has(body.asset_category)) {
    return res.status(400).json({ error: `asset_category must be one of: ${[...VALID_ASSET_CATEGORIES].join(", ")}.` });
  }
  if (body.cca_class && !VALID_CCA_CLASSES.has(body.cca_class)) {
    return res.status(400).json({ error: `cca_class must be one of: ${[...VALID_CCA_CLASSES].join(", ")}.` });
  }
  if (body.macrs_class && !VALID_MACRS_CLASSES.has(body.macrs_class)) {
    return res.status(400).json({ error: `macrs_class must be one of: ${[...VALID_MACRS_CLASSES].join(", ")}.` });
  }
  if (body.original_cost != null && Number(body.original_cost) <= 0) {
    return res.status(400).json({ error: "original_cost must be a positive number." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const region = await resolveBusinessRegion(businessId);

    const asset = await updateCapitalAsset(req.params.assetId, businessId, {
      name: body.name,
      purchaseDate: body.purchase_date,
      originalCost: body.original_cost != null ? Number(body.original_cost) : undefined,
      assetCategory: body.asset_category,
      ccaClass: body.cca_class,
      macrsClass: body.macrs_class,
      section179Elected: body.section_179_elected,
      bonusDepreciationPct: body.bonus_depreciation_pct != null ? Number(body.bonus_depreciation_pct) : undefined,
      priorDepreciation: body.prior_depreciation != null ? Number(body.prior_depreciation) : undefined
    }, region);

    if (!asset) return res.status(404).json({ error: "Capital asset not found." });
    invalidateCapitalAssetSnapshots(businessId);
    res.json(asset);
  } catch (err) {
    logError("PUT /capital-assets/:assetId error:", err.stack || err);
    res.status(500).json({ error: "Server error updating capital asset." });
  }
});

// POST /api/capital-assets/:assetId/dispose
router.post("/:assetId/dispose", async (req, res) => {
  const { disposed_date } = req.body ?? {};
  if (!disposed_date) {
    return res.status(400).json({ error: "disposed_date is required." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const asset = await disposeCapitalAsset(req.params.assetId, businessId, disposed_date);
    if (!asset) return res.status(404).json({ error: "Capital asset not found." });
    invalidateCapitalAssetSnapshots(businessId);
    res.json(asset);
  } catch (err) {
    logError("POST /capital-assets/:assetId/dispose error:", err.stack || err);
    res.status(500).json({ error: "Server error disposing capital asset." });
  }
});

module.exports = router;
