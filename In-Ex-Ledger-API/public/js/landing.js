const LANDING_REGION_COPY = {
  US: {
    heroKicker: "For solo businesses 🇺🇸",
    heroLede: "Track income, expenses, receipts, mileage, categories, and exports in one clean ledger built for U.S. solo businesses.",
    ctaNote: "U.S. support.",
    taxContext: "Tax form context: U.S. Schedule C estimate",
    previewIncome: "$1,643.26",
    previewExpenses: "$4,199.01",
    previewProfit: "-$2,555.75",
    rowIncome: "$1,250.00",
    rowExpense: "-$89.42",
    rowClient: "$2,500.00",
    rowFuel: "-$65.00",
    fuelCategory: "Vehicle",
    mileageNav: "+ Mileage",
    trustRegion: "Built for U.S. Schedule C / 1099 workflows.",
    featureRegion: "Support for U.S. Schedule C and 1099 tax context.",
    currency: "usd"
  },
  CA: {
    heroKicker: "For solo businesses 🇨🇦",
    heroLede: "Track income, expenses, receipts, kilometres, categories, and exports in one clean ledger built for Canadian solo businesses.",
    ctaNote: "Canada support.",
    taxContext: "Tax form context: Canada T2125 estimate",
    previewIncome: "CA$1,643.26",
    previewExpenses: "CA$4,199.01",
    previewProfit: "-CA$2,555.75",
    rowIncome: "CA$1,250.00",
    rowExpense: "-CA$89.42",
    rowClient: "CA$2,500.00",
    rowFuel: "-CA$65.00",
    fuelCategory: "Motor Vehicle",
    mileageNav: "+ Kilometres",
    trustRegion: "Built for Canadian T2125 / T4A workflows with GST/HST category support.",
    featureRegion: "Support for Canadian T2125, T4A, and GST/HST tax context.",
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
    const res = await fetch("/api/region/detect", { method: "GET", credentials: "include", headers: { Accept: "application/json" } });
    if (res && res.ok) {
      const data = await res.json();
      return normalizeLandingRegion(data.region || data.country);
    }
  } catch (_) {}
  return fallbackLandingRegionFromLocale();
}

function applyLandingRegion(region) {
  const normalized = normalizeLandingRegion(region);
  const copy = LANDING_REGION_COPY[normalized];
  document.documentElement.dataset.region = normalized;
  document.querySelectorAll("[data-region-copy]").forEach((node) => {
    const key = node.getAttribute("data-region-copy");
    if (copy[key]) node.textContent = copy[key];
  });
  document.querySelectorAll("[data-region-toggle]").forEach((button) => {
    const isActive = button.getAttribute("data-region-toggle") === normalized;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  updateLandingPricing("monthly", normalized);
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
    if (amountNode) amountNode.textContent = isYearly ? formatLandingPrice(yearlyMonthlyPrice, currency) : formatLandingPrice(monthlyPrice, currency);
    if (periodNode) periodNode.textContent = "/ month" + (isCAD ? " CAD" : "");
    if (noteNode) noteNode.textContent = isYearly
      ? `Billed annually at ${formatLandingPrice(yearlyTotalPrice, currency)}. Save 15%.`
      : `Billed monthly at ${formatLandingPrice(monthlyPrice, currency)}.`;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const detectedRegion = await detectLandingRegion();
  applyLandingRegion(detectedRegion);
  document.querySelectorAll("[data-region-toggle]").forEach((button) => {
    button.addEventListener("click", () => applyLandingRegion(button.getAttribute("data-region-toggle") || "US"));
  });
});
