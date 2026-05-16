/* =========================================================
   Verify Email Page JS
   ========================================================= */

let statusNode;
let linkNode;
let resendButton;
let resendLinkTrigger;
let continueButton;
let verificationState = "";
const VERIFICATION_STATE_KEY = "pendingVerificationState";
const SIGNUP_BOOTSTRAP_KEY = "pendingSignupBootstrapToken";
const VERIFY_EMAIL_POLL_INTERVAL_MS = 3000;
const VERIFY_EMAIL_MAX_POLLS = 40;
let verificationPollTimer = null;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", () => {
  statusNode = document.getElementById("verificationStatus");
  linkNode = document.getElementById("verificationLink");
  resendButton = document.getElementById("resendVerificationButton");
  resendLinkTrigger = document.getElementById("resendVerificationLink");
  continueButton = document.getElementById("continueToLoginButton");
  verificationState = localStorage.getItem(VERIFICATION_STATE_KEY) || "";

  wireActions();

  if (consumeVerifiedSessionFromHash()) {
    return;
  }

  if (verificationState) {
    updateStatus(tx("verify_email_status_sent"));
    startVerificationPolling();
  } else {
    updateStatus(tx("verify_email_status_register"), true);
  }

  window.addEventListener("beforeunload", stopVerificationPolling, { once: true });
});
function startVerificationPolling() {
  if (!verificationState) return;
  stopVerificationPolling();
  let remainingPolls = VERIFY_EMAIL_MAX_POLLS;
  async function poll() {
    if (!verificationState || remainingPolls <= 0) {
      stopVerificationPolling();
      updateStatus(tx("verify_email_status_poll_timeout") || "We are still waiting for verification. Check your inbox, then resend the email if needed.", true);
      return;
    }
    remainingPolls -= 1;
    try {
      const response = await fetch(`/api/check-email-verified?state=${encodeURIComponent(verificationState)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.verified) {
          stopVerificationPolling();
          await finalizeVerifiedSignup();
          return;
        }
      }
    } catch (e) {
      // ignore errors, keep polling
    }
    verificationPollTimer = window.setTimeout(poll, VERIFY_EMAIL_POLL_INTERVAL_MS);
  }
  poll();
}

function stopVerificationPolling() {
  if (verificationPollTimer) {
    window.clearTimeout(verificationPollTimer);
    verificationPollTimer = null;
  }
}

function wireActions() {
  [resendButton, resendLinkTrigger].forEach((element) => {
    if (!element) return;
    element.addEventListener("click", (event) => {
      event.preventDefault();
      resendVerification();
    });
  });

  if (continueButton) {
    continueButton.addEventListener("click", (event) => {
      event.preventDefault();
      goToLogin();
    });
  }
}

function updateStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.classList.toggle("error", !!isError);
}

function renderVerificationLink(url) {
  if (!linkNode) return;
  linkNode.textContent = url || "";
}

function safeInternalNext(value, fallback = "/onboarding") {
  const next = String(value || "").trim();

  if (!next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  if (/[\r\n]/.test(next)) {
    return fallback;
  }

  return next;
}

function consumeVerifiedSessionFromHash() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (!hash) {
    return false;
  }

  const params = new URLSearchParams(hash);
  const token = String(params.get("token") || "").trim();
  const verified = params.get("verified") === "true";
  const next = safeInternalNext(params.get("next"), "/onboarding");
  if (!token && !verified) {
    return false;
  }

  try {
    if (token) {
      if (typeof setToken === "function") {
        setToken(token);
      } else {
        sessionStorage.setItem("token", token);
      }
    }
    localStorage.removeItem(VERIFICATION_STATE_KEY);
    localStorage.removeItem(SIGNUP_BOOTSTRAP_KEY);
    localStorage.removeItem("pendingVerificationEmail");
  } catch (_) {
    updateStatus(tx("verify_email_status_success"));
    return true;
  }

  updateStatus(tx("verify_email_status_success"));
  stopVerificationPolling();
  window.history.replaceState({}, document.title, "/verify-email");
  if (!token && typeof refreshAccessToken === "function") {
    refreshAccessToken()
      .then((refreshed) => {
        if (refreshed) {
          window.location.replace(next);
          return;
        }
        window.location.replace("/login");
      })
      .catch(() => {
        window.location.replace("/login");
      });
    return true;
  }
  window.location.replace(next);
  return true;
}

async function resendVerification() {
  const state = verificationState || localStorage.getItem(VERIFICATION_STATE_KEY) || "";

  if (!state) {
    updateStatus(tx("verify_email_status_register"), true);
    return;
  }

  try {
    const fetchFn = typeof apiFetch === "function" ? apiFetch : null;
    const response = fetchFn
      ? await fetchFn("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verificationState: state })
        })
      : await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verificationState: state })
        });

    const payload = response ? await response.json().catch(() => null) : null;

    if (!response || !response.ok) {
      updateStatus(
        payload?.error || tx("verify_email_status_resend_error"),
        true
      );
      renderVerificationLink("");
      return;
    }

    if (payload?.verification_state) {
      verificationState = String(payload.verification_state);
      localStorage.setItem(VERIFICATION_STATE_KEY, verificationState);
    }
    renderVerificationLink("");
    updateStatus(payload?.message || tx("verify_email_status_resent"));
  } catch (error) {
    updateStatus(
      (error && error.message) ||
        tx("verify_email_status_resend_error"),
      true
    );
    renderVerificationLink("");
  }
}

function goToLogin() {
  window.location.href = "/login";
}

async function finalizeVerifiedSignup() {
  const signupBootstrapToken = String(localStorage.getItem(SIGNUP_BOOTSTRAP_KEY) || "").trim();
  if (signupBootstrapToken) {
    try {
      const response = await fetch("/api/auth/complete-verified-signup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ signupBootstrapToken })
      });
      const payload = response ? await response.json().catch(() => null) : null;
      if (response && response.ok && payload?.token) {
        if (typeof setToken === "function") {
          setToken(payload.token);
        } else {
          sessionStorage.setItem("token", payload.token);
        }
        localStorage.removeItem(VERIFICATION_STATE_KEY);
        localStorage.removeItem(SIGNUP_BOOTSTRAP_KEY);
        localStorage.removeItem("pendingVerificationEmail");
        updateStatus(tx("verify_email_status_success"));
        window.location.replace(payload?.next || "/onboarding");
        return;
      }
    } catch (_) {
      // Fall through to refresh-based recovery.
    }
  }

  try {
    if (typeof refreshAccessToken === "function") {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        localStorage.removeItem(VERIFICATION_STATE_KEY);
        localStorage.removeItem(SIGNUP_BOOTSTRAP_KEY);
        localStorage.removeItem("pendingVerificationEmail");
        updateStatus(tx("verify_email_status_success"));
        window.location.replace("/onboarding");
        return;
      }
    }
  } catch (_) {
    // Fall through to manual login if cookie-based recovery is unavailable.
  }

  localStorage.removeItem(VERIFICATION_STATE_KEY);
  localStorage.removeItem(SIGNUP_BOOTSTRAP_KEY);
  localStorage.removeItem("pendingVerificationEmail");
  updateStatus(tx("verify_email_status_success"));
  stopVerificationPolling();
  setTimeout(() => {
    window.location.replace("/login");
  }, 1200);
}
