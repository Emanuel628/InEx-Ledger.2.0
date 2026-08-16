window.LANDING_POLISH_FAQS = {
  US: [
    {
      q: "Who is InEx Ledger for?",
      a: "InEx Ledger is for solo operators, freelancers, contractors, consultants, creators, and very small service businesses that want cleaner records without dragging around a full accounting suite."
    },
    {
      q: "Is this meant to replace QuickBooks?",
      a: "Not for every business. InEx Ledger is the better fit when you want a calmer recordkeeping tool with receipts, support files, invoice replies, warning flags, and review-ready exports. If you need payroll, large-team permissions, inventory, or deep accounting workflows, use a full suite."
    },
    {
      q: "Does InEx Ledger file my taxes?",
      a: "No. It helps you keep cleaner records, catch missing details early, and hand over a stronger package when it is time to work with a CPA or tax preparer."
    },
    {
      q: "Can my CPA or tax preparer use the hand-off export?",
      a: "Yes. The export is built to be easier to review, with totals, category groupings, receipt and support coverage, blockers, warnings, excluded items, and review notes."
    },
    {
      q: "Does it support Schedule C?",
      a: "Yes. The U.S. workflow is built around solo-business records that need Schedule C-friendly categories, cleanup, and export handoff."
    },
    {
      q: "Does it support T2125/T4A?",
      a: "Yes. Canadian records can be kept in a T2125/T4A-friendly flow with receipts, GST/HST support, kilometre tracking, and export handoff."
    },
    {
      q: "Can I attach receipts and support files?",
      a: "Yes. You can keep receipts, mileage logs, allocation worksheets, home-office support, capital-asset support, tax-profile support, and review notes tied to the record they belong to."
    },
    {
      q: "What are warning flags and review blockers?",
      a: "They point out what still needs work before export, like missing categories, missing receipts, missing tax mapping, mileage support gaps, or reviewer issues that still need judgment."
    },
    {
      q: "What makes redacted export history useful?",
      a: "It lets you keep the export trail and status without casually storing full private tax details in normal history views."
    },
    {
      q: "Can I send invoices?",
      a: "Yes. Simple invoice sending is included in Pro."
    },
    {
      q: "What happens when a client replies?",
      a: "The reply comes back into your account and stays tied to the invoice history so payment follow-up is easier to understand later."
    },
    {
      q: "Does it remind me about estimated tax installments?",
      a: "Yes. The app can surface upcoming due dates, a countdown, a draft estimate when available, and the link to pay through the right tax authority."
    },
    {
      q: "Can I manage multiple businesses?",
      a: "Yes. Pro supports additional businesses so you can keep separate records without collapsing everything into one ledger."
    },
    {
      q: "Which languages are supported?",
      a: "English, French, and Spanish."
    },
    {
      q: "Can I export my data?",
      a: "Yes. You can export PDF and CSV workpapers for cleanup, review, or handoff."
    },
    {
      q: "Why use this instead of a spreadsheet?",
      a: "Because the transaction, support, invoice reply, warning, and export trail stay connected while you work instead of getting patched together at the end."
    }
  ],
  CA: [
    {
      q: "Who is InEx Ledger for?",
      a: "InEx Ledger is for solo operators, freelancers, contractors, consultants, creators, and very small service businesses that want cleaner records without dragging around a full accounting suite."
    },
    {
      q: "Is this meant to replace QuickBooks?",
      a: "Not for every business. InEx Ledger is the better fit when you want a calmer recordkeeping tool with receipts, support files, invoice replies, warning flags, and review-ready exports. If you need payroll, large-team permissions, inventory, or deep accounting workflows, use a full suite."
    },
    {
      q: "Does InEx Ledger file my taxes?",
      a: "No. It helps you keep cleaner records, catch missing details early, and hand over a stronger package when it is time to work with a CPA or tax preparer."
    },
    {
      q: "Can my CPA or tax preparer use the hand-off export?",
      a: "Yes. The export is built to be easier to review, with totals, category groupings, receipt and support coverage, blockers, warnings, excluded items, and review notes."
    },
    {
      q: "Does it support Schedule C?",
      a: "Yes. The U.S. workflow is available when you need Schedule C-friendly categories, cleanup, and export handoff."
    },
    {
      q: "Does it support T2125/T4A?",
      a: "Yes. The Canadian workflow is built around T2125/T4A-friendly records, GST/HST support, kilometre tracking, and export handoff."
    },
    {
      q: "Can I attach receipts and support files?",
      a: "Yes. You can keep receipts, kilometre logs, allocation worksheets, home-office support, capital-asset support, tax-profile support, and review notes tied to the record they belong to."
    },
    {
      q: "What are warning flags and review blockers?",
      a: "They point out what still needs work before export, like missing categories, missing receipts, missing tax mapping, kilometre support gaps, or reviewer issues that still need judgment."
    },
    {
      q: "What makes redacted export history useful?",
      a: "It lets you keep the export trail and status without casually storing full private tax details in normal history views."
    },
    {
      q: "Can I send invoices?",
      a: "Yes. Simple invoice sending is included in Pro."
    },
    {
      q: "What happens when a client replies?",
      a: "The reply comes back into your account and stays tied to the invoice history so payment follow-up is easier to understand later."
    },
    {
      q: "Does it remind me about estimated tax installments?",
      a: "Yes. The app can surface CRA installment reminders with the due date, a countdown, a draft estimate when available, and the pay link."
    },
    {
      q: "Can I manage multiple businesses?",
      a: "Yes. Pro supports additional businesses so you can keep separate records without collapsing everything into one ledger."
    },
    {
      q: "Which languages are supported?",
      a: "English, French, and Spanish."
    },
    {
      q: "Can I export my data?",
      a: "Yes. You can export PDF and CSV workpapers for cleanup, review, or handoff."
    },
    {
      q: "Why use this instead of a spreadsheet?",
      a: "Because the transaction, support, invoice reply, warning, and export trail stay connected while you work instead of getting patched together at the end."
    }
  ]
};

