const REGION_DISPLAY = {
  us: "United States",
  ca: "Canada"
};

const SETTINGS_DEFAULT_THEME = typeof DEFAULT_THEME !== "undefined" ? DEFAULT_THEME : "light";
const SETTINGS_THEME_VERSION = typeof THEME_VERSION !== "undefined" ? THEME_VERSION : "2";
const BUSINESS_PROFILE_KEY = "lb_business_profile";
const SETTINGS_TOAST_MS = 3000;
const SETTINGS_DELETE_DATA_KEYS = [
  "lb_transactions",
  "lb_receipts",
  "lb_mileage",
  "lb_export_history",
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
const resolveEstimatedTaxProfileHelper = taxHelpers.resolveEstimatedTaxProfile || ((region, province) => ({
  region: String(region || "").toUpperCase() === "CA" ? "CA" : "US",
  province: String(province || "").toUpperCase(),
  rate: String(region || "").toUpperCase() === "CA" ? 0.05 : 0.24
}));
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

let privacySettings = {
  dataSharingOptOut: false,
  consentGiven: false
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

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  initSettingsNav();
  await initBusinessProfileForm();
  await initCpaAccess();
  await initPreferences();
  initSecurityForm();
  initDangerZone();
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
  try {
    return JSON.parse(localStorage.getItem(BUSINESS_PROFILE_KEY) || "null") || {};
  } catch {
    return {};
  }
}

function saveBusinessProfile(profile) {
  localStorage.setItem(BUSINESS_PROFILE_KEY, JSON.stringify(profile));
}

async function initBusinessProfileForm() {
  const form = document.getElementById("businessProfileForm");
  if (!form) return;

  const profile = await loadBusinessProfile();
  document.getElementById("business-name").value = profile.name || "";
  document.getElementById("business-type-select").value = profile.type || "sole_proprietor";
  document.getElementById("businessEin").value = profile.ein || "";
  document.getElementById("fiscal-year").value = profile.fiscalYearStart || "";
  document.getElementById("business-address").value = profile.address || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextProfile = {
      name: document.getElementById("business-name").value.trim(),
      type: document.getElementById("business-type-select").value,
      ein: document.getElementById("businessEin").value.trim(),
      fiscalYearStart: document.getElementById("fiscal-year").value,
      address: document.getElementById("business-address").value.trim()
    };

    const saved = await saveBusinessProfileToApi(nextProfile);
    if (!saved) {
      showSettingsToast("Unable to save business profile");
      return;
    }
    saveBusinessProfile(nextProfile);
    showSettingsToast("Business profile saved");
  });
}

