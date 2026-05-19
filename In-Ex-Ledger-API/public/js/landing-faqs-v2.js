window.LANDING_POLISH_FAQS = {
  US: [
    { q: "Who is InEx Ledger actually for?", a: "InEx Ledger is for solo businesses, freelancers, contractors, and independent operators who need a serious ledger without the weight of a full accounting suite." },
    { q: "What does it replace in my current workflow?", a: "It can replace the scattered mix of spreadsheet tabs, receipt folders, mileage notes, category lists, and last-minute export cleanup that many solo operators rely on." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, mileage, analytics, invoices, and export-ready records from one workflow." },
    { q: "What is the edge-case review system?", a: "The export workflow can surface records that may need review before filing or handoff, such as missing receipts, category cleanup, vehicle support, meals, phone or internet allocation, and excluded non-business items." },
    { q: "Does the app fix edge cases automatically?", a: "No. It helps identify and organize review areas so you can clean them up or discuss them with a professional. It does not make judgment calls for you." },
    { q: "Can I import bank activity and clean it up?", a: "Yes. The app is designed around importing or adding transactions, then assigning accounts, categories, receipt support, and reporting context." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the transactions they belong to instead of scattered across folders, email, or photos." },
    { q: "Can I track mileage?", a: "Yes. The U.S. workflow includes mileage tracking for vehicle-related business records." },
    { q: "What makes exports useful?", a: "Exports are designed to be more than a raw transaction dump. They can include organized transaction data, review notes, receipt context, and bookkeeping cleanup signals." },
    { q: "Is this meant to replace QuickBooks?", a: "No. InEx Ledger is intentionally narrower: income, expenses, receipts, mileage, categories, analytics, invoices, and exports for solo-business recordkeeping." },
    { q: "Does InEx Ledger replace a CPA or tax preparer?", a: "No. It helps organize bookkeeping records and review areas. It does not replace professional guidance." },
    { q: "Why would I use this instead of a spreadsheet?", a: "Because the app keeps records structured as you work: transactions, accounts, categories, receipts, mileage, exports, and review flags all live in one system instead of being rebuilt at the end of the year." }
  ],
  CA: [
    { q: "Who is InEx Ledger for in Canada?", a: "InEx Ledger is for Canadian solo businesses, freelancers, contractors, and independent operators who need clean bookkeeping records without a full accounting-suite workflow." },
    { q: "What is different in the Canadian workflow?", a: "The Canada workflow uses Canadian context: kilometres, CAD language, T2125-style categories, T4A context, and GST/HST category support." },
    { q: "What can I track inside the app?", a: "You can track income, expenses, accounts, categories, receipts, kilometres, analytics, invoices, and export-ready records from one workflow." },
    { q: "What is the edge-case review system?", a: "The export workflow can surface records that may need review before filing or handoff, such as missing receipts, category cleanup, motor vehicle support, meals, phone or internet allocation, GST/HST-related review items, and excluded non-business items." },
    { q: "Does the app decide how to treat edge cases?", a: "No. It helps identify and organize review areas so you can clean them up or discuss them with a professional. It does not make judgment calls for you." },
    { q: "Can I organize GST/HST-related categories?", a: "Yes. The Canada workflow includes GST/HST-related category support so Canadian records are not forced into U.S. wording." },
    { q: "Can I track kilometres instead of mileage?", a: "Yes. The Canada workflow uses kilometres language for vehicle-related business records." },
    { q: "Can I attach receipts to expenses?", a: "Yes. Receipt tracking keeps supporting files close to the expenses and other records they belong to." },
    { q: "Can I import activity and clean it up?", a: "Yes. The app is designed around importing or adding transactions, then assigning accounts, categories, receipt support, and reporting context." },
    { q: "What makes exports useful for Canadian users?", a: "Exports are designed to organize transaction data, receipt context, category cleanup signals, kilometre-related support, and other review areas in a cleaner handoff format." },
    { q: "Is this a full accounting suite?", a: "No. InEx Ledger is intentionally focused on solo-business bookkeeping: income, expenses, accounts, categories, receipts, kilometres, analytics, invoices, and exports." },
    { q: "Does InEx Ledger replace an accountant?", a: "No. It helps organize bookkeeping records and review areas. It does not replace professional guidance." }
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
