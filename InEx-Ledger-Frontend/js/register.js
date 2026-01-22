/* =========================================================
   Register Page JS — FINAL (ONE AND DONE)
   ========================================================= */

let form;
let tosConsentCheckbox;
let tosConsentMessage;
let regionSelect;
let languageSelect;

document.addEventListener("DOMContentLoaded", initRegister);

function initRegister() {
  if (typeof redirectIfAuthenticated === "function") {
    redirectIfAuthenticated();
  }

  form = document.querySelector("form");
  tosConsentCheckbox = document.getElementById("tosConsent");
  tosConsentMessage = document.getElementById("tosConsentMessage");
  regionSelect = document.getElementById("regionSelectRegister");
  languageSelect = document.getElementById("languageSelectRegister");

  const savedRegionPreference = localStorage.getItem("lb_region") || "us";
  if (regionSelect) {
    regionSelect.value = savedRegionPreference;
  }

  if (languageSelect && typeof populateLanguageOptions === "function") {
    populateLanguageOptions(languageSelect);
  } else if (languageSelect) {
    legacyPopulateLanguageOptions();
  }

  if (languageSelect && typeof getCurrentLanguage === "function") {
    languageSelect.value = getCurrentLanguage();
    languageSelect.addEventListener("change", () => {
      if (typeof setCurrentLanguage === "function") {
        setCurrentLanguage(languageSelect.value);
      } else if (typeof applyTranslations === "function") {
        applyTranslations(languageSelect.value);
      }
    });
  }

  if (!form) {
    console.warn("Register form not found.");
    return;
  }

  if (tosConsentCheckbox) {
    tosConsentCheckbox.addEventListener("change", () => {
      if (tosConsentMessage) {
        tosConsentMessage.textContent = "";
      }
    });
  }

  const passwordInput = form.querySelector("#password");
  const confirmInput = form.querySelector("#confirm-password");
  const togglePassword = document.getElementById("togglePassword");

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("change", () => {
      const type = togglePassword.checked ? "text" : "password";
      passwordInput.type = type;
      if (confirmInput) {
        confirmInput.type = type;
      }
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      updateStrengthMeter();
      updateMatchMessage();
    });
  }

  if (confirmInput) {
    confirmInput.addEventListener("input", updateMatchMessage);
  }

  form.addEventListener("submit", onRegisterSubmit);

  updateStrengthMeter();
  updateMatchMessage();

  console.log("[register] wired match + language");
}

