const STORAGE_KEYS = {
  accounts: "lb_accounts",
  categories: "lb_categories",
  transactions: "lb_transactions"
};

const ledgerState = {
  transactions: []
};

const transactionFilters = {
  search: "",
  category: ""
};

const DRAWER_OPEN_LABEL = "+ Add New";
const DRAWER_CLOSE_LABEL = "Close";
let transactionDrawerElement = null;
let transactionToggleElement = null;
let transactionModalElement = null;
let transactionModalNoteInput = null;
let activeModalTransactionId = null;
let editingTransactionId = null;
let transactionsLoading = false;
const SLOT_ANIMATION_KEY = "lb_transactions_slot_played";
let slotAnimationPlayed = false;
const missingAccountWarnings = new Set();
const missingCategoryWarnings = new Set();
console.log("[AUTH] Protected page loaded:", window.location.pathname);

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();

  if (typeof enforceTrial === "function") {
    enforceTrial();
  }

  if (typeof enforceTrial === "function") {
    enforceTrial();
  }

  if (typeof renderTrialBanner === "function") {
    renderTrialBanner("trialBanner");
  }

  setupTransactionDrawer();
  wireTransactionIntentButtons();

  seedDefaultCategories();
  wireTransactionForm();
  populateAccountsFromStorage();
  populateCategoriesFromStorage();
  loadTransactions();
  wireTransactionSearch();
  wireTransactionCategoryFilter();
  wireTransactionModal();
  window.addEventListener("accountsUpdated", () => {
    populateAccountsFromStorage();
    renderTransactionList();
  });

  const tier = effectiveTier();
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");
  const upsellDismissed = localStorage.getItem("lb_transactions_upsell_hidden") === "true";

  if (cockpit) {
    cockpit.style.display = tier === "free" ? "none" : "block";
  }

  if (upsell) {
    const shouldShowUpsell = tier === "free" && !upsellDismissed;
    upsell.style.display = shouldShowUpsell ? "block" : "none";
    const dismissButton = upsell.querySelector(".upsell-dismiss");
    if (dismissButton) {
      dismissButton.addEventListener("click", () => {
        upsell.style.display = "none";
        localStorage.setItem("lb_transactions_upsell_hidden", "true");
      });
    }
  }

  const upgradeButton = document.querySelector("[data-upgrade]");
  if (upgradeButton) {
    upgradeButton.addEventListener("click", () => {
      window.location.href = "subscription.html";
    });
  }
});

