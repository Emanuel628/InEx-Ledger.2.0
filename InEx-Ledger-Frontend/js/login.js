/* =========================================================
   Login Page JS
   ========================================================= */

// If already logged in, skip login
redirectIfAuthenticated();

(async () => {
  const region = localStorage.getItem("region") || (await detectRegion());
  const banner = document.getElementById("canadaTestBanner");

  if (banner && region === "CA") {
    banner.textContent = "Hi, Kimberly in Canada 👋";
    banner.style.display = "block";
  }
})();

// Grab the form
const form = document.querySelector("form");

if (!form) {
  console.warn("Login form not found.");
} else {
  const passwordInput = form.querySelector('input[type="password"]');
  const togglePassword = document.getElementById("togglePassword");

  if (passwordInput && togglePassword) {
    togglePassword.addEventListener("change", () => {
      passwordInput.type = togglePassword.checked ? "text" : "password";
    });
  }

  form.addEventListener("submit", onLoginSubmit);
}

function onLoginSubmit(event) {
  event.preventDefault();

  const emailInput = form.querySelector('input[type="email"]');
  const passwordInput = form.querySelector('input[type="password"]');

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  // Basic validation
  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  if (!isValidEmail(email)) {
    alert("Please enter a valid email address.");
    return;
  }

  // -------------------------------------------------
  // Client stand-in: simulate login success
  // -------------------------------------------------
  // Replace with apiFetch("/auth/login") once the backend is wired.
  const sessionToken = "session-token-" + Date.now();

  setToken(sessionToken);

  // Redirect to main dashboard
  window.location.href = "transactions.html";
}

/* -------------------------
   Helpers
   ------------------------- */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}