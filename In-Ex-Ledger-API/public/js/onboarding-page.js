let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
let onboardingAccountNameTouched = false;
const ONBOARDING_REGION_KEY = "lb_region";
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

  const elBusinessActivityCode = document.getElementById("onboardingBusinessActivityCode");
  if (elBusinessActivityCode) {
    elBusinessActivityCode.value =
      onboardingData.business_activity_code ||
      business.business_activity_code ||
      "";
  }

  const elAccountingMethod = document.getElementById("onboardingAccountingMethod");
  if (elAccountingMethod) {
    elAccountingMethod.value =
      onboardingData.accounting_method ||
      business.accounting_method ||
      "cash";
  }

  const elMaterialParticipation = document.getElementById("onboardingMaterialParticipation");
  if (elMaterialParticipation) {
    elMaterialParticipation.value =
      onboardingData.material_participation ||
      (business.material_participation === false ? "no" : "yes");
  }

  const elBusinessAddress = document.getElementById("onboardingBusinessAddress");
  if (elBusinessAddress) {
    elBusinessAddress.value =
      onboardingData.address ||
      business.address ||
      "";
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
    business_type: resolveOnboardingBusinessType(),
    starter_account_type: document.getElementById("onboardingStarterAccountType")?.value || "checking",
    starter_account_name: document.getElementById("onboardingStarterAccountName")?.value.trim() || "",
    region: document.getElementById("onboardingRegion")?.value || "US",
    province: document.getElementById("onboardingProvince")?.value || "",
    business_activity_code: document.getElementById("onboardingBusinessActivityCode")?.value.trim() || "",
    accounting_method: document.getElementById("onboardingAccountingMethod")?.value || "cash",
    material_participation: document.getElementById("onboardingMaterialParticipation")?.value || "yes",
    address: document.getElementById("onboardingBusinessAddress")?.value.trim() || "",
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
    setOnboardingMessage(tx("onboarding_error_account_name"));
    return;
  }
  if (!payload.business_activity_code) {
    setOnboardingMessage("Business activity code is required for PDF exports.");
    return;
  }
  if (!payload.accounting_method) {
    setOnboardingMessage("Accounting method is required for PDF exports.");
    return;
  }
  if (!payload.material_participation) {
    setOnboardingMessage("Business activity status is required for PDF exports.");
    return;
  }
  if (!payload.address) {
    setOnboardingMessage("Business address is required for PDF exports.");
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

    localStorage.setItem(ONBOARDING_REGION_KEY, payload.region.toLowerCase());
    window.LUNA_REGION = payload.region.toLowerCase();
    if (typeof setCurrentLanguage === "function") {
      setCurrentLanguage(payload.language);
    }
    const destination =
      result?.redirect_to ||
      resolveOnboardingDestination({ onboarding: result?.onboarding || null });
    // Offer an optional bank-CSV import step before sending the user onward.
    showOnboardingImportStep(payload.region, destination);
  } catch (error) {
    console.error("Onboarding save failed:", error);
    setOnboardingMessage(tx("onboarding_error_finish"));
  } finally {
    submitButton?.removeAttribute("disabled");
    onboardingSubmitting = false;
  }
}

function resolveOnboardingBusinessType() {
  const value = document.getElementById("onboardingBusinessType")?.value;
  return String(value || "sole_proprietor").trim() || "sole_proprietor";
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

/* =========================================================
   Optional onboarding step: import transactions from a bank CSV.
   Uses the business region already chosen during onboarding — it never
   asks the user to pick a region. The step is always skippable.
   ========================================================= */

function showOnboardingImportStep(region, destination) {
  const importStep = document.getElementById("onboardingImportStep");
  const formShell = onboardingForm ? onboardingForm.closest(".onboarding-shell") : null;

  // If the optional step markup is unavailable, continue without blocking.
  if (!importStep) {
    window.location.href = destination;
    return;
  }

  if (formShell) {
    formShell.hidden = true;
  }
  importStep.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  setupOnboardingImportStep(region, destination);
}

function setupOnboardingImportStep(region, destination) {
  const fileInput = document.getElementById("onboardingCsvFile");
  const helpToggle = document.getElementById("onboardingCsvHelpToggle");
  const helpPanel = document.getElementById("onboardingBankHelpPanel");
  const skipButton = document.getElementById("onboardingCsvSkip");
  const continueButton = document.getElementById("onboardingImportContinue");
  const continueRow = document.getElementById("onboardingImportContinueRow");
  const statusEl = document.getElementById("onboardingCsvStatus");

  const goToWorkspace = () => {
    window.location.href = destination;
  };

  skipButton?.addEventListener("click", goToWorkspace);
  continueButton?.addEventListener("click", goToWorkspace);

  // Region-aware bank CSV help. The region is the business region from
  // onboarding; the help panel never asks the user to choose a region.
  let helpRendered = false;
  helpToggle?.addEventListener("click", () => {
    if (!helpPanel) {
      return;
    }
    const willShow = helpPanel.hidden;
    if (willShow && !helpRendered && window.BankCsvHelp) {
      window.BankCsvHelp.render(helpPanel, region);
      helpRendered = true;
    }
    helpPanel.hidden = !willShow;
    helpToggle.setAttribute("aria-expanded", willShow ? "true" : "false");
  });

  // Resolve the starter account created during onboarding as the import target.
  let starterAccountId = null;
  resolveStarterAccountId()
    .then((accountId) => {
      starterAccountId = accountId;
    })
    .catch(() => {
      starterAccountId = null;
    });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      return;
    }
    await handleOnboardingCsvUpload(file, starterAccountId, statusEl, continueRow);
    fileInput.value = "";
  });
}

async function resolveStarterAccountId() {
  try {
    const response = await apiFetch("/api/accounts?scope=active");
    if (!response || !response.ok) {
      return null;
    }
    const payload = await response.json().catch(() => null);
    const accounts = Array.isArray(payload) ? payload : (payload?.data || []);
    return accounts.length ? accounts[0].id : null;
  } catch (_) {
    return null;
  }
}

function setImportStatus(statusEl, message) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message || "";
  statusEl.hidden = !message;
}

async function handleOnboardingCsvUpload(file, accountId, statusEl, continueRow) {
  if (!accountId) {
    setImportStatus(
      statusEl,
      "We couldn't find your starter account yet. You can skip this step and import later from the Transactions page."
    );
    return;
  }

  setImportStatus(statusEl, "Importing your CSV…");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("account_id", accountId);

  try {
    const response = await apiFetch("/api/transactions/import/csv", {
      method: "POST",
      body: formData
    });
    const data = response ? await response.json().catch(() => ({})) : {};

    if (!response || !response.ok) {
      setImportStatus(
        statusEl,
        data.error || "We couldn't import that file. You can skip this step and try again later from Transactions."
      );
      return;
    }

    const imported = Number(data.imported || 0);
    const skipped = Number(data.skipped || 0);
    const skippedNote = skipped > 0 ? `, ${skipped} skipped` : "";
    setImportStatus(
      statusEl,
      `Import complete. ${imported} transaction${imported === 1 ? "" : "s"} added${skippedNote}.`
    );
    if (continueRow) {
      continueRow.hidden = false;
    }
  } catch (_) {
    setImportStatus(
      statusEl,
      "Something went wrong during import. You can skip this step and try again later from Transactions."
    );
  }
}