function wireTransactionForm() {
  const form = document.querySelector("form");
  const accountHelp = document.getElementById("accountHelp");
  const categoryHelp = document.getElementById("categoryHelp");
  const message = document.getElementById("transactionFormMessage");

  updateHelpText(accountHelp, categoryHelp);

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const dateInput = document.getElementById("date");
    const descriptionInput = document.getElementById("description");
    const amountInput = document.getElementById("amount");
    const accountSelect = document.getElementById("account");
    const categorySelect = document.getElementById("category");
    const typeSelect = document.getElementById("txType");

    const date = dateInput.value;
    const description = descriptionInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const accountId = accountSelect.value;
    const categoryId = categorySelect.value;
    const type = typeSelect?.value === "income" ? "income" : "expense";

    const validationError = validateTransactionForm({
      date,
      description,
      amount,
      accountId,
      categoryId,
      type
    });

    if (validationError) {
      setTransactionFormMessage(validationError);
      return;
    }

    setTransactionFormMessage("");

    const submitButton = document.querySelector(".tx-actions button");
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const categoriesById = mapById(getCategories());
      const taxLabel = categoriesById[categoryId]?.taxLabel || "";

      const transactionPayload = {
        date,
        description,
        amount,
        accountId,
        categoryId,
        type,
        taxLabel
      };

      const transactions = getTransactions();
      if (editingTransactionId) {
        const idx = transactions.findIndex((txn) => txn.id === editingTransactionId);
        if (idx >= 0) {
          const existing = transactions[idx];
          transactions[idx] = {
            ...existing,
            ...transactionPayload
          };
        }
      } else {
        transactions.push({
          ...transactionPayload,
          id: `txn_${Date.now()}`,
          receiptId: "",
          note: ""
        });
      }
      saveTransactions(transactions);

      markAccountAsUsed(accountId);
      ledgerState.transactions = transactions;

      populateAccountsFromStorage();
      populateCategoriesFromStorage();
      applyFilters();
      renderTotals();

      form.reset();
      closeTransactionDrawer();
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function setupTransactionDrawer() {
  transactionDrawerElement = document.getElementById("txDrawer");
  transactionToggleElement = document.getElementById("addTxToggle");

  if (!transactionDrawerElement || !transactionToggleElement) {
    return;
  }

  transactionToggleElement.addEventListener("click", () => {
    if (transactionDrawerElement.hasAttribute("hidden")) {
      openTransactionDrawer();
    } else {
      closeTransactionDrawer();
    }
  });

  closeTransactionDrawer();
}

function openTransactionDrawer() {
  if (!transactionDrawerElement || !transactionToggleElement) {
    return;
  }

  transactionDrawerElement.removeAttribute("hidden");
  transactionToggleElement.textContent = DRAWER_CLOSE_LABEL;
  transactionToggleElement.setAttribute("aria-expanded", "true");
  setTimeout(() => {
    document.getElementById("txType")?.focus();
  }, 0);
}

function closeTransactionDrawer() {
  if (!transactionDrawerElement || !transactionToggleElement) {
    return;
  }

  transactionDrawerElement.setAttribute("hidden", "");
  transactionToggleElement.textContent = DRAWER_OPEN_LABEL;
  transactionToggleElement.setAttribute("aria-expanded", "false");
  resetTransactionForm();
}

function updateHelpText(accountHelp, categoryHelp) {
  const accounts = getAccounts();
  const categories = getCategories();

  if (accountHelp) {
    accountHelp.textContent = accounts.length === 0
      ? "Create an account to record transactions."
      : "";
  }

  if (categoryHelp) {
    categoryHelp.textContent = categories.length === 0
      ? "Add categories (income/expense) before recording activity."
      : "";
  }
}

function loadTransactions() {
  setTransactionsLoading(true);
  ledgerState.transactions = getTransactions();

  renderAccountOptions();
  renderCategoryOptions();
  renderTotals();

  setTransactionsLoading(false);
}

function renderAccountOptions() {
  populateAccountsFromStorage();
  updateHelpText(
    document.getElementById("accountHelp"),
    document.getElementById("categoryHelp")
  );
}

function renderCategoryOptions() {
  populateCategoriesFromStorage();
  updateHelpText(
    document.getElementById("accountHelp"),
    document.getElementById("categoryHelp")
  );
}

function wireTransactionSearch() {
  const searchInput = document.getElementById("transactionSearch");
  if (!searchInput) {
    return;
  }
  let debounceTimer = null;
  searchInput.addEventListener("input", () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      transactionFilters.search = searchInput.value;
      applyFilters();
    }, 150);
  });
}

function wireTransactionCategoryFilter() {
  const filter = document.getElementById("transactionCategoryFilter");
  if (!filter) {
    return;
  }
  filter.addEventListener("change", () => {
    transactionFilters.category = filter.value;
    applyFilters();
  });
}

function wireTransactionModal() {
  transactionModalElement = document.getElementById("transactionModal");
  transactionModalNoteInput = document.getElementById("transactionModalNote");
  const saveNoteButton = document.getElementById("transactionModalSaveNote");
  const editEntryButton = document.getElementById("transactionModalEditEntry");
  const deleteButton = document.getElementById("transactionModalDelete");
  const closeButton = document.getElementById("transactionModalClose");

  if (!transactionModalElement) {
    return;
  }

  saveNoteButton?.addEventListener("click", () => {
    if (!activeModalTransactionId) {
      return;
    }
    const note = transactionModalNoteInput?.value || "";
    updateTransactionNote(activeModalTransactionId, note);
  });

  editEntryButton?.addEventListener("click", () => {
    if (!activeModalTransactionId) {
      return;
    }
    handleEditEntry(activeModalTransactionId);
  });

  deleteButton?.addEventListener("click", () => {
    if (!activeModalTransactionId) {
      return;
    }
    handleTransactionDelete(activeModalTransactionId);
  });

  closeButton?.addEventListener("click", closeTransactionModal);
}

