let onboardingForm = null;
let onboardingMessage = null;
let onboardingSubmitting = false;

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

  const profile = window.__LUNA_ME__ || null;
  if (profile?.onboarding?.completed) {
    window.location.href = profile?.onboarding?.data?.start_focus
      ? `/${profile.onboarding.data.start_focus}`
      : "/transactions";
    return;
  }

  hydrateOnboardingDefaults(profile);
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

  document.getElementById("onboardingBusinessName").value =
    onboardingData.business_name || business.name || "";
  document.getElementById("onboardingBusinessType").value =
    onboardingData.business_type || business.business_type || "sole_proprietor";
  document.getElementById("onboardingRegion").value =
    onboardingData.region || business.region || "US";
  document.getElementById("onboardingStarterAccountType").value =
    onboardingData.starter_account_type || "checking";
  document.getElementById("onboardingStarterAccountName").value =
    onboardingData.starter_account_name || "Business Checking";
  document.getElementById("onboardingStartFocus").value =
    onboardingData.start_focus || "transactions";
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  if (!onboardingForm || onboardingSubmitting) {
    return;
  }

  const submitButton = onboardingForm.querySelector("button[type=\"submit\"]");
  const payload = {
    business_name: document.getElementById("onboardingBusinessName")?.value.trim() || "",
    business_type: document.getElementById("onboardingBusinessType")?.value || "",
    region: document.getElementById("onboardingRegion")?.value || "US",
    language: document.getElementById("onboardingLanguage")?.value || "en",
    starter_account_type: document.getElementById("onboardingStarterAccountType")?.value || "",
    starter_account_name: document.getElementById("onboardingStarterAccountName")?.value.trim() || "",
    start_focus: document.getElementById("onboardingStartFocus")?.value || "transactions"
  };

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
      setOnboardingMessage(result?.error || "Unable to finish setup.");
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
    setOnboardingMessage("Unable to finish setup.");
  } finally {
    submitButton?.removeAttribute("disabled");
    onboardingSubmitting = false;
  }
}

function setOnboardingMessage(message = "") {
  if (!onboardingMessage) {
    return;
  }
  onboardingMessage.textContent = message;
  onboardingMessage.hidden = !message;
}
