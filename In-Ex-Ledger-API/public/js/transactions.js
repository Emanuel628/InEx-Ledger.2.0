const STORAGE_KEYS = {
  accounts: "ledger_accounts",
  categories: "ledger_categories",
  transactions: "ledger_transactions",
  receipts: "ledger_receipts",
  businesses: "ledger_businesses",
  scope: "ledger_transactions_scope",
  upsellHidden: "ledger_transactions_upsell_hidden"
};

const ledgerState = {
  transactions: []
};

const recurringState = {
  templates: []
};

const transactionFilters = {
  type: "all",
  search: "",
  category: ""
};

const DRAWER_OPEN_LABEL = "+ Add new";
const DRAWER_CLOSE_LABEL = "Close";
const txT = (key, fallback) => {
  if (typeof t !== "function") return fallback !== undefined ? fallback : key;
  const result = t(key);
  return result !== key ? result : (fallback !== undefined ? fallback : key);
};
const taxHelpers = window.LUNA_TAX || {};
const resolveEstimatedTaxProfileHelper = taxHelpers.resolveEstimatedTaxProfile || ((region, province) => {
  const normalizedRegion = String(region || "").toUpperCase() === "CA" ? "CA" : "US";
  const normalizedProvince = String(province || "").toUpperCase();
  const caRates = taxHelpers.CANADA_ESTIMATED_TAX_RATES || {
    AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15,
    NT: 0.05, NU: 0.05, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, YT: 0.05
  };
  return {
    region: normalizedRegion,
    province: normalizedProvince,
    rate: normalizedRegion === "CA"
      ? (caRates[normalizedProvince] || (taxHelpers.DEFAULT_CA_ESTIMATED_TAX_RATE || 0.05))
      : (taxHelpers.US_ESTIMATED_TAX_RATE || 0.24)
  };
});
const formatEstimatedTaxPercentHelper = taxHelpers.formatEstimatedTaxPercent || ((rate, province = "") => {
  const decimals = String(province || "").toUpperCase() === "QC" ? 3 : 0;
  return `${(Number(rate || 0) * 100).toFixed(decimals)}%`;
});
let transactionDrawerElement = null;
let transactionToggleElement = null;
let transactionPageToggleElement = null;
let transactionModalElement = null;
let activeModalTransactionId = null;
let editingTransactionId = null;
let transactionsLoading = false;
let hasTransactionsLoadFailed = false;
const SLOT_ANIMATION_KEY = "lb_transactions_slot_played";
let slotAnimationPlayed = false;
const missingAccountWarnings = new Set();
const missingCategoryWarnings = new Set();
let businessTaxProfile = {
  region: "US",
  province: "",
  rate: resolveEstimatedTaxProfileHelper("US", "").rate
};
const TRANSACTION_CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "AUD", "JPY"];
const TRANSACTION_TREATMENT_LABELS = {
  income: "Income",
  operating: "Operating expense",
  capital: "Capital item",
  split_use: "Split-use / personal use",
  nondeductible: "Non-deductible"
};
const TRANSACTION_REVIEW_LABELS = {
  needs_review: "Needs review",
  ready: "Ready",
  matched: "Matched",
  locked: "Locked"
};
let unattachedReceiptsCount = 0;
let pendingTransactionReceiptFile = null;
let recurringDrawerElement = null;
let recurringToggleElement = null;
let editingRecurringTemplateId = null;
let transactionBusinessContext = {
  activeBusinessId: "",
  businesses: []
};
console.log("[AUTH] Protected page loaded:", window.location.pathname);

let legacyTransactionStoragePurged = false;

function resolveStorageUserId() {
  return window.__LUNA_ME__?.id || window.__LUNA_ME__?.user_id || window.__LUNA_ME__?.userId || "";
}

function resolveStorageBusinessId() {
  return transactionBusinessContext.activeBusinessId
    || window.__LUNA_ME__?.active_business_id
    || localStorage.getItem("lb_active_business_id")
    || "";
}

function resolveStorageBusinessIdForScope(scope) {
  return scope === "all" ? "all" : resolveStorageBusinessId();
}

function ensureLegacyStoragePurged() {
  if (legacyTransactionStoragePurged) {
    return;
  }
  legacyTransactionStoragePurged = true;
  if (window.lunaStorage?.purgeLegacyKeys) {
    window.lunaStorage.purgeLegacyKeys();
  }
}

function getNamespacedStorageKey(key, businessId) {
  ensureLegacyStoragePurged();
  if (window.lunaStorage?.getKey) {
    return window.lunaStorage.getKey(key, { businessId });
  }
  const userId = resolveStorageUserId();
  const resolvedBusinessId = businessId || "";
  if (!userId || !resolvedBusinessId || !key) {
    return null;
  }
  return `lb:${userId}:${resolvedBusinessId}:${key}`;
}

function getPreferenceStorageKey(key) {
  return getNamespacedStorageKey(key, resolveStorageBusinessId());
}

function getScopedStorageKey(key, scopeOverride) {
  const scope = scopeOverride || getTransactionScope();
  return getNamespacedStorageKey(key, resolveStorageBusinessIdForScope(scope));
}

function isTransactionsUpsellDismissed() {
  const upsellKey = getPreferenceStorageKey(STORAGE_KEYS.upsellHidden);
  return !!upsellKey && localStorage.getItem(upsellKey) === "true";
}

function setTransactionsUpsellDismissed() {
  const upsellKey = getPreferenceStorageKey(STORAGE_KEYS.upsellHidden);
  if (upsellKey) {
    localStorage.setItem(upsellKey, "true");
  }
}

function getResolvedRegion() {
  const raw =
    localStorage.getItem("lb_region") ||
    localStorage.getItem("region") ||
    window.LUNA_REGION ||
    "us";
  return String(raw).toLowerCase() === "ca" ? "ca" : "us";
}

function formatCurrency(value, regionOverride = getResolvedRegion()) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: regionOverride === "ca" ? "CAD" : "USD"
  }).format(value);
}

function getBusinessCurrencyCode() {
  return businessTaxProfile.region === "CA" ? "CAD" : "USD";
}

function getTransactionDefaultCurrency() {
  return getBusinessCurrencyCode();
}

function normalizeNumberOrEmpty(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : "";
}

function formatTransactionMetaBadge(text, className = "") {
  if (!text) {
    return "";
  }
  return `<span class="tx-meta-badge${className ? ` ${className}` : ""}">${escapeHtml(text)}</span>`;
}

function getIndirectTaxLabel(regionOverride = getResolvedRegion()) {
  return String(regionOverride || "").toLowerCase() === "ca"
    ? "GST/HST/QST amount"
    : "Sales tax / indirect tax amount";
}

function getTaxTreatmentLabel(value) {
  return TRANSACTION_TREATMENT_LABELS[value] || value || "";
}

function getReviewStatusLabel(value) {
  return TRANSACTION_REVIEW_LABELS[value] || value || "";
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();

  if (typeof enforceTrial === "function") {
    enforceTrial();
  }

  if (typeof renderTrialBanner === "function") {
    renderTrialBanner("trialBanner");
  }

  await hydrateTransactionBusinessContext();
  initTransactionScopeSelect();
  setupTransactionDrawer();
  initSidebarTypeFilter();
  wireTransactionIntentButtons();
  await loadBusinessTaxProfile();
  setTransactionAdvancedDefaults();
  window.addEventListener("lunaRegionChanged", async () => {
    try {
      await loadBusinessTaxProfile();
    } catch (err) {
      console.warn("[Transactions] Tax profile reload on region change failed", err);
    }
    renderTotals();
    setTransactionAdvancedDefaults();
  });

  wireTransactionForm();
  setupRecurringDrawer();
  wireRecurringForm();
  await refreshAccountOptions();
  await refreshCategoryOptions();
  await loadTransactions();
  await loadRecurringTemplates();
  wireTransactionSearch();
  wireTransactionCategoryFilter();
  wireTransactionModal();
  window.addEventListener("accountsUpdated", async () => {
    await refreshAccountOptions();
    renderTransactionsTable();
    renderRecurringAccountOptions();
  });

  const tier = effectiveTier();
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");
  const upsellDismissed = isTransactionsUpsellDismissed();
  const hasTransactions = (ledgerState.transactions || []).length > 0;

  if (cockpit) {
    cockpit.hidden = tier === "free" || !hasTransactions;
  }

  if (upsell) {
    const shouldShowUpsell = tier === "free" && hasTransactions && !upsellDismissed;
    upsell.hidden = !shouldShowUpsell;
    const dismissButton = upsell.querySelector(".upsell-dismiss");
    if (dismissButton) {
      dismissButton.addEventListener("click", () => {
        upsell.hidden = true;
        setTransactionsUpsellDismissed();
      });
    }
  }

  const upgradeButton = document.querySelector("[data-upgrade]");
  if (upgradeButton) {
    upgradeButton.addEventListener("click", () => {
      window.location.href = "subscription";
    });
  }
});

