/**
 * SHARED AUTH CONTRACT
 * This file MUST remain identical in:
 * - In-Ex-Ledger-API/public
 * - In-Ex-Ledger-API/public
 *
 * Do NOT edit in only one bundle.
 * Always apply changes to BOTH.
 */

/* =========================================================
   Login Page JS
   ========================================================= */

let loginForm = null;
let mfaForm = null;
let loginErrorElement = null;
let isSubmittingLogin = false;
let pendingMfaToken = "";
const OFFLINE_ERROR_MESSAGE = "Unable to reach server. Check your connection and try again.";
const EXPIRED_SESSION_MESSAGE = "Your session expired. Please log in again.";

redirectIfAuthenticated();

document.addEventListener("DOMContentLoaded", () => {
  loginForm = document.getElementById("loginForm");
  mfaForm = document.getElementById("mfaForm");
  loginErrorElement = document.getElementById("loginError");

  if (!loginForm) {
    console.warn("Login form not found.");
    return;
  }

  loginForm.addEventListener("submit", handleLoginSubmit);
  mfaForm?.addEventListener("submit", handleMfaSubmit);
  document.getElementById("mfaBackButton")?.addEventListener("click", resetMfaState);
  wireShowPasswordToggle(document);
  showLoginReasonMessage();
});

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
    showLoginError("Enter your email and password.");
    return;
  }

  if (!isValidEmail(email)) {
    showLoginError("Please enter a valid email address.");
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
      pendingMfaToken = data.mfa_token;
      enterMfaMode(email);
      return;
    }

    if (!data?.token) {
      showLoginError("Login failed. Please try again.");
      return;
    }

    setToken(data.token);
    if (data?.subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(data.subscription);
    }
    window.location.href = "transactions";
  } catch (err) {
    console.error("Login request failed:", err);
    showLoginError(OFFLINE_ERROR_MESSAGE);
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingLogin = false;
  }
}

function showLoginReasonMessage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  if (reason === "expired") {
    showLoginError(EXPIRED_SESSION_MESSAGE);
  } else if (reason === "network") {
    showLoginError(OFFLINE_ERROR_MESSAGE);
  } else if (params.get("verified") === "true") {
    showLoginError("Email verified. You can sign in now.");
    loginErrorElement.style.color = "#22c55e";
  } else if (params.get("email_changed") === "true") {
    showLoginError("Email updated. Please sign in with your new address.");
    loginErrorElement.style.color = "#22c55e";
  }
}

async function handleMfaSubmit(event) {
  event.preventDefault();
  if (!mfaForm || isSubmittingLogin || !pendingMfaToken) {
    return;
  }

  const submitButton = mfaForm.querySelector("button[type=\"submit\"]");
  const code = document.getElementById("mfaCode")?.value.trim() || "";

  clearLoginError();

  if (!code) {
    showLoginError("Enter your authenticator or recovery code.");
    return;
  }

  isSubmittingLogin = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/mfa/verify"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mfaToken: pendingMfaToken,
        code
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.token) {
      showLoginError(data?.error || "Unable to verify MFA code.");
      return;
    }

    setToken(data.token);
    if (data?.subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(data.subscription);
    }
    window.location.href = "transactions";
  } catch (err) {
    console.error("MFA verification failed:", err);
    showLoginError(OFFLINE_ERROR_MESSAGE);
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingLogin = false;
  }
}

function enterMfaMode(email) {
  if (loginForm) {
    loginForm.hidden = true;
  }
  if (mfaForm) {
    mfaForm.hidden = false;
  }
  const intro = document.getElementById("mfaIntro");
  if (intro) {
    intro.textContent = `Multi-factor authentication is enabled for ${email}. Enter the 6-digit code from your authenticator app or use a recovery code.`;
  }
  document.getElementById("mfaCode")?.focus();
  showLoginError("Multi-factor authentication required.");
}

function resetMfaState() {
  pendingMfaToken = "";
  document.getElementById("mfaCode")?.closest("form")?.reset();
  if (mfaForm) {
    mfaForm.hidden = true;
  }
  if (loginForm) {
    loginForm.hidden = false;
  }
  clearLoginError();
}

function showLoginError(message) {
  if (!loginErrorElement) {
    return;
  }
  loginErrorElement.textContent = message || "";
  loginErrorElement.hidden = !message;
  loginErrorElement.style.color = message ? "#b91c1c" : "";
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

  toggle.addEventListener("change", () => {
    const passwordField = container.querySelector('input[type="password"]');
    if (!passwordField) {
      return;
    }
    passwordField.type = toggle.checked ? "text" : "password";
  });
}

