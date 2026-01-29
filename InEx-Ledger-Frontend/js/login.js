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
      if (response.status === 401) {
        showLoginError("Invalid email or password.");
      } else {
        showLoginError(data?.error || "Login failed. Please try again.");
      }
      return;
    }

    if (!data?.token) {
      showLoginError("Login failed. Please try again.");
      return;
    }

    setToken(data.token);
    window.location.href = "transactions.html";
  } catch (err) {
    console.error("Login request failed:", err);
    showLoginError("Network error. Please try again.");
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingLogin = false;
  }
}

function showLoginError(message) {
  if (!loginErrorElement) {
    return;
  }
  loginErrorElement.textContent = message || "";
  loginErrorElement.hidden = !message;
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
