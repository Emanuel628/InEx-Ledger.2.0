const SUB_TOAST_MS = 3000;
let subToastTimer = null;
const billingPricingUtils = window.billingPricing || {};
const BILLING_INTERVALS = billingPricingUtils.BILLING_INTERVALS || ["monthly", "yearly"];
const BILLING_CURRENCIES = billingPricingUtils.BILLING_CURRENCIES || ["usd", "cad"];
const MAX_ADDITIONAL_BUSINESSES = 100;
const pricingState = {
  billingInterval: "monthly",
  currency: "usd",
  additionalBusinesses: 0,
  isCheckoutLoading: false,
  verifiedPricing: null,
  verifiedPricingCurrency: null
};
let currentSubscription = null;
let pendingDeleteBusinessId = null;
let subscriptionBusinessesState = {
  isLoaded: false,
  error: "",
  items: [],
  activeBusinessId: "",
  billingOwnerBusinessId: ""
};
const businessSlotsState = {
  currentAdditionalBusinesses: 0,
  selectedAdditionalBusinesses: 0,
  isSaving: false
};

function syncSubscriptionBusinessesState(sub = currentSubscription) {
  const profile = window.__LUNA_ME__ && typeof window.__LUNA_ME__ === "object" ? window.__LUNA_ME__ : {};
  const businesses = typeof getBusinessCollection === "function"
    ? getBusinessCollection(profile)
    : (Array.isArray(profile.businesses) ? profile.businesses : []);
  const activeBusiness = typeof getActiveBusiness === "function"
    ? getActiveBusiness(profile)
    : (profile.active_business || null);

  subscriptionBusinessesState = {
    isLoaded: true,
    error: "",
    items: Array.isArray(businesses) ? businesses : [],
    activeBusinessId: activeBusiness?.id || profile.active_business_id || profile.business_id || "",
    billingOwnerBusinessId: sub?.businessId || ""
  };
}

function showSubToast(message) {
  const toast = document.getElementById("subToast");
  const msg = document.getElementById("subToastMessage");
  if (!toast || !msg) return;
  msg.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(subToastTimer);
  subToastTimer = setTimeout(() => toast.classList.add("hidden"), SUB_TOAST_MS);
}

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function fmtDate(ts) {
  if (!ts) return "-";
  const ms = typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
  if (Number.isNaN(ms)) return "-";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtAmount(amount, currency) {
  const normalizedCurrency = String(currency || "usd").toUpperCase();
  const value = Number(amount || 0) / 100;
  if (!Number.isFinite(value)) return "-";
  const locale = normalizedCurrency === "CAD" ? "en-CA" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: normalizedCurrency }).format(value);
  } catch (_) {
    return `${normalizedCurrency} ${value.toFixed(2)}`;
  }
}

function formatMoney(currency, amount) {
  if (typeof billingPricingUtils.formatMoney === "function") {
    return billingPricingUtils.formatMoney(currency, amount);
  }
  return fmtAmount(Math.round(Number(amount || 0) * 100), currency);
}

function getPricingDetails() {
  if (
    pricingState.verifiedPricing?.[pricingState.billingInterval] &&
    pricingState.verifiedPricingCurrency === pricingState.currency
  ) {
    return pricingState.verifiedPricing[pricingState.billingInterval];
  }
  if (typeof billingPricingUtils.getPricing === "function") {
    return billingPricingUtils.getPricing(pricingState.currency, pricingState.billingInterval);
  }
  return { base: 0, addon: 0, labelKey: "subscription_billing_monthly" };
}

function getAddonTotalAmount() {
  if (
    pricingState.verifiedPricing?.[pricingState.billingInterval] &&
    pricingState.verifiedPricingCurrency === pricingState.currency
  ) {
    const pricing = getPricingDetails();
    return pricing.addon * pricingState.additionalBusinesses;
  }
  if (typeof billingPricingUtils.getAddonTotal === "function") {
    return billingPricingUtils.getAddonTotal(
      pricingState.currency,
      pricingState.billingInterval,
      pricingState.additionalBusinesses
    );
  }
  return 0;
}

function getGrandTotalAmount() {
  if (
    pricingState.verifiedPricing?.[pricingState.billingInterval] &&
    pricingState.verifiedPricingCurrency === pricingState.currency
  ) {
    const pricing = getPricingDetails();
    return pricing.base + getAddonTotalAmount();
  }
  if (typeof billingPricingUtils.getGrandTotal === "function") {
    return billingPricingUtils.getGrandTotal(
      pricingState.currency,
      pricingState.billingInterval,
      pricingState.additionalBusinesses
    );
  }
  return 0;
}

function clampAdditionalBusinesses(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_ADDITIONAL_BUSINESSES);
}

async function loadVerifiedPricingContext() {
  try {
    const res = await apiFetch("/api/billing/pricing-context");
    if (!res || !res.ok) {
      return pricingState.currency;
    }
    const payload = await res.json().catch(() => null);
    const currency = String(payload?.currency || "").toLowerCase();
    if (BILLING_CURRENCIES.includes(currency)) {
      pricingState.currency = currency;
      pricingState.verifiedPricingCurrency = currency;
    }
  } catch (_) {
    // Fall back to the default pricing table currency.
  }
  return pricingState.currency;
}

