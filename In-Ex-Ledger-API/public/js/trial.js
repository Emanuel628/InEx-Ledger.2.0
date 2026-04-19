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


function startTrial(durationDays = DEFAULT_TRIAL_DAYS) {
  const now = Date.now();
  const endsAt = now + durationDays * 24 * 60 * 60 * 1000;

  localStorage.setItem(TRIAL_EXPIRED_KEY, "false");
  localStorage.setItem(TRIAL_ENDS_AT_KEY, endsAt.toString());
}

function formatTrialRemaining() {
  const remainingMs = getTrialRemainingForDisplay();

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
  const endsAt = Number(localStorage.getItem(TRIAL_ENDS_AT_KEY));
  if (!endsAt) {
    return null;
  }

  return Math.max(0, endsAt - Date.now());
}

function getTrialRemainingForDisplay() {
  const remaining = getTrialRemaining();
  if (remaining !== null) {
    return remaining;
  }
  return DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000;
}
