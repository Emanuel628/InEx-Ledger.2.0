"use strict";

// CCA class definitions (Canada)
// declining-balance rate; Class 12 and Class 14.1 are special
// halfYearExempt: true means the class is NOT subject to the CRA half-year rule
// and the full eligible UCC is deductible in the acquisition year.
// Source: CRA T4002 Chapter 4 — Class 12 (most small tools) is explicitly exempt.
const CCA_CLASSES = {
  "Class 8":    { rate: 0.20, halfYearExempt: false, description: "Miscellaneous equipment and tools" },
  "Class 10":   { rate: 0.30, halfYearExempt: false, description: "Vehicles (automobiles, trucks)" },
  "Class 12":   { rate: 1.00, halfYearExempt: true,  description: "Small tools and software (< $500 threshold)" },
  "Class 50":   { rate: 0.55, halfYearExempt: false, description: "Computers and electronic data processing equipment" },
  "Class 14.1": { rate: 0.05, halfYearExempt: false, description: "Intangibles (goodwill, customer lists)" }
};

// MACRS depreciation percentages by class and recovery year (half-year convention)
const MACRS_TABLES = {
  "5-year": [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576],
  "7-year": [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446]
};

// Section 179 annual deduction limits and phase-out thresholds.
// OBBBA (signed July 4, 2025) raised the limit to $2,500,000 effective for
// property placed in service after December 31, 2024. Indexed for inflation.
// Source: IRS Rev. Proc. 2025-28; OBBBA §130101.
const SECTION_179_LIMITS = {
  2022: { limit: 1080000, phaseout: 2700000 },
  2023: { limit: 1160000, phaseout: 2890000 },
  2024: { limit: 1220000, phaseout: 3050000 },
  2025: { limit: 2500000, phaseout: 4000000 }, // OBBBA effective Dec 31 2024
  2026: { limit: 2560000, phaseout: 4090000 }
};

// Bonus depreciation rates by placed-in-service year.
// TCJA phase-down: 100% (2018-2022) → 80% (2023) → 60% (2024) → 40% (2025 partial).
// OBBBA (July 4, 2025) reinstated 100% for qualified property placed in service
// after January 19, 2025, permanently.
// Source: IRC §168(k) as amended by OBBBA §130102.
const BONUS_DEPRECIATION_RATES = {
  2018: 100, 2019: 100, 2020: 100, 2021: 100, 2022: 100,
  2023: 80,
  2024: 60,
  2025: 40,
  2026: 100
};

const OBBBA_BONUS_REINSTATEMENT_START = Date.UTC(2025, 0, 20);

function getSection179Limit(taxYear) {
  const year = Number(taxYear);
  if (SECTION_179_LIMITS[year]) return SECTION_179_LIMITS[year];
  const years = Object.keys(SECTION_179_LIMITS).map(Number).sort((a, b) => b - a);
  return SECTION_179_LIMITS[years[0]];
}

function normalizeYearFallback(year) {
  if (BONUS_DEPRECIATION_RATES[year] != null) return BONUS_DEPRECIATION_RATES[year];
  const years = Object.keys(BONUS_DEPRECIATION_RATES).map(Number).sort((a, b) => b - a);
  return BONUS_DEPRECIATION_RATES[years[0]];
}

function parsePlacedInServiceDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (typeof input === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  return null;
}

function getBonusDepreciationRate(placedInServiceInput) {
  const placedInServiceDate = parsePlacedInServiceDate(placedInServiceInput);
  if (placedInServiceDate) {
    const year = placedInServiceDate.getUTCFullYear();
    if (year !== 2025) return normalizeYearFallback(year);
    return placedInServiceDate.getTime() >= OBBBA_BONUS_REINSTATEMENT_START ? 100 : 40;
  }

  const year = Number(placedInServiceInput);
  if (year === 2025) {
    throw new Error("placed-in-service date is required to determine 2025 bonus depreciation");
  }
  if (Number.isFinite(year)) return normalizeYearFallback(year);

  const years = Object.keys(BONUS_DEPRECIATION_RATES).map(Number).sort((a, b) => b - a);
  return BONUS_DEPRECIATION_RATES[years[0]];
}

