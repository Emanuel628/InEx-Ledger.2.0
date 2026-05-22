window.LANDING_POLISH_FAQS = {
  US: [
    { q: "Who is InEx Ledger actually for?", a: "InEx Ledger is for solo businesses, freelancers, contractors, and independent operators who want a simpler way to keep the books in order." },
    { q: "What does it replace in my current setup?", a: "It can replace the usual mix of spreadsheet tabs, receipt folders, mileage notes, category lists, and last-minute cleanup at the end of the month or year." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, mileage, analytics, and exports in one place. Invoice tools may also be available where your plan and workspace support them." },
    { q: "What are transaction edge cases?", a: "On the Transactions page, edge cases are handled in the advanced transaction fields: foreign currency, source amount, exchange rate, exchange date, converted amount, tax treatment, personal-use percentage, indirect tax amount, recoverable tax, review status, and review notes." },
    { q: "Why do transaction edge-case fields matter?", a: "They let you keep messy real-world details attached to the exact transaction instead of burying them in notes or fixing them later in a spreadsheet." },
    { q: "Does the app decide edge cases automatically?", a: "No. The fields are there so you can record the treatment and review status. The app helps organize the information; it does not make professional judgment calls for you." },
    { q: "Can I add transactions and clean them up?", a: "Yes. You can add transactions first, then fill in the account, category, receipt support, and any extra details when you are ready." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the transactions they belong to instead of scattered across folders, email, or photos." },
    { q: "Can I track mileage?", a: "Yes. The U.S. setup includes mileage tracking for vehicle-related business records." },
    { q: "What makes exports useful?", a: "Exports give you more than a basic transaction dump. They can include organized transaction data, receipts, notes, and review details you captured as you worked." },
    { q: "Is this meant to replace QuickBooks?", a: "No. InEx Ledger is intentionally narrower: income, expenses, receipts, mileage, categories, analytics, and exports for solo-business recordkeeping." },
    { q: "Why would I use this instead of a spreadsheet?", a: "Because the app keeps everything together as you go: transactions, accounts, categories, receipts, mileage, special-case details, exports, and review status all stay in one place." }
  ],
  CA: [
    { q: "Who is InEx Ledger for in Canada?", a: "InEx Ledger is for Canadian solo businesses, freelancers, contractors, and independent operators who want cleaner books without a full accounting suite." },
    { q: "What is different in the Canadian setup?", a: "The Canadian setup uses kilometres, CAD language, Canadian business categories, T4A details, and GST/HST support." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, kilometres, analytics, and exports in one place. Invoice tools may also be available where your plan and workspace support them." },
    { q: "What are transaction edge cases?", a: "On the Transactions page, edge cases are handled in the advanced transaction fields: foreign currency, source amount, exchange rate, exchange date, converted amount, tax treatment, personal-use percentage, GST/HST/QST amount, recoverable tax, review status, and review notes." },
    { q: "Why do transaction edge-case fields matter?", a: "They let you keep Canadian-specific details like GST/HST/QST amounts, recoverable tax, split-use treatment, foreign currency, and review notes attached to the exact transaction." },
    { q: "Does the app decide edge cases automatically?", a: "No. The fields are there so you can record the treatment and review status. The app helps organize the information; it does not make professional judgment calls for you." },
    { q: "Can I organize GST/HST-related categories?", a: "Yes. The Canadian setup includes GST/HST support so your records are not forced into U.S. wording." },
    { q: "Can I track kilometres instead of mileage?", a: "Yes. The Canadian setup uses kilometres for vehicle-related business records." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the expenses and other records they belong to." },
    { q: "Can I add transactions and clean them up?", a: "Yes. You can add transactions first, then fill in the account, category, receipt support, and any extra details when you are ready." },
    { q: "What makes exports useful for Canadian users?", a: "Exports pull together transaction data, receipts, review notes, and the details you captured while cleaning up your records." },
    { q: "Is this a full accounting suite?", a: "No. InEx Ledger is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, kilometres, analytics, and exports." }
  ]
};

window.__landingExpandedFaqRendering = false;

function getLandingFaqRegion() {
  return document.documentElement.dataset.region === "CA" ? "CA" : "US";
}

function renderExpandedLandingFaqs() {
  var list = document.querySelector("#faq .faq-list");
  if (!list || !window.LANDING_POLISH_FAQS || window.__landingExpandedFaqRendering) return;
  var region = getLandingFaqRegion();
  var faqs = window.LANDING_POLISH_FAQS[region] || window.LANDING_POLISH_FAQS.US;
  window.__landingExpandedFaqRendering = true;
  list.textContent = "";
  faqs.forEach(function(item, index) {
    var details = document.createElement("details");
    details.className = "faq-item";
    details.setAttribute("data-expanded-faq", "true");
    if (index === 0) details.setAttribute("open", "");
    var summary = document.createElement("summary");
    summary.textContent = item.q;
    var paragraph = document.createElement("p");
    paragraph.textContent = item.a;
    details.appendChild(summary);
    details.appendChild(paragraph);
    list.appendChild(details);
  });
  list.setAttribute("data-expanded-faq-region", region);
  window.__landingExpandedFaqRendering = false;
}

function scheduleExpandedLandingFaqs() {
  [0, 30, 120, 350, 800].forEach(function(delay) {
    window.setTimeout(renderExpandedLandingFaqs, delay);
  });
}

function installExpandedFaqObserver() {
  var list = document.querySelector("#faq .faq-list");
  if (!list || list.__expandedFaqObserverInstalled) return;
  list.__expandedFaqObserverInstalled = true;
  var observer = new MutationObserver(function() {
    if (window.__landingExpandedFaqRendering) return;
    var expectedRegion = getLandingFaqRegion();
    var isExpanded = list.getAttribute("data-expanded-faq-region") === expectedRegion && list.querySelectorAll("[data-expanded-faq='true']").length >= 8;
    if (!isExpanded) window.setTimeout(renderExpandedLandingFaqs, 0);
  });
  observer.observe(list, { childList: true, subtree: false });
}

document.addEventListener("DOMContentLoaded", function() {
  installExpandedFaqObserver();
  scheduleExpandedLandingFaqs();
  document.querySelectorAll("[data-region-toggle]").forEach(function(button) {
    button.addEventListener("click", scheduleExpandedLandingFaqs);
  });
});

if (document.readyState !== "loading") {
  installExpandedFaqObserver();
  scheduleExpandedLandingFaqs();
}
