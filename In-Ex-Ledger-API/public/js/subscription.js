const SUB_TOAST_MS = 3000;
let subToastTimer = null;
const BILLING_REDIRECT_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);
const SUBSCRIPTION_ACTIVATION_POLL_WINDOW_MS = 15_000;
const SUBSCRIPTION_ACTIVATION_POLL_INTERVAL_MS = 1_500;

let currentSubscription = null;
let currentBillingPricing = null;
let selectedBillingInterval = "monthly";
let pendingDeleteBusinessId = null;
let subscriptionBusinessesState = {
  isLoaded: false,
  error: "",
  items: [],
  activeBusinessId: "",
  billingOwnerBusinessId: ""
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function resolveSafeNextPath(value) {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//") || /[\r\n]/.test(normalized)) {
    return "/transactions";
  }
  return normalized;
}

function syncReactivationBanner() {
  const banner = document.getElementById("subscriptionReactivationNotice");
  const continueLink = document.getElementById("subscriptionReactivationContinue");
  if (!banner) return;
  const params = new URLSearchParams(window.location.search);
  const show = params.get("reactivated") === "1";
  banner.classList.toggle("hidden", !show);
  if (continueLink) {
    continueLink.href = resolveSafeNextPath(params.get("next"));
  }
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
function resolveTimestampMs(ts) {
  if (ts == null || ts === "") return NaN;
  const numeric = typeof ts === "number" ? ts : Number(ts);
  if (Number.isFinite(numeric)) {
    return Math.abs(numeric) >= 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  return new Date(ts).getTime();
}

function fmtDate(ts) {
  if (!ts) return "-";
  const ms = resolveTimestampMs(ts);
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

function fmtMoney(amount, currency) {
  const normalizedCurrency = String(currency || "usd").toLowerCase();
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount)) return "-";

  if (window.billingPricing && typeof window.billingPricing.formatMoney === "function") {
    return window.billingPricing.formatMoney(normalizedCurrency, numericAmount);
  }

  try {
    return new Intl.NumberFormat(normalizedCurrency === "cad" ? "en-CA" : "en-US", {
      style: "currency",
      currency: normalizedCurrency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(numericAmount) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(numericAmount);
  } catch (_) {
    return `${normalizedCurrency.toUpperCase()} ${numericAmount.toFixed(2)}`;
  }
}

function normalizeBillingCurrency(currency) {
  const normalized = String(currency || "usd").trim().toLowerCase();
  return normalized === "cad" ? "cad" : "usd";
}

function normalizeBillingInterval(interval) {
  const normalized = String(interval || "monthly").trim().toLowerCase();
  return normalized === "yearly" ? "yearly" : "monthly";
}

function resolvePricingTable(currency, interval) {
  const normalizedCurrency = normalizeBillingCurrency(currency);
  const normalizedInterval = normalizeBillingInterval(interval);

  if (currentBillingPricing?.pricing?.[normalizedInterval]) {
    const serverPricing = currentBillingPricing.pricing[normalizedInterval];
    const base = Number(serverPricing?.base);
    const addon = Number(serverPricing?.addon);
    if (Number.isFinite(base) && Number.isFinite(addon)) {
      return { base, addon };
    }
  }

  if (window.billingPricing && typeof window.billingPricing.getPricing === "function") {
    const sharedPricing = window.billingPricing.getPricing(normalizedCurrency, normalizedInterval);
    const base = Number(sharedPricing?.base);
    const addon = Number(sharedPricing?.addon);
    if (Number.isFinite(base) && Number.isFinite(addon)) {
      return { base, addon };
    }
  }

  const fallbackTable = {
    usd: {
      monthly: { base: 12, addon: 5 },
      yearly: { base: 122.4, addon: 51 }
    },
    cad: {
      monthly: { base: 17, addon: 7 },
      yearly: { base: 175, addon: 72 }
    }
  };
  return fallbackTable[normalizedCurrency][normalizedInterval];
}

function getSubscriptionPriceSummary(sub, overrides = {}) {
  const source = sub && typeof sub === "object" ? sub : {};
  const currency = normalizeBillingCurrency(overrides.currency || source.currency || currentBillingPricing?.currency || "usd");
  const billingInterval = normalizeBillingInterval(overrides.billingInterval || source.billingInterval || "monthly");
  const additionalBusinesses = Math.max(
    Number.isFinite(Number(overrides.additionalBusinesses))
      ? Number(overrides.additionalBusinesses)
      : Number(source.additionalBusinesses || 0),
    0
  );
  const pricing = resolvePricingTable(currency, billingInterval);
  const cycleBase = Number(pricing?.base || 0);
  const cycleAddonUnit = Number(pricing?.addon || 0);
  const cycleAddonTotal = cycleAddonUnit * additionalBusinesses;
  const cycleTotal = cycleBase + cycleAddonTotal;
  const divisor = billingInterval === "yearly" ? 12 : 1;

  return {
    currency,
    billingInterval,
    additionalBusinesses,
    basePrice: cycleBase,
    addonUnitPrice: cycleAddonUnit,
    addonCycleTotal: cycleAddonTotal,
    cycleTotal,
    monthlyEquivalent: cycleTotal / divisor,
    addonMonthlyEquivalent: cycleAddonUnit / divisor
  };
}

function isAllowedBillingRedirect(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && BILLING_REDIRECT_HOSTS.has(parsed.hostname);
  } catch (_) {
    return false;
  }
}

// ─── Subscription State ───────────────────────────────────────────────────────

function syncSubscriptionBusinessesState(sub) {
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

// ─── Status Panel ─────────────────────────────────────────────────────────────

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
    detail = sub.selectedPlanCode !== "v1"
      ? `Basic is selected after trial, but Pro access stays live until ${fmtDate(sub.trialEndsAt)}.`
      : "Finish billing setup before the trial ends to avoid interruption.";
  } else if (String(sub.status || "").toLowerCase() === "unpaid" && sub.stripeSubscriptionId) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Payment required";
    headline = "Unpaid subscription needs attention";
    detail = "Open Stripe billing to update your payment method and resolve the unpaid invoice.";
  } else if (String(sub.status || "").toLowerCase() === "past_due" && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Past due";
    headline = `Payment issue before ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Update your payment method in Stripe to keep Pro active.";
  } else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = tx("sub_mgmt_badge_canceling");
    headline = `Pro access stays on until ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Renewal is off. Manage your plan or restart billing in Stripe.";
  } else if (sub.isPaid && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-active";
    badgeLabel = tx("sub_mgmt_badge_pro");
    headline = `Pro renews ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Payment method, invoices, and renewal settings are managed securely in Stripe.";
  } else if (sub.isCanceledWithRemainingAccess && sub.currentPeriodEnd) {
    badgeClass = "sub-badge-canceling";
    badgeLabel = "Ended in Stripe";
    headline = `Access remains until ${fmtDate(sub.currentPeriodEnd)}`;
    detail = "Your last Pro cycle is still available. Start a new cycle in Stripe when ready.";
  }

  const additionalBusinesses = Number(sub.additionalBusinesses || 0);
  const totalBusinesses = Number(sub.maxBusinessesAllowed || (1 + additionalBusinesses));
  const billingIntervalLabel = sub.billingInterval === "yearly" ? "Yearly" : "Monthly";
  const currencyLabel = String(sub.currency || "usd").toUpperCase();
  const planLabel = sub.isTrialing ? "Pro trial" : sub.effectiveTier === "v1" ? "Pro" : "Basic";
  const pricingSummary = getSubscriptionPriceSummary(sub);
  const monthlyTotalLabel = fmtMoney(pricingSummary.monthlyEquivalent, pricingSummary.currency);
  const isCanceled = Boolean(sub.cancelAtPeriodEnd || sub.isCanceledWithRemainingAccess);
  const statusValue = isCanceled ? "Canceled" : "Active";
  const statusMeta = isCanceled
    ? "Reactivate below to restore paid access."
    : `${planLabel}${sub.effectiveTier === "v1" ? ` ${billingIntervalLabel.toLowerCase()}` : ""}`;

  return `
    <div class="sub-status-spotlight">
      <div class="sub-status-spotlight-top">
        <span class="sub-status-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
        <span class="sub-status-plan-pill">${escapeHtml(planLabel)}</span>
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
          <span class="sub-status-stat-label">Monthly total</span>
          <strong class="sub-status-stat-value">${escapeHtml(monthlyTotalLabel)}</strong>
          <span class="sub-status-stat-meta">${billingIntervalLabel === "Yearly" ? "Monthly equivalent, billed yearly" : "Current monthly total"}</span>
        </article>
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Businesses allowed</span>
          <strong class="sub-status-stat-value">${totalBusinesses}</strong>
          <span class="sub-status-stat-meta">${additionalBusinesses > 0 ? `${additionalBusinesses} paid add-on${additionalBusinesses === 1 ? "" : "s"}` : "1 included with plan"}</span>
        </article>
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Subscription state</span>
          <strong class="sub-status-stat-value">${escapeHtml(statusValue)}</strong>
          <span class="sub-status-stat-meta">${escapeHtml(statusMeta)}</span>
        </article>
      </div>
    </div>`;
}

// ─── Business Roster ──────────────────────────────────────────────────────────

function buildBusinessRosterMarkup(sub) {
  if (!subscriptionBusinessesState.isLoaded) {
    return `
      <div class="sub-business-roster-card">
        <div class="sub-business-roster-head">
          <div><h3>Businesses on this account</h3><p>Loading your businesses…</p></div>
        </div>
      </div>`;
  }

  if (subscriptionBusinessesState.error) {
    return `
      <div class="sub-business-roster-card">
        <div class="sub-business-roster-head">
          <div><h3>Businesses on this account</h3><p class="sub-business-roster-error">${escapeHtml(subscriptionBusinessesState.error)}</p></div>
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
                <p>${biz.id === billingOwnerId ? "This business owns the current billing relationship." : "Operational business on this account."}</p>
              </div>
              <div class="sub-business-item-actions">
                ${biz.id !== activeId ? `<button type="button" class="settings-secondary-btn" data-business-switch="${escapeHtml(biz.id)}">Switch</button>` : ""}
                <button
                  type="button"
                  class="danger-outline-btn"
                  data-business-delete="${escapeHtml(biz.id)}"
                  data-business-name="${escapeHtml(biz.name || "Business")}"
                  title="${canDeleteMultiple ? "Delete this business" : "Keep at least one business on this account."}"
                  ${!canDeleteMultiple ? "disabled" : ""}
                >
                  Delete business
                </button>
                ${!canDeleteMultiple ? `<span class="sub-business-action-note">Keep at least 1 business on this account.</span>` : ""}
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

// ─── Workspace Capacity Section ───────────────────────────────────────────────

function renderWorkspaceCapacity(sub) {
  const manager = document.getElementById("businessSlotsManager");
  if (!manager) return;
  syncSubscriptionBusinessesState(sub);

  const isProTier = !!sub && sub.effectiveTier === "v1";
  const isActiveTrial = isProTier && sub.isTrialing;
  const canAdd =
    isProTier &&
    (sub.isPaid || sub.isTrialing) &&
    (!sub.cancelAtPeriodEnd || isActiveTrial) &&
    !sub.isCanceledWithRemainingAccess;

  const businesses = subscriptionBusinessesState.items || [];
  const activeCount = businesses.length;
  const allowed = Number(sub?.maxBusinessesAllowed || 1);
  const additionalBusinesses = Number(sub?.additionalBusinesses || 0);
  const pricingSummary = getSubscriptionPriceSummary(sub);
  const monthlyTotalLabel = fmtMoney(pricingSummary.monthlyEquivalent, pricingSummary.currency);
  const addonLabel = fmtMoney(pricingSummary.addonMonthlyEquivalent, pricingSummary.currency);

  const statsHtml = `
    <div class="sub-access-overview">
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_total_businesses_allowed"))}</span>
        <strong class="sub-access-stat-value">${isProTier ? allowed : 1}</strong>
        <span class="sub-access-stat-meta">${isProTier ? "Maximum on current plan" : "Upgrade to unlock more"}</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">Active businesses</span>
        <strong class="sub-access-stat-value">${activeCount}</strong>
        <span class="sub-access-stat-meta">Currently on this account</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">${escapeHtml(tx("subscription_extra_business_slots"))}</span>
        <strong class="sub-access-stat-value">${additionalBusinesses}</strong>
        <span class="sub-access-stat-meta">${additionalBusinesses > 0 ? `${additionalBusinesses} paid slot${additionalBusinesses === 1 ? "" : "s"} at ${addonLabel}/mo${pricingSummary.billingInterval === "yearly" ? " equivalent" : ""}` : "Included with plan"}</span>
      </article>
      <article class="sub-access-stat">
        <span class="sub-access-stat-label">Monthly total</span>
        <strong class="sub-access-stat-value">${monthlyTotalLabel}</strong>
        <span class="sub-access-stat-meta">${pricingSummary.billingInterval === "yearly" ? "Monthly equivalent, billed yearly" : "Current monthly total"}</span>
      </article>
    </div>`;

  const addBtnHtml = canAdd ? `
    <div class="sub-add-business-row">
      <button type="button" id="addBusinessBtn" class="settings-primary-btn">+ Add a business</button>
    </div>` : "";
  manager.innerHTML = `${statsHtml}${buildBusinessRosterMarkup(sub)}${addBtnHtml}`;

  wireBusinessRosterActions();

  if (canAdd) {
    document.getElementById("addBusinessBtn")?.addEventListener("click", openAddBusinessModal);
  }
}

// ─── Add Business Modal ───────────────────────────────────────────────────────

function openAddBusinessModal() {
  const modal = document.getElementById("addBusinessModal");
  const input = document.getElementById("addBusinessNameInput");
  const errorEl = document.getElementById("addBusinessModalError");
  const noteEl = document.getElementById("addBusinessModalPriceNote");
  if (!modal) return;
  if (noteEl && currentSubscription) {
    const currentSummary = getSubscriptionPriceSummary(currentSubscription);
    const nextSummary = getSubscriptionPriceSummary(currentSubscription, {
      additionalBusinesses: currentSummary.additionalBusinesses + 1
    });
    noteEl.innerHTML = `Adding a business changes your monthly total from <strong>${escapeHtml(fmtMoney(currentSummary.monthlyEquivalent, currentSummary.currency))}</strong> to <strong>${escapeHtml(fmtMoney(nextSummary.monthlyEquivalent, nextSummary.currency))}</strong>${currentSummary.billingInterval === "yearly" ? " (monthly equivalent, billed yearly)" : ""}.`;
  }
  if (input) input.value = "";
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }
  modal.classList.remove("hidden");
  setTimeout(() => input?.focus(), 0);
}

function closeAddBusinessModal() {
  document.getElementById("addBusinessModal")?.classList.add("hidden");
}

function wireAddBusinessModal() {
  const modal = document.getElementById("addBusinessModal");
  const cancelBtn = document.getElementById("addBusinessModalCancel");
  const submitBtn = document.getElementById("addBusinessModalSubmit");
  const input = document.getElementById("addBusinessNameInput");

  if (!modal) return;

  cancelBtn?.addEventListener("click", closeAddBusinessModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAddBusinessModal(); });

  submitBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const name = String(input?.value || "").trim();
    const errorEl = document.getElementById("addBusinessModalError");

    if (!name) {
      if (errorEl) { errorEl.textContent = "Business name is required."; errorEl.classList.remove("hidden"); }
      input?.focus();
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Provisioning...";
    if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }

    try {
      const res = await apiFetch("/api/businesses/provision-add-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Failed to add business.");
      }
      window.location.reload();
    } catch (err) {
      alert(err.message || "Failed to add business. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

// ─── Customer Portal ──────────────────────────────────────────────────────────

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

function getCheckoutCtaConfig(sub) {
  if (!sub) return null;
  if (sub.cancelAtPeriodEnd || sub.isCanceledWithRemainingAccess) {
    return {
      label: "Reactivate now",
      note: "Choose monthly or yearly billing before reopening Pro access."
    };
  }
  if (sub.isTrialing && !sub.stripeSubscriptionId) {
    return {
      label: "Secure Pro billing",
      note: "Lock in billing now so Pro stays active when the trial ends."
    };
  }
  if (sub.effectiveTier !== "v1" && !sub.isPaid) {
    return {
      label: "Upgrade to Pro",
      note: "Choose the billing interval you want before Stripe checkout starts."
    };
  }
  return null;
}

function renderStatusActionArea(sub) {
  const container = document.getElementById("subStatusActionArea");
  if (!container) return;

  const config = getCheckoutCtaConfig(sub);
  if (!config) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  const interval = selectedBillingInterval === "yearly" ? "yearly" : "monthly";
  const summary = getSubscriptionPriceSummary(sub, { billingInterval: interval });
  const monthlyTotal = fmtMoney(summary.monthlyEquivalent, summary.currency);
  const cycleTotal = fmtMoney(summary.cycleTotal, summary.currency);
  const intervalLabel = interval === "yearly" ? "yearly" : "monthly";

  container.innerHTML = `
    <div class="sub-status-inline-controls">
      <div class="sub-toggle" role="group" aria-label="Billing interval">
        <button type="button" class="sub-toggle-btn ${interval === "monthly" ? "is-active" : ""}" data-sub-billing-interval="monthly" aria-pressed="${interval === "monthly" ? "true" : "false"}">Monthly</button>
        <button type="button" class="sub-toggle-btn ${interval === "yearly" ? "is-active" : ""}" data-sub-billing-interval="yearly" aria-pressed="${interval === "yearly" ? "true" : "false"}">Yearly</button>
      </div>
      <button type="button" id="subStartCheckoutBtn" class="sub-cta-primary">${escapeHtml(config.label)}</button>
    </div>
    <p class="sub-status-inline-note">${escapeHtml(config.note)} ${escapeHtml(cycleTotal)} billed ${intervalLabel}. Monthly equivalent: ${escapeHtml(monthlyTotal)}.</p>
  `;

  container.classList.remove("hidden");

  container.querySelectorAll("[data-sub-billing-interval]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextInterval = String(button.getAttribute("data-sub-billing-interval") || "").toLowerCase();
      if (nextInterval !== "monthly" && nextInterval !== "yearly") return;
      selectedBillingInterval = nextInterval;
      renderStatusActionArea(sub);
    });
  });

  container.querySelector("#subStartCheckoutBtn")?.addEventListener("click", startSubscriptionCheckout);
}

