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
  verifiedPricing: null
};
let currentSubscription = null;
const businessSlotsState = {
  currentAdditionalBusinesses: 0,
  selectedAdditionalBusinesses: 0,
  isSaving: false
};

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
  if (pricingState.verifiedPricing?.[pricingState.billingInterval]) {
    return pricingState.verifiedPricing[pricingState.billingInterval];
  }
  if (typeof billingPricingUtils.getPricing === "function") {
    return billingPricingUtils.getPricing(pricingState.currency, pricingState.billingInterval);
  }
  return { base: 0, addon: 0, labelKey: "subscription_billing_monthly" };
}

function getAddonTotalAmount() {
  if (pricingState.verifiedPricing?.[pricingState.billingInterval]) {
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
  if (pricingState.verifiedPricing?.[pricingState.billingInterval]) {
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
  const checkoutConfirmBtn = document.getElementById("subCheckoutConfirm");
  const defaultLabel = planProBtn?.dataset.defaultLabel || planProBtn?.textContent || "";
  const defaultCheckoutLabel =
    checkoutConfirmBtn?.dataset.defaultLabel || checkoutConfirmBtn?.textContent || "";
  if (isLoading) {
    if (planProBtn) {
      planProBtn.disabled = true;
      planProBtn.textContent = tx("subscription_checkout_loading");
    }
    if (checkoutConfirmBtn) {
      checkoutConfirmBtn.disabled = true;
      checkoutConfirmBtn.textContent = tx("subscription_checkout_loading");
    }
  } else {
    if (planProBtn) {
      planProBtn.disabled = planProBtn.dataset.planDisabled === "true";
      planProBtn.textContent = defaultLabel;
    }
    if (checkoutConfirmBtn) {
      checkoutConfirmBtn.disabled = false;
      checkoutConfirmBtn.textContent = defaultCheckoutLabel;
    }
  }
}

function updatePlanCardState(sub) {
  const planFree = document.getElementById("planFree");
  const planPro = document.getElementById("planPro");
  const selectedPlanCode = sub?.selectedPlanCode || sub?.planCode || (sub?.effectiveTier === "v1" ? "v1" : "free");
  const isCurrentFree = !sub || !!sub.cancelAtPeriodEnd || selectedPlanCode !== "v1";
  const isCurrentPro = !!sub && !sub.cancelAtPeriodEnd && selectedPlanCode === "v1";

  planFree?.classList.toggle("is-current", isCurrentFree);
  planPro?.classList.toggle("is-current", isCurrentPro);
}

function isTrialDowngradedToBasic(subscription) {
  if (!subscription || !subscription.isTrialing) {
    return false;
  }
  return Boolean(
    subscription.isTrialDowngradedToFree ||
    subscription.cancelAtPeriodEnd ||
    subscription.selectedPlanCode !== "v1"
  );
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
  const currency = sub?.currency || "usd";
  const interval = sub?.billingInterval || "monthly";
  const currentAdditional = businessSlotsState.currentAdditionalBusinesses;
  const newAdditional = currentAdditional + 1;
  const intervalLabel = interval === "yearly" ? "yr" : "mo";

  if (sub?.isPaid) {
    const currentPrice = billingPricingUtils.getGrandTotal(currency, interval, currentAdditional);
    const newPrice = billingPricingUtils.getGrandTotal(currency, interval, newAdditional);
    return `
      <div class="add-slot-pricing">
        <div class="add-slot-pricing-row">
          <span>Current</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, currentPrice))}/${intervalLabel}</strong>
        </div>
        <div class="add-slot-pricing-row add-slot-pricing-new">
          <span>After adding</span>
          <strong>${escapeHtml(billingPricingUtils.formatMoney(currency, newPrice))}/${intervalLabel}</strong>
        </div>
      </div>
      <p class="add-slot-modal-note">The difference is charged immediately, prorated for the rest of your billing period.</p>`;
  }

  if (sub?.isTrialing) {
    const pricing = billingPricingUtils.getPricing(currency, interval);
    return `
      <div class="add-slot-pricing">
        <div class="add-slot-pricing-row">
          <span>Add-on cost</span>
          <strong>+${escapeHtml(billingPricingUtils.formatMoney(currency, pricing.addon))}/${intervalLabel}</strong>
        </div>
      </div>
      <p class="add-slot-modal-note">You won't be charged until your trial ends.</p>`;
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

  const isProTier = !!sub && sub.effectiveTier === "v1";
  const canManageSlots =
    isProTier &&
    (sub.isPaid || sub.isTrialing) &&
    !sub.cancelAtPeriodEnd &&
    !sub.isCanceledWithRemainingAccess;
  const isCancelingPro = isProTier && sub.cancelAtPeriodEnd;
  const isEndedProWithRemainingAccess = isProTier && sub.isCanceledWithRemainingAccess;

  const proCardAddonGroup = document.getElementById("proCardAddonGroup");
  if (proCardAddonGroup) {
    proCardAddonGroup.classList.toggle("hidden", canManageSlots || isCancelingPro || isEndedProWithRemainingAccess);
  }

  if (!isProTier) {
    manager.innerHTML = `
      <div class="sub-access-message-card">
        <p class="sub-access-upgrade-note">${escapeHtml(tx("subscription_business_access_upgrade_note"))}</p>
      </div>`;
    return;
  }

  businessSlotsState.currentAdditionalBusinesses = sub.additionalBusinesses || 0;
  businessSlotsState.selectedAdditionalBusinesses = sub.additionalBusinesses || 0;

  const extra = sub.additionalBusinesses || 0;
  const total = 1 + extra;
  const selectionSummary = extra > 0 ? `1 included + ${extra} additional` : "1 included only";

  const statsHtml = `
    <div class="sub-access-overview">
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_included_businesses"))}</span>
        <strong class="sub-access-stat-value">1</strong>
        <span class="sub-access-stat-meta">Included with Pro</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_extra_business_slots"))}</span>
        <strong class="sub-access-stat-value">${extra}</strong>
        <span class="sub-access-stat-meta">Paid add-on capacity</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_total_businesses_allowed"))}</span>
        <strong class="sub-access-stat-value">${total}</strong>
        <span class="sub-access-stat-meta">Available workspaces</span>
      </article>
    </div>`;

  if (isCancelingPro) {
    manager.innerHTML = `
      ${statsHtml}
      <div class="sub-access-message-card">
        <p class="sub-access-cancel-note">${escapeHtml(tx("subscription_business_slots_canceling_help"))}</p>
      </div>`;
    return;
  }

  if (isEndedProWithRemainingAccess) {
    manager.innerHTML = `
      ${statsHtml}
      <div class="sub-access-message-card">
        <p class="sub-access-cancel-note">${escapeHtml(tx("subscription_business_slots_canceled_help"))}</p>
      </div>`;
    return;
  }

  const stateMsg = extra === 0
    ? "You have 1 business — included with Pro."
    : extra === 1
      ? `You have ${total} businesses — 1 included with Pro, 1 add-on.`
      : `You have ${total} businesses — 1 included with Pro, ${extra} add-ons.`;

  manager.innerHTML = `
    ${statsHtml}
    <div class="sub-slots-panel">
      <div class="sub-slots-panel-head">
        <div class="sub-slots-panel-copy">
          <h3>Additional businesses</h3>
          <p>1 business is included with Pro. Each one beyond that is a paid add-on.</p>
        </div>
        <div class="sub-slots-price-pill">${escapeHtml(tx("subscription_extra_business_slots_help"))}</div>
      </div>
      <div class="sub-slots-actions">
        <p class="sub-slots-state-label" id="slotsStateLabel">${escapeHtml(stateMsg)}</p>
        <div class="sub-slots-btn-row">
          <button type="button" id="removeSlotBtn" class="sub-slots-remove-btn"${extra <= 0 ? " disabled" : ""}>Remove a business</button>
          <button type="button" id="addSlotBtn" class="sub-slots-add-btn">Add a business</button>
        </div>
        <div id="removeSlotConfirm" class="sub-slots-remove-confirm hidden">
          <p>This removes 1 business slot from your bill. Make sure no active data is assigned to it first.</p>
          <div class="sub-slots-confirm-btns">
            <button type="button" id="removeSlotCancelBtn" class="sub-slots-confirm-cancel">Keep it</button>
            <button type="button" id="removeSlotConfirmBtn" class="sub-slots-confirm-ok">Yes, remove it</button>
          </div>
        </div>
      </div>
    </div>`;

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
      return null;
    }

    const res = await apiFetch("/api/billing/subscription");
    if (!res || !res.ok) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderBusinessAccessSection(null);
      return null;
    }

    const payload = await res.json().catch(() => null);
    const sub = payload?.subscription;
    if (!sub) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderBusinessAccessSection(null);
      return null;
    }

    currentSubscription = sub;
    pricingState.additionalBusinesses = clampAdditionalBusinesses(Number(sub.additionalBusinesses || 0));
    updatePricingUI();

    if (statusBlock) {
      let statusHtml = "";
      let statusClass = "sub-status-free";
      const selectedPlanCode = sub.selectedPlanCode || sub.planCode || (sub.effectiveTier === "v1" ? "v1" : "free");
      const isTrialDowngradedToFree = sub.isTrialing && selectedPlanCode !== "v1";

      if (sub.isTrialing && sub.trialEndsAt) {
        statusClass = "sub-status-trial";
        statusHtml = `
          <div class="sub-status-row">
            <span class="sub-status-badge sub-badge-trial">${tx("sub_mgmt_badge_trial")}</span>
            <span class="sub-status-detail">${tx("sub_mgmt_trial_ends")}: <strong>${fmtDate(sub.trialEndsAt)}</strong></span>
          </div>
          ${isTrialDowngradedToFree ? `<div class="sub-status-row"><span class="sub-status-detail">Basic is selected for after the trial. You still keep Pro trial access until <strong>${fmtDate(sub.trialEndsAt)}</strong>.</span></div>` : ""}`;
      } else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        statusClass = "sub-status-canceling";
        statusHtml = `
          <div class="sub-status-row">
            <span class="sub-status-badge sub-badge-canceling">${tx("sub_mgmt_badge_canceling")}</span>
            <span class="sub-status-detail">${tx("sub_mgmt_access_until")}: <strong>${fmtDate(sub.currentPeriodEnd)}</strong></span>
          </div>`;
      } else if (sub.isPaid && sub.currentPeriodEnd) {
        statusClass = "sub-status-active";
        statusHtml = `
          <div class="sub-status-row">
            <span class="sub-status-badge sub-badge-active">${tx("sub_mgmt_badge_pro")}</span>
            <span class="sub-status-detail">${tx("sub_mgmt_renews")}: <strong>${fmtDate(sub.currentPeriodEnd)}</strong></span>
          </div>`;
      } else {
        statusHtml = `
          <div class="sub-status-row">
            <span class="sub-status-badge sub-badge-free">${tx("sub_mgmt_badge_free")}</span>
            <span class="sub-status-detail">${tx("sub_mgmt_free_desc")}</span>
          </div>`;
      }

      statusBlock.innerHTML = `<div class="sub-status-inner ${statusClass}">${statusHtml}</div>`;
    }

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

    if (planProBtn) {
      const selectedPlanCode = sub.selectedPlanCode || sub.planCode || (sub.effectiveTier === "v1" ? "v1" : "free");
      if (selectedPlanCode === "v1" && (sub.isPaid || sub.isTrialing) && !sub.cancelAtPeriodEnd) {
        planProBtn.disabled = true;
        planProBtn.textContent = tx("subscription_current_plan");
        planProBtn.dataset.planDisabled = "true";
      } else {
        planProBtn.disabled = false;
        planProBtn.textContent = tx("subscription_pro_cta");
        planProBtn.dataset.planDisabled = "false";
      }
      planProBtn.dataset.defaultLabel = planProBtn.textContent;
    }

    if (planFreeBtn) {
      const selectedPlanCode = sub.selectedPlanCode || sub.planCode || (sub.effectiveTier === "v1" ? "v1" : "free");
      if (sub.cancelAtPeriodEnd) {
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

async function loadBillingHistory() {
  const list = document.getElementById("billingHistoryList");
  if (!list) return;

  try {
    if (!isAuthenticated()) {
      list.innerHTML = `<p>${tx("sub_mgmt_not_signed_in")}</p>`;
      return;
    }

    const res = await apiFetch("/api/billing/history");
    if (!res || !res.ok) {
      list.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_history_error")}</p>`;
      return;
    }

    const payload = await res.json().catch(() => null);
    const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];

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
              <td>${escapeHtml(fmtAmount(inv.amount_paid, inv.currency))}</td>
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

function populateCheckoutModal() {
  const intervalLabel = tx(
    pricingState.billingInterval === "yearly"
      ? "subscription_billing_yearly"
      : "subscription_billing_monthly"
  );
  const currencyLabel = String(pricingState.currency || "usd").toUpperCase();
  const pricing = getPricingDetails();
  const baseTotal = formatMoney(pricingState.currency, pricing.base);
  const addonTotal = formatMoney(pricingState.currency, getAddonTotalAmount());
  const grandTotal = formatMoney(pricingState.currency, getGrandTotalAmount());

  const planEl = document.getElementById("subCheckoutPlanLabel");
  const intervalEl = document.getElementById("subCheckoutIntervalLabel");
  const currencyEl = document.getElementById("subCheckoutCurrencyLabel");
  const addonCountEl = document.getElementById("subCheckoutAddonCount");
  const baseTotalEl = document.getElementById("subCheckoutBaseTotal");
  const addonTotalEl = document.getElementById("subCheckoutAddonTotal");
  const grandTotalEl = document.getElementById("subCheckoutGrandTotal");

  if (planEl) planEl.textContent = "Pro";
  if (intervalEl) intervalEl.textContent = intervalLabel;
  if (currencyEl) currencyEl.textContent = currencyLabel;
  if (addonCountEl) {
    addonCountEl.textContent = pricingState.additionalBusinesses > 0
      ? String(pricingState.additionalBusinesses)
      : "None";
  }
  if (baseTotalEl) baseTotalEl.textContent = baseTotal;
  if (addonTotalEl) addonTotalEl.textContent = pricingState.additionalBusinesses > 0 ? addonTotal : formatMoney(pricingState.currency, 0);
  if (grandTotalEl) grandTotalEl.textContent = grandTotal;
}

function openCheckoutModal() {
  if (pricingState.isCheckoutLoading) {
    return;
  }
  const modal = document.getElementById("subCheckoutModal");
  if (!modal) {
    void startCheckout();
    return;
  }
  populateCheckoutModal();
  modal.classList.remove("hidden");
}

function closeCheckoutModal() {
  document.getElementById("subCheckoutModal")?.classList.add("hidden");
}

function wireCheckoutModal() {
  const modal = document.getElementById("subCheckoutModal");
  const cancelBtn = document.getElementById("subCheckoutCancel");
  const confirmBtn = document.getElementById("subCheckoutConfirm");

  if (!modal || !cancelBtn || !confirmBtn) {
    return;
  }

  confirmBtn.dataset.defaultLabel = confirmBtn.textContent || "";

  cancelBtn.addEventListener("click", closeCheckoutModal);
  confirmBtn.addEventListener("click", startCheckout);
  modal.addEventListener("click", (event) => {
    if (event.target === modal && !pricingState.isCheckoutLoading) {
      closeCheckoutModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden") && !pricingState.isCheckoutLoading) {
      closeCheckoutModal();
    }
  });
}

async function startCheckout() {
  try {
    if (pricingState.isCheckoutLoading) return;
    await loadVerifiedPricingContext();
    setCheckoutLoading(true);

    const endpoint = isTrialDowngradedToBasic(currentSubscription)
      ? "/api/billing/reactivate-trial-pro"
      : "/api/billing/checkout-session";

    const res = await apiFetch(endpoint, {
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
    if (payload?.subscription) {
      closeCheckoutModal();
      currentSubscription = payload.subscription;
      if (typeof applySubscriptionState === "function") {
        applySubscriptionState(payload.subscription);
      }
      await loadSubscription();
      await loadBillingHistory();
      showSubToast("Pro trial resumed.");
      return;
    }
    if (payload?.url) {
      if (!isAllowedBillingRedirect(payload.url)) {
        throw new Error(tx("subscription_checkout_error"));
      }
      closeCheckoutModal();
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
  planProBtn?.addEventListener("click", openCheckoutModal);
  wireCheckoutModal();

  const manageBillingBtn = document.getElementById("subManageBillingBtn");
  manageBillingBtn?.addEventListener("click", openCustomerPortal);

  wireFreeTierModal();

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
      await loadBillingHistory();
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
    await loadBillingHistory();
    return;
  } else if (params.get("checkout") === "cancel") {
    showSubToast(tx("sub_mgmt_checkout_cancelled"));
    window.history.replaceState({}, "", window.location.pathname);
  }

  currentSubscription = await loadSubscription();
  await loadBillingHistory();
});
