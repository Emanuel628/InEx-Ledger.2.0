const LANDING_REGION_COPY = {
  US: {
    heroKicker: "FOR SOLO OPERATORS IN THE U.S. AND CANADA",
    heroLede: "InEx Ledger helps solo businesses track income, expenses, receipts, mileage, invoices, and client replies, then turn messy records into review-ready Schedule C or T2125/T4A export packages.",
    taxContext: "Schedule C-friendly categories and review status",
    rowIncome: "$1,250.00",
    rowExpense: "-$89.42",
    rowFuel: "-$65.00",
    rowImport: "-$42.18",
    fuelCategory: "Vehicle & Transportation",
    mileageNav: "+ Mileage",
    receiptAmount: "$89.42 captured",
    receiptDistanceCheck: "Mileage log attached",
    exportFormName: "Schedule C review package",
    exportSummaryIncome: "Income: $48,220.14",
    exportSummaryExpense: "Expenses: $18,094.32",
    exportSummaryNet: "Net: $30,125.82",
    exportPdfBadge: "Prepared PDF export",
    exportPdfTitle: "Schedule C review packet",
    exportPdfFilename: "inex-ledger-schedule-c-review-packet-2026-ytd.pdf",
    exportPdfPrepared: "Generated May 25, 2026",
    exportPdfSectionOne: "Income summary",
    exportPdfSectionTwo: "Expense summary",
    exportPdfSectionThree: "Net income",
    exportPdfLineOne: "Sales income",
    exportPdfLineOneAmount: "$34,800.00",
    exportPdfLineTwo: "Contractor costs",
    exportPdfLineTwoAmount: "$6,420.00",
    exportPdfLineThree: "Office and software",
    exportPdfLineThreeAmount: "$2,184.32",
    exportPdfPreparedFor: "CPA review package",
    exportPdfIncome: "$48,220.14",
    exportPdfExpense: "$18,094.32",
    exportPdfNet: "$30,125.82",
    reminderContext: "Estimated tax reminders for U.S. solo businesses",
    reminderBanner: "Installment 2 estimated taxes are due June 15 - in 21 days. Estimated amount: $238.33. Pay via IRS.",
    reminderSubtext: "Due date, countdown, estimated amount, and pay link stay visible before it turns into a last-minute problem.",
    trustRegion: "Built for U.S. and Canadian solo-business records.",
    distanceLabel: "Track mileage support for vehicle-related records.",
    pricingSubtitle: "No charge today. Confirm billing after setup.",
    distancePricing: "Mileage and kilometre tracking",
    pricingExports: "Schedule C or T2125/T4A exports",
    pricingReminders: "Estimated tax installment reminders",
    currency: "usd"
  },
  CA: {
    heroKicker: "FOR SOLO OPERATORS IN THE U.S. AND CANADA",
    heroLede: "InEx Ledger helps solo businesses track income, expenses, receipts, kilometres, invoices, and client replies, then turn messy records into review-ready Schedule C or T2125/T4A export packages.",
    taxContext: "T2125 and T4A-friendly categories with GST/HST support",
    rowIncome: "CA$1,250.00",
    rowExpense: "-CA$89.42",
    rowFuel: "-CA$65.00",
    rowImport: "-CA$42.18",
    fuelCategory: "Motor Vehicle",
    mileageNav: "+ Kilometres",
    receiptAmount: "CA$89.42 captured",
    receiptDistanceCheck: "Kilometre log attached",
    exportFormName: "T2125/T4A review package",
    exportSummaryIncome: "Income: CA$48,220.14",
    exportSummaryExpense: "Expenses: CA$18,094.32",
    exportSummaryNet: "Net: CA$30,125.82",
    exportPdfBadge: "Prepared PDF export",
    exportPdfTitle: "T2125 review packet",
    exportPdfFilename: "inex-ledger-t2125-review-packet-2026-ytd.pdf",
    exportPdfPrepared: "Generated May 25, 2026",
    exportPdfSectionOne: "Income summary",
    exportPdfSectionTwo: "Expense summary",
    exportPdfSectionThree: "Net income",
    exportPdfLineOne: "Business income",
    exportPdfLineOneAmount: "CA$34,800.00",
    exportPdfLineTwo: "Subcontractor costs",
    exportPdfLineTwoAmount: "CA$6,420.00",
    exportPdfLineThree: "Office and software",
    exportPdfLineThreeAmount: "CA$2,184.32",
    exportPdfPreparedFor: "Tax preparer review package",
    exportPdfIncome: "CA$48,220.14",
    exportPdfExpense: "CA$18,094.32",
    exportPdfNet: "CA$30,125.82",
    reminderContext: "CRA installment reminders for Canadian sole proprietors",
    reminderBanner: "Installment 2 estimated taxes are due June 15 - in 21 days. Estimated amount: CA$238.33. Pay via CRA.",
    reminderSubtext: "Due date, countdown, estimated amount, and pay link stay visible before it turns into a last-minute problem.",
    trustRegion: "Built for U.S. and Canadian solo-business records.",
    distanceLabel: "Track kilometre support for vehicle-related records.",
    pricingSubtitle: "No charge today. Confirm billing after setup.",
    distancePricing: "Mileage and kilometre tracking",
    pricingExports: "Schedule C or T2125/T4A exports",
    pricingReminders: "Estimated tax installment reminders",
    currency: "cad"
  }
};

