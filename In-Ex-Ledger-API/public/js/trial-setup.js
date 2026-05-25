(function () {
  const billingPricingUtils = window.billingPricing || {};
  const BILLING_INTERVALS = billingPricingUtils.BILLING_INTERVALS || ["monthly", "yearly"];
  const MAX_ADDITIONAL_BUSINESSES = 100;
  const PENDING_CHOICE_KEY = "lb_pending_pricing_choice";
  const SUCCESS_POLL_WINDOW_MS = 15000;
  const SUCCESS_POLL_INTERVAL_MS = 1500;

  const state = {
    billingInterval: "monthly",
    currency: "usd",
    additionalBusinesses: 0,
    subscription: null,
    isCheckoutLoading: false,
    isBasicSelectionLoading: false,
    verifiedPricing: null,
    verifiedPricingCurrency: null
  };

  function safeInternalPath(value, fallback) {
    const next = String(value || "").trim();
    if (!next.startsWith("/") || next.startsWith("//") || /[\r\n]/.test(next)) {
      return fallback;
    }
    return next;
  }

  function resolveNextPath() {
    const params = new URLSearchParams(window.location.search);
    return safeInternalPath(params.get("next"), "/transactions");
  }

  function buildReturnPath() {
    return `/trial-setup?next=${encodeURIComponent(resolveNextPath())}`;
  }

  function setStatus(message, tone) {
    const node = document.getElementById("trialSetupStatus");
    if (!node) {
      return;
    }
    node.textContent = String(message || "").trim();
    node.className = "trial-setup-status";
    if (!message) {
      node.classList.add("hidden");
      return;
    }
    node.classList.add(`is-${tone || "warning"}`);
  }

  function clearPendingChoice() {
    try {
      sessionStorage.removeItem(PENDING_CHOICE_KEY);
    } catch (_) {
      // Ignore storage cleanup failures.
    }
  }

  function consumePendingChoice() {
    try {
      const raw = sessionStorage.getItem(PENDING_CHOICE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.billingInterval && BILLING_INTERVALS.includes(parsed.billingInterval)) {
        state.billingInterval = parsed.billingInterval;
      }
      const additional = Number(parsed?.additionalBusinesses);
      if (Number.isSafeInteger(additional) && additional >= 0) {
        state.additionalBusinesses = Math.min(additional, MAX_ADDITIONAL_BUSINESSES);
      }
    } catch (_) {
      // Ignore storage parse failures.
    }
  }

  function formatMoney(currency, amount) {
    if (typeof billingPricingUtils.formatMoney === "function") {
      return billingPricingUtils.formatMoney(currency, amount);
    }
    return String(amount || 0);
  }

  function getPricingDetails() {
    if (
      state.verifiedPricing?.[state.billingInterval] &&
      state.verifiedPricingCurrency === state.currency
    ) {
      return state.verifiedPricing[state.billingInterval];
    }
    if (typeof billingPricingUtils.getPricing === "function") {
      return billingPricingUtils.getPricing(state.currency, state.billingInterval);
    }
    return { base: 0, addon: 0 };
  }

  function getAddonTotal() {
    if (typeof billingPricingUtils.getAddonTotal === "function") {
      return billingPricingUtils.getAddonTotal(state.currency, state.billingInterval, state.additionalBusinesses);
    }
    const pricing = getPricingDetails();
    return pricing.addon * state.additionalBusinesses;
  }

  function getGrandTotal() {
    if (typeof billingPricingUtils.getGrandTotal === "function") {
      return billingPricingUtils.getGrandTotal(state.currency, state.billingInterval, state.additionalBusinesses);
    }
    const pricing = getPricingDetails();
    return pricing.base + getAddonTotal();
  }

  function clampAdditionalBusinesses(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(Math.max(Math.trunc(value), 0), MAX_ADDITIONAL_BUSINESSES);
  }

  async function loadVerifiedPricing() {
    try {
      const res = await fetch("/api/billing/pricing", {
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        return;
      }
      const payload = await res.json().catch(() => null);
      const currency = String(payload?.currency || "").toLowerCase();
      if (currency) {
        state.currency = currency;
        state.verifiedPricingCurrency = currency;
      }
      if (payload?.pricing?.monthly && payload?.pricing?.yearly) {
        state.verifiedPricing = payload.pricing;
      }
    } catch (_) {
      // Ignore pricing preload failures and fall back to static values.
    }
  }

  async function loadSubscription() {
    const res = await apiFetch("/api/billing/subscription");
    const payload = await res?.json()?.catch(() => null);
    if (!res || !res.ok || !payload?.subscription) {
      throw new Error(payload?.error || "Unable to load billing state.");
    }
    state.subscription = payload.subscription;
    if (state.subscription?.currency) {
      state.currency = String(state.subscription.currency).toLowerCase();
    }
    if (state.subscription?.billingInterval && BILLING_INTERVALS.includes(state.subscription.billingInterval)) {
      state.billingInterval = state.subscription.billingInterval;
    }
    if (typeof applySubscriptionState === "function") {
      applySubscriptionState(state.subscription);
    }
    return state.subscription;
  }

  function updateHeroCopy() {
    const sub = state.subscription;
    const lead = document.getElementById("trialSetupLead");
    const continueLink = document.getElementById("trialSetupContinueLink");
    const nextPath = resolveNextPath();
    if (continueLink) {
      continueLink.href = nextPath;
    }
    if (!lead || !sub?.trialEndsAt) {
      return;
    }
    const ends = new Date(sub.trialEndsAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    if (sub.stripeSubscriptionId) {
      lead.textContent = `Your Pro billing is already set up. Trial access stays active now, and the first Stripe charge is scheduled for ${ends} unless you cancel first.`;
      return;
    }
    if (sub.isTrialDowngradedToFree) {
      lead.textContent = `Your workspace is currently set to fall back to Basic on ${ends}. You can still secure Pro billing now if you want uninterrupted paid access after the trial.`;
      return;
    }
    lead.textContent = `Add your payment method now. You will not be charged today. Billing begins on ${ends} unless you cancel before then.`;
  }

  function updateUi() {
    const pricing = getPricingDetails();
    const baseAmount = document.getElementById("trialSetupBaseAmount");
    const addonAmount = document.getElementById("trialSetupAddonAmount");
    const totalAmount = document.getElementById("trialSetupTotalAmount");
    const addonUnitNote = document.getElementById("trialSetupAddonUnitNote");
    const summaryNote = document.getElementById("trialSetupSummaryNote");
    const checkoutBtn = document.getElementById("trialSetupCheckoutBtn");
    const basicBtn = document.getElementById("trialSetupBasicBtn");
    const skipBtn = document.getElementById("trialSetupSkipBtn");
    const continueLink = document.getElementById("trialSetupContinueLink");
    const addonUnitText = formatMoney(state.currency, pricing.addon);
    const intervalLabel = state.billingInterval === "yearly" ? "year" : "month";

    document.querySelectorAll("[data-billing-interval]").forEach((btn) => {
      const isActive = btn.getAttribute("data-billing-interval") === state.billingInterval;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    const addInput = document.getElementById("trialSetupAdditionalBusinesses");
    if (addInput) {
      addInput.value = String(state.additionalBusinesses);
    }
    const minusBtn = document.getElementById("trialSetupAdditionalBusinessesMinus");
    const plusBtn = document.getElementById("trialSetupAdditionalBusinessesPlus");
    if (minusBtn) minusBtn.disabled = state.additionalBusinesses <= 0 || state.isCheckoutLoading;
    if (plusBtn) plusBtn.disabled = state.additionalBusinesses >= MAX_ADDITIONAL_BUSINESSES || state.isCheckoutLoading;
    if (baseAmount) baseAmount.textContent = formatMoney(state.currency, pricing.base);
    if (addonAmount) {
      addonAmount.textContent = state.additionalBusinesses > 0
        ? `${state.additionalBusinesses} x ${addonUnitText}`
        : formatMoney(state.currency, 0);
    }
    if (totalAmount) totalAmount.textContent = formatMoney(state.currency, getGrandTotal());
    if (addonUnitNote) addonUnitNote.textContent = `Each additional business is billed at ${addonUnitText} per ${intervalLabel} on the same cycle as Pro.`;
    if (summaryNote) summaryNote.textContent = `Final pricing is verified by the server before Stripe checkout starts. ${state.billingInterval === "yearly" ? "Yearly pricing applies to both Pro and any additional business slots." : "You can switch to yearly before checkout if that fits better."}`;

    const hasStripeSetup = Boolean(state.subscription?.stripeSubscriptionId);
    if (checkoutBtn) {
      checkoutBtn.disabled = state.isCheckoutLoading || hasStripeSetup;
      checkoutBtn.textContent = state.isCheckoutLoading
        ? "Opening secure checkout..."
        : hasStripeSetup
          ? "Pro billing is already set up"
          : "Continue to secure checkout";
    }
    if (basicBtn) {
      basicBtn.disabled = state.isBasicSelectionLoading;
      basicBtn.textContent = state.isBasicSelectionLoading
        ? "Saving Basic selection..."
        : state.subscription?.isTrialDowngradedToFree
          ? "Basic is already selected after trial"
          : "Continue with Basic after trial";
    }
    if (skipBtn) {
      skipBtn.disabled = false;
      skipBtn.textContent = hasStripeSetup ? "Continue to app" : "Decide later";
    }
    if (continueLink) {
      continueLink.classList.toggle("hidden", !hasStripeSetup);
    }
    updateHeroCopy();
  }

  async function waitForStripeSetup() {
    const deadline = Date.now() + SUCCESS_POLL_WINDOW_MS;
    let latest = null;
    while (Date.now() < deadline) {
      latest = await loadSubscription();
      if (latest?.stripeSubscriptionId) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_POLL_INTERVAL_MS));
    }
    return latest;
  }

  async function startCheckout() {
    if (state.isCheckoutLoading || state.subscription?.stripeSubscriptionId) {
      return;
    }
    setStatus("", "warning");
    state.isCheckoutLoading = true;
    updateUi();
    try {
      const res = await apiFetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingInterval: state.billingInterval,
          additionalBusinesses: state.additionalBusinesses,
          returnPath: buildReturnPath()
        })
      });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Unable to start secure checkout.");
      }
      clearPendingChoice();
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      throw new Error("Stripe checkout did not return a URL.");
    } catch (error) {
      setStatus(error.message || "Unable to start secure checkout.", "error");
      state.isCheckoutLoading = false;
      updateUi();
    }
  }

  async function continueWithBasic() {
    if (state.isBasicSelectionLoading) {
      return;
    }
    setStatus("", "warning");
    state.isBasicSelectionLoading = true;
    updateUi();
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Unable to save the Basic selection.");
      }
      state.subscription = payload?.subscription || state.subscription;
      if (typeof applySubscriptionState === "function" && state.subscription) {
        applySubscriptionState(state.subscription);
      }
      clearPendingChoice();
      updateUi();
      window.location.href = resolveNextPath();
    } catch (error) {
      setStatus(error.message || "Unable to save the Basic selection.", "error");
    } finally {
      state.isBasicSelectionLoading = false;
      updateUi();
    }
  }

  function wireControls() {
    document.querySelectorAll("[data-billing-interval]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextInterval = String(btn.getAttribute("data-billing-interval") || "").toLowerCase();
        if (!BILLING_INTERVALS.includes(nextInterval) || state.isCheckoutLoading) {
          return;
        }
        state.billingInterval = nextInterval;
        updateUi();
      });
    });

    const addInput = document.getElementById("trialSetupAdditionalBusinesses");
    addInput?.addEventListener("input", () => {
      state.additionalBusinesses = clampAdditionalBusinesses(Number(addInput.value));
      updateUi();
    });

    document.getElementById("trialSetupAdditionalBusinessesMinus")?.addEventListener("click", () => {
      state.additionalBusinesses = clampAdditionalBusinesses(state.additionalBusinesses - 1);
      updateUi();
    });

    document.getElementById("trialSetupAdditionalBusinessesPlus")?.addEventListener("click", () => {
      state.additionalBusinesses = clampAdditionalBusinesses(state.additionalBusinesses + 1);
      updateUi();
    });

    document.getElementById("trialSetupCheckoutBtn")?.addEventListener("click", startCheckout);
    document.getElementById("trialSetupBasicBtn")?.addEventListener("click", continueWithBasic);
    document.getElementById("trialSetupSkipBtn")?.addEventListener("click", () => {
      window.location.href = resolveNextPath();
    });
  }

  async function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");
    if (checkoutState === "cancel") {
      setStatus("Stripe checkout was canceled. You can continue with Basic after trial or try again when you are ready.", "warning");
      return;
    }
    if (checkoutState !== "success") {
      return;
    }

    setStatus("Stripe checkout completed. Confirming your trial billing setup now...", "success");
    const sub = await waitForStripeSetup();
    updateUi();
    if (sub?.stripeSubscriptionId) {
      setStatus("Your Pro trial billing is set up. Continuing to the app...", "success");
      clearPendingChoice();
      window.setTimeout(() => {
        window.location.href = resolveNextPath();
      }, 900);
      return;
    }
    setStatus("Checkout succeeded, but billing is still syncing. You can continue now or refresh this page in a moment.", "warning");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof requireValidSessionOrRedirect === "function") {
      await requireValidSessionOrRedirect();
    }
    if (!window.__LUNA_ME__?.onboarding?.completed) {
      window.location.href = "/onboarding";
      return;
    }

    consumePendingChoice();
    wireControls();
    await loadVerifiedPricing();
    await loadSubscription();
    updateUi();
    await handleCheckoutReturn();
  });
})();
