let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
let onboardingAccountNameTouched = false;
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const GUIDED_SETUP_STEPS = new Set(["categories", "accounts", "transactions"]);
const STARTER_ACCOUNT_NAME_PRESETS = {
  checking: { US: "Primary Checking", CA: "Primary Chequing" },
  savings: { US: "Business Savings", CA: "Business Savings" },
  credit_card: { US: "Business Card", CA: "Business Card" },
  cash: { US: "Cash", CA: "Cash" },
  loan: { US: "Business Loan", CA: "Business Loan" }
};

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
  document.getElementById("onboardingRegion")?.addEventListener("change", syncOnboardingPreview);
  document.getElementById("onboardingStarterAccountType")?.addEventListener("change", syncStarterAccountName);
  document.getElementById("onboardingStarterAccountName")?.addEventListener("input", () => {
    onboardingAccountNameTouched = true;
    updateOnboardingPlanPreview();
  });
  window.addEventListener("lunaLanguageChanged", applyOnboardingStaticCopy);
  onboardingForm.addEventListener("submit", handleOnboardingSubmit);
});

function hydrateOnboardingDefaults(profile = {}) {
  const business = profile?.active_business || {};
  const onboardingData = profile?.onboarding?.data || {};

  const elBusinessName = document.getElementById("onboardingBusinessName");
  if (elBusinessName) elBusinessName.value = onboardingData.business_name || business.name || "";

  const elRegion = document.getElementById("onboardingRegion");
  if (elRegion) elRegion.value = onboardingData.region || business.region || "US";
  const elProvince = document.getElementById("onboardingProvince");
  if (elProvince) elProvince.value = onboardingData.province || business.province || "";
  const elStarterAccountType = document.getElementById("onboardingStarterAccountType");
  if (elStarterAccountType) {
    elStarterAccountType.value = onboardingData.starter_account_type || "checking";
  }
  const elStarterAccountName = document.getElementById("onboardingStarterAccountName");
  if (elStarterAccountName) {
    elStarterAccountName.value = onboardingData.starter_account_name || "";
  }
  syncStarterAccountName();
  updateOnboardingPlanPreview();

  syncProvinceField();
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  if (!onboardingForm || onboardingSubmitting) {
    return;
  }

  const submitButton = onboardingForm.querySelector('button[type="submit"]');
  const savedLanguage =
    (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : null) ||
    localStorage.getItem("lb_language") ||
    "en";

  const payload = {
    business_name: document.getElementById("onboardingBusinessName")?.value.trim() || "",
    business_type: "sole_proprietor",
    starter_account_type: document.getElementById("onboardingStarterAccountType")?.value || "checking",
    starter_account_name: document.getElementById("onboardingStarterAccountName")?.value.trim() || "",
    region: document.getElementById("onboardingRegion")?.value || "US",
    province: document.getElementById("onboardingProvince")?.value || "",
    language: savedLanguage
  };

  if (payload.region !== "CA") {
    payload.province = "";
  }
  if (payload.region === "CA" && !CA_PROVINCES.has(payload.province)) {
    setOnboardingMessage(tx("onboarding_error_province"));
    return;
  }
  if (!payload.starter_account_name) {
    setOnboardingMessage("Enter a name for your first account.");
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

function syncStarterAccountName() {
  if (onboardingAccountNameTouched) {
    updateOnboardingPlanPreview();
    return;
  }
  const accountType = document.getElementById("onboardingStarterAccountType")?.value || "checking";
  const region = document.getElementById("onboardingRegion")?.value === "CA" ? "CA" : "US";
  const accountInput = document.getElementById("onboardingStarterAccountName");
  if (!accountInput) {
    return;
  }
  accountInput.value =
    STARTER_ACCOUNT_NAME_PRESETS[accountType]?.[region] ||
    STARTER_ACCOUNT_NAME_PRESETS.checking[region];
  updateOnboardingPlanPreview();
}

function updateOnboardingPlanPreview() {
  const region = document.getElementById("onboardingRegion")?.value === "CA" ? "CA" : "US";
  const accountType = document.getElementById("onboardingStarterAccountType")?.value || "checking";
  const accountName =
    document.getElementById("onboardingStarterAccountName")?.value.trim() ||
    STARTER_ACCOUNT_NAME_PRESETS[accountType]?.[region] ||
    STARTER_ACCOUNT_NAME_PRESETS.checking[region];
  const regionLabel = region === "CA" ? "Canada" : "the United States";
  const body = document.getElementById("onboardingPlanBody");
  if (body) {
    body.textContent = `We'll save your business basics, create your first account, and guide you through the setup step by step. Filing defaults: ${regionLabel}. Starter account: ${accountName}.`;
  }
}

function syncOnboardingPreview() {
  syncProvinceField();
  syncStarterAccountName();
  updateOnboardingPlanPreview();
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
  updateOnboardingPlanPreview();
}

function resolveOnboardingDestination(profile = {}) {
  const onboardingData = profile?.onboarding?.data || {};
  const guidedSetupStep = String(onboardingData.guided_setup_step || "").trim().toLowerCase();
  if (onboardingData.guided_setup_active && GUIDED_SETUP_STEPS.has(guidedSetupStep)) {
    return `/${guidedSetupStep}`;
  }
  return "/categories";
}
