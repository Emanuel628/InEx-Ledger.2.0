const ACCOUNT_TYPES = [
  { value: "checking", labelKey: "accounts_type_checking" },
  { value: "savings", labelKey: "accounts_type_savings" },
  { value: "credit_card", labelKey: "accounts_type_credit_card" },
  { value: "loan", labelKey: "accounts_type_loan" },
  { value: "cash", labelKey: "accounts_type_cash" },
  { value: "custom", labelKey: "accounts_type_custom" }
];
const ACCOUNTS_TOAST_MS = 3000;
let accountsToastTimer = null;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  wireAccountForm();
  wireBottomAddButton();
  wireAccountTypeChips();
  wireAccountDeleteModal();
  await renderAccountList();
  updateReceiptsDot();
});

function wireBottomAddButton() {
  const btn = document.getElementById("showAccountFormBottom");
  const formContainer = document.getElementById("accountFormContainer");
  const nameInput = document.getElementById("account-name");
  btn?.addEventListener("click", () => {
    if (formContainer) formContainer.hidden = false;
    nameInput?.focus();
    formContainer?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function wireAccountTypeChips() {
  const chips = document.querySelectorAll("[data-chip-type]");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
  });
}

let pendingDeleteAccountId = null;

function wireAccountDeleteModal() {
  const modal = document.getElementById("accountDeleteModal");
  const cancelBtn = document.getElementById("accountDeleteModalCancel");
  const confirmBtn = document.getElementById("accountDeleteModalConfirm");
  cancelBtn?.addEventListener("click", () => {
    if (modal) modal.classList.add("hidden");
    pendingDeleteAccountId = null;
  });
  confirmBtn?.addEventListener("click", async () => {
    if (!pendingDeleteAccountId) return;
    if (modal) modal.classList.add("hidden");
    const id = pendingDeleteAccountId;
    pendingDeleteAccountId = null;
    await executeDeleteAccount(id);
  });
}

function wireAccountForm() {
  const showButton = document.getElementById("showAccountForm");
  const formContainer = document.getElementById("accountFormContainer");
  const form = document.getElementById("accountForm");
  const nameInput = document.getElementById("account-name");
  const cancelButton = document.getElementById("cancelAccountEdit");
  const message = document.getElementById("accountFormMessage");
  const submitButton = form?.querySelector('button[type="submit"]');

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
    const type = document.querySelector("#accountTypeChips .account-type-chip.is-active")?.dataset.chipType || "";

    if (!name || !type) {
      if (message) {
        message.textContent = tx("accounts_error_name_type");
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
        throw new Error(tx("accounts_error_save"));
      }

      if (!response.ok) {
        throw new Error(await getApiErrorText(response, tx("accounts_error_save")));
      }

      form.reset();
      formContainer.hidden = true;
      showAccountsToast(tx("accounts_added"));
      await renderAccountList();
    } catch (error) {
      if (message) {
        message.textContent = error.message || tx("accounts_error_save");
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

  selectElement.innerHTML = `<option value="">${escapeHtml(tx("accounts_select_type"))}</option>`;
  ACCOUNT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = tx(type.labelKey);
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
  container.innerHTML = `<div class="accounts-empty accounts-loading">${escapeHtml(tx("accounts_loading"))}</div>`;

  try {
    const response = await apiFetch("/api/accounts");
    if (!response) {
      throw new Error(tx("accounts_error_unreachable"));
    }

    if (!response.ok) {
      throw new Error(tx("accounts_error_load"));
    }

    const accounts = await response.json();
    window.__accountsCache = accounts;
    syncAccountsCache(accounts);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      container.innerHTML = `<div class="accounts-empty">${escapeHtml(tx("accounts_no_accounts"))}</div>`;
      return;
    }

    container.innerHTML = accounts.map((account) => `
      <article class="account-card">
        <div>
          <div class="account-name">${escapeHtml(account.name || tx("accounts_fallback_name"))}</div>
          <div class="account-type">${escapeHtml(formatAccountType(account.type))}</div>
        </div>
        <button type="button" class="account-delete-btn" data-account-delete="${escapeHtml(account.id || "")}" aria-label="${escapeHtml(tx("common_delete") + " " + (account.name || tx("accounts_fallback_name")))}">${escapeHtml(tx("common_delete"))}</button>
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
      message.textContent = error.message || tx("accounts_error_load");
    }
  }
}

async function deleteAccount(accountId) {
  const account = (window.__accountsCache || []).find((a) => a.id === accountId);
  const name = account?.name || "this account";
  const modal = document.getElementById("accountDeleteModal");
  const body = document.getElementById("accountDeleteModalBody");
  if (modal && body) {
    body.textContent = `Delete "${name}"? This action cannot be undone.`;
    modal.classList.remove("hidden");
    pendingDeleteAccountId = accountId;
  } else {
    if (!window.confirm(tx("accounts_confirm_delete"))) return;
    await executeDeleteAccount(accountId);
  }
}

async function executeDeleteAccount(accountId) {
  try {
    const response = await apiFetch(`/api/accounts/${accountId}`, {
      method: "DELETE"
    });

    if (!response || !response.ok) {
      const payload = response ? await response.json().catch(() => null) : null;
      const msg = payload?.error || tx("accounts_error_delete");
      showAccountsToast(msg);
      return;
    }

    showAccountsToast(tx("accounts_deleted"));
    await renderAccountList();
  } catch (error) {
    showAccountsToast(tx("accounts_error_delete"));
  }
}

function syncAccountsCache(accounts) {
  const normalized = Array.isArray(accounts) ? accounts : [];
  window.dispatchEvent(new CustomEvent("accountsUpdated", { detail: normalized }));
}

function formatAccountType(value) {
  const type = ACCOUNT_TYPES.find((item) => item.value === value);
  return tx(type?.labelKey) || value || tx("accounts_fallback_name");
}

async function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }

  try {
    const response = await apiFetch("/api/receipts");
    if (!response || !response.ok) {
      dot.hidden = true;
      return;
    }
    const payload = await response.json().catch(() => []);
    const receipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];
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

async function getApiErrorText(response, fallback) {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
  } catch {
  }
  return fallback || tx("common_error");
}
