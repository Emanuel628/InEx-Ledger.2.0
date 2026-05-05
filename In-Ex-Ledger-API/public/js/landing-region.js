/* Region-aware landing copy.
   US landing copy stays untouched. This file only overrides copy when the detected region is Canada. */
(function () {
  const CANADA_COPY = {
    "landing_hero_kicker": "Built for Canadian sole proprietors",
    "landing_hero_title": "Simple books for self-employed Canadians.",
    "landing_hero_subtitle": "Track income, expenses, receipts, mileage, and T2125-ready records without turning bookkeeping into a full accounting job.",
    "landing_hero_primary": "Start free trial",
    "landing_hero_secondary": "See what is included",
    "landing_trust_badge_1": "T2125-ready exports",
    "landing_trust_badge_2": "Built for freelancers and contractors",
    "landing_trust_badge_3": "Canada-friendly categories",
    "landing_feature_1_title": "Organized for T2125 reporting",
    "landing_feature_1_body": "Keep business income and expense records clean so tax season is easier for you and your accountant.",
    "landing_feature_2_title": "Receipts, mileage, and records together",
    "landing_feature_2_body": "Log trips, store receipts, and keep the supporting details behind your business expenses in one place.",
    "landing_feature_3_title": "Works for Canadian freelancers",
    "landing_feature_3_body": "Designed for self-employed Canadians, contractors, gig workers, and small service businesses.",
    "landing_included_title": "What is included",
    "landing_included_1": "Income and expense tracking",
    "landing_included_2": "Canadian-friendly business categories",
    "landing_included_3": "Receipt uploads and storage",
    "landing_included_4": "Mileage and kilometre tracking",
    "landing_included_5": "T2125-ready export support",
    "landing_included_6": "English and French-ready foundation",
    "landing_coming_title": "Built for Canada, including Quebec realities",
    "landing_coming_body": "Canadian bookkeeping can vary by province, language, and tax context. InEx Ledger keeps the records organized while you stay in control of your region settings.",
    "landing_cta_title": "Start with clean Canadian books.",
    "landing_cta_body": "Use InEx Ledger to keep income, expenses, receipts, and mileage ready for review.",
    "landing_cta_button": "Start free trial"
  };

  function normalizeRegion(value) {
    const raw = String(value || "").trim().toUpperCase();
    return raw === "CA" || raw === "CAN" || raw === "CANADA" ? "CA" : "US";
  }

  function fallbackRegionFromLocale() {
    const language = String(navigator.language || "").toLowerCase();
    const languages = Array.isArray(navigator.languages) ? navigator.languages.join(",").toLowerCase() : "";
    return language.includes("-ca") || languages.includes("-ca") ? "CA" : "US";
  }

  function applyCanadaCopy() {
    document.documentElement.dataset.region = "CA";
    Object.entries(CANADA_COPY).forEach(([key, value]) => {
      document.querySelectorAll(`[data-i18n="${key}"]`).forEach((node) => {
        node.textContent = value;
      });
    });

    document.querySelectorAll("[data-region-label]").forEach((node) => {
      node.textContent = "Canada";
    });
  }

  async function detectRegion() {
    try {
      const res = await fetch("/api/region/detect", {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      if (res && res.ok) {
        const data = await res.json();
        return normalizeRegion(data.region || data.country);
      }
    } catch (_) {}
    return fallbackRegionFromLocale();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const region = await detectRegion();
    if (region === "CA") {
      applyCanadaCopy();
    } else {
      document.documentElement.dataset.region = "US";
    }
  });
})();
