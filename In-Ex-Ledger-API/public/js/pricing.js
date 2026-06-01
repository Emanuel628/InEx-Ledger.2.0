const pricingState = {
  currency: "usd",
  interval: "monthly",
  additionalBusinesses: 0,
  verifiedPricing: null,
  verifiedPricingCurrency: null
};

const billingPricingUtils = window.billingPricing || {};
const BILLING_CURRENCIES = billingPricingUtils.BILLING_CURRENCIES || ["usd", "cad"];
const MAX_ADDITIONAL_BUSINESSES = 100;

function formatMoney(currency, amount) {
  if (typeof billingPricingUtils.formatMoney === "function") {
    return billingPricingUtils.formatMoney(currency, amount);
  }
  return String(amount || 0);
}

function getCurrentPricing() {
  if (
    pricingState.verifiedPricing?.[pricingState.interval] &&
    pricingState.verifiedPricingCurrency === pricingState.currency
  ) {
    return pricingState.verifiedPricing[pricingState.interval];
  }
  if (typeof billingPricingUtils.getPricing === "function") {
    return billingPricingUtils.getPricing(pricingState.currency, pricingState.interval);
  }
  return { base: 0, addon: 0, label: "per month" };
}

function getAddonTotal() {
  const pricing = getCurrentPricing();
  return pricing.addon * pricingState.additionalBusinesses;
}

function getGrandTotal() {
  const pricing = getCurrentPricing();
  return pricing.base + getAddonTotal();
}

