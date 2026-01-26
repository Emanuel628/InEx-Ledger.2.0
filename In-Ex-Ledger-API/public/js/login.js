/* =========================================================
   Login Page JS
   ========================================================= */

const API_BASE = "https://inex-ledger20-production.up.railway.app";

redirectIfAuthenticated();

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) {
    console.warn("Login form not found.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email")?.value.trim() || "";
    const password = document.getElementById("password")?.value || "";

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    if (!isValidEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Login failed");
      return;
    }

    console.log("LOGIN SUCCESS RESPONSE:", data);
    console.log("TOKEN BEFORE setToken:", data.token);

    if (!data.token) {
      alert("Login failed: missing token");
      return;
    }
    setToken(data.token);
    console.log("TOKEN AFTER setToken:", localStorage.getItem("token"));

    window.location.href = "transactions.html";
  });

  wireShowPasswordToggle(document);
});

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
