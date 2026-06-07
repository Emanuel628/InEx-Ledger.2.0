const SUB_TOAST_MS = 3000;
let subToastTimer = null;
const BILLING_REDIRECT_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);
const SUBSCRIPTION_ACTIVATION_POLL_WINDOW_MS = 15_000;
const SUBSCRIPTION_ACTIVATION_POLL_INTERVAL_MS = 1_500;

let currentSubscription = null;
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

<<<<<<< HEAD
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

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

=======
>>>>>>> 00101ce3 (Redesign Subscription page: 3-section layout with provision-add-on modal)
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
  const totalBusinesses = 1 + additionalBusinesses;
  const billingIntervalLabel = sub.billingInterval === "yearly" ? "Yearly" : "Monthly";
  const currencyLabel = String(sub.currency || "usd").toUpperCase();
  const planLabel = sub.isTrialing ? "Pro trial" : sub.effectiveTier === "v1" ? "Pro" : "Basic";

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
          <span class="sub-status-stat-label">Businesses allowed</span>
          <strong class="sub-status-stat-value">${totalBusinesses}</strong>
          <span class="sub-status-stat-meta">${additionalBusinesses > 0 ? `${additionalBusinesses} paid add-on${additionalBusinesses === 1 ? "" : "s"}` : "1 included with plan"}</span>
        </article>
        <article class="sub-status-stat-card">
          <span class="sub-status-stat-label">Billing system</span>
          <strong class="sub-status-stat-value">Stripe</strong>
          <span class="sub-status-stat-meta">Portal, invoices, payment method</span>
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
        <span class="sub-access-stat-meta">${additionalBusinesses > 0 ? `+$${additionalBusinesses * 5}/mo (est.)` : "Included with plan"}</span>
      </article>
    </div>`;

  const addBtnHtml = canAdd ? `
    <div class="sub-add-business-row">
      <button type="button" id="addBusinessBtn" class="settings-primary-btn">+ Add a business</button>
    </div>` : "";

<<<<<<< HEAD
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
  const slotPricing = getPricingDetails();
  const slotRateLabel = pricingState.billingInterval === "yearly"
    ? `${formatMoney(pricingState.currency, slotPricing.addon)} / year per extra slot`
    : `${formatMoney(pricingState.currency, slotPricing.addon)} / month per extra slot`;

  manager.innerHTML = `
    ${buildBusinessRosterMarkup(sub)}
    ${statsHtml}
    <div class="sub-slots-panel">
      <div class="sub-slots-panel-head">
        <div class="sub-slots-panel-copy">
          <h3>Business capacity</h3>
          <p>These controls change the billed add-on count only. Edit or delete individual businesses from Settings.</p>
        </div>
        <div class="sub-slots-price-pill">${escapeHtml(slotRateLabel)}</div>
      </div>
      <div class="sub-slots-actions">
        <p class="sub-slots-state-label" id="slotsStateLabel">${escapeHtml(stateMsg)}</p>
        <div class="sub-slots-inline-controls">
          <div class="sub-slots-btn-row">
            <button type="button" id="removeSlotBtn" class="sub-slots-arrow-btn sub-slots-arrow-btn-prev" aria-label="Remove a business"${extra <= 0 ? " disabled" : ""}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6 7 12l8 6Z"></path></svg>
            </button>
            <span class="sub-slots-inline-rate">${escapeHtml(slotRateLabel)}</span>
            <button type="button" id="addSlotBtn" class="sub-slots-arrow-btn sub-slots-arrow-btn-next" aria-label="Add a business">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 8 6-8 6Z"></path></svg>
            </button>
          </div>
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
=======
  manager.innerHTML = `${statsHtml}${buildBusinessRosterMarkup(sub)}${addBtnHtml}`;
>>>>>>> 00101ce3 (Redesign Subscription page: 3-section layout with provision-add-on modal)

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
  if (!modal) return;
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
    syncSubscriptionBusinessesState(sub);

    if (statusBlock) {
      statusBlock.innerHTML = buildStatusPanelMarkup(sub);
    }

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

  document.getElementById("subCancelBtn")?.addEventListener("click", () => cancelModal?.classList.remove("hidden"));
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
      showSubToast(tx("settings_cancel_sub_success"));
      currentSubscription = await loadSubscription();
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
  }

  currentSubscription = await loadSubscription();
});
