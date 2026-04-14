let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
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
    window.location.href = profile?.onboarding?.data?.start_focus
      ? `/${profile.onboarding.data.start_focus}`
      : "/transactions";
    return;
  }

  hydrateOnboardingDefaults(profile);
  document.getElementById("onboardingRegion")?.addEventListener("change", syncProvinceField);
  document.getElementById("onboardingLanguage")?.addEventListener("change", handleOnboardingLanguageChange);
  window.addEventListener("lunaLanguageChanged", applyOnboardingStaticCopy);
  wireWorkTypeTiles();
  onboardingForm.addEventListener("submit", handleOnboardingSubmit);
});

function hydrateOnboardingDefaults(profile = {}) {
  const languageSelect = document.getElementById("onboardingLanguage");
  const business = profile?.active_business || {};
  const onboardingData = profile?.onboarding?.data || {};

  if (languageSelect) {
    if (typeof populateLanguageOptions === "function") {
      populateLanguageOptions(languageSelect);
    }
    languageSelect.value =
      onboardingData.language ||
      business.language ||
      (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en");
  }

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
  if (elStarterAccountType) elStarterAccountType.value = onboardingData.starter_account_type || "checking";
  const elStarterAccountName = document.getElementById("onboardingStarterAccountName");
  if (elStarterAccountName) elStarterAccountName.value = onboardingData.starter_account_name || tx("onboarding_default_account_name");
  const elStartFocus = document.getElementById("onboardingStartFocus");
  if (elStartFocus) elStartFocus.value = onboardingData.start_focus || "transactions";

  syncProvinceField();
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  if (!onboardingForm || onboardingSubmitting) {
    return;
  }

  const submitButton = onboardingForm.querySelector("button[type=\"submit\"]");
  const payload = {
    business_name: document.getElementById("onboardingBusinessName")?.value.trim() || "",
    work_type: document.getElementById("onboardingWorkType")?.value || "other",
    business_type: "sole_proprietor",
    region: document.getElementById("onboardingRegion")?.value || "US",
    province: document.getElementById("onboardingProvince")?.value || "",
    language: document.getElementById("onboardingLanguage")?.value || "en",
    starter_account_type: document.getElementById("onboardingStarterAccountType")?.value || "",
    starter_account_name: document.getElementById("onboardingStarterAccountName")?.value.trim() || "",
    start_focus: document.getElementById("onboardingStartFocus")?.value || "transactions"
  };

  if (payload.region !== "CA") {
    payload.province = "";
  }
  if (payload.region === "CA" && !CA_PROVINCES.has(payload.province)) {
    setOnboardingMessage(tx("onboarding_error_province"));
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
    const result = await response?.json().catch(() => null);

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
    window.location.href = result?.redirect_to || "/transactions";
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
  intro?.querySelector("p")?.replaceChildren(tx("onboarding_intro"));
  document.title = `InEx Ledger - ${tx("onboarding_page_title")}`;
}

function handleOnboardingLanguageChange(event) {
  const languageSelect = event?.target;
  const nextLanguage = String(languageSelect?.value || "").trim() || "en";
  if (typeof setCurrentLanguage === "function") {
    const normalized = setCurrentLanguage(nextLanguage);
    if (languageSelect) {
      languageSelect.value = normalized;
    }
  } else {
    applyOnboardingStaticCopy();
  }
}