async function startSubscriptionCheckout() {
  if (!currentSubscription) return;
  const interval = selectedBillingInterval === "yearly" ? "yearly" : "monthly";
  try {
    const res = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingInterval: interval,
        additionalBusinesses: Number(currentSubscription.additionalBusinesses || 0),
        returnPath: "/subscription"
      })
    });
    if (!res) return;
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    if (payload?.url) {
      if (!isAllowedBillingRedirect(payload.url)) {
        throw new Error(tx("subscription_portal_error"));
      }
      window.location.href = payload.url;
    }
  } catch (err) {
    showSubToast(err.message || "Unable to start checkout.");
  }
}

async function openCancelPortalOrCancelSubscription() {
  if (currentSubscription?.stripeSubscriptionId) {
    try {
      const res = await apiFetch("/api/billing/customer-portal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res) return;
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || tx("settings_cancel_sub_error"));
      if (payload?.url) {
        if (!isAllowedBillingRedirect(payload.url)) {
          throw new Error(tx("subscription_portal_error"));
        }
        window.location.href = payload.url;
      }
      return;
    } catch (err) {
      showSubToast(err.message || tx("settings_cancel_sub_error"));
      return;
    }
  }

  const cancelModal = document.getElementById("subCancelModal");
  cancelModal?.classList.remove("hidden");
}

