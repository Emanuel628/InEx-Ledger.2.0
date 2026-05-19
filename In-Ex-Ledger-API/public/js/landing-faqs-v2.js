window.LANDING_POLISH_FAQS = {
  US: [
    { q: "Who is InEx Ledger for?", a: "InEx Ledger is for solo businesses, freelancers, contractors, and independent operators who want a simple way to keep income, expenses, receipts, mileage, categories, accounts, analytics, and exports organized." },
    { q: "What can I track in the app?", a: "You can track income, expenses, accounts, categories, receipts, mileage, analytics, and export-ready records in one clean ledger." },
    { q: "Can I start without knowing accounting software?", a: "Yes. The workflow is built around practical actions: add or import transactions, choose accounts and categories, attach receipts, track mileage, and export records." },
    { q: "Can I attach receipts?", a: "Yes. Receipt tracking keeps supporting files close to the transactions they belong to." },
    { q: "Can I track mileage?", a: "Yes. The U.S. workflow includes mileage tracking for vehicle-related business records." },
    { q: "Can I export records?", a: "Yes. Export workflows help prepare cleaner records for review, filing prep, or your own archive." },
    { q: "Is this a full accounting suite?", a: "No. InEx Ledger is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, mileage, analytics, and exports." },
    { q: "What makes the U.S. version different?", a: "The U.S. version uses U.S. wording and category context, including mileage and U.S.-style business record organization." }
  ],
  CA: [
    { q: "Who is InEx Ledger for in Canada?", a: "InEx Ledger is for Canadian solo businesses, freelancers, contractors, and independent operators who want a simple way to keep income, expenses, receipts, kilometres, categories, accounts, analytics, and exports organized." },
    { q: "What can I track in the Canada workflow?", a: "You can track income, expenses, accounts, categories, receipts, kilometres, analytics, and export-ready records in one clean ledger." },
    { q: "Does the Canada version use Canadian wording?", a: "Yes. The Canada workflow uses Canadian context such as T2125, T4A, GST/HST, kilometres, and CAD language." },
    { q: "Can I organize GST/HST-related categories?", a: "Yes. The category workflow includes GST/HST-related category support for Canadian bookkeeping context." },
    { q: "Can I track kilometres?", a: "Yes. The Canada workflow uses kilometres language for vehicle-related business records." },
    { q: "Can I attach receipts?", a: "Yes. Receipt tracking keeps supporting files close to the transactions they belong to." },
    { q: "Can I export records?", a: "Yes. Export workflows help prepare cleaner records for review, filing prep, or your own archive." },
    { q: "Is this a full accounting suite?", a: "No. InEx Ledger is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, kilometres, analytics, and exports." }
  ]
};

function renderExpandedLandingFaqs() {
  var list = document.querySelector("#faq .faq-list");
  if (!list || !window.LANDING_POLISH_FAQS) return;
  var region = document.documentElement.dataset.region === "CA" ? "CA" : "US";
  var faqs = window.LANDING_POLISH_FAQS[region] || window.LANDING_POLISH_FAQS.US;
  list.textContent = "";
  faqs.forEach(function(item, index) {
    var details = document.createElement("details");
    details.className = "faq-item";
    if (index === 0) details.setAttribute("open", "");
    var summary = document.createElement("summary");
    summary.textContent = item.q;
    var paragraph = document.createElement("p");
    paragraph.textContent = item.a;
    details.appendChild(summary);
    details.appendChild(paragraph);
    list.appendChild(details);
  });
}

document.addEventListener("DOMContentLoaded", function() {
  window.setTimeout(renderExpandedLandingFaqs, 30);
  document.querySelectorAll("[data-region-toggle]").forEach(function(button) {
    button.addEventListener("click", function() {
      window.setTimeout(renderExpandedLandingFaqs, 30);
    });
  });
});
