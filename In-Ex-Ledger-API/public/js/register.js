/**
 * REGISTER PAGE LOGIC
 * Handles user creation and automatic session start.
 */

let form = null;
let registerErrorElement = null;
let isSubmittingRegister = false;
const OFFLINE_ERROR_MESSAGE = "Unable to reach server. Check your connection and try again.";

document.addEventListener("DOMContentLoaded", () => {
  form = document.getElementById("registerForm");
  if (!form) return;

  registerErrorElement = document.getElementById("registerError");
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
});

async function handleRegisterSubmit(event) {
  event.preventDefault();
  if (!form || isSubmittingRegister) return;

  const email = document.getElementById("email")?.value.trim() || "";
  const password = document.getElementById("password")?.value || "";
  const confirmPassword = document.getElementById("confirm-password")?.value || "";
  const submitButton = form.querySelector('button[type="submit"]');

  showRegisterError("");

  if (!email || !password) {
    showRegisterError("Enter an email and password.");
    return;
  }
  if (password !== confirmPassword) {
    showRegisterError("Passwords do not match.");
    return;
  }

  isSubmittingRegister = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    // 1. Create the account
    const regResponse = await fetch(buildApiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const regBody = await regResponse.json().catch(() => null);

    if (!regResponse.ok) {
      showRegisterError(mapAuthError(regResponse.status, regBody));
      isSubmittingRegister = false;
      submitButton?.removeAttribute("disabled");
      return;
    }

    // 2. Small delay to allow DB consistency on the server
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Background Login
    const loginResponse = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const loginBody = await loginResponse.json().catch(() => null);

    if (loginResponse.ok && (loginBody?.token || loginBody?.accessToken)) {
      setToken(loginBody.token || loginBody.accessToken);
      window.location.href = "transactions.html"; // Straight to the app!
    } else {
      // If auto-login fails, redirect to login page with a helpful message
      window.location.href = "login.html?reason=created";
    }
  } catch (err) {
    console.error("Registration flow failed:", err);
    showRegisterError(OFFLINE_ERROR_MESSAGE);
    isSubmittingRegister = false;
    submitButton?.removeAttribute("disabled");
  }
}

function showRegisterError(message) {
  if (!registerErrorElement) return;
  registerErrorElement.textContent = message;
  registerErrorElement.style.display = message ? "block" : "none";
}

function wireShowPasswordToggle(container) {
  const checkbox = container.querySelector("#togglePassword");
  if (!checkbox) return;
  checkbox.addEventListener("change", () => {
    const fields = container.querySelectorAll('input[type="password"], input[type="text"]');
    fields.forEach(f => {
      if (f.id === "password" || f.id === "confirm-password") {
        f.type = checkbox.checked ? "text" : "password";
      }
    });
  });
}

// ... strength meter and validation functions remain the same as previous
