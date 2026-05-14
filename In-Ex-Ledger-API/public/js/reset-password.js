let resetPasswordSubmitting = false;

function setResetPasswordMessage(text, tone = "") {
  const message = document.getElementById("resetPasswordMessage");
  if (!message) {
    return;
  }
  message.textContent = text || "";
  message.hidden = !text;
  message.classList.remove("is-success");
  if (tone === "success") {
    message.classList.add("is-success");
  }
}

function wireResetPasswordToggle() {
  const toggle = document.getElementById("showResetPasswords");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  if (!toggle || !password || !confirmPassword) {
    return;
  }

  toggle.addEventListener("change", () => {
    const type = toggle.checked ? "text" : "password";
    password.type = type;
    confirmPassword.type = type;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetPasswordForm");
  if (!form) {
    return;
  }

  wireResetPasswordToggle();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (resetPasswordSubmitting) {
      return;
    }

    const token = new URLSearchParams(window.location.search).get("token") || "";
    const password = String(document.getElementById("password")?.value || "");
    const confirmPassword = String(document.getElementById("confirmPassword")?.value || "");
    const submitButton = form.querySelector("button[type=\"submit\"]");
    setResetPasswordMessage("");

    if (!token) {
      setResetPasswordMessage("This reset link is missing its token. Request a new email.");
      return;
    }
    if (!password || !confirmPassword) {
      setResetPasswordMessage("Enter and confirm your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setResetPasswordMessage("Passwords do not match.");
      return;
    }

    resetPasswordSubmitting = true;
    submitButton?.setAttribute("disabled", "true");

    try {
      const response = await fetch(buildApiUrl("/api/auth/reset-password"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
        },
        body: JSON.stringify({ token, password, confirmPassword })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to reset password.");
      }

      form.reset();
      setResetPasswordMessage(payload?.message || "Password updated successfully. Redirecting to sign in...", "success");
      window.setTimeout(() => {
        window.location.href = "/login?password_reset=true";
      }, 1200);
    } catch (error) {
      setResetPasswordMessage(error.message || "Unable to reset password.");
    } finally {
      resetPasswordSubmitting = false;
      submitButton?.removeAttribute("disabled");
    }
  });
});
