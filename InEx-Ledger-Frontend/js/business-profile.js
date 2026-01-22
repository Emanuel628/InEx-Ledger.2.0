/* =========================================================
   Business Profile Page JS
   ========================================================= */

// Business Profile is a protected page
requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Business profile page loaded.");

  wireForm();
  wireTaxIdToggle();
  updateTaxIdentifierFields();
}

/* -------------------------
   Form handling (preliminary)
   ------------------------- */

function wireForm() {
  const form = document.querySelector("form");

  if (!form) {
    console.warn("Business profile form not found.");
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveBusinessProfile();
  });
}

function wireTaxIdToggle() {
  const toggle = document.getElementById("showIdentifiersToggle");
  const einInput = document.getElementById("businessEin");
  const bnInput = document.getElementById("businessBn");

  if (!toggle) return;

  updateTaxIdentifierFields();

  function getRegion() {
    const stored = localStorage.getItem("lb_region");
    return stored && stored.toLowerCase() === "ca" ? "CA" : "US";
  }

  function getActiveField() {
    return getRegion() === "CA" ? bnInput : einInput;
  }

  function maskField() {
    const field = getActiveField();
    if (field) field.type = "password";
  }

  function unmaskField() {
    const field = getActiveField();
    if (field) field.type = "text";
  }

  toggle.addEventListener("change", () => {
    if (toggle.checked) {
      unmaskField();
    } else {
      maskField();
    }
  });

  maskField();
  toggle.checked = false;

  window.addEventListener("storage", (e) => {
    if (e.key === "lb_region") {
      updateTaxIdentifierFields();
      maskField();
      toggle.checked = false;
    }
  });
}

function updateTaxIdentifierFields() {
  const region = getStoredRegion();
  document.querySelectorAll(".tax-region-field").forEach((node) => {
    if (node.getAttribute("data-region") === region) {
      node.removeAttribute("hidden");
    } else {
      node.setAttribute("hidden", "");
    }
  });
}

function getStoredRegion() {
  const stored = localStorage.getItem("lb_region");
  return stored && stored.toLowerCase() === "ca" ? "ca" : "us";
}

/* -------------------------
   Future hooks
   ------------------------- */

function saveBusinessProfile() {
  // Future: apiFetch("/business-profile", { method: "POST", body: ... })
  console.log("Saving business profile (preliminary).");
  alert("Business profile saved.");
}