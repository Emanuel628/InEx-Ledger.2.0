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
  getCcaClass,
  getMacrsRate,
  computeCcaDeduction,
  computeMacrsDeduction,
  computeRecoveryYear
};
