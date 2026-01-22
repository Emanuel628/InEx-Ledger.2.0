/* =========================================================
   Forgot Password Page JS
   ========================================================= */

// Public page — no auth required

init();

function init() {
  console.log("Forgot password page loaded.");

  const form = document.querySelector("form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    requestPasswordReset();
  });
}

function requestPasswordReset() {
  // Future: apiFetch("/auth/forgot-password")
  alert("Password reset link sent if the email exists.");
}