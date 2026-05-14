let forgotPasswordSubmitting = false;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotPasswordForm");
  const message = document.getElementById("forgotPasswordMessage");
  if (!form || !message) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (forgotPasswordSubmitting) {
      return;
    }

    const email = String(document.getElementById("email")?.value || "").trim();
    const submitButton = form.querySelector("button[type=\"submit\"]");
    message.hidden = true;
    message.textContent = "";
    message.classList.remove("is-success");

    if (!email) {
      message.textContent = "Enter your email address.";
      message.hidden = false;
      return;
    }

    forgotPasswordSubmitting = true;
    submitButton?.setAttribute("disabled", "true");

    try {
      const response = await fetch(buildApiUrl("/api/auth/forgot-password"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
        },
        body: JSON.stringify({ email })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to send reset link.");
      }

      form.reset();
      message.textContent = payload?.message || "If the email is registered, a reset link was sent.";
      message.classList.add("is-success");
      message.hidden = false;
    } catch (error) {
      message.textContent = error.message || "Unable to send reset link.";
      message.hidden = false;
    } finally {
      forgotPasswordSubmitting = false;
      submitButton?.removeAttribute("disabled");
    }
  });
});
