let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const GUIDED_SETUP_STEPS = new Set(["categories", "accounts", "transactions"]);
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  const valid = await requireValidSessionOrRedirect();
  if (valid === false || !getToken()) {
    return;
  }

  onboardingForm = document.getElementById("onboardingForm");
  onboardingMessage = document.getElementById("onboardingMessage");
  if (!onboardingForm) {
    return;
  }

  applyOnboardingStaticCopy();

  const profile = window.__LUNA_ME__ || null;
  if (profile?.onboarding?.completed) {
    window.location.href = resolveOnboardingDestination(profile);
    return;
  }

  hydrateOnboardingDefaults(profile);
  document.getElementById("onboardingRegion")?.addEventListener("change", syncProvinceField);
  window.addEventListener("lunaLanguageChanged", applyOnboardingStaticCopy);
  wireWorkTypeTiles();
  wireCustomAccountType();
  onboardingForm.addEventListener("submit", handleOnboardingSubmit);
});

function hydrateOnboardingDefaults(profile = {}) {
  const business = profile?.active_business || {};
  const onboardingData = profile?.onboarding?.data || {};

  const elBusinessName = document.getElementById("onboardingBusinessName");
  if (elBusinessName) elBusinessName.value = onboardingData.business_name || business.name || "";
  // business_type is always sole_proprietor for the freelancer fast-path
  const savedWorkType = onboardingData.work_type || "other";
  const elWorkType = document.getElementById("onboardingWorkType");
  if (elWorkType) elWorkType.value = savedWorkType;
  document.querySelectorAll(".work-tile").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.work === savedWorkType);
  });
  const elRegion = document.getElementById("onboardingRegion");
  if (elRegion) elRegion.value = onboardingData.region || business.region || "US";
  const elProvince = document.getElementById("onboardingProvince");
  if (elProvince) elProvince.value = onboardingData.province || business.province || "";

  const elStarterAccountType = document.getElementById("onboardingStarterAccountType");
  const elCustomAccountType = document.getElementById("onboardingCustomAccountType");
  if (elStarterAccountType) {
    const savedType = onboardingData.starter_account_type || "checking";
    const knownTypes = new Set(["checking", "savings", "credit_card", "cash", "loan"]);
    if (savedType && !knownTypes.has(savedType)) {
      // Previously saved custom type — restore the custom input
      elStarterAccountType.value = "custom";
      if (elCustomAccountType) {
        elCustomAccountType.hidden = false;
        elCustomAccountType.required = true;
        elCustomAccountType.value = savedType;
      }
    } else {
      elStarterAccountType.value = savedType;
    }
  }

  const elStarterAccountName = document.getElementById("onboardingStarterAccountName");
  if (elStarterAccountName) elStarterAccountName.value = onboardingData.starter_account_name || "";

  syncProvinceField();
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  if (!onboardingForm || onboardingSubmitting) {
    return;
  }

  const submitButton = onboardingForm.querySelector("button[type=\"submit\"]");
  const accountTypeSelect = document.getElementById("onboardingStarterAccountType")?.value || "";
  const customAccountTypeValue = document.getElementById("onboardingCustomAccountType")?.value.trim() || "";
  const effectiveAccountType = accountTypeSelect === "custom" ? customAccountTypeValue : accountTypeSelect;

  // Language was chosen during registration and persisted to localStorage.
  // The language select was removed from onboarding; read the saved value instead.
  const savedLanguage =
    (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : null) ||
    localStorage.getItem("lb_language") ||
    "en";

  const payload = {
    business_name: document.getElementById("onboardingBusinessName")?.value.trim() || "",
    work_type: document.getElementById("onboardingWorkType")?.value || "other",
    business_type: "sole_proprietor",
    region: document.getElementById("onboardingRegion")?.value || "US",
    province: document.getElementById("onboardingProvince")?.value || "",
    language: savedLanguage,
    starter_account_type: effectiveAccountType,
    starter_account_name: document.getElementById("onboardingStarterAccountName")?.value.trim() || ""
  };

  if (payload.region !== "CA") {
    payload.province = "";
  }
  if (payload.region === "CA" && !CA_PROVINCES.has(payload.province)) {
    setOnboardingMessage(tx("onboarding_error_province"));
    return;
  }
  if (accountTypeSelect === "custom" && !customAccountTypeValue) {
    setOnboardingMessage(tx("onboarding_error_custom_account_type") || "Please enter a name for your custom account type.");
    return;
  }

  setOnboardingMessage("");
  onboardingSubmitting = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await apiFetch("/api/me/onboarding", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = response ? await response.json().catch(() => null) : null;

    if (!response || !response.ok) {
      setOnboardingMessage(result?.error || tx("onboarding_error_finish"));
      return;
    }

    localStorage.setItem("lb_region", payload.region.toLowerCase());
    localStorage.setItem("region", payload.region);
    window.LUNA_REGION = payload.region.toLowerCase();
    if (typeof setCurrentLanguage === "function") {
      setCurrentLanguage(payload.language);
    }
    window.location.href =
      result?.redirect_to ||
      resolveOnboardingDestination({ onboarding: result?.onboarding || null });
  } catch (error) {
    console.error("Onboarding save failed:", error);
    setOnboardingMessage(tx("onboarding_error_finish"));
  } finally {
    submitButton?.removeAttribute("disabled");
    onboardingSubmitting = false;
  }
}