function openTransactionModal(transactionId) {
  const transaction = (ledgerState.transactions || []).find((txn) => txn.id === transactionId);
  if (!transaction || !transactionModalElement) {
    return;
  }
  activeModalTransactionId = transactionId;
  if (transactionModalNoteInput) {
    transactionModalNoteInput.value = transaction.note || "";
  }
  transactionModalElement.classList.remove("hidden");
}

function closeTransactionModal() {
  if (!transactionModalElement) {
    return;
  }
  transactionModalElement.classList.add("hidden");
  activeModalTransactionId = null;
  if (transactionModalNoteInput) {
    transactionModalNoteInput.value = "";
  }
}

function updateTransactionNote(transactionId, note) {
  const transactions = getTransactions();
  const updated = transactions.map((txn) => {
    if (txn.id === transactionId) {
      return { ...txn, note };
    }
    return txn;
  });
  ledgerState.transactions = updated;
  saveTransactions(updated);
  applyFilters();
}

function handleEditEntry(transactionId) {
  const transactions = ledgerState.transactions.length
    ? ledgerState.transactions
    : getTransactions();
  const transaction = transactions.find((txn) => txn.id === transactionId);
  if (!transaction) {
    return;
  }
  editingTransactionId = transactionId;
  setEditingMode(true);
  prefillTransactionForm(transaction);
  openTransactionDrawer();
  closeTransactionModal();
}

function prefillTransactionForm(transaction) {
  const dateInput = document.getElementById("date");
  const descriptionInput = document.getElementById("description");
  const amountInput = document.getElementById("amount");
  const accountSelect = document.getElementById("account");
  const categorySelect = document.getElementById("category");
  const typeSelect = document.getElementById("txType");

  if (dateInput) {
    dateInput.value = transaction.date || "";
  }
  if (descriptionInput) {
    descriptionInput.value = transaction.description || "";
  }
  if (amountInput) {
    amountInput.value = transaction.amount !== undefined ? transaction.amount : "";
  }
  if (accountSelect) {
    accountSelect.value = transaction.accountId || "";
  }
  if (categorySelect) {
    categorySelect.value = transaction.categoryId || "";
  }
  if (typeSelect) {
    typeSelect.value = transaction.type || "expense";
  }
}

function resetTransactionForm() {
  const form = document.querySelector("form");
  if (form) {
    form.reset();
  }
  editingTransactionId = null;
  setEditingMode(false);
  const message = document.getElementById("transactionFormMessage");
  if (message) {
    message.textContent = "";
  }
}

function setEditingMode(enabled) {
  const submitButton = document.querySelector(".tx-actions button");
  if (!submitButton) {
    return;
  }
  submitButton.textContent = enabled ? "Update transaction" : "Save transaction";
}

function applyFilters() {
  const transactions = ledgerState.transactions || [];
  const term = (transactionFilters.search || "").trim().toLowerCase();
  let filtered = transactions;
  if (term) {
    filtered = filtered.filter((tx) => {
      const desc = (tx.description || "").toLowerCase();
      const cat = (getCategoryName(tx.categoryId) || "").toLowerCase();
      const acct = (getAccountName(tx.accountId) || "").toLowerCase();
      const dest = (tx.destination || "").toLowerCase();
      return (
        desc.includes(term) ||
        cat.includes(term) ||
        acct.includes(term) ||
        dest.includes(term)
      );
    });
  }
  if (transactionFilters.category) {
    filtered = filtered.filter((tx) => tx.categoryId === transactionFilters.category);
  }
  renderTransactionList(filtered);
}

