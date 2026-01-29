const API_BASE = "https://inex-ledger20-production.up.railway.app";
console.log("[AUTH] Protected page loaded:", window.location.pathname);
let editingAccountId = null;
let accountFormState = null;
let accountFormSubmitDefault = "Save account";
const ACCOUNT_FORM_UPDATE_LABEL = "Update account";

/** ================================
 * Initialization
 * ================================ */
document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireAccountForm();
  renderAccountList();
});

/** ================================
 * Form Wiring
 * ================================ */
function wireAccountForm() {
  const showButton = document.getElementById("showAccountForm");
  const formContainer = document.getElementById("accountFormContainer");
  const form = document.getElementById("accountForm");
  const typeSelect = document.getElementById("account-type");
  const message = document.getElementById("accountFormMessage");
  const nameInput = document.getElementById("account-name");
  const cancelButton = document.getElementById("cancelAccountEdit");
  const submitButton = form?.querySelector('button[type="submit"]');

  accountFormState = {
    form,
    formContainer,
    typeSelect,
    message,
    nameInput,
    submitButton
  };

  if (submitButton) {
    accountFormSubmitDefault =
      submitButton.textContent || accountFormSubmitDefault;
  }

  populateAccountTypes(typeSelect);

  if (showButton) {
    showButton.addEventListener("click", () => {
      formContainer.classList.toggle("visible");
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      formContainer.classList.remove("visible");
      resetAccountForm();
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = nameInput.value.trim();
      const type = typeSelect.value;

      if (!name || !type) {
        if (message) message.textContent = "Enter a name and select a type.";
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
      }
      if (message) {
        message.textContent = "";
      }

      try {
        const response = await apiFetch(`${API_BASE}/api/accounts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name, type })
        });

        if (!response) {
          if (message) message.textContent = "Failed to save account.";
          return;
        }

        if (!response.ok) {
          const errorText = await getApiErrorText(response, "Failed to save account.");
          if (message) message.textContent = errorText;
          return;
        }

        resetAccountForm();
        await renderAccountList();
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }
}

/** ================================
 * Dropdown
 * ================================ */
function populateAccountTypes(selectElement) {
  if (!selectElement) return;

  const types = window.LUNA_DEFAULTS?.accountTypes || [
    { value: "checking", label: "Checking" },
    { value: "savings", label: "Savings" },
    { value: "credit", label: "Credit Card" },
    { value: "cash", label: "Cash" },
    { value: "loan", label: "Loan" },
    { value: "other", label: "Other" }
  ];

  selectElement.innerHTML = '<option value="">Select type</option>';

  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.label;
    selectElement.appendChild(option);
  });
}

/** ================================
 * Reset Form
 * ================================ */
function resetAccountForm() {
  editingAccountId = null;
  if (!accountFormState) return;

  const { form, nameInput, typeSelect, submitButton, message } =
    accountFormState;

  if (form) form.reset();
  if (nameInput) nameInput.value = "";
  if (typeSelect) typeSelect.value = "";
  if (submitButton)
    submitButton.textContent = accountFormSubmitDefault;
  if (message) message.textContent = "";
}

/** ================================
 * Render Accounts (POSTGRES)
 * ================================ */
async function renderAccountList() {
  const container = document.getElementById("accountsList");
  if (!container) return;

  const response = await apiFetch(`${API_BASE}/api/accounts`);
  if (!response) {
    console.error("Failed to load accounts: no response");
    showAccountsError("Could not reach the account service.");
    localStorage.removeItem("lb_accounts");
    return;
  }

  if (!response.ok) {
    console.error("Failed to load accounts:", response.status);
    showAccountsError("Unable to load accounts (status " + response.status + ").");
    localStorage.removeItem("lb_accounts");
    return;
  }

  const accounts = await response.json();
  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML =
      `<p class="small-note">No accounts yet. Add one to get started.</p>`;
    return;
  }

  accounts.forEach((account) => {
    const card = document.createElement("div");
    card.className = "account-card";

    card.innerHTML = `
      <div>
        <h3>${account.name}</h3>
        <p class="account-meta">${account.type}</p>
      </div>
      <div>
        <button data-id="${account.id}" class="delete-account">Delete</button>
      </div>
    `;

    card
      .querySelector(".delete-account")
      .addEventListener("click", () => {
        deleteAccount(account.id);
      });

    container.appendChild(card);
  });
}

/** ================================
 * Delete Account (POSTGRES)
 * ================================ */
async function deleteAccount(accountId) {
  const response = await apiFetch(`${API_BASE}/api/accounts/${accountId}`, {
    method: "DELETE"
  });

  if (!response) {
    alert("Failed to delete account.");
    return;
  }

  if (!response.ok) {
    alert("Failed to delete account.");
    return;
  }

  renderAccountList();
}

function showAccountsError(message) {
  const container = document.getElementById("accountsList");
  if (container) {
    container.innerHTML = `<p class="error-message">${message}</p>`;
  }
}

async function getApiErrorText(response, fallback) {
  fallback = fallback || "An error occurred.";
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
  } catch (err) {
    // ignore
  }

  if (response.status === 409) {
    return "An account with this name already exists.";
  }

  return fallback;
}
