window.LANDING_POLISH_FAQS = {
  US: [
    { q: "Who is InEx Ledger actually for?", a: "InEx Ledger is for solo businesses, freelancers, contractors, and independent operators who need a serious ledger without the weight of a full accounting suite." },
    { q: "What does it replace in my current workflow?", a: "It can replace the scattered mix of spreadsheet tabs, receipt folders, mileage notes, category lists, and end-of-period export cleanup that many solo operators rely on." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, mileage, analytics, and export-ready records from one workflow. Invoice tools may also be available where your plan and workspace support them." },
    { q: "What are transaction edge cases?", a: "On the Transactions page, edge cases are handled in the advanced transaction fields: foreign currency, source amount, exchange rate, exchange date, converted amount, tax treatment, personal-use percentage, indirect tax amount, recoverable tax, review status, and review notes." },
    { q: "Why do transaction edge-case fields matter?", a: "They let you keep messy real-world details attached to the exact transaction instead of burying them in notes or fixing them later in a spreadsheet." },
    { q: "Does the app decide edge cases automatically?", a: "No. The fields are there so you can record the treatment and review status. The app helps organize the information; it does not make professional judgment calls for you." },
    { q: "Can I add transactions and clean them up?", a: "Yes. The app is designed around adding transactions, then assigning accounts, categories, receipt support, and reporting context." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the transactions they belong to instead of scattered across folders, email, or photos." },
    { q: "Can I track mileage?", a: "Yes. The U.S. workflow includes mileage tracking for vehicle-related business records." },
    { q: "What makes exports useful?", a: "Exports are designed to be more than a raw transaction dump. They can include organized transaction data, receipt context, notes, and review status captured while you work." },
    { q: "Is this meant to replace QuickBooks?", a: "No. InEx Ledger is intentionally narrower: income, expenses, receipts, mileage, categories, analytics, and exports for solo-business recordkeeping." },
    { q: "Why would I use this instead of a spreadsheet?", a: "Because the app keeps records structured as you work: transactions, accounts, categories, receipts, mileage, edge-case fields, exports, and review status all live in one system instead of being rebuilt at the end of the year." }
  ],
  CA: [
    { q: "Who is InEx Ledger for in Canada?", a: "InEx Ledger is for Canadian solo businesses, freelancers, contractors, and independent operators who need clean bookkeeping records without a full accounting-suite workflow." },
    { q: "What is different in the Canadian workflow?", a: "The Canada workflow uses Canadian context: kilometres, CAD language, Canadian business category mapping, T4A context, and GST/HST category support." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, kilometres, analytics, and export-ready records from one workflow. Invoice tools may also be available where your plan and workspace support them." },
    { q: "What are transaction edge cases?", a: "On the Transactions page, edge cases are handled in the advanced transaction fields: foreign currency, source amount, exchange rate, exchange date, converted amount, tax treatment, personal-use percentage, GST/HST/QST amount, recoverable tax, review status, and review notes." },
    { q: "Why do transaction edge-case fields matter?", a: "They let you keep Canadian-specific details like GST/HST/QST amounts, recoverable tax, split-use treatment, foreign currency, and review notes attached to the exact transaction." },
    { q: "Does the app decide edge cases automatically?", a: "No. The fields are there so you can record the treatment and review status. The app helps organize the information; it does not make professional judgment calls for you." },
    { q: "Can I organize GST/HST-related categories?", a: "Yes. The Canada workflow includes GST/HST-related category support so Canadian records are not forced into U.S. wording." },
    { q: "Can I track kilometres instead of mileage?", a: "Yes. The Canada workflow uses kilometres language for vehicle-related business records." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the expenses and other records they belong to." },
    { q: "Can I add transactions and clean them up?", a: "Yes. The app is designed around adding transactions, then assigning accounts, categories, receipt support, and reporting context." },
    { q: "What makes exports useful for Canadian users?", a: "Exports are designed to organize transaction data, receipt context, review notes, and the transaction-level details you captured while cleaning up your records." },
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