const LANDING_ROLODEX_CAPTIONS = [
  "Transactions - Track the money and see what needs cleanup.",
  "Warning checklist - See what is set, what is missing, and what blocks export.",
  "Receipts & support - Keep the proof with the transaction.",
  "Invoices - Send work out without leaving your books.",
  "Messages - Client replies stay tied to the invoice.",
  "Exports - Build a review-ready package, not a pile.",
  "Redacted history - Keep the full package secure and the saved record lighter.",
  "Tax reminders - See the deadline before it turns urgent."
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

function applyLandingRegion(region) {
  const normalized = normalizeLandingRegion(region);
  const copy = LANDING_REGION_COPY[normalized];
  document.documentElement.dataset.region = normalized;
  document.querySelectorAll("[data-region-copy]").forEach((node) => {
    const key = node.getAttribute("data-region-copy");
    if (copy[key]) node.textContent = copy[key];
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

function hydrateLandingStaticFixes() {
  const pdfCard = document.querySelector(".preview-pdf-card .preview-pdf-page");
  if (pdfCard) {
    pdfCard.innerHTML = `
      <span class="preview-card-label" data-region-copy="exportPdfBadge">Prepared PDF export</span>
      <strong data-region-copy="exportPdfTitle">Schedule C review packet</strong>
      <div class="preview-pdf-meta">
        <span data-region-copy="exportPdfFilename">inex-ledger-schedule-c-review-packet-2026-ytd.pdf</span>
        <span data-region-copy="exportPdfPrepared">Generated May 25, 2026</span>
      </div>
      <div class="preview-pdf-lines">
        <span></span>
        <span></span>
        <span class="short"></span>
      </div>
      <div class="preview-pdf-summary">
        <div class="preview-pdf-summary-row">
          <span data-region-copy="exportPdfSectionOne">Income summary</span>
          <strong data-region-copy="exportPdfIncome">$48,220.14</strong>
        </div>
        <div class="preview-pdf-summary-row">
          <span data-region-copy="exportPdfSectionTwo">Expense summary</span>
          <strong data-region-copy="exportPdfExpense">$18,094.32</strong>
        </div>
        <div class="preview-pdf-summary-row">
          <span data-region-copy="exportPdfSectionThree">Net income</span>
          <strong data-region-copy="exportPdfNet">$30,125.82</strong>
        </div>
      </div>
      <div class="preview-pdf-table" role="presentation">
        <div class="preview-pdf-table-row preview-pdf-table-head"><span>Section</span><span>Amount</span></div>
        <div class="preview-pdf-table-row"><span data-region-copy="exportPdfLineOne">Sales income</span><span data-region-copy="exportPdfLineOneAmount">$34,800.00</span></div>
        <div class="preview-pdf-table-row"><span data-region-copy="exportPdfLineTwo">Contractor costs</span><span data-region-copy="exportPdfLineTwoAmount">$6,420.00</span></div>
        <div class="preview-pdf-table-row"><span data-region-copy="exportPdfLineThree">Office and software</span><span data-region-copy="exportPdfLineThreeAmount">$2,184.32</span></div>
      </div>
      <div class="preview-pdf-grid">
        <div><small>Prepared for</small><strong data-region-copy="exportPdfPreparedFor">CPA review package</strong></div>
        <div><small>File type</small><strong>PDF export</strong></div>
        <div><small>Pages</small><strong>8 pages</strong></div>
        <div><small>Export ID</small><strong>PDF-2048</strong></div>
      </div>
    `;
  }

  const downloadChip = document.querySelector(".preview-download-chip");
  if (downloadChip) {
    downloadChip.textContent = "Preview PDF";
  }
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
      slide.classList.remove("is-active", "is-hidden");
      if (distance === 0) {
        slide.classList.add("is-active");
        slide.style.transform = "translateX(0) scale(1)";
        slide.style.opacity = "1";
        slide.style.filter = "blur(0)";
      } else {
        slide.classList.add("is-hidden");
        slide.style.transform = distance > 0 ? "translateX(8%) scale(0.985)" : "translateX(-8%) scale(0.985)";
        slide.style.opacity = "0";
        slide.style.filter = "blur(0.6px)";
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
  hydrateLandingStaticFixes();
  initLandingRolodex();
  const detectedRegion = await detectLandingRegion();
  applyLandingRegion(detectedRegion);
});
