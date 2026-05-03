const REGION_DISPLAY = {
  us: "United States",
  ca: "Canada"
};

const SETTINGS_DEFAULT_THEME = typeof DEFAULT_THEME !== "undefined" ? DEFAULT_THEME : "light";
const SETTINGS_THEME_VERSION = typeof THEME_VERSION !== "undefined" ? THEME_VERSION : "2";
const SETTINGS_TOAST_MS = 3000;
const SETTINGS_DELETE_DATA_KEYS = [
  "lb_accounts",
  "lb_categories",
  "lb_transactions",
  "lb_receipts",
  "lb_mileage",
  "lb_recurring",
  "lb_businesses",
  "lb_business_profile",
  "lb_business_settings",
  "lb_export_history",
  "lb_export_scope",
  "lb_export_language",
  "lb_active_business_id",
  "lb_business_name",
  "lb_transactions_upsell_hidden"
];
const SETTINGS_PASSWORD_RULES = {
  length: (value) => value.length >= 8,
  number: (value) => /\d/.test(value),
  uppercase: (value) => /[A-Z]/.test(value),
  special: (value) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
};
const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
const taxHelpers = window.LUNA_TAX || {};
const resolveEstimatedTaxProfileHelper = taxHelpers.resolveEstimatedTaxProfile || ((region, province) => {
  const normalizedRegion = String(region || "").toUpperCase() === "CA" ? "CA" : "US";
  const normalizedProvince = String(province || "").toUpperCase();
  const caRates = taxHelpers.CANADA_ESTIMATED_TAX_RATES || {
    AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15,
    NT: 0.05, NU: 0.05, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, YT: 0.05
  };
  return {
    region: normalizedRegion,
    province: normalizedProvince,
    rate: normalizedRegion === "CA"
      ? (caRates[normalizedProvince] || (taxHelpers.DEFAULT_CA_ESTIMATED_TAX_RATE || 0.05))
      : (taxHelpers.US_ESTIMATED_TAX_RATE || 0.24)
  };
});
const formatEstimatedTaxPercentHelper = taxHelpers.formatEstimatedTaxPercent || ((rate, province = "") => {
  const decimals = String(province || "").toUpperCase() === "QC" ? 3 : 0;
  return `${(Number(rate || 0) * 100).toFixed(decimals)}%`;
});
const CA_PROVINCE_NAMES = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon"
};
const SETTINGS_BUSINESS_TYPE_KEYS = {
  sole_proprietor: "settings_business_type_sole_prop",
  llc: "settings_business_type_llc",
  s_corp: "settings_business_type_scorp",
  partnership: "settings_business_type_partnership",
  corporation: "settings_business_type_corporation"
};

let privacySettings = {
  dataSharingOptOut: null,
  consentGiven: false,
  analyticsOptIn: false,
  dataResidency: "US"
};

let toastTimer = null;
let dangerAction = null;
let preferenceBaseline = null;
let pendingPreferences = null;
let businessSettingsState = {
  region: "US",
  language: "en",
  province: ""
};
let settingsOverviewState = {
  businessProfile: null,
  billingStatus: "",
  cpaActiveCount: 0,
  cpaHistoryCount: 0,
  mfaEnabled: false
};

function isCpaUiEnabled() {
  return window.__LUNA_FLAGS__?.cpaUiEnabled === true;
}

function hideCpaSettingsUi() {
  document.querySelectorAll('[data-settings-target="settings-cpa-access"]').forEach((node) => {
    node.hidden = true;
    node.classList.add("hidden");
  });
  const cpaPanel = document.getElementById("settings-cpa-access");
  if (cpaPanel) {
    cpaPanel.hidden = true;
    cpaPanel.classList.add("hidden");
  }
}

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  initSettingsNav();
  initSettingsTabs();
  await initBusinessProfileForm();
  await initAccountingLockPanel();
  await initAccountSettings();
  if (isCpaUiEnabled()) {
    await initCpaAccess();
  } else {
    hideCpaSettingsUi();
  }
  await initPreferences();
  initSecurityForm();
  initDangerZone();
  syncSettingsOverviewSummaries();
  window.addEventListener("lunaLanguageChanged", refreshSettingsLocalizedState);
  window.addEventListener("lunaRegionChanged", refreshSettingsLocalizedState);
});

function resolveSavedTheme() {
  const storedVersion = localStorage.getItem("lb_theme_version");
  if (storedVersion !== SETTINGS_THEME_VERSION) {
    localStorage.setItem("lb_theme", SETTINGS_DEFAULT_THEME);
    localStorage.setItem("lb_theme_version", SETTINGS_THEME_VERSION);
    return SETTINGS_DEFAULT_THEME;
  }
  return localStorage.getItem("lb_theme") || SETTINGS_DEFAULT_THEME;
}

function getBusinessProfile() {
  return settingsOverviewState.businessProfile || {};
}

function saveBusinessProfile(profile) {
  settingsOverviewState.businessProfile = profile || null;
}

function resolveDisplayLocale() {
  const lang = (window.LUNA_LANGUAGE || "en").toLowerCase();
  const region = (window.LUNA_REGION || "us").toUpperCase();
  return `${lang}-${region}`;
}

function formatFiscalYearSummary(value) {
  if (!value) return t("settings_overview_fiscal_not_set");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = date.toLocaleDateString(resolveDisplayLocale(), { month: "short", day: "numeric" });
  return interpolateTranslatedMessage("settings_overview_fiscal_year", { date: formatted });
}

function localizeBusinessType(type) {
  const key = SETTINGS_BUSINESS_TYPE_KEYS[String(type || "").trim()];
  return key ? t(key) : t("settings_overview_business_type_missing");
}

function localizeLanguageSummary(language) {
  if (language === "es") return t("settings_language_option_es");
  if (language === "fr") return t("settings_language_option_fr");
  return t("settings_language_option_en");
}

function localizeRegionSummary(region) {
  return normalizeSettingsRegion(region) === "ca" ? t("region_ca") : t("region_us");
}

function localizeThemeSummary(theme) {
  return theme === "dark" ? t("settings_theme_dark") : t("settings_theme_light");
}

function resolvePreferenceSummaryState() {
  const source = pendingPreferences || preferenceBaseline || {
    region: normalizeSettingsRegion(businessSettingsState.region),
    language: normalizeSettingsLanguage(businessSettingsState.language),
    theme: resolveSavedTheme()
  };
  const language = localizeLanguageSummary(source.language);
  const region = localizeRegionSummary(source.region);
  const theme = localizeThemeSummary(source.theme);
  return `${language} • ${region} • ${theme}`;
}

function syncSettingsOverviewSummaries() {
  const businessNode = document.getElementById("overviewBusinessSummary");
  const billingNode = document.getElementById("overviewBillingSummary");
  const cpaNode = document.getElementById("overviewCpaSummary");
  const securityNode = document.getElementById("overviewSecuritySummary");
  const preferencesNode = document.getElementById("overviewPreferencesSummary");
  const privacyNode = document.getElementById("overviewPrivacySummary");

  const businessProfile = settingsOverviewState.businessProfile || getBusinessProfile();
  const businessName = businessProfile?.name || t("settings_overview_business_missing");
  const businessType = localizeBusinessType(businessProfile?.type);
  const fiscalYear = formatFiscalYearSummary(businessProfile?.fiscalYearStart);
  if (businessNode) businessNode.textContent = `${businessName} • ${businessType} • ${fiscalYear}`;

  if (billingNode) {
    billingNode.textContent = settingsOverviewState.billingStatus || t("settings_overview_billing_unavailable");
  }

  if (cpaNode) {
    if (!isCpaUiEnabled()) {
      cpaNode.closest(".settings-summary-card")?.classList.add("hidden");
    }
    const activeLabel = settingsOverviewState.cpaActiveCount === 1
      ? t("settings_overview_active_grant_singular")
      : t("settings_overview_active_grant_plural");
    const historyLabel = settingsOverviewState.cpaHistoryCount === 1
      ? t("settings_overview_history_item_singular")
      : t("settings_overview_history_item_plural");
    cpaNode.textContent = `${settingsOverviewState.cpaActiveCount} ${activeLabel} • ${settingsOverviewState.cpaHistoryCount} ${historyLabel}`;
  }

  if (securityNode) {
    securityNode.textContent = settingsOverviewState.mfaEnabled
      ? `${t("settings_overview_mfa_enabled")} • ${t("settings_overview_sessions_available")}`
      : `${t("settings_overview_mfa_disabled")} • ${t("settings_overview_sessions_available")}`;
  }

  if (preferencesNode) {
    preferencesNode.textContent = resolvePreferenceSummaryState();
  }

  if (privacyNode) {
    privacyNode.textContent = privacySettings.dataSharingOptOut
      ? `${t("settings_overview_analytics_off")} • ${t("settings_overview_data_export")}`
      : `${t("settings_overview_analytics_on")} • ${t("settings_overview_data_export")}`;
  }
}

async function initBusinessProfileForm() {
  const form = document.getElementById("businessProfileForm");
  if (!form) return;

  const profile = await loadBusinessProfile();
  document.getElementById("business-name").value = profile.name || "";
  document.getElementById("business-type-select").value = profile.type || "sole_proprietor";
  document.getElementById("fiscal-year").value = profile.fiscalYearStart || "";
  document.getElementById("operating-name").value = profile.operatingName || "";
  document.getElementById("business-activity-code").value = profile.businessActivityCode || "";

  // Parse stored newline-delimited address string back into structured fields
  const addrParts = (profile.address || "").split("\n");
  document.getElementById("address-line1").value = addrParts[0] || "";
  document.getElementById("address-line2").value = addrParts[1] || "";
  document.getElementById("address-city").value = addrParts[2] || "";
  document.getElementById("address-state").value = addrParts[3] || "";
  document.getElementById("address-postal").value = addrParts[4] || "";
  document.getElementById("address-country").value = addrParts[5] || "";

  settingsOverviewState.businessProfile = profile;
  syncSettingsOverviewSummaries();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const addressParts = [
      document.getElementById("address-line1").value.trim(),
      document.getElementById("address-line2").value.trim(),
      document.getElementById("address-city").value.trim(),
      document.getElementById("address-state").value.trim(),
      document.getElementById("address-postal").value.trim(),
      document.getElementById("address-country").value.trim()
    ];
    // Strip trailing empty parts so we don't store trailing newlines
    while (addressParts.length && !addressParts[addressParts.length - 1]) addressParts.pop();
    const nextProfile = {
      name: document.getElementById("business-name").value.trim(),
      type: document.getElementById("business-type-select").value,
      fiscalYearStart: document.getElementById("fiscal-year").value,
      address: addressParts.join("\n"),
      operatingName: document.getElementById("operating-name").value.trim(),
      businessActivityCode: document.getElementById("business-activity-code").value.trim()
    };

    const saved = await saveBusinessProfileToApi(nextProfile);
    if (!saved) {
      showSettingsToast(t("settings_business_profile_save_error"));
      return;
    }
    saveBusinessProfile(nextProfile);
    settingsOverviewState.businessProfile = nextProfile;
    syncSettingsOverviewSummaries();
    showSettingsToast(t("settings_business_profile_saved"));
  });

  await renderBusinessList();
  document.getElementById("addBusinessBtn")?.addEventListener("click", () => {
    openAddBusinessModal();
  });
}

