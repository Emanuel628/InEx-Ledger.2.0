/* =========================================================
   Region Settings Page JS
   ========================================================= */

requireAuth();

init();

function init() {
  loadRegionSettings();
  wireForm();
}

async function loadRegionSettings() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) return;
    const business = await response.json();

    const regionInputs = document.querySelectorAll('input[name="region"]');
    regionInputs.forEach((input) => {
      if (input.value === business.region) input.checked = true;
    });

    const provinceSelect = document.getElementById("province");
    if (provinceSelect && business.province) {
      provinceSelect.value = business.province;
    }

    toggleProvinceField(business.region);
  } catch (err) {
    console.error("Failed to load region settings:", err);
  }
}

function wireForm() {
  const form = document.querySelector("form");
  if (!form) return;

  const regionInputs = document.querySelectorAll('input[name="region"]');
  regionInputs.forEach((input) => {
    input.addEventListener("change", () => toggleProvinceField(input.value));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveRegionSettings(form);
  });
}

function toggleProvinceField(region) {
  const provinceField = document.getElementById("provinceField");
  if (provinceField) {
    provinceField.hidden = region !== "CA";
  }
}

async function saveRegionSettings(form) {
  const selectedRegion = form.querySelector('input[name="region"]:checked')?.value;
  const provinceSelect = form.querySelector("#province");
  const province = selectedRegion === "CA" ? (provinceSelect?.value || null) : null;

  if (!selectedRegion) {
    alert("Please select a region.");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await apiFetch("/api/business", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region: selectedRegion, province })
    });

    if (response && response.ok) {
      localStorage.setItem("lb_region", selectedRegion.toLowerCase());
      alert("Region settings saved.");
    } else {
      alert("Failed to save region settings.");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
