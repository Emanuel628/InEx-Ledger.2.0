let mfaChallengeForm = null;
let mfaChallengeError = null;
let isSubmittingMfa = false;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

const pendingMfaToken = sessionStorage.getItem("lb_pending_mfa_token") || "";
const pendingMfaEmail = sessionStorage.getItem("lb_pending_mfa_email") || "";

document.addEventListener("DOMContentLoaded", () => {
  if (!pendingMfaToken) {
    window.location.href = "/login";
    return;
  }

  mfaChallengeForm = document.getElementById("mfaChallengeForm");
  mfaChallengeError = document.getElementById("mfaChallengeError");

  const intro = document.getElementById("mfaChallengeIntro");
  if (intro && pendingMfaEmail) {
    intro.textContent = `${tx("mfa_challenge_intro_prefix")} ${pendingMfaEmail}. ${tx("mfa_challenge_intro_suffix")}`;
  }

  mfaChallengeForm?.addEventListener("submit", handleMfaChallengeSubmit);
  document.getElementById("mfaChallengeBack")?.addEventListener("click", () => {
    clearPendingMfaState();
    window.location.href = "/login";
  });
});

async function handleMfaChallengeSubmit(event) {
  event.preventDefault();
  if (!mfaChallengeForm || isSubmittingMfa) {
    return;
  }

  const code = document.getElementById("mfaChallengeCode")?.value.trim() || "";
  const trustDevice = !!document.getElementById("mfaTrustDevice")?.checked;
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
        mfaToken: pendingMfaToken,
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

function showMfaChallengeError(message) {
  if (!mfaChallengeError) {
    return;
  }
  mfaChallengeError.textContent = message || "";
  mfaChallengeError.hidden = !message;
}

function clearMfaChallengeError() {
  showMfaChallengeError("");
}

function clearPendingMfaState() {
  sessionStorage.removeItem("lb_pending_mfa_token");
  sessionStorage.removeItem("lb_pending_mfa_email");
}
