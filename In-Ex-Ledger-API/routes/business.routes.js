const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { encryptTaxId, decryptTaxId } = require("../services/taxIdService.js");

const router = express.Router();
router.use(requireAuth);

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
const BUSINESS_SELECT = `SELECT id, name, region, language, fiscal_year_start, province,
                                business_type, tax_id, address, created_at
                         FROM businesses
                         WHERE id = $1`;

function normalizeBusinessRow(row) {
  if (!row) {
    return row;
  }

  return {
    fiscal_year_start: "01-01",
    province: null,
    business_type: null,
    tax_id: null,
    address: null,
    ...row,
    tax_id: decryptTaxId(row.tax_id)
  };
}

async function fetchBusinessRow(businessId) {
  const result = await pool.query(BUSINESS_SELECT, [businessId]);
  return normalizeBusinessRow(result.rows[0] || null);
}

async function updateBusinessRow(businessId, payload) {
  const { name, region, language, fiscal_year_start, province, business_type, tax_id, address } = payload;
  const encryptedTaxId = tax_id?.trim() ? encryptTaxId(tax_id.trim()) : null;
  const result = await pool.query(
    `UPDATE businesses
     SET name = COALESCE($1, name),
         region = COALESCE($2, region),
         language = COALESCE($3, language),
         fiscal_year_start = COALESCE($4, fiscal_year_start),
         province = $5,
         business_type = COALESCE($6, business_type),
         tax_id = COALESCE($7, tax_id),
         address = COALESCE($8, address)
     WHERE id = $9
     RETURNING id, name, region, language, fiscal_year_start, province,
               business_type, tax_id, address, created_at`,
    [
      name?.trim() || null,
      region || null,
      language || null,
      fiscal_year_start || null,
      province,
      business_type?.trim() || null,
      encryptedTaxId,
      address?.trim() || null,
      businessId
    ]
  );

  return normalizeBusinessRow(result.rows[0] || null);
}

/**
 * GET /api/business
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    res.json(await fetchBusinessRow(businessId));
  } catch (err) {
    console.error("GET /business error:", err.message);
    res.status(500).json({ error: err.message || "Failed to load business profile." });
  }
});

/**
 * PUT /api/business
 */
router.put("/", async (req, res) => {
  const {
    name,
    region,
    language,
    fiscal_year_start,
    province,
    business_type,
    tax_id,
    address
  } = req.body ?? {};

  if (region && !VALID_REGIONS.has(region)) {
    return res.status(400).json({ error: "region must be 'US' or 'CA'" });
  }
  if (language && !VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "language must be 'en', 'es', or 'fr'" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const current = await fetchBusinessRow(businessId);
    if (!current) {
      return res.status(404).json({ error: "Business not found." });
    }

    const resolvedRegion = String(region || current.region || "US").toUpperCase();
    const resolvedProvince = resolvedRegion === "CA"
      ? String(province || current.province || "").toUpperCase() || null
      : null;

    if (resolvedProvince && !CA_PROVINCES.has(resolvedProvince)) {
      return res.status(400).json({ error: "Invalid Canadian province code" });
    }
    if (resolvedRegion === "CA" && !resolvedProvince) {
      return res.status(400).json({ error: "Province is required for Canadian businesses." });
    }

    const updated = await updateBusinessRow(businessId, {
      name,
      region: resolvedRegion,
      language,
      fiscal_year_start,
      province: resolvedProvince,
      business_type,
      tax_id,
      address
    });
    res.json(updated);
  } catch (err) {
    console.error("PUT /business error:", err.message);
    res.status(500).json({ error: err.message || "Failed to update business profile." });
  }
});

module.exports = router;