// ─── Business Delete Modal ────────────────────────────────────────────────────

function setBusinessDeleteError(message = "") {
  const errorNode = document.getElementById("subBusinessDeleteError");
  if (!errorNode) return;
  if (!message) {
    errorNode.textContent = "";
    errorNode.classList.add("hidden");
    return;
  }
  errorNode.textContent = message;
  errorNode.classList.remove("hidden");
}

function openBusinessDeleteModal(businessId, businessName) {
  pendingDeleteBusinessId = businessId;
  const modal = document.getElementById("subBusinessDeleteModal");
  const body = document.getElementById("subBusinessDeleteBody");
  const passwordInput = document.getElementById("subBusinessDeletePassword");
  const remainingBusinesses = Math.max((subscriptionBusinessesState.items || []).length - 1, 0);
  const nextAdditionalBusinesses = Math.max(remainingBusinesses - 1, 0);
  const currentAdditionalBusinesses = Number(currentSubscription?.additionalBusinesses || 0);
  const currentSummary = getSubscriptionPriceSummary(currentSubscription);
  const nextSummary = getSubscriptionPriceSummary(currentSubscription, {
    additionalBusinesses: nextAdditionalBusinesses
  });

  if (body) {
    const lines = [
      `<span>This permanently deletes <strong>${escapeHtml(businessName)}</strong> and its associated data.</span>`,
      `<span>You will have <strong>${remainingBusinesses}</strong> business${remainingBusinesses === 1 ? "" : "es"} remaining.</span>`
    ];

    if (currentSubscription?.effectiveTier === "v1") {
      lines.push(
        `<span>Your paid add-on count will change from <strong>${currentAdditionalBusinesses}</strong> to <strong>${nextAdditionalBusinesses}</strong>.</span>`
      );
      lines.push(
        `<span>Your monthly total will change from <strong>${escapeHtml(fmtMoney(currentSummary.monthlyEquivalent, currentSummary.currency))}</strong> to <strong>${escapeHtml(fmtMoney(nextSummary.monthlyEquivalent, nextSummary.currency))}</strong>${currentSummary.billingInterval === "yearly" ? " (monthly equivalent, billed yearly)" : ""}.</span>`
      );
    }

    body.innerHTML = lines.join("<br /><br />");
  }

  if (passwordInput) passwordInput.value = "";
  setBusinessDeleteError("");
  modal?.classList.remove("hidden");
  setTimeout(() => passwordInput?.focus(), 0);
}

