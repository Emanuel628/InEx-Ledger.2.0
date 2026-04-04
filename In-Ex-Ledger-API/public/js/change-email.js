/* =========================================================
   Change Email Page JS
   ========================================================= */

// Change Email is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Change email page loaded.");

  wireForm();
}

/* -------------------------
   Form handling (preliminary)
   ------------------------- */

function wireForm() {
  const form = document.querySelector("form");

  if (!form) {
    console.warn("Change email form not found.");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleChangeEmail();
  });
}

/* -------------------------
   Behavior (preliminary)
   ------------------------- */

function handleChangeEmail() {
  const emailInput = document.querySelector('input[type="email"]');

  const email = emailInput ? emailInput.value.trim() : "";

  if (!email) {
    alert("Please enter a new email address.");
    return;
  }

  if (!isValidEmail(email)) {
    alert("Please enter a valid email address.");
    return;
  }

  localStorage.setItem("pendingVerificationEmail", email);

  alert("Email updated. Please verify your new email address.");
  console.log("Email change requested (preliminary):", email);
  return;

  // Future: apiFetch("/security/change-email", { method: "POST", body: ... })
}

/* -------------------------
   Helpers
   ------------------------- */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}