const REGION_DISPLAY = {
  us: "United States",
  ca: "Canada"
};

let privacySettings = {
  dataSharingOptOut: false,
  consentGiven: false
};

const DEFAULT_THEME = "light";
const THEME_VERSION = "2";
console.log("[AUTH] Protected page loaded:", window.location.pathname);

function resolveSavedTheme() {
  const storedVersion = localStorage.getItem("lb_theme_version");
  if (storedVersion !== THEME_VERSION) {
    localStorage.setItem("lb_theme", DEFAULT_THEME);
    localStorage.setItem("lb_theme_version", THEME_VERSION);
    return DEFAULT_THEME;
  }

  return localStorage.getItem("lb_theme") || DEFAULT_THEME;
}

let saveBarElement = null;
let saveButtonElement = null;
let hasPendingChanges = false;
let activeRegion = "us";
const SECURITY_REQUIREMENT_RULES = {
  length: (value) => value.length >= 8,
  number: (value) => /\d/.test(value),
  uppercase: (value) => /[A-Z]/.test(value),
  special: (value) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
};

let securityState = {};
console.log("Settings JS loaded");
document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");
  
  const signOutBtn = document.querySelector("[data-logout]");
console.log("Sign out button found:", signOutBtn);

  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      console.log("Sign out clicked");

      localStorage.removeItem("auth_token");
      localStorage.removeItem("lb_token");
      localStorage.removeItem("lb_user");

      sessionStorage.clear();

      clearToken();

      window.location.href = "login.html";
    });
  }
  
  const regionSelect = document.getElementById("regionSelectSettings");
  const languageSelect = document.getElementById("languageSelectSettings");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const unitToggle = document.getElementById("unitMetricToggle");
  const optOutToggle = document.getElementById("optOutToggle");
  const saveBar = document.getElementById("settingsSaveBar");
  const saveButton = document.getElementById("globalSaveBtn");
  const downloadBtn = document.getElementById("downloadMyDataBtn");
  const consentStatus = document.getElementById("consentStatus");

  saveBarElement = saveBar;
  saveButtonElement = saveButton;
  const savedRegion = localStorage.getItem("lb_region") || "us";
  const savedTheme = resolveSavedTheme();
  const savedMetric = localStorage.getItem("lb_unit_metric") === "true";

  document.documentElement.setAttribute("data-theme", savedTheme);

  if (regionSelect) {
    regionSelect.value = savedRegion;
    updateRegionFields(savedRegion);
    regionSelect.addEventListener("change", () => {
      const nextRegion = regionSelect.value === "ca" ? "ca" : "us";
      updateRegionFields(nextRegion);
      markDirty();
    });
  }

  if (languageSelect && typeof populateLanguageOptions === "function") {
    populateLanguageOptions(languageSelect);
    languageSelect.value = getCurrentLanguage();
    languageSelect.addEventListener("change", () => {
      if (typeof setCurrentLanguage === "function") {
        setCurrentLanguage(languageSelect.value);
      }
      markDirty();
    });
  }

  if (darkModeToggle) {
    darkModeToggle.checked = savedTheme === "dark";
    darkModeToggle.addEventListener("change", (event) => {
      const nextTheme = event.target.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", nextTheme);
      markDirty();
    });
  }

  if (unitToggle) {
    unitToggle.checked = savedMetric;
    unitToggle.addEventListener("change", markDirty);
  }

  await initPrivacyControls(optOutToggle, consentStatus, downloadBtn);

  if (optOutToggle) {
    optOutToggle.addEventListener("change", markDirty);
  }

  if (saveButton) {
    saveButton.addEventListener("click", async () => {
    await handleSave({
      regionSelect,
      languageSelect,
      darkModeToggle,
      unitToggle,
      optOutToggle
    });
    });
  }

  wireSecuritySection();
});

async function handleSave({
  regionSelect,
  languageSelect,
  darkModeToggle,
  unitToggle,
  optOutToggle
}) {
  if (saveButtonElement) {
    saveButtonElement.disabled = true;
  }

  const newRegion =
    regionSelect && regionSelect.value === "ca" ? "ca" : "us";
  persistRegionSelection(newRegion);
  updateRegionFields(newRegion);

  if (languageSelect && typeof setCurrentLanguage === "function") {
    setCurrentLanguage(languageSelect.value);
  }

  if (darkModeToggle) {
    const theme = darkModeToggle.checked ? "dark" : "light";
    localStorage.setItem("lb_theme", theme);
    localStorage.setItem("lb_theme_version", THEME_VERSION);
    document.documentElement.setAttribute("data-theme", theme);
  }

  if (unitToggle) {
    localStorage.setItem("lb_unit_metric", String(unitToggle.checked));
  }

  await syncPrivacySettings(optOutToggle?.checked);

  if (typeof t === "function") {
    window.alert(t("settings_changes_saved") || "Settings saved");
  } else {
    window.alert("Settings saved");
  }

  clearDirty();

  if (saveButtonElement) {
    saveButtonElement.disabled = false;
  }
}

