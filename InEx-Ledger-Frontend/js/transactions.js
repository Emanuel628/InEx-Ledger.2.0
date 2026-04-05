const STORAGE_KEYS = {
  accounts: "lb_accounts",
  categories: "lb_categories",
  transactions: "lb_transactions",
  receipts: "lb_receipts"
};

const ledgerState = {
  transactions: []
};

const transactionFilters = {
  type: "all",
  search: "",
  category: ""
};

const DRAWER_OPEN_LABEL = "+ Add new";
const DRAWER_CLOSE_LABEL = "Close";
const US_TAX_RATE = 0.24;
const CANADA_TAX_RATES = {
  AB: 0.05,
  BC: 0.12,
  MB: 0.12,
  NB: 0.15,
  NL: 0.15,
  NS: 0.15,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.14975,
  SK: 0.11,
  YT: 0.05
};
const DEFAULT_CA_RATE = 0.05;
let transactionDrawerElement = null;
let transactionToggleElement = null;
let transactionPageToggleElement = null;
let transactionModalElement = null;
let activeModalTransactionId = null;
let editingTransactionId = null;
let transactionsLoading = false;
const SLOT_ANIMATION_KEY = "lb_transactions_slot_played";
let slotAnimationPlayed = false;
const missingAccountWarnings = new Set();
const missingCategoryWarnings = new Set();
let businessTaxProfile = {
  region: "US",
  province: "",
  rate: US_TAX_RATE
};
let unattachedReceiptsCount = 0;
let pendingTransactionReceiptFile = null;
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

  if (typeof renderTrialBanner === "function") {
    renderTrialBanner("trialBanner");
  }

  setupTransactionDrawer();
  initSidebarTypeFilter();
  wireTransactionIntentButtons();
  await loadBusinessTaxProfile();

  wireTransactionForm();
  await refreshAccountOptions();
  await refreshCategoryOptions();
  await loadTransactions();
  wireTransactionSearch();
  wireTransactionCategoryFilter();
  wireTransactionModal();
  window.addEventListener("accountsUpdated", async () => {
    await refreshAccountOptions();
    renderTransactionsTable();
  });

  const tier = effectiveTier();
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");
  const upsellDismissed = localStorage.getItem("lb_transactions_upsell_hidden") === "true";
  const hasTransactions = (ledgerState.transactions || []).length > 0;

  if (cockpit) {
    cockpit.style.display = tier === "free" || !hasTransactions ? "none" : "flex";
  }

  if (upsell) {
    const shouldShowUpsell = tier === "free" && hasTransactions && !upsellDismissed;
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

  updateHelpText(accountHelp, categoryHelp);
  initTransactionReceiptField();

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
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
      const requestBody = {
        account_id: accountId,
        category_id: categoryId,
        amount,
        type,
        description,
        date,
        note: ""
      };

      const endpoint = editingTransactionId
        ? `/api/transactions/${editingTransactionId}`
        : "/api/transactions";
      const method = editingTransactionId ? "PUT" : "POST";
      const response = await apiFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response || !response.ok) {
        const errorPayload = await response?.json().catch(() => null);
        setTransactionFormMessage(errorPayload?.error || "Unable to save transaction.");
        return;
      }

      const savedTransaction = normalizeTransaction(
        await response.json().catch(() => null)
      );

      if (savedTransaction?.id && pendingTransactionReceiptFile) {
        const uploaded = await uploadReceipt(savedTransaction.id, pendingTransactionReceiptFile);
        if (!uploaded) {
          return;
        }
      }

      markAccountAsUsed(accountId);
      await loadTransactions();

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
  transactionPageToggleElement = document.getElementById("addTxTogglePage");

  if (!transactionDrawerElement) {
    return;
  }

  [transactionToggleElement, transactionPageToggleElement].filter(Boolean).forEach((button) => {
    button.addEventListener("click", () => {
      if (transactionDrawerElement.hasAttribute("hidden")) {
        openTransactionDrawer();
      } else {
        closeTransactionDrawer();
      }
    });
  });

  closeTransactionDrawer();
}

