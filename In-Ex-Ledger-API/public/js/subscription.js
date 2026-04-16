const SUB_TOAST_MS = 3000;
let subToastTimer = null;
const BILLING_INTERVALS = ["monthly", "yearly"];
const BILLING_CURRENCIES = ["usd", "cad"];
const MAX_ADDITIONAL_BUSINESSES = 100;
const pricingState = {
  billingInterval: "monthly",
  currency: "usd",
  additionalBusinesses: 0,
  isCheckoutLoading: false
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
  } catch (err) {
    return `${normalizedCurrency} ${value.toFixed(2)}`;
  }
}

function resolveDefaultCurrency() {
  const region = String(localStorage.getItem("lb_region") || window.LUNA_REGION || "").toLowerCase();
  return region === "ca" ? "cad" : "usd";
}

function clampAdditionalBusinesses(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_ADDITIONAL_BUSINESSES);
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
  const currencyButtons = Array.from(document.querySelectorAll("[data-currency]"));
  const additionalInput = document.getElementById("additionalBusinessesInput");
  const planPriceLabel = document.getElementById("planProPriceLabel");
  const summaryPlan = document.getElementById("subPricePlan");
  const summaryAddon = document.getElementById("subPriceAddon");
  const summaryTotal = document.getElementById("subPriceTotal");
  const decrementBtn = document.querySelector("[data-qty-action='decrease']");
  const incrementBtn = document.querySelector("[data-qty-action='increase']");

  intervalButtons.forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.billingInterval === pricingState.billingInterval)
  );
  currencyButtons.forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.currency === pricingState.currency)
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

  const intervalLabel =
    pricingState.billingInterval === "yearly"
      ? tx("subscription_billing_yearly")
      : tx("subscription_billing_monthly");
  const planSummaryText = `${pricingState.currency.toUpperCase()} · ${intervalLabel}`;

  if (planPriceLabel) {
    planPriceLabel.textContent = planSummaryText;
  }
  if (summaryPlan) {
    summaryPlan.textContent = planSummaryText;
  }
  if (summaryAddon) {
    summaryAddon.textContent = String(pricingState.additionalBusinesses);
  }
  if (summaryTotal) {
    summaryTotal.textContent = tx("subscription_price_at_checkout");
  }
}

function initPricingControls() {
  const lockedCurrency = resolveDefaultCurrency();
  pricingState.currency = lockedCurrency;
  pricingState.billingInterval = "monthly";
  pricingState.additionalBusinesses = 0;

  // Lock currency to the user's region — prevent cross-region price selection
  document.querySelectorAll("[data-currency]").forEach((btn) => {
    const btnCurrency = String(btn.dataset.currency || "").toLowerCase();
    if (btnCurrency !== lockedCurrency) {
      btn.disabled = true;
      btn.title = btn.dataset.currency === "cad"
        ? "CAD pricing is available for Canadian accounts only"
        : "USD pricing is available for US accounts only";
    }
  });

  document.querySelectorAll("[data-billing-interval]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const interval = String(btn.dataset.billingInterval || "").toLowerCase();
      if (!BILLING_INTERVALS.includes(interval)) return;
      pricingState.billingInterval = interval;
      updatePricingUI();
    });
  });

  document.querySelectorAll("[data-currency]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const currency = String(btn.dataset.currency || "").toLowerCase();
      if (!BILLING_CURRENCIES.includes(currency)) return;
      pricingState.currency = currency;
      updatePricingUI();
    });
  });

  const additionalInput = document.getElementById("additionalBusinessesInput");
  if (additionalInput) {
    additionalInput.addEventListener("input", () => {
      const value = clampAdditionalBusinesses(Number(additionalInput.value));
      pricingState.additionalBusinesses = value;
      updatePricingUI();
    });
    additionalInput.addEventListener("change", () => {
      const value = clampAdditionalBusinesses(Number(additionalInput.value));
      pricingState.additionalBusinesses = value;
      updatePricingUI();
    });
  }

  document.querySelectorAll("[data-qty-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.qtyAction;
      const delta = action === "increase" ? 1 : action === "decrease" ? -1 : 0;
      pricingState.additionalBusinesses = clampAdditionalBusinesses(
        pricingState.additionalBusinesses + delta
      );
      updatePricingUI();
    });
  });

  updatePricingUI();
}

function setCheckoutLoading(isLoading) {
  pricingState.isCheckoutLoading = isLoading;
  const planProBtn = document.getElementById("planProBtn");
  if (!planProBtn) return;
  const defaultLabel = planProBtn.dataset.defaultLabel || planProBtn.textContent || "";
  if (isLoading) {
    planProBtn.disabled = true;
    planProBtn.textContent = tx("subscription_checkout_loading");
  } else {
    planProBtn.disabled = planProBtn.dataset.planDisabled === "true";
    planProBtn.textContent = defaultLabel;
  }
}

