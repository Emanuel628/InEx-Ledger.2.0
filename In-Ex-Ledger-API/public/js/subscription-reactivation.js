/* Subscription trial reactivation bridge
   Scenario:
   - New account starts on 30-day Pro trial.
   - User chooses Basic during the trial.
   - User later decides to keep Pro before the trial ends.

   In that state, the user is not starting a brand-new paid subscription yet;
   they are changing the selected post-trial plan back to Pro. Intercept the Pro
   CTA only when the loaded subscription state proves this is the downgraded
   trial case. Otherwise leave the normal checkout flow alone.
*/
(function () {
  let cachedSubscription = null;
  let isLoadingSubscription = false;
  let isReactivating = false;

  function isSubscriptionPage() {
    return Boolean(document.getElementById("planProBtn") && document.getElementById("subStatusBlock"));
  }

  function isTrialDowngradedToBasic(subscription) {
    if (!subscription || !subscription.isTrialing) return false;
    return Boolean(
      subscription.isTrialDowngradedToFree ||
      subscription.cancelAtPeriodEnd ||
      subscription.selectedPlanCode !== "v1"
    );
  }

  async function loadSubscription() {
    if (cachedSubscription || isLoadingSubscription || typeof window.apiFetch !== "function") {
      return cachedSubscription;
    }

    isLoadingSubscription = true;
    try {
      const res = await window.apiFetch("/api/billing/subscription");
      const payload = await res?.json?.().catch(() => null);
      cachedSubscription = payload?.subscription || null;
    } catch (_) {
      cachedSubscription = null;
    } finally {
      isLoadingSubscription = false;
    }
    return cachedSubscription;
  }

  function setButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.textContent || "Upgrade to Pro";
      button.disabled = true;
      button.textContent = "Reactivating Pro…";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "Upgrade to Pro";
    }
  }

  async function reactivateTrial(button) {
    if (isReactivating || typeof window.apiFetch !== "function") return;
    isReactivating = true;
    setButtonLoading(button, true);

    try {
      const additionalInput = document.getElementById("additionalBusinessesInput");
      const additionalBusinesses = Number(additionalInput?.value || 0);
      const res = await window.apiFetch("/api/billing/reactivate-trial-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalBusinesses })
      });
      const payload = await res?.json?.().catch(() => null);
      if (!res || !res.ok) {
        throw new Error(payload?.error || "Could not reactivate Pro trial.");
      }

      cachedSubscription = payload?.subscription || null;
      window.location.assign("/subscription?trial=pro-reactivated");
    } catch (err) {
      setButtonLoading(button, false);
      const message = err?.message || "Could not reactivate Pro trial.";
      if (typeof window.alert === "function") {
        window.alert(message);
      }
    } finally {
      isReactivating = false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("#planProBtn");
    if (!button || !isSubscriptionPage()) return;

    if (!isTrialDowngradedToBasic(cachedSubscription)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    reactivateTrial(button);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (isSubscriptionPage()) loadSubscription();
    }, { once: true });
  } else if (isSubscriptionPage()) {
    loadSubscription();
  }
})();