function getCcaClass(className) {
  return CCA_CLASSES[className] || null;
}

function getMacrsRate(macrsClass, recoveryYear) {
  const table = MACRS_TABLES[macrsClass];
  if (!table) return 0;
  const idx = Math.max(0, Number(recoveryYear) - 1);
  return idx < table.length ? table[idx] : 0;
}

// Compute CCA deduction for a single tax year using declining-balance + half-year rule.
// Half-year rule: in acquisition year, only 50% of UCC is eligible for CCA.
// Exception: classes with halfYearExempt=true (e.g. Class 12 small tools) are fully
// deductible in the acquisition year with no 50% restriction.
function computeCcaDeduction(options = {}) {
  const { originalCost, priorDepreciation, ccaClass, isFirstYear } = options;
  const classInfo = getCcaClass(ccaClass);
  if (!classInfo) return 0;
  const ucc = Math.max(0, Number(originalCost) - Number(priorDepreciation));
  const applyHalfYear = isFirstYear && !classInfo.halfYearExempt;
  const eligibleUcc = applyHalfYear ? ucc * 0.5 : ucc;
  const deduction = Number((eligibleUcc * classInfo.rate).toFixed(2));
  return deduction;
}

// Derive the current MACRS recovery year from accumulated prior depreciation.
// Replaces the unreliable /7 heuristic in capitalAssetService — that formula
// assumed a 7-year class and produced wrong years from year 3 onward for all
// other class lengths.
// section179Amount and bonusDepreciationPct: amounts taken before MACRS rates applied.
function computeRecoveryYear(priorDepreciation, originalCost, macrsClass, section179Amount, bonusDepreciationPct) {
  if (Number(priorDepreciation) <= 0) return 1;

  const cost = Number(originalCost);
  const s179 = Math.min(Number(section179Amount || 0), cost);
  const basisAfterS179 = cost - s179;
  const bonusAmt = basisAfterS179 * (Number(bonusDepreciationPct || 0) / 100);
  const macrsBasis = basisAfterS179 - bonusAmt;

  if (macrsBasis <= 0) return 1; // fully covered by §179 + bonus; no MACRS years remain

  // How much of the MACRS table has been consumed?
  const macrsPriorDep = Math.max(0, Number(priorDepreciation) - s179 - bonusAmt);
  const priorPct = macrsPriorDep / macrsBasis;

  const table = MACRS_TABLES[macrsClass] || MACRS_TABLES["7-year"];
  let accumulated = 0;
  for (let i = 0; i < table.length; i++) {
    accumulated += table[i];
    if (priorPct <= accumulated + 0.0001) {
      return i + 2; // i is 0-indexed; +1 for 1-based year; +1 for the next (current) year
    }
  }
  return table.length; // asset is in its final recovery year
}

// Compute MACRS deduction for a single recovery year.
// Section 179 is applied before MACRS: reduces the depreciable basis.
function computeMacrsDeduction(options = {}) {
  const { originalCost, macrsClass, recoveryYear, section179Amount, bonusDepreciationPct } = options;
  const cost = Number(originalCost);
  const s179 = Math.min(Number(section179Amount || 0), cost);
  let basis = cost - s179;

  if (bonusDepreciationPct > 0) {
    const bonus = Number((basis * (Number(bonusDepreciationPct) / 100)).toFixed(2));
    basis = basis - bonus;
    if (Number(recoveryYear) === 1) {
      return Number((s179 + bonus + basis * getMacrsRate(macrsClass, 1)).toFixed(2));
    }
  }

  const rate = getMacrsRate(macrsClass, recoveryYear);
  return Number((s179 * (Number(recoveryYear) === 1 ? 1 : 0) + basis * rate).toFixed(2));
}

module.exports = {
  CCA_CLASSES,
  MACRS_TABLES,
  SECTION_179_LIMITS,
  BONUS_DEPRECIATION_RATES,
  getCcaClass,
  getMacrsRate,
  getSection179Limit,
  getBonusDepreciationRate,
  computeCcaDeduction,
  computeMacrsDeduction,
  computeRecoveryYear
};
