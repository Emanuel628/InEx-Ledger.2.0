requireValidSessionOrRedirect();

init();

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
    setStatus(statusEl, "Enter your new email and current password.", false);
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
      setStatus(statusEl, payload?.error || "Unable to start email change.", false);
      return;
    }

    form.reset();
    setStatus(statusEl, payload?.message || "Confirmation email sent to your new address.", true);
  } catch (error) {
    console.error("Email change request failed:", error);
    setStatus(statusEl, "Unable to start email change.", false);
  } finally {
    submitButton.disabled = false;
  }
}

function setStatus(target, message, isSuccess) {
  target.textContent = message;
  target.classList.toggle("success", !!isSuccess);
  target.classList.toggle("error", !isSuccess);
  target.hidden = !message;
}
