/**
 * LOGIN PAGE LOGIC
 * Authenticates existing users.
 */

let loginForm = null;
let loginErrorElement = null;
let isSubmittingLogin = false;

document.addEventListener("DOMContentLoaded", () => {
  loginForm = document.getElementById("loginForm");
  loginErrorElement = document.getElementById("loginError");

  if (!loginForm) return;

  loginForm.addEventListener("submit", handleLoginSubmit);
  wireShowPasswordToggle(document);
  
  // Show specialized messages if redirected from Register
  const params = new URLSearchParams(window.location.search);
  if (params.get("reason") === "created") {
    showLoginError("Account created! Please sign in to verify your session.");
    loginErrorElement.style.color = "#22c55e"; // Green for success
  }
});

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (isSubmittingLogin) return;

  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');

  showLoginError("");

  isSubmittingLogin = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      showLoginError(mapAuthError(response.status, data));
      return;
    }

    // Check for token OR accessToken
    const token = data?.token || data?.accessToken;

    if (!token) {
      showLoginError("Server didn't provide a session. Contact support.");
      return;
    }

    setToken(token);
    window.location.href = "transactions.html";
  } catch (err) {
    showLoginError("Connection failed. Please check your internet.");
  } finally {
    isSubmittingLogin = false;
    submitButton?.removeAttribute("disabled");
  }
}

function showLoginError(msg) {
  if (!loginErrorElement) return;
  loginErrorElement.textContent = msg;
  loginErrorElement.hidden = !msg;
  loginErrorElement.style.display = msg ? "block" : "none";
}

function wireShowPasswordToggle(container) {
  const toggle = container.querySelector("#togglePassword");
  if (!toggle) return;
  toggle.addEventListener("change", () => {
    const pw = container.querySelector("#password");
    if (pw) pw.type = toggle.checked ? "text" : "password";
  });
}
