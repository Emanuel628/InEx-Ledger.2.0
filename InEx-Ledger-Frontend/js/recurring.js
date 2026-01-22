requireAuthAndTier("v1");

function ensureV1TierAction() {
  if (effectiveTier() !== "v1") {
    window.location.href = "upgrade.html";
    return false;
  }

  return true;
}

function wireRecurringActions() {
  const createBtn = document.querySelector("[data-recurring-create]");
  const editBtns = document.querySelectorAll("[data-recurring-edit]");
  const deleteBtns = document.querySelectorAll("[data-recurring-delete]");

  if (createBtn) {
    createBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1TierAction()) return;
      console.log("Creating recurring item...");
    });
  }

  editBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1TierAction()) return;
      console.log("Editing recurring item...");
    });
  });

  deleteBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1TierAction()) return;
      console.log("Deleting recurring item...");
    });
  });
}

wireRecurringActions();