const LANDING_POLISH_FAQS = {
  US: [
    {
      q: "What U.S. setup does InEx Ledger support?",
      a: "The U.S. setup includes Schedule C-style categories, 1099 income, receipts, mileage, accounts, and exports. It helps you stay organized, but it does not replace professional tax advice."
    },
    {
      q: "Can I keep receipts and mileage with my transactions?",
      a: "Yes. InEx Ledger includes receipt tracking and mileage tracking so supporting records stay close to the income and expense activity they belong to."
    },
    {
      q: "Can I export my bookkeeping records?",
      a: "Yes. The app includes exports so you can hand over cleaner records at tax time, during a review, or for your own files."
    },
    {
      q: "Is InEx Ledger a full accounting suite?",
      a: "No. It is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, mileage, analytics, and exports."
    }
  ],
  CA: [
    {
      q: "What Canadian setup does InEx Ledger support?",
      a: "The Canadian setup includes T2125-style categories, T4A details, GST/HST support, receipts, kilometres, accounts, and exports. It helps you stay organized, but it does not replace professional tax advice."
    },
    {
      q: "Does the Canada version use Canadian wording?",
      a: "Yes. The Canada preview uses Canadian context such as kilometres, T2125, T4A, GST/HST, and CAD pricing language."
    },
    {
      q: "Can I organize GST/HST-related categories?",
      a: "Yes. The category setup includes GST/HST support for Canadian bookkeeping."
    },
    {
      q: "Can I export records for review?",
      a: "Yes. InEx Ledger includes exports so you can prepare cleaner records for tax review or your own files."
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

  setTextBySelector(".marketing-nav-link[href='#regions']", isCA ? "Canada" : "United States");
  setTextBySelector(".hero-proof-list li:nth-child(3)", isCA ? "Attach receipts and track kilometres" : "Attach receipts and track mileage");
  setTextBySelector(".trust-strip article:first-child strong", isCA ? "Built for Canada" : "Built for the U.S.");
  setTextBySelector(".trust-strip article:nth-child(2) strong", isCA ? "Receipts and kilometres" : "Receipts and mileage");
  setTextBySelector(".trust-strip article:nth-child(2) p", isCA ? "Attach receipts and track kilometres in one place." : "Attach receipts and track mileage in one place.");
  setTextBySelector(".feature-card:nth-child(4) h3", isCA ? "Built for Canadian businesses" : "Built for U.S. businesses");
  setTextBySelector("#regions .section-heading h2", isCA ? "Bookkeeping for Canadian solo businesses." : "Bookkeeping for U.S. solo businesses.");
  setTextBySelector("#regions .section-subtitle", isCA ? "T2125 categories, T4A details, GST/HST support, kilometres, receipts, and exports." : "Schedule C categories, 1099 income, mileage, receipts, and exports.");
  setTextBySelector("#pricing .section-subtitle", isCA ? "Finish onboarding first, then confirm your Pro trial in Stripe. Pricing shown in CAD." : "Finish onboarding first, then confirm your Pro trial in Stripe. Pricing shown in USD.");

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
