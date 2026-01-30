/**
 * SHARED AUTH CONTRACT
 * This file MUST remain identical in:
 * - InEx-Ledger-Frontend
 * - In-Ex-Ledger-API/public
 *
 * Do NOT edit in only one bundle.
 * Always apply changes to BOTH.
 */

/* =========================================================
   Register Page JS
   ========================================================= */

let form = null;
let registerErrorElement = null;
let isSubmittingRegister = false;
const OFFLINE_ERROR_MESSAGE = "Unable to reach server. Check your connection and try again.";

document.addEventListener("DOMContentLoaded", () => {
  form = document.getElementById("registerForm");
  if (!form) {
    console.warn("Register form not found.");
    return;
  }

  registerErrorElement = document.getElementById("registerError");
  hideRegisterError();

  form.addEventListener("submit", handleRegisterSubmit);
  wireShowPasswordToggle(document);

  const passwordInput = form.querySelector("#password");
  const confirmInput = form.querySelector("#confirm-password");

  const runStrengthUpdate = () => {
    updateStrengthMeter();
    updateMatchMessage();
  };

  passwordInput?.addEventListener("input", runStrengthUpdate);
  confirmInput?.addEventListener("input", updateMatchMessage);
  runStrengthUpdate();
});

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (!form || isSubmittingRegister) {
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
const email = document.getElementById("email")?.value.trim() || "";
const password = document.getElementById("password")?.value || "";
const confirmPassword = document.getElementById("confirm-password")?.value || "";

hideRegisterError();

if (!email || !password) {
  showRegisterError("Enter an email and password.");
  return;
}

if (password !== confirmPassword) {
  showRegisterError("Passwords do not match.");
  return;
}

if (!isValidEmail(email)) {
  showRegisterError("Enter a valid email address.");
  return;
}

  isSubmittingRegister = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const regResponse = await fetch(buildApiUrl("/api/auth/register"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const regBody = await regResponse.json().catch(() => null);

    if (!regResponse.ok) {
      showRegisterError(mapAuthError(regResponse.status, regBody));
      return;
    }

    const loginResponse = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const loginBody = await loginResponse.json().catch(() => null);

    if (!loginResponse.ok) {
      showRegisterError("Account created, but automatic login failed. Please sign in.");
      window.location.href = "login.html";
      return;
    }

    if (!loginBody?.token) {
      showRegisterError("Account created, but no session was returned. Please sign in.");
      window.location.href = "login.html";
      return;
    }

    setToken(loginBody.token);
    window.location.href = "transactions.html";
  } catch (err) {
    console.error("Register request failed:", err);
    showRegisterError(OFFLINE_ERROR_MESSAGE);
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingRegister = false;
  }
}

function wireShowPasswordToggle(container = document) {
  const checkbox = container.querySelector("#togglePassword");
  if (!checkbox) {
    return;
  }

  const passwordInputs = [
    container.querySelector("#password"),
    container.querySelector("#confirm-password")
  ].filter(Boolean);

  const updateFieldTypes = () => {
    passwordInputs.forEach((input) => {
      input.type = checkbox.checked ? "text" : "password";
    });
  };

  checkbox.addEventListener("change", updateFieldTypes);
  updateFieldTypes();
}

function showRegisterError(message) {
  if (!registerErrorElement) {
    return;
  }

  registerErrorElement.textContent = message;
  registerErrorElement.style.display = message ? "block" : "none";
}

function hideRegisterError() {
  showRegisterError("");
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
      es: 'EspaÃ±ol',
      fr: 'FranÃ§ais'
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
