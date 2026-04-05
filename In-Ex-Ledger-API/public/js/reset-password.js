/* =========================================================
   Reset Password Page JS
   ========================================================= */

init();

function init() {
  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  const statusEl = document.getElementById("resetPasswordStatus");
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    setStatus("The reset link is missing or invalid.", false, statusEl);
    form.querySelector("button").disabled = true;
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
  const password = passwordInput?.value.trim();
  const confirm = confirmInput?.value.trim();

  if (!password || !confirm) {
    setStatus("Please fill out both password fields.", false, statusEl);
    return;
  }

  if (password !== confirm) {
    setStatus("Passwords do not match.", false, statusEl);
    return;
  }

  button.disabled = true;

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
      setStatus(payload?.error ?? "Unable to reset password.", false, statusEl);
      return;
    }

    setStatus(payload?.message ?? "Password reset successfully.", true, statusEl);
    form.reset();
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