function markDirty() {
  if (!saveBarElement || hasPendingChanges) {
    return;
  }
  hasPendingChanges = true;
  saveBarElement.classList.remove("hidden");
  if (saveButtonElement) {
    saveButtonElement.disabled = false;
  }
}

function clearDirty() {
  if (!saveBarElement) {
    return;
  }
  hasPendingChanges = false;
  saveBarElement.classList.add("hidden");
}

async function initPrivacyControls(
  optOutToggle,
  consentStatus,
  downloadBtn
) {
  let settings = {
    dataSharingOptOut: false,
    consentGiven: false
  };

  if (
    typeof privacyService === "object" &&
    typeof privacyService.getPrivacySettings === "function"
  ) {
    try {
      const fetched = await privacyService.getPrivacySettings();
      if (fetched) {
        settings = fetched;
      }
    } catch (error) {
      console.error("Failed to load privacy settings", error);
    }
  }

  privacySettings = settings;

  if (optOutToggle) {
    optOutToggle.checked = !!settings.dataSharingOptOut;
  }

  if (consentStatus) {
    consentStatus.textContent = settings.consentGiven
      ? t("status_yes")
      : t("status_no");
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      if (
        typeof privacyService === "object" &&
        typeof privacyService.exportMyData === "function"
      ) {
        await privacyService.exportMyData();
      }
    });
  }

}

async function syncPrivacySettings(optOutValue) {
  const normalized = !!optOutValue;
  if (
    typeof privacyService === "object" &&
    typeof privacyService.setPrivacySettings === "function"
  ) {
    try {
      await privacyService.setPrivacySettings({
        dataSharingOptOut: normalized
      });
      privacySettings.dataSharingOptOut = normalized;
    } catch (error) {
      console.error("Failed to save privacy settings", error);
    }
  } else {
    privacySettings.dataSharingOptOut = normalized;
  }
}

function persistRegionSelection(region) {
  const normalized = region === "ca" ? "ca" : "us";
  localStorage.setItem("lb_region", normalized);
  localStorage.setItem("region", normalized === "ca" ? "CA" : "US");
  localStorage.setItem("lb_region_override", "true");
  window.LUNA_REGION = normalized;
  const label = document.getElementById("detectedRegion");
  if (label) {
    label.textContent = REGION_DISPLAY[normalized] || "United States";
  }
}

function updateRegionFields(region) {
  const normalized = region === "ca" ? "ca" : "us";
  activeRegion = normalized;
  document.querySelectorAll("[data-region]").forEach((node) => {
    if (node.getAttribute("data-region") === normalized) {
      node.removeAttribute("hidden");
    } else {
      node.setAttribute("hidden", "");
    }
  });
}

function calculatePasswordScore(password) {
  let score = 0;

  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;

  return score;
}

function getStrengthLabel(score) {
  if (score >= 4) {
    return "Strong";
  }

  if (score >= 2) {
    return "Good";
  }

  return "Weak";
}

