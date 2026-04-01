/* =========================================================
   Change Email Page JS
   ========================================================= */

requireAuth();

init();

function init() {
  wireForm();
}

function wireForm() {
  const form = document.querySelector("form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleChangeEmail(form);
  });
}

async function handleChangeEmail(form) {
  const emailInput = form.querySelector('input[type="email"]');
  const passwordInput = form.querySelector('input[type="password"]');
  const messageEl = form.querySelector(".form-message") || document.getElementById("changeEmailMessage");

  const newEmail = emailInput ? emailInput.value.trim() : "";
  const currentPassword = passwordInput ? passwordInput.value : "";

  if (!newEmail || !isValidEmail(newEmail)) {
    showMessage(messageEl, "Please enter a valid email address.", "error");
    return;
  }
  if (!currentPassword) {
    showMessage(messageEl, "Please enter your current password.", "error");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await apiFetch("/api/auth/request-email-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail, currentPassword })
    });

    if (!response) return;

    if (!response.ok) {
      const err = await response.json().catch(() => null);
      showMessage(messageEl, err?.error || "Failed to request email change.", "error");
      return;
    }

    showMessage(messageEl, "Check your new email address for a confirmation link.", "success");
    form.reset();
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showMessage(el, text, type) {
  if (!el) { alert(text); return; }
  el.textContent = text;
  el.style.color = type === "error" ? "#ef4444" : "#22c55e";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
