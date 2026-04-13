/**
 * Login Page JS
 */

/* =========================================================
   Login Page JS
   ========================================================= */

let loginForm = null;
let loginErrorElement = null;
let isSubmittingLogin = false;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}
const OFFLINE_ERROR_MESSAGE = "login_error_offline";
const EXPIRED_SESSION_MESSAGE = "login_error_expired";
const AUTOFILL_CLEAR_DELAY_MS = 200;

redirectIfAuthenticated();

document.addEventListener("DOMContentLoaded", () => {
  loginForm = document.getElementById("loginForm");
  loginErrorElement = document.getElementById("loginError");

  if (!loginForm) {
    console.warn("Login form not found.");
    return;
  }

  loginForm.addEventListener("submit", handleLoginSubmit);
  wireShowPasswordToggle(document);
  showLoginReasonMessage();
  resetLoginFieldsIfNeeded();
});

window.addEventListener("pageshow", () => {
  resetLoginFieldsIfNeeded();
});

function resetLoginFieldsIfNeeded() {
  const shouldReset = typeof consumeLoginResetFlag === "function"
    ? consumeLoginResetFlag()
    : false;
  if (!shouldReset) {
    return;
  }
  clearLoginFields();
}

function clearLoginFields() {
  const form = loginForm || document.getElementById("loginForm");
  const emailField = document.getElementById("email");
  const passwordField = document.getElementById("password");
  const resetFieldValues = () => {
    if (emailField) {
      emailField.value = "";
    }
    if (passwordField) {
      passwordField.value = "";
    }
  };
  form?.reset();
  resetFieldValues();
  // Retry once to counter browser autofill that may run after initial load.
  window.setTimeout(resetFieldValues, AUTOFILL_CLEAR_DELAY_MS);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!loginForm || isSubmittingLogin) {
    return;
  }

  const submitButton = loginForm.querySelector("button[type=\"submit\"]");
  const email = document.getElementById("email")?.value.trim() || "";
  const password = document.getElementById("password")?.value || "";

  clearLoginError();

  if (!email || !password) {
    showLoginError(tx("login_error_missing_fields"));
    return;
  }

  if (!isValidEmail(email)) {
    showLoginError(tx("login_alert_valid_email"));
    return;
  }

  isSubmittingLogin = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      showLoginError(mapAuthError(response.status, data));
      return;
    }

    if (data?.mfa_required && data?.mfa_token) {
      sessionStorage.setItem("lb_pending_mfa_token", data.mfa_token);
      sessionStorage.setItem("lb_pending_mfa_email", email);
      window.location.href = "mfa-challenge";
      return;
    }

    if (!data?.token) {
      showLoginError(tx("login_error_generic"));
      return;
    }

    setToken(data.token);
    if (data?.subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(data.subscription);
    }
    window.location.href = "transactions";
  } catch (err) {
    console.error("Login request failed:", err);
    showLoginError(tx(OFFLINE_ERROR_MESSAGE));
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingLogin = false;
  }
}

function showLoginReasonMessage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  if (reason === "expired") {
    showLoginError(tx(EXPIRED_SESSION_MESSAGE));
  } else if (reason === "network") {
    showLoginError(tx(OFFLINE_ERROR_MESSAGE));
  } else if (params.get("verified") === "true") {
    showLoginMessage(tx("login_success_verified"), "is-success");
  } else if (params.get("email_changed") === "true") {
    showLoginMessage(tx("login_success_email_changed"), "is-success");
  }
}

function showLoginError(message) {
  showLoginMessage(message, message ? "is-error" : "");
}

function showLoginMessage(message, tone = "") {
  if (!loginErrorElement) {
    return;
  }
  loginErrorElement.textContent = message || "";
  loginErrorElement.hidden = !message;
  loginErrorElement.classList.remove("is-error", "is-success");
  if (tone) {
    loginErrorElement.classList.add(tone);
  }
}

function clearLoginError() {
  showLoginError("");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function wireShowPasswordToggle(container = document) {
  const toggle = container.querySelector(".show-password-toggle input[type=\"checkbox\"]");
  if (!toggle) {
    return;
  }

  const passwordField = container.querySelector("#password");
  if (!passwordField) {
    return;
  }

  toggle.addEventListener("change", () => {
    passwordField.type = toggle.checked ? "text" : "password";
  });
}