function handleTransactionDelete(transactionId) {
  const current = ledgerState.transactions || [];
  const updated = current.filter((txn) => txn.id !== transactionId);
  ledgerState.transactions = updated;
  saveTransactions(updated);
  if (editingTransactionId === transactionId) {
    editingTransactionId = null;
    setEditingMode(false);
  }
  closeTransactionModal();
  applyFilters();
  renderTotals();
}
function getCategoryName(categoryId) {
  const categories = getCategories();
  const match = categories.find((cat) => cat.id === categoryId);
  return match?.name || "";
}

function getAccountName(accountId) {
  const accounts = getAccounts();
  const match = accounts.find((acct) => acct.id === accountId);
  return match?.name || "";
}

function populateAccountsFromStorage() {
  const select = document.getElementById("txAccount") || document.getElementById("account");
  if (!select) return;

  const accounts = JSON.parse(localStorage.getItem(STORAGE_KEYS.accounts) || "[]");
  select.innerHTML = '<option value="">Select account</option>';
  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name} (${formatAccountType(account.type)})`;
    select.appendChild(option);
  });

  select.disabled = accounts.length === 0;
}

function formatAccountType(type) {
  const match =
    window.LUNA_DEFAULTS?.accountTypes?.find((item) => item.value === type) || {};
  return match.label || type || "Account";
}

function populateCategoriesFromStorage() {
  const select = document.getElementById("txCategory") || document.getElementById("category");
  if (!select) return;

  const categories = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) || "[]");
  select.innerHTML = '<option value="">Select category</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id || category.name;
    option.textContent = category.name;
    select.appendChild(option);
  });

  select.disabled = categories.length === 0;

  populateTransactionCategoryFilter();
}

function populateTransactionCategoryFilter() {
  const select = document.getElementById("transactionCategoryFilter");
  if (!select) return;
  const categories = getCategories();
  const prevValue = select.value;
  select.innerHTML = '<option value="">All categories</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
  select.value = transactionFilters.category || prevValue || "";
}

function renderTransactionList(filteredTransactions) {
  const tbody = document.querySelector("tbody");
  const transactions =
    filteredTransactions !== undefined ? filteredTransactions : ledgerState.transactions || [];
  const isFilteredView = filteredTransactions !== undefined;

  if (!tbody) return;

  if (transactionsLoading && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">Loading transactions...</td></tr>`;
    return;
  }

  if (transactions.length === 0) {
    const emptyText =
      isFilteredView && ledgerState.transactions.length > 0
        ? "No matching transactions."
        : typeof t === "function"
        ? t("transactions_empty")
        : "No transactions yet.";
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">${emptyText}</td></tr>`;
    return;
  }

  const accountsById = mapById(getAccounts());
  const categoriesById = mapById(getCategories());

  
  tbody.innerHTML = "";
  transactions.forEach((txn) => {
    const row = document.createElement("tr");
    const typeClass = txn.type === "income" ? "tx-income" : "tx-expense";
    row.classList.add(typeClass);
    const typeKey =
      txn.type === "income" ? "transaction_type_income" : "transaction_type_expense";
    const typeLabel =
      typeof t === "function" ? t(typeKey) : txn.type === "income" ? "Income" : "Expense";
    const receiptClip = txn.receiptId
      ? '<span class="tx-clip" title="Receipt attached">dY"Z</span>'
      : "";
    const noteIndicator = txn.note
      ? '<span class="tx-note-indicator" title="Note attached">📄</span>'
      : "";
    row.innerHTML = `
      <td>${txn.date}</td>
      <td>
        <span class="tx-type-pill">${typeLabel}</span>
        ${txn.description}${noteIndicator}${receiptClip}
      </td>
      <td>${accountsById[txn.accountId]?.name || "-"}</td>
      <td>${categoriesById[txn.categoryId]?.name || "-"}</td>
      <td>${formatCurrency(txn.amount)}</td>
      <td>
        <button
          type="button"
          class="tx-action tx-upload"
          data-action="upload-receipt"
          data-id="${txn.id}"
        >
          Upload receipt
        </button>
        <button
          type="button"
          class="tx-action"
          data-action="edit-transaction"
          data-id="${txn.id}"
        >
          Edit
        </button>
      </td>
    `;
    tbody.appendChild(row);
    const uploadButton = row.querySelector('[data-action="upload-receipt"]');
    if (uploadButton) {
      uploadButton.addEventListener("click", () => {
        triggerReceiptUpload(txn.id);
      });
    }

    const editButton = row.querySelector('[data-action="edit-transaction"]');
    if (editButton) {
      editButton.addEventListener("click", () => {
        openTransactionModal(txn.id);
      });
    }
  });
}


