/**
 * Register Page JS
 */

/* =========================================================
   Register Page JS — FINAL (ONE AND DONE)
   ========================================================= */

let form = null;
let registerErrorElement = null;
let isSubmittingRegister = false;
let languageSelect = null;
let countrySelect = null;
let tosConsentCheckbox = null;
let tosConsentMessage = null;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}
const OFFLINE_ERROR_MESSAGE = "login_error_offline";

document.addEventListener("DOMContentLoaded", () => {
  form = document.getElementById("registerForm");
  if (!form) {
    console.warn("Register form not found.");
    return;
  }

  registerErrorElement = document.getElementById("registerError");
  languageSelect = document.getElementById("languageSelectRegister");
  countrySelect = document.getElementById("countrySelectRegister");
  tosConsentCheckbox = document.getElementById("tosConsent");
  tosConsentMessage = document.getElementById("tosConsentMessage");
  hideRegisterError();

  if (languageSelect) {
    if (typeof populateLanguageOptions === "function") {
      populateLanguageOptions(languageSelect);
    } else {
      legacyPopulateLanguageOptions();
    }
    languageSelect.addEventListener("change", persistRegionAndLanguage);
  }

  if (countrySelect) {
    countrySelect.addEventListener("change", () => {
      const provinceField = document.getElementById("provinceField");
      if (provinceField) {
        if (countrySelect.value === "CA") {
          provinceField.removeAttribute("hidden");
        } else {
          provinceField.setAttribute("hidden", "");
        }
      }
      persistRegionAndLanguage();
    });

    // Initialize province field visibility based on the default country selection
    const provinceField = document.getElementById("provinceField");
    if (provinceField) {
      if (countrySelect.value === "CA") {
        provinceField.removeAttribute("hidden");
      } else {
        provinceField.setAttribute("hidden", "");
      }
    }
  }
  persistRegionAndLanguage();

  form.addEventListener("submit", handleRegisterSubmit);
  wireShowPasswordToggle(document);

  const passwordInput = form.querySelector("#password");
  const confirmInput = form.querySelector("#confirm-password");

  const runStrengthUpdate = () => {
    updateStrengthMeter();
    updateRequirementItems();
    updateMatchMessage();
  };

  passwordInput?.addEventListener("input", runStrengthUpdate);
  confirmInput?.addEventListener("input", updateMatchMessage);
  runStrengthUpdate();

  // Re-run dynamic text updates when language changes
  window.addEventListener("lunaLanguageChanged", () => {
    updateStrengthMeter();
    updateRequirementItems();
    updateMatchMessage();
  });
});

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (!form || isSubmittingRegister) {
    return;
  }

  const submitButton = form.querySelector("button[type=\"submit\"]");
  const email = document.getElementById("email")?.value.trim() || "";
  const password = document.getElementById("password")?.value || "";
  const confirmPassword = document.getElementById("confirm-password")?.value || "";

  hideRegisterError();
  if (!ensureConsent()) {
    return;
  }

  if (!email || !password) {
    showRegisterError(tx("register_error_missing_fields"));
    return;
  }

  if (!isValidEmail(email)) {
    showRegisterError(tx("register_alert_valid_email"));
    return;
  }

  if (confirmPassword !== password) {
    showRegisterError(tx("register_password_match_error"));
    return;
  }

  if (!meetsPasswordRequirements(password)) {
    showRegisterError(tx("register_password_requirements_error"));
    return;
  }

  isSubmittingRegister = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const country = countrySelect?.value || "US";
    const province = country === "CA"
      ? (document.getElementById("provinceSelectRegister")?.value || null)
      : null;

    const regResponse = await fetch(buildApiUrl("/api/auth/register"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, country, province })
    });

    const regBody = await regResponse.json().catch(() => null);

    if (!regResponse.ok) {
      showRegisterError(mapAuthError(regResponse.status, regBody));
      return;
    }

    persistRegionAndLanguage();
    await persistConsent();
    localStorage.setItem("pendingVerificationEmail", email);
    window.location.href = "/verify-email?email=sent";
  } catch (err) {
    console.error("Register request failed:", err);
    showRegisterError(tx(OFFLINE_ERROR_MESSAGE));
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

  registerErrorElement.textContent = message || "";
  registerErrorElement.hidden = !message;
}