async function renderBusinessList() {
  const wrap = document.getElementById("businessListWrap");
  if (!wrap) return;

  try {
    const response = await apiFetch("/api/businesses");
    if (!response || !response.ok) {
      wrap.innerHTML = `<p class="settings-helper-note">${escapeHtml(t("settings_businesses_load_error"))}</p>`;
      return;
    }

    const payload = await response.json().catch(() => null);
    const businesses = Array.isArray(payload?.businesses) ? payload.businesses : [];
    const activeId = payload?.active_business_id || "";

    if (!businesses.length) {
      wrap.innerHTML = `<p class="settings-helper-note">${escapeHtml(t("settings_no_businesses"))}</p>`;
      return;
    }

    wrap.innerHTML = businesses.map((biz) => `
      <div class="business-list-item ${biz.id === activeId ? "is-active" : ""}">
        <div class="business-list-meta">
          <span class="business-list-name">${escapeHtml(biz.name || t("common_business"))}</span>
          ${biz.id === activeId ? `<span class="business-list-badge" data-i18n="settings_business_active_badge">${escapeHtml(t("settings_business_active_badge"))}</span>` : ""}
        </div>
        <div class="business-list-actions">
          ${biz.id !== activeId ? `<button type="button" class="settings-secondary-btn business-switch-btn" data-business-switch="${escapeHtml(biz.id)}">${escapeHtml(t("settings_business_switch"))}</button>` : ""}
          <button type="button" class="danger-outline-btn business-delete-btn" data-business-delete="${escapeHtml(biz.id)}" data-business-name="${escapeHtml(biz.name || "")}">${escapeHtml(t("settings_delete_business_btn"))}</button>
        </div>
      </div>
    `).join("");

    wrap.querySelectorAll("[data-business-switch]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const bizId = btn.getAttribute("data-business-switch");
        btn.disabled = true;
        try {
          if (typeof switchActiveBusiness === "function") {
            const switched = await switchActiveBusiness(bizId);
            if (!switched) {
              throw new Error("switch_failed");
            }
            return;
          }
          const res = await apiFetch(`/api/businesses/${bizId}/activate`, { method: "POST" });
          if (!res || !res.ok) throw new Error();
          const payload = await res.json().catch(() => null);
          const refreshed = await refreshSettingsBusinessContext(payload, bizId);
          if (!refreshed) {
            showSettingsToast(t("settings_business_switched"));
            await renderBusinessList();
          }
        } catch {
          showSettingsToast(t("settings_business_switch_error"));
          btn.disabled = false;
        }
      });
    });

    wrap.querySelectorAll("[data-business-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bizId = btn.getAttribute("data-business-delete");
        const bizName = btn.getAttribute("data-business-name") || t("common_business");
        openDeleteBusinessModal(bizId, bizName);
      });
    });
  } catch (err) {
    console.error("Failed to render business list", err);
    wrap.innerHTML = `<p class="settings-helper-note">${escapeHtml(t("settings_businesses_load_error"))}</p>`;
  }
}

async function refreshSettingsBusinessContext(payload, fallbackBusinessId = "") {
  const activeBusiness = payload?.active_business || null;
  if (activeBusiness?.id && typeof applyActivatedBusinessContext === "function") {
    applyActivatedBusinessContext(activeBusiness);
    window.location.reload();
    return true;
  }

  const activeBusinessId = activeBusiness?.id || payload?.active_business_id || fallbackBusinessId || "";
  if (!activeBusinessId) {
    return false;
  }

  if (typeof switchActiveBusiness === "function") {
    const switched = await switchActiveBusiness(activeBusinessId);
    return switched === true;
  }

  return false;
}

function openAddBusinessModal() {
  if (typeof openBusinessCreationModal === "function") {
    openBusinessCreationModal();
    return;
  }
  const name = window.prompt(t("settings_add_business_prompt") || "New business name:");
  if (!name || !name.trim()) return;
  void (async () => {
    try {
      const res = await apiFetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), region: "US", language: "en" })
      });
      if (!res || !res.ok) {
        const err = res ? await res.json().catch(() => null) : null;
        showSettingsToast(err?.error || t("settings_add_business_error"));
        return;
      }
      const payload = await res.json().catch(() => null);
      const createdBusinessId = payload?.business?.id || payload?.id || "";
      const activatedViaCreate = await refreshSettingsBusinessContext(payload, createdBusinessId);
      if (activatedViaCreate) {
        return;
      }

      if (createdBusinessId) {
        const activateRes = await apiFetch(`/api/businesses/${createdBusinessId}/activate`, { method: "POST" });
        if (activateRes?.ok) {
          const activatePayload = await activateRes.json().catch(() => null);
          const refreshed = await refreshSettingsBusinessContext(activatePayload, createdBusinessId);
          if (refreshed) {
            return;
          }
        }
      }

      showSettingsToast(t("settings_business_added"));
      await renderBusinessList();
    } catch {
      showSettingsToast(t("settings_add_business_error"));
    }
  })();
}

let pendingDeleteBusinessId = null;

function openDeleteBusinessModal(bizId, bizName) {
  const modal = document.getElementById("dangerModal");
  const title = document.getElementById("dangerModalTitle");
  const body = document.getElementById("dangerModalBody");
  const confirmWrap = document.getElementById("dangerModalConfirmWrap");
  const passwordWrap = document.getElementById("dangerModalPasswordWrap");
  const passwordInput = document.getElementById("dangerModalPasswordInput");
  const confirmButton = document.getElementById("dangerModalConfirm");
  if (!modal) return;

  pendingDeleteBusinessId = bizId;
  dangerAction = "delete_business";
  title.textContent = t("settings_delete_business_modal_title");
  body.textContent = interpolateTranslatedMessage("settings_delete_business_modal_body", { name: bizName });
  confirmWrap.classList.add("hidden");
  passwordWrap.classList.remove("hidden");
  if (passwordInput) passwordInput.value = "";
  confirmButton.disabled = false;
  modal.classList.remove("hidden");
}

async function initAccountSettings() {
  const statusLabel = document.getElementById("accountSubStatusLabel");
  const cancelRow = document.getElementById("cancelSubscriptionRow");
  const cancelBtn = document.getElementById("cancelSubscriptionBtn");
  const cancelModal = document.getElementById("cancelSubModal");
  const cancelModalCancel = document.getElementById("cancelSubModalCancel");
  const cancelModalConfirm = document.getElementById("cancelSubModalConfirm");
  const cancelModalBody = document.getElementById("cancelSubModalBody");

  const closeCancelModal = () => {
    cancelModal?.classList.add("hidden");
  };

  cancelModalCancel?.addEventListener("click", closeCancelModal);

  cancelBtn?.addEventListener("click", () => {
    cancelModal?.classList.remove("hidden");
  });

  cancelModalConfirm?.addEventListener("click", async () => {
    cancelModalConfirm.disabled = true;
    try {
      const res = await apiFetch("/api/billing/cancel", { method: "POST" });
      const payload = res ? await res.json().catch(() => null) : null;
      if (!res || !res.ok) {
        showSettingsToast(payload?.error || t("settings_cancel_sub_error"));
        cancelModalConfirm.disabled = false;
        return;
      }
      closeCancelModal();
      showSettingsToast(t("settings_cancel_sub_success"));
      await loadAndDisplaySubscription(statusLabel, cancelRow, cancelModalBody);
    } catch (err) {
      console.error("Cancel subscription failed", err);
      showSettingsToast(t("settings_cancel_sub_error"));
      cancelModalConfirm.disabled = false;
    }
  });

  await loadAndDisplaySubscription(statusLabel, cancelRow, cancelModalBody);
}

async function loadAndDisplaySubscription(statusLabel, cancelRow, cancelModalBody) {
  if (!statusLabel) return;
  try {
    const res = await apiFetch("/api/billing/subscription");
    if (!res || !res.ok) {
      statusLabel.textContent = t("settings_sub_status_unknown");
      return;
    }
    const payload = await res.json().catch(() => null);
    const sub = payload?.subscription;
    if (!sub) {
      statusLabel.textContent = t("settings_sub_status_unknown");
      return;
    }

    const tierLabel = sub.effectiveTier === "v1" ? "Pro" : "Basic";
    let statusText = "";
    if (sub.isTrialing && sub.trialEndsAt) {
      const endDate = new Date(sub.trialEndsAt).toLocaleDateString(resolveDisplayLocale(), { month: "short", day: "numeric", year: "numeric" });
      statusText = interpolateTranslatedMessage("settings_sub_status_trial", { date: endDate });
    } else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString(resolveDisplayLocale(), { month: "short", day: "numeric", year: "numeric" });
      statusText = interpolateTranslatedMessage("settings_sub_status_canceling", { date: endDate });
    } else if (sub.isPaid && sub.currentPeriodEnd) {
      const renewDate = new Date(sub.currentPeriodEnd).toLocaleDateString(resolveDisplayLocale(), { month: "short", day: "numeric", year: "numeric" });
      statusText = interpolateTranslatedMessage("settings_sub_status_active", { plan: tierLabel, date: renewDate });
    } else {
      statusText = interpolateTranslatedMessage("settings_sub_status_free", { plan: tierLabel });
    }

    statusLabel.textContent = statusText;
    settingsOverviewState.billingStatus = statusText;
    syncSettingsOverviewSummaries();

    // Show cancel button only for active paid plans that aren't already canceling
    const canCancel = sub.isPaid && !sub.cancelAtPeriodEnd;
    if (cancelRow) {
      cancelRow.hidden = !canCancel;
    }

    // Update cancel modal body with period end date
    if (cancelModalBody && sub.currentPeriodEnd) {
      const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString(resolveDisplayLocale(), { month: "long", day: "numeric", year: "numeric" });
      cancelModalBody.textContent = interpolateTranslatedMessage("settings_cancel_sub_modal_body_date", { date: endDate });
    }
  } catch (err) {
    console.error("Failed to load subscription for account settings", err);
    if (statusLabel) statusLabel.textContent = t("settings_sub_status_unknown");
    settingsOverviewState.billingStatus = t("settings_sub_status_unknown");
    syncSettingsOverviewSummaries();
  }
}

