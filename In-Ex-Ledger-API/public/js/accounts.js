const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "cash", label: "Cash" }
];
const ACCOUNTS_TOAST_MS = 3000;

let accountsToastTimer = null;

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireAccountForm();
  await renderAccountList();
  updateReceiptsDot();
});

function wireAccountForm() {
  const showButton = document.getElementById("showAccountForm");
  const formContainer = document.getElementById("accountFormContainer");
  const form = document.getElementById("accountForm");
  const typeSelect = document.getElementById("account-type");
  const nameInput = document.getElementById("account-name");
  const cancelButton = document.getElementById("cancelAccountEdit");
  const message = document.getElementById("accountFormMessage");
  const submitButton = form?.querySelector('button[type="submit"]');

  populateAccountTypes(typeSelect);

  showButton?.addEventListener("click", () => {
    formContainer.hidden = !formContainer.hidden;
    if (!formContainer.hidden) {
      nameInput?.focus();
    }
  });

  cancelButton?.addEventListener("click", () => {
    formContainer.hidden = true;
    form?.reset();
    if (message) {
      message.textContent = "";
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput?.value.trim() || "";
    const type = typeSelect?.value || "";

    if (!name || !type) {
      if (message) {
        message.textContent = "Enter a name and select a type.";
      }
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }
    if (message) {
      message.textContent = "";
    }

    try {
      const response = await apiFetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, type })
      });

      if (!response) {
        throw new Error("Failed to save account.");
      }

      if (!response.ok) {
        throw new Error(await getApiErrorText(response, "Failed to save account."));
      }

      form.reset();
      formContainer.hidden = true;
      showAccountsToast("Account added");
      await renderAccountList();
    } catch (error) {
      if (message) {
        message.textContent = error.message || "Failed to save account.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function populateAccountTypes(selectElement) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = '<option value="">Select type</option>';
  ACCOUNT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.label;
    selectElement.appendChild(option);
  });
}

async function renderAccountList() {
  const container = document.getElementById("accountsList");
  const message = document.getElementById("accountMessage");
  if (!container) {
    return;
  }

  if (message) {
    message.textContent = "";
  }

  try {
    const response = await apiFetch("/api/accounts");
    if (!response) {
      throw new Error("Could not reach the account service.");
    }

    if (!response.ok) {
      throw new Error("Unable to load accounts.");
    }

    const accounts = await response.json();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      container.innerHTML = '<div class="accounts-empty">No accounts yet. Add one to get started.</div>';
      return;
    }

    container.innerHTML = accounts.map((account) => `
      <article class="account-card">
        <div>
          <div class="account-name">${escapeHtml(account.name || "Account")}</div>
          <div class="account-type">${escapeHtml(formatAccountType(account.type))}</div>
        </div>
        <button type="button" class="account-delete-btn" data-account-delete="${escapeHtml(account.id || "")}">Delete</button>
      </article>
    `).join("");

    container.querySelectorAll("[data-account-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const accountId = button.getAttribute("data-account-delete") || "";
        if (!accountId) {
          return;
        }
        await deleteAccount(accountId);
      });
    });
  } catch (error) {
    container.innerHTML = "";
    if (message) {
      message.textContent = error.message || "Unable to load accounts.";
    }
  }
}

async function deleteAccount(accountId) {
  const response = await apiFetch(`/api/accounts/${accountId}`, {
    method: "DELETE"
  });

  if (!response || !response.ok) {
    showAccountsToast("Failed to delete account");
    return;
  }

  showAccountsToast("Account deleted");
  await renderAccountList();
}

function formatAccountType(value) {
  const type = ACCOUNT_TYPES.find((item) => item.value === value);
  return type?.label || value || "Account";
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }

  try {
    const receipts = JSON.parse(localStorage.getItem("lb_receipts") || "[]");
    dot.hidden = !receipts.some((receipt) => !receipt.transactionId && !receipt.transaction_id);
  } catch {
    dot.hidden = true;
  }
}

function showAccountsToast(message) {
  const toast = document.getElementById("accountsToast");
  const messageNode = document.getElementById("accountsToastMessage");
  if (!toast || !messageNode) {
    return;
  }

  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (accountsToastTimer) {
    clearTimeout(accountsToastTimer);
  }
  accountsToastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, ACCOUNTS_TOAST_MS);
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getApiErrorText(response, fallback) {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
  } catch {
  }
  return fallback || "An error occurred.";
}
