/* =========================================================
   Fiscal Settings Page JS
   ========================================================= */

// Fiscal Settings is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Fiscal settings page loaded.");

  wireForm();
}

/* -------------------------
   Form handling (preliminary)
   ------------------------- */

function wireForm() {
  const form = document.querySelector("form");

  if (!form) {
    console.warn("Fiscal settings form not found.");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveFiscalSettings();
  });
}

/* -------------------------
   Future hooks
   ------------------------- */

function saveFiscalSettings() {
  // Future: apiFetch("/settings/fiscal", { method: "POST", body: ... })
  console.log("Saving fiscal settings (preliminary).");
  alert("Fiscal settings saved.");
}