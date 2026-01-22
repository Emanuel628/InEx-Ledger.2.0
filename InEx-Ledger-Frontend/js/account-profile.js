/* =========================================================
   Account Profile Page JS
   ========================================================= */

// Account Profile is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Account profile page loaded.");

  wireForm();
}

/* -------------------------
   Form handling (preliminary)
   ------------------------- */

function wireForm() {
  const form = document.querySelector("form");

  if (!form) {
    console.warn("Account profile form not found.");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveAccountProfile();
  });
}

/* -------------------------
   Future hooks
   ------------------------- */

function saveAccountProfile() {
  // Future: apiFetch("/account-profile", { method: "POST", body: ... })
  console.log("Saving account profile (preliminary).");
  alert("Account profile saved.");
}