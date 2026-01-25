document.addEventListener("DOMContentLoaded", () => {
  const tier = effectiveTier();
  const freeSection = document.getElementById("freeUpgrade");
  const v1Section = document.getElementById("v1Banner");
  const upgradeBtn = document.getElementById("upgradePrimary");

  if (tier === "free") {
    if (freeSection) {
      freeSection.style.display = "block";
    }
    if (v1Section) {
      v1Section.style.display = "none";
    }

    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        window.location.href = "subscription.html";
      });
    }
  } else {
    if (freeSection) {
      freeSection.style.display = "none";
    }
    if (v1Section) {
      v1Section.style.display = "block";
    }

    if (upgradeBtn) {
      upgradeBtn.style.display = "none";
    }
  }
});