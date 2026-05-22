const ACCOUNT_SUGGESTIONS_DISMISSED_KEY = "lb_account_suggestions_dismissed";

const ACCOUNT_TYPES = [
  { value: "checking", labelKey: "accounts_type_checking", label: "Checking" },
  { value: "savings", labelKey: "accounts_type_savings", label: "Savings" },
  { value: "credit_card", labelKey: "accounts_type_credit_card", label: "Credit Card" },
  { value: "loan", labelKey: "accounts_type_loan", label: "Loan" },
  { value: "cash", labelKey: "accounts_type_cash", label: "Cash" },
  { value: "custom", labelKey: "accounts_type_custom", label: "Custom" }
];
const ACCOUNTS_TOAST_MS = 3000;
let accountsToastTimer = null;
let accountRecordsCache = [];
let accountSearchTerm = "";
let editingAccountId = null;
let pendingDeleteAccountId = null;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function txf(key, values) {
  if (typeof window.tFormat === "function") {
    return window.tFormat(key, values);
  }
  return String(tx(key)).replace(/\{(\w+)\}/g, (_, token) => values?.[token] ?? "");
}

function extractAccountsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  enhanceAccountsShell();
  wireAccountForm();
  wireAccountTypeChips();
  wireAccountDeleteModal();
  await renderAccountList();
  updateReceiptsDot();
});

