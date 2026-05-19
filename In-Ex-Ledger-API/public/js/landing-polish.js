const LANDING_POLISH_FAQS = {
  US: [
    {
      q: "What U.S. tax context does InEx Ledger support?",
      a: "The U.S. workflow is built around Schedule C-style categories, 1099 income context, receipts, mileage, accounts, and export-ready records. It helps organize your books, but it does not replace professional tax advice."
    },
    {
      q: "Can I keep receipts and mileage with my transactions?",
      a: "Yes. InEx Ledger includes receipt tracking and mileage tracking so supporting records stay close to the income and expense activity they belong to."
    },
    {
      q: "Can I export my bookkeeping records?",
      a: "Yes. The app includes export workflows so you can prepare cleaner records for tax season, review, or your own business archive."
    },
    {
      q: "Is InEx Ledger a full accounting suite?",
      a: "No. It is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, mileage, analytics, and exports."
    }
  ],
  CA: [
    {
      q: "What Canadian tax context does InEx Ledger support?",
      a: "The Canadian workflow is built around T2125-style categories, T4A context, GST/HST category support, receipts, kilometres, accounts, and export-ready records. It helps organize your books, but it does not replace professional tax advice."
    },
    {
      q: "Does the Canada version use Canadian wording?",
      a: "Yes. The Canada preview uses Canadian context such as kilometres, T2125, T4A, GST/HST, and CAD pricing language."
    },
    {
      q: "Can I organize GST/HST-related categories?",
      a: "Yes. The category workflow includes GST/HST-related category support for Canadian bookkeeping context."
    },
    {
      q: "Can I export records for review?",
      a: "Yes. InEx Ledger includes export workflows so you can prepare cleaner records for tax review, filing prep, or your own business archive."
    }
  ]
};

function getLandingPolishRegion() {
  return document.documentElement.dataset.region === "CA" ? "CA" : "US";
}

function setTextBySelector(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function renderLandingPolishFaq(region) {
  const list = document.querySelector("#faq .faq-list");
  if (!list) return;
  const faqs = LANDING_POLISH_FAQS[region] || LANDING_POLISH_FAQS.US;
  list.innerHTML = faqs.map((item, index) => `
    <details class="faq-item" ${index === 0 ? "open" : ""}>
      <summary>${item.q}</summary>
      <p>${item.a}</p>
    </details>
  `).join("");
}

function applyLandingPolish(region) {
  const activeRegion = region === "CA" ? "CA" : "US";
  const isCA = activeRegion === "CA";

  setTextBySelector(".marketing-nav-link[href='#regions']", isCA ? "Canada workflow" : "U.S. workflow");
  setTextBySelector(".hero-proof-list li:nth-child(3)", isCA ? "Attach receipts and track kilometres" : "Attach receipts and track mileage");
  setTextBySelector(".trust-strip article:first-child strong", isCA ? "Canadian tax context" : "U.S. tax context");
  setTextBySelector(".trust-strip article:nth-child(2) strong", isCA ? "Receipts and kilometres" : "Receipts and mileage");
  setTextBySelector(".trust-strip article:nth-child(2) p", isCA ? "Attach receipts and track kilometres in one place." : "Attach receipts and track mileage in one place.");
  setTextBySelector(".feature-card:nth-child(4) h3", isCA ? "Built for Canadian records" : "Built for U.S. records");
  setTextBySelector("#regions .section-heading h2", isCA ? "A Canadian bookkeeping workflow for solo businesses." : "A U.S. bookkeeping workflow for solo businesses.");
  setTextBySelector("#regions .section-subtitle", isCA ? "T2125 categories, T4A context, GST/HST category support, kilometres, receipts, and exports." : "Schedule C categories, 1099 income context, mileage, receipts, and exports.");
  setTextBySelector("#pricing .section-subtitle", isCA ? "No credit card required for the trial. Pricing shown in CAD." : "No credit card required for the trial. Pricing shown in USD.");

  document.querySelectorAll(".region-cards article").forEach((card, index) => {
    card.hidden = isCA ? index === 0 : index === 1;
  });

  renderLandingPolishFaq(activeRegion);
}

(function patchLandingRegionSwitcher() {
  const originalApply = window.applyLandingRegion;
  if (typeof originalApply === "function") {
    window.applyLandingRegion = function patchedApplyLandingRegion(region) {
      originalApply(region);
      applyLandingPolish(getLandingPolishRegion());
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => applyLandingPolish(getLandingPolishRegion()), 0);
    document.querySelectorAll("[data-region-toggle]").forEach((button) => {
      button.addEventListener("click", () => window.setTimeout(() => applyLandingPolish(getLandingPolishRegion()), 0));
    });
  });
})();
