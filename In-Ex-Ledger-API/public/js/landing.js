function resolveLandingCurrency() {
  const region = String(
    (typeof window.getCurrentRegion === "function" && window.getCurrentRegion()) ||
    localStorage.getItem("lb_region") ||
    window.LUNA_REGION ||
    ""
  ).toLowerCase();
  return region === "ca" ? "cad" : "usd";
}

function formatLandingPrice(value, currency) {
  const amount = Number(value || 0);
  const sym = (currency || "usd").toLowerCase() === "cad" ? "CA$" : "$";
  return `${sym}${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

function updateLandingPricing(billingMode) {
  const isYearly = billingMode === "yearly";
  const currency = resolveLandingCurrency();
  const isCAD = currency === "cad";

  document.querySelectorAll("[data-pricing-card]").forEach((card) => {
    const amountNode = card.querySelector("[data-price-amount]");
    const periodNode = card.querySelector("[data-price-period]");
    const noteNode = card.querySelector("[data-price-note]");

    const monthlyPrice = Number(
      (isCAD ? card.getAttribute("data-price-monthly-cad") : null) ||
      card.getAttribute("data-price-monthly") || 0
    );
    const yearlyMonthlyPrice = Number(
      (isCAD ? card.getAttribute("data-price-yearly-monthly-cad") : null) ||
      card.getAttribute("data-price-yearly-monthly") || 0
    );
    const yearlyTotalPrice = Number(
      (isCAD ? card.getAttribute("data-price-yearly-total-cad") : null) ||
      card.getAttribute("data-price-yearly-total") || 0
    );

    if (amountNode) {
      amountNode.textContent = isYearly
        ? formatLandingPrice(yearlyMonthlyPrice, currency)
        : formatLandingPrice(monthlyPrice, currency);
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

document.addEventListener("DOMContentLoaded", () => {
  const toggleButtons = Array.from(document.querySelectorAll("[data-billing-toggle]"));
  if (!toggleButtons.length) {
    return;
  }

  const setBillingMode = (billingMode) => {
    toggleButtons.forEach((button) => {
      const isActive = button.getAttribute("data-billing-toggle") === billingMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    updateLandingPricing(billingMode);
  };

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setBillingMode(button.getAttribute("data-billing-toggle") || "monthly");
    });
  });

  setBillingMode("monthly");
});
