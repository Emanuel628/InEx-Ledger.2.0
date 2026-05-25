const CA_PROVINCES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const ONBOARDING_REGION_KEY = "lb_region";

let screen1El = null;
let screen2El = null;
let selectedGoal = null;
let onboardingSubmitting = false;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  screen1El = document.getElementById("onboardingScreen1");
  screen2El = document.getElementById("onboardingScreen2");

  const valid = await requireValidSessionOrRedirect();
  if (valid === false || !getToken()) return;

  const profile = window.__LUNA_ME__ || null;
  if (profile?.onboarding?.completed) {
    window.location.href = resolveOnboardingDestination(profile);
    return;
  }

  hydrateDefaults(profile);
  wireScreen1();
  wireScreen2();
  wireRegionField();
});

function hydrateDefaults(profile = {}) {
  const onboardingData = profile?.onboarding?.data || {};
  const business = profile?.active_business || {};

  const elName = document.getElementById("onboardingBusinessName");
  if (elName) elName.value = onboardingData.business_name || business.name || "";

  const elRegion = document.getElementById("onboardingRegion");
  if (elRegion) elRegion.value = onboardingData.region || business.region || "US";

  const elProvince = document.getElementById("onboardingProvince");
  if (elProvince) elProvince.value = onboardingData.province || business.province || "";

  syncProvinceField();
}

function wireRegionField() {
  const regionSelect = document.getElementById("onboardingRegion");
  if (regionSelect) regionSelect.addEventListener("change", syncProvinceField);
}

function syncProvinceField() {
  const regionSelect = document.getElementById("onboardingRegion");
  const provinceField = document.getElementById("onboardingProvinceField");
  const provinceSelect = document.getElementById("onboardingProvince");
  const isCanada = regionSelect?.value === "CA";
  if (!provinceField || !provinceSelect) return;
  provinceField.hidden = !isCanada;
  provinceSelect.required = isCanada;
  if (!isCanada) provinceSelect.value = "";
}

function wireScreen1() {
  const nextBtn = document.getElementById("onboardingNextBtn");
  if (!nextBtn) return;
  nextBtn.addEventListener("click", handleScreen1Next);
}

function handleScreen1Next() {
  const msgEl = document.getElementById("onboardingScreen1Message");
  const name = document.getElementById("onboardingBusinessName")?.value.trim() || "";
  const region = document.getElementById("onboardingRegion")?.value || "US";
  const province = document.getElementById("onboardingProvince")?.value || "";

  if (!name) {
    showMsg(msgEl, tx("onboarding_error_name") || "Please enter your name or trade name.");
    return;
  }
  if (region === "CA" && !CA_PROVINCES.has(province)) {
    showMsg(msgEl, tx("onboarding_error_province") || "Please choose a province.");
    return;
  }
  showMsg(msgEl, "");
  goToScreen2();
}

function goToScreen2() {
  screen1El.hidden = true;
  screen2El.hidden = false;
  document.getElementById("onboardingPip1")?.classList.remove("is-active");
  document.getElementById("onboardingPip2")?.classList.add("is-active");
  screen2El.scrollIntoView({ block: "start", behavior: "smooth" });
}

function goToScreen1() {
  screen2El.hidden = true;
  screen1El.hidden = false;
  document.getElementById("onboardingPip2")?.classList.remove("is-active");
  document.getElementById("onboardingPip1")?.classList.add("is-active");
}

function wireScreen2() {
  const backBtn = document.getElementById("onboardingBackBtn");
  if (backBtn) backBtn.addEventListener("click", goToScreen1);

  const submitBtn = document.getElementById("onboardingSubmitBtn");
  if (submitBtn) submitBtn.addEventListener("click", handleSubmit);

  document.querySelectorAll(".goal-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".goal-card").forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-pressed", "false");
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
      selectedGoal = card.dataset.goal || null;
      const submitBtn = document.getElementById("onboardingSubmitBtn");
      if (submitBtn) submitBtn.disabled = !selectedGoal;
    });
  });
}

async function handleSubmit() {
  if (onboardingSubmitting) return;
  const msgEl = document.getElementById("onboardingScreen2Message");

  if (!selectedGoal) {
    showMsg(msgEl, tx("onboarding_error_goal") || "Please choose what you want to do first.");
    return;
  }

  const submitBtn = document.getElementById("onboardingSubmitBtn");
  const name = document.getElementById("onboardingBusinessName")?.value.trim() || "";
  const region = document.getElementById("onboardingRegion")?.value || "US";
  const province = region === "CA" ? (document.getElementById("onboardingProvince")?.value || "") : "";
  const language =
    (typeof getCurrentLanguage === "function" ? getCurrentLanguage() : null) ||
    localStorage.getItem("lb_language") ||
    "en";

  showMsg(msgEl, "");
  onboardingSubmitting = true;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await apiFetch("/api/me/onboarding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: name,
        region,
        province,
        start_focus: selectedGoal,
        language,
        starter_account_type: "checking",
        starter_account_name: ""
      })
    });
    const result = response ? await response.json().catch(() => null) : null;

    if (!response || !response.ok) {
      showMsg(msgEl, result?.error || tx("onboarding_error_finish") || "Something went wrong. Please try again.");
      return;
    }

    localStorage.setItem(ONBOARDING_REGION_KEY, region.toLowerCase());
    window.LUNA_REGION = region.toLowerCase();
    if (typeof setCurrentLanguage === "function") setCurrentLanguage(language);

    window.location.href = result?.redirect_to || `/${selectedGoal}`;
  } catch (err) {
    console.error("Onboarding save failed:", err);
    showMsg(msgEl, tx("onboarding_error_finish") || "Something went wrong. Please try again.");
  } finally {
    if (submitBtn) submitBtn.disabled = !selectedGoal;
    onboardingSubmitting = false;
  }
}

function showMsg(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function resolveOnboardingDestination(profile = {}) {
  const data = profile?.onboarding?.data || {};
  const validGoals = new Set(["transactions", "categories", "receipts", "mileage", "exports"]);
  if (data.start_focus && validGoals.has(data.start_focus)) return `/${data.start_focus}`;
  return "/transactions";
}