function renderTotals() {
  const incomeLabel = document.getElementById("incomeYTD");
  const expensesLabel = document.getElementById("expensesYTD");
  const netLabel = document.getElementById("netProfitYTD");
  const taxLabel = document.getElementById("taxOwed");
  const setAsideLabel = document.getElementById("monthlySetAside");

  const totals = calculateTotals();
  if (incomeLabel) {
    incomeLabel.textContent = formatCurrency(totals.income);
  }
  if (expensesLabel) {
    expensesLabel.textContent = formatCurrency(totals.expenses);
  }
  if (netLabel) {
    netLabel.textContent = formatCurrency(totals.income - totals.expenses);
  }

  const tier = effectiveTier();
  if (tier !== "free" && taxLabel && setAsideLabel) {
    const taxableIncome = Math.max(0, totals.income - totals.expenses);
    const EST_RATE = 0.25;
    const estimatedTax = taxableIncome * EST_RATE;
    const monthlySetAside = estimatedTax / 12;
    taxLabel.textContent = formatCurrency(estimatedTax);
    setAsideLabel.textContent = formatCurrency(monthlySetAside);
  } else if (taxLabel && setAsideLabel) {
    taxLabel.textContent = formatCurrency(0);
    setAsideLabel.textContent = formatCurrency(0);
  }
  maybePlaySlotAnimation();
}

function calculateTotals() {
  let income = 0;
  let expenses = 0;

  ledgerState.transactions.forEach((txn) => {
    const amount = Math.abs(Number(txn.amount) || 0);
    if (txn.type === "income") {
      income += amount;
    } else {
      expenses += amount;
    }
  });

  return { income, expenses };
}

function mapById(items) {
  return items.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

function getAccounts() {
  return readStorageArray(STORAGE_KEYS.accounts);
}

function getCategories() {
  const categories = readStorageArray(STORAGE_KEYS.categories);
  if (categories.length === 0) {
    return seedDefaultCategories();
  }
  return categories;
}

function getTransactions() {
  return readStorageArray(STORAGE_KEYS.transactions);
}

function markAccountAsUsed(accountId) {
  const accounts = readStorageArray(STORAGE_KEYS.accounts);
  const updated = accounts.map((account) => {
    if (account.id === accountId) {
      return { ...account, used: true };
    }
    return account;
  });
  localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(updated));
}