async function loadVerifiedPricing() {
  try {
    const res = await apiFetch("/api/billing/pricing");
    if (!res || !res.ok) {
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

function isAllowedBillingRedirect(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "https:" && (
      parsed.hostname === "checkout.stripe.com" ||
      parsed.hostname === "billing.stripe.com"
    );
  } catch (_) {
    return false;
  }
}

function updatePricingUI() {
  const intervalButtons = Array.from(document.querySelectorAll("[data-billing-interval]"));
  const additionalInput = document.getElementById("additionalBusinessesInput");
  const planPriceLabel = document.getElementById("planProPriceLabel");
  const addonPriceLabel = document.getElementById("planProAddonPriceLabel");
  const summaryPlan = document.getElementById("subPricePlan");
  const summaryAddon = document.getElementById("subPriceAddon");
  const summaryTotal = document.getElementById("subPriceTotal");
  const summaryNote = document.getElementById("subPriceNote");
  const decrementBtn = document.querySelector("[data-qty-action='decrease']");
  const incrementBtn = document.querySelector("[data-qty-action='increase']");

  intervalButtons.forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.billingInterval === pricingState.billingInterval)
  );

  if (additionalInput) {
    additionalInput.value = String(pricingState.additionalBusinesses);
  }
  if (decrementBtn) {
    decrementBtn.disabled = pricingState.additionalBusinesses <= 0;
  }
  if (incrementBtn) {
    incrementBtn.disabled = pricingState.additionalBusinesses >= MAX_ADDITIONAL_BUSINESSES;
  }

  const pricing = getPricingDetails();
  const noteIntervalLabel = tx(pricing.labelKey || "subscription_billing_monthly").toLowerCase();
  const intervalPriceLabel = tx(
    pricingState.billingInterval === "yearly"
      ? "subscription_interval_suffix_yearly"
      : "subscription_interval_suffix_monthly"
  );
  const baseText = formatMoney(pricingState.currency, pricing.base);
  const addonUnitText = formatMoney(pricingState.currency, pricing.addon);
  const addonTotalText = formatMoney(pricingState.currency, getAddonTotalAmount());
  const totalText = formatMoney(pricingState.currency, getGrandTotalAmount());
  const planSummaryText = `${baseText} ${intervalPriceLabel}`;

  if (planPriceLabel) {
    planPriceLabel.textContent = planSummaryText;
  }
  if (addonPriceLabel) {
    addonPriceLabel.textContent = tx("subscription_additional_businesses_from")
      .replace("{price}", `${addonUnitText} ${intervalPriceLabel}`);
  }
  if (summaryPlan) {
    summaryPlan.textContent = planSummaryText;
  }
  if (summaryAddon) {
    summaryAddon.textContent = pricingState.additionalBusinesses > 0
      ? `${pricingState.additionalBusinesses} x ${addonUnitText} = ${addonTotalText}`
      : tx("subscription_additional_businesses_none");
  }
  if (summaryTotal) {
    summaryTotal.textContent = totalText;
  }
  if (summaryNote) {
    summaryNote.textContent = tx("subscription_price_summary_note_verified")
      .replace("{interval}", noteIntervalLabel)
      .replace("{currency}", pricingState.currency.toUpperCase());
  }
}

async function initPricingControls() {
  pricingState.billingInterval = "monthly";
  pricingState.additionalBusinesses = 0;
  pricingState.verifiedPricing = null;
  pricingState.verifiedPricingCurrency = null;
  await loadVerifiedPricing();

  document.querySelectorAll("[data-billing-interval]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const interval = String(btn.dataset.billingInterval || "").toLowerCase();
      if (!BILLING_INTERVALS.includes(interval)) return;
      pricingState.billingInterval = interval;
      updatePricingUI();
    });
  });

  const additionalInput = document.getElementById("additionalBusinessesInput");
  if (additionalInput) {
    additionalInput.addEventListener("input", () => {
      pricingState.additionalBusinesses = clampAdditionalBusinesses(Number(additionalInput.value));
      updatePricingUI();
    });
    additionalInput.addEventListener("change", () => {
      pricingState.additionalBusinesses = clampAdditionalBusinesses(Number(additionalInput.value));
      updatePricingUI();
    });
  }

  document.querySelectorAll("[data-qty-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.qtyAction;
      const delta = action === "increase" ? 1 : action === "decrease" ? -1 : 0;
      pricingState.additionalBusinesses = clampAdditionalBusinesses(pricingState.additionalBusinesses + delta);
      updatePricingUI();
    });
  });

  updatePricingUI();
}

function setCheckoutLoading(isLoading) {
  pricingState.isCheckoutLoading = isLoading;
  const planProBtn = document.getElementById("planProBtn");
  const defaultLabel = planProBtn?.dataset.defaultLabel || planProBtn?.textContent || "";
  if (isLoading) {
    if (planProBtn) {
      planProBtn.disabled = true;
      planProBtn.textContent = tx("subscription_checkout_loading");
    }
  } else {
    if (planProBtn) {
      planProBtn.disabled = planProBtn.dataset.planDisabled === "true";
      planProBtn.textContent = defaultLabel;
    }
  }
}

function updatePlanCardState(sub) {
  const planFree = document.getElementById("planFree");
  const planPro = document.getElementById("planPro");
  const selectedPlanCode = sub?.selectedPlanCode || sub?.planCode || (sub?.effectiveTier === "v1" ? "v1" : "free");
  const isCurrentFree = !sub || !!sub.cancelAtPeriodEnd || !!sub?.isCanceledWithRemainingAccess || selectedPlanCode !== "v1";
  const isCurrentPro = !!sub && !sub.cancelAtPeriodEnd && !sub.isCanceledWithRemainingAccess && selectedPlanCode === "v1";

  planFree?.classList.toggle("is-current", isCurrentFree);
  planPro?.classList.toggle("is-current", isCurrentPro);
}

function getSelectedPlanCode(sub) {
  return sub?.selectedPlanCode || sub?.planCode || (sub?.effectiveTier === "v1" ? "v1" : "free");
}

function getPrimaryPlanAction(sub) {
  if (!sub) {
    return { mode: "checkout", label: tx("subscription_pro_cta"), disabled: false };
  }

  const selectedPlanCode = getSelectedPlanCode(sub);
  const status = String(sub.status || sub.effectiveStatus || "").toLowerCase();

  if (status === "unpaid" && sub.stripeSubscriptionId) {
    return { mode: "portal", label: "Update payment method", disabled: false };
  }

  if (sub.isPaid && sub.cancelAtPeriodEnd && sub.stripeSubscriptionId && !sub.isTrialing) {
    return { mode: "resume", label: "Keep Pro active", disabled: false };
  }

  if (sub.isPaid && !sub.cancelAtPeriodEnd && !sub.isCanceledWithRemainingAccess) {
    return { mode: "current", label: tx("subscription_current_plan"), disabled: true };
  }

  if (sub.isTrialing && selectedPlanCode !== "v1") {
    return { mode: "checkout", label: "Continue with Pro", disabled: false };
  }

  if (sub.isTrialing) {
    return { mode: "checkout", label: "Set up Pro billing", disabled: false };
  }

  if (sub.isCanceledWithRemainingAccess) {
    return { mode: "checkout", label: "Start a new Pro cycle", disabled: false };
  }

  return { mode: "checkout", label: tx("subscription_pro_cta"), disabled: false };
}

