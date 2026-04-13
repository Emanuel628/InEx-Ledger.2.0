/* =========================================================
   Reset Password Page JS
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function init() {
  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  const statusEl = document.getElementById("resetPasswordStatus");
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    setStatus(tx("reset_password_error_invalid"), false, statusEl);
    const disableBtn = form.querySelector("button");
    if (disableBtn) disableBtn.disabled = true;
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    resetPassword(form, token, statusEl);
  });
}

async function resetPassword(form, token, statusEl) {
  const button = form.querySelector("button");
  const passwordInput = form.querySelector('input[name="password"]');
  const confirmInput = form.querySelector('input[name="confirmPassword"]');
  const password = passwordInput?.value;
  const confirm = confirmInput?.value;

  if (!password || !confirm) {
    setStatus(tx("reset_password_error_missing"), false, statusEl);
    return;
  }

  if (password !== confirm) {
    setStatus(tx("reset_password_error_match"), false, statusEl);
    return;
  }

  if (button) button.disabled = true;

  try {
    const response = await fetch(
      typeof buildApiUrl === "function" ? buildApiUrl("/api/auth/reset-password") : "/api/auth/reset-password",
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password,
        confirmPassword: confirm
      })
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? tx("reset_password_error_request"), false, statusEl);
      return;
    }

    setStatus(payload?.message ?? tx("reset_password_success"), true, statusEl);
    form.reset();
  } catch (err) {
    console.error(err);
    setStatus(tx("common_server_unreachable"), false, statusEl);
  } finally {
    if (button) button.disabled = false;
  }
}

function setStatus(message, isSuccess, statusEl) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("success", isSuccess);
  statusEl.classList.toggle("error", !isSuccess);
  statusEl.hidden = !message;
}