window.__landingExpandedFaqRendering = false;

function getLandingFaqRegion() {
  return document.documentElement.dataset.region === "CA" ? "CA" : "US";
}

function renderExpandedLandingFaqs() {
  const list = document.querySelector("#faq .faq-list");
  if (!list || !window.LANDING_POLISH_FAQS || window.__landingExpandedFaqRendering) return;
  const region = getLandingFaqRegion();
  const faqs = window.LANDING_POLISH_FAQS[region] || window.LANDING_POLISH_FAQS.US;
  const openQuestions = new Set([
    "Who is InEx Ledger for?",
    "Is this meant to replace QuickBooks?",
    "Can my CPA or tax preparer use the hand-off export?"
  ]);

  window.__landingExpandedFaqRendering = true;
  list.textContent = "";

  faqs.forEach((item) => {
    const details = document.createElement("details");
    details.className = "faq-item";
    details.setAttribute("data-expanded-faq", "true");
    if (openQuestions.has(item.q)) {
      details.setAttribute("open", "");
    }

    const summary = document.createElement("summary");
    summary.textContent = item.q;

    const paragraph = document.createElement("p");
    paragraph.textContent = item.a;

    details.appendChild(summary);
    details.appendChild(paragraph);
    list.appendChild(details);
  });

  list.setAttribute("data-expanded-faq-region", region);
  window.__landingExpandedFaqRendering = false;
}

function scheduleExpandedLandingFaqs() {
  [0, 30, 120, 350, 800].forEach((delay) => {
    window.setTimeout(renderExpandedLandingFaqs, delay);
  });
}

function installExpandedFaqObserver() {
  const list = document.querySelector("#faq .faq-list");
  if (!list || list.__expandedFaqObserverInstalled) return;
  list.__expandedFaqObserverInstalled = true;

  const observer = new MutationObserver(() => {
    if (window.__landingExpandedFaqRendering) return;
    const expectedRegion = getLandingFaqRegion();
    const isExpanded = list.getAttribute("data-expanded-faq-region") === expectedRegion && list.querySelectorAll("[data-expanded-faq='true']").length >= 12;
    if (!isExpanded) {
      window.setTimeout(renderExpandedLandingFaqs, 0);
    }
  });

  observer.observe(list, { childList: true, subtree: false });
}

document.addEventListener("DOMContentLoaded", () => {
  installExpandedFaqObserver();
  scheduleExpandedLandingFaqs();
});

if (document.readyState !== "loading") {
  installExpandedFaqObserver();
  scheduleExpandedLandingFaqs();
}
