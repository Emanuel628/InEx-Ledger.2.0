document.addEventListener("DOMContentLoaded", () => {
  const tier = effectiveTier();
  const freeSection = document.getElementById("freeUpgrade");
  const v1Section = document.getElementById("v1Banner");
  const upgradeBtn = document.getElementById("upgradePrimary");

  if (tier === "free") {
    if (freeSection) {
      freeSection.hidden = false;
    }
    if (v1Section) {
      v1Section.hidden = true;
    }

    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        window.location.href = "subscription";
      });
    }
  } else {
    if (freeSection) {
      freeSection.hidden = true;
    }
    if (v1Section) {
      v1Section.hidden = false;
    }

    if (upgradeBtn) {
      upgradeBtn.hidden = true;
    }
  }
});
