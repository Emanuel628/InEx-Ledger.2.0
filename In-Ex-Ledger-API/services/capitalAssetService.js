"use strict";

const { pool } = require("../db.js");
const { computeCcaDeduction, computeMacrsDeduction, computeRecoveryYear, getCcaClass } = require("../utils/depreciationSchedules.js");

async function listCapitalAssets(businessId, taxYear) {
  const result = await pool.query(
    `SELECT * FROM capital_assets
     WHERE business_id = $1 AND tax_year = $2
     ORDER BY purchase_date ASC, name ASC`,
    [businessId, taxYear]
  );
  return result.rows;
}

async function getCapitalAsset(assetId, businessId) {
  const result = await pool.query(
    `SELECT * FROM capital_assets WHERE id = $1 AND business_id = $2`,
    [assetId, businessId]
  );
  return result.rows[0] || null;
}

// Compute depreciation for an asset based on region, and update the stored values.
// region: 'US' or 'CA'
function computeDepreciation(asset, region) {
  const normalizedRegion = String(region || "US").toUpperCase();
  const originalCost = Number(asset.original_cost);
  const priorDepreciation = Number(asset.prior_depreciation || 0);
  const isFirstYear = priorDepreciation === 0;

  if (normalizedRegion === "CA") {
    const deduction = computeCcaDeduction({
      originalCost,
      priorDepreciation,
      ccaClass: asset.cca_class,
      isFirstYear
    });
    const remainingBasis = Math.max(0, originalCost - priorDepreciation - deduction);
    return { currentYearDepreciation: deduction, remainingBasis };
  }

  // US MACRS — derive recovery year from accumulated depreciation and class table.
  const recoveryYear = computeRecoveryYear(
    priorDepreciation,
    originalCost,
    asset.macrs_class || "7-year",
    asset.section_179_elected ? originalCost : 0,
    asset.bonus_depreciation_pct || 0
  );
  const deduction = computeMacrsDeduction({
    originalCost,
    macrsClass: asset.macrs_class || "7-year",
    recoveryYear,
    section179Amount: asset.section_179_elected ? originalCost : 0,
    bonusDepreciationPct: asset.bonus_depreciation_pct || 0
  });
  const remainingBasis = Math.max(0, originalCost - priorDepreciation - deduction);
  return { currentYearDepreciation: deduction, remainingBasis };
}

async function createCapitalAsset(businessId, data, region) {
  const {
    transactionId,
    name,
    purchaseDate,
    originalCost,
    assetCategory,
    ccaClass,
    macrsClass,
    section179Elected,
    bonusDepreciationPct,
    taxYear
  } = data;

  // Auto-derive CCA rate from class if not provided
  let ccaRate = null;
  if (ccaClass) {
    const classInfo = getCcaClass(ccaClass);
    ccaRate = classInfo ? classInfo.rate : null;
  }

  const insertResult = await pool.query(
    `INSERT INTO capital_assets
       (business_id, transaction_id, name, purchase_date, original_cost,
        asset_category, cca_class, cca_rate, macrs_class,
        section_179_elected, bonus_depreciation_pct,
        prior_depreciation, current_year_depreciation, remaining_basis, tax_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,$5,$12)
     RETURNING *`,
    [
      businessId,
      transactionId || null,
      name,
      purchaseDate,
      originalCost,
      assetCategory,
      ccaClass || null,
      ccaRate,
      macrsClass || null,
      section179Elected === true,
      bonusDepreciationPct || null,
      taxYear
    ]
  );

  const asset = insertResult.rows[0];
  const { currentYearDepreciation, remainingBasis } = computeDepreciation(asset, region);

  const updateResult = await pool.query(
    `UPDATE capital_assets
     SET current_year_depreciation = $1, remaining_basis = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [currentYearDepreciation, remainingBasis, asset.id]
  );
  return updateResult.rows[0];
}

async function updateCapitalAsset(assetId, businessId, data, region) {
  const current = await getCapitalAsset(assetId, businessId);
  if (!current) return null;

  const merged = {
    ...current,
    name: data.name ?? current.name,
    purchase_date: data.purchaseDate ?? current.purchase_date,
    original_cost: data.originalCost ?? current.original_cost,
    asset_category: data.assetCategory ?? current.asset_category,
    cca_class: data.ccaClass ?? current.cca_class,
    macrs_class: data.macrsClass ?? current.macrs_class,
    section_179_elected: data.section179Elected ?? current.section_179_elected,
    bonus_depreciation_pct: data.bonusDepreciationPct ?? current.bonus_depreciation_pct,
    prior_depreciation: data.priorDepreciation ?? current.prior_depreciation
  };

  if (merged.cca_class) {
    const classInfo = getCcaClass(merged.cca_class);
    merged.cca_rate = classInfo ? classInfo.rate : merged.cca_rate;
  }

  const { currentYearDepreciation, remainingBasis } = computeDepreciation(merged, region);

  const result = await pool.query(
    `UPDATE capital_assets SET
       name = $1, purchase_date = $2, original_cost = $3, asset_category = $4,
       cca_class = $5, cca_rate = $6, macrs_class = $7,
       section_179_elected = $8, bonus_depreciation_pct = $9,
       prior_depreciation = $10, current_year_depreciation = $11,
       remaining_basis = $12, updated_at = NOW()
     WHERE id = $13 AND business_id = $14
     RETURNING *`,
    [
      merged.name, merged.purchase_date, merged.original_cost, merged.asset_category,
      merged.cca_class, merged.cca_rate, merged.macrs_class,
      merged.section_179_elected, merged.bonus_depreciation_pct,
      merged.prior_depreciation, currentYearDepreciation, remainingBasis,
      assetId, businessId
    ]
  );
  return result.rows[0] || null;
}

async function disposeCapitalAsset(assetId, businessId, disposedDate) {
  const result = await pool.query(
    `UPDATE capital_assets
     SET is_disposed = TRUE, disposed_date = $1, updated_at = NOW()
     WHERE id = $2 AND business_id = $3
     RETURNING *`,
    [disposedDate, assetId, businessId]
  );
  return result.rows[0] || null;
}

// Sum current-year depreciation across all active assets for P&L integration.
async function getTotalDepreciationForYear(businessId, taxYear) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(current_year_depreciation), 0) AS total
     FROM capital_assets
     WHERE business_id = $1 AND tax_year = $2 AND is_disposed = FALSE`,
    [businessId, taxYear]
  );
  return Number(result.rows[0]?.total || 0);
}

module.exports = {
  listCapitalAssets,
  getCapitalAsset,
  createCapitalAsset,
  updateCapitalAsset,
  disposeCapitalAsset,
  getTotalDepreciationForYear,
  computeDepreciation
};
