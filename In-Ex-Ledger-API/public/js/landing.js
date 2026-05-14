const CANADA_LANDING_COPY = {
  landing_hero_kicker: "Built for Canadian sole proprietors",
  landing_hero_title: "Simple books for self-employed Canadians.",
  landing_hero_subtitle: "Track income, expenses, receipts, mileage, and T2125-ready records without turning bookkeeping into a full accounting job.",
  landing_hero_primary: "Start free trial",
  landing_hero_secondary: "See what is included",
  landing_trust_badge_1: "T2125-ready exports",
  landing_trust_badge_2: "Built for freelancers and contractors",
  landing_trust_badge_3: "Canada-friendly categories",
  landing_feature_1_title: "Organized for T2125 reporting",
  landing_feature_1_body: "Keep business income and expense records clean so tax season is easier for you and your accountant.",
  landing_feature_2_title: "Receipts, mileage, and records together",
  landing_feature_2_body: "Log trips, store receipts, and keep the supporting details behind your business expenses in one place.",
  landing_feature_3_title: "Works for Canadian freelancers",
  landing_feature_3_body: "Designed for self-employed Canadians, contractors, gig workers, and small service businesses.",
  landing_included_title: "What is included",
  landing_included_1: "Income and expense tracking",
  landing_included_2: "Canadian-friendly business categories",
  landing_included_3: "Receipt uploads and storage",
  landing_included_4: "Mileage and kilometre tracking",
  landing_included_5: "T2125-ready export support",
  landing_included_6: "English and French-ready foundation",
  landing_coming_title: "Built for Canada, including Quebec realities",
  landing_coming_body: "Canadian bookkeeping can vary by province, language, and tax context. InEx Ledger keeps the records organized while you stay in control of your region settings.",
  landing_cta_title: "Start with clean Canadian books.",
  landing_cta_body: "Use InEx Ledger to keep income, expenses, receipts, and mileage ready for review.",
  landing_cta_button: "Start free trial"
};

const CANADA_TEXT_REPLACEMENTS = [
  [/1099 workers/gi, "Canadian freelancers"],
  [/1099 contractors/gi, "Canadian contractors"],
  [/1099 contractor/gi, "Canadian contractor"],
  [/1099s/gi, "T4A slips"],
  [/1099/gi, "T4A"],
  [/Schedule C/gi, "T2125"],
  [/IRS/gi, "CRA"],
  [/tax season exports/gi, "T2125-ready exports"],
  [/US tax categories/gi, "Canadian business categories"],
  [/U\.S\. tax categories/gi, "Canadian business categories"]
];

function normalizeLandingRegion(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "CA" || raw === "CAN" || raw === "CANADA") return "CA";
  return "US";
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
  } catch (_) {}
  return fallbackLandingRegionFromLocale();
}

function setLandingText(selector, value) {
  const node = document.querySelector(selector);
  if (node && value) {
    node.textContent = value;
  }
}

function applyCanadianLandingCopy() {
  document.documentElement.dataset.region = "CA";

  Object.entries(CANADA_LANDING_COPY).forEach(([key, value]) => {
    document.querySelectorAll(`[data-i18n="${key}"]`).forEach((node) => {
      node.textContent = value;
    });
  });

  // The current landing page is mostly hard-coded marketing markup.
  // Keep the Canadian variant wired to the live selectors so regional copy
  // does not silently drift out of sync.
  setLandingText(".hero-kicker", CANADA_LANDING_COPY.landing_hero_kicker);
  setLandingText(".hero h1", CANADA_LANDING_COPY.landing_hero_title);
  setLandingText(".hero-lede", CANADA_LANDING_COPY.landing_hero_subtitle);
  setLandingText(".hero-actions .button-primary", "Start free for 30 days");
  setLandingText(
    ".pricing-section .section-subtitle",
    "A 30-day free trial gets you into the full product without asking for a card first."
  );
  setLandingText(".final-cta h2", "Keep the books current. Make tax season lighter.");
  setLandingText(".final-cta .button-primary", "Start free for 30 days");

  scrubCanadianTaxWording();
}

function scrubCanadianTaxWording() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return /1099|Schedule C|IRS|US tax|U\.S\. tax/i.test(node.nodeValue || "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach((node) => {
    let text = node.nodeValue || "";
    CANADA_TEXT_REPLACEMENTS.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    node.nodeValue = text;
  });
}

function resolveLandingCurrency(regionOverride) {
  const region = normalizeLandingRegion(
    regionOverride ||
    (typeof window.getCurrentRegion === "function" && window.getCurrentRegion()) ||
    window.LUNA_REGION ||
    "US"
  );
  return region === "CA" ? "cad" : "usd";
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

function initLandingPricingControls(region) {
  let billingMode = "monthly";
  const update = () => updateLandingPricing(billingMode, region);

  const pricingToggleSelector = "[data-billing-toggle], [data-billing-mode], [data-billing-interval], [data-pricing-toggle]";

  document.querySelectorAll(pricingToggleSelector).forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = String(
        btn.dataset.billingToggle ||
        btn.dataset.billingMode ||
        btn.dataset.billingInterval ||
        btn.dataset.pricingToggle ||
        ""
      ).toLowerCase();
      if (next === "monthly" || next === "yearly") {
        billingMode = next;
        document.querySelectorAll(pricingToggleSelector).forEach((toggle) => {
          const toggleValue = String(
            toggle.dataset.billingToggle ||
            toggle.dataset.billingMode ||
            toggle.dataset.billingInterval ||
            toggle.dataset.pricingToggle ||
            ""
          ).toLowerCase();
          toggle.classList.toggle("is-active", toggleValue === billingMode);
          toggle.setAttribute("aria-pressed", String(toggleValue === billingMode));
        });
        update();
      }
    });
  });

  update();
}

document.addEventListener("DOMContentLoaded", async () => {
  const region = await detectLandingRegion();
  if (region === "CA") {
    applyCanadianLandingCopy();
  } else {
    document.documentElement.dataset.region = "US";
  }
  initLandingPricingControls(region);
});