function initSubNav() {
  const navButtons = Array.from(document.querySelectorAll("[data-settings-target]"));
  if (!navButtons.length) return;

  const targets = navButtons
    .map((btn) => ({ btn, target: document.getElementById(btn.dataset.settingsTarget || "") }))
    .filter((e) => e.target);

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
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.2, 0.4, 0.6] }
    );
    targets.forEach(({ target }) => observer.observe(target));
  }
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
      return null;
    }

    const res = await apiFetch("/api/billing/subscription");
    if (!res || !res.ok) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      return null;
    }

    const payload = await res.json().catch(() => null);
    const sub = payload?.subscription;
    if (!sub) {
      if (statusBlock) statusBlock.innerHTML = `<p class="sub-status-error">${tx("sub_mgmt_load_error")}</p>`;
      return null;
    }

    // Render the status block
    if (statusBlock) {
      const tierLabel = sub.effectiveTier === "v1" ? "Pro" : "Free";
      let statusHtml = "";
      let statusClass = "sub-status-free";

      if (sub.isTrialing && sub.trialEndsAt) {
        statusClass = "sub-status-trial";
        statusHtml = `
          <div class="sub-status-row">
            <span class="sub-status-badge sub-badge-trial">${tx("sub_mgmt_badge_trial")}</span>
            <span class="sub-status-detail">${tx("sub_mgmt_trial_ends")}: <strong>${fmtDate(sub.trialEndsAt)}</strong></span>
          </div>`;
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

    // Cancel modal body — sub.currentPeriodEnd is a Unix timestamp (seconds).
    // fmtDate() handles seconds→ms conversion, so use it instead of new Date().
    if (cancelModalBody && sub.currentPeriodEnd) {
      const endDate = fmtDate(sub.currentPeriodEnd);
      cancelModalBody.textContent = typeof window.t === "function"
        ? window.t("settings_cancel_sub_modal_body_date").replace("{date}", endDate)
        : `Your subscription will remain active until ${endDate}. You will lose access to premium features after that date.`;
    }

    // Show/hide action buttons
    if (manageBillingBtn) {
      manageBillingBtn.classList.toggle("hidden", !sub.stripeCustomerId);
    }
    if (cancelBtn) {
      cancelBtn.classList.toggle("hidden", !(sub.isPaid && !sub.cancelAtPeriodEnd));
    }

    // Apply subscription state for plan buttons
    if (typeof applySubscriptionState === "function") {
      applySubscriptionState(sub);
    }

    // Set up plan buttons
    if (planProBtn) {
      if (sub.effectiveTier === "v1" && !sub.cancelAtPeriodEnd) {
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
      if (sub.effectiveTier !== "v1" && !sub.cancelAtPeriodEnd) {
        planFreeBtn.disabled = true;
        planFreeBtn.textContent = tx("subscription_current_plan");
      } else if (sub.stripeCustomerId) {
        planFreeBtn.disabled = false;
        planFreeBtn.textContent = tx("subscription_manage_billing");
      } else {
        planFreeBtn.disabled = true;
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
                ${inv.hosted_invoice_url
                  ? `<a href="${escapeHtml(inv.hosted_invoice_url)}" target="_blank" rel="noopener noreferrer" class="billing-invoice-link">${tx("sub_mgmt_view_invoice")}</a>`
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

async function startCheckout() {
  try {
    if (pricingState.isCheckoutLoading) return;
    setCheckoutLoading(true);
    const checkoutPayload = {
      billingInterval: pricingState.billingInterval,
      currency: pricingState.currency,
      additionalBusinesses: pricingState.additionalBusinesses
    };
    const res = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload)
    });
    if (!res) {
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

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof requireValidSessionOrRedirect === "function") {
    await requireValidSessionOrRedirect();
  }
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  initSubNav();
  initPricingControls();

  const planProBtn = document.getElementById("planProBtn");
  planProBtn?.addEventListener("click", startCheckout);

  const planFreeBtn = document.getElementById("planFreeBtn");
  planFreeBtn?.addEventListener("click", openCustomerPortal);

  const manageBillingBtn = document.getElementById("subManageBillingBtn");
  manageBillingBtn?.addEventListener("click", openCustomerPortal);

  // Cancel subscription flow
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
      await loadSubscription();
      cancelModalConfirm.disabled = false;
    } catch (err) {
      console.error("Cancel subscription failed", err);
      showSubToast(tx("settings_cancel_sub_error"));
      cancelModalConfirm.disabled = false;
    }
  });

  // Handle checkout=success / checkout=cancel query params
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "success") {
    showSubToast(tx("sub_mgmt_checkout_success"));
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("checkout") === "cancel") {
    showSubToast(tx("sub_mgmt_checkout_cancelled"));
    window.history.replaceState({}, "", window.location.pathname);
  }

  await loadSubscription();
  await loadBillingHistory();
});
