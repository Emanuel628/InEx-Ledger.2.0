import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";

const router = express.Router();
router.use(requireAuth);

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);

/**
 * GET /api/business
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "SELECT id, name, region, language, fiscal_year_start, province, created_at FROM businesses WHERE id = $1",
      [businessId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /business error:", err.message);
    res.status(500).json({ error: "Failed to load business profile." });
  }
});

/**
 * PUT /api/business
 */
router.put("/", async (req, res) => {
  const { name, region, language, fiscal_year_start, province } = req.body ?? {};

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
    const result = await pool.query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           region = COALESCE($2, region),
           language = COALESCE($3, language),
           fiscal_year_start = COALESCE($4, fiscal_year_start),
           province = COALESCE($5, province)
       WHERE id = $6
       RETURNING id, name, region, language, fiscal_year_start, province, created_at`,
      [name?.trim() || null, region || null, language || null,
       fiscal_year_start || null, province || null, businessId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /business error:", err.message);
    res.status(500).json({ error: "Failed to update business profile." });
  }
});

export default router;