async function hydrateTransactionBusinessContext() {
  try {
    const response = await apiFetch("/api/businesses");
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    transactionBusinessContext = {
      activeBusinessId: payload?.active_business_id || "",
      businesses: Array.isArray(payload?.businesses) ? payload.businesses : []
    };
    const businessesKey = getNamespacedStorageKey(STORAGE_KEYS.businesses, "all");
    if (businessesKey) {
      localStorage.setItem(
        businessesKey,
        JSON.stringify(transactionBusinessContext)
      );
    }
  } catch (error) {
    console.warn("[Transactions] Unable to hydrate businesses", error);
  }
}

function initTransactionScopeSelect() {
  const select = document.getElementById("transactionsScope");
  if (!select) {
    return;
  }

  const scopeKey = getPreferenceStorageKey(STORAGE_KEYS.scope);
  setTransactionScope(select, scopeKey ? localStorage.getItem(scopeKey) : null);
  syncTransactionScopeUi();
  select.addEventListener("change", async () => {
    setTransactionScope(select, select.value);
    syncTransactionScopeUi();
    await loadBusinessTaxProfile();
    await refreshAccountOptions();
    await refreshCategoryOptions();
    await loadTransactions();
    if (getTransactionScope() === "active") {
      await loadRecurringTemplates();
    }
  });
}

function getTransactionScope() {
  const select = document.getElementById("transactionsScope");
  if (select?.value === "all") {
    return "all";
  }
  const scopeKey = getPreferenceStorageKey(STORAGE_KEYS.scope);
  return scopeKey && localStorage.getItem(scopeKey) === "all" ? "all" : "active";
}

function setTransactionScope(select, value) {
  const normalized = value === "all" ? "all" : "active";
  if (select) {
    select.value = normalized;
  }
  const scopeKey = getPreferenceStorageKey(STORAGE_KEYS.scope);
  if (scopeKey) {
    localStorage.setItem(scopeKey, normalized);
  }
}

function buildTransactionScopeQuery() {
  return getTransactionScope() === "all" ? "?scope=all" : "";
}

function getStoredBusinesses() {
  if (Array.isArray(transactionBusinessContext.businesses) && transactionBusinessContext.businesses.length) {
    return transactionBusinessContext.businesses;
  }
  try {
    const businessesKey = getNamespacedStorageKey(STORAGE_KEYS.businesses, "all");
    const parsed = businessesKey
      ? JSON.parse(localStorage.getItem(businessesKey) || "null")
      : null;
    if (parsed && Array.isArray(parsed.businesses)) {
      transactionBusinessContext = parsed;
      return parsed.businesses;
    }
  } catch {}
  return [];
}

function getBusinessById(businessId) {
  return getStoredBusinesses().find((business) => business.id === businessId) || null;
}

function getBusinessesInScope() {
  const businesses = getStoredBusinesses();
  if (getTransactionScope() === "all") {
    return businesses;
  }
  const activeBusinessId =
    transactionBusinessContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "";
  const activeBusiness = businesses.find((business) => business.id === activeBusinessId);
  return activeBusiness ? [activeBusiness] : businesses.slice(0, 1);
}

function hasMixedCurrenciesInScope() {
  const currencies = new Set(
    getBusinessesInScope().map((business) =>
      String(business.region || "").toUpperCase() === "CA" ? "CAD" : "USD"
    )
  );
  return currencies.size > 1;
}

function syncTransactionScopeUi() {
  const isAllScope = getTransactionScope() === "all";
  const addButtons = [document.getElementById("addTxToggle"), document.getElementById("addTxTogglePage")];
  const recurringPanel = document.querySelector(".recurring-panel");
  const subtitle = document.querySelector(".page-subtitle");
  const taxContext = document.getElementById("transactionsTaxContext");

  if (subtitle) {
    subtitle.textContent = isAllScope
      ? `${getBusinessesInScope().length || 0} ${txT("transactions_scope_businesses", "businesses")} · ${txT("transactions_scope_portfolio_view", "portfolio reporting view")}`
      : txT("transactions_scope_active_subtitle", "Active business ledger · current reporting period");
  }

  addButtons.filter(Boolean).forEach((button) => {
    button.title = isAllScope
      ? txT("transactions_scope_switch_to_active", "Switch to Active business to add or edit transactions.")
      : "";
  });

  if (isAllScope) {
    closeTransactionDrawer();
    closeRecurringDrawer();
  }

  if (recurringPanel) {
    recurringPanel.hidden = isAllScope;
  }

  if (taxContext && isAllScope && hasMixedCurrenciesInScope()) {
    taxContext.textContent = txT("transactions_tax_context_multi", "Tax form context: Multi-business reporting view");
  }
}

async function ensureActiveScopeForAdd() {
  if (getTransactionScope() !== "all") {
    return true;
  }
  const select = document.getElementById("transactionsScope");
  if (!select) {
    return false;
  }
  setTransactionScope(select, "active");
  syncTransactionScopeUi();
  await loadBusinessTaxProfile();
  await refreshAccountOptions();
  await refreshCategoryOptions();
  await loadTransactions();
  if (getTransactionScope() === "active") {
    await loadRecurringTemplates();
  }
  return true;
}


function wireTransactionForm() {
  const form = document.getElementById("transactionForm");
  const accountHelp = document.getElementById("accountHelp");
  const categoryHelp = document.getElementById("categoryHelp");
  const typeSelect = document.getElementById("txType");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");

  updateHelpText(accountHelp, categoryHelp);
  initTransactionReceiptField();
  wireEdgeCaseFields();
  typeSelect?.addEventListener("change", () => {
    if (!taxTreatmentSelect) {
      return;
    }
    if (typeSelect.value === "income") {
      taxTreatmentSelect.value = "income";
    } else if (taxTreatmentSelect.value === "income") {
      taxTreatmentSelect.value = "operating";
    }
    syncEdgeCaseUi();
  });

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
    const clearedInput = document.getElementById("cleared");
    const currencySelect = document.getElementById("transactionCurrency");
    const sourceAmountInput = document.getElementById("transactionSourceAmount");
    const exchangeRateInput = document.getElementById("transactionExchangeRate");
    const exchangeDateInput = document.getElementById("transactionExchangeDate");
    const convertedAmountInput = document.getElementById("transactionConvertedAmount");
    const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
    const personalUseInput = document.getElementById("transactionPersonalUsePct");
    const indirectTaxAmountInput = document.getElementById("transactionIndirectTaxAmount");
    const indirectTaxRecoverableInput = document.getElementById("transactionIndirectTaxRecoverable");
    const reviewStatusSelect = document.getElementById("transactionReviewStatus");
    const reviewNotesInput = document.getElementById("transactionReviewNotes");
    const noteInput = document.getElementById("transactionNote");

    const date = dateInput.value;
    const description = descriptionInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const accountId = accountSelect.value;
    const categoryId = categorySelect.value;
    const type = typeSelect?.value === "income" ? "income" : "expense";
    const cleared = !!clearedInput?.checked;

    const validationError = validateTransactionForm({
      date,
      description,
      amount,
      accountId,
      categoryId,
      type
    }) ?? validateEdgeCaseFields({
      sourceAmount: sourceAmountInput?.value,
      exchangeRate: exchangeRateInput?.value,
      convertedAmount: convertedAmountInput?.value,
      personalUsePct: personalUseInput?.value
    });

    if (validationError) {
      setTransactionFormMessage(validationError.message);
      showFieldTooltip(document.getElementById(validationError.fieldId), txT("transactions_validation_required_field", "Please fill in this required field."));
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
        note: noteInput?.value.trim() || "",
        cleared,
        currency: currencySelect?.value || getTransactionDefaultCurrency(),
        source_amount: normalizeNumberOrEmpty(sourceAmountInput?.value),
        exchange_rate: normalizeNumberOrEmpty(exchangeRateInput?.value),
        exchange_date: exchangeDateInput?.value || "",
        converted_amount: normalizeNumberOrEmpty(convertedAmountInput?.value),
        tax_treatment: taxTreatmentSelect?.value || "",
        indirect_tax_amount: normalizeNumberOrEmpty(indirectTaxAmountInput?.value),
        indirect_tax_recoverable: !!indirectTaxRecoverableInput?.checked,
        personal_use_pct: normalizeNumberOrEmpty(personalUseInput?.value),
        review_status: reviewStatusSelect?.value || "",
        review_notes: reviewNotesInput?.value.trim() || "",
        payer_name: type === "income" ? (document.getElementById("payerName")?.value.trim() || "") : "",
        tax_form_type: type === "income" ? (document.getElementById("taxFormType")?.value || "") : ""
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
        const errorPayload = response ? await response.json().catch(() => null) : null;
        setTransactionFormMessage(errorPayload?.error || txT("transactions_error_save", "Unable to save transaction."));
        return;
      }

      const savedTransaction = normalizeTransaction(
        await response.json().catch(() => null)
      );

      if (savedTransaction?.id) {
        mergeSavedTransactionIntoLedger(savedTransaction, {
          accountName: getSelectedOptionLabel(accountSelect),
          categoryName: getSelectedOptionLabel(categorySelect)
        });
        applyFilters();
        renderTotals();
      }

      if (savedTransaction?.id && pendingTransactionReceiptFile) {
        const uploaded = await uploadReceipt(savedTransaction.id, pendingTransactionReceiptFile);
        if (!uploaded) {
          // Transaction was saved; only the receipt attachment failed.
          // Close the drawer and surface a recoverable warning.
          markAccountAsUsed(accountId);
          try {
            await loadTransactions();
          } catch (reloadError) {
            console.warn("[Transactions] Save succeeded but refresh failed", reloadError);
          }
          form.reset();
          closeTransactionDrawer();
          setTransactionFormMessage(txT("transactions_warning_receipt_upload", "Transaction saved, but the receipt could not be uploaded. You can attach it later."));
          return;
        }
      }

      markAccountAsUsed(accountId);
      try {
        await loadTransactions();
      } catch (reloadError) {
        console.warn("[Transactions] Save succeeded but refresh failed", reloadError);
      }

      form.reset();
      closeTransactionDrawer();
    } catch (error) {
      console.error("Transaction save failed:", error);
      setTransactionFormMessage(txT("transactions_error_save", "Unable to save transaction."));
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
    button.addEventListener("click", async () => {
      const canOpen = await ensureActiveScopeForAdd();
      if (!canOpen) {
        return;
      }
      if (transactionDrawerElement.hasAttribute("hidden")) {
        openTransactionDrawer();
      } else {
        closeTransactionDrawer();
      }
    });
  });

  closeTransactionDrawer();
}