async function onRegisterSubmit(event) {
  event.preventDefault();

  const inputs = form.querySelectorAll("input");

  let email = "";
  let password = "";
  let confirm = "";

  inputs.forEach((input) => {
    if (input.type === "email") email = input.value.trim();
    if (input.type === "password" && !password) password = input.value;
    else if (input.type === "password") confirm = input.value;
  });

  if (!email || !password || !confirm) {
    alert(t("register_alert_fill_fields"));
    return;
  }

  if (!isValidEmail(email)) {
    alert(t("register_alert_valid_email"));
    return;
  }

  if (password.length < 8) {
    alert(t("register_alert_password_length"));
    return;
  }

  const strengthScore = calculatePasswordScore(password);
  const strengthLabel = getStrengthLabel(strengthScore);

  if (strengthLabel !== "Strong" || password !== confirm) {
    alert(
      t("register_alert_password_strength")
    );
    return;
  }

  if (!ensureConsent()) {
    return;
  }

  const sessionToken = "session-token-" + Date.now();

  if (typeof setToken === "function") {
    setToken(sessionToken);
  } else {
    localStorage.setItem("token", sessionToken);
  }

  if (typeof startTrial === "function") {
    startTrial();
  }

  await persistConsent();
  persistRegionAndLanguage();

  localStorage.setItem("pendingVerificationEmail", email);
  localStorage.removeItem("pendingVerificationToken");
  localStorage.removeItem("pendingVerificationLink");
  localStorage.removeItem("pendingVerificationExpires");

  window.location.href = "verify-email.html";
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

function updateStrengthMeter() {
  const passwordInput = form.querySelector("#password");
  const strengthMeter = document.getElementById("passwordMeter");
  const strengthText = document.getElementById("passwordStrengthText");

  if (!passwordInput || !strengthMeter || !strengthText) {
    return;
  }

  const score = calculatePasswordScore(passwordInput.value);
  const label = getStrengthLabel(score);
  let color = "#ef4444";

  if (label === "Good") {
    color = "#f97316";
  } else if (label === "Strong") {
    color = "#22c55e";
  }

  strengthMeter.style.width = `${score * 25}%`;
  strengthMeter.style.backgroundColor = color;
  const labelKey =
    label === "Strong"
      ? "register_strength_label_strong"
      : label === "Good"
      ? "register_strength_label_good"
      : "register_strength_label_weak";
  strengthText.textContent = t(labelKey);
  strengthText.style.color = color;
}

function updateMatchMessage() {
  const passwordInput = form.querySelector("#password");
  const confirmInput = form.querySelector("#confirm-password");
  const matchMessage = document.getElementById("passwordMatchMessage");

  if (!passwordInput || !confirmInput || !matchMessage) {
    return;
  }

  const password = passwordInput.value;
  const confirm = confirmInput.value;

  matchMessage.classList.remove("is-ok", "is-bad");

  if (!password || !confirm) {
    matchMessage.textContent = "";
    return;
  }

  const match = password === confirm;
  matchMessage.textContent = match
    ? t("register_password_match_success")
    : t("register_password_match_error");
  matchMessage.classList.add(match ? "is-ok" : "is-bad");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function legacyPopulateLanguageOptions() {
  if (!languageSelect) return;

  const labels =
    window.LUNA_LANGUAGE_LABELS ||
    {
      en: 'English',
      es: 'Espa�ol',
      fr: 'Fran�ais'
    };
  const languages =
    (window.LUNA_I18N && window.LUNA_I18N.LANGUAGES) ||
    Object.keys(labels);
  const savedLanguage = window.LUNA_LANGUAGE || 'en';

  languageSelect.innerHTML = '';
  languages.forEach((code) => {
    if (!labels[code]) return;
    const option = document.createElement('option');
    option.value = code;
    option.textContent = labels[code];
    if (code === savedLanguage) {
      option.selected = true;
    }
    languageSelect.appendChild(option);
  });
}

function persistRegionAndLanguage() {
  const selectedRegion = regionSelect && regionSelect.value ? regionSelect.value : "us";
  const selectedLanguage =
    (languageSelect && languageSelect.value) ||
    (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en");

  localStorage.setItem("lb_region", selectedRegion);
  window.LUNA_REGION = selectedRegion;
  const fallbackRegion = selectedRegion === "ca" ? "CA" : "US";
  localStorage.setItem("region", fallbackRegion);

  if (typeof setCurrentLanguage === "function") {
    setCurrentLanguage(selectedLanguage);
  } else {
    localStorage.setItem("lb_language", selectedLanguage);
    window.LUNA_LANGUAGE = selectedLanguage;
    if (typeof applyTranslations === "function") {
      applyTranslations();
    }
  }
}

function ensureConsent() {
  if (!tosConsentCheckbox) {
    return true;
  }

  if (!tosConsentCheckbox.checked) {
    if (tosConsentMessage) {
      tosConsentMessage.textContent = t("register_consent_error");
    }
    return false;
  }

  if (tosConsentMessage) {
    tosConsentMessage.textContent = "";
  }

  return true;
}

async function persistConsent() {
  if (
    typeof privacyService === "object" &&
    typeof privacyService.setPrivacySettings === "function"
  ) {
    await privacyService.setPrivacySettings({
      consentGiven: true,
      consentAt: new Date().toISOString(),
      termsVersion: "v1",
      privacyVersion: "v1",
      dataSharingOptOut: false
    });
  }
}