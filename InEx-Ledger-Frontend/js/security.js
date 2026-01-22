/* =========================================================
   Security Page JS
   ========================================================= */

// Security is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Security page loaded.");

  wireActions();
  wireShowPasswordToggle();
}

/* -------------------------
   Actions
   ------------------------- */

function wireActions() {
  // Logout action (if present on this page)
  const logoutBtn = document.querySelector('[data-action="logout"]');

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof signOut === "function") {
        signOut();
      } else {
        localStorage.removeItem("token");
        window.location.href = "landing.html";
      }
    });
  }

  // Other security links (change password, MFA, etc.)
  // navigate normally via <a href="">
}

function wireShowPasswordToggle() {
  const toggle = document.getElementById("showPasswordToggle");
  if (!toggle) {
    return;
  }
  const inputs = document.querySelectorAll(
    'input[data-security-password]'
  );

  toggle.addEventListener("change", () => {
    const type = toggle.checked ? "text" : "password";
    inputs.forEach((input) => {
      input.type = type;
    });
  });
}