function closeBusinessDeleteModal() {
  pendingDeleteBusinessId = null;
  setBusinessDeleteError("");
  document.getElementById("subBusinessDeleteModal")?.classList.add("hidden");
}

function wireBusinessDeleteModal() {
  const modal = document.getElementById("subBusinessDeleteModal");
  const cancelBtn = document.getElementById("subBusinessDeleteCancel");
  const confirmBtn = document.getElementById("subBusinessDeleteConfirm");
  const passwordInput = document.getElementById("subBusinessDeletePassword");

  cancelBtn?.addEventListener("click", closeBusinessDeleteModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeBusinessDeleteModal();
  });

  confirmBtn?.addEventListener("click", async () => {
    const password = passwordInput?.value || "";
    if (!pendingDeleteBusinessId) return;
    if (!password) {
      setBusinessDeleteError("Enter your password to delete this business.");
      passwordInput?.focus();
      return;
    }

    confirmBtn.disabled = true;
    setBusinessDeleteError("");
    try {
      const res = await apiFetch(`/api/businesses/${pendingDeleteBusinessId}`, {
        allowUnauthorizedResponse: true,
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Failed to delete business.");
      }

      if (Array.isArray(payload?.businesses) && window.__LUNA_ME__ && typeof window.__LUNA_ME__ === "object") {
        window.__LUNA_ME__ = { ...window.__LUNA_ME__, businesses: payload.businesses };
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
    } catch (err) {
      setBusinessDeleteError(err.message || "Failed to delete business.");
      passwordInput?.focus();
    } finally {
      confirmBtn.disabled = false;
    }
  });
}

// ─── Main Load ────────────────────────────────────────────────────────────────

async function loadSubscription() {
  const statusBlock = document.getElementById("subStatusBlock");
  const manageBillingBtn = document.getElementById("subManageBillingBtn");
  const cancelBtn = document.getElementById("subCancelBtn");
  const cancelModalBody = document.getElementById("subCancelModalBody");

  try {
    if (!isAuthenticated()) {
      if (statusBlock) statusBlock.innerHTML = `<p>${tx("sub_mgmt_not_signed_in")}</p>`;
      renderWorkspaceCapacity(null);
      return null;
    }

    const res = await apiFetch("/api/billing/overview");
    if (!res || !res.ok) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderWorkspaceCapacity(null);
      return null;
    }

    const payload = await res.json().catch(() => null);
    const sub = payload?.subscription;
    if (!sub) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      renderWorkspaceCapacity(null);
      return null;
    }

    currentSubscription = sub;
    if (!selectedBillingInterval || selectedBillingInterval === "monthly") {
      selectedBillingInterval = sub.billingInterval === "yearly" ? "yearly" : "monthly";
    }
    try {
      const pricingRes = await apiFetch("/api/billing/pricing");
      const pricingPayload = pricingRes ? await pricingRes.json().catch(() => null) : null;
      currentBillingPricing = pricingRes && pricingRes.ok && pricingPayload?.pricing
        ? pricingPayload
        : null;
    } catch (_) {
      currentBillingPricing = null;
    }
    syncSubscriptionBusinessesState(sub);

    if (statusBlock) {
      statusBlock.innerHTML = buildStatusPanelMarkup(sub);
    }
    renderStatusActionArea(sub);

    if (cancelModalBody && sub.currentPeriodEnd) {
      const endDate = fmtDate(sub.currentPeriodEnd);
      cancelModalBody.textContent = typeof window.t === "function"
        ? window.t("settings_cancel_sub_modal_body_date").replace("{date}", endDate)
        : `Your subscription will remain active until ${endDate}.`;
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

    renderWorkspaceCapacity(sub);

    return sub;
  } catch (err) {
    console.error("[Subscription] Failed to load subscription:", err);
    if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
    return null;
  }
}

