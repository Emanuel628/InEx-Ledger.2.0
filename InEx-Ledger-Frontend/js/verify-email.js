/* =========================================================
   Verify Email Page JS
   ========================================================= */

let statusNode;
let linkNode;
let resendButton;
let resendLinkTrigger;
let continueButton;
let pendingEmail = "";

document.addEventListener("DOMContentLoaded", () => {
  statusNode = document.getElementById("verificationStatus");
  linkNode = document.getElementById("verificationLink");
  resendButton = document.getElementById("resendVerificationButton");
  resendLinkTrigger = document.getElementById("resendVerificationLink");
  continueButton = document.getElementById("continueToLoginButton");
  pendingEmail = localStorage.getItem("pendingVerificationEmail") || "";

  console.log("Verify email page loaded.");
  wireActions();

  if (pendingEmail) {
    updateStatus("Check your inbox for the verification email we just sent.");
  } else {
    updateStatus(
      "Please register to receive a verification link.",
      true
    );
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

async function resendVerification() {
  const email =
    pendingEmail || localStorage.getItem("pendingVerificationEmail") || "";

  if (!email) {
    updateStatus(
      "We need your email address to generate a verification link.",
      true
    );
    return;
  }

  try {
    const response = await fetch("/api/auth/send-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      updateStatus(
        payload?.error || "Unable to send a verification link right now.",
        true
      );
      renderVerificationLink("");
      return;
    }

    pendingEmail = email;
    localStorage.setItem("pendingVerificationEmail", email);
    renderVerificationLink("");
    updateStatus(payload?.message || "Verification email sent.");
  } catch (error) {
    updateStatus(
      (error && error.message) ||
        "Unable to send a verification link right now.",
      true
    );
    renderVerificationLink("");
  }
}

function goToLogin() {
  window.location.href = "login.html";
}