function setActiveToggle(selector, activeValue, attrName) {
  document.querySelectorAll(selector).forEach((btn) => {
    const isActive = btn.getAttribute(attrName) === activeValue;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

async function loadVerifiedPricingContext() {
  try {
    const res = await fetch("/api/billing/pricing-context", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      return pricingState.currency;
    }
    const payload = await res.json().catch(() => null);
    const currency = String(payload?.currency || "").toLowerCase();
    if (BILLING_CURRENCIES.includes(currency)) {
      pricingState.currency = currency;
    }
  } catch (_) {
    // Fall back to the default pricing table currency.
  }
  return pricingState.currency;
}

async function loadVerifiedPricing() {
  try {
    const res = await fetch("/api/billing/pricing", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      return loadVerifiedPricingContext();
    }
    const payload = await res.json().catch(() => null);
    const currency = String(payload?.currency || "").toLowerCase();
    if (BILLING_CURRENCIES.includes(currency)) {
      pricingState.currency = currency;
      pricingState.verifiedPricingCurrency = currency;
    }
    if (payload?.pricing?.monthly && payload?.pricing?.yearly) {
      pricingState.verifiedPricing = payload.pricing;
    }
  } catch (_) {
    return loadVerifiedPricingContext();
  }
  return pricingState.currency;
}

function updateCtaLabels() {
  const isAuthed = typeof isAuthenticated === "function" && isAuthenticated();
  const primaryButtons = [
    document.getElementById("heroPrimaryCta"),
    document.getElementById("starterCtaBtn"),
    document.getElementById("v1CtaBtn"),
    document.getElementById("finalPrimaryCta")
  ].filter(Boolean);

  const buttonText = isAuthed
    ? "Upgrade to Pro now"
    : "Start 30-day Pro trial";

  primaryButtons.forEach((btn) => {
    btn.textContent = buttonText;
  });

  const helper = document.getElementById("planHelperText");
  if (helper) {
    helper.textContent = isAuthed
      ? "You're signed in. This button launches secure checkout for your selected Pro setup."
      : "Create your account first. After onboarding, Stripe checkout appears immediately so you can secure the Pro trial without having to remember later.";
  }

  const footnote = document.getElementById("heroFootnote");
  if (footnote) {
    footnote.textContent = isAuthed
      ? "Signed in already? Pick your billing setup below and launch checkout."
      : "Finish setup first. Billing confirmation happens right after onboarding, and no charge is due today.";
  }
}

function renderPricing() {
  const pricing = getCurrentPricing();
  const baseText = formatMoney(pricingState.currency, pricing.base);
  const addonUnitText = formatMoney(pricingState.currency, pricing.addon);
  const addonTotalText = formatMoney(pricingState.currency, getAddonTotal());
  const grandTotalText = formatMoney(pricingState.currency, getGrandTotal());
  const addonCycleText = `${addonUnitText} / ${pricingState.interval === "yearly" ? "year" : "month"}`;

  const v1PriceDisplay = document.getElementById("v1PriceDisplay");
  const v1PriceSubcopy = document.getElementById("v1PriceSubcopy");
  const basePlanAmount = document.getElementById("basePlanAmount");
  const addonAmount = document.getElementById("addonAmount");
  const grandTotalAmount = document.getElementById("grandTotalAmount");
  const totalFootnote = document.getElementById("totalFootnote");
  const addonNote = document.querySelector(".pricing-addon-note");

  if (v1PriceDisplay) v1PriceDisplay.textContent = baseText;
  if (v1PriceSubcopy) v1PriceSubcopy.textContent = pricing.label;
  if (basePlanAmount) basePlanAmount.textContent = baseText;
  if (addonAmount) addonAmount.textContent = addonTotalText;
  if (grandTotalAmount) grandTotalAmount.textContent = grandTotalText;
  if (addonNote) {
    addonNote.textContent = `Add another business only when you need it. Each additional business is billed at ${addonCycleText} on the same cycle you choose for Pro.`;
  }

  if (totalFootnote) {
    const intervalLabel = pricingState.interval === "yearly" ? "yearly" : "monthly";
    totalFootnote.textContent =
      pricingState.additionalBusinesses > 0
        ? `Base Pro ${intervalLabel} pricing plus ${pricingState.additionalBusinesses} additional business ${pricingState.additionalBusinesses === 1 ? "slot" : "slots"} at ${addonUnitText} each. Final checkout pricing is verified by the server.`
        : `Base Pro ${intervalLabel} pricing only. Finish onboarding first, then confirm billing in Stripe to secure the trial. Final checkout pricing is verified by the server.`;
  }

  setActiveToggle("[data-interval]", pricingState.interval, "data-interval");
}

function clampAdditionalBusinesses(value) {
  const next = Number.parseInt(value, 10);
  if (Number.isNaN(next) || next < 0) return 0;
  if (next > MAX_ADDITIONAL_BUSINESSES) return MAX_ADDITIONAL_BUSINESSES;
  return next;
}

function persistPendingChoice() {
  sessionStorage.setItem(
    "lb_pending_pricing_choice",
    JSON.stringify({
      plan: "v1",
      billingInterval: pricingState.interval,
      additionalBusinesses: pricingState.additionalBusinesses
    })
  );
}

async function launchCheckout() {
  const button = document.getElementById("v1CtaBtn");
  const originalText = button?.textContent || "";

  if (typeof isAuthenticated !== "function" || !isAuthenticated()) {
    persistPendingChoice();
    window.location.href = "/register";
    return;
  }

  try {
    await loadVerifiedPricingContext();
    if (button) {
      button.disabled = true;
      button.textContent = "Launching secure checkout...";
    }

    const res = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingInterval: pricingState.interval,
        additionalBusinesses: pricingState.additionalBusinesses
      })
    });

    if (!res) {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      return;
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }

    if (payload?.url) {
      window.location.href = payload.url;
      return;
    }

    throw new Error("Stripe checkout did not return a URL.");
  } catch (err) {
    const errorEl = document.getElementById("pricingCheckoutError");
    if (errorEl) {
      errorEl.textContent = err.message || "Unable to start checkout.";
      errorEl.classList.remove("hidden");
    }
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function startTrial() {
  persistPendingChoice();
  window.location.href = "/register";
}

function wirePrimaryButtons() {
  document.getElementById("heroPrimaryCta")?.addEventListener("click", startTrial);
  document.getElementById("starterCtaBtn")?.addEventListener("click", startTrial);
  document.getElementById("finalPrimaryCta")?.addEventListener("click", startTrial);
  document.getElementById("v1CtaBtn")?.addEventListener("click", launchCheckout);
}

function wireToggles() {
  document.querySelectorAll("[data-interval]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pricingState.interval = btn.getAttribute("data-interval") || "monthly";
      renderPricing();
    });
  });
}

function wireAdditionalBusinesses() {
  const input = document.getElementById("additionalBusinessesInput");
  const minus = document.getElementById("additionalBusinessMinus");
  const plus = document.getElementById("additionalBusinessPlus");

  if (!input) return;

  const sync = (nextValue) => {
    pricingState.additionalBusinesses = clampAdditionalBusinesses(nextValue);
    input.value = String(pricingState.additionalBusinesses);
    renderPricing();
  };

  input.addEventListener("input", () => sync(input.value));
  minus?.addEventListener("click", () => sync(pricingState.additionalBusinesses - 1));
  plus?.addEventListener("click", () => sync(pricingState.additionalBusinesses + 1));
}

document.addEventListener("DOMContentLoaded", async () => {
  wirePrimaryButtons();
  wireToggles();
  wireAdditionalBusinesses();
  updateCtaLabels();
  await loadVerifiedPricing();
  renderPricing();
});