async function loadBusinessProfile() {
  const fallback = getBusinessProfile();

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return fallback;
    }

    const business = await response.json().catch(() => null);
    const profile = {
      name: business?.name || fallback.name || "",
      type: business?.business_type || fallback.type || "sole_proprietor",
      ein: business?.tax_id || fallback.ein || "",
      fiscalYearStart: business?.fiscal_year_start || fallback.fiscalYearStart || "",
      address: business?.address || fallback.address || ""
    };
    saveBusinessProfile(profile);
    return profile;
  } catch (error) {
    console.error("Failed to load business profile", error);
    return fallback;
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
        tax_id: profile.ein || null,
        address: profile.address || null
      })
    });

    return !!(response && response.ok);
  } catch (error) {
    console.error("Failed to save business profile", error);
    return false;
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
  const saveBar = document.getElementById("settingsSaveBar");
  const saveButton = document.getElementById("settingsSavePreferences");
  const cancelButton = document.getElementById("settingsCancelChanges");

  businessSettingsState = await loadBusinessSettings();

  const buildPreferenceState = () => ({
    region: normalizeSettingsRegion(
      businessSettingsState.region || (typeof getCurrentRegion === "function" ? getCurrentRegion() : "us")
    ),
    province: normalizeProvinceCode(businessSettingsState.province || ""),
    language: typeof getCurrentLanguage === "function" ? getCurrentLanguage() : businessSettingsState.language || "en",
    theme: resolveSavedTheme(),
    distance: localStorage.getItem("lb_unit_metric") === "true" ? "km" : "mi",
    optOutAnalytics: !!privacySettings.dataSharingOptOut
  });

  const syncProvinceVisibility = (region) => {
    if (!provinceRow) return;
    const isCanada = normalizeSettingsRegion(region) === "ca";
    provinceRow.classList.toggle("hidden", !isCanada);
    provinceRow.style.display = isCanada ? "flex" : "none";
    if (provinceSelect) {
      provinceSelect.disabled = !isCanada;
    }
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
    pendingPreferences = {
      region: regionSelect ? normalizeSettingsRegion(regionSelect.value) : pendingPreferences.region,
      province:
        regionSelect && normalizeSettingsRegion(regionSelect.value) === "ca"
          ? normalizeProvinceCode(provinceSelect?.value || pendingPreferences.province)
          : "",
      language: languageSelect ? languageSelect.value : pendingPreferences.language,
      theme: darkModeToggle?.checked ? "dark" : "light",
      distance: distanceSelect ? distanceSelect.value : pendingPreferences.distance,
      optOutAnalytics: !!optOutToggle?.checked
    };
    syncProvinceVisibility(pendingPreferences.region);
    updateProvinceRateNote(pendingPreferences.region, pendingPreferences.province);
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
    darkModeToggle.addEventListener("change", updatePendingPreferences);
  }

  if (distanceSelect) {
    distanceSelect.addEventListener("change", updatePendingPreferences);
  }

  privacySettings = await getPrivacySettingsSafe();
  if (optOutToggle) {
    optOutToggle.addEventListener("change", updatePendingPreferences);
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
      if (typeof privacyService === "object" && typeof privacyService.exportMyData === "function") {
        await privacyService.exportMyData();
      }
      showSettingsToast("Data export started");
    });
  }

  replayOnboardingTipsButton?.addEventListener("click", async () => {
    try {
      const response = await apiFetch("/api/me/onboarding/replay", {
        method: "POST"
      });

      if (!response || !response.ok) {
        throw new Error("Unable to reset onboarding tips");
      }

      showSettingsToast("Getting started tips reset");
    } catch (error) {
      console.error("Failed to reset onboarding tips", error);
      showSettingsToast("Unable to reset getting started tips");
    }
  });

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
      showSettingsToast("Select a Canadian province or territory before saving.");
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
        showSettingsToast(businessSaveResult.error || "Unable to save region settings");
        return;
      }

      businessSettingsState = businessSaveResult.settings || normalizeBusinessSettings({
        region: nextPreferences.region.toUpperCase(),
        language: nextPreferences.language,
        province: nextPreferences.region === "ca" ? nextPreferences.province : ""
      });
    }

    if (typeof setCurrentRegion === "function") {
      applyCurrentRegionRuntime(nextPreferences.region);
    } else {
      window.LUNA_REGION = nextPreferences.region;
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
  const form = document.getElementById("cpaAccessForm");
  const emailInput = document.getElementById("cpaAccessEmail");
  const scopeSelect = document.getElementById("cpaAccessScope");
  const businessSelect = document.getElementById("cpaAccessBusiness");
  const businessWrap = document.getElementById("cpaBusinessSelectWrap");
  const messageNode = document.getElementById("cpaAccessMessage");
  const listNode = document.getElementById("cpaAccessList");
  const auditNode = document.getElementById("cpaAuditActivityList");

  if (!form || !emailInput || !scopeSelect || !businessSelect || !businessWrap || !listNode) {
    return;
  }

  const syncBusinessVisibility = () => {
    const scopedToAll = scopeSelect.value === "all";
    businessWrap.classList.toggle("hidden", scopedToAll);
    businessWrap.style.display = scopedToAll ? "none" : "";
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
        throw new Error("Unable to load businesses.");
      }

      const payload = await response.json().catch(() => null);
      const businesses = Array.isArray(payload?.businesses) ? payload.businesses : [];
      const activeBusinessId = payload?.active_business_id || "";

      businessSelect.innerHTML = "";
      businesses.forEach((business) => {
        const option = document.createElement("option");
        option.value = business.id;
        option.textContent = business.name || "Business";
        if (business.id === activeBusinessId) {
          option.selected = true;
        }
        businessSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Failed to load CPA business options", error);
      setMessage("Unable to load businesses for CPA access.", "is-error");
    }
  };

  const renderOwnedGrants = async () => {
    try {
      const response = await apiFetch("/api/cpa-access/grants/owned");
      if (!response || !response.ok) {
        throw new Error("Unable to load grants.");
      }

      const payload = await response.json().catch(() => null);
      const grants = Array.isArray(payload?.grants) ? payload.grants : [];

      if (!grants.length) {
        listNode.innerHTML = '<div class="cpa-access-empty">No CPA access grants yet.</div>';
        return;
      }

      listNode.innerHTML = grants.map((grant) => {
        const detailParts = [`Created ${formatSettingsDate(grant.created_at)}`];
        if (grant.accepted_at) detailParts.push(`Accepted ${formatSettingsDate(grant.accepted_at)}`);
        if (grant.revoked_at) detailParts.push(`Revoked ${formatSettingsDate(grant.revoked_at)}`);

        return `
          <div class="cpa-access-item">
            <div class="cpa-access-meta">
              <div class="cpa-access-email">${escapeSettingsHtml(grant.grantee_email || "")}</div>
              <div class="cpa-access-tags">
                <span class="cpa-access-tag scope">${grant.scope === "all" ? "All businesses" : "One business"}</span>
                <span class="cpa-access-tag business">${escapeSettingsHtml(grant.business_name || "Portfolio-wide")}</span>
                <span class="cpa-access-tag ${escapeSettingsHtml(grant.status || "pending")}">${escapeSettingsHtml(grant.status || "pending")}</span>
              </div>
              <div class="cpa-access-detail">${escapeSettingsHtml(detailParts.join(" | "))}</div>
            </div>
            <div class="cpa-access-actions">
              ${grant.status !== "revoked"
                ? `<button type="button" class="cpa-access-revoke" data-cpa-revoke="${escapeSettingsHtml(grant.id || "")}">Revoke</button>`
                : `<button type="button" class="cpa-access-delete" data-cpa-delete="${escapeSettingsHtml(grant.id || "")}">Delete</button>`}
            </div>
          </div>
        `;
      }).join("");

      listNode.querySelectorAll("[data-cpa-revoke]").forEach((button) => {
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
            setMessage(errorPayload?.error || "Unable to revoke CPA access.", "is-error");
            return;
          }

          setMessage("CPA access revoked.", "is-success");
          showSettingsToast("CPA access revoked");
          await renderOwnedGrants();
          await renderAuditActivity();
        });
      });

      listNode.querySelectorAll("[data-cpa-delete]").forEach((button) => {
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
            setMessage(errorPayload?.error || "Unable to delete revoked CPA access.", "is-error");
            return;
          }

          setMessage("Revoked CPA access deleted.", "is-success");
          showSettingsToast("Revoked CPA access deleted");
          await renderOwnedGrants();
          await renderAuditActivity();
        });
      });
    } catch (error) {
      console.error("Failed to load CPA grants", error);
      listNode.innerHTML = '<div class="cpa-access-empty">Unable to load CPA access grants.</div>';
    }
  };

  const renderAuditActivity = async () => {
    if (!auditNode) {
      return;
    }

    try {
      const response = await apiFetch("/api/cpa-access/audit?limit=12");
      if (!response || !response.ok) {
        throw new Error("Unable to load audit activity.");
      }

      const payload = await response.json().catch(() => null);
      const logs = Array.isArray(payload?.logs) ? payload.logs : [];

      if (!logs.length) {
        auditNode.innerHTML = '<div class="cpa-access-empty">No CPA audit activity yet.</div>';
        return;
      }

      auditNode.innerHTML = logs.map((entry) => `
        <div class="cpa-access-item">
          <div class="cpa-access-meta">
            <div class="cpa-access-email">${escapeSettingsHtml(formatSettingsAuditAction(entry.action))}</div>
            <div class="cpa-access-tags">
              <span class="cpa-access-tag business">${escapeSettingsHtml(entry.business_name || "Portfolio-wide")}</span>
            </div>
            <div class="cpa-access-detail">${escapeSettingsHtml(formatSettingsDateTime(entry.created_at))}${entry.actor_email ? ` | ${escapeSettingsHtml(entry.actor_email)}` : ""}</div>
          </div>
        </div>
      `).join("");
    } catch (error) {
      console.error("Failed to load CPA audit activity", error);
      auditNode.innerHTML = '<div class="cpa-access-empty">Unable to load CPA audit activity.</div>';
    }
  };

  scopeSelect.addEventListener("change", () => {
    syncBusinessVisibility();
    setMessage("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const payload = {
      email: emailInput.value.trim(),
      scope: scopeSelect.value === "all" ? "all" : "business",
      business_id: scopeSelect.value === "all" ? null : businessSelect.value || null
    };

    const response = await apiFetch("/api/cpa-access/grants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response || !response.ok) {
      const body = await response?.json().catch(() => null);
      setMessage(body?.error || "Unable to create CPA access grant.", "is-error");
      return;
    }

    emailInput.value = "";
    scopeSelect.value = "business";
    syncBusinessVisibility();
    setMessage("CPA access invite created.", "is-success");
    showSettingsToast("CPA access invite created");
    await renderOwnedGrants();
    await renderAuditActivity();
  });

  await loadBusinessOptions();
  syncBusinessVisibility();
  await renderOwnedGrants();
  await renderAuditActivity();
}

function escapeSettingsHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSettingsDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSettingsDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("en-US", {
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
    provinceRow.style.display = isCanada ? "flex" : "none";
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

function applyCurrentRegionRuntime(region) {
  const normalized = normalizeSettingsRegion(region);
  window.LUNA_REGION = normalized;
  if (typeof applyTranslations === "function") {
    applyTranslations(typeof getCurrentLanguage === "function" ? getCurrentLanguage() : undefined);
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
      const errorPayload = await response?.json().catch(() => null);
      console.error("Business settings API rejected save", errorPayload || response?.status);
      return {
        ok: false,
        error: errorPayload?.error || "Unable to save region settings"
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
      error: error?.message || "Unable to save region settings"
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
  const mfaCurrentPassword = document.getElementById("mfa-current-password");
  const mfaSetupPanel = document.getElementById("mfaSetupPanel");
  const mfaCodeField = document.getElementById("mfaCodeField");
  const mfaSetupCode = document.getElementById("mfaSetupCode");
  const mfaHelperNote = document.getElementById("mfaHelperNote");
  const mfaPrimaryButton = document.getElementById("mfaPrimaryButton");
  const mfaCancelButton = document.getElementById("mfaCancelButton");
  const mfaMessage = document.getElementById("mfaMessage");

  let mfaStatus = {
    enabled: false,
    delivery: "email"
  };
  let mfaMode = "idle";
  let mfaPendingToken = "";

  const updateStrength = () => {
    const password = newInput.value;
    const score = getPasswordScore(password);
    const label = getStrengthLabel(score);
    let color = "#b91c1c";
    if (label === "Fair") color = "#92600a";
    if (label === "Strong") color = "#1a7a4a";
    strengthMeter.style.width = getStrengthWidth(score);
    strengthMeter.style.backgroundColor = color;
    const labelKey =
      label === "Strong"
        ? "settings_password_strong"
        : label === "Fair"
        ? "settings_password_fair"
        : "settings_password_weak";
    strengthText.textContent = t(labelKey);
    strengthText.style.color = color;
  };

  const updateRequirements = () => {
    requirementItems.forEach((item) => {
      const key = item.dataset.requirement;
      const rule = SETTINGS_PASSWORD_RULES[key];
      item.classList.toggle("is-met", rule ? rule(newInput.value) : false);
    });
  };

  const updateMatch = () => {
    if (!newInput.value || !confirmInput.value) {
      matchMessage.textContent = "";
      return;
    }
    if (newInput.value !== confirmInput.value) {
      matchMessage.textContent = t("register_password_match_error");
      matchMessage.style.color = "#b91c1c";
    } else {
      matchMessage.textContent = t("register_password_match_success");
      matchMessage.style.color = "#1a7a4a";
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

  const resetSetupPanel = () => {
    mfaSetupPanel?.classList.add("hidden");
    if (mfaCurrentPassword) mfaCurrentPassword.value = "";
    if (mfaSetupCode) mfaSetupCode.value = "";
    mfaCodeField?.classList.add("hidden");
    mfaCancelButton?.classList.add("hidden");
    mfaPendingToken = "";
  };

  const updateMfaUi = () => {
    if (mfaEnabledToggle) {
      mfaEnabledToggle.checked = !!mfaStatus.enabled;
    }

    if (mfaPrimaryButton) {
      if (mfaMode === "enable_verify") {
        mfaPrimaryButton.textContent = "Verify and turn on MFA";
      } else if (mfaMode === "disable_verify") {
        mfaPrimaryButton.textContent = "Verify and turn off MFA";
      } else {
        mfaPrimaryButton.textContent = mfaStatus.enabled ? "Turn off MFA" : "Turn on MFA";
      }
    }

    if (mfaHelperNote) {
      if (mfaMode === "enable_verify") {
        mfaHelperNote.textContent = "We emailed you a 6-digit code. Enter it to finish turning MFA on.";
      } else if (mfaMode === "disable_verify") {
        mfaHelperNote.textContent = "We emailed you a 6-digit code. Enter it to finish turning MFA off.";
      } else {
        mfaHelperNote.textContent = "Enter your password and confirm the switch. We will email you a code to verify it is really you.";
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
  };

  const loadMfaStatus = async () => {
    const response = await apiFetch("/api/auth/mfa/status");
    if (!response || !response.ok) {
      throw new Error("Unable to load MFA status");
    }

    mfaStatus = await response.json().catch(() => ({
      enabled: false,
      delivery: "email"
    }));
    updateMfaUi();
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
    [currentInput, newInput, confirmInput, mfaCurrentPassword].forEach((input) => {
      if (!input) {
        return;
      }
      input.type = type;
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMfaMessage("");

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

      const payload = await response?.json().catch(() => null);
      if (!response || !response.ok) {
        showSettingsToast(payload?.error || "Unable to update password");
        return;
      }

      showSettingsToast(payload?.message || "Password updated");
      form.reset();
      updateStrength();
      updateRequirements();
      updateMatch();
      updateSubmitState();
    } catch (error) {
      console.error("Password update failed", error);
      showSettingsToast("Unable to update password");
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
      try {
        const response = await apiFetch("/api/auth/mfa/enable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            currentPassword: mfaCurrentPassword?.value || ""
          })
        });
        const payload = await response?.json().catch(() => null);

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || "Unable to enable MFA.", "is-error");
          mfaEnabledToggle.checked = false;
          return;
        }

        if (payload?.pending_verification && payload?.mfa_token) {
          mfaPendingToken = payload.mfa_token;
          mfaMode = "enable_verify";
          mfaCodeField?.classList.remove("hidden");
          updateMfaUi();
          setMfaMessage(payload?.message || "Enter the code we emailed you to finish turning MFA on.", "is-success");
          return;
        }

        setMfaMessage(payload?.error || "Unable to enable MFA.", "is-error");
        mfaEnabledToggle.checked = false;
      } catch (error) {
        console.error("MFA enable failed", error);
        setMfaMessage("Unable to enable MFA.", "is-error");
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
            currentPassword: mfaCurrentPassword?.value || "",
            code: mfaSetupCode?.value || "",
            mfaToken: mfaPendingToken
          })
        });
        const payload = await response?.json().catch(() => null);

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || "Unable to enable MFA.", "is-error");
          return;
        }

        mfaStatus = payload?.status || { enabled: true, delivery: "email" };
        mfaMode = "idle";
        updateMfaUi();
        showSettingsToast("Multi-factor authentication enabled");
        setMfaMessage("MFA is now on. We will email a 6-digit code on new or untrusted sign-ins.", "is-success");
      } catch (error) {
        console.error("MFA enable verification failed", error);
        setMfaMessage("Unable to enable MFA.", "is-error");
      }
      return;
    }

    if (mfaMode === "disable") {
      try {
        const response = await apiFetch("/api/auth/mfa/disable", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            currentPassword: mfaCurrentPassword?.value || ""
          })
        });
        const payload = await response?.json().catch(() => null);

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || "Unable to disable MFA.", "is-error");
          mfaEnabledToggle.checked = true;
          return;
        }

        if (payload?.pending_verification && payload?.mfa_token) {
          mfaPendingToken = payload.mfa_token;
          mfaMode = "disable_verify";
          mfaCodeField?.classList.remove("hidden");
          updateMfaUi();
          setMfaMessage(payload?.message || "Enter the code we emailed you to finish turning MFA off.", "is-success");
          return;
        }

        setMfaMessage(payload?.error || "Unable to disable MFA.", "is-error");
        mfaEnabledToggle.checked = true;
      } catch (error) {
        console.error("MFA disable failed", error);
        setMfaMessage("Unable to disable MFA.", "is-error");
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
            currentPassword: mfaCurrentPassword?.value || "",
            code: mfaSetupCode?.value || "",
            mfaToken: mfaPendingToken
          })
        });
        const payload = await response?.json().catch(() => null);

        if (!response || !response.ok) {
          setMfaMessage(payload?.error || "Unable to disable MFA.", "is-error");
          return;
        }

        mfaStatus = payload?.status || { enabled: false, delivery: "email" };
        mfaMode = "idle";
        updateMfaUi();
        showSettingsToast("Multi-factor authentication disabled");
        setMfaMessage("MFA is now off.", "is-success");
      } catch (error) {
        console.error("MFA disable verification failed", error);
        setMfaMessage("Unable to disable MFA.", "is-error");
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

  updateStrength();
  updateRequirements();
  updateMatch();
  updateSubmitState();
  loadMfaStatus().catch((error) => {
    console.error("Failed to initialize MFA settings", error);
    setMfaMessage("Unable to load MFA status.", "is-error");
  });
}

