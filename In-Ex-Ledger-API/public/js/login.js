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
   Login Page JS
   ========================================================= */

let loginForm = null;
let loginErrorElement = null;
let isSubmittingLogin = false;
const OFFLINE_ERROR_MESSAGE = "Unable to reach server. Check your connection and try again.";
const EXPIRED_SESSION_MESSAGE = "Your session expired. Please log in again.";

// Ensure we aren't already logged in
if (typeof redirectIfAuthenticated === "function") {
  redirectIfAuthenticated();
}

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
      // Use mapAuthError helper from auth.js if it exists
      const msg = (typeof mapAuthError === "function") 
        ? mapAuthError(response.status, data) 
        : (data?.message || "Login failed.");
      showLoginError(msg);
      return;
    }

    // Check for token in standard locations
    const token = data?.token || data?.accessToken;

    if (!token) {
      console.error("Login successful but no token received", data);
      showLoginError("Login failed. No session token received.");
      return;
    }

    setToken(token);
    window.location.href = "transactions.html";
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
  }
}

function showLoginError(message) {
  if (!loginErrorElement) {
    return;
  }
  loginErrorElement.textContent = message || "";
  loginErrorElement.hidden = !message;
  // Ensure visibility if it uses classes
  loginErrorElement.style.display = message ? "block" : "none";
}

function clearLoginError() {
  showLoginError("");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function wireShowPasswordToggle(container = document) {
  const checkbox = container.querySelector("#togglePassword");
  if (!checkbox) {
    return;
  }

  checkbox.addEventListener("change", () => {
    const passwordField = container.querySelector("#password");
    if (passwordField) {
      passwordField.type = checkbox.checked ? "text" : "password";
    }
  });
}