function enhanceAccountsShell() {
  const content = document.querySelector(".accounts-content");
  const header = document.querySelector(".accounts-page-header");
  const list = document.getElementById("accountsList");
  if (!content || !header || !list || document.querySelector(".accounts-dashboard")) return;

  const title = header.querySelector(".app-page-title");
  const subtitle = header.querySelector(".app-page-subtitle");
  if (title) title.textContent = tx("accounts_title");
  if (subtitle) subtitle.textContent = tx("accounts_shell_subtitle");

  const dashboard = document.createElement("section");
  dashboard.className = "accounts-dashboard";
  dashboard.setAttribute("aria-label", tx("accounts_overview_aria"));
  dashboard.innerHTML = `
    <article class="account-stat-card"><span class="account-stat-icon total" aria-hidden="true">A</span><div><span>${escapeHtml(tx("accounts_stat_active"))}</span><strong id="accountTotalCount">0</strong><small>${escapeHtml(tx("accounts_stat_active_hint"))}</small></div></article>
    <article class="account-stat-card"><span class="account-stat-icon bank" aria-hidden="true">B</span><div><span>${escapeHtml(tx("accounts_stat_bank"))}</span><strong id="accountBankCount">0</strong><small>${escapeHtml(tx("accounts_stat_bank_hint"))}</small></div></article>
    <article class="account-stat-card"><span class="account-stat-icon cash" aria-hidden="true">C</span><div><span>${escapeHtml(tx("accounts_stat_cash"))}</span><strong id="accountCashCardCount">0</strong><small>${escapeHtml(tx("accounts_stat_cash_hint"))}</small></div></article>
    <article class="account-stat-card"><span class="account-stat-icon currency" aria-hidden="true">$</span><div><span>${escapeHtml(tx("accounts_stat_currency"))}</span><strong id="accountCurrencyLabel">USD</strong><small>${escapeHtml(tx("accounts_stat_currency_hint"))}</small></div></article>
  `;
  header.after(dashboard);

  const toolbar = document.createElement("section");
  toolbar.className = "accounts-toolbar";
  toolbar.setAttribute("aria-label", tx("accounts_tools_aria"));
  toolbar.innerHTML = `
    <label class="account-search-wrap" for="accountSearchInput"><span aria-hidden="true">S</span><input id="accountSearchInput" type="search" placeholder="${escapeHtml(tx("accounts_search_placeholder"))}" autocomplete="off" /></label>
  `;
  dashboard.after(toolbar);

  const panel = document.createElement("section");
  panel.className = "account-sources-panel";
  panel.innerHTML = `
    <div class="account-sources-head"><div><h2>${escapeHtml(tx("accounts_sources_title"))}</h2><p id="accountSourcesSummary">${escapeHtml(txf("accounts_sources_summary", { count: 0 }))}</p></div></div>
  `;
  list.before(panel);
  panel.appendChild(list);

  const guidance = document.createElement("section");
  guidance.className = "accounts-guidance";
  guidance.innerHTML = `<span aria-hidden="true">i</span><p><strong>${escapeHtml(tx("accounts_guidance_title"))}</strong><br>${escapeHtml(tx("accounts_guidance_body"))}</p>`;
  panel.after(guidance);

  document.getElementById("accountSearchInput")?.addEventListener("input", (event) => {
    accountSearchTerm = String(event.target.value || "").trim().toLowerCase();
    renderAccountRows(accountRecordsCache);
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

  showButton?.addEventListener("click", () => openAccountForm());

  cancelButton?.addEventListener("click", () => closeAccountForm());

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput?.value.trim() || "";
    const type = document.querySelector("#accountTypeChips .account-type-chip.is-active")?.dataset.chipType || "";

    if (!name || !type) {
      if (message) message.textContent = tx("accounts_error_name_type");
      return;
    }

    if (submitButton) submitButton.disabled = true;
    if (message) message.textContent = "";

    try {
      const response = await apiFetch(editingAccountId ? `/api/accounts/${editingAccountId}` : "/api/accounts", {
        method: editingAccountId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type })
      });

      if (!response) throw new Error(editingAccountId ? tx("accounts_error_update") : tx("accounts_error_save"));
      if (!response.ok) throw new Error(await getApiErrorText(response, editingAccountId ? tx("accounts_error_update") : tx("accounts_error_save")));

      closeAccountForm();
      showAccountsToast(editingAccountId ? tx("accounts_updated") : tx("accounts_added"));
      await renderAccountList();
    } catch (error) {
      if (message) message.textContent = error.message || tx("accounts_error_save");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function openAccountForm(account = null) {
  const formContainer = document.getElementById("accountFormContainer");
  const form = document.getElementById("accountForm");
  const nameInput = document.getElementById("account-name");
  const submitButton = form?.querySelector('button[type="submit"]');
  const message = document.getElementById("accountFormMessage");
  editingAccountId = account?.id || null;
  if (nameInput) nameInput.value = account?.name || "";
  setActiveAccountType(account?.type || "checking");
  if (submitButton) submitButton.textContent = editingAccountId ? tx("accounts_button_save_changes") : tx("accounts_button_save");
  if (message) message.textContent = "";
  if (formContainer) formContainer.hidden = false;
  nameInput?.focus();
}

function closeAccountForm() {
  const formContainer = document.getElementById("accountFormContainer");
  const form = document.getElementById("accountForm");
  const submitButton = form?.querySelector('button[type="submit"]');
  const message = document.getElementById("accountFormMessage");
  editingAccountId = null;
  formContainer.hidden = true;
  form?.reset();
  setActiveAccountType("checking");
  if (submitButton) submitButton.textContent = tx("accounts_button_save");
  if (message) message.textContent = "";
}

function setActiveAccountType(type) {
  const normalized = ACCOUNT_TYPES.some((item) => item.value === type) ? type : "checking";
  document.querySelectorAll("#accountTypeChips .account-type-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.chipType === normalized);
  });
}

async function renderAccountList() {
  const container = document.getElementById("accountsList");
  const message = document.getElementById("accountMessage");
  if (!container) return;

  if (message) message.textContent = "";
  container.innerHTML = `<div class="accounts-empty accounts-loading">${escapeHtml(tx("accounts_loading"))}</div>`;

  try {
    const response = await apiFetch("/api/accounts");
    if (!response) throw new Error(tx("accounts_error_unreachable"));
    if (!response.ok) throw new Error(tx("accounts_error_load"));

    const accounts = extractAccountsPayload(await response.json().catch(() => null));
    syncAccountsCache(accounts);
    renderAccountRows(accounts);
    void refreshAccountGhosts();
  } catch (error) {
    container.innerHTML = "";
    if (message) message.textContent = error.message || tx("accounts_error_load");
  }
}

function renderAccountRows(accounts) {
  const container = document.getElementById("accountsList");
  if (!container) return;
  const normalized = Array.isArray(accounts) ? accounts : [];
  updateAccountDashboard(normalized);
  const filtered = normalized.filter((account) => {
    if (!accountSearchTerm) return true;
    return [account.name, account.type, formatAccountType(account.type)].some((value) => String(value || "").toLowerCase().includes(accountSearchTerm));
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="accounts-empty">${escapeHtml(accountSearchTerm ? tx("accounts_no_search_matches") : tx("accounts_no_accounts"))}</div>`;
    return;
  }

  container.innerHTML = filtered.map((account) => renderAccountCard(account)).join("");

  container.querySelectorAll("[data-account-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const account = accountRecordsCache.find((item) => String(item.id) === String(button.getAttribute("data-account-edit") || ""));
      if (account) openAccountForm(account);
    });
  });

  container.querySelectorAll("[data-account-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-account-delete") || "";
      if (accountId) await deleteAccount(accountId);
    });
  });
}

function renderAccountCard(account) {
  const name = account.name || tx("accounts_fallback_name");
  const type = account.type || "custom";
  const typeLabel = formatAccountType(type);
  const currency = String(account.currency || inferLedgerCurrency()).toUpperCase();
  const icon = getAccountIcon(type);
  const accent = getAccountAccent(type);
  const isDefault = isLikelyDefaultAccount(account);
  return `
    <article class="account-card premium-account-card" style="--account-accent:${accent.color};--account-icon-bg:${accent.bg};">
      <span class="account-card-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <div class="account-card-main">
        <div class="account-name">${escapeHtml(name)}</div>
        <div class="account-meta-row">
          <span class="account-type">${escapeHtml(txf("accounts_type_account", { type: typeLabel }))}</span>
          <span class="account-meta-pill">${escapeHtml(currency)}</span>
          <span class="account-meta-pill is-active">${escapeHtml(tx("accounts_status_active"))}</span>
          ${isDefault ? `<span class="account-meta-pill">${escapeHtml(tx("accounts_status_default"))}</span>` : ""}
        </div>
      </div>
      <div class="account-actions">
        <button type="button" class="account-menu-btn" aria-label="${escapeHtml(tx("accounts_actions_aria"))}">...</button>
        <div class="account-action-menu">
          <button type="button" data-account-edit="${escapeHtml(account.id || "")}">${escapeHtml(tx("common_edit"))}</button>
          <button type="button" class="account-delete-menu-btn" data-account-delete="${escapeHtml(account.id || "")}">${escapeHtml(tx("common_delete"))}</button>
        </div>
      </div>
    </article>
  `;
}

function updateAccountDashboard(accounts) {
  const total = accounts.length;
  const bank = accounts.filter((account) => ["checking", "savings"].includes(account.type)).length;
  const cashCard = accounts.filter((account) => ["credit_card", "cash"].includes(account.type)).length;
  setText("accountTotalCount", total);
  setText("accountBankCount", bank);
  setText("accountCashCardCount", cashCard);
  setText("accountCurrencyLabel", inferLedgerCurrency());
  setText("accountSourcesSummary", txf("accounts_sources_summary", { count: total }));
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value);
}

function inferLedgerCurrency() {
  const storedRegion = String(localStorage.getItem("lb_region") || window.LUNA_REGION || "").toUpperCase();
  return storedRegion === "CA" ? "CAD" : "USD";
}

function getAccountIcon(type) {
  if (type === "credit_card") return "C";
  if (type === "cash") return "$";
  if (type === "loan") return "L";
  if (type === "savings") return "S";
  return "B";
}

function getAccountAccent(type) {
  if (type === "cash") return { color: "#059669", bg: "#ecfdf5" };
  if (type === "credit_card") return { color: "#7c3aed", bg: "#f3e8ff" };
  if (type === "loan") return { color: "#d97706", bg: "#fffbeb" };
  if (type === "savings") return { color: "#2563eb", bg: "#eff6ff" };
  return { color: "#246dba", bg: "#eff6ff" };
}

function isLikelyDefaultAccount(account) {
  const name = String(account.name || "").toLowerCase().trim();
  return name === "checking" || name === "cash";
}

async function deleteAccount(accountId) {
  const account = accountRecordsCache.find((a) => a.id === accountId);
  const name = account?.name || tx("accounts_fallback_name").toLowerCase();
  const modal = document.getElementById("accountDeleteModal");
  const body = document.getElementById("accountDeleteModalBody");
  if (modal && body) {
    body.textContent = txf("accounts_confirm_delete_named", { name });
    modal.classList.remove("hidden");
    pendingDeleteAccountId = accountId;
  } else {
    if (!window.confirm(tx("accounts_confirm_delete"))) return;
    await executeDeleteAccount(accountId);
  }
}

async function executeDeleteAccount(accountId) {
  try {
    const response = await apiFetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    if (!response || !response.ok) {
      const payload = response ? await response.json().catch(() => null) : null;
      showAccountsToast(payload?.error || tx("accounts_error_delete"));
      return;
    }
    showAccountsToast(tx("accounts_deleted"));
    await renderAccountList();
  } catch {
    showAccountsToast(tx("accounts_error_delete"));
  }
}

function syncAccountsCache(accounts) {
  const normalized = Array.isArray(accounts) ? accounts : [];
  accountRecordsCache = normalized;
  window.dispatchEvent(new CustomEvent("accountsUpdated", { detail: normalized }));
}

function formatAccountType(value) {
  const type = ACCOUNT_TYPES.find((item) => item.value === value);
  const label = type ? tx(type.labelKey) : "";
  return label && label !== type?.labelKey ? label : type?.label || value || tx("accounts_fallback_name");
}

async function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) return;
  try {
    const response = await apiFetch("/api/receipts");
    if (!response || !response.ok) {
      dot.hidden = true;
      return;
    }
    const payload = await response.json().catch(() => []);
    const receipts = Array.isArray(payload) ? payload : Array.isArray(payload?.receipts) ? payload.receipts : [];
    dot.hidden = !receipts.some((receipt) => !receipt.transactionId && !receipt.transaction_id);
  } catch {
    dot.hidden = true;
  }
}

function showAccountsToast(message) {
  const toast = document.getElementById("accountsToast");
  const messageNode = document.getElementById("accountsToastMessage");
  if (!toast || !messageNode) return;
  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (accountsToastTimer) clearTimeout(accountsToastTimer);
  accountsToastTimer = window.setTimeout(() => toast.classList.add("hidden"), ACCOUNTS_TOAST_MS);
}

async function getApiErrorText(response, fallback) {
  try {
    const payload = await response.json();
    if (payload?.error) return payload.error;
  } catch {}
  return fallback || tx("common_error");
}

function readStoredStringArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function extractAccountHints(description) {
  const hints = new Set();
  const desc = String(description || "");
  const re1 = /(?:\*{1,4}|[xX]{2,4})[- ]?(\d{4})\b/g;
  const re2 = /(?:acct|account|card|chequing|checking|savings|chk|ach)\s*(?:ending\s*(?:in\s*)?)?\s*[*xX]{0,4}(\d{4})\b/gi;
  const re3 = /\bending\s+(?:in\s+)?(\d{4})\b/gi;
  let m;
  for (const re of [re1, re2, re3]) {
    while ((m = re.exec(desc)) !== null) hints.add(m[1]);
  }
  return [...hints];
}

function detectAccountSuggestions(transactions, existingAccounts) {
  const dismissed = new Set(readStoredStringArray(ACCOUNT_SUGGESTIONS_DISMISSED_KEY));
  const existingNames = new Set(existingAccounts.map(a => String(a.name || "").toLowerCase()));
  const counts = {};
  const samples = {};
  for (const txn of transactions) {
    for (const source of [txn.description || "", txn.account_name || txn.accountName || ""]) {
      for (const last4 of extractAccountHints(source)) {
        if (dismissed.has(last4)) continue;
        const display = `****${last4}`;
        if (existingNames.has(display.toLowerCase())) continue;
        if ([...existingNames].some(n => n.endsWith(last4))) continue;
        counts[last4] = (counts[last4] || 0) + 1;
        if (!samples[last4]) samples[last4] = String(source || txn.description || "");
      }
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([last4, count]) => ({ last4, display: `****${last4}`, count, sample: samples[last4] }));
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
  panel.innerHTML = `<div class="acc-ghost-header"><span class="acc-ghost-badge">${escapeHtml(tx("accounts_ghost_badge"))}</span><span class="acc-ghost-title">${escapeHtml(tx("accounts_ghost_title"))}</span></div>`;
  for (const s of suggestions) {
    const card = document.createElement("article");
    card.className = "account-card acc-ghost-card";
    card.dataset.ghostLast4 = s.last4;
    const txLabel = txf(s.count === 1 ? "accounts_ghost_seen_count_one" : "accounts_ghost_seen_count_other", { count: s.count });
    const preview = escapeHtml(String(s.sample).slice(0, 45));
    card.innerHTML = `
      <div><div class="account-name acc-ghost-name">${escapeHtml(s.display)}</div><div class="account-type acc-ghost-meta">${escapeHtml(txf("accounts_ghost_seen_in", { count: txLabel, sample: String(s.sample).slice(0, 45) }))}</div></div>
      <div class="acc-ghost-actions"><button type="button" class="acc-ghost-add-btn">${escapeHtml(tx("accounts_add"))}</button><button type="button" class="acc-ghost-dismiss-btn">${escapeHtml(tx("accounts_ghost_dismiss"))}</button></div>
    `;
    card.querySelector(".acc-ghost-add-btn").addEventListener("click", () => {
      openAccountForm({ name: s.display, type: "checking" });
      editingAccountId = null;
    });
    card.querySelector(".acc-ghost-dismiss-btn").addEventListener("click", () => {
      const dismissed = new Set(readStoredStringArray(ACCOUNT_SUGGESTIONS_DISMISSED_KEY));
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
  const accounts = accountRecordsCache;
  try {
    const res = await apiFetch("/api/transactions?all=true");
    if (!res || !res.ok) return;
    const payload = await res.json().catch(() => null);
    const transactions = Array.isArray(payload) ? payload : Array.isArray(payload?.transactions) ? payload.transactions : [];
    renderAccountGhosts(detectAccountSuggestions(transactions, accounts));
  } catch {}
}
