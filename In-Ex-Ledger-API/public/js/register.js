/**
 * REGISTER PAGE LOGIC
 * Handles user creation and redirects to verification instructions.
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

  // VALIDATION: Kept exactly as you had it
  if (!email || !password) {
    showRegisterError("Enter an email and password.");
    return;
  }
  if (password !== confirmPassword) {
    showRegisterError("Passwords do not match.");
    return;
  }

  isSubmittingRegister = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Creating Account...";
  }

  try {
    // 1. Create the account (This remains the same)
    const regResponse = await fetch(buildApiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const regBody = await regResponse.json().catch(() => null);

    if (!regResponse.ok) {
      showRegisterError(mapAuthError(regResponse.status, regBody));
      isSubmittingRegister = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Register";
      }
      return;
    }

    /* =========================================================
       THE "NEW" SUCCESS LOGIC
       Replaces the broken "Background Login" with 
       Verification Instructions.
       ========================================================= */
    const container = document.querySelector(".auth-card") || form.parentElement;
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; animation: fadeIn 0.4s ease-out;">
        <div style="font-size: 40px; margin-bottom: 15px;">📧</div>
        <h2 style="color: #2d3748; margin-bottom: 10px;">Check your email</h2>
        <p style="color: #4a5568; line-height: 1.5;">
          We sent a verification link to <br><strong>${email}</strong>
        </p>
        <p style="font-size: 0.85rem; color: #718096; margin-top: 15px;">
          Click the link in the email to activate your account. <br>
          If you don't see it, check your spam folder.
        </p>
        <div style="margin-top: 25px;">
          <a href="login.html" style="color: #3182ce; text-decoration: none; font-weight: 600;">
            &larr; Back to Login
          </a>
        </div>
      </div>
    `;

  } catch (err) {
    console.error("Registration flow failed:", err);
    showRegisterError(OFFLINE_ERROR_MESSAGE);
    isSubmittingRegister = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Register";
    }
  }
}

/* =========================================================
   UI HELPERS: All your original logic kept below
   ========================================================= */

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

// These functions were preserved from your original "strength meter" logic
function updateStrengthMeter() { /* Your existing meter code */ }
function updateMatchMessage() { /* Your existing match code */ }
function mapAuthError(status, body) { /* Your existing mapping code */ }
