/* taxReminders.js — Quarterly estimated tax due-date banners for freelancers */

(function () {
  // US: Apr 15, Jun 16, Sep 15, Jan 15
  // CA: Mar 17, Jun 16, Sep 15, Dec 15
  const US_DEADLINES = [
    { month: 4,  day: 15, quarter: "Q1" },
    { month: 6,  day: 15, quarter: "Q2" },
    { month: 9,  day: 15, quarter: "Q3" },
    { month: 1,  day: 15, quarter: "Q4", nextYear: true }
  ];
  const CA_DEADLINES = [
    { month: 3,  day: 15, quarter: "Instalment 1" },
    { month: 6,  day: 15, quarter: "Instalment 2" },
    { month: 9,  day: 15, quarter: "Instalment 3" },
    { month: 12, day: 15, quarter: "Instalment 4" }
  ];

  const DISMISS_KEY = "inex_tax_reminder_dismissed";
  const LEAD_DAYS   = 21; // show banner this many days before deadline

  function getRegion() {
    try {
      return (localStorage.getItem("region") || "US").toUpperCase();
    } catch (_) { return "US"; }
  }

  function getDismissed() {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch (_) { return []; }
  }

  function dismiss(key) {
    try {
      const list = getDismissed();
      if (!list.includes(key)) list.push(key);
      localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function nextDeadline(deadlines) {
    const now = new Date();
    const year = now.getFullYear();
    for (const d of deadlines) {
      const targetYear = d.nextYear ? year + 1 : year;
      const deadline = new Date(targetYear, d.month - 1, d.day);
      const diffDays = Math.ceil((deadline - now) / 86400000);
      if (diffDays >= 0 && diffDays <= LEAD_DAYS) {
        return { ...d, deadline, diffDays, key: `${targetYear}-${d.quarter}` };
      }
    }
    return null;
  }

  function renderBanner(upcoming, region) {
    const dismissed = getDismissed();
    if (dismissed.includes(upcoming.key)) return;

    const container = document.getElementById("trialBanner");
    if (!container) return;

    const dateStr = upcoming.deadline.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const daysMsg = upcoming.diffDays === 0 ? "today" : `in ${upcoming.diffDays} day${upcoming.diffDays === 1 ? "" : "s"}`;

    let payLink, payText;
    if (region === "CA") {
      payLink  = "https://www.canada.ca/en/revenue-agency/services/payments-cra/individual-payments/make-payment.html";
      payText  = "Pay via CRA";
    } else {
      payLink  = "https://www.irs.gov/payments/direct-pay";
      payText  = "Pay via IRS Direct Pay";
    }

    const banner = document.createElement("div");
    banner.className = "trial-banner trial-banner--warning tax-reminder-banner";
    banner.setAttribute("role", "alert");
    banner.innerHTML =
      `<span class="trial-banner-text">` +
        `<strong>${upcoming.quarter} estimated taxes are due ${dateStr}</strong> — ${daysMsg}. ` +
        `<a href="${payLink}" target="_blank" rel="noopener noreferrer">${payText}</a>` +
      `</span>` +
      `<button type="button" class="trial-banner-dismiss" aria-label="Dismiss tax reminder">&#x2715;</button>`;

    banner.querySelector(".trial-banner-dismiss").addEventListener("click", () => {
      dismiss(upcoming.key);
      banner.remove();
    });

    // Insert before any existing trial banner content
    container.innerHTML = "";
    container.appendChild(banner);
  }

  function initTaxReminder() {
    const region = getRegion();
    const deadlines = region === "CA" ? CA_DEADLINES : US_DEADLINES;
    const upcoming = nextDeadline(deadlines);
    if (upcoming) renderBanner(upcoming, region);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTaxReminder);
  } else {
    initTaxReminder();
  }
})();