function openTransactionDrawer() {
  if (!transactionDrawerElement) {
    return;
  }

  transactionDrawerElement.removeAttribute("hidden");
  if (transactionToggleElement) {
    transactionToggleElement.textContent = DRAWER_CLOSE_LABEL;
    transactionToggleElement.setAttribute("aria-expanded", "true");
  }
  if (transactionPageToggleElement) {
    transactionPageToggleElement.textContent = "Close";
  }
  setTimeout(() => {
    document.getElementById("txType")?.focus();
  }, 0);
}

function closeTransactionDrawer() {
  if (!transactionDrawerElement) {
    return;
  }

  transactionDrawerElement.setAttribute("hidden", "");
  if (transactionToggleElement) {
    transactionToggleElement.textContent = DRAWER_OPEN_LABEL;
    transactionToggleElement.setAttribute("aria-expanded", "false");
  }
  if (transactionPageToggleElement) {
    transactionPageToggleElement.textContent = "+ Add transaction";
  }
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

async function loadTransactions() {
  setTransactionsLoading(true);
  try {
    const [transactions, receiptSnapshot] = await Promise.all([
      fetchTransactionsForPage(),
      fetchReceiptLinksSnapshot()
    ]);

    ledgerState.transactions = transactions.filter(Boolean).map((transaction) => ({
      ...transaction,
      receiptId: receiptSnapshot.byTransactionId[transaction.id] || transaction.receiptId || ""
    }));
    unattachedReceiptsCount = receiptSnapshot.unattachedCount;
    saveTransactions(ledgerState.transactions);
  } catch (error) {
    console.error("Failed to load transactions:", error);
    ledgerState.transactions = getTransactions();
  } finally {
    renderAccountOptions();
    renderCategoryOptions();
    setTransactionsLoading(false);
    applyFilters();
    renderTotals();
  }
}

function renderAccountOptions() {
  populateAccountsFromStorage(getAccounts());
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

function initSidebarTypeFilter() {
  const params = new URLSearchParams(window.location.search);
  const requestedType = params.get("type");
  transactionFilters.type =
    requestedType === "income" || requestedType === "expense" ? requestedType : "all";

  const syncSidebarState = () => {
    document.querySelectorAll("[data-sidebar-filter]").forEach((link) => {
      const filterType = link.getAttribute("data-sidebar-filter") || "all";
      const isActive = filterType === transactionFilters.type;
      link.classList.toggle("nav-link-active", isActive);
      link.classList.toggle("is-active", isActive);
    });
  };

  syncSidebarState();

  document.querySelectorAll("[data-sidebar-filter]").forEach((link) => {
    const filterType = link.getAttribute("data-sidebar-filter") || "all";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      transactionFilters.type =
        filterType === "income" || filterType === "expense" ? filterType : "all";

      const nextUrl =
        transactionFilters.type === "all"
          ? "transactions.html"
          : `transactions.html?type=${transactionFilters.type}`;
      window.history.replaceState({}, "", nextUrl);
      syncSidebarState();
      applyFilters();
    });
  });
}

function wireTransactionModal() {
  transactionModalElement = document.getElementById("transactionModal");
  const deleteButton = document.getElementById("transactionModalDelete");
  const closeButton = document.getElementById("transactionModalClose");

  if (!transactionModalElement) {
    return;
  }

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
  const title = document.getElementById("transactionModalTitle");
  const body = document.getElementById("transactionModalBody");
  activeModalTransactionId = transactionId;
  if (title) {
    title.textContent = "Delete this transaction?";
  }
  if (body) {
    body.textContent = `This will permanently remove "${transaction.description || "this transaction"}" from your ledger.`;
  }
  transactionModalElement.classList.remove("hidden");
}

