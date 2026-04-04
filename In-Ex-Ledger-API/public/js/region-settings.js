/* =========================================================
   Region Settings Page JS
   ========================================================= */

// Region Settings is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Region settings page loaded.");

  wireForm();
}

/* -------------------------
   Form handling (preliminary)
   ------------------------- */

function wireForm() {
  const form = document.querySelector("form");

  if (!form) {
    console.warn("Region settings form not found.");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveRegionSettings();
  });
}

/* -------------------------
   Future hooks
   ------------------------- */

function saveRegionSettings() {
  // Future: apiFetch("/settings/region", { method: "POST", body: ... })
  console.log("Saving region settings (preliminary).");
  alert("Region settings saved.");
}