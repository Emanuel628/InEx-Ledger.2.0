/** * Section: Configuration & Constants 
 */
const ACCOUNTS_STORAGE_KEY = "lb_accounts";
const TRANSACTIONS_STORAGE_KEY = "lb_transactions";

let editingAccountId = null;
let accountFormState = null;
let accountFormSubmitDefault = "Save account";
const ACCOUNT_FORM_UPDATE_LABEL = "Update account";

/** * Section: Initialization 
 * Runs when the DOM is ready.
 */
document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireAccountForm();
  renderAccountList();
});

/** * Section: Form Setup (Wiring)
 * Attaches listeners and initializes form state.
 */
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

  // Capture default button text
  if (submitButton) {
    accountFormSubmitDefault = submitButton.textContent || accountFormSubmitDefault;
  }

  // Populate the dropdown
  populateAccountTypes(typeSelect);

  // Toggle Visibility
  if (showButton) {
    showButton.addEventListener("click", () => {
      formContainer.classList.toggle("visible");
    });
  }

  // Cancel logic
  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      if (formContainer) {
        formContainer.classList.remove("visible");
      }
      resetAccountForm();
    });
  }

  // Submit handling
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const type = typeSelect.value;

      if (!name || !type) {
        if (message) message.textContent = "Enter a name and select a type.";
        return;
      }

      const accounts = getAccounts();
      if (editingAccountId) {
        const index = accounts.findIndex((a) => a.id === editingAccountId);
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
      resetAccountForm();
      renderAccountList();
    });
  }
}

/** * Section: UI Helpers
 * Populates dropdowns and resets the form state.
 */
function populateAccountTypes(selectElement) {
  if (!selectElement) return;

  // Use LUNA_DEFAULTS if they exist, otherwise use fallback list
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

function resetAccountForm() {
  editingAccountId = null;
  if (!accountFormState) return;
  const { form, nameInput, typeSelect, submitButton, message } = accountFormState;
  
  if (form) form.reset();
  if (nameInput) nameInput.value = "";
  if (typeSelect) typeSelect.value = "";
  if (submitButton) submitButton.textContent = accountFormSubmitDefault;
  if (message) message.textContent = "";
}

function startEditingAccount(account) {
  if (!accountFormState) return;
  const { formContainer, nameInput, typeSelect, submitButton } = accountFormState;
  
  editingAccountId = account.id;
  if (formContainer) formContainer.classList.add("visible");
  if (nameInput) nameInput.value = account.name;
  if (typeSelect) typeSelect.value = account.type;
  if (submitButton) submitButton.textContent = ACCOUNT_FORM_UPDATE_LABEL;
}

/** * Section: Rendering
 * Handles displaying the list of accounts.
 */
function renderAccountList() {
  const container = document.getElementById("accountsList");
  const message = document.getElementById("accountMessage");
  const accounts = getAccounts();
  
  if (message) message.textContent = "";
  if (!container) return;

  container.innerHTML = "";

  if (accounts.length === 0) {
    container.innerHTML = `<p class="small-note">No accounts yet. Add one to get started.</p>`;
    return;
  }

  accounts.forEach((account) => {
    const card = document.createElement("div");
    card.className = "account-card";

    const left = document.createElement("div");
    left.innerHTML = `
      <h3>${account.name}</h3>
      <p class="account-meta">${formatAccountType(account.type)} - Created ${formatDate(account.createdAt)}</p>
      <p class="account-meta">${isAccountUsed(account.id) ? "In use" : "Not used"}</p>
    `;

    const right = document.createElement("div");
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => startEditingAccount(account);
    
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.onclick = () => handleAccountDelete(account.id, message);

    right.appendChild(editBtn);
    right.appendChild(delBtn);
    card.appendChild(left);
    card.appendChild(right);
    container.appendChild(card);
  });
}

/** * Section: Data Logic
 * Handles storage, deletion, and formatting.
 */
function handleAccountDelete(accountId, messageContainer) {
  const accounts = getAccounts();
  const target = accounts.find((a) => a.id === accountId);
  if (!target) return;

  if (isAccountUsed(accountId)) {
    if (window.prompt("Account in use by transactions. Type DELETE to confirm.") !== "DELETE") {
      if (messageContainer) messageContainer.textContent = "Type DELETE to confirm.";
      return;
    }
  } else if (!window.confirm(`Delete ${target.name}?`)) {
    return;
  }

  const filtered = accounts.filter((a) => a.id !== accountId);
  saveAccounts(filtered);
  window.dispatchEvent(new Event("accountsUpdated"));
  renderAccountList();
}

function getAccounts() {
  const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function isAccountUsed(accountId) {
  const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  try {
    const transactions = raw ? JSON.parse(raw) : [];
    return transactions.some((txn) => txn.accountId === accountId);
  } catch { return false; }
}

function formatAccountType(type) {
  const types = window.LUNA_DEFAULTS?.accountTypes || [];
  const match = types.find((item) => item.value === type);
  return match ? match.label : type;
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
