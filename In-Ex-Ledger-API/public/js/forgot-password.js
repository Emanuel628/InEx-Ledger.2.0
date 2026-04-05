/* =========================================================
   Forgot Password Page JS
   ========================================================= */

init();

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

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
  const button = form.querySelector("button");
  const emailInput = form.querySelector('input[name="email"]');
  const email = emailInput?.value.trim();

  if (!email) {
    setStatus(tx("forgot_password_error_missing"), false, statusEl);
    return;
  }

  button.disabled = true;
  setStatus("", true, statusEl);

  try {
    const response = await fetch(typeof buildApiUrl === "function" ? buildApiUrl("/api/auth/forgot-password") : "/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? tx("forgot_password_error_request"), false, statusEl);
      return;
    }

    const baseMessage =
      payload?.message ?? tx("forgot_password_success");
    const expiresAt = payload?.expiresAt ? new Date(payload.expiresAt).toLocaleString() : null;
    const message = expiresAt
      ? `${baseMessage} ${tx("forgot_password_success_expires")} ${expiresAt}.`
      : baseMessage;

    setStatus(message, true, statusEl);
  } catch (err) {
    console.error(err);
    setStatus(tx("common_server_unreachable"), false, statusEl);
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
