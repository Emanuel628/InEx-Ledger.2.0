"use strict";

// CCA class definitions (Canada)
// declining-balance rate; Class 12 and Class 14.1 are special
const CCA_CLASSES = {
  "Class 8":  { rate: 0.20, description: "Miscellaneous equipment and tools" },
  "Class 10": { rate: 0.30, description: "Vehicles (automobiles, trucks)" },
  "Class 12": { rate: 1.00, description: "Small tools and software (< $500 threshold)" },
  "Class 50": { rate: 0.55, description: "Computers and electronic data processing equipment" },
  "Class 14.1": { rate: 0.05, description: "Intangibles (goodwill, customer lists)" }
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
function computeCcaDeduction(options = {}) {
  const { originalCost, priorDepreciation, ccaClass, isFirstYear } = options;
  const classInfo = getCcaClass(ccaClass);
  if (!classInfo) return 0;
  const ucc = Math.max(0, Number(originalCost) - Number(priorDepreciation));
  const eligibleUcc = isFirstYear ? ucc * 0.5 : ucc;
  const deduction = Number((eligibleUcc * classInfo.rate).toFixed(2));
  return deduction;
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
  computeMacrsDeduction
};
