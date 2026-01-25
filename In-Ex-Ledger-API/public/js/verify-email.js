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
    resendVerification();
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
  if (!url) {
    linkNode.textContent = "";
    return;
  }

  linkNode.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open verification link</a>`;
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

  if (typeof apiFetch !== "function") {
    updateStatus(
      "Server unavailable. Please try again later.",
      true
    );
    return;
  }

  try {
    const payload = await apiFetch("/auth/send-verification", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    pendingEmail = email;
    localStorage.setItem("pendingVerificationEmail", email);
    if (payload.token) {
      localStorage.setItem("pendingVerificationToken", payload.token);
    }
    if (payload.verificationLink) {
      localStorage.setItem(
        "pendingVerificationLink",
        payload.verificationLink
      );
      renderVerificationLink(payload.verificationLink);
    }
    if (payload.expiresAt) {
      localStorage.setItem(
        "pendingVerificationExpires",
        String(payload.expiresAt)
      );
    }

    const expiresAt = payload.expiresAt
      ? new Date(payload.expiresAt)
      : null;
    const message = expiresAt
      ? `Verification link expires at ${expiresAt.toLocaleTimeString()}.`
      : "Verification link sent.";

    updateStatus(message);
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