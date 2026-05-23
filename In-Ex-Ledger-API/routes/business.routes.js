const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  normalizeDateOnly,
  loadAccountingLockState,
  saveAccountingLockState
} = require("../services/accountingLockService.js");
const { encryptTaxId, decryptTaxId } = require("../services/taxIdService.js");
const {
  encryptGstHstNumber,
  decryptGstHstNumber
} = require("../services/gstHstNumberService.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
const VALID_ACCOUNTING_METHODS = new Set(["cash", "accrual"]);
const VALID_GST_HST_METHODS = new Set(["regular", "quick"]);
const VALID_ENTITY_TYPES = new Set([
  "sole_proprietorship",
  "single_member_llc",
  "limited_liability_company",
  "corporation",
  "partnership"
]);

const BUSINESS_SELECT = `SELECT id, name, region, language, fiscal_year_start, province,
                                business_type, tax_id, address, operating_name,
                                business_activity_code, accounting_method,
                                material_participation, gst_hst_registered,
                                gst_hst_number, gst_hst_method, created_at
                         FROM businesses WHERE id = $1`;

function normalizeOptionalTrimmedString(value) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function normalizeBusinessRow(row) {
  if (!row) return row;
  return {
    fiscal_year_start: "01-01",
    province: null,
    business_type: null,
    tax_id: null,
    address: null,
    operating_name: null,
    business_activity_code: null,
    accounting_method: null,
    material_participation: null,
    gst_hst_registered: false,
    gst_hst_number: null,
    gst_hst_method: null,
    ...row,
    tax_id: decryptTaxId(row.tax_id),
    gst_hst_number: decryptGstHstNumber(row.gst_hst_number)
  };
}

async function fetchBusinessRow(businessId) {
  const result = await pool.query(BUSINESS_SELECT, [businessId]);
  return normalizeBusinessRow(result.rows[0] || null);
}

async function updateBusinessRow(businessId, payload) {
  const encryptedTaxId = payload.tax_id ? encryptTaxId(payload.tax_id) : null;
  const encryptedGstHstNumber = payload.gst_hst_number ? encryptGstHstNumber(payload.gst_hst_number) : null;

  const result = await pool.query(
    `UPDATE businesses
     SET name = COALESCE($1, name),
         region = COALESCE($2, region),
         language = COALESCE($3, language),
         fiscal_year_start = COALESCE($4, fiscal_year_start),
         province = $5,
         business_type = $6,
         tax_id = $7,
         address = $8,
         operating_name = $9,
         business_activity_code = $10,
         accounting_method = $11,
         material_participation = $12,
         gst_hst_registered = $13,
         gst_hst_number = $14,
         gst_hst_method = $15
     WHERE id = $16
     RETURNING id, name, region, language, fiscal_year_start, province,
               business_type, tax_id, address, operating_name,
               business_activity_code, accounting_method,
               material_participation, gst_hst_registered,
               gst_hst_number, gst_hst_method, created_at`,
    [
      payload.name,
      payload.region,
      payload.language,
      payload.fiscal_year_start,
      payload.province,
      payload.business_type,
      encryptedTaxId,
      payload.address,
      payload.operating_name,
      payload.business_activity_code,
      payload.accounting_method,
      payload.material_participation,
      payload.gst_hst_registered,
      encryptedGstHstNumber,
      payload.gst_hst_method,
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
    logError("GET /business error:", err.stack || err);
    res.status(500).json({ error: "Server error loading business profile." });
  }
});

/**
 * PUT /api/business
 */
router.put("/", async (req, res) => {
  const body = req.body ?? {};

  // --- Input validation ---
  if (body.region && !VALID_REGIONS.has(body.region)) {
    return res.status(400).json({ error: "Invalid region. Must be 'US' or 'CA'." });
  }
  if (body.language && !VALID_LANGUAGES.has(body.language)) {
    return res.status(400).json({ error: "language must be 'en', 'es', or 'fr'." });
  }
  if (body.accounting_method && !VALID_ACCOUNTING_METHODS.has(body.accounting_method.toLowerCase())) {
    return res.status(400).json({ error: "Invalid accounting method. Must be 'cash' or 'accrual'." });
  }
  if (body.business_activity_code && !/^[0-9]{6}$/.test(body.business_activity_code)) {
    return res.status(400).json({ error: "Business Activity Code must be a 6-digit NAICS code." });
  }
  if (body.business_type && !VALID_ENTITY_TYPES.has(body.business_type)) {
    return res.status(400).json({ error: "Invalid legal entity structure." });
  }
  if (body.gst_hst_method && !VALID_GST_HST_METHODS.has(body.gst_hst_method.toLowerCase())) {
    return res.status(400).json({ error: "gst_hst_method must be 'regular' or 'quick'." });
  }
  if (body.material_participation != null && typeof body.material_participation !== "boolean") {
    return res.status(400).json({ error: "material_participation must be a boolean value." });
  }
  if (body.gst_hst_registered != null && typeof body.gst_hst_registered !== "boolean") {
    return res.status(400).json({ error: "gst_hst_registered must be a boolean value." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const current = await fetchBusinessRow(businessId);
    if (!current) return res.status(404).json({ error: "Business not found." });

    const region = (body.region || current.region || "US").toUpperCase();
    const businessType = body.business_type || current.business_type;

    // Geographic structural compliance: Single-Member LLC is a US-only classification
    if (region === "CA" && businessType === "single_member_llc") {
      return res.status(400).json({ error: "Single-Member LLC is not a valid CRA tax classification for Canada." });
    }

    // CA requires a valid province code
    const province = region === "CA"
      ? String(body.province || current.province || "").toUpperCase() || null
      : null;
    if (region === "CA" && !province) {
      return res.status(400).json({ error: "Province is required for Canadian businesses." });
    }
    if (province && !CA_PROVINCES.has(province)) {
      return res.status(400).json({ error: "Invalid Canadian province code." });
    }

    // Sole proprietorships must use the standard calendar fiscal year (Jan 1 start)
    // This applies in both the US (Schedule C requires calendar year for most filers)
    // and Canada (T2125 sole props use Dec 31 year-end = Jan 1 start).
    let fiscalYearStart = ('fiscal_year_start' in body)
      ? normalizeOptionalTrimmedString(body.fiscal_year_start)
      : current.fiscal_year_start;
    if (businessType === "sole_proprietorship" && fiscalYearStart !== "01-01") {
      fiscalYearStart = "01-01";
    }

    if (region === "CA" && !fiscalYearStart) {
      return res.status(400).json({ error: "fiscal_year_start is required for Canadian businesses." });
    }

    const resolvedAccountingMethod = ('accounting_method' in body)
      ? String(body.accounting_method || "").toLowerCase()
      : current.accounting_method;
    if (!resolvedAccountingMethod) {
      return res.status(400).json({ error: "accounting_method is required." });
    }

    const resolvedMaterialParticipation = ('material_participation' in body)
      ? body.material_participation
      : current.material_participation;
    if (region === "US" && typeof resolvedMaterialParticipation !== "boolean") {
      return res.status(400).json({ error: "material_participation is required for US businesses." });
    }

    // Resolve GST/HST fields using the final registered state, not the raw body value,
    // so that a partial profile update does not wipe existing registration details.
    const resolvedGstHstRegistered = typeof body.gst_hst_registered === "boolean"
      ? body.gst_hst_registered
      : Boolean(current.gst_hst_registered);
    const resolvedGstHstNumber = resolvedGstHstRegistered
      ? ('gst_hst_number' in body ? normalizeOptionalTrimmedString(body.gst_hst_number) : current.gst_hst_number)
      : null;
    const resolvedGstHstMethod = resolvedGstHstRegistered
      ? ('gst_hst_method' in body ? normalizeOptionalTrimmedString(body.gst_hst_method) : current.gst_hst_method)
      : null;

    const payload = {
      name: normalizeOptionalTrimmedString(body.name) || current.name,
      region,
      language: body.language || current.language,
      fiscal_year_start: fiscalYearStart,
      province,
      business_type: businessType,
      tax_id: 'tax_id' in body ? normalizeOptionalTrimmedString(body.tax_id) : current.tax_id,
      address: 'address' in body ? normalizeOptionalTrimmedString(body.address) : current.address,
      operating_name: 'operating_name' in body
        ? normalizeOptionalTrimmedString(body.operating_name)
        : current.operating_name,
      business_activity_code: 'business_activity_code' in body
        ? normalizeOptionalTrimmedString(body.business_activity_code)
        : current.business_activity_code,
      accounting_method: resolvedAccountingMethod,
      material_participation: resolvedMaterialParticipation,
      gst_hst_registered: resolvedGstHstRegistered,
      gst_hst_number: region === "CA" ? resolvedGstHstNumber : null,
      gst_hst_method: region === "CA" ? resolvedGstHstMethod : null
    };

    res.json(await updateBusinessRow(businessId, payload));
  } catch (err) {
    logError("PUT /business error:", err.stack || err);
    res.status(500).json({ error: "Server error updating profile." });
  }
});

router.get("/accounting-lock", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const lock = await loadAccountingLockState(pool, businessId);
    res.json({ lock });
  } catch (err) {
    logError("GET /business/accounting-lock error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while loading the accounting lock." });
  }
});

router.put("/accounting-lock", async (req, res) => {
  const { locked_through_date, note } = req.body ?? {};
  try {
    const normalizedLockDate = normalizeDateOnly(locked_through_date);
    const businessId = await resolveBusinessIdForUser(req.user);
    const lock = await saveAccountingLockState(pool, businessId, req.user.id, {
      lockedThroughDate: normalizedLockDate,
      note
    });
    res.json({ lock, locked: lock?.isLocked ?? false });
  } catch (err) {
    if (err.message === "Date value is invalid.") {
      return res.status(400).json({ error: "locked_through_date must be a valid date." });
    }
    logError("PUT /business/accounting-lock error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while updating the accounting lock." });
  }
});

module.exports = router;