function closeTransactionModal() {
  if (!transactionModalElement) {
    return;
  }
  transactionModalElement.classList.add("hidden");
  activeModalTransactionId = null;
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
  pendingTransactionReceiptFile = null;
  updateTransactionReceiptLabel();
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
  if (transactionFilters.type === "income" || transactionFilters.type === "expense") {
    filtered = filtered.filter((tx) => tx.type === transactionFilters.type);
  }
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
  renderTransactionsTable(filtered);
}

async function handleTransactionDelete(transactionId) {
  const response = await apiFetch(`/api/transactions/${transactionId}`, {
    method: "DELETE"
  });

  if (!response || !response.ok) {
    const errorPayload = await response?.json().catch(() => null);
    setTransactionFormMessage(errorPayload?.error || "Unable to delete transaction.");
    closeTransactionModal();
    return;
  }

  if (editingTransactionId === transactionId) {
    editingTransactionId = null;
    setEditingMode(false);
  }
  closeTransactionModal();
  await loadTransactions();
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

function renderStoredAccountOptions() {
  populateAccountsFromStorage(getAccounts());
}

function populateAccountsFromStorage(accounts = []) {
  const select = document.getElementById("txAccount") || document.getElementById("account");
  if (!select) return;

  select.innerHTML = '<option value="">Select account</option>';
  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name} (${formatAccountType(account.type)})`;
    select.appendChild(option);
  });

  select.disabled = accounts.length === 0;
}

async function refreshAccountOptions() {
  const accounts = await fetchAccountsForTransactions();
  populateAccountsFromStorage(accounts);
  updateHelpText(
    document.getElementById("accountHelp"),
    document.getElementById("categoryHelp")
  );
}

async function fetchAccountsForTransactions() {
  const fallback = getAccounts();

  try {
    const response = await apiFetch("/api/accounts");
    if (!response || !response.ok) {
      return fallback;
    }

    const accounts = await response.json();
    if (!Array.isArray(accounts)) {
      return fallback;
    }

    localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
    return accounts;
  } catch (error) {
    console.warn("[Transactions] Unable to refresh accounts", error);
    return fallback;
  }
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
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Loading transactions...</td></tr>`;
    return;
  }

  if (transactions.length === 0) {
    const emptyText =
      isFilteredView && ledgerState.transactions.length > 0
        ? "No matching transactions."
        : typeof t === "function"
        ? t("transactions_empty")
        : "No transactions yet.";
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">${emptyText}</td></tr>`;
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

async function refreshCategoryOptions() {
  const categories = await fetchCategoriesForTransactions();
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
  populateCategoriesFromStorage();
}

async function fetchCategoriesForTransactions() {
  const fallback = getCategories();

  try {
    const response = await apiFetch("/api/categories");
    if (!response || !response.ok) {
      return fallback;
    }

    const categories = await response.json().catch(() => []);
    if (!Array.isArray(categories)) {
      return fallback;
    }

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.kind,
      taxLabel:
        businessTaxProfile.region === "CA" ? category.tax_map_ca || "" : category.tax_map_us || ""
    }));
  } catch (error) {
    console.warn("[Transactions] Unable to refresh categories", error);
    return fallback;
  }
}

async function fetchTransactionsForPage() {
  const response = await apiFetch("/api/transactions");
  if (!response || !response.ok) {
    throw new Error("Failed to load transactions.");
  }

  const payload = await response.json().catch(() => null);
  const transactions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.transactions)
    ? payload.transactions
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return transactions.map(normalizeTransaction).filter(Boolean);
}

async function fetchReceiptLinksSnapshot() {
  try {
    const response = await apiFetch("/api/receipts");
    if (!response || !response.ok) {
      return { byTransactionId: {}, unattachedCount: 0 };
    }

    const payload = await response.json().catch(() => []);
    const receipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];

    return receipts.reduce(
      (snapshot, receipt) => {
        if (receipt?.transaction_id) {
          snapshot.byTransactionId[receipt.transaction_id] = receipt.id;
        } else {
          snapshot.unattachedCount += 1;
        }
        return snapshot;
      },
      { byTransactionId: {}, unattachedCount: 0 }
    );
  } catch (error) {
    console.warn("[Transactions] Unable to load receipt links", error);
    return { byTransactionId: {}, unattachedCount: 0 };
  }
}

function normalizeTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return null;
  }

  return {
    id: transaction.id,
    date: String(transaction.date || "").slice(0, 10),
    description: transaction.description || "",
    amount: Number(transaction.amount) || 0,
    accountId: transaction.accountId || transaction.account_id || "",
    categoryId: transaction.categoryId || transaction.category_id || "",
    type: transaction.type === "income" ? "income" : "expense",
    note: transaction.note || "",
    receiptId: transaction.receiptId || transaction.receipt_id || "",
    createdAt: transaction.createdAt || transaction.created_at || ""
  };
}

function renderTransactionsTable(filteredTransactions) {
  const tbody = document.querySelector("tbody");
  const transactions =
    filteredTransactions !== undefined ? filteredTransactions : ledgerState.transactions || [];
  const isFilteredView = filteredTransactions !== undefined;

  if (!tbody) return;

  if (transactionsLoading && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Loading transactions...</td></tr>`;
    return;
  }

  if (transactions.length === 0) {
    const emptyText =
      isFilteredView && ledgerState.transactions.length > 0
        ? "No matching transactions."
        : typeof t === "function"
        ? t("transactions_empty")
        : "No transactions yet.";
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">${emptyText}</td></tr>`;
    return;
  }

  const accountsById = mapById(getAccounts());
  const categoriesById = mapById(getCategories());
  tbody.innerHTML = "";

  transactions.forEach((txn) => {
    const row = document.createElement("tr");
    const categoryName = categoriesById[txn.categoryId]?.name || "-";
    const descriptionSub = txn.note || categoryName || "";
    const amountClass = txn.type === "income" ? "amount-positive" : "amount-negative";
    const amountPrefix = txn.type === "income" ? "+" : "-";
    const receiptMarkup = txn.receiptId
      ? '<span class="receipt-status attached"><span class="receipt-dot"></span><span>Attached</span></span>'
      : '<span class="receipt-status none"><span class="receipt-dot"></span><span>None</span></span>';

    row.innerHTML = `
      <td><span class="date-cell">${formatDisplayDate(txn.date)}</span></td>
      <td><div class="description-primary">${txn.description || "-"}</div><div class="description-sub">${descriptionSub}</div></td>
      <td><span class="account-tag">${accountsById[txn.accountId]?.name || "-"}</span></td>
      <td><span class="category-pill ${getCategoryToneClass(categoryName)}">${categoryName}</span></td>
      <td>${receiptMarkup}</td>
      <td class="amount-cell"><span class="${amountClass}">${amountPrefix}${formatCurrency(Math.abs(Number(txn.amount) || 0))}</span></td>
      <td class="actions-cell">
        <button type="button" class="action-button" data-action="edit-transaction" data-id="${txn.id}">Edit</button>
        <button type="button" class="action-button delete" data-action="delete-transaction" data-id="${txn.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);

    row.querySelector('[data-action="edit-transaction"]')?.addEventListener("click", () => {
      handleEditEntry(txn.id);
    });
    row.querySelector('[data-action="delete-transaction"]')?.addEventListener("click", () => {
      openTransactionModal(txn.id);
    });
  });
}


function renderTotals() {
  const incomeLabel = document.getElementById("incomeYTD");
  const expensesLabel = document.getElementById("expensesYTD");
  const netLabel = document.getElementById("netProfitYTD");
  const taxLabel = document.getElementById("taxOwed");
  const setAsideLabel = document.getElementById("monthlySetAside");
  const taxBannerLabel = document.getElementById("taxBannerLabel");
  const taxBannerNote = document.getElementById("taxBannerNote");
  const incomeDelta = document.getElementById("incomeDelta");
  const expensesDelta = document.getElementById("expensesDelta");
  const transactionCountValue = document.getElementById("transactionCountValue");
  const transactionCountDelta = document.getElementById("transactionCountDelta");
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");

  const totals = calculateTotals();
  const comparison = calculateYearComparisons();
  const transactionsCount = (ledgerState.transactions || []).length;
  if (incomeLabel) {
    incomeLabel.textContent = formatCurrency(totals.income);
  }
  if (expensesLabel) {
    expensesLabel.textContent = formatCurrency(totals.expenses);
  }
  if (netLabel) {
    netLabel.textContent = formatCurrency(totals.income - totals.expenses);
  }
  if (incomeDelta) {
    incomeDelta.innerHTML = `<span class="stat-delta-positive">${formatPercentChange(comparison.income)}</span> vs last year`;
  }
  if (expensesDelta) {
    expensesDelta.innerHTML = `<span class="stat-delta-positive">${formatPercentChange(comparison.expenses)}</span> vs last year`;
  }
  if (transactionCountValue) {
    transactionCountValue.textContent = String(transactionsCount);
  }
  if (transactionCountDelta) {
    transactionCountDelta.textContent = `${countTransactionsThisMonth()} this month`;
  }

  const tier = effectiveTier();
  const hasTransactions = transactionsCount > 0;
  if (tier !== "free" && taxLabel && setAsideLabel) {
    const taxableIncome = Math.max(0, totals.income - totals.expenses);
    const estimatedTax = taxableIncome * businessTaxProfile.rate;
    const monthlySetAside = estimatedTax / 12;
    taxLabel.textContent = formatCurrency(estimatedTax);
    setAsideLabel.textContent = formatCurrency(monthlySetAside);
  } else if (taxLabel && setAsideLabel) {
    taxLabel.textContent = formatCurrency(0);
    setAsideLabel.textContent = formatCurrency(0);
  }
  if (taxBannerLabel) {
    taxBannerLabel.textContent = `Estimated tax owed (${getAppliedTaxLabel()})`;
  }
  if (taxBannerNote) {
    taxBannerNote.textContent = getAppliedTaxNote();
  }
  if (cockpit) {
    cockpit.style.display = tier === "free" || !hasTransactions ? "none" : "flex";
  }
  if (upsell) {
    const upsellDismissed = localStorage.getItem("lb_transactions_upsell_hidden") === "true";
    upsell.style.display = tier === "free" && hasTransactions && !upsellDismissed ? "block" : "none";
  }
  updateReceiptsDot();
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

async function loadBusinessTaxProfile() {
  let fallbackSettings = {};
  try {
    fallbackSettings = JSON.parse(localStorage.getItem("lb_business_settings") || "null") || {};
  } catch {
    fallbackSettings = {};
  }
  const fallbackRegion = String(
    fallbackSettings.region || localStorage.getItem("lb_region") || window.LUNA_REGION || "us"
  ).toUpperCase();
  const fallbackProvince = String(fallbackSettings.province || "").toUpperCase();
  businessTaxProfile = {
    region: fallbackRegion === "CA" ? "CA" : "US",
    province: fallbackRegion === "CA" ? fallbackProvince : "",
    rate:
      fallbackRegion === "CA"
        ? (CANADA_TAX_RATES[fallbackProvince] || DEFAULT_CA_RATE)
        : US_TAX_RATE
  };

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return;
    }

    const business = await response.json();
    const region = String(business?.region || business?.country || businessTaxProfile.region || "US").toUpperCase();
    const province = String(business?.province || "").toUpperCase();
    const isCanada = region === "CA";
    businessTaxProfile = {
      region: isCanada ? "CA" : "US",
      province,
      rate: isCanada ? (CANADA_TAX_RATES[province] || DEFAULT_CA_RATE) : US_TAX_RATE
    };
    localStorage.setItem("lb_region", businessTaxProfile.region.toLowerCase());
  } catch (error) {
    console.warn("[Transactions] Unable to load business tax profile", error);
  }
}

function getAppliedTaxLabel() {
  if (businessTaxProfile.region === "CA") {
    const province = businessTaxProfile.province || "CA";
    const decimals = province === "QC" ? 3 : 0;
    return `${province} ${(businessTaxProfile.rate * 100).toFixed(decimals)}%`;
  }
  return `US ${(businessTaxProfile.rate * 100).toFixed(0)}%`;
}

function getAppliedTaxNote() {
  if (businessTaxProfile.region === "CA") {
    const province = businessTaxProfile.province || "your province";
    return `Based on net profit using the ${province} estimated combined GST/HST/PST/QST rate.`;
  }
  return "Based on net profit at 24% self-employment rate";
}

function formatDisplayDate(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getCategoryToneClass(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("consult")) return "tone-consulting";
  if (value.includes("income") || value.includes("software")) return "tone-green";
  if (value.includes("travel")) return "tone-travel";
  if (value.includes("office")) return "tone-office";
  if (value.includes("marketing")) return "tone-marketing";
  return "tone-default";
}

function calculateYearComparisons() {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  let currentIncome = 0;
  let previousIncome = 0;
  let currentExpenses = 0;
  let previousExpenses = 0;

  (ledgerState.transactions || []).forEach((txn) => {
    const year = Number(String(txn.date || "").slice(0, 4));
    const amount = Math.abs(Number(txn.amount) || 0);
    if (txn.type === "income") {
      if (year === currentYear) currentIncome += amount;
      if (year === previousYear) previousIncome += amount;
    } else {
      if (year === currentYear) currentExpenses += amount;
      if (year === previousYear) previousExpenses += amount;
    }
  });

  return {
    income: computePercentDelta(currentIncome, previousIncome),
    expenses: computePercentDelta(currentExpenses, previousExpenses)
  };
}

function computePercentDelta(currentValue, previousValue) {
  if (!previousValue && !currentValue) {
    return 0;
  }
  if (!previousValue) {
    return 100;
  }
  return ((currentValue - previousValue) / previousValue) * 100;
}

function formatPercentChange(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function countTransactionsThisMonth() {
  const now = new Date();
  return (ledgerState.transactions || []).filter((txn) => {
    const parsed = new Date(`${txn.date}T00:00:00`);
    return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
  }).length;
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }
  dot.hidden = unattachedReceiptsCount === 0;
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
  return readStorageArray(STORAGE_KEYS.categories);
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
  renderTransactionsTable();
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

function initTransactionReceiptField() {
  const button = document.getElementById("transactionReceiptButton");
  const input = document.getElementById("transactionReceiptInput");
  if (!button || !input) {
    return;
  }

  if (button.dataset.wired !== "true") {
    button.dataset.wired = "true";
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      pendingTransactionReceiptFile = input.files?.[0] || null;
      updateTransactionReceiptLabel();
    });
  }

  updateTransactionReceiptLabel();
}

function updateTransactionReceiptLabel() {
  const nameNode = document.getElementById("transactionReceiptName");
  const input = document.getElementById("transactionReceiptInput");
  if (!nameNode) {
    return;
  }
  nameNode.textContent = pendingTransactionReceiptFile?.name || "No file selected";
  if (!pendingTransactionReceiptFile && input) {
    input.value = "";
  }
}

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
      return false;
    }

    await loadTransactions();
    setTransactionFormMessage("Receipt uploaded.");
    return true;
  } catch (err) {
    console.error("Receipt upload error:", err);
    setTransactionFormMessage("Receipt upload failed.");
    return false;
  }
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
  const buttons = document.querySelectorAll(".txn-intent-btn");
  if (typeSelect) {
    typeSelect.value = intent;
  }
  buttons.forEach((button) => {
    const matches = (button.dataset.intent === "income" ? "income" : "expense") === intent;
    button.classList.toggle("is-active", matches);
  });
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
