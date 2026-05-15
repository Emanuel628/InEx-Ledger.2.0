const ACCOUNT_SUGGESTIONS_DISMISSED_KEY = "lb_account_suggestions_dismissed";

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
  wireAccountTypeChips();
  wireAccountDeleteModal();
  await renderAccountList();
  setInterval(() => refreshAccountGhosts(), 5 * 60 * 1000);
  updateReceiptsDot();
});

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
      void refreshAccountGhosts();
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

    void refreshAccountGhosts();
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

// ─── Account Ghost Suggestions ────────────────────────────────────────────────
// Detects masked card/account numbers (e.g. ****1234) in transaction
// descriptions and suggests adding them as accounts if not already tracked.

function extractAccountHints(description) {
  const hints = new Set();
  const desc = String(description || "");
  // ****1234 or xxxx1234
  const re1 = /(?:\*{1,4}|[xX]{2,4})[- ]?(\d{4})\b/g;
  // acct/account/card/checking/chequing/savings [ending [in]] [*x] 1234
  const re2 = /(?:acct|account|card|chequing|checking|savings|chk|ach)\s*(?:ending\s*(?:in\s*)?)?\s*[*xX]{0,4}(\d{4})\b/gi;
  // "ending in 1234" or "ending 1234" standalone
  const re3 = /\bending\s+(?:in\s+)?(\d{4})\b/gi;
  let m;
  for (const re of [re1, re2, re3]) {
    while ((m = re.exec(desc)) !== null) hints.add(m[1]);
  }
  return [...hints];
}

function detectAccountSuggestions(transactions, existingAccounts) {
  const dismissed = new Set(
    JSON.parse(localStorage.getItem(ACCOUNT_SUGGESTIONS_DISMISSED_KEY) || "[]")
  );
  const existingNames = new Set(
    existingAccounts.map(a => String(a.name || "").toLowerCase())
  );
  const existingIds = new Set(existingAccounts.map(a => String(a.id || "")));

  const counts = {};
  const samples = {};

  for (const txn of transactions) {
    // Detect from description text
    for (const last4 of extractAccountHints(txn.description || "")) {
      if (dismissed.has(last4)) continue;
      const display = `****${last4}`;
      if (existingNames.has(display.toLowerCase())) continue;
      if ([...existingNames].some(n => n.endsWith(last4))) continue;
      counts[last4] = (counts[last4] || 0) + 1;
      if (!samples[last4]) samples[last4] = String(txn.description || "");
    }

    // Detect from account_name on the transaction (e.g. imported under an account
    // whose name itself contains a masked number not in the accounts list)
    const txnAcctName = String(txn.account_name || txn.accountName || "");
    for (const last4 of extractAccountHints(txnAcctName)) {
      if (dismissed.has(last4)) continue;
      const display = `****${last4}`;
      if (existingNames.has(display.toLowerCase())) continue;
      if ([...existingNames].some(n => n.endsWith(last4))) continue;
      counts[last4] = (counts[last4] || 0) + 1;
      if (!samples[last4]) samples[last4] = txnAcctName || String(txn.description || "");
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([last4, count]) => ({
      last4,
      display: `****${last4}`,
      count,
      sample: samples[last4]
    }));
}

function renderAccountGhosts(suggestions) {
  const panel = document.getElementById("accountGhostPanel");
  if (!panel) return;

  if (!suggestions.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <div class="acc-ghost-header">
      <span class="acc-ghost-badge">New account?</span>
      <span class="acc-ghost-title">We spotted untracked accounts in your transactions</span>
    </div>
  `;

  for (const s of suggestions) {
    const card = document.createElement("article");
    card.className = "account-card acc-ghost-card";
    card.dataset.ghostLast4 = s.last4;
    const txLabel = `${s.count} transaction${s.count === 1 ? "" : "s"}`;
    const preview = escapeHtml(String(s.sample).slice(0, 45));
    card.innerHTML = `
      <div>
        <div class="account-name acc-ghost-name">${escapeHtml(s.display)}</div>
        <div class="account-type acc-ghost-meta">Seen in ${txLabel} &mdash; e.g. &ldquo;${preview}&rdquo;</div>
      </div>
      <div class="acc-ghost-actions">
        <button type="button" class="acc-ghost-add-btn">Add account</button>
        <button type="button" class="acc-ghost-dismiss-btn">Not now</button>
      </div>
    `;

    card.querySelector(".acc-ghost-add-btn").addEventListener("click", () => {
      const nameInput = document.getElementById("account-name");
      const formContainer = document.getElementById("accountFormContainer");
      if (nameInput) nameInput.value = s.display;
      if (formContainer) formContainer.hidden = false;
      formContainer?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      nameInput?.focus();
    });

    card.querySelector(".acc-ghost-dismiss-btn").addEventListener("click", () => {
      const dismissed = new Set(
        JSON.parse(localStorage.getItem(ACCOUNT_SUGGESTIONS_DISMISSED_KEY) || "[]")
      );
      dismissed.add(s.last4);
      localStorage.setItem(ACCOUNT_SUGGESTIONS_DISMISSED_KEY, JSON.stringify([...dismissed]));
      card.remove();
      if (!panel.querySelectorAll(".acc-ghost-card").length) {
        panel.hidden = true;
        panel.innerHTML = "";
      }
    });

    panel.appendChild(card);
  }
}

async function refreshAccountGhosts() {
  const accounts = window.__accountsCache || [];
  try {
    const res = await apiFetch("/api/transactions");
    if (!res || !res.ok) return;
    const payload = await res.json().catch(() => null);
    const transactions = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transactions)
      ? payload.transactions
      : [];
    renderAccountGhosts(detectAccountSuggestions(transactions, accounts));
  } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────