function wireRecurringForm() {
  const form = document.getElementById("recurringForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      type: document.getElementById("recurringType")?.value || "expense",
      cadence: document.getElementById("recurringCadence")?.value || "monthly",
      description: document.getElementById("recurringDescription")?.value.trim() || "",
      amount: parseFloat(document.getElementById("recurringAmount")?.value || ""),
      account_id: document.getElementById("recurringAccount")?.value || "",
      category_id: document.getElementById("recurringCategory")?.value || "",
      start_date: document.getElementById("recurringStartDate")?.value || "",
      end_date: document.getElementById("recurringEndDate")?.value || "",
      note: document.getElementById("recurringNote")?.value.trim() || "",
      cleared_default: !!document.getElementById("recurringClearedDefault")?.checked,
      active: true
    };

    const validationError = validateRecurringForm(payload);
    if (validationError) {
      setRecurringFormMessage(validationError);
      return;
    }

    setRecurringFormMessage("");
    const submitButton = document.getElementById("recurringSubmit");
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const endpoint = editingRecurringTemplateId
        ? `/api/recurring/${editingRecurringTemplateId}`
        : "/api/recurring";
      const method = editingRecurringTemplateId ? "PUT" : "POST";
      const response = await apiFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          end_date: payload.end_date || null
        })
      });

      if (!response || !response.ok) {
        const errorPayload = response ? await response.json().catch(() => null) : null;
        setRecurringFormMessage(errorPayload?.error || "Unable to save recurring template.");
        return;
      }

      await Promise.all([loadRecurringTemplates(), loadTransactions()]);
      closeRecurringDrawer();
    } catch (error) {
      console.error("Recurring template save failed:", error);
      setRecurringFormMessage(txT("transactions_error_save", "Unable to save recurring template."));
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
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
    transactionPageToggleElement.textContent = txT("common_close", "Close");
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
    transactionPageToggleElement.textContent = txT("transactions_add_button", "+ Add transaction");
  }
  resetTransactionForm();
}

function setupRecurringDrawer() {
  recurringDrawerElement = document.getElementById("recurringDrawer");
  recurringToggleElement = document.getElementById("recurringToggle");
  const cancelButton = document.getElementById("recurringCancel");

  if (!recurringDrawerElement || !recurringToggleElement) {
    return;
  }

  recurringToggleElement.addEventListener("click", () => {
    if (recurringDrawerElement.hasAttribute("hidden")) {
      openRecurringDrawer();
    } else {
      closeRecurringDrawer();
    }
  });

  cancelButton?.addEventListener("click", () => closeRecurringDrawer());
  closeRecurringDrawer();
}

function openRecurringDrawer() {
  if (!recurringDrawerElement || !recurringToggleElement) {
    return;
  }
  recurringDrawerElement.removeAttribute("hidden");
  recurringToggleElement.textContent = txT("transactions_recurring_close", "Close recurring");
  recurringToggleElement.setAttribute("aria-expanded", "true");
  setTimeout(() => {
    document.getElementById("recurringDescription")?.focus();
  }, 0);
}

function closeRecurringDrawer() {
  if (!recurringDrawerElement || !recurringToggleElement) {
    return;
  }
  recurringDrawerElement.setAttribute("hidden", "");
  recurringToggleElement.textContent = txT("transactions_recurring_add", "+ Add recurring template");
  recurringToggleElement.setAttribute("aria-expanded", "false");
  resetRecurringForm();
}

function updateHelpText(accountHelp, categoryHelp) {
  const accounts = getAccounts();
  const categories = getCategories();

  if (accountHelp) {
    accountHelp.textContent = accounts.length === 0
      ? txT("transactions_help_create_account", "Create an account to record transactions.")
      : "";
  }

  if (categoryHelp) {
    categoryHelp.textContent = categories.length === 0
      ? txT("transactions_help_add_categories", "Add categories (income/expense) before recording activity.")
      : "";
  }
}

