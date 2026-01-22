/* =========================================================
   Reset Password Page JS
   ========================================================= */

// Public page — token-based, not session-based

init();

function init() {
  console.log("Reset password page loaded.");

  const form = document.querySelector("form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    resetPassword();
  });
}

function resetPassword() {
  // Future: apiFetch("/auth/reset-password")
  alert("Password has been reset.");
}