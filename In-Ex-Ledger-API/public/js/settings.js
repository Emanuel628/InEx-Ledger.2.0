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

let privacySettings = {
  dataSharingOptOut: false,
  consentGiven: false
};

let toastTimer = null;
let dangerAction = null;
let preferenceBaseline = null;
let pendingPreferences = null;

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  initSettingsNav();
  wireSignOutButtons();
  initBusinessProfileForm();
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

function wireSignOutButtons() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      clearToken();
      sessionStorage.clear();
      window.location.href = "login.html";
    });
  });
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

function initBusinessProfileForm() {
  const form = document.getElementById("businessProfileForm");
  if (!form) return;

  const profile = getBusinessProfile();
  document.getElementById("business-name").value = profile.name || "";
  document.getElementById("business-type-select").value = profile.type || "sole_proprietor";
  document.getElementById("businessEin").value = profile.ein || "";
  document.getElementById("fiscal-year").value = profile.fiscalYearStart || "";
  document.getElementById("business-address").value = profile.address || "";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBusinessProfile({
      name: document.getElementById("business-name").value.trim(),
      type: document.getElementById("business-type-select").value,
      ein: document.getElementById("businessEin").value.trim(),
      fiscalYearStart: document.getElementById("fiscal-year").value,
      address: document.getElementById("business-address").value.trim()
    });
    showSettingsToast("Business profile saved");
  });
}

async function initPreferences() {
  const regionSelect = document.getElementById("regionSelectSettings");
  const languageSelect = document.getElementById("languageSelectSettings");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const distanceSelect = document.getElementById("distanceSelect");
  const optOutToggle = document.getElementById("optOutToggle");
  const consentStatus = document.getElementById("consentStatus");
  const downloadBtn = document.getElementById("downloadMyDataBtn");
  const saveBar = document.getElementById("settingsSaveBar");
  const saveButton = document.getElementById("settingsSavePreferences");
  const cancelButton = document.getElementById("settingsCancelChanges");

  const buildPreferenceState = () => ({
    region: typeof getCurrentRegion === "function" ? getCurrentRegion() : (localStorage.getItem("lb_region") || "us"),
    language: typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en",
    theme: resolveSavedTheme(),
    distance: localStorage.getItem("lb_unit_metric") === "true" ? "km" : "mi",
    optOutAnalytics: !!privacySettings.dataSharingOptOut
  });

  const syncPreferenceControls = (state) => {
    if (regionSelect) regionSelect.value = state.region;
    if (languageSelect) {
      if (typeof populateLanguageOptions === "function") {
        populateLanguageOptions(languageSelect);
      }
      languageSelect.value = state.language;
    }
    if (darkModeToggle) darkModeToggle.checked = state.theme === "dark";
    if (distanceSelect) distanceSelect.value = state.distance;
    if (optOutToggle) optOutToggle.checked = !!state.optOutAnalytics;
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
      region: regionSelect ? regionSelect.value : pendingPreferences.region,
      language: languageSelect ? languageSelect.value : pendingPreferences.language,
      theme: darkModeToggle?.checked ? "dark" : "light",
      distance: distanceSelect ? distanceSelect.value : pendingPreferences.distance,
      optOutAnalytics: !!optOutToggle?.checked
    };
    updateSaveBar();
  };

  if (regionSelect) {
    regionSelect.addEventListener("change", updatePendingPreferences);
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

    if (typeof setCurrentRegion === "function") {
      setCurrentRegion(nextPreferences.region);
    } else {
      localStorage.setItem("lb_region", nextPreferences.region);
      window.LUNA_REGION = nextPreferences.region;
    }
    localStorage.setItem("region", nextPreferences.region === "ca" ? "CA" : "US");

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
    showSettingsToast(t("settings_changes_saved"));
  });
}

function refreshSettingsLocalizedState() {
  const consentStatus = document.getElementById("consentStatus");
  const languageSelect = document.getElementById("languageSelectSettings");
  if (consentStatus) {
    consentStatus.textContent = privacySettings.consentGiven ? t("status_yes") : t("status_no");
  }
  if (languageSelect && typeof populateLanguageOptions === "function") {
    populateLanguageOptions(languageSelect);
    languageSelect.value = pendingPreferences?.language || preferenceBaseline?.language || getCurrentLanguage();
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
    [currentInput, newInput, confirmInput].forEach((input) => {
      input.type = type;
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showSettingsToast("Password updated");
    form.reset();
    updateStrength();
    updateRequirements();
    updateMatch();
    updateSubmitState();
  });

  updateStrength();
  updateRequirements();
  updateMatch();
  updateSubmitState();
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
        window.location.href = "landing.html";
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
