/* =========================================================
   Verify Email Page JS
   ========================================================= */

let statusNode;
let linkNode;
let resendButton;
let resendLinkTrigger;
let continueButton;
let pendingEmail = "";
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", () => {
  statusNode = document.getElementById("verificationStatus");
  linkNode = document.getElementById("verificationLink");
  resendButton = document.getElementById("resendVerificationButton");
  resendLinkTrigger = document.getElementById("resendVerificationLink");
  continueButton = document.getElementById("continueToLoginButton");
  pendingEmail = localStorage.getItem("pendingVerificationEmail") || "";

  wireActions();

  if (consumeVerifiedSessionFromHash()) {
    return;
  }

  if (pendingEmail) {
    updateStatus(tx("verify_email_status_sent"));
  } else {
    updateStatus(tx("verify_email_status_register"), true);
  }
});

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

function consumeVerifiedSessionFromHash() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (!hash) {
    return false;
  }

  const params = new URLSearchParams(hash);
  const token = params.get("token");
  if (!token) {
    return false;
  }

  try {
    if (typeof setToken === "function") {
      setToken(token);
    } else {
      sessionStorage.setItem("token", token);
    }
    localStorage.removeItem("pendingVerificationEmail");
  } catch (_) {
    updateStatus(tx("verify_email_status_success"), true);
    return true;
  }

  updateStatus(tx("verify_email_status_success"));
  window.history.replaceState({}, document.title, "/verify-email");
  window.location.replace("/transactions");
  return true;
}

async function resendVerification() {
  const email =
    pendingEmail || localStorage.getItem("pendingVerificationEmail") || "";

  if (!email) {
    updateStatus(tx("verify_email_status_missing_email"), true);
    return;
  }

  try {
    const fetchFn = typeof apiFetch === "function" ? apiFetch : null;
    const response = fetchFn
      ? await fetchFn("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        })
      : await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
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

    pendingEmail = email;
    localStorage.setItem("pendingVerificationEmail", email);
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
