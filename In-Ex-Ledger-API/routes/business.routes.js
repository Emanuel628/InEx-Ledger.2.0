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
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
const FISCAL_YEAR_START_RE = /^((0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;
const VALID_ACCOUNTING_METHODS = new Set(["cash", "accrual"]);
const VALID_GST_HST_METHODS = new Set(["regular", "quick"]);
const BUSINESS_SELECT = `SELECT id, name, region, language, fiscal_year_start, province,
                                business_type, tax_id, address, operating_name,
                                business_activity_code, accounting_method,
                                material_participation, gst_hst_registered,
                                gst_hst_number, gst_hst_method, created_at
                         FROM businesses
                         WHERE id = $1`;

function normalizeOptionalTrimmedString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

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
    operating_name: null,
    business_activity_code: null,
    accounting_method: null,
    material_participation: null,
    gst_hst_registered: false,
    gst_hst_number: null,
    gst_hst_method: null,
    ...row,
    tax_id: decryptTaxId(row.tax_id)
  };
}

async function fetchBusinessRow(businessId) {
  const result = await pool.query(BUSINESS_SELECT, [businessId]);
  return normalizeBusinessRow(result.rows[0] || null);
}

async function updateBusinessRow(businessId, payload) {
  const {
    name,
    region,
    language,
    fiscal_year_start,
    province,
    business_type,
    tax_id,
    address,
    operating_name,
    business_activity_code,
    accounting_method,
    material_participation,
    gst_hst_registered,
    gst_hst_number,
    gst_hst_method
  } = payload;
  const normalizedTaxId = normalizeOptionalTrimmedString(tax_id);
  const encryptedTaxId = normalizedTaxId ? encryptTaxId(normalizedTaxId) : null;
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
      normalizeOptionalTrimmedString(name),
      region || null,
      language || null,
      fiscal_year_start || null,
      province,
      business_type,
      encryptedTaxId,
      address,
      normalizeOptionalTrimmedString(operating_name),
      normalizeOptionalTrimmedString(business_activity_code),
      accounting_method || null,
      typeof material_participation === "boolean" ? material_participation : null,
      typeof gst_hst_registered === "boolean" ? gst_hst_registered : false,
      normalizeOptionalTrimmedString(gst_hst_number),
      gst_hst_method || null,
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
    res.status(500).json({ error: "A server error occurred while loading the business profile. Please try again or contact support if the problem persists." });
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
    address,
    operating_name,
    business_activity_code,
    accounting_method,
    material_participation,
    gst_hst_registered,
    gst_hst_number,
    gst_hst_method
  } = req.body ?? {};

  if (region && !VALID_REGIONS.has(region)) {
    return res.status(400).json({ error: "region must be 'US' or 'CA'" });
  }
  if (language && !VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "language must be 'en', 'es', or 'fr'" });
  }
  if (fiscal_year_start != null && fiscal_year_start !== "" && !FISCAL_YEAR_START_RE.test(String(fiscal_year_start))) {
    return res.status(400).json({ error: "fiscal_year_start must be in MM-DD format with valid month (01-12) and day (01-31)." });
  }
  if (accounting_method != null && accounting_method !== "" && !VALID_ACCOUNTING_METHODS.has(String(accounting_method).toLowerCase())) {
    return res.status(400).json({ error: "accounting_method must be 'cash' or 'accrual'" });
  }
  if (gst_hst_method != null && gst_hst_method !== "" && !VALID_GST_HST_METHODS.has(String(gst_hst_method).toLowerCase())) {
    return res.status(400).json({ error: "gst_hst_method must be 'regular' or 'quick'" });
  }
  if (material_participation != null && typeof material_participation !== "boolean") {
    return res.status(400).json({ error: "material_participation must be a boolean value." });
  }
  if (gst_hst_registered != null && typeof gst_hst_registered !== "boolean") {
    return res.status(400).json({ error: "gst_hst_registered must be a boolean value." });
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

    const body = req.body ?? {};
    const resolvedBusinessType = 'business_type' in body
      ? normalizeOptionalTrimmedString(business_type)
      : current.business_type;
    const resolvedTaxId = 'tax_id' in body ? (tax_id || null) : current.tax_id;
    const resolvedAddress = 'address' in body ? normalizeOptionalTrimmedString(address) : current.address;
    const resolvedOperatingName = 'operating_name' in body
      ? normalizeOptionalTrimmedString(operating_name)
      : current.operating_name;
    const resolvedBusinessActivityCode = 'business_activity_code' in body
      ? normalizeOptionalTrimmedString(business_activity_code)
      : current.business_activity_code;
    const resolvedAccountingMethod = 'accounting_method' in body
      ? normalizeOptionalTrimmedString(accounting_method)
      : current.accounting_method;
    const resolvedMaterialParticipation = 'material_participation' in body
      ? material_participation
      : current.material_participation;
    const resolvedGstHstRegistered = 'gst_hst_registered' in body
      ? gst_hst_registered
      : Boolean(current.gst_hst_registered);
    const resolvedGstHstNumber = 'gst_hst_number' in body
      ? normalizeOptionalTrimmedString(gst_hst_number)
      : current.gst_hst_number;
    const resolvedGstHstMethod = 'gst_hst_method' in body
      ? normalizeOptionalTrimmedString(gst_hst_method)
      : current.gst_hst_method;

    const updated = await updateBusinessRow(businessId, {
      name,
      region: resolvedRegion,
      language,
      fiscal_year_start,
      province: resolvedProvince,
      business_type: resolvedBusinessType,
      tax_id: resolvedTaxId,
      address: resolvedAddress,
      operating_name: resolvedOperatingName,
      business_activity_code: resolvedBusinessActivityCode,
      accounting_method: resolvedAccountingMethod,
      material_participation: resolvedMaterialParticipation,
      gst_hst_registered: resolvedGstHstRegistered,
      gst_hst_number: resolvedRegion === "CA" && resolvedGstHstRegistered ? resolvedGstHstNumber : null,
      gst_hst_method: resolvedRegion === "CA" && resolvedGstHstRegistered ? resolvedGstHstMethod : null
    });
    res.json(updated);
  } catch (err) {
    logError("PUT /business error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while updating the business profile. Please try again or contact support if the problem persists." });
  }
});

router.get("/accounting-lock", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const lock = await loadAccountingLockState(pool, businessId);
    res.json({ lock });
  } catch (err) {
    logError("GET /business/accounting-lock error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while loading the accounting lock. Please try again or contact support if the problem persists." });
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
    res.status(500).json({ error: "A server error occurred while updating the accounting lock. Please try again or contact support if the problem persists." });
  }
});

module.exports = router;
