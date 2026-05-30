"use strict";

const DEFAULT_YEAR = 2026;

const TAX_FORM_THRESHOLDS_BY_YEAR = {
  2025: {
    US: { nec: 600, kAmount: 20000, kCount: 200 },
    CA: { t4a: 500 }
  },
  2026: {
    US: { nec: 2000, kAmount: 20000, kCount: 200 },
    CA: { t4a: 500 }
  }
};

function normalizeThresholdYear(value) {
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : DEFAULT_YEAR;
}

function getTaxFormThresholds(region, year) {
  const normalizedRegion = String(region || "US").trim().toUpperCase() === "CA" ? "CA" : "US";
  const normalizedYear = normalizeThresholdYear(year);
  const availableYears = Object.keys(TAX_FORM_THRESHOLDS_BY_YEAR).map(Number).sort((a, b) => a - b);
  const selectedYear = availableYears.includes(normalizedYear)
    ? normalizedYear
    : availableYears.filter((candidate) => candidate <= normalizedYear).pop() || availableYears[availableYears.length - 1];
  return TAX_FORM_THRESHOLDS_BY_YEAR[selectedYear][normalizedRegion];
}

module.exports = {
  DEFAULT_YEAR,
  TAX_FORM_THRESHOLDS_BY_YEAR,
  getTaxFormThresholds
};