async function initAccountingLockPanel() {
  const form = document.getElementById("accountingLockForm");
  const dateInput = document.getElementById("accountingLockDate");
  const noteInput = document.getElementById("accountingLockNote");
  const statusNode = document.getElementById("accountingLockStatus");
  const clearButton = document.getElementById("clearAccountingLockBtn");
  if (!form || !dateInput || !noteInput || !statusNode || !clearButton) {
    return;
  }

  const renderStatus = (lock) => {
    if (lock?.lockedThroughDate) {
      statusNode.textContent = interpolateTranslatedMessage("settings_accounting_lock_status_locked", {
        date: lock.lockedThroughDate
      });
      return;
    }
    statusNode.textContent = t("settings_accounting_lock_status_unlocked");
  };

  const loadLock = async () => {
    statusNode.textContent = t("settings_accounting_lock_loading");
    try {
      const response = await apiFetch("/api/business/accounting-lock");
      if (!response || !response.ok) {
        throw new Error();
      }

      const payload = await response.json().catch(() => null);
      const lock = payload?.lock || null;
      dateInput.value = lock?.lockedThroughDate || "";
      noteInput.value = lock?.note || "";
      renderStatus(lock);
    } catch (error) {
      console.error("Failed to load accounting lock", error);
      statusNode.textContent = t("settings_accounting_lock_load_error");
    }
  };

  const doSaveLock = async () => {
    const isClearing = !dateInput.value;
    try {
      const response = await apiFetch("/api/business/accounting-lock", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locked_through_date: dateInput.value || null,
          note: isClearing ? "" : noteInput.value.trim()
        })
      });
      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) {
        showSettingsToast(payload?.error || t("settings_accounting_lock_save_error"));
        return;
      }

      if (isClearing) {
        // Only clear the note field after a confirmed successful response so
        // the UI is not wiped if the API call fails.
        noteInput.value = "";
      }
      renderStatus(payload?.lock || null);
      showSettingsToast(isClearing ? t("settings_accounting_lock_cleared") : t("settings_accounting_lock_saved"));
    } catch (error) {
      console.error("Failed to save accounting lock", error);
      showSettingsToast(t("settings_accounting_lock_save_error"));
    }
  };

  const lockConfirmModal = document.getElementById("accountingLockConfirmModal");
  const lockConfirmOk = document.getElementById("accountingLockConfirmOk");
  const lockConfirmCancel = document.getElementById("accountingLockConfirmCancel");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!dateInput.value) { void doSaveLock(); return; }
    lockConfirmModal?.classList.remove("hidden");
  });
  lockConfirmOk?.addEventListener("click", () => {
    lockConfirmModal?.classList.add("hidden");
    void doSaveLock();
  });
  lockConfirmCancel?.addEventListener("click", () => lockConfirmModal?.classList.add("hidden"));

  clearButton.addEventListener("click", async () => {
    try {
      const response = await apiFetch("/api/business/accounting-lock", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locked_through_date: null,
          note: ""
        })
      });
      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) {
        showSettingsToast(payload?.error || t("settings_accounting_lock_save_error"));
        return;
      }

      dateInput.value = "";
      noteInput.value = "";
      renderStatus(payload?.lock || null);
      showSettingsToast(t("settings_accounting_lock_cleared"));
    } catch (error) {
      console.error("Failed to clear accounting lock", error);
      showSettingsToast(t("settings_accounting_lock_save_error"));
    }
  });

  await loadLock();
}

async function loadBusinessProfile() {
  const emptyProfile = {
    name: "",
    type: "sole_proprietor",
    fiscalYearStart: "",
    address: "",
    operatingName: "",
    businessActivityCode: ""
  };

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return emptyProfile;
    }

    const business = await response.json().catch(() => null);
    const profile = {
      name: business?.name || "",
      type: business?.business_type || "sole_proprietor",
      fiscalYearStart: business?.fiscal_year_start || "",
      address: business?.address || "",
      operatingName: business?.operating_name || "",
      businessActivityCode: business?.business_activity_code || ""
    };
    saveBusinessProfile(profile);
    return profile;
  } catch (error) {
    console.error("Failed to load business profile", error);
    return emptyProfile;
  }
}

async function saveBusinessProfileToApi(profile) {
  try {
    const response = await apiFetch("/api/business", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: profile.name,
        fiscal_year_start: profile.fiscalYearStart || null,
        business_type: profile.type || null,
        address: profile.address || null,
        operating_name: profile.operatingName || null,
        business_activity_code: profile.businessActivityCode || null
      })
    });

    return !!(response && response.ok);
  } catch (error) {
    console.error("Failed to save business profile", error);
    return false;
  }
}

function syncBusinessTypeOptions(region) {
  const businessTypeSelect = document.getElementById("business-type-select");
  if (!businessTypeSelect) return;
  const isCA = normalizeSettingsRegion(region) === "ca";
  const isUS = !isCA;
  Array.from(businessTypeSelect.options).forEach((opt) => {
    const showFor = opt.getAttribute("data-region-show");
    if (!showFor) return;
    const shouldShow = (showFor === "us" && isUS) || (showFor === "ca" && isCA);
    opt.hidden = !shouldShow;
    opt.disabled = !shouldShow;
  });
  // If the currently selected option is now hidden, fall back to sole_proprietor
  const selected = businessTypeSelect.options[businessTypeSelect.selectedIndex];
  if (selected && selected.hidden) {
    businessTypeSelect.value = "sole_proprietor";
  }
}

async function initPreferences() {
  const regionSelect = document.getElementById("regionSelectSettings");
  const provinceSelect = document.getElementById("provinceSelectSettings");
  const provinceRow = document.getElementById("settingsProvinceRow");
  const languageSelect = document.getElementById("languageSelectSettings");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const distanceSelect = document.getElementById("distanceSelect");
  const optOutToggle = document.getElementById("optOutToggle");
  const consentStatus = document.getElementById("consentStatus");
  const downloadBtn = document.getElementById("downloadMyDataBtn");
  const replayOnboardingTipsButton = document.getElementById("replayOnboardingTips");
  const analyticsOptInToggle = document.getElementById("analyticsOptInToggle");
  const analyticsOptInRow = document.getElementById("settingsQcAnalyticsRow");
  const qcConsentModal = document.getElementById("qcAnalyticsConsentModal");
  const qcConsentConfirm = document.getElementById("qcConsentConfirm");
  const qcConsentCancel = document.getElementById("qcConsentCancel");
  const saveBar = document.getElementById("settingsSaveBar");
  const saveButton = document.getElementById("settingsSavePreferences");
  const cancelButton = document.getElementById("settingsCancelChanges");

  businessSettingsState = await loadBusinessSettings();

  const buildPreferenceState = () => {
    const region = normalizeSettingsRegion(
      businessSettingsState.region || (typeof getCurrentRegion === "function" ? getCurrentRegion() : "us")
    );
    const province = normalizeProvinceCode(businessSettingsState.province || "");
    const isQC = region === "ca" && province === "QC";
    // Quebec Law 25: privacy opt-out defaults to ON for QC users if not previously explicitly set
    const storedOptOut = privacySettings.dataSharingOptOut;
    const optOutDefault = isQC && storedOptOut == null ? true : !!storedOptOut;
    return {
      region,
      province,
      language: typeof getCurrentLanguage === "function" ? getCurrentLanguage() : businessSettingsState.language || "en",
      theme: resolveSavedTheme(),
      distance: localStorage.getItem("lb_unit_metric") === "true" ? "km" : "mi",
      optOutAnalytics: optOutDefault
    };
  };

  const syncProvinceVisibility = (region) => {
    if (!provinceRow) return;
    const isCanada = normalizeSettingsRegion(region) === "ca";
    provinceRow.classList.toggle("hidden", !isCanada);
    if (provinceSelect) {
      provinceSelect.disabled = !isCanada;
    }
  };

  const syncRegionHardening = (region, province) => {
    if (typeof applyRegionHardening === "function") {
      applyRegionHardening(region, province || "");
    }
    syncBusinessTypeOptions(region);
  };

  const syncPreferenceControls = (state) => {
    if (regionSelect) regionSelect.value = state.region;
    if (provinceSelect) provinceSelect.value = state.province || "";
    if (languageSelect) {
      if (typeof populateLanguageOptions === "function") {
        populateLanguageOptions(languageSelect);
      }
      languageSelect.value = state.language;
    }
    if (darkModeToggle) darkModeToggle.checked = state.theme === "dark";
    if (distanceSelect) distanceSelect.value = state.distance;
    if (optOutToggle) optOutToggle.checked = !!state.optOutAnalytics;
    syncProvinceVisibility(state.region);
    updateProvinceRateNote(state.region, state.province);
    syncRegionHardening(state.region, state.province);
    syncSettingsOverviewSummaries();
  };

  const hasPendingPreferenceChanges = () => {
    if (!preferenceBaseline || !pendingPreferences) {
      return false;
    }
    return Object.keys(preferenceBaseline).some(
      (key) => preferenceBaseline[key] !== pendingPreferences[key]
    );
  };

  const updateSaveBar = () => {
    if (!saveBar) return;
    saveBar.classList.toggle("hidden", !hasPendingPreferenceChanges());
  };

  const updatePendingPreferences = () => {
    if (!pendingPreferences) return;
    const nextRegion = regionSelect ? normalizeSettingsRegion(regionSelect.value) : pendingPreferences.region;
    const nextProvince = nextRegion === "ca"
      ? normalizeProvinceCode(provinceSelect?.value || pendingPreferences.province)
      : "";
    pendingPreferences = {
      region: nextRegion,
      province: nextProvince,
      language: languageSelect ? languageSelect.value : pendingPreferences.language,
      theme: darkModeToggle?.checked ? "dark" : "light",
      distance: distanceSelect ? distanceSelect.value : pendingPreferences.distance,
      optOutAnalytics: !!optOutToggle?.checked
    };
    syncProvinceVisibility(pendingPreferences.region);
    updateProvinceRateNote(pendingPreferences.region, pendingPreferences.province);
    syncRegionHardening(pendingPreferences.region, pendingPreferences.province);
    syncSettingsOverviewSummaries();
    updateSaveBar();
  };

  if (regionSelect) {
    regionSelect.addEventListener("change", updatePendingPreferences);
  }

  if (provinceSelect) {
    provinceSelect.addEventListener("change", updatePendingPreferences);
  }

  if (languageSelect) {
    languageSelect.addEventListener("change", updatePendingPreferences);
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => {
      const theme = darkModeToggle.checked ? "dark" : "light";
      if (typeof setGlobalTheme === "function") {
        setGlobalTheme(theme);
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
      updatePendingPreferences();
    });
  }

  if (distanceSelect) {
    distanceSelect.addEventListener("change", updatePendingPreferences);
  }

  privacySettings = await getPrivacySettingsSafe();
  syncSettingsOverviewSummaries();
  if (optOutToggle) {
    optOutToggle.addEventListener("change", updatePendingPreferences);
  }

  // Quebec Analytics Opt-In: show the toggle only for QC residents (Law 25).
  // Detection uses dataResidency from the user profile, not business province,
  // to correctly handle traveling gig workers.
  const isQcResident = privacySettings.dataResidency === "CA-QC";
  if (analyticsOptInRow) {
    analyticsOptInRow.classList.toggle("hidden", !isQcResident);
  }
  if (analyticsOptInToggle) {
    analyticsOptInToggle.checked = !!privacySettings.analyticsOptIn;

    analyticsOptInToggle.addEventListener("change", () => {
      if (analyticsOptInToggle.checked) {
        // Enabling analytics tracking requires explicit consent for QC users.
        // Revert optimistic toggle until confirmed.
        analyticsOptInToggle.checked = false;
        if (qcConsentModal) {
          qcConsentModal.classList.remove("hidden");
        }
      } else {
        // Disabling tracking: no consent prompt needed; save immediately.
        saveQcAnalyticsOptIn(false);
      }
    });
  }

  if (qcConsentConfirm) {
    qcConsentConfirm.addEventListener("click", async () => {
      if (qcConsentModal) qcConsentModal.classList.add("hidden");
      if (analyticsOptInToggle) analyticsOptInToggle.checked = true;
      await saveQcAnalyticsOptIn(true);
    });
  }

  if (qcConsentCancel) {
    qcConsentCancel.addEventListener("click", () => {
      if (qcConsentModal) qcConsentModal.classList.add("hidden");
      if (analyticsOptInToggle) analyticsOptInToggle.checked = false;
    });
  }

  // Close consent modal on backdrop click
  if (qcConsentModal) {
    qcConsentModal.addEventListener("click", (e) => {
      if (e.target === qcConsentModal) {
        qcConsentModal.classList.add("hidden");
        if (analyticsOptInToggle) analyticsOptInToggle.checked = false;
      }
    });
  }

  preferenceBaseline = buildPreferenceState();
  pendingPreferences = { ...preferenceBaseline };
  syncPreferenceControls(preferenceBaseline);
  updateSaveBar();

  if (consentStatus) {
    consentStatus.textContent = privacySettings.consentGiven ? t("status_yes") : t("status_no");
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      try {
        if (typeof privacyService === "object" && typeof privacyService.exportMyData === "function") {
          await privacyService.exportMyData();
        }
        showSettingsToast(t("settings_data_export_started"));
      } catch (error) {
        console.error("Failed to export personal data", error);
        showSettingsToast(error?.message || t("settings_data_export_error"));
      }
    });
  }

  const replayTips = async () => {
    try {
      const response = await apiFetch("/api/me/onboarding/replay", {
        method: "POST"
      });
      const result = response ? await response.json().catch(() => null) : null;

      if (!response || !response.ok) {
        throw new Error("Unable to reset onboarding tips");
      }

      showSettingsToast(t("settings_tips_reset"));
      if (result?.redirect_to) {
        window.setTimeout(() => {
          window.location.href = result.redirect_to;
        }, 350);
      }
    } catch (error) {
      console.error("Failed to reset onboarding tips", error);
      showSettingsToast(t("settings_tips_reset_error"));
    }
  };

  replayOnboardingTipsButton?.addEventListener("click", replayTips);

  cancelButton?.addEventListener("click", () => {
    pendingPreferences = { ...preferenceBaseline };
    syncPreferenceControls(preferenceBaseline);
    updateSaveBar();
  });

  saveButton?.addEventListener("click", async () => {
    if (!pendingPreferences || !hasPendingPreferenceChanges()) {
      updateSaveBar();
      return;
    }

    const nextPreferences = { ...pendingPreferences };
    if (nextPreferences.region === "ca" && !nextPreferences.province) {
      showSettingsToast(t("settings_province_required"));
      provinceSelect?.focus();
      return;
    }

    const businessSettingsChanged =
      !preferenceBaseline ||
      preferenceBaseline.region !== nextPreferences.region ||
      preferenceBaseline.language !== nextPreferences.language ||
      preferenceBaseline.province !== nextPreferences.province;
    const taxSettingsChanged =
      !preferenceBaseline ||
      preferenceBaseline.region !== nextPreferences.region ||
      preferenceBaseline.province !== nextPreferences.province;

    if (businessSettingsChanged) {
      const businessSaveResult = await saveBusinessSettings({
        region: nextPreferences.region.toUpperCase(),
        language: nextPreferences.language,
        province: nextPreferences.region === "ca" ? nextPreferences.province : null
      });
      if (!businessSaveResult.ok) {
        showSettingsToast(businessSaveResult.error || t("settings_region_save_error"));
        return;
      }

      businessSettingsState = businessSaveResult.settings || normalizeBusinessSettings({
        region: nextPreferences.region.toUpperCase(),
        language: nextPreferences.language,
        province: nextPreferences.region === "ca" ? nextPreferences.province : ""
      });
    }

    if (typeof setCurrentRegion === "function") {
      applyCurrentRegionRuntime(nextPreferences.region, nextPreferences.province || "");
    } else {
      window.LUNA_REGION = nextPreferences.region;
      if (nextPreferences.province) {
        window.LUNA_PROVINCE = nextPreferences.province;
        localStorage.setItem("lb_province", nextPreferences.province);
      }
      if (typeof window !== "undefined" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("lunaRegionChanged", { detail: nextPreferences.region }));
      }
    }

    if (typeof setCurrentLanguage === "function") {
      setCurrentLanguage(nextPreferences.language);
    } else if (typeof applyTranslations === "function") {
      localStorage.setItem("lb_language", nextPreferences.language);
      window.LUNA_LANGUAGE = nextPreferences.language;
      applyTranslations(nextPreferences.language);
    }

    if (typeof setGlobalTheme === "function") {
      setGlobalTheme(nextPreferences.theme);
    } else {
      localStorage.setItem("lb_theme", nextPreferences.theme);
      localStorage.setItem("lb_theme_version", SETTINGS_THEME_VERSION);
      document.documentElement.setAttribute("data-theme", nextPreferences.theme);
    }

    localStorage.setItem("lb_unit_metric", String(nextPreferences.distance === "km"));
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("lunaDistanceUnitChanged", { detail: nextPreferences.distance })
      );
    }

    await setPrivacySettingsSafe({ dataSharingOptOut: nextPreferences.optOutAnalytics });

    preferenceBaseline = { ...nextPreferences };
    pendingPreferences = { ...nextPreferences };
    syncPreferenceControls(preferenceBaseline);
    refreshSettingsLocalizedState();
    updateSaveBar();
    showSettingsToast(
      taxSettingsChanged
        ? resolveEffectiveTaxProfile(nextPreferences.region, nextPreferences.province).label
        : t("settings_changes_saved")
    );
  });
}