function buildStatusPanelMarkup(sub) {
  if (!sub) {
    return `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
  }

  let badgeClass = "sub-badge-free";
  let badgeLabel = tx("sub_mgmt_badge_free");
  let headline = "Basic plan";
  let detail = tx("sub_mgmt_free_desc");

  if (sub.isTrialing && sub.trialEndsAt) {
    badgeClass = "sub-badge-trial";
    badgeLabel = tx("sub_mgmt_badge_trial");
    headline = `Pro trial ends ${fmtDate(sub.trialEndsAt)}`;
    detail = getSelectedPlanCode(sub) !== "v1"
      ? `Basic is selected after trial, but Pro access stays live until ${fmtDate(sub.trialEndsAt)}.`
      : "Finish billing setup before the trial ends to avoid interruption.";
  } else if (String(sub.status || "").toLowerCase() === "unpaid") {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Payment required";
    headline = "Unpaid subscription needs attention";
    detail = "Open Stripe billing to update your payment method and resolve the unpaid invoice before starting another checkout.";
  } else if (String(sub.status || "").toLowerCase() === "past_due" && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Past due";
    headline = `Payment issue before ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Update your payment method or open Stripe billing to keep Pro active without interruption.";
  } else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = tx("sub_mgmt_badge_canceling");
    headline = `Pro access stays on until ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Renewal is off. You can keep the current Pro subscription active without starting a second checkout.";
  } else if (sub.isPaid && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-active";
    badgeLabel = tx("sub_mgmt_badge_pro");
    headline = `Pro renews ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Payment method, invoices, and renewal settings are managed securely in Stripe.";
  } else if (sub.isCanceledWithRemainingAccess && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Ended in Stripe";
    headline = `Access remains until ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Your last Pro cycle is still available. Starting a new Pro cycle creates fresh billing in Stripe.";
  }

  const additionalBusinesses = Number(sub.additionalBusinesses || 0);
  const totalBusinesses = 1 + additionalBusinesses;
  const billingIntervalLabel = sub.billingInterval === "yearly" ? "Yearly" : "Monthly";
  const currencyLabel = String(sub.currency || pricingState.currency || "usd").toUpperCase();

  return `
    <div class="sub-status-spotlight">
      <div class="sub-status-spotlight-top">
        <span class="sub-status-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
        <span class="sub-status-plan-pill">${escapeHtml(sub.effectiveTier === "v1" ? "Pro" : "Basic")}</span>
      </div>
      <h2 class="sub-status-headline">${escapeHtml(headline)}</h2>
      <p class="sub-status-copy">${escapeHtml(detail)}</p>
      <div class="sub-status-stats">
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Billing cycle</span>
          <strong class="sub-status-stat-value">${escapeHtml(billingIntervalLabel)}</strong>
          <span class="sub-status-stat-meta">${escapeHtml(currencyLabel)} pricing</span>
        </article>
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Businesses allowed</span>
          <strong class="sub-status-stat-value">${totalBusinesses}</strong>
          <span class="sub-status-stat-meta">${additionalBusinesses > 0 ? `${additionalBusinesses} paid add-on${additionalBusinesses === 1 ? "" : "s"}` : "1 included with your plan"}</span>
        </article>
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Billing system</span>
          <strong class="sub-status-stat-value">Stripe</strong>
          <span class="sub-status-stat-meta">Portal, invoices, and payment method</span>
        </article>
      </div>
    </div>`;
}

function renderPaymentMethodCard(paymentMethod, portalAvailable) {
  const card = document.getElementById("subPaymentMethodCard");
  if (!card) return;

  let headline = "No payment method on file";
  let detail = "Add or update a payment method in Stripe when you are ready to start or renew paid billing.";

  if (paymentMethod?.type === "card") {
    const brand = String(paymentMethod.brand || "Card").replace(/_/g, " ");
    headline = `${brand} ending in ${paymentMethod.last4 || "****"}`;
    detail = paymentMethod.expMonth && paymentMethod.expYear
      ? `Expires ${String(paymentMethod.expMonth).padStart(2, "0")}/${paymentMethod.expYear}`
      : "Managed securely in Stripe.";
  } else if (paymentMethod?.type === "us_bank_account") {
    headline = `${paymentMethod.bankName || "Bank account"} ending in ${paymentMethod.last4 || "****"}`;
    detail = "Managed securely in Stripe.";
  }

  card.innerHTML = `
    <div class="sub-detail-card-head">
      <div>
        <h3>Payment method</h3>
        <p>Stripe stays the source of truth for cards, bank accounts, and billing details.</p>
      </div>
      ${portalAvailable ? '<button type="button" class="settings-secondary-btn" id="subPaymentMethodManage">Manage</button>' : ""}
    </div>
    <div class="sub-detail-card-body">
      <strong class="sub-detail-primary">${escapeHtml(headline)}</strong>
      <p class="sub-detail-secondary">${escapeHtml(detail)}</p>
    </div>
  `;

  document.getElementById("subPaymentMethodManage")?.addEventListener("click", openCustomerPortal);
}

function initSubNav() {
  const navButtons = Array.from(document.querySelectorAll("[data-settings-target]"));
  if (!navButtons.length) return;

  const targets = navButtons
    .map((btn) => ({ btn, target: document.getElementById(btn.dataset.settingsTarget || "") }))
    .filter((entry) => entry.target);

  const setActive = (id) => {
    navButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.settingsTarget === id));
  };

  targets.forEach(({ btn, target }) => {
    btn.addEventListener("click", () => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(target.id);
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.2, 0.4, 0.6] }
    );
    targets.forEach(({ target }) => observer.observe(target));
  }
}

function buildBusinessRosterMarkup(sub) {
  if (!subscriptionBusinessesState.isLoaded) {
    return `
      <div class="sub-business-roster-card">
        <div class="sub-business-roster-head">
          <div>
            <h3>Businesses on this account</h3>
            <p>Loading your businesses…</p>
          </div>
        </div>
      </div>`;
  }

  if (subscriptionBusinessesState.error) {
    return `
      <div class="sub-business-roster-card">
        <div class="sub-business-roster-head">
          <div>
            <h3>Businesses on this account</h3>
            <p class="sub-business-roster-error">${escapeHtml(subscriptionBusinessesState.error)}</p>
          </div>
        </div>
      </div>`;
  }

  const businesses = Array.isArray(subscriptionBusinessesState.items) ? subscriptionBusinessesState.items : [];
  const activeId = subscriptionBusinessesState.activeBusinessId || "";
  const billingOwnerId = subscriptionBusinessesState.billingOwnerBusinessId || sub?.businessId || "";
  const canDeleteMultiple = businesses.length > 1;

  return `
    <aside class="sub-business-roster-card">
      <div class="sub-business-roster-head">
        <div>
          <h3>Businesses on this account</h3>
          <p>Delete a specific business directly here instead of leaving billing.</p>
        </div>
        <span class="sub-business-roster-count">${businesses.length}</span>
      </div>
      <div class="sub-business-roster-list">
        ${businesses.length
          ? businesses.map((biz) => `
            <article class="sub-business-item ${biz.id === activeId ? "is-active" : ""}">
              <div class="sub-business-item-copy">
                <div class="sub-business-item-title-row">
                  <h4>${escapeHtml(biz.name || "Business")}</h4>
                  <div class="sub-business-item-badges">
                    ${biz.id === activeId ? `<span class="sub-business-badge">Active</span>` : ""}
                    ${biz.id === billingOwnerId ? `<span class="sub-business-badge is-billing">Billing owner</span>` : ""}
                  </div>
                </div>
                <p>${biz.id === billingOwnerId ? "This business owns the current billing relationship." : "Operational workspace on this account."}</p>
              </div>
              <div class="sub-business-item-actions">
                ${biz.id !== activeId ? `<button type="button" class="settings-secondary-btn" data-business-switch="${escapeHtml(biz.id)}">Switch</button>` : ""}
                <button
                  type="button"
                  class="danger-outline-btn"
                  data-business-delete="${escapeHtml(biz.id)}"
                  data-business-name="${escapeHtml(biz.name || "Business")}"
                  ${!canDeleteMultiple ? "disabled" : ""}
                >
                  Delete business
                </button>
              </div>
            </article>
          `).join("")
          : `<p class="sub-empty-msg">No businesses found.</p>`}
      </div>
    </aside>`;
}

function wireBusinessRosterActions() {
  document.querySelectorAll("[data-business-switch]").forEach((button) => {
    button.addEventListener("click", async () => {
      const businessId = button.getAttribute("data-business-switch");
      if (!businessId) return;
      button.disabled = true;
      try {
        const res = await apiFetch(`/api/businesses/${businessId}/activate`, { method: "POST" });
        if (!res || !res.ok) {
          const payload = await res?.json()?.catch(() => null);
          throw new Error(payload?.error || "Failed to switch business.");
        }
        window.location.reload();
      } catch (err) {
        showSubToast(err.message || "Failed to switch business.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-business-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const businessId = button.getAttribute("data-business-delete");
      const businessName = button.getAttribute("data-business-name") || "Business";
      if (!businessId) return;
      openBusinessDeleteModal(businessId, businessName);
    });
  });
}

function buildFreeTierConfirmationMessage(sub) {
  if (sub?.isPaid && sub?.currentPeriodEnd) {
    return tx("subscription_free_confirm_body_paid").replace("{date}", fmtDate(sub.currentPeriodEnd));
  }
  if (sub?.isTrialing) {
    return tx("subscription_free_confirm_body_trial");
  }
  return tx("subscription_free_confirm_body_generic");
}

function buildAddSlotPricingHtml(sub) {
  const currency = sub?.currency || pricingState.currency || "usd";
  const interval = sub?.billingInterval || pricingState.billingInterval || "monthly";
  const currentAdditional = businessSlotsState.currentAdditionalBusinesses;
  const newAdditional = currentAdditional + 1;
  const intervalLabel = interval === "yearly" ? "yr" : "mo";
  const isYearly = interval === "yearly";
  const currentPrice = billingPricingUtils.getGrandTotal(currency, interval, currentAdditional);
  const newPrice = billingPricingUtils.getGrandTotal(currency, interval, newAdditional);
  const currentLabel = `Current ${isYearly ? "yearly" : "monthly"} total`;
  const newLabel = `New ${isYearly ? "yearly" : "monthly"} total`;

  if (sub?.isPaid) {
    return `
      <div class="add-slot-pricing">
        <div class="add-slot-pricing-row">
          <span>${currentLabel}</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, currentPrice))}/${intervalLabel}</strong>
        </div>
        <div class="add-slot-pricing-row add-slot-pricing-new">
          <span>${newLabel}</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, newPrice))}/${intervalLabel}</strong>
        </div>
      </div>
      <p class="add-slot-modal-note">The difference is charged immediately, prorated for the rest of your billing period.</p>`;
  }

  if (sub?.isTrialing) {
    return `
      <div class="add-slot-pricing">
        <div class="add-slot-pricing-row">
          <span>${currentLabel} after trial</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, currentPrice))}/${intervalLabel}</strong>
        </div>
        <div class="add-slot-pricing-row add-slot-pricing-new">
          <span>${newLabel} after adding</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, newPrice))}/${intervalLabel}</strong>
        </div>
      </div>
      <p class="add-slot-modal-note">You will not be charged during the trial. Confirm now so the new total is ready when the trial ends.</p>`;
  }

  return `<p class="add-slot-modal-note">${escapeHtml(tx("subscription_extra_business_slots_help"))}</p>`;
}

function ensureAddSlotModal() {
  if (document.getElementById("addSlotConfirmModal")) return;
  const el = document.createElement("div");
  el.id = "addSlotConfirmModal";
  el.className = "business-modal-backdrop";
  el.hidden = true;
  el.innerHTML = `
    <div class="business-modal" role="dialog" aria-modal="true" aria-labelledby="addSlotModalTitle">
      <h3 id="addSlotModalTitle">Add a business?</h3>
      <div id="addSlotModalBody"></div>
      <div class="business-modal-actions">
        <button type="button" id="addSlotModalCancel">Cancel</button>
        <button type="button" id="addSlotModalConfirm" class="settings-primary-btn">Confirm &amp; set up business</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => { if (e.target === el) closeAddSlotModal(); });
  el.querySelector("#addSlotModalCancel")?.addEventListener("click", closeAddSlotModal);
  el.querySelector("#addSlotModalConfirm")?.addEventListener("click", async () => {
    closeAddSlotModal();
    businessSlotsState.selectedAdditionalBusinesses = businessSlotsState.currentAdditionalBusinesses + 1;
    const ok = await updateBusinessSlots();
    if (!ok) return;
    // Bypass canCreateAnotherBusiness — we just paid for the slot
    if (typeof ensureBusinessCreationModal === "function") ensureBusinessCreationModal();
    const bModal = document.getElementById("businessCreationModal");
    if (bModal) {
      const bErr = document.getElementById("businessModalError");
      if (bErr) bErr.textContent = "";
      bModal.hidden = false;
      setTimeout(() => document.getElementById("businessNameInput")?.focus(), 0);
    }
  });
}

