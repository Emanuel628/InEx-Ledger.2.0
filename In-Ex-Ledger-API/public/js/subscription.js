document.addEventListener("DOMContentLoaded", async () => {
  const buttons = Array.from(document.querySelectorAll("button"));
  const starterBtn = buttons.find((btn) => btn.textContent.toLowerCase().includes("starter"));
  const proBtn = buttons.find((btn) => btn.textContent.toLowerCase().includes("pro"));

  if (!starterBtn || !proBtn) {
    return;
  }

  if (!isAuthenticated()) {
    proBtn.addEventListener("click", () => {
      window.location.href = "register.html";
    });
    starterBtn.disabled = true;
    starterBtn.textContent = "Current Plan";
    return;
  }

  try {
    const response = await apiFetch("/api/billing/subscription");
    if (!response) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const subscription = payload?.subscription || null;

    if (subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(subscription);
    }

    if (subscription?.effectiveTier === "v1") {
      proBtn.disabled = true;
      proBtn.textContent = "Current Plan";
      starterBtn.textContent = "Manage Billing";
      starterBtn.addEventListener("click", openCustomerPortal);
      return;
    }

    starterBtn.disabled = true;
    starterBtn.textContent = "Current Plan";
    proBtn.addEventListener("click", startCheckout);
  } catch (err) {
    console.error("[Subscription] Failed to load subscription:", err);
  }
});

async function startCheckout() {
  try {
    const response = await apiFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!response) {
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    if (payload?.url) {
      window.location.href = payload.url;
    }
  } catch (err) {
    alert(err.message || "Unable to start checkout.");
  }
}

async function openCustomerPortal() {
  try {
    const response = await apiFetch("/api/billing/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!response) {
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to open billing portal.");
    }
    if (payload?.url) {
      window.location.href = payload.url;
    }
  } catch (err) {
    alert(err.message || "Unable to open billing portal.");
  }
}