async function loadTransactions() {
  setTransactionsLoading(true);
  try {
    hasTransactionsLoadFailed = false;
    const transactions = await fetchTransactionsForPage();
    let receiptSnapshot = { byTransactionId: {}, unattachedCount: 0 };
    try {
      receiptSnapshot = await fetchReceiptLinksSnapshot();
    } catch (receiptError) {
      console.warn("[Transactions] Receipt snapshot unavailable", receiptError);
    }

    ledgerState.transactions = transactions.filter(Boolean).map((transaction) => ({
      ...transaction,
      receiptId: receiptSnapshot.byTransactionId[transaction.id] || transaction.receiptId || ""
    }));
    unattachedReceiptsCount = receiptSnapshot.unattachedCount;
    saveTransactions(ledgerState.transactions);
  } catch (error) {
    console.error("Failed to load transactions:", error);
    hasTransactionsLoadFailed = true;
    ledgerState.transactions = [];
    unattachedReceiptsCount = 0;
    clearStorageArray(STORAGE_KEYS.transactions);
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
  renderRecurringAccountOptions();
  updateHelpText(
    document.getElementById("accountHelp"),
    document.getElementById("categoryHelp")
  );
}

function renderCategoryOptions() {
  populateCategoriesFromStorage();
  renderRecurringCategoryOptions();
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
          ? "transactions"
          : `transactions?type=${transactionFilters.type}`;
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
    title.textContent = txT("transactions_delete_title", "Archive this transaction?");
  }
  if (body) {
    body.textContent = `${txT("transactions_delete_body_prefix", "This will archive")} "${transaction.description || txT("transactions_delete_this", "this transaction")}" ${txT("transactions_delete_body_suffix", "and exclude it from standard reports. It will remain in your audit history.")}`;
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

function handleEditRecurringTemplate(templateId) {
  const template = (recurringState.templates || []).find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  editingRecurringTemplateId = templateId;
  document.getElementById("recurringType").value = template.type || "expense";
  document.getElementById("recurringCadence").value = template.cadence || "monthly";
  document.getElementById("recurringDescription").value = template.description || "";
  document.getElementById("recurringAmount").value = template.amount ?? "";
  document.getElementById("recurringAccount").value = template.account_id || "";
  document.getElementById("recurringCategory").value = template.category_id || "";
  document.getElementById("recurringStartDate").value = template.start_date || "";
  document.getElementById("recurringEndDate").value = template.end_date || "";
  document.getElementById("recurringNote").value = template.note || "";
  document.getElementById("recurringClearedDefault").checked = !!template.cleared_default;
  const submitButton = document.getElementById("recurringSubmit");
  if (submitButton) {
    submitButton.textContent = txT("transactions_recurring_update_submit", "Update recurring template");
  }
  openRecurringDrawer();
}

async function toggleRecurringTemplateStatus(templateId, active) {
  const response = await apiFetch(`/api/recurring/${templateId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ active })
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setRecurringFormMessage(errorPayload?.error || "Unable to update recurring status.");
    return;
  }

  await loadRecurringTemplates();
}

async function runRecurringTemplate(templateId) {
  const response = await apiFetch(`/api/recurring/${templateId}/run`, {
    method: "POST"
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setRecurringFormMessage(errorPayload?.error || "Unable to post recurring transaction.");
    return;
  }

  const payload = await response.json().catch(() => null);
  if (payload && payload.created === false) {
    setRecurringFormMessage("The next recurring entry has already been generated.");
  } else {
    setRecurringFormMessage("");
  }

  await Promise.all([loadRecurringTemplates(), loadTransactions()]);
}

async function deleteRecurringTemplate(templateId) {
  const template = (recurringState.templates || []).find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  if (!window.confirm(`Delete recurring template "${template.description}"? Future occurrences will stop.`)) {
    return;
  }

  const response = await apiFetch(`/api/recurring/${templateId}`, {
    method: "DELETE"
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setRecurringFormMessage(errorPayload?.error || "Unable to delete recurring template.");
    return;
  }

  await loadRecurringTemplates();
}

function validateRecurringForm(payload) {
  if (!payload.description) {
    return txT("transactions_recurring_validation_description", "Add a description for the recurring template.");
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return txT("transactions_recurring_validation_amount", "Recurring amount must be greater than zero.");
  }
  if (!payload.account_id) {
    return txT("transactions_recurring_validation_account", "Select an account for the recurring template.");
  }
  if (!payload.category_id) {
    return txT("transactions_recurring_validation_category", "Select a category for the recurring template.");
  }
  if (!payload.start_date) {
    return txT("transactions_recurring_validation_start", "Choose a start date.");
  }
  if (payload.end_date && payload.end_date < payload.start_date) {
    return txT("transactions_recurring_validation_end", "End date must be on or after the start date.");
  }
  return null;
}

function setRecurringFormMessage(text) {
  const node = document.getElementById("recurringFormMessage");
  if (node) {
    node.textContent = text || "";
  }
}

function resetRecurringForm() {
  const form = document.getElementById("recurringForm");
  if (form) {
    form.reset();
  }
  editingRecurringTemplateId = null;
  document.getElementById("recurringType").value = "expense";
  document.getElementById("recurringCadence").value = "monthly";
  const submitButton = document.getElementById("recurringSubmit");
  if (submitButton) {
    submitButton.textContent = txT("transactions_recurring_save_submit", "Save recurring template");
  }
  setRecurringFormMessage("");
}

async function loadRecurringTemplates() {
  const tbody = document.getElementById("recurringTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">${txT("transactions_recurring_loading", "Loading recurring templates...")}</td></tr>`;
  }

  try {
    const response = await apiFetch("/api/recurring");
    if (!response || !response.ok) {
      throw new Error(txT("transactions_recurring_error_load", "Failed to load recurring templates."));
    }

    const payload = await response.json().catch(() => []);
    recurringState.templates = Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.error("Failed to load recurring templates:", error);
    recurringState.templates = [];
  } finally {
    renderRecurringTemplates();
  }
}

function renderRecurringAccountOptions() {
  const select = document.getElementById("recurringAccount");
  if (!select) {
    return;
  }
  const currentValue = select.value;
  select.innerHTML = `<option value="">${txT("transactions_select_account", "Select account")}</option>`;
  getAccounts().forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = `${account.name} (${formatAccountType(account.type)})`;
    select.appendChild(option);
  });
  select.value = currentValue || "";
}

function renderRecurringCategoryOptions() {
  const select = document.getElementById("recurringCategory");
  if (!select) {
    return;
  }
  const currentValue = select.value;
  select.innerHTML = `<option value="">${txT("transactions_select_category", "Select category")}</option>`;
  getCategories().forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id || category.name;
    option.textContent = category.name;
    select.appendChild(option);
  });
  select.value = currentValue || "";
}

function renderRecurringTemplates() {
  const tbody = document.getElementById("recurringTableBody");
  if (!tbody) {
    return;
  }

  if (!recurringState.templates.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">${txT("transactions_recurring_empty", "No recurring templates yet.")}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  recurringState.templates.forEach((template) => {
    const row = document.createElement("tr");
    const activeBadge = template.active
      ? `<span class="status-badge status-cleared">${txT("transactions_recurring_active", "Active")}</span>`
      : `<span class="status-badge status-pending">${txT("transactions_recurring_paused", "Paused")}</span>`;

    row.innerHTML = `
      <td>
        <div class="recurring-meta">
          <span class="recurring-primary">${escapeHtml(template.description || "-")}</span>
          <span class="recurring-secondary">${template.note ? escapeHtml(template.note) : txT("transactions_recurring_no_note", "No internal note")}</span>
        </div>
      </td>
      <td>${formatRecurringCadence(template.cadence)}</td>
      <td>${formatDisplayDate(template.next_run_date)}</td>
      <td>${activeBadge}</td>
      <td class="amount-cell"><span class="${template.type === "income" ? "amount-positive" : "amount-negative"}">${template.type === "income" ? "+" : "-"}${formatCurrency(Math.abs(Number(template.amount) || 0))}</span></td>
      <td class="recurring-actions-cell">
        <button type="button" class="action-button" data-action="recurring-run" data-id="${template.id}">${txT("transactions_recurring_post_next", "Post next")}</button>
        <button type="button" class="action-button" data-action="recurring-status" data-id="${template.id}">${template.active ? txT("transactions_recurring_pause", "Pause") : txT("transactions_recurring_resume", "Resume")}</button>
        <button type="button" class="action-button" data-action="recurring-edit" data-id="${template.id}">${txT("common_edit", "Edit")}</button>
        <button type="button" class="action-button delete" data-action="recurring-delete" data-id="${template.id}">${txT("common_delete", "Delete")}</button>
      </td>
    `;
    tbody.appendChild(row);

    row.querySelector('[data-action="recurring-run"]')?.addEventListener("click", async () => {
      await runRecurringTemplate(template.id);
    });
    row.querySelector('[data-action="recurring-status"]')?.addEventListener("click", async () => {
      await toggleRecurringTemplateStatus(template.id, !template.active);
    });
    row.querySelector('[data-action="recurring-edit"]')?.addEventListener("click", () => {
      handleEditRecurringTemplate(template.id);
    });
    row.querySelector('[data-action="recurring-delete"]')?.addEventListener("click", async () => {
      await deleteRecurringTemplate(template.id);
    });
  });
}

function formatRecurringCadence(cadence) {
  switch (cadence) {
    case "weekly":
      return txT("transactions_recurring_cadence_weekly", "Weekly");
    case "biweekly":
      return txT("transactions_recurring_cadence_biweekly", "Biweekly");
    case "monthly":
      return txT("transactions_recurring_cadence_monthly", "Monthly");
    case "quarterly":
      return txT("transactions_recurring_cadence_quarterly", "Quarterly");
    case "yearly":
    case "annually":
      return txT("transactions_recurring_cadence_yearly", "Yearly");
    default:
      return escapeHtml(cadence || "-");
  }
}

