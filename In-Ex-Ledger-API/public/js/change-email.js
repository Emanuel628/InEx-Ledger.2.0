requireValidSessionOrRedirect();

init();

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function init() {
  const form = document.getElementById("changeEmailForm");
  const statusEl = document.getElementById("changeEmailStatus");

  if (!form || !statusEl) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitEmailChange(form, statusEl);
  });
}

async function submitEmailChange(form, statusEl) {
  const submitButton = form.querySelector("button[type='submit']");
  const newEmail = form.newEmail?.value.trim();
  const currentPassword = form.currentPassword?.value || "";

  if (!newEmail || !currentPassword) {
    setStatus(statusEl, tx("change_email_error_missing"), false);
    return;
  }

  submitButton.disabled = true;
  setStatus(statusEl, "", false);

  try {
    const response = await apiFetch("/api/auth/request-email-change", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        newEmail,
        currentPassword
      })
    });

    const payload = await response?.json().catch(() => null);
    if (!response || !response.ok) {
      setStatus(statusEl, payload?.error || tx("change_email_error_request"), false);
      return;
    }

    form.reset();
    setStatus(statusEl, payload?.message || tx("change_email_success"), true);
  } catch (error) {
    console.error("Email change request failed:", error);
    setStatus(statusEl, tx("change_email_error_request"), false);
  } finally {
    submitButton.disabled = false;
  }
}

function setStatus(target, message, isSuccess) {
  target.textContent = message;
  if (!message) {
    target.classList.remove("success", "error");
  } else {
    target.classList.toggle("success", !!isSuccess);
    target.classList.toggle("error", !isSuccess);
  }
  target.hidden = !message;
}
