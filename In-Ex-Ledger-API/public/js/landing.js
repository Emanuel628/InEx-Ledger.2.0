const LANDING_REGION_COPY = {
  US: {
    heroKicker: "BOOKKEEPING FOR SOLO BUSINESSES IN THE U.S. AND CANADA",
    heroLede: "Import transactions, attach receipts, send invoices, and fix the few items that actually need attention before you hand anything to your CPA.",
    fuelCategory: "Vehicle & Transportation",
    supportLabel: "Support trail",
    proofExport: "Export a cleaner Schedule C package when it is time.",
    trustRegion: "U.S. and Canadian workflows",
    distanceLabel: "Mileage or kilometre support",
    exportType: "Schedule C and T2125/T4A export support",
    pricingSubtitle: "No charge today. Finish setup first, then choose Basic or confirm Pro billing.",
    distancePricing: "Mileage and kilometre tracking",
    pricingExports: "Schedule C or T2125/T4A exports",
    pricingReminders: "Installment reminders",
    currency: "usd"
  },
  CA: {
    heroKicker: "BOOKKEEPING FOR SOLO BUSINESSES IN THE U.S. AND CANADA",
    heroLede: "Import transactions, attach receipts, send invoices, and fix the few items that actually need attention before you hand anything to your CPA.",
    fuelCategory: "Motor Vehicle",
    supportLabel: "Support trail",
    proofExport: "Export a cleaner T2125 or T4A package when it is time.",
    trustRegion: "U.S. and Canadian workflows",
    distanceLabel: "Kilometre or mileage support",
    exportType: "Schedule C and T2125/T4A export support",
    pricingSubtitle: "No charge today. Finish setup first, then choose Basic or confirm Pro billing.",
    distancePricing: "Mileage and kilometre tracking",
    pricingExports: "Schedule C or T2125/T4A exports",
    pricingReminders: "Installment reminders",
    currency: "cad"
  }
};

function normalizeLandingRegion(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "CA" || raw === "CAN" || raw === "CANADA" ? "CA" : "US";
}

function fallbackLandingRegionFromLocale() {
  const language = String(navigator.language || "").toLowerCase();
  const languages = Array.isArray(navigator.languages) ? navigator.languages.join(",").toLowerCase() : "";
  return language.includes("-ca") || languages.includes("-ca") ? "CA" : "US";
}

async function detectLandingRegion() {
  try {
    const res = await fetch("/api/region/detect", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (res && res.ok) {
      const data = await res.json();
      return normalizeLandingRegion(data.region || data.country);
    }
  } catch (_) {
    // Fall back to browser locale when the marketing page is previewed without the API.
  }
  return fallbackLandingRegionFromLocale();
}

function resolveLandingCurrency(regionOverride) {
  return LANDING_REGION_COPY[normalizeLandingRegion(regionOverride)]?.currency || "usd";
}

function formatLandingPrice(value, currency) {
  const amount = Number(value || 0);
  const symbol = String(currency || "usd").toLowerCase() === "cad" ? "CA$" : "$";
  return `${symbol}${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

function updateLandingPricing(billingMode, regionOverride) {
  const isYearly = billingMode === "yearly";
  const currency = resolveLandingCurrency(regionOverride);
  const isCAD = currency === "cad";

  document.querySelectorAll("[data-pricing-card]").forEach((card) => {
    const amountNode = card.querySelector("[data-price-amount]");
    const periodNode = card.querySelector("[data-price-period]");
    const noteNode = card.querySelector("[data-price-note]");
    const monthlyPrice = Number((isCAD ? card.getAttribute("data-price-monthly-cad") : null) || card.getAttribute("data-price-monthly") || 0);
    const yearlyMonthlyPrice = Number((isCAD ? card.getAttribute("data-price-yearly-monthly-cad") : null) || card.getAttribute("data-price-yearly-monthly") || 0);
    const yearlyTotalPrice = Number((isCAD ? card.getAttribute("data-price-yearly-total-cad") : null) || card.getAttribute("data-price-yearly-total") || 0);

    if (amountNode) {
      amountNode.textContent = isYearly ? formatLandingPrice(yearlyMonthlyPrice, currency) : formatLandingPrice(monthlyPrice, currency);
    }
    if (periodNode) {
      periodNode.textContent = "/ month" + (isCAD ? " CAD" : "");
    }
    if (noteNode) {
      noteNode.textContent = isYearly
        ? `Billed annually at ${formatLandingPrice(yearlyTotalPrice, currency)}. Save 15%.`
        : `Billed monthly at ${formatLandingPrice(monthlyPrice, currency)}.`;
    }
  });
}

function applyLandingRegion(region) {
  const normalized = normalizeLandingRegion(region);
  const copy = LANDING_REGION_COPY[normalized];

  document.documentElement.dataset.region = normalized;
  document.querySelectorAll("[data-region-copy]").forEach((node) => {
    const key = node.getAttribute("data-region-copy");
    if (copy[key]) {
      node.textContent = copy[key];
    }
  });

  updateLandingPricing("monthly", normalized);
}

window.applyLandingRegion = applyLandingRegion;
window.renderLandingPricing = updateLandingPricing;

document.addEventListener("DOMContentLoaded", async () => {
  const detectedRegion = await detectLandingRegion();
  applyLandingRegion(detectedRegion);
});
