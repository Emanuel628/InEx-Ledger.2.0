const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);

async function fetchBusinessRow(businessId) {
  try {
    const result = await pool.query(
      `SELECT id, name, region, language, fiscal_year_start, province,
              business_type, tax_id, address, created_at
       FROM businesses
       WHERE id = $1`,
      [businessId]
    );
    return result.rows[0];
  } catch (err) {
    if (err?.code !== "42703") throw err;

    const result = await pool.query(
      `SELECT id, name, region, language, fiscal_year_start, province, created_at
       FROM businesses
       WHERE id = $1`,
      [businessId]
    );
    const row = result.rows[0];
    return row ? { ...row, business_type: null, tax_id: null, address: null } : row;
  }
}

async function updateBusinessRow(businessId, payload) {
  const { name, region, language, fiscal_year_start, province, business_type, tax_id, address } = payload;

  try {
    const result = await pool.query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           region = COALESCE($2, region),
           language = COALESCE($3, language),
           fiscal_year_start = COALESCE($4, fiscal_year_start),
           province = CASE
             WHEN COALESCE($2, region) = 'US' THEN NULL
             WHEN $5 IS NOT NULL THEN $5
             ELSE province
           END,
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
        province || null,
        business_type?.trim() || null,
        tax_id?.trim() || null,
        address?.trim() || null,
        businessId
      ]
    );
    return result.rows[0];
  } catch (err) {
    if (err?.code !== "42703") throw err;
  }

  try {
    const result = await pool.query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           region = COALESCE($2, region),
           language = COALESCE($3, language),
           fiscal_year_start = COALESCE($4, fiscal_year_start),
           province = CASE
             WHEN COALESCE($2, region) = 'US' THEN NULL
             WHEN $5 IS NOT NULL THEN $5
             ELSE province
           END
       WHERE id = $6
       RETURNING id, name, region, language, fiscal_year_start, province, created_at`,
      [
        name?.trim() || null,
        region || null,
        language || null,
        fiscal_year_start || null,
        province || null,
        businessId
      ]
    );
    const row = result.rows[0];
    return row ? { ...row, business_type: null, tax_id: null, address: null } : row;
  } catch (err) {
    if (err?.code !== "42703") throw err;
  }

  const result = await pool.query(
    `UPDATE businesses
     SET name = COALESCE($1, name),
         region = COALESCE($2, region),
         language = COALESCE($3, language),
         fiscal_year_start = COALESCE($4, fiscal_year_start)
     WHERE id = $5
     RETURNING id, name, region, language, fiscal_year_start, created_at`,
    [
      name?.trim() || null,
      region || null,
      language || null,
      fiscal_year_start || null,
      businessId
    ]
  );
  const row = result.rows[0];
  return row ? { ...row, province: null, business_type: null, tax_id: null, address: null } : row;
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
    res.status(500).json({ error: "Failed to load business profile." });
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
  if (province && !CA_PROVINCES.has(province)) {
    return res.status(400).json({ error: "Invalid Canadian province code" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    res.json(
      await updateBusinessRow(businessId, {
        name,
        region,
        language,
        fiscal_year_start,
        province,
        business_type,
        tax_id,
        address
      })
    );
  } catch (err) {
    console.error("PUT /business error:", err.message);
    res.status(500).json({ error: "Failed to update business profile." });
  }
});

module.exports = router;
