function formatLandingPrice(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

function updateLandingPricing(billingMode) {
  const isYearly = billingMode === "yearly";

  document.querySelectorAll("[data-pricing-card]").forEach((card) => {
    const amountNode = card.querySelector("[data-price-amount]");
    const periodNode = card.querySelector("[data-price-period]");
    const noteNode = card.querySelector("[data-price-note]");
    const monthlyPrice = Number(card.getAttribute("data-price-monthly") || 0);
    const yearlyMonthlyPrice = Number(card.getAttribute("data-price-yearly-monthly") || 0);
    const yearlyTotalPrice = Number(card.getAttribute("data-price-yearly-total") || 0);

    if (amountNode) {
      amountNode.textContent = isYearly
        ? formatLandingPrice(yearlyMonthlyPrice)
        : formatLandingPrice(monthlyPrice);
    }

    if (periodNode) {
      periodNode.textContent = "/ month";
    }

    if (noteNode) {
      noteNode.textContent = isYearly
        ? `Billed annually at ${formatLandingPrice(yearlyTotalPrice)}. Save 15%.`
        : `Billed monthly at ${formatLandingPrice(monthlyPrice)}.`;
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
