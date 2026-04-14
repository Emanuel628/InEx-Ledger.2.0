/* taxReminders.js — Quarterly estimated tax due-date banners for freelancers */

(function () {
  // Base statutory dates; weekend handling shifts Saturday/Sunday deadlines to Monday.
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
  const DAY_MS = 24 * 60 * 60 * 1000;

  function getRegion() {
    try {
      const fromWindow = typeof window !== "undefined" ? window.LUNA_REGION : "";
      const fromScopedStorage = localStorage.getItem("lb_region");
      const fromLegacyStorage = localStorage.getItem("region");
      const region = String(fromWindow || fromScopedStorage || fromLegacyStorage || "US").toUpperCase();
      return region === "CA" ? "CA" : "US";
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

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function shiftWeekendDeadline(deadline) {
    const shifted = new Date(deadline);
    const dayOfWeek = shifted.getDay();
    if (dayOfWeek === 6) shifted.setDate(shifted.getDate() + 2);
    if (dayOfWeek === 0) shifted.setDate(shifted.getDate() + 1);
    return shifted;
  }

  function formatDismissKey(deadline, quarter) {
    return `${deadline.getFullYear()}-${deadline.getMonth() + 1}-${deadline.getDate()}-${quarter}`;
  }

  function nextDeadline(deadlines) {
    const now = startOfDay(new Date());
    const year = now.getFullYear();
    for (const d of deadlines) {
      const targetYear = d.nextYear ? year + 1 : year;
      const baseDeadline = new Date(targetYear, d.month - 1, d.day);
      const deadline = shiftWeekendDeadline(baseDeadline);
      const diffDays = Math.round((startOfDay(deadline) - now) / DAY_MS);
      if (diffDays >= 0 && diffDays <= LEAD_DAYS) {
        return { ...d, deadline, diffDays, key: formatDismissKey(deadline, d.quarter) };
      }
    }
    return null;
  }

  function getEstimatedAmount() {
    const taxEstimate = document.getElementById("taxOwed");
    if (!taxEstimate) return "";
    const value = String(taxEstimate.textContent || "").trim();
    if (!value) return "";
    if (/not shown|switch to one business/i.test(value)) return "";
    return value;
  }

  function renderBanner(upcoming, region) {
    const dismissed = getDismissed();
    if (dismissed.includes(upcoming.key)) return;

    const container = document.getElementById("trialBanner");
    if (!container) return;
    const existingTaxReminder = container.querySelector(".tax-reminder-banner");
    if (existingTaxReminder) existingTaxReminder.remove();

    const dateStr = upcoming.deadline.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const daysMsg = upcoming.diffDays === 0 ? "today" : `in ${upcoming.diffDays} day${upcoming.diffDays === 1 ? "" : "s"}`;
    const estimatedAmount = getEstimatedAmount();

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
    const text = document.createElement("span");
    text.className = "trial-banner-text";

    const title = document.createElement("strong");
    title.textContent = `${upcoming.quarter} estimated taxes are due ${dateStr}`;
    text.appendChild(title);
    text.appendChild(document.createTextNode(` — ${daysMsg}.`));

    if (estimatedAmount) {
      text.appendChild(document.createTextNode(` Current estimated amount: ${estimatedAmount}.`));
    }

    text.appendChild(document.createTextNode(" "));
    const link = document.createElement("a");
    link.href = payLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = payText;
    text.appendChild(link);
    banner.appendChild(text);

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "trial-banner-dismiss";
    dismissButton.setAttribute("aria-label", "Dismiss tax reminder");
    dismissButton.textContent = "✕";
    dismissButton.addEventListener("click", () => {
      dismiss(upcoming.key);
      banner.remove();
    });
    banner.appendChild(dismissButton);

    container.insertBefore(banner, container.firstChild);
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
