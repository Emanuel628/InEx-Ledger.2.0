(function keepLandingCopyStable() {
  function syncFaqsAfterRegionChange() {
    if (typeof window.renderExpandedLandingFaqs === "function") {
      window.setTimeout(() => window.renderExpandedLandingFaqs(), 0);
    }
  }

  const originalApply = window.applyLandingRegion;
  if (typeof originalApply === "function") {
    window.applyLandingRegion = function patchedApplyLandingRegion(region) {
      originalApply(region);
      syncFaqsAfterRegionChange();
    };
  }

  document.addEventListener("DOMContentLoaded", syncFaqsAfterRegionChange);
})();
