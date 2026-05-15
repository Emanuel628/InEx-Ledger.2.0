requireAuthAndTier("v1");

function ensureV1Filters() {
  if (effectiveTier() !== "v1") {
    window.location.href = "/upgrade";
    return false;
  }

  return true;
}

function showFiltersUnavailableNotice() {
  const message = typeof t === "function"
    ? t("filters_advanced_unavailable")
    : "Advanced filter presets are not available yet.";

  if (typeof showSettingsToast === "function") {
    showSettingsToast(message);
    return;
  }
  if (typeof showAccountMenuNotice === "function") {
    showAccountMenuNotice(message);
  }
}

function wireFilterActions() {
  const applyBtn = document.querySelector("[data-filter-apply]");
  const saveBtn = document.querySelector("[data-filter-save]");
  const clearBtn = document.querySelector("[data-filter-clear]");

  if (applyBtn) {
    applyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      showFiltersUnavailableNotice();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      showFiltersUnavailableNotice();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      showFiltersUnavailableNotice();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireFilterActions);
} else {
  wireFilterActions();
}