function wireSecuritySection() {
  const form = document.getElementById("securityForm");
  if (!form) {
    return;
  }

  const showToggle = document.getElementById("securityShowPasswordToggle");
  const newPasswordInput = document.getElementById("security-new-password");
  const confirmInput = document.getElementById("security-confirm-password");
  const currentInput = document.getElementById("security-current-password");
  const strengthMeter = document.getElementById("securityPasswordMeter");
  const strengthText = document.getElementById("securityPasswordStrengthText");
  const requirementItems = document.querySelectorAll(".password-requirements li");
  const matchMessage = document.getElementById("securityPasswordMatchMessage");
  const submitButton = document.getElementById("securitySaveButton");
  const changeEmailBtn = document.getElementById("changeEmailBtn");

  securityState = {
    form,
    showToggle,
    newPasswordInput,
    confirmInput,
    currentInput,
    strengthMeter,
    strengthText,
    requirementItems,
    matchMessage,
    submitButton
  };

  showToggle?.addEventListener("change", () => {
    const inputs = form.querySelectorAll('input[name="current-password"], input[name="new-password"], input[name="confirm-password"]');
    inputs.forEach((input) => {
      input.type = showToggle.checked ? "text" : "password";
    });
  });

  newPasswordInput?.addEventListener("input", () => {
    updateSecurityStrength();
    updateSecurityRequirements();
    updateSecurityMatch();
    updateSecuritySubmitState();
  });

  confirmInput?.addEventListener("input", () => {
    updateSecurityMatch();
    updateSecuritySubmitState();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSecuritySubmit();
  });

  changeEmailBtn?.addEventListener("click", () => {
    window.location.href = "change-email.html";
  });

  updateSecurityStrength();
  updateSecurityRequirements();
  updateSecurityMatch();
  updateSecuritySubmitState();
}

function handleSecuritySubmit() {
  const {
    currentInput,
    newPasswordInput,
    confirmInput
  } = securityState;

  const submitButton = securityState.submitButton;
  if (!currentInput || !newPasswordInput || !confirmInput || !submitButton) {
    return;
  }

  const currentVal = currentInput.value.trim();
  const newVal = newPasswordInput.value;
  const confirmVal = confirmInput.value;

  if (!currentVal || !newVal || !confirmVal) {
    window.alert("Please complete all password fields.");
    return;
  }

  if (!areSecurityRequirementsMet(newVal)) {
    window.alert("New password does not meet all requirements.");
    return;
  }

  if (newVal !== confirmVal) {
    window.alert("Passwords do not match.");
    return;
  }

  console.log("Security password change requested.");
  window.alert("Password updated.");
  submitButton.disabled = true;
}

function updateSecurityStrength() {
  const { newPasswordInput, strengthMeter, strengthText } = securityState;
  if (!newPasswordInput || !strengthMeter || !strengthText) return;

  const score = calculatePasswordScore(newPasswordInput.value);
  const label = getStrengthLabel(score);
  let color = "#ef4444";

  if (label === "Good") color = "#f97316";
  if (label === "Strong") color = "#22c55e";

  strengthMeter.style.width = `${score * 25}%`;
  strengthMeter.style.backgroundColor = color;
  const labelKey =
    label === "Strong"
      ? "register_strength_label_strong"
      : label === "Good"
      ? "register_strength_label_good"
      : "register_strength_label_weak";
  strengthText.textContent = `${t(labelKey)} password`;
  strengthText.style.color = color;
}

function updateSecurityRequirements() {
  const { newPasswordInput, requirementItems } = securityState;
  if (!newPasswordInput) return;
  requirementItems.forEach((item) => {
    const key = item.dataset.requirement;
    const rule = SECURITY_REQUIREMENT_RULES[key];
    if (!rule) return;
    item.classList.toggle("is-met", rule(newPasswordInput.value));
  });
}

function updateSecurityMatch() {
  const { newPasswordInput, confirmInput, matchMessage } = securityState;
  if (!newPasswordInput || !confirmInput || !matchMessage) return;
  const password = newPasswordInput.value;
  const confirm = confirmInput.value;
  if (!password || !confirm) {
    matchMessage.textContent = "";
    matchMessage.classList.remove("is-bad");
    return;
  }
  if (password !== confirm) {
    matchMessage.textContent = "Passwords do not match";
    matchMessage.classList.add("is-bad");
  } else {
    matchMessage.textContent = "";
    matchMessage.classList.remove("is-bad");
  }
}

function updateSecuritySubmitState() {
  const {
    newPasswordInput,
    confirmInput,
    submitButton
  } = securityState;
  if (!newPasswordInput || !confirmInput || !submitButton) return;
  const matches =
    newPasswordInput.value &&
    confirmInput.value &&
    newPasswordInput.value === confirmInput.value;
  submitButton.disabled = !(matches && areSecurityRequirementsMet(newPasswordInput.value));
}

function areSecurityRequirementsMet(password) {
  return Object.values(SECURITY_REQUIREMENT_RULES).every((rule) => rule(password));
}

function calculatePasswordScore(password) {
  let score = 0;

  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;

  return score;
}

function getStrengthLabel(score) {
  if (score >= 4) {
    return "Strong";
  }

  if (score >= 2) {
    return "Good";
  }

  return "Weak";
}
