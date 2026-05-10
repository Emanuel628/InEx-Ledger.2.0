let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
let onboardingAccountNameTouched = false;
let onboardingStartFocusTouched = false;
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const GUIDED_SETUP_STEPS = new Set(["categories", "accounts", "transactions"]);
const ONBOARDING_PLAN_PRESETS = {
  transactions: {
    title: "Open the ledger first and start with real activity.",
    body: "We'll save your defaults, create the first account, and send you straight into Transactions so the workspace becomes usable immediately.",
    bullets: [
      "Start with one income item and one expense instead of over-planning the setup.",
      "Use the first account you actually post to most often.",
      "Clean categories and region defaults will already be in place for the first entries."
    ]
  },
  receipts: {
    title: "Get receipt capture working before paper starts piling up.",
    body: "We'll save your basics, create the first account, and open Receipts so you can test the upload flow right away.",
    bullets: [
      "Upload one real receipt so the workflow is proven immediately.",
      "Then connect that receipt to the matching transaction instead of saving cleanup for later.",
      "You can still move into Transactions as soon as the capture path is ready."
    ]
  },
  mileage: {
    title: "Set up mileage before the trips become reconstruction work.",
    body: "We'll save your region, create the first account, and open Mileage so your first deductible trip can be logged correctly.",
    bullets: [
      "Add the date, purpose, destination, and distance for one real trip.",
      "Mileage works best when it starts early rather than at tax time.",
      "The ledger and mileage records can grow together from there."
    ]
  },
  exports: {
    title: "Build the structure now so exports are clean later.",
    body: "We'll save your basics, create the first account, and open Exports so you can review the handoff layer after the workspace is configured.",
    bullets: [
      "Exports become useful once the account list and categories are practical.",
      "You can review the output early, then go back and add real activity.",
      "The guided setup still points you toward categories, accounts, and transactions next."
    ]
  }
};
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
  wireStartFocusTiles();
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
  const savedStartFocus = onboardingData.start_focus || "transactions";
  applyStartFocusSelection(savedStartFocus);
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
    start_focus: document.getElementById("onboardingStartFocus")?.value || "transactions",
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

function wireStartFocusTiles() {
  const tiles = document.querySelectorAll(".focus-tile");
  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      onboardingStartFocusTouched = true;
      applyStartFocusSelection(tile.dataset.focus);
    });
  });
}

function applyStartFocusSelection(focus) {
  const normalizedFocus = focus || "transactions";
  const hidden = document.getElementById("onboardingStartFocus");
  if (hidden) {
    hidden.value = normalizedFocus;
  }
  document.querySelectorAll(".focus-tile").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.focus === normalizedFocus);
  });
  updateOnboardingPlanPreview();
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
  const focus = document.getElementById("onboardingStartFocus")?.value || "transactions";
  const preset = ONBOARDING_PLAN_PRESETS[focus] || ONBOARDING_PLAN_PRESETS.transactions;
  const region = document.getElementById("onboardingRegion")?.value === "CA" ? "CA" : "US";
  const accountType = document.getElementById("onboardingStarterAccountType")?.value || "checking";
  const accountName =
    document.getElementById("onboardingStarterAccountName")?.value.trim() ||
    STARTER_ACCOUNT_NAME_PRESETS[accountType]?.[region] ||
    STARTER_ACCOUNT_NAME_PRESETS.checking[region];
  const regionLabel = region === "CA" ? "Canada" : "the United States";
  const title = document.getElementById("onboardingPlanTitle");
  const body = document.getElementById("onboardingPlanBody");
  const bullets = document.getElementById("onboardingPlanBullets");
  if (title) {
    title.textContent = preset.title;
  }
  if (body) {
    body.textContent = `${preset.body} First stop: ${formatStartFocusLabel(focus)}. Filing defaults: ${regionLabel}. Starter account: ${accountName}.`;
  }
  if (bullets) {
    bullets.innerHTML = preset.bullets
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }
}

function syncOnboardingPreview() {
  syncProvinceField();
  syncStarterAccountName();
  updateOnboardingPlanPreview();
}

function formatStartFocusLabel(focus) {
  if (focus === "receipts") return "Receipts";
  if (focus === "mileage") return "Mileage";
  if (focus === "exports") return "Exports";
  return "Transactions";
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

  const startFocus = String(onboardingData.start_focus || "").trim().toLowerCase();
  if (startFocus) {
    return `/${startFocus}`;
  }

  return "/transactions";
}
