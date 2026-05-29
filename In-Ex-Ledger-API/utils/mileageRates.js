"use strict";

// IRS standard mileage rates (cents per mile → dollars)
// Source: IRS Notice 2026-10 (Jan 2026) — $0.725/mi for 2026
const IRS_MILEAGE_RATES = {
  2023: 0.655,
  2024: 0.670,
  2025: 0.700,
  2026: 0.725
};

// CRA per-km rates: [first 5000 km rate, rate after 5000 km]
// Source: CRA announcement Jan 14, 2026 — $0.73/km and $0.67/km for 2026
const CRA_MILEAGE_RATES = {
  2024: { first: 0.70, after: 0.64 },
  2025: { first: 0.72, after: 0.66 },
  2026: { first: 0.73, after: 0.67 }
};

function getIrsRate(taxYear) {
  const year = Number(taxYear);
  if (IRS_MILEAGE_RATES[year] != null) return IRS_MILEAGE_RATES[year];
  const years = Object.keys(IRS_MILEAGE_RATES).map(Number).sort((a, b) => b - a);
  return IRS_MILEAGE_RATES[years[0]];
}

function getCraRate(taxYear) {
  const year = Number(taxYear);
  if (CRA_MILEAGE_RATES[year]) return CRA_MILEAGE_RATES[year];
  const years = Object.keys(CRA_MILEAGE_RATES).map(Number).sort((a, b) => b - a);
  return CRA_MILEAGE_RATES[years[0]];
}

// Returns the per-unit rate for display/audit purposes.
// For CRA, returns the first-5000km rate; tiered computation is in vehicleClaimService.
function getRateForRegion(region, taxYear) {
  if (String(region).toUpperCase() === "CA") {
    return getCraRate(taxYear).first;
  }
  return getIrsRate(taxYear);
}

module.exports = { getIrsRate, getCraRate, getRateForRegion };