function readStorageArray(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTransactions(transactions) {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
}

function setTransactionsLoading(isLoading) {
  transactionsLoading = isLoading;
  renderTransactionList();
}

function setTransactionFormMessage(text) {
  const message = document.getElementById("transactionFormMessage");
  if (message) {
    message.textContent = text || "";
  }
}

function validateTransactionForm({ date, description, amount, accountId, categoryId, type }) {
  if (!date) {
    return "Choose a date for the transaction.";
  }
  if (!description) {
    return "Describe the transaction.";
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!accountId) {
    return "Select an account.";
  }
  if (!categoryId) {
    return "Select a category.";
  }
  if (!type) {
    return "Choose a transaction type.";
  }
  return null;
}

let receiptInputElement = null;
const TRANSACTION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

function initReceiptInput() {
  if (receiptInputElement) {
    return;
  }

  receiptInputElement = document.createElement("input");
  receiptInputElement.type = "file";
  receiptInputElement.accept = "image/*,application/pdf";
  receiptInputElement.style.display = "none";
  receiptInputElement.addEventListener("change", async () => {
    const transactionId = receiptInputElement.dataset.transactionId || "";
    const file = receiptInputElement.files?.[0];
    if (file && transactionId) {
      await uploadReceipt(transactionId, file);
    }
    receiptInputElement.value = "";
  });
  document.body.appendChild(receiptInputElement);
}

function triggerReceiptUpload(transactionId) {
  initReceiptInput();
  if (!receiptInputElement) {
    return;
  }

  receiptInputElement.dataset.transactionId = transactionId;
  receiptInputElement.click();
}

async function uploadReceipt(transactionId, file) {
  setTransactionFormMessage("Uploading receipt...");
  const formData = new FormData();
  formData.append("receipt", file);
  if (TRANSACTION_ID_REGEX.test(transactionId || "")) {
    formData.append("transaction_id", transactionId);
  }

  try {
    const response = await fetch(buildApiUrl("/api/receipts"), {
      method: "POST",
      headers: {
        ...authHeader()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      setTransactionFormMessage(error?.error || "Receipt upload failed.");
      return;
    }

    setTransactionFormMessage("Receipt uploaded.");
  } catch (err) {
    console.error("Receipt upload error:", err);
    setTransactionFormMessage("Receipt upload failed.");
  }
}

function seedDefaultCategories() {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) || "[]");
  if (existing.length > 0) {
    return existing;
  }

  const defaults = window.LUNA_DEFAULTS?.categories || {};
  const income = defaults.income || [];
  const expense = defaults.expense || [];
  const seeded = [];

  income.forEach((name) => {
    seeded.push({
      id: `cat_income_${slugify(name)}`,
      name,
      type: "income"
    });
  });

  expense.forEach((name) => {
    seeded.push({
      id: `cat_expense_${slugify(name)}`,
      name,
      type: "expense"
    });
  });

  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(seeded));
  return seeded;
}

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function maybePlaySlotAnimation() {
  if (slotAnimationPlayed) {
    return;
  }
  try {
    if (sessionStorage.getItem(SLOT_ANIMATION_KEY)) {
      slotAnimationPlayed = true;
      return;
    }
  } catch (error) {
    console.warn("[Transactions] Cannot access sessionStorage", error);
  }

  const elements = ["incomeYTD", "expensesYTD", "netProfitYTD"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!elements.length) {
    return;
  }

  elements.forEach((el) => {
    const duration = 0.35 + Math.random() * 0.35;
    el.style.setProperty("--slot-duration", `${duration}s`);
    el.classList.add("slot-spin");
  });

  setTimeout(() => {
    elements.forEach((el) => {
      el.classList.remove("slot-spin");
      el.style.removeProperty("--slot-duration");
    });
  }, 900);

  slotAnimationPlayed = true;
  try {
    sessionStorage.setItem(SLOT_ANIMATION_KEY, "true");
  } catch (error) {
    // ignore
  }
}
function wireTransactionIntentButtons() {
  const buttons = document.querySelectorAll('.txn-intent-btn');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const intent = button.dataset.intent === 'income' ? 'income' : 'expense';
      setTransactionType(intent);
      openTransactionDrawer();
    });
  });
}

function setTransactionType(intent) {
  const typeSelect = document.getElementById('txType');
  if (typeSelect) {
    typeSelect.value = intent;
  }
}
function resolveTransactionAccountName(transaction, accountsById) {
  if (transaction.account_name) {
    return transaction.account_name;
  }
  if (transaction.accountId && accountsById && accountsById[transaction.accountId]) {
    return accountsById[transaction.accountId].name;
  }
  const key = transaction.id || `${transaction.date || "unknown"}-${transaction.amount || "0"}`;
  if (!missingAccountWarnings.has(key)) {
    console.warn(`[Transactions] transaction ${key} missing account_name`);
    missingAccountWarnings.add(key);
  }
  return "-";
}

function resolveTransactionCategoryName(transaction, categoriesById) {
  if (transaction.category_name) {
    return transaction.category_name;
  }
  if (transaction.categoryId && categoriesById && categoriesById[transaction.categoryId]) {
    return categoriesById[transaction.categoryId].name;
  }
  const key = transaction.id || `${transaction.date || "unknown"}-${transaction.amount || "0"}`;
  if (!missingCategoryWarnings.has(key)) {
    console.warn(`[Transactions] transaction ${key} missing category_name`);
    missingCategoryWarnings.add(key);
  }
  return "-";
}
