const LANDING_REGION_COPY = {
  US: {
    heroKicker: "For U.S. solo businesses 🇺🇸",
    heroLede: "Track income, expenses, receipts, mileage, categories, and exports in one clean ledger built for U.S. solo businesses.",
    ctaNote: "U.S. record context.",
    regionNavLink: "U.S. workflow",
    distanceProof: "Attach receipts and track mileage",
    taxContext: "Record context: U.S. business categories",
    previewIncome: "$1,643.26",
    previewExpenses: "$4,199.01",
    previewProfit: "-$2,555.75",
    rowIncome: "$1,250.00",
    rowExpense: "-$89.42",
    rowClient: "$2,500.00",
    rowFuel: "-$65.00",
    fuelCategory: "Vehicle",
    mileageNav: "+ Mileage",
    trustRegionTitle: "U.S. record context",
    trustRegion: "Built around U.S. business categories and 1099 income context.",
    trustDistanceTitle: "Receipts and mileage",
    trustDistance: "Attach receipts and track mileage in one place.",
    featureRegionTitle: "Built for U.S. records",
    featureRegion: "Support for U.S. business categories, 1099 context, receipts, mileage, and export-ready records.",
    regionSectionTitle: "A U.S. bookkeeping workflow for solo businesses.",
    regionSectionSubtitle: "U.S. business categories, 1099 income context, mileage, receipts, and exports.",
    pricingSubtitle: "Finish onboarding first, then secure the Pro trial in Stripe. Pricing shown in USD.",
    faqRegionQuestion: "What U.S. record context does InEx Ledger support?",
    faqRegionAnswer: "The U.S. workflow is built around U.S. business categories, 1099 income context, receipts, mileage, accounts, and export-ready records. It helps organize your books, but it does not replace professional guidance.",
    receiptAmount: "$89.42 captured",
    receiptDistanceCheck: "Mileage note optional",
    analyticsIncome: "$8,420",
    analyticsExpense: "$3,180",
    analyticsNet: "$5,240",
    analyticsRange: "Jan to Dec",
    analyticsTopIncome: "$3,900 this month",
    analyticsTopExpense: "$1,180 this month",
    exportFormName: "Schedule C review packet",
    exportRange: "Jan 1, 2026 to May 22, 2026",
    exportSummaryIncome: "Income: $48,220.14",
    exportSummaryExpense: "Expenses: $18,094.32",
    exportSummaryNet: "Net: $30,125.82",
    exportPdfBadge: "Prepared PDF export",
    exportPdfTitle: "Schedule C review packet",
    exportPdfIncome: "$48,220.14",
    exportPdfExpense: "$18,094.32",
    exportPdfNet: "$30,125.82",
    currency: "usd"
  },
  CA: {
    heroKicker: "For Canadian solo businesses 🇨🇦",
    heroLede: "Track income, expenses, receipts, kilometres, categories, GST/HST context, and exports in one clean ledger built for Canadian solo businesses.",
    ctaNote: "Canadian record context.",
    regionNavLink: "Canada workflow",
    distanceProof: "Attach receipts and track kilometres",
    taxContext: "Record context: Canadian business categories",
    previewIncome: "CA$1,643.26",
    previewExpenses: "CA$4,199.01",
    previewProfit: "-CA$2,555.75",
    rowIncome: "CA$1,250.00",
    rowExpense: "-CA$89.42",
    rowClient: "CA$2,500.00",
    rowFuel: "-CA$65.00",
    fuelCategory: "Motor Vehicle",
    mileageNav: "+ Kilometres",
    trustRegionTitle: "Canadian record context",
    trustRegion: "Built around Canadian business categories, T4A context, kilometres, and GST/HST category support.",
    trustDistanceTitle: "Receipts and kilometres",
    trustDistance: "Attach receipts and track kilometres in one place.",
    featureRegionTitle: "Built for Canadian records",
    featureRegion: "Support for Canadian business categories, T4A context, GST/HST category support, receipts, kilometres, and export-ready records.",
    regionSectionTitle: "A Canadian bookkeeping workflow for solo businesses.",
    regionSectionSubtitle: "Canadian business categories, T4A context, GST/HST category support, kilometres, receipts, and exports.",
    pricingSubtitle: "Finish onboarding first, then secure the Pro trial in Stripe. Pricing shown in CAD.",
    faqRegionQuestion: "What Canadian record context does InEx Ledger support?",
    faqRegionAnswer: "The Canadian workflow is built around Canadian business categories, T4A context, GST/HST category support, receipts, kilometres, accounts, and export-ready records. It helps organize your books, but it does not replace professional guidance.",
    receiptAmount: "CA$89.42 captured",
    receiptDistanceCheck: "Kilometre note optional",
    analyticsIncome: "CA$8,420",
    analyticsExpense: "CA$3,180",
    analyticsNet: "CA$5,240",
    analyticsRange: "Jan to Dec",
    analyticsTopIncome: "CA$3,900 this month",
    analyticsTopExpense: "CA$1,180 this month",
    exportFormName: "T2125 review packet",
    exportRange: "Jan 1, 2026 to May 22, 2026",
    exportSummaryIncome: "Income: CA$48,220.14",
    exportSummaryExpense: "Expenses: CA$18,094.32",
    exportSummaryNet: "Net: CA$30,125.82",
    exportPdfBadge: "Prepared PDF export",
    exportPdfTitle: "T2125 review packet",
    exportPdfIncome: "CA$48,220.14",
    exportPdfExpense: "CA$18,094.32",
    exportPdfNet: "CA$30,125.82",
    currency: "cad"
  }
};