function prefillTransactionForm(transaction) {
  const dateInput = document.getElementById("date");
  const descriptionInput = document.getElementById("description");
  const amountInput = document.getElementById("amount");
  const accountSelect = document.getElementById("account");
  const categorySelect = document.getElementById("category");
  const typeSelect = document.getElementById("txType");
  const clearedInput = document.getElementById("cleared");
  const currencySelect = document.getElementById("transactionCurrency");
  const sourceAmountInput = document.getElementById("transactionSourceAmount");
  const exchangeRateInput = document.getElementById("transactionExchangeRate");
  const exchangeDateInput = document.getElementById("transactionExchangeDate");
  const convertedAmountInput = document.getElementById("transactionConvertedAmount");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const personalUseInput = document.getElementById("transactionPersonalUsePct");
  const indirectTaxAmountInput = document.getElementById("transactionIndirectTaxAmount");
  const indirectTaxRecoverableInput = document.getElementById("transactionIndirectTaxRecoverable");
  const reviewStatusSelect = document.getElementById("transactionReviewStatus");
  const reviewNotesInput = document.getElementById("transactionReviewNotes");
  const noteInput = document.getElementById("transactionNote");

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
  if (clearedInput) {
    clearedInput.checked = !!transaction.cleared;
  }
  if (currencySelect) {
    currencySelect.value = String(transaction.currency || getTransactionDefaultCurrency()).toUpperCase();
  }
  if (sourceAmountInput) {
    sourceAmountInput.value = transaction.sourceAmount ?? transaction.source_amount ?? "";
  }
  if (exchangeRateInput) {
    exchangeRateInput.value = transaction.exchangeRate ?? transaction.exchange_rate ?? "";
  }
  if (exchangeDateInput) {
    exchangeDateInput.value = String(transaction.exchangeDate || transaction.exchange_date || "").slice(0, 10);
  }
  if (convertedAmountInput) {
    convertedAmountInput.value = transaction.convertedAmount ?? transaction.converted_amount ?? "";
  }
  if (taxTreatmentSelect) {
    taxTreatmentSelect.value = transaction.taxTreatment || transaction.tax_treatment || (transaction.type === "income" ? "income" : "operating");
  }
  if (personalUseInput) {
    personalUseInput.value = transaction.personalUsePct ?? transaction.personal_use_pct ?? "";
  }
  if (indirectTaxAmountInput) {
    indirectTaxAmountInput.value = transaction.indirectTaxAmount ?? transaction.indirect_tax_amount ?? "";
  }
  if (indirectTaxRecoverableInput) {
    indirectTaxRecoverableInput.checked = transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true;
  }
  if (reviewStatusSelect) {
    reviewStatusSelect.value = transaction.reviewStatus || transaction.review_status || "";
  }
  if (reviewNotesInput) {
    reviewNotesInput.value = transaction.reviewNotes || transaction.review_notes || "";
  }
  if (noteInput) {
    noteInput.value = transaction.note || "";
  }
  syncEdgeCaseUi();
}

function resetTransactionForm() {
  const form = document.getElementById("transactionForm");
  if (form) {
    form.reset();
  }
  pendingTransactionReceiptFile = null;
  updateTransactionReceiptLabel();
  editingTransactionId = null;
  setEditingMode(false);
  setTransactionAdvancedDefaults();
  const message = document.getElementById("transactionFormMessage");
  if (message) {
    message.textContent = "";
  }
}

function setTransactionAdvancedDefaults() {
  const currencySelect = document.getElementById("transactionCurrency");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const reviewStatusSelect = document.getElementById("transactionReviewStatus");
  const indirectTaxLabel = document.getElementById("transactionIndirectTaxLabel");
  const indirectTaxNote = document.getElementById("transactionIndirectTaxNote");
  const currency = getTransactionDefaultCurrency();
  if (currencySelect) {
    currencySelect.value = currency;
  }
  if (taxTreatmentSelect) {
    taxTreatmentSelect.value = "operating";
  }
  if (reviewStatusSelect) {
    reviewStatusSelect.value = "ready";
  }
  if (indirectTaxLabel) {
    indirectTaxLabel.textContent = getIndirectTaxLabel();
  }
  if (indirectTaxNote) {
    indirectTaxNote.textContent =
      getResolvedRegion() === "ca"
        ? "Use this for GST/HST/QST that must be reviewed or recovered."
        : "Use this for sales tax or other indirect taxes that need CPA review.";
  }
  syncEdgeCaseUi();
}