function openAddSlotModal(sub) {
  ensureAddSlotModal();
  const modal = document.getElementById("addSlotConfirmModal");
  const body = document.getElementById("addSlotModalBody");
  const newAdditional = businessSlotsState.currentAdditionalBusinesses + 1;
  const newTotal = 1 + newAdditional;
  const noun = newAdditional === 1 ? "add-on" : "add-ons";
  if (body) {
    body.innerHTML = `
      <p>You'll have <strong>${newTotal} businesses</strong> — 1 included with Pro, ${newAdditional} ${noun}.</p>
      ${buildAddSlotPricingHtml(sub)}`;
  }
  modal.hidden = false;
  modal.querySelector("#addSlotModalConfirm")?.focus();
}

function closeAddSlotModal() {
  const modal = document.getElementById("addSlotConfirmModal");
  if (modal) modal.hidden = true;
}

function wireSlotActions() {
  const addBtn = document.getElementById("addSlotBtn");
  const removeBtn = document.getElementById("removeSlotBtn");
  const removeConfirm = document.getElementById("removeSlotConfirm");
  const removeConfirmBtn = document.getElementById("removeSlotConfirmBtn");
  const removeCancelBtn = document.getElementById("removeSlotCancelBtn");
  if (!addBtn || !removeBtn) return;

  addBtn.addEventListener("click", () => {
    if (businessSlotsState.isSaving) return;
    openAddSlotModal(currentSubscription);
  });

  removeBtn.addEventListener("click", () => {
    if (businessSlotsState.isSaving || businessSlotsState.currentAdditionalBusinesses <= 0) return;
    removeConfirm.classList.remove("hidden");
    removeBtn.disabled = true;
  });

  removeCancelBtn?.addEventListener("click", () => {
    removeConfirm.classList.add("hidden");
    removeBtn.disabled = businessSlotsState.currentAdditionalBusinesses <= 0;
  });

  removeConfirmBtn?.addEventListener("click", async () => {
    removeConfirm.classList.add("hidden");
    if (businessSlotsState.isSaving || businessSlotsState.currentAdditionalBusinesses <= 0) return;
    businessSlotsState.selectedAdditionalBusinesses = businessSlotsState.currentAdditionalBusinesses - 1;
    await updateBusinessSlots();
  });
}

