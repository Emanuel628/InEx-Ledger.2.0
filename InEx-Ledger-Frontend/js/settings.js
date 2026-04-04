const REGION_DISPLAY = {
  us: "United States",
  ca: "Canada"
};

const SETTINGS_DEFAULT_THEME = typeof DEFAULT_THEME !== "undefined" ? DEFAULT_THEME : "light";
const SETTINGS_THEME_VERSION = typeof THEME_VERSION !== "undefined" ? THEME_VERSION : "2";
const BUSINESS_PROFILE_KEY = "lb_business_profile";
const SETTINGS_TOAST_MS = 3000;
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

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireSignOutButtons();
  initBusinessProfileForm();
  await initPreferences();
  initSecurityForm();
  initDangerZone();
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

  const savedRegion = localStorage.getItem("lb_region") || "us";
  const savedTheme = resolveSavedTheme();
  const savedDistance = localStorage.getItem("lb_unit_metric") === "true" ? "km" : "mi";

  if (regionSelect) {
    regionSelect.value = savedRegion;
    regionSelect.addEventListener("change", () => {
      const normalized = regionSelect.value === "ca" ? "ca" : "us";
      localStorage.setItem("lb_region", normalized);
      localStorage.setItem("region", normalized === "ca" ? "CA" : "US");
      window.LUNA_REGION = normalized;
      showSettingsToast(`Region updated to ${REGION_DISPLAY[normalized]}`);
    });
  }

  if (languageSelect && typeof populateLanguageOptions === "function") {
    populateLanguageOptions(languageSelect);
    languageSelect.value = typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en";
    languageSelect.addEventListener("change", () => {
      if (typeof setCurrentLanguage === "function") {
        setCurrentLanguage(languageSelect.value);
      }
      showSettingsToast("Language updated");
    });
  }

  if (darkModeToggle) {
    darkModeToggle.checked = savedTheme === "dark";
    darkModeToggle.addEventListener("change", () => {
      const nextTheme = darkModeToggle.checked ? "dark" : "light";
      localStorage.setItem("lb_theme", nextTheme);
      localStorage.setItem("lb_theme_version", SETTINGS_THEME_VERSION);
      document.documentElement.setAttribute("data-theme", nextTheme);
      showSettingsToast("Appearance updated");
    });
  }

  if (distanceSelect) {
    distanceSelect.value = savedDistance;
    distanceSelect.addEventListener("change", () => {
      localStorage.setItem("lb_unit_metric", String(distanceSelect.value === "km"));
      showSettingsToast("Distance unit updated");
    });
  }

  privacySettings = await getPrivacySettingsSafe();
  if (optOutToggle) {
    optOutToggle.checked = !!privacySettings.dataSharingOptOut;
    optOutToggle.addEventListener("change", async () => {
      await setPrivacySettingsSafe({ dataSharingOptOut: !!optOutToggle.checked });
      showSettingsToast("Privacy preference updated");
    });
  }

  if (consentStatus) {
    consentStatus.textContent = privacySettings.consentGiven ? "Yes" : "No";
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      if (typeof privacyService === "object" && typeof privacyService.exportMyData === "function") {
        await privacyService.exportMyData();
      }
      showSettingsToast("Data export started");
    });
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
    if (label === "Good") color = "#92600a";
    if (label === "Strong") color = "#1a7a4a";
    strengthMeter.style.width = `${score * 25}%`;
    strengthMeter.style.backgroundColor = color;
    strengthText.textContent = `${label} password`;
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
      matchMessage.textContent = "Passwords do not match";
      matchMessage.style.color = "#b91c1c";
    } else {
      matchMessage.textContent = "";
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

function getPasswordScore(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
  return score;
}

function getStrengthLabel(score) {
  if (score >= 4) return "Strong";
  if (score >= 2) return "Good";
  return "Weak";
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
      title.textContent = "Delete account permanently?";
      body.textContent = "This permanently removes your account and all associated data. This cannot be undone.";
      confirmWrap.classList.remove("hidden");
      confirmButton.disabled = true;
    } else {
      title.textContent = "Delete business data?";
      body.textContent = "This removes transactions, receipts, and mileage records. Your account and settings are kept.";
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
      ["lb_transactions", "lb_accounts", "lb_categories", "lb_transactions_upsell_hidden"].forEach((key) => localStorage.removeItem(key));
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