async function initCpaAccess() {
  if (!isCpaUiEnabled()) {
    hideCpaSettingsUi();
    return;
  }
  const form = document.getElementById("cpaAccessForm");
  const emailInput = document.getElementById("cpaAccessEmail");
  const scopeSelect = document.getElementById("cpaAccessScope");
  const businessSelect = document.getElementById("cpaAccessBusiness");
  const businessWrap = document.getElementById("cpaBusinessSelectWrap");
  const messageNode = document.getElementById("cpaAccessMessage");
  const currentListNode = document.getElementById("cpaCurrentAccessList");
  const historyListNode = document.getElementById("cpaAccessHistoryList");
  const auditNode = document.getElementById("cpaAuditActivityList");
  const submitBtn = form?.querySelector("button[type='submit']") || form?.querySelector("button");

  if (!form || !emailInput || !scopeSelect || !businessSelect || !businessWrap || !currentListNode || !historyListNode) {
    return;
  }

  const syncBusinessVisibility = () => {
    const scopedToAll = scopeSelect.value === "all";
    businessWrap.hidden = scopedToAll;
    businessSelect.disabled = scopedToAll;
  };

  const setMessage = (message = "", tone = "") => {
    messageNode.textContent = message;
    messageNode.classList.remove("is-error", "is-success");
    if (tone) {
      messageNode.classList.add(tone);
    }
  };

  const loadBusinessOptions = async () => {
    try {
      const response = await apiFetch("/api/businesses");
      if (!response || !response.ok) {
        throw new Error(t("settings_cpa_load_businesses_error"));
      }

      const payload = await response.json().catch(() => null);
      const businesses = Array.isArray(payload?.businesses) ? payload.businesses : [];
      const activeBusinessId = payload?.active_business_id || "";

      businessSelect.innerHTML = "";
      businesses.forEach((business) => {
        const option = document.createElement("option");
        option.value = business.id;
        option.textContent = business.name || t("common_business");
        if (business.id === activeBusinessId) {
          option.selected = true;
        }
        businessSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Failed to load CPA business options", error);
      setMessage(t("settings_cpa_load_businesses_error"), "is-error");
    }
  };

  const renderOwnedGrants = async () => {
    try {
      const response = await apiFetch("/api/cpa-access/grants/owned");
      if (!response || !response.ok) {
        throw new Error(t("settings_cpa_grants_load_error"));
      }

      const payload = await response.json().catch(() => null);
      const grants = Array.isArray(payload?.grants) ? payload.grants : [];

      const activeGrants = grants.filter((grant) => grant.status === "active");
      const historyGrants = grants.filter((grant) => grant.status !== "active");
      settingsOverviewState.cpaActiveCount = activeGrants.length;
      settingsOverviewState.cpaHistoryCount = historyGrants.length;
      syncSettingsOverviewSummaries();

      const renderGrantCard = (grant, mode) => {
        const detailParts = [interpolateTranslatedMessage("settings_cpa_detail_created", { date: formatSettingsDate(grant.created_at) })];
        if (grant.accepted_at) detailParts.push(interpolateTranslatedMessage("settings_cpa_detail_accepted", { date: formatSettingsDate(grant.accepted_at) }));
        if (grant.revoked_at) detailParts.push(interpolateTranslatedMessage("settings_cpa_detail_revoked", { date: formatSettingsDate(grant.revoked_at) }));
        if (grant.revoked_visible_until) detailParts.push(interpolateTranslatedMessage("settings_cpa_detail_visible_until", { date: formatSettingsDate(grant.revoked_visible_until) }));

        const statusLabel =
          grant.status === "active"
            ? t("settings_cpa_status_current", "current")
            : grant.status === "pending"
              ? t("settings_cpa_status_pending", "pending")
              : t("settings_cpa_status_revoked", "revoked");
        const buttonMarkup =
          grant.status === "active"
            ? `<button type="button" class="cpa-access-revoke" data-cpa-revoke="${escapeHtml(grant.id || "")}">${escapeHtml(t("settings_cpa_revoke"))}</button>`
            : grant.status === "pending"
              ? `<button type="button" class="cpa-access-revoke" data-cpa-revoke="${escapeHtml(grant.id || "")}">${escapeHtml(t("settings_cpa_revoke"))}</button>`
              : `<button type="button" class="cpa-access-delete" data-cpa-delete="${escapeHtml(grant.id || "")}">${escapeHtml(t("common_delete"))}</button>`;

        return `
          <div class="cpa-access-item ${mode}">
            <div class="cpa-access-meta">
              <div class="cpa-access-email">${escapeHtml(grant.grantee_email || "")}</div>
              <div class="cpa-access-tags">
                <span class="cpa-access-tag scope">${grant.scope === "all" ? escapeHtml(t("settings_cpa_scope_all")) : escapeHtml(t("settings_cpa_scope_business"))}</span>
                <span class="cpa-access-tag business">${escapeHtml(grant.business_name || t("settings_cpa_portfolio_wide"))}</span>
                <span class="cpa-access-tag ${escapeHtml(grant.status || "pending")}">${escapeHtml(statusLabel)}</span>
              </div>
              <div class="cpa-access-detail">${escapeHtml(detailParts.join(" | "))}</div>
            </div>
            <div class="cpa-access-actions">
              ${buttonMarkup}
            </div>
          </div>
        `;
      };

      const currentNode = document.getElementById("cpaCurrentAccessList");
      const historyNode = document.getElementById("cpaAccessHistoryList");

      if (currentNode) {
        currentNode.innerHTML = activeGrants.length
          ? activeGrants.map((grant) => renderGrantCard(grant, "current")).join("")
          : `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_current_empty", "No one currently has access."))}</div>`;
      }

      if (historyNode) {
        historyNode.innerHTML = historyGrants.length
          ? historyGrants.map((grant) => renderGrantCard(grant, "history")).join("")
          : `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_history_empty", "No recent invitations or revoked access."))}</div>`;
      }

      const revokeTargets = [...document.querySelectorAll("[data-cpa-revoke]")];
      revokeTargets.forEach((button) => {
        button.addEventListener("click", async () => {
          const grantId = button.getAttribute("data-cpa-revoke");
          if (!grantId) {
            return;
          }

          const revokeResponse = await apiFetch(`/api/cpa-access/grants/${grantId}`, {
            method: "DELETE"
          });

          if (!revokeResponse || !revokeResponse.ok) {
            const errorPayload = await revokeResponse?.json().catch(() => null);
            setMessage(errorPayload?.error || t("settings_cpa_revoke_error"), "is-error");
            return;
          }

          setMessage(t("settings_cpa_revoked"), "is-success");
          showSettingsToast(t("settings_cpa_revoked"));
          await renderOwnedGrants();
          await renderAuditActivity();
        });
      });

      const deleteTargets = [...document.querySelectorAll("[data-cpa-delete]")];
      deleteTargets.forEach((button) => {
        button.addEventListener("click", async () => {
          const grantId = button.getAttribute("data-cpa-delete");
          if (!grantId) {
            return;
          }

          const deleteResponse = await apiFetch(`/api/cpa-access/grants/${grantId}/permanent`, {
            method: "DELETE"
          });

          if (!deleteResponse || !deleteResponse.ok) {
            const errorPayload = await deleteResponse?.json().catch(() => null);
            setMessage(errorPayload?.error || t("settings_cpa_delete_error"), "is-error");
            return;
          }

          setMessage(t("settings_cpa_deleted"), "is-success");
          showSettingsToast(t("settings_cpa_deleted"));
          await renderOwnedGrants();
          await renderAuditActivity();
        });
      });
    } catch (error) {
      console.error("Failed to load CPA grants", error);
      settingsOverviewState.cpaActiveCount = 0;
      settingsOverviewState.cpaHistoryCount = 0;
      syncSettingsOverviewSummaries();
      currentListNode.innerHTML = `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_grants_load_error"))}</div>`;
      historyListNode.innerHTML = `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_grants_load_error"))}</div>`;
    }
  };

  const renderAuditActivity = async () => {
    if (!auditNode) {
      return;
    }

    try {
      const response = await apiFetch("/api/cpa-access/audit?limit=12");
      if (!response || !response.ok) {
        throw new Error(t("settings_cpa_audit_load_error"));
      }

      const payload = await response.json().catch(() => null);
      const logs = Array.isArray(payload?.logs) ? payload.logs : [];

      if (!logs.length) {
        auditNode.innerHTML = `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_audit_empty"))}</div>`;
        return;
      }

      auditNode.innerHTML = logs.map((entry) => `
        <div class="cpa-access-item">
          <div class="cpa-access-meta">
              <div class="cpa-access-email">${escapeHtml(formatSettingsAuditAction(entry.action))}</div>
              <div class="cpa-access-tags">
                <span class="cpa-access-tag business">${escapeHtml(entry.business_name || t("settings_cpa_portfolio_wide"))}</span>
              </div>
            <div class="cpa-access-detail">${escapeHtml(formatSettingsDateTime(entry.created_at))}${entry.actor_email ? ` | ${escapeHtml(entry.actor_email)}` : ""}</div>
          </div>
        </div>
      `).join("");
    } catch (error) {
      console.error("Failed to load CPA audit activity", error);
      auditNode.innerHTML = `<div class="cpa-access-empty">${escapeHtml(t("settings_cpa_audit_load_error"))}</div>`;
    }
  };

  scopeSelect.addEventListener("change", () => {
    syncBusinessVisibility();
    setMessage("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      email: emailInput.value.trim(),
      scope: scopeSelect.value === "all" ? "all" : "business",
      business_id: scopeSelect.value === "all" ? null : businessSelect.value || null
    };

    try {
      const response = await apiFetch("/api/cpa-access/grants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response || !response.ok) {
        const body = response ? await response.json().catch(() => null) : null;
        setMessage(body?.error || t("settings_cpa_create_error"), "is-error");
        return;
      }

      emailInput.value = "";
      scopeSelect.value = "business";
      syncBusinessVisibility();
      setMessage(t("settings_cpa_created"), "is-success");
      showSettingsToast(t("settings_cpa_created"));
      await renderOwnedGrants();
      await renderAuditActivity();
    } catch (error) {
      console.error("CPA invite failed", error);
      setMessage(t("settings_cpa_create_error"), "is-error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  await loadBusinessOptions();
  syncBusinessVisibility();
  await renderOwnedGrants();
  await renderAuditActivity();
}

function formatSettingsDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(resolveDisplayLocale(), { month: "short", day: "numeric", year: "numeric" });
}

function formatSettingsDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString(resolveDisplayLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatSettingsAuditAction(action) {
  const labels = {
    grant_auto_accepted: "Grant auto-accepted",
    grant_created_active: "Grant created",
    grant_created_pending: "Invite created",
    grant_revoked: "Grant revoked",
    grant_deleted: "Revoked grant deleted",
    portfolio_summary_viewed: "CPA reviewed summary",
    portfolio_transactions_viewed: "CPA reviewed transactions",
    portfolio_receipts_viewed: "CPA reviewed receipts",
    portfolio_receipt_downloaded: "CPA downloaded receipt",
    portfolio_mileage_viewed: "CPA reviewed mileage",
    portfolio_exports_viewed: "CPA reviewed exports",
    portfolio_export_downloaded: "CPA downloaded redacted export",
    portfolio_audit_viewed: "CPA reviewed audit feed"
  };
  return labels[action] || String(action || "activity").replace(/_/g, " ");
}

function refreshSettingsLocalizedState() {
  const consentStatus = document.getElementById("consentStatus");
  const languageSelect = document.getElementById("languageSelectSettings");
  const regionSelect = document.getElementById("regionSelectSettings");
  const provinceSelect = document.getElementById("provinceSelectSettings");
  const provinceRow = document.getElementById("settingsProvinceRow");
  if (consentStatus) {
    consentStatus.textContent = privacySettings.consentGiven ? t("status_yes") : t("status_no");
  }
  if (languageSelect && typeof populateLanguageOptions === "function") {
    populateLanguageOptions(languageSelect);
    languageSelect.value = pendingPreferences?.language || preferenceBaseline?.language || getCurrentLanguage();
  }
  if (regionSelect) {
    regionSelect.value = pendingPreferences?.region || preferenceBaseline?.region || normalizeSettingsRegion(businessSettingsState.region);
  }
  if (provinceSelect) {
    provinceSelect.value = pendingPreferences?.province || preferenceBaseline?.province || normalizeProvinceCode(businessSettingsState.province);
  }
  if (provinceRow) {
    const isCanada =
      (pendingPreferences?.region || preferenceBaseline?.region || normalizeSettingsRegion(businessSettingsState.region)) === "ca";
    provinceRow.classList.toggle("hidden", !isCanada);
  }
  if (provinceSelect) {
    const isCanada =
      (pendingPreferences?.region || preferenceBaseline?.region || normalizeSettingsRegion(businessSettingsState.region)) === "ca";
    provinceSelect.disabled = !isCanada;
  }
  updateProvinceRateNote(
    pendingPreferences?.region || preferenceBaseline?.region || normalizeSettingsRegion(businessSettingsState.region),
    pendingPreferences?.province || preferenceBaseline?.province || normalizeProvinceCode(businessSettingsState.province)
  );
  // Re-apply region hardening to reflect the current state
  const currentRegion = pendingPreferences?.region || preferenceBaseline?.region || normalizeSettingsRegion(businessSettingsState.region);
  const currentProvince = pendingPreferences?.province || preferenceBaseline?.province || normalizeProvinceCode(businessSettingsState.province);
  if (typeof applyRegionHardening === "function") {
    applyRegionHardening(currentRegion, currentProvince);
  }
  syncBusinessTypeOptions(currentRegion);
  syncSettingsOverviewSummaries();
}

function normalizeSettingsRegion(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "ca" || normalized === "canada") {
    return "ca";
  }
  if (normalized === "us" || normalized === "usa" || normalized === "united states" || normalized === "united states of america") {
    return "us";
  }
  return "us";
}

function normalizeProvinceCode(value) {
  const code = String(value || "").toUpperCase();
  return CA_PROVINCES.includes(code) ? code : "";
}

function resolveEffectiveTaxProfile(region, province) {
  const normalizedRegion = normalizeSettingsRegion(region);
  const normalizedProvince = normalizeProvinceCode(province);
  const taxProfile = resolveEstimatedTaxProfileHelper(normalizedRegion, normalizedProvince);

  if (normalizedRegion === "ca") {
    if (!normalizedProvince) {
      return {
        ...taxProfile,
        label: interpolateTranslatedMessage("settings_tax_rate_note_ca_default", {
          rate: formatEstimatedTaxPercentHelper(taxProfile.rate)
        })
      };
    }

    return {
      ...taxProfile,
      label: interpolateTranslatedMessage("settings_tax_rate_note_ca_selected", {
        rate: formatEstimatedTaxPercentHelper(taxProfile.rate, normalizedProvince),
        province: CA_PROVINCE_NAMES[normalizedProvince] || normalizedProvince
      })
    };
  }

  return {
    ...taxProfile,
    label: interpolateTranslatedMessage("settings_tax_rate_note_us", {
      rate: formatEstimatedTaxPercentHelper(taxProfile.rate)
    })
  };
}

function updateProvinceRateNote(region, province) {
  const note = document.getElementById("settingsProvinceRateNote");
  if (!note) return;
  note.textContent = resolveEffectiveTaxProfile(region, province).label;
}

function applyCurrentRegionRuntime(region, province) {
  const normalized = normalizeSettingsRegion(region);
  window.LUNA_REGION = normalized;
  localStorage.setItem("lb_region", normalized);
  if (province !== undefined) {
    const normalizedProvince = normalizeProvinceCode(province);
    window.LUNA_PROVINCE = normalizedProvince;
    localStorage.setItem("lb_province", normalizedProvince);
  }
  if (typeof applyTranslations === "function") {
    applyTranslations(typeof getCurrentLanguage === "function" ? getCurrentLanguage() : undefined);
  }
  if (typeof applyRegionHardening === "function") {
    applyRegionHardening(normalized, province !== undefined ? normalizeProvinceCode(province) : undefined);
  }
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("lunaRegionChanged", { detail: normalized }));
  }
  return normalized;
}

function normalizeSettingsLanguage(value) {
  const language = String(value || "").toLowerCase();
  return ["en", "es", "fr"].includes(language) ? language : "en";
}

function interpolateTranslatedMessage(key, values) {
  const language = typeof getCurrentLanguage === "function"
    ? normalizeSettingsLanguage(getCurrentLanguage())
    : normalizeSettingsLanguage(businessSettingsState.language);
  const template = t(key);
  if (language === "fr") {
    return String(template).replace(/\{(\w+)\}/g, (_, token) => {
      const value = values?.[token];
      return token === "rate" ? String(value || "").replace(".", ",") : (value ?? "");
    });
  }
  return String(template).replace(/\{(\w+)\}/g, (_, token) => values?.[token] ?? "");
}

function normalizeBusinessSettings(business) {
  return {
    region: String(business?.region || "US").toUpperCase() === "CA" ? "CA" : "US",
    language: normalizeSettingsLanguage(
      business?.language || (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en")
    ),
    province: normalizeProvinceCode(business?.province || "")
  };
}

function getDefaultBusinessSettings() {
  return normalizeBusinessSettings({
    region: window.LUNA_REGION || "US",
    language: typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en",
    province: ""
  });
}

async function loadBusinessSettings() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return getDefaultBusinessSettings();
    }

    const business = await response.json();
    return normalizeBusinessSettings(business);
  } catch (error) {
    console.error("Failed to load business settings", error);
    return getDefaultBusinessSettings();
  }
}

async function saveBusinessSettings({ region, language, province }) {
  try {
    const response = await apiFetch("/api/business", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        region,
        language,
        province
      })
    });
    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      console.error("Business settings API rejected save", errorPayload || response?.status);
      return {
        ok: false,
        error: errorPayload?.error || t("settings_region_save_error")
      };
    }

    const business = await response.json().catch(() => null);
    return {
      ok: true,
      settings: normalizeBusinessSettings(business || { region, language, province })
    };
  } catch (error) {
    console.error("Failed to save business settings", error);
    return {
      ok: false,
      error: error?.message || t("settings_region_save_error")
    };
  }
}