function syncSlotActions() {
  const addBtn = document.getElementById("addSlotBtn");
  const removeBtn = document.getElementById("removeSlotBtn");
  const stateLabel = document.getElementById("slotsStateLabel");
  const removeConfirm = document.getElementById("removeSlotConfirm");
  if (!addBtn || !removeBtn) return;

  const isSaving = businessSlotsState.isSaving;
  const extra = businessSlotsState.currentAdditionalBusinesses;
  const total = 1 + extra;

  addBtn.disabled = isSaving || extra >= MAX_ADDITIONAL_BUSINESSES;
  addBtn.textContent = isSaving ? tx("subscription_checkout_loading") : "Add a business";
  removeBtn.disabled = isSaving || extra <= 0;
  if (isSaving && removeConfirm) removeConfirm.classList.add("hidden");
  if (stateLabel) {
    stateLabel.textContent = extra === 0
      ? "You have 1 business — included with Pro."
      : extra === 1
        ? `You have ${total} businesses — 1 included with Pro, 1 add-on.`
        : `You have ${total} businesses — 1 included with Pro, ${extra} add-ons.`;
  }
}

async function updateBusinessSlots() {
  if (businessSlotsState.isSaving) return false;
  businessSlotsState.isSaving = true;
  syncSlotActions();
  try {
    const res = await apiFetch("/api/billing/additional-businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ additionalBusinesses: businessSlotsState.selectedAdditionalBusinesses })
    });
    const payload = await res?.json()?.catch(() => null);
    if (!res || !res.ok) {
      throw new Error(payload?.error || tx("subscription_business_slots_error"));
    }
    showSubToast(tx("subscription_business_slots_success"));
    currentSubscription = await loadSubscription();
    if (typeof applySubscriptionState === "function") applySubscriptionState(currentSubscription);
    await loadBillingHistory();
    return true;
  } catch (err) {
    showSubToast(err.message || tx("subscription_business_slots_error"));
    return false;
  } finally {
    businessSlotsState.isSaving = false;
    syncSlotActions();
  }
}