function initSettingsNav() {
  const navButtons = Array.from(document.querySelectorAll("[data-settings-target]"));
  if (!navButtons.length) {
    return;
  }

  const targets = navButtons
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
  let score = 0;
  if (password.length >= 8) score++;
  if (/[\d\W_]/.test(password)) score++;
  if (password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  return score;
}

function getStrengthLabel(score) {
  if (score >= 3) return "Strong";
  if (score >= 2) return "Fair";
  return "Weak";
}

function getStrengthWidth(score) {
  if (score >= 3) return "100%";
  if (score >= 2) return "66.6667%";
  if (score >= 1) return "33.3333%";
  return "0%";
}

function initDangerZone() {
  const modal = document.getElementById("dangerModal");
  const title = document.getElementById("dangerModalTitle");
  const body = document.getElementById("dangerModalBody");
  const confirmWrap = document.getElementById("dangerModalConfirmWrap");
  const confirmInput = document.getElementById("dangerModalConfirmInput");
  const confirmButton = document.getElementById("dangerModalConfirm");
  const cancelButton = document.getElementById("dangerModalCancel");
  const deleteDataButton = document.getElementById("deleteMyDataBtn");
  const deleteAccountButton = document.getElementById("deleteAccountTrigger");

  if (!modal) return;

  const closeModal = () => {
    modal.classList.add("hidden");
    dangerAction = null;
    confirmInput.value = "";
    confirmWrap.classList.add("hidden");
    confirmButton.disabled = false;
  };

  const openModal = (action) => {
    dangerAction = action;
    if (action === "delete_account") {
      title.textContent = t("settings_delete_account_modal_title");
      body.textContent = t("settings_delete_account_modal_body");
      confirmWrap.classList.remove("hidden");
      confirmButton.disabled = true;
    } else {
      title.textContent = t("settings_delete_business_data_modal_title");
      body.textContent = t("settings_delete_business_data_modal_body_full");
      confirmWrap.classList.add("hidden");
      confirmButton.disabled = false;
    }
    modal.classList.remove("hidden");
  };

  deleteDataButton?.addEventListener("click", () => openModal("delete_data"));
  deleteAccountButton?.addEventListener("click", () => openModal("delete_account"));
  cancelButton?.addEventListener("click", closeModal);

  confirmInput?.addEventListener("input", () => {
    confirmButton.disabled = confirmInput.value !== "DELETE";
  });

  confirmButton?.addEventListener("click", () => {
    if (dangerAction === "delete_data") {
      SETTINGS_DELETE_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
      showSettingsToast("Business data deleted");
    } else if (dangerAction === "delete_account") {
      clearToken();
      showSettingsToast("Account deletion requested");
      setTimeout(() => {
        window.location.href = "/";
      }, 600);
    }
    closeModal();
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