async function getPrivacySettingsSafe() {
  if (typeof privacyService === "object" && typeof privacyService.getPrivacySettings === "function") {
    try {
      const result = await privacyService.getPrivacySettings();
      return result || privacySettings;
    } catch (error) {
      console.error("Failed to load privacy settings", error);
    }
  }
  return privacySettings;
}

/**
 * Save the Quebec-specific analytics opt-in preference.
 * Sends analyticsOptIn alongside the current dataSharingOptOut so the backend
 * can log consent for Law 25 compliance.
 */
async function saveQcAnalyticsOptIn(optIn) {
  try {
    const payload = {
      dataSharingOptOut: !!privacySettings.dataSharingOptOut,
      consentGiven: true,
      analyticsOptIn: optIn
    };
    const response = await apiFetch("/api/privacy/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response || !response.ok) {
      throw new Error("Save failed");
    }
    privacySettings = { ...privacySettings, analyticsOptIn: optIn };
    syncSettingsOverviewSummaries();
    showSettingsToast(optIn ? t("qc_analytics_enabled") : t("qc_analytics_disabled"));
  } catch (error) {
    console.error("Failed to save analytics opt-in", error);
    showSettingsToast(t("settings_region_save_error"));
  }
}

async function setPrivacySettingsSafe(nextSettings) {
  privacySettings = { ...privacySettings, ...nextSettings };
  if (typeof privacyService === "object" && typeof privacyService.setPrivacySettings === "function") {
    try {
      await privacyService.setPrivacySettings(nextSettings);
    } catch (error) {
      console.error("Failed to save privacy settings", error);
    }
  }
}