function renderBusinessAccessSection(sub) {
  const manager = document.getElementById("businessSlotsManager");
  if (!manager) return;
  syncSubscriptionBusinessesState(sub);

  const isProTier = !!sub && sub.effectiveTier === "v1";
  const isActiveTrial = isProTier && sub.isTrialing;
  const canManageSlots =
    isProTier &&
    (sub.isPaid || sub.isTrialing) &&
    (!sub.cancelAtPeriodEnd || isActiveTrial) &&
    !sub.isCanceledWithRemainingAccess;
  const isCancelingPro = isProTier && sub.cancelAtPeriodEnd && !isActiveTrial;
  const isEndedProWithRemainingAccess = isProTier && sub.isCanceledWithRemainingAccess;

  const proCardAddonGroup = document.getElementById("proCardAddonGroup");
  if (proCardAddonGroup) {
    proCardAddonGroup.classList.toggle("hidden", canManageSlots || isCancelingPro || isEndedProWithRemainingAccess);
  }

  const extra = Number(sub?.additionalBusinesses || 0);
  const total = 1 + extra;
  businessSlotsState.currentAdditionalBusinesses = extra;
  businessSlotsState.selectedAdditionalBusinesses = extra;

  const statsHtml = `
    <div class="sub-access-overview">
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_included_businesses"))}</span>
        <strong class="sub-access-stat-value">1</strong>
        <span class="sub-access-stat-meta">Included with the base plan</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_extra_business_slots"))}</span>
        <strong class="sub-access-stat-value">${extra}</strong>
        <span class="sub-access-stat-meta">Paid add-on capacity</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_total_businesses_allowed"))}</span>
        <strong class="sub-access-stat-value">${isProTier ? total : 1}</strong>
        <span class="sub-access-stat-meta">${isProTier ? "Maximum workspaces on the current plan" : "Upgrade to unlock more businesses"}</span>
      </article>
    </div>`;

  if (!isProTier) {
    manager.innerHTML = `
      ${buildBusinessRosterMarkup(sub)}
      ${statsHtml}
      <div class="sub-access-message-card">
        <p class="sub-access-upgrade-note">${escapeHtml(tx("subscription_business_access_upgrade_note"))}</p>
        <p class="sub-access-settings-note">Manage business records from Settings once your plan includes more capacity.</p>
      </div>`;
    wireBusinessRosterActions();
    return;
  }

  if (isCancelingPro) {
    manager.innerHTML = `
      ${buildBusinessRosterMarkup(sub)}
      ${statsHtml}
      <div class="sub-access-message-card">
        <p class="sub-access-cancel-note">${escapeHtml(tx("subscription_business_slots_canceling_help"))}</p>
        <p class="sub-access-settings-note">Delete or edit businesses from Settings. Capacity changes resume once Pro is active again.</p>
      </div>`;
    wireBusinessRosterActions();
    return;
  }

  if (isEndedProWithRemainingAccess) {
    manager.innerHTML = `
      ${buildBusinessRosterMarkup(sub)}
      ${statsHtml}
      <div class="sub-access-message-card">
        <p class="sub-access-cancel-note">${escapeHtml(tx("subscription_business_slots_canceled_help"))}</p>
        <p class="sub-access-settings-note">Business administration stays in Settings. Start a new Pro cycle before changing paid capacity.</p>
      </div>`;
    wireBusinessRosterActions();
    return;
  }

  const stateMsg = extra === 0
    ? "You have 1 business included with Pro."
    : extra === 1
      ? `You have ${total} businesses: 1 included and 1 add-on.`
      : `You have ${total} businesses: 1 included and ${extra} add-ons.`;

  manager.innerHTML = `
    ${buildBusinessRosterMarkup(sub)}
    ${statsHtml}
    <div class="sub-slots-panel">
      <div class="sub-slots-panel-head">
        <div class="sub-slots-panel-copy">
          <h3>Business capacity</h3>
          <p>These controls change the billed add-on count only. Edit or delete individual businesses from Settings.</p>
        </div>
        <div class="sub-slots-price-pill">${escapeHtml(tx("subscription_extra_business_slots_help"))}</div>
      </div>
      <div class="sub-slots-actions">
        <p class="sub-slots-state-label" id="slotsStateLabel">${escapeHtml(stateMsg)}</p>
        <div class="sub-slots-btn-row">
          <button type="button" id="removeSlotBtn" class="sub-slots-remove-btn"${extra <= 0 ? " disabled" : ""}>Remove a business</button>
          <button type="button" id="addSlotBtn" class="sub-slots-add-btn">Add a business</button>
        </div>
        <p class="sub-access-settings-note">Need to switch, rename, or delete a specific business? Go to Settings.</p>
        <div id="removeSlotConfirm" class="sub-slots-remove-confirm hidden">
          <p>This removes 1 business slot from your bill. Make sure the business you want gone is deleted first.</p>
          <div class="sub-slots-confirm-btns">
            <button type="button" id="removeSlotCancelBtn" class="sub-slots-confirm-cancel">Keep it</button>
            <button type="button" id="removeSlotConfirmBtn" class="sub-slots-confirm-ok">Yes, remove it</button>
          </div>
        </div>
      </div>
    </div>`;

  wireBusinessRosterActions();
  wireSlotActions();
}

async function loadSubscription() {
  const statusBlock = document.getElementById("subStatusBlock");
  const manageBillingBtn = document.getElementById("subManageBillingBtn");
  const cancelBtn = document.getElementById("subCancelBtn");
  const cancelModalBody = document.getElementById("subCancelModalBody");
  const planFreeBtn = document.getElementById("planFreeBtn");
  const planProBtn = document.getElementById("planProBtn");

  try {
    if (!isAuthenticated()) {
      if (statusBlock) statusBlock.innerHTML = `<p>${tx("sub_mgmt_not_signed_in")}</p>`;
      renderBusinessAccessSection(null);
      renderPaymentMethodCard(null, false);
      return null;
    }

    const res = await apiFetch("/api/billing/overview");
    if (!res || !res.ok) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderBusinessAccessSection(null);
      renderPaymentMethodCard(null, false);
      return null;
    }

    const payload = await res.json().catch(() => null);
    const sub = payload?.subscription;
    if (!sub) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderBusinessAccessSection(null);
      renderPaymentMethodCard(null, false);
      return null;
    }

    currentSubscription = sub;
    syncSubscriptionBusinessesState(sub);
    if (sub.currency) {
      pricingState.currency = String(sub.currency).toLowerCase();
    }
    if (sub.billingInterval === "monthly" || sub.billingInterval === "yearly") {
      pricingState.billingInterval = sub.billingInterval;
    }
    pricingState.additionalBusinesses = clampAdditionalBusinesses(Number(sub.additionalBusinesses || 0));
    updatePricingUI();

    if (statusBlock) {
      statusBlock.innerHTML = buildStatusPanelMarkup(sub);
    }
    renderPaymentMethodCard(payload?.paymentMethod || null, payload?.portalAvailable === true);

    if (cancelModalBody && sub.currentPeriodEnd) {
      const endDate = fmtDate(sub.currentPeriodEnd);
      cancelModalBody.textContent = typeof window.t === "function"
        ? window.t("settings_cancel_sub_modal_body_date").replace("{date}", endDate)
        : `Your subscription will remain active until ${endDate}. You will lose access to premium features after that date.`;
    }

    if (manageBillingBtn) {
      manageBillingBtn.classList.toggle("hidden", !sub.stripeCustomerId);
    }
    if (cancelBtn) {
      cancelBtn.classList.toggle("hidden", !(sub.isPaid && !sub.cancelAtPeriodEnd));
    }

    if (typeof applySubscriptionState === "function") {
      applySubscriptionState(sub);
    }

    updatePlanCardState(sub);
    renderBusinessAccessSection(sub);
    await loadBillingHistory(Array.isArray(payload?.invoices) ? payload.invoices : []);

    if (planProBtn) {
      const action = getPrimaryPlanAction(sub);
      planProBtn.disabled = action.disabled;
      planProBtn.textContent = action.label;
      planProBtn.dataset.planDisabled = action.disabled ? "true" : "false";
      planProBtn.dataset.actionMode = action.mode;
      planProBtn.dataset.defaultLabel = planProBtn.textContent;
    }

    if (planFreeBtn) {
      const selectedPlanCode = getSelectedPlanCode(sub);
      if (sub.cancelAtPeriodEnd || sub.isCanceledWithRemainingAccess) {
        planFreeBtn.disabled = true;
        planFreeBtn.textContent = tx("subscription_free_pending");
      } else if (selectedPlanCode !== "v1") {
        planFreeBtn.disabled = true;
        planFreeBtn.textContent = tx("subscription_current_plan");
      } else {
        planFreeBtn.disabled = false;
        planFreeBtn.textContent = tx("subscription_starter_cta");
      }
    }

    return sub;
  } catch (err) {
    console.error("[Subscription] Failed to load subscription:", err);
    if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
    return null;
  }
}

