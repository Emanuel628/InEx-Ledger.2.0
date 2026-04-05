let mfaChallengeForm = null;
let mfaChallengeError = null;
let isSubmittingMfa = false;

const pendingMfaToken = sessionStorage.getItem("lb_pending_mfa_token") || "";
const pendingMfaEmail = sessionStorage.getItem("lb_pending_mfa_email") || "";

document.addEventListener("DOMContentLoaded", () => {
  if (!pendingMfaToken) {
    window.location.href = "login";
    return;
  }

  mfaChallengeForm = document.getElementById("mfaChallengeForm");
  mfaChallengeError = document.getElementById("mfaChallengeError");

  const intro = document.getElementById("mfaChallengeIntro");
  if (intro && pendingMfaEmail) {
    intro.textContent = `Finish signing in for ${pendingMfaEmail}. Enter the code from your authenticator app or use one of your recovery codes.`;
  }

  mfaChallengeForm?.addEventListener("submit", handleMfaChallengeSubmit);
  document.getElementById("mfaChallengeBack")?.addEventListener("click", () => {
    clearPendingMfaState();
    window.location.href = "login";
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
    showMfaChallengeError("Enter your authenticator or recovery code.");
    return;
  }

  isSubmittingMfa = true;
  submitButton?.setAttribute("disabled", "true");

  try {
    const response = await fetch(buildApiUrl("/api/auth/mfa/verify"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mfaToken: pendingMfaToken,
        code,
        trustDevice
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.token) {
      showMfaChallengeError(data?.error || "Unable to verify MFA code.");
      return;
    }

    clearPendingMfaState();
    setToken(data.token);
    if (data?.subscription && typeof applySubscriptionState === "function") {
      applySubscriptionState(data.subscription);
    }
    window.location.href = "transactions";
  } catch (error) {
    console.error("MFA challenge request failed:", error);
    showMfaChallengeError("Unable to reach server. Check your connection and try again.");
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
