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
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");

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
                                business_type, tax_id, address, contact_full_name, operating_name,
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
    contact_full_name: "",
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
         contact_full_name = $9,
         operating_name = $10,
         business_activity_code = $11,
         accounting_method = $12,
         material_participation = $13,
         gst_hst_registered = $14,
         gst_hst_number = $15,
         gst_hst_method = $16
     WHERE id = $17
     RETURNING id, name, region, language, fiscal_year_start, province,
               business_type, tax_id, address, contact_full_name, operating_name,
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
      payload.contact_full_name,
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
router.get("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  res.json(await fetchBusinessRow(businessId));
}));

/**
 * PUT /api/business
 */
router.put("/", asyncRoute(async (req, res) => {
  const body = req.body ?? {};

  // --- Input validation ---
  if (body.region && !VALID_REGIONS.has(body.region)) {
    throw new ApiError(400, "Invalid region. Must be 'US' or 'CA'.");
  }
  if (body.language && !VALID_LANGUAGES.has(body.language)) {
    throw new ApiError(400, "language must be 'en', 'es', or 'fr'.");
  }
  if (body.accounting_method && !VALID_ACCOUNTING_METHODS.has(body.accounting_method.toLowerCase())) {
    throw new ApiError(400, "Invalid accounting method. Must be 'cash' or 'accrual'.");
  }
  if (body.business_activity_code && !/^[0-9]{6}$/.test(body.business_activity_code)) {
    throw new ApiError(400, "Business Activity Code must be a 6-digit NAICS code.");
  }
  if (body.business_type && !VALID_ENTITY_TYPES.has(body.business_type)) {
    throw new ApiError(400, "Invalid legal entity structure.");
  }
  if (body.gst_hst_method && !VALID_GST_HST_METHODS.has(body.gst_hst_method.toLowerCase())) {
    throw new ApiError(400, "gst_hst_method must be 'regular' or 'quick'.");
  }
  if (body.material_participation != null && typeof body.material_participation !== "boolean") {
    throw new ApiError(400, "material_participation must be a boolean value.");
  }
  if (body.gst_hst_registered != null && typeof body.gst_hst_registered !== "boolean") {
    throw new ApiError(400, "gst_hst_registered must be a boolean value.");
  }

  const businessId = await resolveBusinessIdForUser(req.user);
  const current = await fetchBusinessRow(businessId);
  if (!current) {
    throw new ApiError(404, "Business not found.");
  }

  const region = (body.region || current.region || "US").toUpperCase();
  const businessType = body.business_type || current.business_type;

  // Geographic structural compliance: Single-Member LLC is a US-only classification
  if (region === "CA" && businessType === "single_member_llc") {
    throw new ApiError(400, "Single-Member LLC is not a valid CRA tax classification for Canada.");
  }

  // CA requires a valid province code
  const province = region === "CA"
    ? String(body.province || current.province || "").toUpperCase() || null
    : null;
  if (region === "CA" && !province) {
    throw new ApiError(400, "Province is required for Canadian businesses.");
  }
  if (province && !CA_PROVINCES.has(province)) {
    throw new ApiError(400, "Invalid Canadian province code.");
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
    throw new ApiError(400, "fiscal_year_start is required for Canadian businesses.");
  }

  const resolvedAccountingMethod = ('accounting_method' in body)
    ? normalizeOptionalTrimmedString(String(body.accounting_method || "").toLowerCase())
    : current.accounting_method;

  const resolvedContactFullName = ('contact_full_name' in body)
    ? normalizeOptionalTrimmedString(body.contact_full_name)
    : current.contact_full_name;
  if (!resolvedContactFullName) {
    throw new ApiError(400, "contact_full_name is required.");
  }

  const resolvedMaterialParticipation = ('material_participation' in body)
    ? body.material_participation
    : current.material_participation;
  if (region === "US" && typeof resolvedMaterialParticipation !== "boolean") {
    throw new ApiError(400, "material_participation is required for US businesses.");
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
    contact_full_name: resolvedContactFullName,
    operating_name: 'operating_name' in body
      ? normalizeOptionalTrimmedString(body.operating_name)
      : current.operating_name,
    business_activity_code: 'business_activity_code' in body
      ? normalizeOptionalTrimmedString(body.business_activity_code)
      : current.business_activity_code,
    accounting_method: resolvedAccountingMethod || null,
    material_participation: resolvedMaterialParticipation,
    gst_hst_registered: resolvedGstHstRegistered,
    gst_hst_number: region === "CA" ? resolvedGstHstNumber : null,
    gst_hst_method: region === "CA" ? resolvedGstHstMethod : null
  };

  let updated;
  try {
    updated = await updateBusinessRow(businessId, payload);
  } catch (err) {
    const constraint = err.constraint || "";
    if (constraint === "chk_business_activity_code") {
      throw new ApiError(400, "Business Activity Code must be exactly 6 digits (e.g. 541511).");
    }
    if (constraint === "chk_business_type") {
      throw new ApiError(400, "The selected entity type is not valid for this region.");
    }
    if (constraint === "chk_ca_entity_match") {
      throw new ApiError(400, "Single-member LLC is not a recognized entity type in Canada. Use Sole Proprietorship or another supported type.");
    }
    throw err;
  }

  void invalidateSnapshotsForBusiness({
    businessId,
    reason: "Business filing profile changed after export."
  }).catch((error) => logError("Business snapshot invalidation failed:", error));
  res.json(updated);
}));

router.get("/accounting-lock", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const lock = await loadAccountingLockState(pool, businessId);
  res.json({ lock });
}));

router.put("/accounting-lock", asyncRoute(async (req, res) => {
  const { locked_through_date, note } = req.body ?? {};

  let normalizedLockDate;
  try {
    normalizedLockDate = normalizeDateOnly(locked_through_date);
  } catch (err) {
    if (err.message === "Date value is invalid.") {
      throw new ApiError(400, "locked_through_date must be a valid date.");
    }
    throw err;
  }

  const businessId = await resolveBusinessIdForUser(req.user);
  const lock = await saveAccountingLockState(pool, businessId, req.user.id, {
    lockedThroughDate: normalizedLockDate,
    note
  });
  res.json({ lock, locked: lock?.isLocked ?? false });
}));

module.exports = router;