async function waitForSubscriptionActivation() {
  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sub = await loadSubscription();
    if (sub?.effectiveTier === "v1" && (sub.isPaid || sub.isTrialing)) {
      return sub;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return loadSubscription();
}

async function loadBillingHistory(providedInvoices = null) {
  const list = document.getElementById("billingHistoryList");
  if (!list) return;

  try {
    let invoices = providedInvoices;
    if (!isAuthenticated()) {
      list.innerHTML = `<p>${tx("sub_mgmt_not_signed_in")}</p>`;
      return;
    }

    if (!Array.isArray(invoices)) {
      const res = await apiFetch("/api/billing/history");
      if (!res || !res.ok) {
        list.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_history_error")}</p>`;
        return;
      }
      const payload = await res.json().catch(() => null);
      invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
    }

    if (!invoices.length) {
      list.innerHTML = `<p class="sub-empty-msg">${tx("sub_mgmt_no_history")}</p>`;
      return;
    }

    list.innerHTML = `
      <table class="billing-history-table">
        <thead>
          <tr>
            <th data-i18n="sub_mgmt_col_date">${tx("sub_mgmt_col_date")}</th>
            <th data-i18n="sub_mgmt_col_amount">${tx("sub_mgmt_col_amount")}</th>
            <th data-i18n="sub_mgmt_col_status">${tx("sub_mgmt_col_status")}</th>
            <th data-i18n="sub_mgmt_col_invoice">${tx("sub_mgmt_col_invoice")}</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((inv) => `
            <tr>
              <td>${escapeHtml(fmtDate(inv.created))}</td>
              <td>${escapeHtml(fmtAmount(inv.amount_paid || inv.amount_due, inv.currency))}</td>
              <td><span class="billing-status-badge billing-status-${escapeHtml(inv.status)}">${escapeHtml(inv.status || "-")}</span></td>
              <td>
                ${inv.hosted_invoice_url || inv.invoice_pdf
                  ? `<a href="${escapeHtml(inv.hosted_invoice_url || inv.invoice_pdf)}" target="_blank" rel="noopener noreferrer" class="billing-invoice-link">${tx("sub_mgmt_view_invoice")}</a>`
                  : "-"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error("[Subscription] Failed to load billing history:", err);
    list.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_history_error")}</p>`;
  }
}

async function resumeSubscription() {
  try {
    setCheckoutLoading(true);
    const res = await apiFetch("/api/billing/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const payload = await res?.json()?.catch(() => null);
    if (!res || !res.ok) {
      throw new Error(payload?.error || "Failed to keep Pro active.");
    }
    showSubToast("Pro renewal is active again.");
    currentSubscription = await loadSubscription();
    await loadBillingHistory();
  } catch (err) {
    showSubToast(err.message || "Failed to keep Pro active.");
  } finally {
    setCheckoutLoading(false);
  }
}

async function handlePrimaryPlanAction() {
  const actionMode = document.getElementById("planProBtn")?.dataset.actionMode || "checkout";
  if (actionMode === "current") {
    return;
  }
  if (actionMode === "portal") {
    await openCustomerPortal();
    return;
  }
  if (actionMode === "resume") {
    await resumeSubscription();
    return;
  }
  await startCheckout();
}

async function startCheckout() {
  try {
    if (pricingState.isCheckoutLoading) return;
    await loadVerifiedPricingContext();
    setCheckoutLoading(true);

    const res = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingInterval: pricingState.billingInterval,
        additionalBusinesses: pricingState.additionalBusinesses
      })
    });
    if (!res) {
      showSubToast(tx("subscription_checkout_error"));
      setCheckoutLoading(false);
      return;
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || tx("subscription_checkout_error"));
    if (payload?.url) {
      if (!isAllowedBillingRedirect(payload.url)) {
        throw new Error(tx("subscription_checkout_error"));
      }
      window.location.href = payload.url;
      return;
    }

    setCheckoutLoading(false);
  } catch (err) {
    showSubToast(err.message || tx("subscription_checkout_error"));
    setCheckoutLoading(false);
  }
}

async function openCustomerPortal() {
  try {
    const res = await apiFetch("/api/billing/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!res) return;
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || tx("subscription_portal_error"));
    if (payload?.url) {
      if (!isAllowedBillingRedirect(payload.url)) {
        throw new Error(tx("subscription_portal_error"));
      }
      window.location.href = payload.url;
    }
  } catch (err) {
    showSubToast(err.message || tx("subscription_portal_error"));
  }
}

