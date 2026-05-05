/*
  Subscription trial checkout patch

  Bug fixed:
  A trialing Pro account that selected/downgraded to Basic for after the trial
  can still have cancel_at_period_end/current_period_end fields. The core
  derived state may then expose isPaid=true, which makes /api/billing/checkout-session
  block with "already has paid Pro access" even though the user is still only
  inside the free trial.

  Trialing access is not paid access. Keep effective Pro trial access intact,
  but never let a trialing snapshot masquerade as paid/remaining paid access.
*/
const subscriptionService = require("./subscriptionService.js");

if (!subscriptionService.__trialCheckoutPatchApplied) {
  const originalGetSubscriptionSnapshotForBusiness = subscriptionService.getSubscriptionSnapshotForBusiness;
  const originalGetSubscriptionSnapshotForUser = subscriptionService.getSubscriptionSnapshotForUser;

  function normalizeTrialSnapshot(snapshot) {
    if (!snapshot || !snapshot.isTrialing) {
      return snapshot;
    }

    return {
      ...snapshot,
      isPaid: false,
      isCanceledWithRemainingAccess: false
    };
  }

  subscriptionService.getSubscriptionSnapshotForBusiness = async function patchedGetSubscriptionSnapshotForBusiness(...args) {
    const snapshot = await originalGetSubscriptionSnapshotForBusiness.apply(this, args);
    return normalizeTrialSnapshot(snapshot);
  };

  subscriptionService.getSubscriptionSnapshotForUser = async function patchedGetSubscriptionSnapshotForUser(...args) {
    const snapshot = await originalGetSubscriptionSnapshotForUser.apply(this, args);
    return normalizeTrialSnapshot(snapshot);
  };

  subscriptionService.__trialCheckoutPatchApplied = true;
}

module.exports = subscriptionService;
