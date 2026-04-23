document.addEventListener("DOMContentLoaded", initAccountRecovery);

function initAccountRecovery() {
  const form = document.getElementById("accountRecoveryForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const statusNode = document.getElementById("accountRecoveryStatus");
    const submitButton = form.querySelector('button[type="submit"]');
    const email = form.querySelector('[name="email"]')?.value.trim() || "";
    const recoveryEmail = form.querySelector('[name="recoveryEmail"]')?.value.trim() || "";

    if (!email || !recoveryEmail) {
      setAccountRecoveryStatus("Enter both email addresses.", false, statusNode);
      return;
    }

    submitButton.disabled = true;
    try {
      const response = await fetch(
        typeof buildApiUrl === "function" ? buildApiUrl("/api/auth/account-recovery") : "/api/auth/account-recovery",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, recoveryEmail })
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setAccountRecoveryStatus(payload?.error || "Unable to start account recovery.", false, statusNode);
        return;
      }
      setAccountRecoveryStatus(payload?.message || "If the account and recovery email match, a reset link was sent.", true, statusNode);
      form.reset();
    } catch (error) {
      console.error("Account recovery request failed", error);
      setAccountRecoveryStatus("Unable to reach the server.", false, statusNode);
    } finally {
      submitButton.disabled = false;
    }
  });
}

function setAccountRecoveryStatus(message, isSuccess, statusNode) {
  if (!statusNode) {
    return;
  }
  statusNode.textContent = message || "";
  statusNode.classList.toggle("is-success", !!isSuccess);
  statusNode.hidden = !message;
}
