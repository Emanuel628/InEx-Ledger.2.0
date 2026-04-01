/* =========================================================
   Fiscal Settings Page JS
   ========================================================= */

requireAuth();

init();

function init() {
  loadFiscalSettings();
  wireForm();
}

async function loadFiscalSettings() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) return;
    const business = await response.json();
    const dateInput = document.querySelector('input[type="date"]');
    if (dateInput && business.fiscal_year_start) {
      const currentYear = new Date().getFullYear();
      dateInput.value = `${currentYear}-${business.fiscal_year_start}`;
    }
  } catch (err) {
    console.error("Failed to load fiscal settings:", err);
  }
}

function wireForm() {
  const form = document.querySelector("form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveFiscalSettings(form);
  });
}

async function saveFiscalSettings(form) {
  const dateInput = form.querySelector('input[type="date"]');
  const value = dateInput?.value || "";
  // Store as MM-DD from full date
  const fiscal_year_start = value ? value.slice(5) : null;

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await apiFetch("/api/business", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscal_year_start })
    });

    if (response && response.ok) {
      alert("Fiscal settings saved.");
    } else {
      alert("Failed to save fiscal settings.");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
