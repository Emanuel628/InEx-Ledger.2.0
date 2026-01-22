document.addEventListener("DOMContentLoaded", () => {

  if (typeof requireAuth === "function") {
    requireAuth();
  }

  if (typeof enforceTrial === "function") {
    enforceTrial();
  }

  if (typeof renderTrialBanner === "function") {
    renderTrialBanner("trialBanner");
  }
});