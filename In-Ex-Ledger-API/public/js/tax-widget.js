requireAuthAndTier("v1");

const TAX_REGION_KEY = "lb_region";
const TAX_PROVINCE_KEY = "lb_province";
const CA_PROVINCE_NAMES = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon"
};

function wireTaxWidget() {
  const regionSelect = document.getElementById("taxWidgetRegion");
  const provinceSelect = document.getElementById("taxWidgetProvince");
  const rateInput = document.getElementById("taxWidgetRate");
  const note = document.getElementById("taxWidgetNote");
  const controls = document.querySelectorAll("[data-tax-control]");

  if (!regionSelect || !provinceSelect || !rateInput || !note || !controls.length) {
    return;
  }

  const initialState = readCurrentTaxState();
  populateProvinceOptions(regionSelect.value || initialState.region, provinceSelect);
  applyStateToWidget(initialState, { regionSelect, provinceSelect, rateInput, note });

  regionSelect.addEventListener("change", () => {
    populateProvinceOptions(regionSelect.value, provinceSelect);
    updatePreview({ regionSelect, provinceSelect, rateInput, note });
  });

  provinceSelect.addEventListener("change", () => {
    updatePreview({ regionSelect, provinceSelect, rateInput, note });
  });

  controls.forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      if (!ensureV1TaxWidget()) return;

      if (control.dataset.taxControl === "reset") {
        persistTaxState(initialState);
        applyStateToWidget(initialState, { regionSelect, provinceSelect, rateInput, note });
        updateWidgetMessage(note, "Restored the current app tax settings.");
        return;
      }

      const state = readWidgetState({ regionSelect, provinceSelect });
      persistTaxState(state);
      applyStateToWidget(state, { regionSelect, provinceSelect, rateInput, note });
      updateWidgetMessage(note, "Tax assumptions saved for this session.");
    });
  });
}

function ensureV1TaxWidget() {
  if (typeof effectiveTier === "function" && effectiveTier() !== "v1") {
    window.location.href = "upgrade";
    return false;
  }
  return true;
}

function readCurrentTaxState() {
  const region = normalizeRegion(localStorage.getItem(TAX_REGION_KEY) || window.LUNA_REGION || "us");
  const province = normalizeProvince(localStorage.getItem(TAX_PROVINCE_KEY) || window.LUNA_PROVINCE || "");
  return { region, province };
}

function readWidgetState({ regionSelect, provinceSelect }) {
  const region = normalizeRegion(regionSelect?.value || "us");
  const province = normalizeProvince(region === "CA" ? provinceSelect?.value || "" : "");
  return { region, province };
}

function applyStateToWidget(state, nodes) {
  const { regionSelect, provinceSelect, rateInput, note } = nodes;
  regionSelect.value = state.region;
  populateProvinceOptions(state.region, provinceSelect, state.province);

  const profile = resolveTaxProfile(state.region, state.province);
  rateInput.value = formatTaxRate(profile.rate, profile.province);

  if (state.region === "CA") {
    note.textContent = state.province
      ? `${profile.provinceName} selected.`
      : "Choose a province or territory to preview Canada's combined tax estimate.";
  } else {
    note.textContent = "Using the U.S. default estimate.";
  }
}

function updatePreview(nodes) {
  const state = readWidgetState(nodes);
  applyStateToWidget(state, nodes);
}

function updateWidgetMessage(note, message) {
  if (note) {
    note.textContent = message;
  }
}

function populateProvinceOptions(region, provinceSelect, preferredProvince = "") {
  const normalizedRegion = normalizeRegion(region);
  provinceSelect.innerHTML = "";

  if (normalizedRegion !== "CA") {
    provinceSelect.disabled = true;
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Not required for U.S. estimates";
    provinceSelect.appendChild(option);
    provinceSelect.value = "";
    return;
  }

  provinceSelect.disabled = false;
  Object.entries(CA_PROVINCE_NAMES).forEach(([code, label]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} - ${label}`;
    provinceSelect.appendChild(option);
  });

  const nextProvince = normalizeProvince(preferredProvince || localStorage.getItem(TAX_PROVINCE_KEY) || "ON");
  provinceSelect.value = nextProvince in CA_PROVINCE_NAMES ? nextProvince : "ON";
}

function persistTaxState(state) {
  const normalized = {
    region: normalizeRegion(state.region),
    province: normalizeProvince(state.region === "CA" ? state.province : "")
  };

  localStorage.setItem(TAX_REGION_KEY, normalized.region.toLowerCase());
  if (normalized.province) {
    localStorage.setItem(TAX_PROVINCE_KEY, normalized.province);
  } else {
    localStorage.removeItem(TAX_PROVINCE_KEY);
  }

  window.LUNA_REGION = normalized.region.toLowerCase();
  window.LUNA_PROVINCE = normalized.province;
  if (typeof applyRegionHardening === "function") {
    applyRegionHardening(normalized.region, normalized.province);
  }
  window.dispatchEvent(new CustomEvent("lunaRegionChanged", { detail: normalized.region.toLowerCase() }));
  window.dispatchEvent(new CustomEvent("lunaTaxAssumptionsChanged", { detail: normalized }));
}

function resolveTaxProfile(region, province) {
  const helpers = window.LUNA_TAX || {};
  const resolver = helpers.resolveEstimatedTaxProfile || ((r, p) => ({
    region: normalizeRegion(r),
    province: normalizeProvince(p),
    rate: normalizeRegion(r) === "CA" ? 0.05 : 0.24
  }));
  const profile = resolver(region, province);
  return {
    region: normalizeRegion(profile.region),
    province: normalizeProvince(profile.province),
    rate: Number(profile.rate || 0),
    provinceName: CA_PROVINCE_NAMES[normalizeProvince(profile.province)] || normalizeProvince(profile.province) || "Canada"
  };
}

function formatTaxRate(rate, province) {
  const helpers = window.LUNA_TAX || {};
  const formatter = helpers.formatEstimatedTaxPercent || ((value, prov = "") => `${(Number(value || 0) * 100).toFixed(normalizeProvince(prov) === "QC" ? 3 : 0)}%`);
  return formatter(rate, province);
}

function normalizeRegion(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "CA" || raw === "CANADA" ? "CA" : "US";
}

function normalizeProvince(value) {
  return String(value || "").trim().toUpperCase();
}

document.addEventListener("DOMContentLoaded", wireTaxWidget);
