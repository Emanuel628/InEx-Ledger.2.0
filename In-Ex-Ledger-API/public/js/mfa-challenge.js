let mfaChallengeForm = null;
let mfaChallengeError = null;
let isSubmittingMfa = false;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

let pendingMfaToken = "";
const POST_LOGIN_HANDOFF_KEY = "lb_post_login_access_token_handoff";
const POST_LOGIN_HANDOFF_AT_KEY = "lb_post_login_access_token_handoff_at";

function syncPendingMfaToken() {
  pendingMfaToken = sessionStorage.getItem("lb_pending_mfa_token") || "";
  return pendingMfaToken;
}

function getPendingMfaEmail() {
  return sessionStorage.getItem("lb_pending_mfa_email") || "";
}

function markPostLoginRefreshBridge() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `post_login_refresh_bridge=1; Max-Age=30; Path=/; SameSite=Strict${secure}`;
}

function markPostLoginAccessHandoff(token) {
  try {
    if (!token) return;
    sessionStorage.setItem(POST_LOGIN_HANDOFF_KEY, token);
    sessionStorage.setItem(POST_LOGIN_HANDOFF_AT_KEY, String(Date.now()));
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  if (!syncPendingMfaToken()) {
    window.location.href = "/login";
    return;
  }

  mfaChallengeForm = document.getElementById("mfaChallengeForm");
  mfaChallengeError = document.getElementById("mfaChallengeError");

  const intro = document.getElementById("mfaChallengeIntro");
  const pendingMfaEmail = getPendingMfaEmail();
  if (intro && pendingMfaEmail) {
    intro.textContent = `${tx("mfa_challenge_intro_prefix")} ${pendingMfaEmail}. ${tx("mfa_challenge_intro_suffix")}`;
  }
  const trustToggle = document.getElementById("mfaTrustDevice");
  if (trustToggle) {
    trustToggle.checked = true;
  }

  mfaChallengeForm?.addEventListener("submit", handleMfaChallengeSubmit);
  document.getElementById("mfaChallengeResend")?.addEventListener("click", handleMfaChallengeResend);
  document.getElementById("mfaChallengeBack")?.addEventListener("click", () => {
    clearPendingMfaState();
    window.location.href = "/login";
  });
});

window.addEventListener("pageshow", () => {
  syncPendingMfaToken();
});

async function handleMfaChallengeSubmit(event) {
  event.preventDefault();
  if (!mfaChallengeForm || isSubmittingMfa) {
    return;
  }
  const currentMfaToken = syncPendingMfaToken();
  if (!currentMfaToken) {
    window.location.href = "/login";
    return;
  }

  const code = document.getElementById("mfaChallengeCode")?.value.trim() || "";
  const trustToggle = document.getElementById("mfaTrustDevice");
  const trustDevice = trustToggle ? trustToggle.checked : true;
  const submitButton = mfaChallengeForm.querySelector("button[type=\"submit\"]");

  clearMfaChallengeError();
  if (!code) {
    showMfaChallengeError(tx("mfa_challenge_error_missing"));
    return;
  }

  isSubmittingMfa = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/mfa/verify"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
      },
      body: JSON.stringify({
        mfaToken: currentMfaToken,
        code,
        trustDevice
      })
    });

    const data = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok || !data?.token) {
      showMfaChallengeError(data?.error || tx("mfa_challenge_error_verify"));
      return;
    }

    clearPendingMfaState();
    setToken(data.token);
    markPostLoginRefreshBridge();
    markPostLoginAccessHandoff(data.token);
    if (data?.subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(data.subscription);
    }
    window.location.href = "/transactions";
  } catch (error) {
    console.error("MFA challenge request failed:", error);
    showMfaChallengeError(tx("login_error_offline"));
  } finally {
    submitButton?.removeAttribute("disabled");
    isSubmittingMfa = false;
  }
}

async function handleMfaChallengeResend(event) {
  const resendButton = event?.currentTarget;
  const currentMfaToken = syncPendingMfaToken();
  if (!currentMfaToken || !resendButton) {
    return;
  }

  clearMfaChallengeError();
  resendButton.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/mfa/resend"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mfaToken: currentMfaToken
      })
    });

    const data = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok || !data?.mfa_token) {
      showMfaChallengeError(data?.error || tx("mfa_challenge_error_resend"));
      return;
    }

    pendingMfaToken = data.mfa_token;
    sessionStorage.setItem("lb_pending_mfa_token", pendingMfaToken);
    showMfaChallengeMessage(data?.message || tx("mfa_challenge_resend_success"), "is-success");
  } catch (error) {
    console.error("MFA resend request failed:", error);
    showMfaChallengeError(tx("mfa_challenge_error_resend"));
  } finally {
    resendButton.removeAttribute("disabled");
  }
}

function showMfaChallengeError(message) {
  showMfaChallengeMessage(message, "");
}

function showMfaChallengeMessage(message, tone = "") {
  if (!mfaChallengeError) {
    return;
  }
  mfaChallengeError.textContent = message || "";
  mfaChallengeError.hidden = !message;
  mfaChallengeError.classList.remove("is-success");
  if (tone) {
    mfaChallengeError.classList.add(tone);
  }
}

function clearMfaChallengeError() {
  showMfaChallengeError("");
}

function clearPendingMfaState() {
  sessionStorage.removeItem("lb_pending_mfa_token");
  sessionStorage.removeItem("lb_pending_mfa_email");
}
