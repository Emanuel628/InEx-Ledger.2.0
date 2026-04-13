requireAuthAndTier("v1");

function ensureV1Filters() {
  if (effectiveTier() !== "v1") {
    window.location.href = "upgrade";
    return false;
  }

  return true;
}

function wireFilterActions() {
  const applyBtn = document.querySelector("[data-filter-apply]");
  const saveBtn = document.querySelector("[data-filter-save]");
  const clearBtn = document.querySelector("[data-filter-clear]");

  if (applyBtn) {
    applyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      console.log("Applying advanced filters...");
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      console.log("Saving advanced filter...");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Filters()) return;
      console.log("Clearing filter presets...");
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireFilterActions);
} else {
  wireFilterActions();
}