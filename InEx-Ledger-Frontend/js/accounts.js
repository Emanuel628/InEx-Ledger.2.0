const ACCOUNTS_STORAGE_KEY = "lb_accounts";
const TRANSACTIONS_STORAGE_KEY = "lb_transactions";

let editingAccountId = null;
let accountFormState = null;
let accountFormSubmitDefault = "Save account";
const ACCOUNT_FORM_UPDATE_LABEL = "Update account";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireAccountForm();
  renderAccountList();
});

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
    accountFormSubmitDefault = submitButton.textContent || accountFormSubmitDefault;
  }

  populateAccountTypes(typeSelect);

  if (showButton && formContainer) {
    showButton.addEventListener("click", () => {
      formContainer.classList.toggle("visible");
      if (!formContainer.classList.contains("visible")) {
        resetAccountForm();
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      if (formContainer) {
        formContainer.classList.remove("visible");
      }
      resetAccountForm();
    });
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const nameInput = document.getElementById("account-name");
      const typeInput = document.getElementById("account-type");

      const name = nameInput.value.trim();
      const type = typeInput.value;

      if (!name || !type) {
        if (message) {
          message.textContent = "Enter a name and select a type.";
        }
        return;
      }

      const accounts = getAccounts();
      if (editingAccountId) {
        const index = accounts.findIndex((account) => account.id === editingAccountId);
        if (index >= 0) {
          accounts[index] = { ...accounts[index], name, type };
        }
      } else {
        accounts.push({
          id: `acct_${Date.now()}`,
          name,
          type,
          createdAt: new Date().toISOString(),
          used: false
        });
      }

      saveAccounts(accounts);
      window.dispatchEvent(new Event("accountsUpdated"));

      if (message) {
        message.textContent = "";
      }

      resetAccountForm();
      renderAccountList();
    });
  }
}

function resetAccountForm() {
  editingAccountId = null;
  if (!accountFormState) {
    return;
  }
  const { form, nameInput, typeSelect, submitButton, message } = accountFormState;
  if (form) {
    form.reset();
  }
  if (nameInput) {
    nameInput.value = "";
  }
  if (typeSelect) {
    typeSelect.value = "";
  }
  if (submitButton) {
    submitButton.textContent = accountFormSubmitDefault;
  }
  if (message) {
    message.textContent = "";
  }
}

function startEditingAccount(account) {
  if (!accountFormState) {
    return;
  }
  const { formContainer, nameInput, typeSelect, submitButton } = accountFormState;
  editingAccountId = account.id;
  if (formContainer) {
    formContainer.classList.add("visible");
  }
  if (nameInput) {
    nameInput.value = account.name;
  }
  if (typeSelect) {
    typeSelect.value = account.type;
  }
  if (submitButton) {
    submitButton.textContent = ACCOUNT_FORM_UPDATE_LABEL;
  }
}

function renderAccountList() {
  const container = document.getElementById("accountsList");
  const message = document.getElementById("accountMessage");
  const accounts = getAccounts();
  if (message) {
    message.textContent = "";
  }
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (accounts.length === 0) {
    const message =
      typeof t === "function"
        ? t("accounts_no_accounts")
        : "No accounts yet. Add one to get started.";
    container.innerHTML = `<p class="small-note">${message}</p>`;
    return;
  }

  accounts.forEach((account) => {
    const card = document.createElement("div");
    card.className = "account-card";

    const left = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = account.name;
    left.appendChild(name);

    const meta = document.createElement("p");
    meta.className = "account-meta";
    const typeLabel = formatAccountType(account.type);
    meta.textContent = `${typeLabel} - Created ${formatDate(
      account.createdAt
    )}`;
    left.appendChild(meta);

    const used = document.createElement("p");
    used.className = "account-meta";
    used.textContent = account.used
      ? "In use by transactions"
      : "Not used yet";
    left.appendChild(used);

    const right = document.createElement("div");
    const editButton = document.createElement("button");
    editButton.textContent = "Edit";
    editButton.type = "button";
    editButton.addEventListener("click", () => {
      startEditingAccount(account);
    });
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      handleAccountDelete(account.id, message);
    });
    right.appendChild(editButton);
    right.appendChild(deleteButton);

    card.appendChild(left);
    card.appendChild(right);
    container.appendChild(card);
  });
}

function handleAccountDelete(accountId, messageContainer) {
  const accounts = getAccounts();
  const target = accounts.find((account) => account.id === accountId);
  if (!target) {
    return;
  }

  const used = isAccountUsed(accountId);
  if (used) {
    const warning =
      typeof t === "function"
        ? t("accounts_delete_warning") || `This account is used by transactions. Type DELETE to remove it.`
        : `This account is used by transactions. Type DELETE to remove it.`;
    const confirmation = window.prompt(warning);
    if (confirmation !== "DELETE") {
      if (messageContainer) {
        messageContainer.textContent =
          typeof t === "function"
            ? t("accounts_delete_confirm_required") || "Type DELETE to confirm deletion."
            : "Type DELETE to confirm deletion.";
      }
      return;
    }
  } else {
    const confirmMessage =
      typeof t === "function"
        ? t("accounts_delete_confirm") || `Delete ${target.name}?`
        : `Delete ${target.name}?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
  }

  const transactions = getTransactions();
  const updatedTransactions = transactions.map((txn) => {
    if (txn.accountId === accountId) {
      return { ...txn, accountName: target.name, accountDeleted: true };
    }
    return txn;
  });
  if (JSON.stringify(transactions) !== JSON.stringify(updatedTransactions)) {
    saveTransactions(updatedTransactions);
  }

  const filtered = accounts.filter((account) => account.id !== accountId);
  saveAccounts(filtered);

  if (messageContainer) {
    messageContainer.textContent = "";
  }

  window.dispatchEvent(new Event("accountsUpdated"));
  renderAccountList();
}

function populateAccountTypes(selectElement) {
  const types = window.LUNA_DEFAULTS?.accountTypes || [];
  if (!selectElement || types.length === 0) return;

  selectElement.innerHTML = '<option value="">Select type</option>';
  types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.label;
    selectElement.appendChild(option);
  });
}

function getAccounts() {
  const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function getTransactions() {
  const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isAccountUsed(accountId) {
  const transactions = getTransactions();
  return transactions.some((txn) => txn.accountId === accountId);
}

function formatAccountType(type) {
  const match =
    window.LUNA_DEFAULTS?.accountTypes?.find((item) => item.value === type) ||
    {};
  return match.label || type;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}



