let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;
let onboardingAccountNameTouched = false;
let onboardingStartFocusTouched = false;
const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const GUIDED_SETUP_STEPS = new Set(["categories", "accounts", "transactions"]);
const ONBOARDING_WORKFLOW_PRESETS = {
  gig: {
    title: "Set up for platform payouts, mileage, and vehicle costs.",
    body: "We'll keep the setup focused on the records gig and delivery work usually needs first.",
    bullets: [
      "Suggest categories like platform income, mileage, fuel, parking, and phone plan.",
      "Create a starter account so payouts and expenses have somewhere real to land.",
      "Open mileage first unless you choose a different workflow."
    ],
    defaultFocus: "mileage",
    accountNames: {
      checking: "Driver Checking",
      savings: "Driver Savings",
      credit_card: "Driver Card",
      cash: "Driver Cash",
      loan: "Vehicle Loan"
    }
  },
  creative: {
    title: "Set up for client income, software, and project expenses.",
    body: "This path keeps the ledger practical for consulting, design, freelance, and service work.",
    bullets: [
      "Suggest categories like client income, software, office supplies, and marketing.",
      "Create a starter account name that fits ongoing business use.",
      "Open transactions first so the ledger starts with real activity."
    ],
    defaultFocus: "transactions",
    accountNames: {
      checking: "Studio Checking",
      savings: "Studio Savings",
      credit_card: "Studio Card",
      cash: "Petty Cash",
      loan: "Equipment Loan"
    }
  },
  trade: {
    title: "Set up for job costs, materials, tools, and mileage.",
    body: "We'll bias the first setup pass toward the expense patterns common in field work and home services.",
    bullets: [
      "Suggest categories like job income, materials, tools, subcontractors, and mileage.",
      "Create the first account so purchases and deposits are easy to place correctly.",
      "Open mileage first unless you want to begin somewhere else."
    ],
    defaultFocus: "mileage",
    accountNames: {
      checking: "Job Checking",
      savings: "Tax Savings",
      credit_card: "Job Card",
      cash: "Job Cash",
      loan: "Truck Loan"
    }
  },
  other: {
    title: "Set up a clean starting point without overcomplicating it.",
    body: "We'll save the essentials, create the first usable account, and send you into the workflow you want first.",
    bullets: [
      "Start with a practical account and a small set of categories you will actually use.",
      "Keep the filing region correct so tax-related defaults start in the right place.",
      "Open the workflow you want first instead of forcing a generic setup detour."
    ],
    defaultFocus: "transactions",
    accountNames: {
      checking: "Primary Checking",
      savings: "Business Savings",
      credit_card: "Business Card",
      cash: "Cash",
      loan: "Business Loan"
    }
  }
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
  document.getElementById("onboardingRegion")?.addEventListener("change", syncProvinceField);
  document.getElementById("onboardingStarterAccountType")?.addEventListener("change", syncStarterAccountName);
  document.getElementById("onboardingStarterAccountName")?.addEventListener("input", () => {
    onboardingAccountNameTouched = true;
  });
  window.addEventListener("lunaLanguageChanged", applyOnboardingStaticCopy);
  wireWorkTypeTiles();
  wireStartFocusTiles();
  onboardingForm.addEventListener("submit", handleOnboardingSubmit);
});

function hydrateOnboardingDefaults(profile = {}) {
  const business = profile?.active_business || {};
  const onboardingData = profile?.onboarding?.data || {};

  const elBusinessName = document.getElementById("onboardingBusinessName");
  if (elBusinessName) elBusinessName.value = onboardingData.business_name || business.name || "";

  const savedWorkType = onboardingData.work_type || "other";
  const elWorkType = document.getElementById("onboardingWorkType");
  if (elWorkType) elWorkType.value = savedWorkType;
  applyWorkTypeSelection(savedWorkType, { preserveFocus: true, preserveAccountName: true });

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
  const savedStartFocus = onboardingData.start_focus || resolveWorkPreset(savedWorkType).defaultFocus || "transactions";
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
    work_type: document.getElementById("onboardingWorkType")?.value || "other",
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

function wireWorkTypeTiles() {
  const tiles = document.querySelectorAll(".work-tile");
  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      applyWorkTypeSelection(tile.dataset.work);
    });
  });
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

function resolveWorkPreset(workType) {
  return ONBOARDING_WORKFLOW_PRESETS[workType] || ONBOARDING_WORKFLOW_PRESETS.other;
}

function applyWorkTypeSelection(workType, options = {}) {
  const normalizedWorkType = ONBOARDING_WORKFLOW_PRESETS[workType] ? workType : "other";
  const hidden = document.getElementById("onboardingWorkType");
  if (hidden) {
    hidden.value = normalizedWorkType;
  }
  document.querySelectorAll(".work-tile").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.work === normalizedWorkType);
  });

  if (!options.preserveFocus && !onboardingStartFocusTouched) {
    applyStartFocusSelection(resolveWorkPreset(normalizedWorkType).defaultFocus);
  }
  if (!options.preserveAccountName && !onboardingAccountNameTouched) {
    syncStarterAccountName();
  }
  updateOnboardingPlanPreview();
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
    return;
  }
  const workType = document.getElementById("onboardingWorkType")?.value || "other";
  const accountType = document.getElementById("onboardingStarterAccountType")?.value || "checking";
  const preset = resolveWorkPreset(workType);
  const accountInput = document.getElementById("onboardingStarterAccountName");
  if (!accountInput) {
    return;
  }
  accountInput.value = preset.accountNames?.[accountType] || "Primary Checking";
}

function updateOnboardingPlanPreview() {
  const workType = document.getElementById("onboardingWorkType")?.value || "other";
  const focus = document.getElementById("onboardingStartFocus")?.value || "transactions";
  const preset = resolveWorkPreset(workType);
  const title = document.getElementById("onboardingPlanTitle");
  const body = document.getElementById("onboardingPlanBody");
  const bullets = document.getElementById("onboardingPlanBullets");
  if (title) {
    title.textContent = preset.title;
  }
  if (body) {
    body.textContent = `${preset.body} First stop: ${formatStartFocusLabel(focus)}.`;
  }
  if (bullets) {
    bullets.innerHTML = preset.bullets
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }
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
