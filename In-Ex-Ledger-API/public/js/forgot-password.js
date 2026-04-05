/* =========================================================
   Forgot Password Page JS
   ========================================================= */

init();

function init() {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    requestPasswordReset(form);
  });
}

async function requestPasswordReset(form) {
  const statusEl = document.getElementById("forgotPasswordStatus");
  const linkEl = document.getElementById("forgotPasswordLink");
  const button = form.querySelector("button");
  const emailInput = form.querySelector('input[name="email"]');
  const email = emailInput?.value.trim();

  if (!email) {
    setStatus(typeof t === "function" ? t("forgot_password_email_label") + " required." : "Please enter your email address.", false, statusEl);
    hideLink(linkEl);
    return;
  }

  button.disabled = true;
  setStatus("", true, statusEl);
  hideLink(linkEl);

  try {
    const response = await fetch(typeof buildApiUrl === "function" ? buildApiUrl("/api/auth/forgot-password") : "/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? "Unable to request a reset link.", false, statusEl);
      return;
    }

    const baseMessage =
      payload?.message ?? "If the email is registered, you will receive a reset link shortly.";
    const expiresAt = payload?.expiresAt ? new Date(payload.expiresAt).toLocaleString() : null;
    const message = expiresAt ? `${baseMessage} It expires ${expiresAt}.` : baseMessage;

    setStatus(message, true, statusEl);

    if (payload?.resetLink) {
      showLink(payload.resetLink, linkEl);
    }
  } catch (err) {
    console.error(err);
    setStatus("Server unreachable. Please try again later.", false, statusEl);
  } finally {
    button.disabled = false;
  }
}

function setStatus(message, isSuccess, statusEl) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("success", isSuccess);
  statusEl.classList.toggle("error", !isSuccess);
  statusEl.hidden = !message;
}

function showLink(link, linkEl) {
  if (!linkEl) return;
  linkEl.innerHTML = "";
  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.textContent = link;
  anchor.target = "_blank";
  anchor.rel = "noreferrer noopener";
  linkEl.appendChild(anchor);
  linkEl.hidden = false;
}

function hideLink(linkEl) {
  if (!linkEl) return;
  linkEl.hidden = true;
  linkEl.innerHTML = "";
}