function setEditingMode(enabled) {
  const submitButton = document.querySelector(".tx-actions button");
  if (!submitButton) {
    return;
  }
  submitButton.textContent = enabled
    ? txT("transactions_update_submit", "Update transaction")
    : txT("transactions_save_submit", "Save transaction");
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
      const cat = (tx.categoryName || getCategoryName(tx.categoryId) || "").toLowerCase();
      const acct = (tx.accountName || getAccountName(tx.accountId) || "").toLowerCase();
      const dest = (tx.destination || "").toLowerCase();
      const notes = (tx.note || "").toLowerCase();
      const review = (tx.reviewNotes || "").toLowerCase();
      const treatment = (tx.taxTreatment || "").toLowerCase();
      const currency = (tx.currency || "").toLowerCase();
      return (
        desc.includes(term) ||
        cat.includes(term) ||
        acct.includes(term) ||
        dest.includes(term) ||
        notes.includes(term) ||
        review.includes(term) ||
        treatment.includes(term) ||
        currency.includes(term)
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
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setTransactionFormMessage(errorPayload?.error || txT("transactions_error_delete", "Unable to delete transaction."));
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

async function toggleTransactionCleared(transactionId, nextCleared) {
  const response = await apiFetch(`/api/transactions/${transactionId}/cleared`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cleared: nextCleared })
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setTransactionFormMessage(
      errorPayload?.error || txT("transactions_error_update_cleared", "Unable to update reconciliation status.")
    );
    return;
  }

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

  select.innerHTML = `<option value="">${txT("transactions_select_account", "Select account")}</option>`;
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
  try {
    const response = await apiFetch(`/api/accounts${buildTransactionScopeQuery()}`);
    if (!response || !response.ok) {
      clearStorageArray(STORAGE_KEYS.accounts);
      return [];
    }

    const accounts = await response.json();
    if (!Array.isArray(accounts)) {
      clearStorageArray(STORAGE_KEYS.accounts);
      return [];
    }

    setStorageArray(STORAGE_KEYS.accounts, accounts);
    return accounts;
  } catch (error) {
    console.warn("[Transactions] Unable to refresh accounts", error);
    clearStorageArray(STORAGE_KEYS.accounts);
    return [];
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

  const categories = getCategories();
  select.innerHTML = `<option value="">${txT("transactions_select_category", "Select category")}</option>`;
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
  select.innerHTML = `<option value="">${txT("transactions_all_categories", "All categories")}</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent =
      getTransactionScope() === "all"
        ? `${category.businessName || getBusinessById(category.businessId)?.name || "Business"} · ${category.name}`
        : category.name;
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
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">${txT("transactions_loading", "Loading transactions...")}</td></tr>`;
    return;
  }

  if (transactions.length === 0) {
    const emptyText =
      isFilteredView && ledgerState.transactions.length > 0
        ? txT("transactions_empty_filtered", "No matching transactions.")
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
    const receiptLabel = txT("transactions_receipt_attached", "Receipt attached");
    const noteLabel = txT("transactions_note_attached", "Note attached");
    const receiptClip = txn.receiptId
      ? `<span class="tx-clip" aria-hidden="true" title="${escapeHtml(receiptLabel)}">📎</span><span class="sr-only">${escapeHtml(receiptLabel)}</span>`
      : "";
    const noteIndicator = txn.note
      ? `<span class="tx-note-indicator" aria-hidden="true" title="${escapeHtml(noteLabel)}">📝</span><span class="sr-only">${escapeHtml(noteLabel)}</span>`
      : "";
    row.innerHTML = `
      <td>${escapeHtml(txn.date)}</td>
      <td>
        <span class="tx-type-pill">${typeLabel}</span>
        ${escapeHtml(txn.description)}${noteIndicator}${receiptClip}
      </td>
      <td>${escapeHtml(txn.accountName || accountsById[txn.accountId]?.name || "-")}</td>
      <td>${escapeHtml(txn.categoryName || categoriesById[txn.categoryId]?.name || "-")}</td>
      <td>${formatCurrency(txn.amount)}</td>
      <td>
        <button
          type="button"
          class="tx-action tx-upload"
          data-action="upload-receipt"
          data-id="${txn.id}"
        >
          ${txT("transactions_upload_receipt", "Upload receipt")}
        </button>
        <button
          type="button"
          class="tx-action"
          data-action="edit-transaction"
          data-id="${txn.id}"
        >
          ${txT("common_edit", "Edit")}
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
        handleEditEntry(txn.id);
      });
    }
  });
}

async function refreshCategoryOptions() {
  const categories = await fetchCategoriesForTransactions();
  setStorageArray(STORAGE_KEYS.categories, categories);
  populateCategoriesFromStorage();
}

async function fetchCategoriesForTransactions() {
  try {
    const response = await apiFetch(`/api/categories${buildTransactionScopeQuery()}`);
    if (!response || !response.ok) {
      clearStorageArray(STORAGE_KEYS.categories);
      return [];
    }

    const categories = await response.json().catch(() => []);
    if (!Array.isArray(categories)) {
      clearStorageArray(STORAGE_KEYS.categories);
      return [];
    }

    return categories.map((category) => ({
      id: category.id,
      businessId: category.businessId || category.business_id || "",
      businessName: category.businessName || category.business_name || "",
      name: category.name,
      type: category.kind,
      taxLabel:
        businessTaxProfile.region === "CA" ? category.tax_map_ca || "" : category.tax_map_us || ""
    }));
  } catch (error) {
    console.warn("[Transactions] Unable to refresh categories", error);
    clearStorageArray(STORAGE_KEYS.categories);
    return [];
  }
}

async function fetchTransactionsForPage() {
  const response = await apiFetch(`/api/transactions${buildTransactionScopeQuery()}`);
  if (!response || !response.ok) {
    throw new Error(txT("transactions_error_load", "Failed to load transactions."));
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
    const response = await apiFetch(`/api/receipts${buildTransactionScopeQuery()}`);
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
    businessId: transaction.businessId || transaction.business_id || "",
    businessName: transaction.businessName || transaction.business_name || "",
    date: String(transaction.date || "").slice(0, 10),
    description: transaction.description || "",
    amount: Number(transaction.amount) || 0,
    accountId: transaction.accountId || transaction.account_id || "",
    accountName: transaction.accountName || transaction.account_name || "",
    categoryId: transaction.categoryId || transaction.category_id || "",
    categoryName: transaction.categoryName || transaction.category_name || "",
    type: transaction.type === "income" ? "income" : "expense",
    note: transaction.note || "",
    receiptId: transaction.receiptId || transaction.receipt_id || "",
    createdAt: transaction.createdAt || transaction.created_at || "",
    cleared: transaction.cleared === true,
    currency: String(transaction.currency || "").toUpperCase() || getTransactionDefaultCurrency(),
    sourceAmount: transaction.sourceAmount ?? transaction.source_amount ?? null,
    exchangeRate: transaction.exchangeRate ?? transaction.exchange_rate ?? null,
    exchangeDate: String(transaction.exchangeDate || transaction.exchange_date || "").slice(0, 10),
    convertedAmount: transaction.convertedAmount ?? transaction.converted_amount ?? null,
    taxTreatment: transaction.taxTreatment || transaction.tax_treatment || (transaction.type === "income" ? "income" : "operating"),
    indirectTaxAmount: transaction.indirectTaxAmount ?? transaction.indirect_tax_amount ?? null,
    indirectTaxRecoverable:
      transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true,
    personalUsePct: transaction.personalUsePct ?? transaction.personal_use_pct ?? null,
    reviewStatus: transaction.reviewStatus || transaction.review_status || "ready",
    reviewNotes: transaction.reviewNotes || transaction.review_notes || "",
    recurringTransactionId:
      transaction.recurringTransactionId || transaction.recurring_transaction_id || "",
    recurringOccurrenceDate:
      String(
        transaction.recurringOccurrenceDate || transaction.recurring_occurrence_date || ""
      ).slice(0, 10)
  };
}

function renderTransactionsTable(filteredTransactions) {
  const tbody = document.querySelector("tbody");
  const transactions =
    filteredTransactions !== undefined ? filteredTransactions : ledgerState.transactions || [];
  const isFilteredView = filteredTransactions !== undefined;

  if (!tbody) return;

  if (transactionsLoading && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr><td colspan="8" class="placeholder">${txT("transactions_loading", "Loading transactions...")}</td></tr>`;
    return;
  }

  if (hasTransactionsLoadFailed && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr><td colspan="8" class="placeholder">${txT("transactions_error_load", "Unable to load transactions. Please refresh.")}</td></tr>`;
    return;
  }

  if (transactions.length === 0) {
    const emptyText =
      isFilteredView && ledgerState.transactions.length > 0
        ? txT("transactions_empty_filtered", "No matching transactions.")
        : typeof t === "function"
        ? t("transactions_empty")
        : "No transactions yet.";
    tbody.innerHTML = `<tr><td colspan="8" class="placeholder">${emptyText}</td></tr>`;
    return;
  }

  const accountsById = mapById(getAccounts());
  const categoriesById = mapById(getCategories());
  const isAllScope = getTransactionScope() === "all";
  tbody.innerHTML = "";

  transactions.forEach((txn) => {
    const row = document.createElement("tr");
    const categoryName = txn.categoryName || categoriesById[txn.categoryId]?.name || "-";
    const accountName = txn.accountName || accountsById[txn.accountId]?.name || "-";
    const rowRegion = String(
      getBusinessById(txn.businessId)?.region || businessTaxProfile.region || getResolvedRegion()
    ).toUpperCase() === "CA"
      ? "ca"
      : "us";
    const sourceBadge = txn.recurringTransactionId
      ? `<span class="source-badge">${txT("transactions_source_recurring", "Recurring")}</span>`
      : "";
    const recurringMeta = txn.recurringOccurrenceDate
      ? `${txT("transactions_generated_on", "Generated")} ${formatDisplayDate(txn.recurringOccurrenceDate)}`
      : txT("transactions_generated_auto", "Generated automatically");
    const descriptionTail = txn.recurringTransactionId
      ? `${sourceBadge}${txn.note ? ` ${escapeHtml(txn.note)}` : ` ${escapeHtml(recurringMeta)}`}`
      : escapeHtml(txn.note || categoryName || "");
    const businessBadge = isAllScope
      ? `<span class="business-scope-badge">${escapeHtml(txn.businessName || getBusinessById(txn.businessId)?.name || "Business")}</span>`
      : "";
    const metadataBadges = [];
    const businessCurrency = String(getBusinessById(txn.businessId)?.region || businessTaxProfile.region || getResolvedRegion()).toUpperCase() === "CA"
      ? "CAD"
      : "USD";
    if (txn.currency && txn.currency !== businessCurrency) {
      metadataBadges.push(formatTransactionMetaBadge(`FX ${txn.currency}`, "fx"));
    }
    if (txn.taxTreatment && txn.taxTreatment !== "operating") {
      metadataBadges.push(formatTransactionMetaBadge(getTaxTreatmentLabel(txn.taxTreatment), txn.taxTreatment === "capital" ? "capital" : ""));
    }
    if (txn.personalUsePct !== null && txn.personalUsePct !== undefined && txn.personalUsePct !== "") {
      metadataBadges.push(formatTransactionMetaBadge(`${Number(txn.personalUsePct).toFixed(1)}% personal use`, "split"));
    }
    if (txn.indirectTaxAmount !== null && txn.indirectTaxAmount !== undefined && Number(txn.indirectTaxAmount) > 0) {
      metadataBadges.push(formatTransactionMetaBadge(`${getIndirectTaxLabel(rowRegion)} ${formatCurrency(Number(txn.indirectTaxAmount) || 0, rowRegion)}`, "tax"));
    }
    if (txn.reviewStatus && txn.reviewStatus !== "ready") {
      metadataBadges.push(formatTransactionMetaBadge(getReviewStatusLabel(txn.reviewStatus), txn.reviewStatus));
    }
    const descriptionSub = [businessBadge, descriptionTail, metadataBadges.join(" ")].filter(Boolean).join(" ");
    const amountClass = txn.type === "income" ? "amount-positive" : "amount-negative";
    const amountPrefix = txn.type === "income" ? "+" : "-";
    const clearedMarkup = txn.cleared
      ? `<span class="status-badge status-cleared">${txT("transactions_status_cleared", "Cleared")}</span>`
      : `<span class="status-badge status-pending">${txT("transactions_status_pending", "Pending")}</span>`;
    const receiptMarkup = txn.receiptId
      ? `<span class="receipt-status attached"><span class="receipt-dot"></span><span>${txT("transactions_receipt_attached_short", "Attached")}</span></span>`
      : `<span class="receipt-status none"><span class="receipt-dot"></span><span>${txT("transactions_receipt_none", "None")}</span></span>`;

    row.innerHTML = `
      <td><span class="date-cell">${formatDisplayDate(txn.date)}</span></td>
      <td><div class="description-primary">${escapeHtml(txn.description || "-")}</div><div class="description-sub">${descriptionSub}</div></td>
      <td><span class="account-tag">${escapeHtml(accountName)}</span></td>
      <td><span class="category-pill ${getCategoryToneClass(categoryName)}">${escapeHtml(categoryName)}</span></td>
      <td>${receiptMarkup}</td>
      <td>
        <button type="button" class="status-toggle-button ${txn.cleared ? "is-cleared" : ""}" data-action="toggle-cleared" data-id="${txn.id}">
          ${clearedMarkup}
        </button>
      </td>
      <td class="amount-cell"><span class="${amountClass}">${amountPrefix}${formatCurrency(Math.abs(Number(txn.amount) || 0), rowRegion)}</span></td>
      <td class="actions-cell">
        <button type="button" class="action-button" data-action="edit-transaction" data-id="${txn.id}" ${isAllScope ? "disabled" : ""}>${txT("common_edit", "Edit")}</button>
        <button type="button" class="action-button delete" data-action="delete-transaction" data-id="${txn.id}" ${isAllScope ? "disabled" : ""}>${txT("common_delete", "Delete")}</button>
      </td>
    `;
    tbody.appendChild(row);

    row.querySelector('[data-action="edit-transaction"]')?.addEventListener("click", () => {
      handleEditEntry(txn.id);
    });
    row.querySelector('[data-action="delete-transaction"]')?.addEventListener("click", () => {
      openTransactionModal(txn.id);
    });
    row.querySelector('[data-action="toggle-cleared"]')?.addEventListener("click", async () => {
      await toggleTransactionCleared(txn.id, !txn.cleared);
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
  const transactionsTaxContext = document.getElementById("transactionsTaxContext");
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");
  const isAllScope = getTransactionScope() === "all";
  const mixedCurrencies = hasMixedCurrenciesInScope();
  const scopeRegion = getScopeCurrencyRegion();

  const totals = calculateTotals();
  const comparison = calculateYearComparisons();
  const transactionsCount = (ledgerState.transactions || []).length;
  if (incomeLabel) {
    incomeLabel.textContent = isAllScope && mixedCurrencies ? txT("exports_per_business", "Per-business") : formatCurrency(totals.income, scopeRegion);
  }
  if (expensesLabel) {
    expensesLabel.textContent = isAllScope && mixedCurrencies ? txT("exports_per_business", "Per-business") : formatCurrency(totals.expenses, scopeRegion);
  }
  if (netLabel) {
    netLabel.textContent =
      isAllScope && mixedCurrencies ? txT("exports_per_business", "Per-business") : formatCurrency(totals.income - totals.expenses, scopeRegion);
  }
  if (incomeDelta) {
    incomeDelta.innerHTML = `<span class="stat-delta-positive">${formatPercentChange(comparison.income)}</span> ${txT("transactions_vs_last_year", "vs last year")}`;
  }
  if (expensesDelta) {
    const expenseDeltaClass = comparison.expenses > 0 ? "stat-delta-negative" : "stat-delta-positive";
    expensesDelta.innerHTML = `<span class="${expenseDeltaClass}">${formatPercentChange(comparison.expenses)}</span> ${txT("transactions_vs_last_year", "vs last year")}`;
  }
  if (transactionCountValue) {
    transactionCountValue.textContent = String(transactionsCount);
  }
  if (transactionCountDelta) {
    transactionCountDelta.textContent = `${countTransactionsThisMonth()} ${txT("transactions_this_month", "this month")}`;
  }

  const tier = effectiveTier();
  const hasTransactions = transactionsCount > 0;
  if (!isAllScope && taxLabel && setAsideLabel) {
  const taxableIncome = Math.max(0, totals.income - totals.expenses);
  const estimatedTax = taxableIncome * businessTaxProfile.rate;
  const monthlySetAside = estimatedTax / 12;
  taxLabel.textContent = formatCurrency(estimatedTax, scopeRegion);
  setAsideLabel.textContent = formatCurrency(monthlySetAside, scopeRegion);
} else if (taxLabel && setAsideLabel) {
  taxLabel.textContent = isAllScope ? txT("transactions_tax_not_shown", "Not shown") : formatCurrency(0, scopeRegion);
  setAsideLabel.textContent = isAllScope ? txT("transactions_tax_switch_one_business", "Switch to one business") : formatCurrency(0, scopeRegion);
}
  if (taxBannerLabel) {
    taxBannerLabel.textContent = isAllScope
      ? txT("transactions_tax_estimated_owed", "Estimated tax owed")
      : `${txT("transactions_tax_estimated_owed", "Estimated tax owed")} (${getAppliedTaxLabel()})`;
  }
  if (taxBannerNote) {
    taxBannerNote.textContent = isAllScope
      ? txT("transactions_tax_single_business_note", "Tax estimates stay single-business. Switch to Active business for a filing-specific estimate.")
      : getAppliedTaxNote();
  }
  if (transactionsTaxContext) {
    transactionsTaxContext.textContent = isAllScope
      ? `${txT("exports_tax_context_prefix", "Tax form context")}: ${getTaxFormContext().label} ${txT("transactions_reporting_view", "reporting view")}`
      : `${txT("exports_tax_context_prefix", "Tax form context")}: ${getTaxFormContext().label} ${txT("transactions_estimate", "estimate")}`;
  }
  if (cockpit) {
  cockpit.hidden = !hasTransactions || isAllScope;
  }
  }
  if (upsell) {
    const upsellDismissed = isTransactionsUpsellDismissed();
    upsell.hidden = !(tier === "free" && hasTransactions && !upsellDismissed);
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
  if (getTransactionScope() === "all") {
    businessTaxProfile = getScopeTaxProfile();
    return;
  }

  const fallbackRegion = String(window.LUNA_REGION || "us").toUpperCase();
  const fallbackProvince = String(window.LUNA_PROVINCE || "").toUpperCase();
  businessTaxProfile = resolveEstimatedTaxProfileHelper(fallbackRegion, fallbackProvince);

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return;
    }

    const business = await response.json();
    const region = String(business?.region || business?.country || businessTaxProfile.region || "US").toUpperCase();
    const province = String(business?.province || "").toUpperCase();
    businessTaxProfile = resolveEstimatedTaxProfileHelper(region, province);
    localStorage.setItem("lb_region", businessTaxProfile.region.toLowerCase());
    if (businessTaxProfile.province) {
      localStorage.setItem("lb_province", businessTaxProfile.province);
      window.LUNA_PROVINCE = businessTaxProfile.province;
    }
  } catch (error) {
    console.warn("[Transactions] Unable to load business tax profile", error);
  }
}

function getScopeTaxProfile() {
  const businesses = getBusinessesInScope();
  const regions = new Set(
    businesses.map((business) => (String(business.region || "").toUpperCase() === "CA" ? "CA" : "US"))
  );

  if (regions.size !== 1) {
    return { region: "US", province: "", rate: 0 };
  }

  const onlyRegion = [...regions][0];
  const firstBusiness = businesses[0] || {};
  return resolveEstimatedTaxProfileHelper(onlyRegion, String(firstBusiness.province || "").toUpperCase());
}

function getAppliedTaxLabel() {
  if (businessTaxProfile.region === "CA") {
    const province = businessTaxProfile.province || "CA";
    return `${province} ${formatEstimatedTaxPercentHelper(businessTaxProfile.rate, province)}`;
  }
  return `US ${formatEstimatedTaxPercentHelper(businessTaxProfile.rate)}`;
}

function getAppliedTaxNote() {
  if (businessTaxProfile.region === "CA") {
    const province = businessTaxProfile.province || txT("transactions_your_province", "your province");
    return `${txT("transactions_tax_note_ca_prefix", "Canada T2125 estimate only. Based on net profit using the")} ${province} ${txT("transactions_tax_note_ca_suffix", "estimated combined GST/HST/PST/QST rate.")}`;
  }
  return txT("transactions_tax_note_us", "U.S. Schedule C estimate only. Based on net profit at 24% self-employment rate.");
}

function getTaxFormContext() {
  if (getTransactionScope() === "all" && hasMixedCurrenciesInScope()) {
    return { label: txT("transactions_multi_business", "Multi-business") };
  }
  if (businessTaxProfile.region === "CA") {
    return { label: txT("transactions_tax_form_ca", "Canada T2125") };
  }
  return { label: txT("transactions_tax_form_us", "U.S. Schedule C") };
}

function getScopeCurrencyRegion() {
  const businesses = getBusinessesInScope();
  if (!businesses.length) {
    return getResolvedRegion();
  }
  return String(businesses[0].region || getResolvedRegion()).toLowerCase() === "ca" ? "ca" : "us";
}

function formatDisplayDate(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return escapeHtml(value);
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
  return (items || []).reduce((acc, item) => {
    if (item?.id) {
      acc[item.id] = item;
    }
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
  setStorageArray(STORAGE_KEYS.accounts, updated);
}

function readStorageArray(key, scopeOverride) {
  const storageKey = getScopedStorageKey(key, scopeOverride);
  const raw = storageKey ? localStorage.getItem(storageKey) : null;
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setStorageArray(key, value, scopeOverride) {
  const storageKey = getScopedStorageKey(key, scopeOverride);
  if (!storageKey) {
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function clearStorageArray(key, scopeOverride) {
  const storageKey = getScopedStorageKey(key, scopeOverride);
  if (!storageKey) {
    return;
  }
  localStorage.removeItem(storageKey);
}

function saveTransactions(transactions) {
  setStorageArray(STORAGE_KEYS.transactions, transactions);
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

function getSelectedOptionLabel(select) {
  const option = select?.selectedOptions?.[0];
  return option ? String(option.textContent || "").trim() : "";
}

function mergeSavedTransactionIntoLedger(transaction, context = {}) {
  if (!transaction?.id) {
    return;
  }

  const nextTransaction = {
    ...transaction,
    accountName: transaction.accountName || context.accountName || "",
    categoryName: transaction.categoryName || context.categoryName || ""
  };
  const existingIndex = (ledgerState.transactions || []).findIndex((entry) => entry.id === nextTransaction.id);

  if (existingIndex >= 0) {
    ledgerState.transactions.splice(existingIndex, 1, nextTransaction);
  } else {
    ledgerState.transactions.unshift(nextTransaction);
  }

  saveTransactions(ledgerState.transactions);
}

function validateTransactionForm({ date, description, amount, accountId, categoryId, type }) {
  if (!date) {
    return { message: txT("transactions_validation_date", "Choose a date for the transaction."), fieldId: "date" };
  }
  if (!description || !description.trim()) {
    return { message: txT("transactions_validation_description", "Enter a description for the transaction."), fieldId: "description" };
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return { message: txT("transactions_validation_amount", "Amount must be greater than zero."), fieldId: "amount" };
  }
  if (!accountId) {
    return { message: txT("transactions_validation_account", "Select an account."), fieldId: "account" };
  }
  if (!categoryId) {
    return { message: txT("transactions_validation_category", "Select a category."), fieldId: "category" };
  }
  if (!type) {
    return { message: txT("transactions_validation_type", "Choose a transaction type."), fieldId: "txType" };
  }
  return null;
}

function validateEdgeCaseFields({ sourceAmount, exchangeRate, convertedAmount, personalUsePct }) {
  const srcRaw = String(sourceAmount ?? "").trim();
  if (srcRaw !== "") {
    const src = Number.parseFloat(srcRaw);
    if (!Number.isFinite(src) || src <= 0) {
      return { message: txT("transactions_validation_source_amount", "Source amount must be a positive number."), fieldId: "transactionSourceAmount" };
    }
  }

  const rateRaw = String(exchangeRate ?? "").trim();
  if (rateRaw !== "") {
    const rate = Number.parseFloat(rateRaw);
    if (!Number.isFinite(rate) || rate <= 0) {
      return { message: txT("transactions_validation_exchange_rate", "Exchange rate must be a positive number."), fieldId: "transactionExchangeRate" };
    }
  }

  const convRaw = String(convertedAmount ?? "").trim();
  if (convRaw !== "") {
    const conv = Number.parseFloat(convRaw);
    if (!Number.isFinite(conv) || conv <= 0) {
      return { message: txT("transactions_validation_converted_amount", "Converted amount must be a positive number."), fieldId: "transactionConvertedAmount" };
    }
  }

  const pctRaw = String(personalUsePct ?? "").trim();
  if (pctRaw !== "") {
    const pct = Number.parseFloat(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { message: txT("transactions_validation_personal_use_pct", "Personal-use % must be between 0 and 100."), fieldId: "transactionPersonalUsePct" };
    }
  }

  return null;
}

function wireEdgeCaseFields() {
  const sourceAmountInput = document.getElementById("transactionSourceAmount");
  const exchangeRateInput = document.getElementById("transactionExchangeRate");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const personalUseInput = document.getElementById("transactionPersonalUsePct");
  const reviewStatusSelect = document.getElementById("transactionReviewStatus");
  const amountInput = document.getElementById("amount");

  if (sourceAmountInput && exchangeRateInput) {
    sourceAmountInput.addEventListener("input", updateConvertedAmountPreview);
    exchangeRateInput.addEventListener("input", updateConvertedAmountPreview);
  }

  if (taxTreatmentSelect) {
    taxTreatmentSelect.addEventListener("change", syncEdgeCaseUi);
  }

  if (personalUseInput) {
    personalUseInput.addEventListener("input", updateDeductiblePreview);
  }

  if (amountInput) {
    amountInput.addEventListener("input", updateDeductiblePreview);
  }

  if (reviewStatusSelect) {
    reviewStatusSelect.addEventListener("change", syncEdgeCaseUi);
  }

  syncEdgeCaseUi();
}

function syncEdgeCaseUi() {
  syncPersonalUsePctVisibility();
  updateDeductiblePreview();
  syncReviewStatusWarning();
  syncRegionNotes();
}

function updateConvertedAmountPreview() {
  const sourceInput = document.getElementById("transactionSourceAmount");
  const rateInput = document.getElementById("transactionExchangeRate");
  const convertedInput = document.getElementById("transactionConvertedAmount");
  if (!sourceInput || !rateInput || !convertedInput) {
    return;
  }
  const src = Number.parseFloat(sourceInput.value);
  const rate = Number.parseFloat(rateInput.value);
  if (Number.isFinite(src) && src > 0 && Number.isFinite(rate) && rate > 0) {
    convertedInput.value = (src * rate).toFixed(2);
  }
}

function syncPersonalUsePctVisibility() {
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const personalUseField = document.getElementById("transactionPersonalUsePctField");
  if (!personalUseField) {
    return;
  }
  const isSplitUse = taxTreatmentSelect?.value === "split_use";
  personalUseField.hidden = !isSplitUse;
  if (!isSplitUse) {
    const personalUseInput = document.getElementById("transactionPersonalUsePct");
    if (personalUseInput) {
      personalUseInput.value = "";
    }
    const preview = document.getElementById("transactionDeductiblePreview");
    if (preview) {
      preview.textContent = "";
      preview.hidden = true;
    }
  }
}

function updateDeductiblePreview() {
  const amountInput = document.getElementById("amount");
  const pctInput = document.getElementById("transactionPersonalUsePct");
  const preview = document.getElementById("transactionDeductiblePreview");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  if (!preview) {
    return;
  }
  const amount = Number.parseFloat(amountInput?.value || "0");
  const pct = Number.parseFloat(pctInput?.value || "");
  if (taxTreatmentSelect?.value !== "split_use" || !Number.isFinite(pct)) {
    preview.textContent = "";
    preview.hidden = true;
    return;
  }
  if (Number.isFinite(amount) && amount > 0 && pct >= 0 && pct <= 100) {
    const deductiblePct = 100 - pct;
    const deductibleAmount = amount * (deductiblePct / 100);
    preview.textContent = `${txT("transactions_deductible_preview", "Deductible portion")}: ${deductiblePct.toFixed(1)}% = ${formatCurrency(deductibleAmount)}`;
    preview.hidden = false;
  } else {
    preview.textContent = "";
    preview.hidden = true;
  }
}

function syncReviewStatusWarning() {
  const reviewStatusSelect = document.getElementById("transactionReviewStatus");
  const lockedWarning = document.getElementById("transactionLockedWarning");
  if (!lockedWarning) {
    return;
  }
  lockedWarning.hidden = reviewStatusSelect?.value !== "locked";
}

function syncRegionNotes() {
  const region = getResolvedRegion();
  document.querySelectorAll("[data-region-show]").forEach((el) => {
    el.hidden = el.getAttribute("data-region-show") !== region;
  });
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
  receiptInputElement.className = "receipt-upload-input";
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
      credentials: "include",
      headers: {
        ...authHeader(),
        ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
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
    el.classList.add("slot-spin");
  });

  setTimeout(() => {
    elements.forEach((el) => {
      el.classList.remove("slot-spin");
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
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const buttons = document.querySelectorAll(".txn-intent-btn");
  if (typeSelect) {
    typeSelect.value = intent;
  }
  if (taxTreatmentSelect) {
    if (intent === "income") {
      taxTreatmentSelect.value = "income";
    } else if (taxTreatmentSelect.value === "income") {
      taxTreatmentSelect.value = "operating";
    }
  }
  buttons.forEach((button) => {
    const matches = (button.dataset.intent === "income" ? "income" : "expense") === intent;
    button.classList.toggle("is-active", matches);
  });
  // Show payer/1099 fields only for income
  const modal = document.querySelector(".transaction-modal");
  if (modal) modal.dataset.intent = intent;
  if (intent !== "income") {
    const payerName = document.getElementById("payerName");
    const taxFormType = document.getElementById("taxFormType");
    if (payerName) payerName.value = "";
    if (taxFormType) taxFormType.value = "";
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
