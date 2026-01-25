/* ============================================
   Subscription Page JS — V1 (MOCK for testing)
   No HTML changes required
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  const buttons = Array.from(document.querySelectorAll("button"));

  const starterBtn = buttons.find(btn =>
    btn.textContent.toLowerCase().includes("starter")
  );

  const proBtn = buttons.find(btn =>
    btn.textContent.toLowerCase().includes("pro")
  );

  // Read current tier
  const currentTier = localStorage.getItem("tier") || "free";

  // Update button states for clarity
  if (starterBtn && currentTier === "free") {
    starterBtn.disabled = true;
    starterBtn.textContent = "Current Plan";
  }

  if (proBtn && currentTier === "v1") {
    proBtn.disabled = true;
    proBtn.textContent = "Current Plan";
  }

  // Stay on Starter (Free)
  if (starterBtn) {
    starterBtn.addEventListener("click", () => {
      localStorage.setItem("tier", "free");

      // Optional: reset trial
      localStorage.removeItem("luna_trial_expired");
      localStorage.removeItem("luna_trial_ends_at");

      alert("You are now on the Starter plan.");

      window.location.href = "transactions.html";
    });
  }

  // Upgrade to Pro (V1)
  if (proBtn) {
    proBtn.addEventListener("click", () => {
      // MOCK upgrade
      localStorage.setItem("tier", "v1");

      // End trial + mark as paid
      localStorage.setItem("luna_trial_expired", "false");

      alert("Mock upgrade successful! You are now on Pro (V1).");

      window.location.href = "transactions.html";
    });
  }

  console.log("[Subscription] Mock subscription system active");
});