function hideRegisterError() {
  showRegisterError("");
}

const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

function meetsPasswordRequirements(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    SPECIAL_CHAR_RE.test(password)
  );
}

function calculatePasswordScore(password) {
  let score = 0;

  // Each criterion builds on the previous: length is the baseline,
  // uppercase + digit indicate moderate complexity, and a special
  // character completes the backend-required "strong" password set.
  if (password.length >= 8) score++;
  if (score > 0 && /[A-Z]/.test(password) && /\d/.test(password)) score++;
  if (score > 1 && SPECIAL_CHAR_RE.test(password)) score++;

  return score;
}

function getStrengthLabel(score) {
  if (score >= 3) {
    return "Strong";
  }

  if (score >= 2) {
    return "Fair";
  }

  return "Weak";
}

function updateStrengthMeter() {
  const passwordInput = form.querySelector("#password");
  const strengthSegments = Array.from(document.querySelectorAll(".meter-segment"));
  const strengthText = document.getElementById("passwordStrengthText");

  if (!passwordInput || !strengthSegments.length || !strengthText) {
    return;
  }

  const score = calculatePasswordScore(passwordInput.value);

  if (!passwordInput.value) {
    strengthSegments.forEach((segment) => {
      segment.classList.remove("is-weak", "is-fair", "is-strong");
    });
    strengthText.textContent = "";
    strengthText.classList.remove("is-weak", "is-fair", "is-strong");
    return;
  }

  const label = getStrengthLabel(score);
  let color = "#b91c1c";
  let segmentClass = "is-weak";

  if (label === "Fair") {
    color = "#92600a";
    segmentClass = "is-fair";
  } else if (label === "Strong") {
    color = "#1a7a4a";
    segmentClass = "is-strong";
  }

  strengthSegments.forEach((segment, index) => {
    segment.classList.remove("is-weak", "is-fair", "is-strong");
    if (index < score) {
      segment.classList.add(segmentClass);
    }
  });
  const labelKey =
    label === "Strong"
      ? "register_strength_label_strong"
      : label === "Fair"
      ? "register_strength_label_good"
      : "register_strength_label_weak";
  strengthText.textContent = tx(labelKey);
  strengthText.classList.remove("is-weak", "is-fair", "is-strong");
  strengthText.classList.add(segmentClass);
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
    ? tx("register_password_match_success")
    : tx("register_password_match_error");
  matchMessage.classList.add(match ? "is-ok" : "is-bad");
}

function updateRequirementItems() {
  const passwordInput = form?.querySelector("#password");
  if (!passwordInput) return;

  const password = passwordInput.value;
  const rules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: SPECIAL_CHAR_RE.test(password)
  };

  document.querySelectorAll(".password-requirements [data-requirement]").forEach((item) => {
    const key = item.dataset.requirement;
    item.classList.toggle("is-met", rules[key] === true);
  });
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
      es: 'Español',
      fr: 'Français'
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
  const selectedRegion = (countrySelect?.value === "CA") ? "ca" : "us";
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

  const consentHint = document.getElementById("consentRequiredHint");

  if (!tosConsentCheckbox.checked) {
    if (consentHint) {
      consentHint.removeAttribute("hidden");
    }
    if (tosConsentMessage) {
      tosConsentMessage.textContent = "";
    }
    return false;
  }

  if (consentHint) {
    consentHint.setAttribute("hidden", "");
  }
  if (tosConsentMessage) {
    tosConsentMessage.textContent = "";
  }

  return true;
}

async function persistConsent() {
  const caslCheckbox = document.getElementById("caslConsent");
  const caslOptIn = caslCheckbox ? caslCheckbox.checked : false;

  if (
    typeof privacyService === "object" &&
    typeof privacyService.setPrivacySettings === "function"
  ) {
    await privacyService.setPrivacySettings({
      consentGiven: true,
      consentAt: new Date().toISOString(),
      termsVersion: "v1",
      privacyVersion: "v1",
      dataSharingOptOut: false,
      marketingEmailOptIn: caslOptIn
    });
  }
}
