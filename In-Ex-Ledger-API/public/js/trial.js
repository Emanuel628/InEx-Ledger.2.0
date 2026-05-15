function isTrialExpired() {
  if (typeof isTrialValid === "function") {
    return !isTrialValid();
  }

  return false;
}

function trialTx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function enforceTrial() {
  if (isTrialExpired()) {
    window.location.href = "subscription";
  }
}

const DEFAULT_TRIAL_DAYS = 30;

function getAuthoritativeTrialSubscription() {
  if (window.__LUNA_ME__?.subscription && typeof window.__LUNA_ME__.subscription === "object") {
    return window.__LUNA_ME__.subscription;
  }
  return null;
}

function startTrial(durationDays = DEFAULT_TRIAL_DAYS) {
  return durationDays;
}

function formatTrialRemaining() {
  const remainingMs = getTrialRemaining();
  if (remainingMs === null) {
    return "Trial status unavailable.";
  }

  const totalDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const remainderMs = remainingMs % (1000 * 60 * 60 * 24);
  const hours = Math.floor(remainderMs / (1000 * 60 * 60));

  const wrapNumber = (value) => `<span class="trial-countdown-number">${value}</span>`;

  if (totalDays > 1) {
    return `Trial ends in ${wrapNumber(totalDays)} days.`;
  }

  if (totalDays === 1) {
    const hourLabel = hours === 1 ? "hour" : "hours";
    return `Trial ends in ${wrapNumber(1)} day and ${wrapNumber(hours)} ${hourLabel}.`;
  }

  const hoursValue = Math.max(hours, 0);
  return `Trial ends in ${wrapNumber(hoursValue)} hour${hoursValue === 1 ? "" : "s"}.`;
}

function getTrialRemaining() {
  const subscription = getAuthoritativeTrialSubscription();
  if (!subscription || subscription.effectiveStatus !== "trialing" || !subscription.trialEndsAt) {
    return null;
  }

  const endsAt = new Date(subscription.trialEndsAt).getTime();
  if (!Number.isFinite(endsAt)) {
    return null;
  }

  return Math.max(0, endsAt - Date.now());
}

function getTrialRemainingForDisplay() {
  const remaining = getTrialRemaining();
  if (remaining !== null) {
    return remaining;
  }
  return 0;
}