function initSecurityForm() {
  const form = document.getElementById("securityForm");
  if (!form) return;

  const currentInput = document.getElementById("security-current-password");
  const newInput = document.getElementById("security-new-password");
  const confirmInput = document.getElementById("security-confirm-password");
  const showToggle = document.getElementById("securityShowPasswordToggle");
  const strengthMeter = document.getElementById("securityPasswordMeter");
  const strengthText = document.getElementById("securityPasswordStrengthText");
  const matchMessage = document.getElementById("securityPasswordMatchMessage");
  const requirementItems = document.querySelectorAll(".password-requirements li");
  const submitButton = document.getElementById("securitySaveButton");
  const mfaEnabledToggle = document.getElementById("mfaEnabledToggle");
  const mfaSetupPanel = document.getElementById("mfaSetupPanel");
  const mfaCodeField = document.getElementById("mfaCodeField");
  const mfaSetupCode = document.getElementById("mfaSetupCode");
  const mfaHelperNote = document.getElementById("mfaHelperNote");
  const mfaPrimaryButton = document.getElementById("mfaPrimaryButton");
  const mfaCancelButton = document.getElementById("mfaCancelButton");
  const mfaMessage = document.getElementById("mfaMessage");
  const recoveryEmailInput = document.getElementById("recovery-email");
  const recoveryEmailPassword = document.getElementById("recovery-email-password");
  const recoveryEmailSaveButton = document.getElementById("recoveryEmailSaveButton");
  const recoveryEmailStatus = document.getElementById("recoveryEmailStatus");
  const recoveryEmailMessage = document.getElementById("recoveryEmailMessage");
  const revokeAllSessionsButton = document.getElementById("settingsRevokeAllSessionsBtn");
  const recoveryEmailVerified = new URLSearchParams(window.location.search).get("recovery_email_verified") === "true";

  let mfaStatus = {
    enabled: false,
    delivery: "email",
    recovery_email_masked: "",
    recovery_email_verified: false
  };
  let mfaMode = "idle";
  let mfaPendingToken = "";

  const updateStrength = () => {
    const password = newInput.value;
    const score = getPasswordScore(password);
    const tone =
      score >= 3
        ? "is-strong"
        : score >= 2
        ? "is-fair"
        : "is-weak";
    strengthMeter.classList.remove("score-0", "score-1", "score-2", "score-3", "is-weak", "is-fair", "is-strong");
    strengthMeter.classList.add(`score-${Math.max(0, Math.min(3, score))}`, tone);
    const labelKey =
      score >= 3
        ? "settings_password_strong"
        : score >= 2
        ? "settings_password_fair"
        : "settings_password_weak";
    strengthText.textContent = t(labelKey);
    strengthText.classList.remove("is-weak", "is-fair", "is-strong");
    strengthText.classList.add(tone);
  };

  const updateRequirements = () => {
    requirementItems.forEach((item) => {
      const key = item.dataset.requirement;
      const rule = SETTINGS_PASSWORD_RULES[key];
      item.classList.toggle("is-met", rule ? rule(newInput.value) : false);
    });
  };

  const updateMatch = () => {
    matchMessage.classList.remove("is-error", "is-success");
    if (!newInput.value || !confirmInput.value) {
      matchMessage.textContent = "";
      return;
    }
    if (newInput.value !== confirmInput.value) {
      matchMessage.textContent = t("register_password_match_error");
      matchMessage.classList.add("is-error");
    } else {
      matchMessage.textContent = t("register_password_match_success");
      matchMessage.classList.add("is-success");
    }
  };

  const updateSubmitState = () => {
    const matches = newInput.value && confirmInput.value && newInput.value === confirmInput.value;
    const meetsRules = Object.values(SETTINGS_PASSWORD_RULES).every((rule) => rule(newInput.value));
    submitButton.disabled = !(matches && meetsRules && currentInput.value.trim());
  };

  const setMfaMessage = (message = "", tone = "") => {
    if (!mfaMessage) {
      return;
    }
    mfaMessage.textContent = message;
    mfaMessage.classList.remove("is-error", "is-success");
    if (tone) {
      mfaMessage.classList.add(tone);
    }
  };

  const setRecoveryMessage = (message = "", tone = "") => {
    if (!recoveryEmailMessage) {
      return;
    }
    recoveryEmailMessage.textContent = message;
    recoveryEmailMessage.classList.remove("is-error", "is-success");
    if (tone) {
      recoveryEmailMessage.classList.add(tone);
    }
  };

  const maskRecoveryEmailForDisplay = (email) => {
    const value = String(email || "").trim().toLowerCase();
    const atIndex = value.indexOf("@");
    if (atIndex <= 0) {
      return "";
    }
    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    const maskedLocal = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}`;
    const domainParts = domain.split(".");
    const domainName = domainParts.shift() || "";
    const maskedDomain = domainName.length <= 2 ? `${domainName[0] || "*"}*` : `${domainName.slice(0, 2)}${"*".repeat(Math.max(domainName.length - 2, 2))}`;
    return `${maskedLocal}@${[maskedDomain, ...domainParts].join(".")}`;
  };

  const updateRecoveryUi = () => {
    if (!recoveryEmailStatus) {
      return;
    }
    if (mfaStatus.recovery_email_verified && mfaStatus.recovery_email_masked) {
      recoveryEmailStatus.textContent = `Verified recovery email: ${mfaStatus.recovery_email_masked}`;
      return;
    }
    if (mfaStatus.recovery_email_masked) {
      recoveryEmailStatus.textContent = `Pending confirmation: ${mfaStatus.recovery_email_masked}. Check that inbox to finish setup.`;
      return;
    }
    recoveryEmailStatus.textContent = "No recovery email verified yet.";
  };

  const resetSetupPanel = () => {
    mfaSetupPanel?.classList.add("hidden");
    if (mfaSetupCode) mfaSetupCode.value = "";
    mfaCodeField?.classList.add("hidden");
    mfaCancelButton?.classList.add("hidden");
    mfaPendingToken = "";
  };

  const updateMfaUi = () => {
    settingsOverviewState.mfaEnabled = !!mfaStatus.enabled;
    syncSettingsOverviewSummaries();
    if (mfaEnabledToggle) {
      mfaEnabledToggle.checked = !!mfaStatus.enabled;
    }

    if (mfaPrimaryButton) {
      if (mfaMode === "enable_verify") {
        mfaPrimaryButton.textContent = t("settings_mfa_verify_enable");
      } else if (mfaMode === "disable_verify") {
        mfaPrimaryButton.textContent = t("settings_mfa_verify_disable");
      } else {
        mfaPrimaryButton.textContent = mfaStatus.enabled
          ? t("settings_mfa_turn_off")
          : t("settings_mfa_turn_on");
      }
    }

    if (mfaHelperNote) {
      if (mfaMode === "enable_verify") {
        mfaHelperNote.textContent = t("settings_mfa_helper_enable_verify");
      } else if (mfaMode === "disable_verify") {
        mfaHelperNote.textContent = t("settings_mfa_helper_disable_verify");
      } else {
        mfaHelperNote.textContent = t("settings_mfa_helper_note");
      }
    }

    if (mfaMode === "idle") {
      mfaSetupPanel?.classList.add("hidden");
      mfaCancelButton?.classList.add("hidden");
    } else {
      mfaSetupPanel?.classList.remove("hidden");
      mfaCancelButton?.classList.toggle("hidden", mfaStatus.enabled);
    }

    if (mfaMode === "idle") resetSetupPanel();
    updateRecoveryUi();
  };

  const loadMfaStatus = async () => {
    const response = await apiFetch("/api/auth/mfa/status");
    if (!response || !response.ok) {
      throw new Error(t("settings_mfa_status_error"));
    }

    mfaStatus = await response.json().catch(() => ({
      enabled: false,
      delivery: "email"
    }));
    if (mfaEnabledToggle) {
      mfaEnabledToggle.disabled = false;
    }
    updateMfaUi();
  };

  const setMfaUnknown = () => {
    if (mfaEnabledToggle) {
      mfaEnabledToggle.disabled = true;
      mfaEnabledToggle.indeterminate = true;
    }
    if (mfaPrimaryButton) {
      mfaPrimaryButton.disabled = true;
    }
    if (mfaHelperNote) {
      mfaHelperNote.textContent = t("settings_mfa_status_unknown");
    }
  };

  [currentInput, newInput, confirmInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateStrength();
      updateRequirements();
      updateMatch();
      updateSubmitState();
    });
  });

  showToggle?.addEventListener("change", () => {
    const type = showToggle.checked ? "text" : "password";
    [currentInput, newInput, confirmInput, recoveryEmailPassword].forEach((input) => {
      if (!input) {
        return;
      }
      input.type = type;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMfaMessage("");
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword: currentInput.value,
          newPassword: newInput.value,
          confirmPassword: confirmInput.value
        })
      });

      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) {
        showSettingsToast(payload?.error || t("settings_password_update_error"));
        return;
      }

      if (payload?.token && typeof setToken === "function") {
        setToken(payload.token);
      }
      if (payload?.subscription && typeof applySubscriptionState === "function") {
        applySubscriptionState(payload.subscription);
      }
      showSettingsToast(payload?.message || t("settings_password_updated"));
      form.reset();
      updateStrength();
      updateRequirements();
      updateMatch();
      updateSubmitState();
    } catch (error) {
      console.error("Password update failed", error);
      showSettingsToast(t("settings_password_update_error"));
    } finally {
      if (submitButton) updateSubmitState();
    }
  });

  mfaEnabledToggle?.addEventListener("change", () => {
    setMfaMessage("");
    if (mfaEnabledToggle.checked === !!mfaStatus.enabled) {
      mfaMode = "idle";
      updateMfaUi();
      return;
    }

    mfaMode = mfaEnabledToggle.checked ? "enable_start" : "disable";
    mfaSetupPanel?.classList.remove("hidden");
    mfaCodeField?.classList.add("hidden");
    if (mfaSetupCode) {
      mfaSetupCode.value = "";
    }
    mfaPendingToken = "";
    updateMfaUi();
  });

  mfaPrimaryButton?.addEventListener("click", async () => {
    setMfaMessage("");

    if (mfaMode === "enable_start") {
      if (!mfaStatus.recovery_email_verified) {
        setMfaMessage("Tip: add a recovery email so you can regain access if you lose your device.", "is-warning");
      }
      try {
        const response = await apiFetch("/api/auth/mfa/enable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });
        const payload = response ? await response.json().catch(() => null) : null;

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || t("settings_mfa_enable_error"), "is-error");
          mfaEnabledToggle.checked = false;
          return;
        }

        if (payload?.pending_verification && payload?.mfa_token) {
          mfaPendingToken = payload.mfa_token;
          mfaMode = "enable_verify";
          mfaCodeField?.classList.remove("hidden");
          updateMfaUi();
          setMfaMessage(payload?.message || t("settings_mfa_enable_verify_message"), "is-success");
          return;
        }

        setMfaMessage(payload?.error || t("settings_mfa_enable_error"), "is-error");
        mfaEnabledToggle.checked = false;
      } catch (error) {
        console.error("MFA enable failed", error);
        setMfaMessage(t("settings_mfa_enable_error"), "is-error");
        mfaEnabledToggle.checked = false;
      }
      return;
    }

    if (mfaMode === "enable_verify") {
      try {
        const response = await apiFetch("/api/auth/mfa/enable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            code: mfaSetupCode?.value || "",
            mfaToken: mfaPendingToken
          })
        });
        const payload = response ? await response.json().catch(() => null) : null;

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || t("settings_mfa_enable_error"), "is-error");
          return;
        }

        if (payload?.token && typeof setToken === "function") {
          setToken(payload.token);
        }
        if (payload?.subscription && typeof applySubscriptionState === "function") {
          applySubscriptionState(payload.subscription);
        }
        mfaStatus = payload?.status || { enabled: true, delivery: "email" };
        mfaMode = "idle";
        updateMfaUi();
        showSettingsToast(t("settings_mfa_enabled"));
        setMfaMessage(t("settings_mfa_enabled_message"), "is-success");
      } catch (error) {
        console.error("MFA enable verification failed", error);
        setMfaMessage(t("settings_mfa_enable_error"), "is-error");
      }
      return;
    }

    if (mfaMode === "disable") {
      try {
        const response = await apiFetch("/api/auth/mfa/disable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });
        const payload = response ? await response.json().catch(() => null) : null;

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || t("settings_mfa_disable_error"), "is-error");
          mfaEnabledToggle.checked = true;
          return;
        }

        if (payload?.pending_verification && payload?.mfa_token) {
          mfaPendingToken = payload.mfa_token;
          mfaMode = "disable_verify";
          mfaCodeField?.classList.remove("hidden");
          updateMfaUi();
          setMfaMessage(payload?.message || t("settings_mfa_disable_verify_message"), "is-success");
          return;
        }

        setMfaMessage(payload?.error || t("settings_mfa_disable_error"), "is-error");
        mfaEnabledToggle.checked = true;
      } catch (error) {
        console.error("MFA disable failed", error);
        setMfaMessage(t("settings_mfa_disable_error"), "is-error");
        mfaEnabledToggle.checked = true;
      }
      return;
    }

    if (mfaMode === "disable_verify") {
      try {
        const response = await apiFetch("/api/auth/mfa/disable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            code: mfaSetupCode?.value || "",
            mfaToken: mfaPendingToken
          })
        });
        const payload = response ? await response.json().catch(() => null) : null;

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || t("settings_mfa_disable_error"), "is-error");
          return;
        }

        if (payload?.token && typeof setToken === "function") {
          setToken(payload.token);
        }
        if (payload?.subscription && typeof applySubscriptionState === "function") {
          applySubscriptionState(payload.subscription);
        }
        mfaStatus = payload?.status || { enabled: false, delivery: "email" };
        mfaMode = "idle";
        updateMfaUi();
        showSettingsToast(t("settings_mfa_disabled"));
        setMfaMessage(t("settings_mfa_disabled_message"), "is-success");
      } catch (error) {
        console.error("MFA disable verification failed", error);
        setMfaMessage(t("settings_mfa_disable_error"), "is-error");
      }
    }
  });

  mfaCancelButton?.addEventListener("click", async () => {
    if (mfaEnabledToggle) {
      mfaEnabledToggle.checked = !!mfaStatus.enabled;
    }
    mfaMode = "idle";
    resetSetupPanel();
    updateMfaUi();
    setMfaMessage("");
  });

  revokeAllSessionsButton?.addEventListener("click", async () => {
    await revokeAllSessionsFromSettings(revokeAllSessionsButton);
  });

  recoveryEmailSaveButton?.addEventListener("click", async () => {
    setRecoveryMessage("");
    const recoveryEmail = recoveryEmailInput?.value.trim() || "";
    const currentPassword = recoveryEmailPassword?.value || "";
    if (!recoveryEmail || !currentPassword) {
      setRecoveryMessage("Enter the recovery email and your current password.", "is-error");
      return;
    }

    recoveryEmailSaveButton.disabled = true;
    try {
      const response = await apiFetch("/api/auth/recovery-email/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recoveryEmail,
          currentPassword
        })
      });
      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) {
        setRecoveryMessage(payload?.error || "Unable to save recovery email.", "is-error");
        return;
      }

      if (!mfaStatus.recovery_email_verified) {
        mfaStatus.recovery_email_masked = maskRecoveryEmailForDisplay(recoveryEmail);
        mfaStatus.recovery_email_verified = false;
        updateRecoveryUi();
      }
      setRecoveryMessage(payload?.message || "Check your recovery email for a confirmation link.", "is-success");
      if (recoveryEmailPassword) {
        recoveryEmailPassword.value = "";
      }
    } catch (error) {
      console.error("Recovery email request failed", error);
      setRecoveryMessage("Unable to save recovery email.", "is-error");
    } finally {
      recoveryEmailSaveButton.disabled = false;
    }
  });

  updateStrength();
  updateRequirements();
  updateMatch();
  updateSubmitState();
  loadMfaStatus().catch((error) => {
    console.error("Failed to initialize MFA settings", error);
    setMfaMessage(t("settings_mfa_status_error"), "is-error");
    setMfaUnknown();
  }).finally(() => {
    if (recoveryEmailVerified) {
      showSettingsToast("Recovery email confirmed.");
      const url = new URL(window.location.href);
      url.searchParams.delete("recovery_email_verified");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  });
}

function initSettingsTabs() {
  const tabButtons = Array.from(document.querySelectorAll("[data-cpa-tab]"));
  const tabPanels = Array.from(document.querySelectorAll("[data-cpa-panel]"));
  if (!tabButtons.length || !tabPanels.length) {
    return;
  }

  const setActiveTab = (tabId) => {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.cpaTab === tabId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.cpaPanel === tabId);
    });
  };

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.cpaTab || "active"));
  });
}
function initSettingsNav() {
  const triggers = Array.from(document.querySelectorAll("[data-settings-target]"));
  const navButtons = Array.from(document.querySelectorAll("[data-settings-nav-item]"));
  if (!triggers.length) {
    return;
  }

  const targets = triggers
    .map((button) => ({
      button,
      target: document.getElementById(button.dataset.settingsTarget || "")
    }))
    .filter((entry) => entry.target);

  const setActiveTarget = (targetId) => {
    navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.settingsTarget === targetId);
    });
  };

  targets.forEach(({ button, target }) => {
    button.addEventListener("click", () => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveTarget(target.id);
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveTarget(visible.target.id);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.4, 0.6]
      }
    );

    targets.forEach(({ target }) => observer.observe(target));
  }
}

function getPasswordScore(password) {
  const rules = Object.values(SETTINGS_PASSWORD_RULES);
  const passed = rules.filter((rule) => rule(password)).length;
  if (passed >= rules.length) return 3;
  if (passed >= 3) return 2;
  if (passed >= 2) return 1;
  return 0;
}

function getStrengthLabel(score) {
  if (score >= 3) return t("settings_password_strong");
  if (score >= 2) return t("settings_password_fair");
  return t("settings_password_weak");
}

function clearBusinessDataState() {
  SETTINGS_DELETE_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  if (window.lunaStorage?.purgeSensitiveStorage) {
    window.lunaStorage.purgeSensitiveStorage();
  } else {
    try {
      const keysToRemove = Object.keys(localStorage).filter(
        (key) => key.startsWith("lb_") || key.startsWith("lb:")
      );
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (_) {}
  }
}

function clearAccountDeletionState() {
  clearBusinessDataState();
  localStorage.removeItem("auth_token");
  localStorage.removeItem("lb_privacy_settings");
  localStorage.removeItem("lb_token");
  localStorage.removeItem("lb_user");
  sessionStorage.clear();
  if (typeof clearToken === "function") {
    clearToken();
  }
}

async function revokeAllSessionsFromSettings(button) {
  if (!window.confirm(t("sessions_confirm_revoke_all"))) {
    return;
  }

  if (button) {
    button.disabled = true;
  }

  try {
    const response = await apiFetch("/api/sessions", {
      method: "DELETE"
    });
    const payload = response ? await response.json().catch(() => null) : null;

    if (!response || !response.ok) {
      showSettingsToast(payload?.error || t("sessions_error_revoke_all"));
      if (button) {
        button.disabled = false;
      }
      return;
    }

    clearAccountDeletionState();
    if (typeof markLoginReset === "function") {
      markLoginReset();
    }
    showSettingsToast(t("sessions_all_revoked"));
    window.setTimeout(() => {
      window.location.href = "/login";
    }, 900);
  } catch (error) {
    console.error("Failed to revoke all sessions from settings", error);
    showSettingsToast(t("sessions_error_revoke_all"));
    if (button) {
      button.disabled = false;
    }
  }
}

function initDangerZone() {
  const modal = document.getElementById("dangerModal");
  const title = document.getElementById("dangerModalTitle");
  const body = document.getElementById("dangerModalBody");
  const confirmWrap = document.getElementById("dangerModalConfirmWrap");
  const passwordWrap = document.getElementById("dangerModalPasswordWrap");
  const mfaWrap = document.getElementById("dangerModalMfaWrap");
  const confirmInput = document.getElementById("dangerModalConfirmInput");
  const passwordInput = document.getElementById("dangerModalPasswordInput");
  const mfaInput = document.getElementById("dangerModalMfaInput");
  const confirmButton = document.getElementById("dangerModalConfirm");
  const cancelButton = document.getElementById("dangerModalCancel");
  const deleteDataButton = document.getElementById("deleteMyDataBtn");
  const deleteAccountButton = document.getElementById("deleteAccountTrigger");
  let deleteAccountMfaEnabled = null;
  let deleteAccountMfaStatusPromise = null;
  let deleteAccountMfaToken = "";
  let deleteAccountMfaReauthToken = "";

  if (!modal) return;

  const resetDeleteAccountMfaState = () => {
    deleteAccountMfaToken = "";
    deleteAccountMfaReauthToken = "";
    if (mfaInput) {
      mfaInput.value = "";
    }
    mfaWrap?.classList.add("hidden");
  };

  const loadDeleteAccountMfaState = async () => {
    try {
      const response = await apiFetch("/api/auth/mfa/status");
      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) {
        deleteAccountMfaEnabled = false;
        return;
      }
      deleteAccountMfaEnabled = !!payload?.enabled;
    } catch (_error) {
      deleteAccountMfaEnabled = false;
    }
  };

  const closeModal = () => {
    modal.classList.add("hidden");
    dangerAction = null;
    pendingDeleteBusinessId = null;
    if (confirmInput) confirmInput.value = "";
    if (passwordInput) passwordInput.value = "";
    resetDeleteAccountMfaState();
    confirmWrap.classList.add("hidden");
    if (passwordWrap) passwordWrap.classList.add("hidden");
    confirmButton.disabled = false;
  };

  const openModal = (action) => {
    dangerAction = action;
    if (confirmInput) confirmInput.value = "";
    if (action === "delete_account") {
      title.textContent = t("settings_delete_account_modal_title");
      body.textContent = t("settings_delete_account_modal_body");
      confirmWrap.classList.remove("hidden");
      if (passwordWrap) passwordWrap.classList.remove("hidden");
      deleteAccountMfaEnabled = null;
      resetDeleteAccountMfaState();
      deleteAccountMfaStatusPromise = loadDeleteAccountMfaState().finally(() => {
        deleteAccountMfaStatusPromise = null;
      });
      if (passwordInput) passwordInput.value = "";
      confirmButton.disabled = true;
    } else {
      title.textContent = t("settings_delete_business_data_modal_title");
      body.textContent = t("settings_delete_business_data_modal_body_full");
      confirmWrap.classList.add("hidden");
      if (passwordWrap) passwordWrap.classList.remove("hidden");
      resetDeleteAccountMfaState();
      if (passwordInput) passwordInput.value = "";
      confirmButton.disabled = true;
    }
    modal.classList.remove("hidden");
  };

  deleteDataButton?.addEventListener("click", () => openModal("delete_data"));
  deleteAccountButton?.addEventListener("click", () => openModal("delete_account"));
  cancelButton?.addEventListener("click", closeModal);

  const getAccountEmail = () => String(window.__LUNA_ME__?.email || "").trim().toLowerCase();

  const updateDeleteAccountButtonState = () => {
    if (dangerAction === "delete_account") {
      const val = (confirmInput?.value || "").trim();
      const email = getAccountEmail();
      const confirmed = val === "DELETE" || (email && val.toLowerCase() === email);
      confirmButton.disabled = !confirmed || !passwordInput?.value;
      return;
    }
    if (dangerAction === "delete_data") {
      confirmButton.disabled = !passwordInput?.value;
    }
  };

  confirmInput?.addEventListener("input", updateDeleteAccountButtonState);
  passwordInput?.addEventListener("input", updateDeleteAccountButtonState);
  mfaInput?.addEventListener("input", updateDeleteAccountButtonState);

  confirmButton?.addEventListener("click", () => {
    void (async () => {
      if (dangerAction === "delete_data") {
        const password = passwordInput?.value || "";
        if (!password) {
          showSettingsToast(t("settings_enter_password_confirm"));
          passwordInput?.focus();
          return;
        }
        confirmButton.disabled = true;
        try {
          if (
            typeof privacyService === "object" &&
            typeof privacyService.deleteBusinessData === "function"
          ) {
            await privacyService.deleteBusinessData({ password });
          }
          clearBusinessDataState();
          showSettingsToast(t("settings_business_data_deleted"));
          closeModal();
        } catch (err) {
          console.error("Business data deletion failed", err);
          showSettingsToast(t("settings_delete_business_error"));
          confirmButton.disabled = false;
        }
        return;
      }

      if (dangerAction === "delete_business") {
        const password = passwordInput?.value || "";
        if (!password) {
          showSettingsToast(t("settings_enter_password_confirm"));
          passwordInput?.focus();
          return;
        }
        confirmButton.disabled = true;
        try {
          const res = await apiFetch(`/api/businesses/${pendingDeleteBusinessId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });
          const payload = res ? await res.json().catch(() => null) : null;
          if (!res || !res.ok) {
            showSettingsToast(payload?.error || t("settings_delete_business_error"));
            confirmButton.disabled = false;
            return;
          }
          showSettingsToast(t("settings_delete_business_success"));
          closeModal();
          await renderBusinessList();
        } catch (err) {
          console.error("Business deletion failed", err);
          showSettingsToast(t("settings_delete_business_error"));
          confirmButton.disabled = false;
        }
        return;
      }

      if (dangerAction === "delete_account") {
        const password = passwordInput?.value || "";
        if (!password) {
          showSettingsToast(t("settings_enter_password_confirm"));
          passwordInput?.focus();
          return;
        }

        try {
          if (deleteAccountMfaEnabled === null) {
            if (deleteAccountMfaStatusPromise) {
              await deleteAccountMfaStatusPromise;
            } else {
              await loadDeleteAccountMfaState();
            }
          }

          let mfaReauthToken = deleteAccountMfaReauthToken;
          if (deleteAccountMfaEnabled) {
            if (!deleteAccountMfaReauthToken) {
              confirmButton.disabled = true;
              const reauthPayload = {
                currentPassword: password
              };
              if (deleteAccountMfaToken) {
                const code = mfaInput?.value?.trim() || "";
                if (!code) {
                  showSettingsToast(t("mfa_challenge_error_missing"));
                  confirmButton.disabled = false;
                  mfaInput?.focus();
                  return;
                }
                reauthPayload.code = code;
                reauthPayload.mfaToken = deleteAccountMfaToken;
              }

              const reauthResponse = await apiFetch("/api/auth/mfa/reauth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reauthPayload)
              });
              const reauthResult = await reauthResponse?.json().catch(() => null);
              if (!reauthResponse || !reauthResponse.ok) {
                if (reauthResponse?.status === 401 || reauthResponse?.status === 403) {
                  deleteAccountMfaToken = "";
                  deleteAccountMfaReauthToken = "";
                  if (mfaInput) {
                    mfaInput.value = "";
                  }
                }
                showSettingsToast(reauthResult?.error || t("settings_delete_account_error"));
                confirmButton.disabled = false;
                return;
              }

              if (reauthResult?.pending_verification && reauthResult?.mfa_token) {
                deleteAccountMfaToken = reauthResult.mfa_token;
                deleteAccountMfaReauthToken = "";
                mfaWrap?.classList.remove("hidden");
                showSettingsToast(reauthResult?.message || t("settings_mfa_enable_verify_message"));
                confirmButton.disabled = false;
                mfaInput?.focus();
                return;
              }

              if (!reauthResult?.reauth_token) {
                showSettingsToast(reauthResult?.error || t("settings_delete_account_error"));
                confirmButton.disabled = false;
                return;
              }

              deleteAccountMfaReauthToken = reauthResult.reauth_token;
              deleteAccountMfaToken = "";
              mfaReauthToken = reauthResult.reauth_token;
              mfaWrap?.classList.add("hidden");
              if (mfaInput) {
                mfaInput.value = "";
              }
            } else {
              mfaReauthToken = deleteAccountMfaReauthToken;
            }
          }

          confirmButton.disabled = true;
          const response = await apiFetch("/api/me", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password,
              ...(mfaReauthToken ? { mfaReauthToken } : {})
            })
          });
          const payload = response ? await response.json().catch(() => null) : null;

          if (!response || !response.ok) {
            if (payload?.reauthenticate) {
              resetDeleteAccountMfaState();
              mfaWrap?.classList.remove("hidden");
            }
            showSettingsToast(payload?.detail || payload?.error || t("settings_delete_account_error"));
            confirmButton.disabled = false;
            return;
          }

          clearAccountDeletionState();
          showSettingsToast(t("settings_delete_account_success"));
          closeModal();
          setTimeout(() => {
            window.location.href = "/";
          }, 600);
          return;
        } catch (error) {
          console.error("Account deletion failed", error);
          showSettingsToast(t("settings_delete_account_error"));
          confirmButton.disabled = false;
          return;
        }
      }

      closeModal();
    })();
  });
}


function showSettingsToast(message) {
  const toast = document.getElementById("settingsToast");
  const messageNode = document.getElementById("settingsToastMessage");
  if (!toast || !messageNode) return;

  messageNode.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, SETTINGS_TOAST_MS);
}
