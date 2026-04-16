document.addEventListener("DOMContentLoaded", async () => {
  const tier = effectiveTier();
  const freeSection = document.getElementById("freeUpgrade");
  const v1Section = document.getElementById("v1Banner");
  const upgradeBtn = document.getElementById("upgradePrimary");

  if (tier === "free") {
    if (freeSection) freeSection.hidden = false;
    if (v1Section) v1Section.hidden = true;

    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", () => {
        window.location.href = "subscription";
      });
    }

    // Show the mock upgrade button only when the server has ENABLE_MOCK_BILLING=true
    try {
      const res = await apiFetch("/api/billing/mock-v1");
      if (res.ok) {
        const data = await res.json();
        if (data.enabled) {
          const wrap = document.getElementById("mockUpgradeWrap");
          const btn = document.getElementById("mockUpgradeBtn");
          const errEl = document.getElementById("mockUpgradeError");
          if (wrap) wrap.hidden = false;
          if (btn) {
            btn.addEventListener("click", async () => {
              btn.disabled = true;
              btn.textContent = "Activating…";
              if (errEl) errEl.hidden = true;
              try {
                const r = await apiFetch("/api/billing/mock-v1", { method: "POST" });
                if (r.ok) {
                  const d = await r.json();
                  if (d.subscription) {
                    applySubscriptionState(d.subscription);
                  }
                  window.location.reload();
                } else {
                  const d = await r.json().catch(() => ({}));
                  if (errEl) {
                    errEl.textContent = d.error || "Activation failed.";
                    errEl.hidden = false;
                  }
                  btn.disabled = false;
                  btn.textContent = "Activate V1 for testing";
                }
              } catch {
                if (errEl) {
                  errEl.textContent = "Request failed. Check console.";
                  errEl.hidden = false;
                }
                btn.disabled = false;
                btn.textContent = "Activate V1 for testing";
              }
            });
          }
        }
      }
    } catch {
      // Mock billing check failed silently — not a blocking error
    }
  } else {
    if (freeSection) freeSection.hidden = true;
    if (v1Section) v1Section.hidden = false;
    if (upgradeBtn) upgradeBtn.hidden = true;
  }
});