async function waitForSubscriptionActivation() {
  const deadline = Date.now() + SUBSCRIPTION_ACTIVATION_POLL_WINDOW_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const sub = await loadSubscription();
    latest = sub;
    if (sub?.effectiveTier === "v1" && (sub.isPaid || sub.isTrialing)) {
      return sub;
    }
    if (Date.now() + SUBSCRIPTION_ACTIVATION_POLL_INTERVAL_MS >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, SUBSCRIPTION_ACTIVATION_POLL_INTERVAL_MS));
  }
  showSubToast("Checkout succeeded, but billing is still syncing. Refresh in a moment if Pro access does not appear yet.");
  return latest || loadSubscription();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  syncReactivationBanner();
  if (typeof requireValidSessionOrRedirect === "function") {
    await requireValidSessionOrRedirect();
  }
  if (typeof enforceTrial === "function") enforceTrial();

  syncReactivationBanner();
  wireAddBusinessModal();
  wireBusinessDeleteModal();

  document.getElementById("subManageBillingBtn")?.addEventListener("click", openCustomerPortal);
  document.getElementById("subHistoryPortalBtn")?.addEventListener("click", openCustomerPortal);

  const cancelModal = document.getElementById("subCancelModal");
  const cancelModalCancel = document.getElementById("subCancelModalCancel");
  const cancelModalConfirm = document.getElementById("subCancelModalConfirm");

  document.getElementById("subCancelBtn")?.addEventListener("click", openCancelPortalOrCancelSubscription);
  cancelModalCancel?.addEventListener("click", () => cancelModal?.classList.add("hidden"));
  cancelModal?.addEventListener("click", (e) => { if (e.target === cancelModal) cancelModal.classList.add("hidden"); });

  cancelModalConfirm?.addEventListener("click", async () => {
    cancelModalConfirm.disabled = true;
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const payload = await res?.json()?.catch(() => null);
      if (!res || !res.ok) {
        showSubToast(payload?.error || tx("settings_cancel_sub_error"));
        return;
      }
      cancelModal?.classList.add("hidden");
      window.location.href = "/subscription?portal=cancelled";
    } catch (err) {
      console.error("Cancel subscription failed", err);
      showSubToast(tx("settings_cancel_sub_error"));
    } finally {
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
  } else if (params.get("portal") === "cancelled") {
    showSubToast(tx("settings_cancel_sub_success"));
    window.history.replaceState({}, "", window.location.pathname);
  }

  currentSubscription = await loadSubscription();
});