const LANDING_ROLODEX_CAPTIONS = [
  "Transactions · current reporting period",
  "Receipts · mock OCR and attachment review",
  "Analytics · monthly trend and what-if view",
  "Exports · downloadable PDF and CSV handoff"
];

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
  document.querySelectorAll("[data-region-panel]").forEach((panel) => {
    panel.hidden = panel.getAttribute("data-region-panel") !== normalized;
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

function initLandingRolodex() {
  const root = document.querySelector("[data-rolodex]");
  if (!root) return;

  const slides = Array.from(root.querySelectorAll("[data-rolodex-slide]"));
  const prevButton = root.querySelector("[data-rolodex-prev]");
  const nextButton = root.querySelector("[data-rolodex-next]");
  const dotsHost = root.querySelector(".hero-rolodex-dots");
  const caption = root.querySelector("[data-rolodex-caption]");
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeIndex = 0;
  let autoplayTimer = null;

  function slideDistance(index) {
    const total = slides.length;
    const forward = (index - activeIndex + total) % total;
    const backward = (activeIndex - index + total) % total;
    if (forward === 0) return 0;
    return forward <= backward ? forward : -backward;
  }

  function setTransforms() {
    slides.forEach((slide, index) => {
      const distance = slideDistance(index);
      slide.classList.remove("is-active", "is-prev", "is-next", "is-hidden");
      if (distance === 0) {
        slide.classList.add("is-active");
        slide.style.transform = "translateX(0) rotateY(0deg) scale(1)";
        slide.style.opacity = "1";
        slide.style.filter = "blur(0)";
      } else if (distance === 1 || distance === -(slides.length - 1)) {
        slide.classList.add("is-next");
        slide.style.transform = "translateX(16%) rotateY(-18deg) scale(0.92)";
        slide.style.opacity = "0.52";
        slide.style.filter = "blur(0.4px)";
      } else if (distance === -1 || distance === slides.length - 1) {
        slide.classList.add("is-prev");
        slide.style.transform = "translateX(-16%) rotateY(18deg) scale(0.92)";
        slide.style.opacity = "0.52";
        slide.style.filter = "blur(0.4px)";
      } else {
        slide.classList.add("is-hidden");
        slide.style.transform = distance > 0
          ? "translateX(28%) rotateY(-28deg) scale(0.84)"
          : "translateX(-28%) rotateY(28deg) scale(0.84)";
        slide.style.opacity = "0";
        slide.style.filter = "blur(1px)";
      }
      slide.setAttribute("aria-hidden", distance === 0 ? "false" : "true");
    });
  }

  function setDots() {
    if (!dotsHost) return;
    dotsHost.replaceChildren();
    slides.forEach((slide, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-rolodex-dot" + (index === activeIndex ? " is-active" : "");
      dot.setAttribute("aria-label", `Show ${slide.dataset.slideName || `screen ${index + 1}`}`);
      dot.addEventListener("click", () => {
        activeIndex = index;
        render();
        restartAutoplay();
      });
      dotsHost.appendChild(dot);
    });
  }

  function setCaption() {
    if (caption) {
      caption.textContent = LANDING_ROLODEX_CAPTIONS[activeIndex] || slides[activeIndex]?.dataset.slideName || "";
    }
  }

  function render() {
    setTransforms();
    setDots();
    setCaption();
  }

  function next() {
    activeIndex = (activeIndex + 1) % slides.length;
    render();
  }

  function prev() {
    activeIndex = (activeIndex - 1 + slides.length) % slides.length;
    render();
  }

  function clearAutoplay() {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function startAutoplay() {
    if (prefersReducedMotion || slides.length < 2) return;
    clearAutoplay();
    autoplayTimer = window.setInterval(next, 5200);
  }

  function restartAutoplay() {
    clearAutoplay();
    startAutoplay();
  }

  prevButton?.addEventListener("click", () => {
    prev();
    restartAutoplay();
  });

  nextButton?.addEventListener("click", () => {
    next();
    restartAutoplay();
  });

  root.addEventListener("mouseenter", clearAutoplay);
  root.addEventListener("mouseleave", startAutoplay);
  root.addEventListener("focusin", clearAutoplay);
  root.addEventListener("focusout", startAutoplay);

  render();
  startAutoplay();
}

document.addEventListener("DOMContentLoaded", async () => {
  initLandingRolodex();
  const detectedRegion = await detectLandingRegion();
  applyLandingRegion(detectedRegion);
  document.querySelectorAll("[data-region-toggle]").forEach((button) => {
    button.addEventListener("click", () => applyLandingRegion(button.getAttribute("data-region-toggle") || "US"));
  });
});