function wireWorkTypeTiles() {
  const tiles = document.querySelectorAll(".work-tile");
  const hidden = document.getElementById("onboardingWorkType");
  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      tiles.forEach((t) => t.classList.remove("is-selected"));
      tile.classList.add("is-selected");
      if (hidden) hidden.value = tile.dataset.work;
    });
  });
}

function setOnboardingMessage(message = "") {
  if (!onboardingMessage) {
    return;
  }
  onboardingMessage.textContent = message;
  onboardingMessage.hidden = !message;
}

function syncProvinceField() {
  const regionSelect = document.getElementById("onboardingRegion");
  const provinceField = document.getElementById("onboardingProvinceField");
  const provinceSelect = document.getElementById("onboardingProvince");
  const isCanada = regionSelect?.value === "CA";

  if (!provinceField || !provinceSelect) {
    return;
  }

  provinceField.hidden = !isCanada;
  provinceSelect.required = isCanada;
  if (!isCanada) {
    provinceSelect.value = "";
  }
}

function applyOnboardingStaticCopy() {
  const intro = document.querySelector(".onboarding-intro");
  intro?.querySelector("h1")?.replaceChildren(tx("onboarding_title"));
  intro?.querySelector("p")?.replaceChildren(tx("onboarding_intro_guided"));
  document.title = `InEx Ledger - ${tx("onboarding_page_title")}`;
}

function wireCustomAccountType() {
  const typeSelect = document.getElementById("onboardingStarterAccountType");
  const customInput = document.getElementById("onboardingCustomAccountType");
  if (!typeSelect || !customInput) return;

  typeSelect.addEventListener("change", () => {
    const isCustom = typeSelect.value === "custom";
    customInput.hidden = !isCustom;
    customInput.required = isCustom;
    if (!isCustom) customInput.value = "";
  });
}

function resolveOnboardingDestination(profile = {}) {
  const onboardingData = profile?.onboarding?.data || {};
  const guidedSetupStep = String(onboardingData.guided_setup_step || "").trim().toLowerCase();
  if (onboardingData.guided_setup_active && GUIDED_SETUP_STEPS.has(guidedSetupStep)) {
    return `/${guidedSetupStep}`;
  }

  const startFocus = String(onboardingData.start_focus || "").trim().toLowerCase();
  if (startFocus) {
    return `/${startFocus}`;
  }

  return "/transactions";
}