function openBusinessDeleteModal(businessId, businessName) {
  pendingDeleteBusinessId = businessId;
  const modal = document.getElementById("subBusinessDeleteModal");
  const body = document.getElementById("subBusinessDeleteBody");
  const passwordInput = document.getElementById("subBusinessDeletePassword");
  const remainingBusinesses = Math.max((subscriptionBusinessesState.items || []).length - 1, 0);
  const nextAdditionalBusinesses = Math.max(remainingBusinesses - 1, 0);
  const currentAdditionalBusinesses = Number(currentSubscription?.additionalBusinesses || 0);

  if (body) {
    const lines = [
      `<span>This permanently deletes <strong>${escapeHtml(businessName)}</strong> and its associated data.</span>`,
      `<span>You will have <strong>${remainingBusinesses}</strong> business${remainingBusinesses === 1 ? "" : "es"} remaining.</span>`
    ];

    if (currentSubscription?.effectiveTier === "v1") {
      lines.push(
        `<span>Your paid add-on count will change from <strong>${currentAdditionalBusinesses}</strong> to <strong>${nextAdditionalBusinesses}</strong>.</span>`
      );
    }

    body.innerHTML = lines.join("<br /><br />");
  }

  if (passwordInput) {
    passwordInput.value = "";
  }
  modal?.classList.remove("hidden");
  setTimeout(() => passwordInput?.focus(), 0);
}

function closeBusinessDeleteModal() {
  pendingDeleteBusinessId = null;
  document.getElementById("subBusinessDeleteModal")?.classList.add("hidden");
}

function wireBusinessDeleteModal() {
  const modal = document.getElementById("subBusinessDeleteModal");
  const cancelBtn = document.getElementById("subBusinessDeleteCancel");
  const confirmBtn = document.getElementById("subBusinessDeleteConfirm");
  const passwordInput = document.getElementById("subBusinessDeletePassword");

  cancelBtn?.addEventListener("click", closeBusinessDeleteModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeBusinessDeleteModal();
    }
  });

  confirmBtn?.addEventListener("click", async () => {
    const password = passwordInput?.value || "";
    if (!pendingDeleteBusinessId) return;
    if (!password) {
      showSubToast("Enter your password to delete this business.");
      passwordInput?.focus();
      return;
    }

    confirmBtn.disabled = true;
    try {
      const res = await apiFetch(`/api/businesses/${pendingDeleteBusinessId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Failed to delete business.");
      }

      if (Array.isArray(payload?.businesses) && window.__LUNA_ME__ && typeof window.__LUNA_ME__ === "object") {
        window.__LUNA_ME__.businesses = payload.businesses;
      }
      if (payload?.active_business && typeof applyActivatedBusinessContext === "function") {
        applyActivatedBusinessContext(payload.active_business);
      }
      if (payload?.subscription && typeof applySubscriptionState === "function") {
        applySubscriptionState(payload.subscription);
      }
      showSubToast("Business deleted.");
      closeBusinessDeleteModal();
      currentSubscription = await loadSubscription();
      await loadBillingHistory();
    } catch (err) {
      showSubToast(err.message || "Failed to delete business.");
    } finally {
      confirmBtn.disabled = false;
    }
  });
}

function wireFreeTierModal() {
  const modal = document.getElementById("subFreeModal");
  const body = document.getElementById("subFreeModalBody");
  const cancelBtn = document.getElementById("subFreeModalCancel");
  const confirmBtn = document.getElementById("subFreeModalConfirm");
  const planFreeBtn = document.getElementById("planFreeBtn");

  if (!modal || !body || !cancelBtn || !confirmBtn || !planFreeBtn) {
    return;
  }

  const closeModal = () => modal.classList.add("hidden");

  cancelBtn.addEventListener("click", closeModal);
  planFreeBtn.addEventListener("click", () => {
    if (!currentSubscription || planFreeBtn.disabled) {
      return;
    }
    body.textContent = buildFreeTierConfirmationMessage(currentSubscription);
    modal.classList.remove("hidden");
  });

  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || tx("settings_cancel_sub_error"));
      }
      closeModal();
      showSubToast(tx("subscription_free_selection_success"));
      currentSubscription = await loadSubscription();
      await loadBillingHistory();
    } catch (err) {
      showSubToast(err.message || tx("settings_cancel_sub_error"));
    } finally {
      confirmBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof requireValidSessionOrRedirect === "function") {
    await requireValidSessionOrRedirect();
  }
  if (typeof enforceTrial === "function") enforceTrial();

  initSubNav();
  await initPricingControls();

  const planProBtn = document.getElementById("planProBtn");
  planProBtn?.addEventListener("click", () => {
    void handlePrimaryPlanAction();
  });

  const manageBillingBtn = document.getElementById("subManageBillingBtn");
  manageBillingBtn?.addEventListener("click", openCustomerPortal);

  wireFreeTierModal();
  wireBusinessDeleteModal();

  const cancelBtn = document.getElementById("subCancelBtn");
  const cancelModal = document.getElementById("subCancelModal");
  const cancelModalCancel = document.getElementById("subCancelModalCancel");
  const cancelModalConfirm = document.getElementById("subCancelModalConfirm");

  cancelBtn?.addEventListener("click", () => cancelModal?.classList.remove("hidden"));
  cancelModalCancel?.addEventListener("click", () => cancelModal?.classList.add("hidden"));

  cancelModalConfirm?.addEventListener("click", async () => {
    cancelModalConfirm.disabled = true;
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        showSubToast(payload?.error || tx("settings_cancel_sub_error"));
        cancelModalConfirm.disabled = false;
        return;
      }
      cancelModal?.classList.add("hidden");
      showSubToast(tx("settings_cancel_sub_success"));
      currentSubscription = await loadSubscription();
      cancelModalConfirm.disabled = false;
    } catch (err) {
      console.error("Cancel subscription failed", err);
      showSubToast(tx("settings_cancel_sub_error"));
      cancelModalConfirm.disabled = false;
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "success") {
    showSubToast(tx("sub_mgmt_checkout_success"));
    window.history.replaceState({}, "", window.location.pathname);
    currentSubscription = await waitForSubscriptionActivation();
    return;
  } else if (params.get("checkout") === "cancel") {
    showSubToast(tx("sub_mgmt_checkout_cancelled"));
    window.history.replaceState({}, "", window.location.pathname);
  }

  currentSubscription = await loadSubscription();
});

