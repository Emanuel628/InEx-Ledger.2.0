const STORAGE_KEYS = {
  scope: "ledger_transactions_scope",
  upsellHidden: "ledger_transactions_upsell_hidden"
};

const ledgerState = {
  transactions: [],
  accounts: [],
  categories: []
};

const recurringState = {
  templates: []
};

const transactionFilters = {
  type: "all",
  search: "",
  category: "",
  period: localStorage.getItem("lb_tx_period") || "this-month"
};

const DRAWER_OPEN_LABEL = "+ Add new";
const DRAWER_CLOSE_LABEL = "Close";
const CUSTOM_CATEGORY_OPTION_VALUE = "__custom__";
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
let currentPage = 0;
const PAGE_SIZE = 25;
const RECURRING_SUGGESTIONS_DISMISSED_KEY = 'lb_recurring_suggestions_dismissed';
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
const selectedTransactionIds = new Set();
const selectedRecurringTemplateIds = new Set();
let transactionUndoMessage = "";
let transactionUndoAvailable = false;
let transactionUndoError = false;
let transactionFxReferenceState = null;
let transactionFxReferenceDismissed = false;
let transactionFxReferenceRequestId = 0;
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

function getTransactionReferenceCurrency() {
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
  setInterval(() => renderGhostSuggestions(), 5 * 60 * 1000);
  wireTransactionSearch();
  wireTransactionCategoryFilter();
  wirePagination();
  wireTransactionModal();
  window.addEventListener("accountsUpdated", async () => {
    await refreshAccountOptions();
    renderTransactionsTable();
    renderRecurringAccountOptions();
  });

  const tier = effectiveTier();
  const cockpit = document.getElementById("tax-cockpit");
  const upsell = document.getElementById("tax-upsell");
  const advancedDetails = document.getElementById("transactionAdvancedDetails");
  const upsellDismissed = isTransactionsUpsellDismissed();
  const hasTransactions = (ledgerState.transactions || []).length > 0;

  if (cockpit) {
    cockpit.hidden = tier === "free" || !hasTransactions;
  }
  if (advancedDetails) {
    advancedDetails.hidden = tier === "free";
    if (tier === "free") {
      advancedDetails.removeAttribute("open");
    }
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
  return Array.isArray(transactionBusinessContext.businesses)
    ? transactionBusinessContext.businesses
    : [];
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

function syncTransactionScopeOptionLabel() {
  const select = document.getElementById("transactionsScope");
  const activeOption = select?.querySelector('option[value="active"]');
  if (!activeOption) {
    return;
  }

  const activeBusiness =
    getBusinessById(transactionBusinessContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "") ||
    getStoredBusinesses()[0] ||
    null;

  activeOption.textContent = activeBusiness?.name || txT("exports_scope_active_short", "Active business");
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

  syncTransactionScopeOptionLabel();

  if (subtitle) {
    subtitle.textContent = isAllScope
      ? `${getBusinessesInScope().length || 0} ${txT("transactions_scope_businesses", "businesses")} · ${txT("transactions_scope_portfolio_view", "combined reporting view")}`
      : txT("transactions_scope_active_subtitle", "Active business ledger · current reporting period");
  }

  if (subtitle) {
    subtitle.textContent = isAllScope
      ? `${getBusinessesInScope().length || 0} ${txT("transactions_scope_businesses", "businesses")} - ${txT("transactions_scope_portfolio_view", "combined reporting view")}`
      : txT("transactions_scope_active_subtitle", "Active business ledger - current reporting period");
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

async function switchToActiveScopeIfNeeded() {
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
  const categorySelect = document.getElementById("category");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");

  updateHelpText(accountHelp, categoryHelp);
  initTransactionReceiptField();
  wireEdgeCaseFields();
  categorySelect?.addEventListener("change", () => {
    syncCustomCategoryField("category", "customCategoryName");
  });
  typeSelect?.addEventListener("change", () => {
    if (!taxTreatmentSelect) {
      return;
    }
    populateCategoriesFromStorage();
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
    const type = typeSelect?.value === "income" ? "income" : "expense";
    const categoryId = resolveSelectedCategoryValue("category", "customCategoryName");
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
          categoryName: getSelectedCategoryLabel(categorySelect, "customCategoryName")
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
      const canOpen = await switchToActiveScopeIfNeeded();
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
  const typeSelect = document.getElementById("recurringType");
  const categorySelect = document.getElementById("recurringCategory");
  if (!form) {
    return;
  }

  typeSelect?.addEventListener("change", () => {
    renderRecurringCategoryOptions();
  });
  categorySelect?.addEventListener("change", () => {
    syncCustomCategoryField("recurringCategory", "recurringCustomCategoryName");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const recurringType = document.getElementById("recurringType")?.value || "expense";
    const payload = {
      type: recurringType,
      cadence: document.getElementById("recurringCadence")?.value || "monthly",
      description: document.getElementById("recurringDescription")?.value.trim() || "",
      amount: parseFloat(document.getElementById("recurringAmount")?.value || ""),
      account_id: document.getElementById("recurringAccount")?.value || "",
      category_id: resolveSelectedCategoryValue("recurringCategory", "recurringCustomCategoryName"),
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
  } catch (error) {
    console.error("Failed to load transactions:", error);
    hasTransactionsLoadFailed = true;
    ledgerState.transactions = [];
    unattachedReceiptsCount = 0;
  } finally {
    renderAccountOptions();
    renderCategoryOptions();
    setTransactionsLoading(false);
    applyFilters(true);
    renderGhostSuggestions();
    syncTransactionUndoBar();
    void syncTransactionUndoAvailability({ preserveMessage: !!transactionUndoMessage });
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
      applyFilters(true);
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
    applyFilters(true);
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
      applyFilters(true);
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
  const updated = (ledgerState.transactions || []).map((txn) => {
    if (txn.id === transactionId) {
      return { ...txn, note };
    }
    return txn;
  });
  ledgerState.transactions = updated;
  applyFilters();
}

function handleEditEntry(transactionId) {
  const transaction = (ledgerState.transactions || []).find((txn) => txn.id === transactionId);
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
  renderRecurringCategoryOptions();
  document.getElementById("recurringCadence").value = template.cadence || "monthly";
  document.getElementById("recurringDescription").value = template.description || "";
  document.getElementById("recurringAmount").value = template.amount ?? "";
  document.getElementById("recurringAccount").value = template.account_id || "";
  document.getElementById("recurringCategory").value = template.category_id || "";
  syncCustomCategoryField("recurringCategory", "recurringCustomCategoryName");
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
  renderRecurringCategoryOptions();
  clearCustomCategoryField("recurringCategory", "recurringCustomCategoryName");
  const submitButton = document.getElementById("recurringSubmit");
  if (submitButton) {
    submitButton.textContent = txT("transactions_recurring_save_submit", "Save recurring template");
  }
  setRecurringFormMessage("");
}

async function loadRecurringTemplates() {
  const tbody = document.getElementById("recurringTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr class="placeholder-row"><td colspan="6" class="placeholder placeholder-cell">${txT("transactions_recurring_loading", "Loading recurring templates...")}</td></tr>`;
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
  const type = document.getElementById("recurringType")?.value || "expense";
  select.innerHTML = `<option value="">${txT("transactions_select_category", "Select category")}</option>`;
  getCategories().filter((category) => category.type === type).forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id || category.name;
    option.textContent = category.name;
    select.appendChild(option);
  });
  appendCustomCategoryOption(select, type);
  select.value = hasOptionWithValue(select, currentValue) ? currentValue : "";
  syncCustomCategoryField("recurringCategory", "recurringCustomCategoryName");
}

function buildTransactionsEmptyStateMarkup(title, body, actionLabel) {
  return `
    <div class="table-empty-state">
      <div class="table-empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 96 72" fill="none">
          <rect x="18" y="12" width="40" height="48" rx="10" fill="#eaf0f7"></rect>
          <rect x="26" y="22" width="24" height="4" rx="2" fill="#b8c5d8"></rect>
          <rect x="26" y="32" width="20" height="4" rx="2" fill="#c6d2e2"></rect>
          <rect x="26" y="42" width="16" height="4" rx="2" fill="#c6d2e2"></rect>
          <circle cx="64" cy="46" r="12" fill="#ffffff" stroke="#1d4f91" stroke-width="4"></circle>
          <path d="M72 54l8 8" stroke="#1d4f91" stroke-width="4" stroke-linecap="round"></path>
          <circle cx="64" cy="46" r="2.5" fill="#1d4f91"></circle>
          <circle cx="70" cy="16" r="4" fill="#d8e5f5"></circle>
        </svg>
      </div>
      <h3 class="table-empty-title">${title}</h3>
      <p class="table-empty-copy">${body}</p>
      ${actionLabel ? `<button type="button" class="table-empty-button" id="transactionsEmptyAddButton">${actionLabel}</button>` : ""}
    </div>
  `;
}

function buildRecurringEmptyStateMarkup() {
  return `
    <div class="table-empty-state table-empty-state-recurring">
      <div class="table-empty-illustration table-empty-illustration-calendar" aria-hidden="true">
        <svg viewBox="0 0 96 72" fill="none">
          <rect x="22" y="16" width="40" height="38" rx="8" fill="#e9eef6"></rect>
          <rect x="22" y="24" width="40" height="8" fill="#c8d3e2"></rect>
          <rect x="28" y="38" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="39" y="38" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="50" y="38" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="28" y="47" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="39" y="47" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="50" y="47" width="6" height="6" rx="1.5" fill="#c0cbdb"></rect>
          <rect x="30" y="12" width="4" height="10" rx="2" fill="#7f91aa"></rect>
          <rect x="50" y="12" width="4" height="10" rx="2" fill="#7f91aa"></rect>
        </svg>
      </div>
      <h3 class="table-empty-title">${txT("transactions_recurring_empty", "No recurring templates yet.")}</h3>
      <p class="table-empty-copy">Create a template to automate your regular expenses.</p>
    </div>
  `;
}

function updateTransactionSelectionHeader(visibleTransactions = []) {
  void visibleTransactions;
}

function syncBulkBar() {
  const bar = document.getElementById("txBulkBar");
  const countEl = document.getElementById("txBulkCount");
  if (!bar) return;
  const n = selectedTransactionIds.size;
  if (n >= 2) {
    if (countEl) countEl.textContent = `${n} selected`;
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

function setTransactionUndoState({ message = "", canUndo = false, isError = false } = {}) {
  transactionUndoMessage = String(message || "").trim();
  transactionUndoAvailable = !!canUndo;
  transactionUndoError = !!isError;
  syncTransactionUndoBar();
}

async function syncTransactionUndoAvailability({ preserveMessage = true } = {}) {
  try {
    const response = await apiFetch("/api/transactions/undo-delete-status");
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const remainingUndoCount = Number(payload?.remaining_undo_count || 0);
    if (!preserveMessage) {
      transactionUndoMessage = remainingUndoCount > 0
        ? `${remainingUndoCount} ${remainingUndoCount === 1 ? "archived transaction is" : "archived transactions are"} available to restore.`
        : "";
      transactionUndoError = false;
    }
    transactionUndoAvailable = remainingUndoCount > 0;
    syncTransactionUndoBar();
  } catch (_) {
    // Keep the local undo state if the status probe fails.
  }
}

function getTransactionFxReferenceDate() {
  const exchangeDateInput = document.getElementById("transactionExchangeDate");
  const transactionDateInput = document.getElementById("date");
  return (
    String(exchangeDateInput?.value || "").trim()
    || String(transactionDateInput?.value || "").trim()
    || new Date().toISOString().slice(0, 10)
  );
}

function formatTransactionFxReferenceLine({ from, to, rate, date }) {
  const sourceAmountInput = document.getElementById("transactionSourceAmount");
  const sourceAmount = Number.parseFloat(sourceAmountInput?.value || "");
  const normalizedRate = Number(rate || 0);
  const rateLabel = `${normalizedRate.toFixed(6)} ${to}`;
  if (Number.isFinite(sourceAmount) && sourceAmount > 0) {
    const converted = sourceAmount * normalizedRate;
    return `${sourceAmount.toFixed(2)} ${from} ≈ ${converted.toFixed(2)} ${to} using ${rateLabel} on ${formatDisplayDate(date)}`;
  }
  return `1 ${from} ≈ ${rateLabel} on ${formatDisplayDate(date)}`;
}

function syncTransactionFxReferenceBox({
  visible = false,
  loading = false,
  rate = null,
  detail = "",
  note = "",
  canApply = false,
  isError = false
} = {}) {
  const box = document.getElementById("transactionFxReferenceBox");
  const rateValue = document.getElementById("transactionFxReferenceValue");
  const detailNode = document.getElementById("transactionFxReferenceDetail");
  const noteNode = document.getElementById("transactionFxReferenceAdvisory");
  const applyButton = document.getElementById("transactionFxApplyButton");
  const toggleButton = document.getElementById("transactionFxInfoToggle");

  if (!box || !rateValue || !detailNode || !noteNode || !applyButton || !toggleButton) {
    return;
  }

  box.hidden = !visible;
  box.classList.toggle("is-loading", visible && loading);
  box.classList.toggle("is-error", visible && isError);
  toggleButton.setAttribute("aria-expanded", visible ? "true" : "false");
  rateValue.textContent = loading
    ? txT("transactions_fx_loading", "Loading reference rate...")
    : (rate || txT("transactions_fx_empty", "No reference rate loaded."));
  detailNode.textContent = detail;
  detailNode.hidden = !detail;
  noteNode.textContent = note;
  applyButton.hidden = !canApply;
  applyButton.disabled = !canApply;
}

function clearTransactionFxReferenceBox() {
  transactionFxReferenceState = null;
  syncTransactionFxReferenceBox({ visible: false });
}

async function refreshTransactionFxReference({ forceOpen = false } = {}) {
  const currencySelect = document.getElementById("transactionCurrency");
  const exchangeRateInput = document.getElementById("transactionExchangeRate");
  const from = String(currencySelect?.value || "").trim().toUpperCase();
  const to = String(getTransactionReferenceCurrency() || "").trim().toUpperCase();
  const date = getTransactionFxReferenceDate();

  if (!currencySelect || !exchangeRateInput) {
    return;
  }

  if (!from || from === to) {
    transactionFxReferenceDismissed = false;
    clearTransactionFxReferenceBox();
    return;
  }

  if (transactionFxReferenceDismissed && !forceOpen) {
    return;
  }

  const requestId = ++transactionFxReferenceRequestId;
  syncTransactionFxReferenceBox({
    visible: true,
    loading: true,
    note: txT("transactions_fx_advisory", "Reference only. Confirm the final exchange rate independently before filing or reconciliation.")
  });

  try {
    const response = await apiFetch(
      `/api/transactions/exchange-rate-reference?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`
    );
    const payload = response ? await response.json().catch(() => null) : null;
    if (requestId !== transactionFxReferenceRequestId) {
      return;
    }
    if (!response || !response.ok || !payload?.rate) {
      transactionFxReferenceState = null;
      syncTransactionFxReferenceBox({
        visible: true,
        loading: false,
        rate: txT("transactions_fx_unavailable", "Reference unavailable"),
        note: payload?.error || txT("transactions_fx_error", "Unable to load a reference exchange rate right now."),
        isError: true
      });
      return;
    }

    transactionFxReferenceState = {
      from: payload.from || from,
      to: payload.to || to,
      rate: Number(payload.rate),
      date: payload.date || date,
      advisory: payload.advisory || txT("transactions_fx_advisory", "Reference only. Confirm the final exchange rate independently before filing or reconciliation.")
    };

    syncTransactionFxReferenceBox({
      visible: true,
      loading: false,
      rate: `1 ${transactionFxReferenceState.from} = ${transactionFxReferenceState.rate.toFixed(6)} ${transactionFxReferenceState.to}`,
      detail: formatTransactionFxReferenceLine(transactionFxReferenceState),
      note: transactionFxReferenceState.advisory,
      canApply: true
    });
  } catch (_) {
    if (requestId !== transactionFxReferenceRequestId) {
      return;
    }
    transactionFxReferenceState = null;
    syncTransactionFxReferenceBox({
      visible: true,
      loading: false,
      rate: txT("transactions_fx_unavailable", "Reference unavailable"),
      note: txT("transactions_fx_error", "Unable to load a reference exchange rate right now."),
      isError: true
    });
  }
}

function syncTransactionFxReferenceSummary() {
  if (!transactionFxReferenceState) {
    return;
  }
  syncTransactionFxReferenceBox({
    visible: true,
    loading: false,
    rate: `1 ${transactionFxReferenceState.from} = ${transactionFxReferenceState.rate.toFixed(6)} ${transactionFxReferenceState.to}`,
    detail: formatTransactionFxReferenceLine(transactionFxReferenceState),
    note: transactionFxReferenceState.advisory,
    canApply: true
  });
}

function applyTransactionFxReferenceRate() {
  if (!transactionFxReferenceState?.rate) {
    return;
  }
  const exchangeRateInput = document.getElementById("transactionExchangeRate");
  if (!exchangeRateInput) {
    return;
  }
  exchangeRateInput.value = transactionFxReferenceState.rate.toFixed(6);
  updateConvertedAmountPreview();
  syncTransactionFxReferenceSummary();
}

function syncTransactionUndoBar() {
  const undoBar = document.getElementById("txUndoBar");
  const undoMessage = document.getElementById("txUndoMessage");
  const undoButton = document.getElementById("txUndoDeleteButton");
  const isAllScope = getTransactionScope() === "all";
  const shouldShowMessage = !isAllScope && !!transactionUndoMessage;
  const shouldShowUndo = !isAllScope && transactionUndoAvailable;

  if (!undoBar || !undoMessage || !undoButton) {
    return;
  }

  undoBar.hidden = !shouldShowMessage;
  undoBar.classList.toggle("is-error", shouldShowMessage && transactionUndoError);
  undoMessage.textContent = transactionUndoMessage;
  undoButton.hidden = !shouldShowUndo;
  undoButton.disabled = !shouldShowUndo;
}

function renderRecurringTemplates() {
  const tbody = document.getElementById("recurringTableBody");
  if (!tbody) {
    return;
  }

  if (!recurringState.templates.length) {
    selectedRecurringTemplateIds.clear();
    closeRecurringRowActionPopup();
    tbody.innerHTML = `<tr class="placeholder-row"><td colspan="6" class="placeholder placeholder-cell">${buildRecurringEmptyStateMarkup()}</td></tr>`;
    return;
  }

  if (_popupRecurringTemplateId && !recurringState.templates.some((item) => String(item.id) === String(_popupRecurringTemplateId))) {
    selectedRecurringTemplateIds.delete(String(_popupRecurringTemplateId));
    closeRecurringRowActionPopup();
  }

  tbody.innerHTML = "";
  recurringState.templates.forEach((template) => {
    const templateId = String(template.id);
    const row = document.createElement("tr");
    const activeBadge = template.active
      ? `<span class="status-badge status-cleared">${txT("transactions_recurring_active", "Active")}</span>`
      : `<span class="status-badge status-pending">${txT("transactions_recurring_paused", "Paused")}</span>`;

    row.innerHTML = `
      <td class="table-select-cell">
        <input
          type="checkbox"
          class="tx-row-select recurring-row-select"
          data-id="${template.id}"
          aria-label="Select recurring template ${escapeHtml(template.description || template.id)}"
          ${selectedRecurringTemplateIds.has(templateId) ? "checked" : ""}
        >
      </td>
      <td class="recurring-description-cell">
        <div class="recurring-meta">
          <span class="recurring-primary">${escapeHtml(template.description || "-")}</span>
          <span class="recurring-secondary">${template.note ? escapeHtml(template.note) : txT("transactions_recurring_no_note", "No internal note")}</span>
        </div>
      </td>
      <td>${formatRecurringCadence(template.cadence)}</td>
      <td>${formatDisplayDate(template.next_run_date)}</td>
      <td>${activeBadge}</td>
      <td class="amount-cell"><span class="${template.type === "income" ? "amount-positive" : "amount-negative"}">${template.type === "income" ? "+" : "-"}${formatCurrency(Math.abs(Number(template.amount) || 0))}</span></td>
    `;
    row.classList.toggle("is-selected", selectedRecurringTemplateIds.has(templateId));
    tbody.appendChild(row);

    row.querySelector(".recurring-row-select")?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    row.querySelector(".recurring-row-select")?.addEventListener("change", (event) => {
      const checkbox = event.target;
      const isChecked = checkbox.checked;
      if (isChecked) {
        selectedRecurringTemplateIds.clear();
        selectedRecurringTemplateIds.add(templateId);
        tbody.querySelectorAll(".recurring-row-select").forEach((otherCheckbox) => {
          if (otherCheckbox !== checkbox) {
            otherCheckbox.checked = false;
            otherCheckbox.closest("tr")?.classList.remove("is-selected");
          }
        });
        openRecurringRowActionPopup(template.id, checkbox);
      } else {
        selectedRecurringTemplateIds.delete(templateId);
        if (String(_popupRecurringTemplateId) === templateId) {
          closeRecurringRowActionPopup();
        }
      }
      row.classList.toggle("is-selected", isChecked);
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
  const payerNameInput = document.getElementById("payerName");
  const taxFormTypeInput = document.getElementById("taxFormType");

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
    populateCategoriesFromStorage();
    categorySelect.value = transaction.categoryId || "";
  }
  if (typeSelect) {
    typeSelect.value = transaction.type || "expense";
  }
  setTransactionType(transaction.type || "expense");
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
  if (payerNameInput) {
    payerNameInput.value = transaction.payerName || transaction.payer_name || "";
  }
  if (taxFormTypeInput) {
    taxFormTypeInput.value = transaction.taxFormType || transaction.tax_form_type || "";
  }
  syncEdgeCaseUi();
  void refreshTransactionFxReference();
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
  clearCustomCategoryField("category", "customCategoryName");
  setTransactionAdvancedDefaults();
  transactionFxReferenceDismissed = false;
  clearTransactionFxReferenceBox();
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
        : "Use this for sales tax or other indirect taxes that need review.";
  }
  syncEdgeCaseUi();
  transactionFxReferenceDismissed = false;
  void refreshTransactionFxReference();
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

function applyFilters(resetPage = false) {
  if (resetPage) currentPage = 0;
  const filtered = getFilteredTransactions();
  renderTransactionsTable(filtered);
  renderTotals(filtered);
}

function renderPagination(totalCount) {
  const bar = document.getElementById("txPagination");
  const prevBtn = document.getElementById("txPrevPage");
  const nextBtn = document.getElementById("txNextPage");
  const info = document.getElementById("txPageInfo");
  if (!bar) return;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  bar.hidden = totalPages <= 1;
  if (totalPages <= 1) return;
  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);
  if (info) info.textContent = `${start}–${end} of ${totalCount}`;
  if (prevBtn) prevBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
}

function wirePagination() {
  document.getElementById("txPrevPage")?.addEventListener("click", () => {
    if (currentPage > 0) { currentPage--; applyFilters(); }
  });
  document.getElementById("txNextPage")?.addEventListener("click", () => {
    const totalPages = Math.ceil(getFilteredTransactions().length / PAGE_SIZE);
    if (currentPage < totalPages - 1) { currentPage++; applyFilters(); }
  });
}

function normalizeTransactionDateValue(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function getCurrentDateParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth()
  };
}

function matchesTransactionPeriod(txn, period = transactionFilters.period) {
  if (period === "all") {
    return true;
  }
  const normalizedDate = normalizeTransactionDateValue(txn?.date);
  if (!normalizedDate) {
    return false;
  }

  const [yearString, monthString] = normalizedDate.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return false;
  }

  const { year: currentYear, month: currentMonth } = getCurrentDateParts();
  if (period === "this-month") {
    return year === currentYear && monthIndex === currentMonth;
  }
  if (period === "ytd") {
    return year === currentYear;
  }
  if (period === "last-month") {
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    return year === lastMonthDate.getFullYear() && monthIndex === lastMonthDate.getMonth();
  }
  return true;
}

function getFilteredTransactions() {
  const transactions = ledgerState.transactions || [];
  const term = (transactionFilters.search || "").trim().toLowerCase();
  let filtered = transactions.filter((tx) => matchesTransactionPeriod(tx));
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
  return filtered;
}

async function handleTransactionDelete(transactionId) {
  const response = await apiFetch(`/api/transactions/${transactionId}`, {
    method: "DELETE"
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    setTransactionUndoState({
      message: errorPayload?.error || txT("transactions_error_delete", "Unable to archive transaction."),
      canUndo: false,
      isError: true
    });
    closeTransactionModal();
    return;
  }

  if (editingTransactionId === transactionId) {
    editingTransactionId = null;
    setEditingMode(false);
  }
  selectedTransactionIds.delete(String(transactionId));
  closeTransactionModal();
  await loadTransactions();
  setTransactionUndoState({
    message: txT("transactions_archive_success", "Transaction archived."),
    canUndo: true,
    isError: false
  });
}

async function handleUndoArchivedTransaction() {
  const response = await apiFetch("/api/transactions/undo-delete", {
    method: "POST"
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    const status = response?.status || 0;
    setTransactionUndoState({
      message: errorPayload?.error || txT("transactions_undo_error", "Unable to restore the archived transaction."),
      canUndo: status !== 404,
      isError: true
    });
    return;
  }

  selectedTransactionIds.clear();
  const payload = await response.json().catch(() => null);
  await loadTransactions();
  const remainingUndoCount = Number(payload?.remaining_undo_count || 0);
  setTransactionUndoState({
    message: remainingUndoCount > 0
      ? `${txT("transactions_undo_success", "Archived transaction restored.")} ${remainingUndoCount} ${remainingUndoCount === 1 ? "undo" : "undos"} remaining.`
      : txT("transactions_undo_success", "Archived transaction restored."),
    canUndo: remainingUndoCount > 0,
    isError: false
  });
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
  ledgerState.accounts = accounts;
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
      return [];
    }

    const accounts = await response.json();
    if (!Array.isArray(accounts)) {
      return [];
    }

    return accounts;
  } catch (error) {
    console.warn("[Transactions] Unable to refresh accounts", error);
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

  const currentValue = select.value;
  const type = document.getElementById("txType")?.value || "expense";
  const categories = getCategories();
  select.innerHTML = `<option value="">${txT("transactions_select_category", "Select category")}</option>`;
  categories.filter((category) => category.type === type).forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id || category.name;
    option.textContent = category.name;
    select.appendChild(option);
  });
  appendCustomCategoryOption(select, type);

  select.disabled = false;
  select.value = hasOptionWithValue(select, currentValue) ? currentValue : "";
  syncCustomCategoryField("category", "customCategoryName");

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
  ledgerState.categories = categories;
  populateCategoriesFromStorage();
  renderRecurringCategoryOptions();
}

async function fetchCategoriesForTransactions() {
  try {
    const response = await apiFetch(`/api/categories${buildTransactionScopeQuery()}`);
    if (!response || !response.ok) {
      return [];
    }

    const categories = await response.json().catch(() => []);
    if (!Array.isArray(categories)) {
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
    return [];
  }
}

async function fetchTransactionsForPage() {
  const query = buildTransactionScopeQuery();
  const noCacheQuery = query ? `${query}&_ts=${Date.now()}` : `?_ts=${Date.now()}`;
  const response = await apiFetch(`/api/transactions${noCacheQuery}`);
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
    const query = buildTransactionScopeQuery();
    const noCacheQuery = query ? `${query}&_ts=${Date.now()}` : `?_ts=${Date.now()}`;
    const response = await apiFetch(`/api/receipts${noCacheQuery}`);
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
      ).slice(0, 10),
    payerName: transaction.payerName || transaction.payer_name || "",
    taxFormType: transaction.taxFormType || transaction.tax_form_type || ""
  };
}

function normalizeDescForSuggestion(desc) {
  return String(desc || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function detectRecurringSuggestions() {
  const dismissed = new Set(JSON.parse(localStorage.getItem(RECURRING_SUGGESTIONS_DISMISSED_KEY) || "[]"));
  const templateDescs = new Set(
    (recurringState.templates || []).map(t => normalizeDescForSuggestion(t.description))
  );
  const transactions = ledgerState.transactions || [];

  const groups = {};
  for (const txn of transactions) {
    const key = normalizeDescForSuggestion(txn.description);
    if (key.length < 3) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(txn);
  }

  const suggestions = [];
  for (const [key, txns] of Object.entries(groups)) {
    if (dismissed.has(key) || templateDescs.has(key)) continue;
    const months = new Set(txns.map(t => t.date.slice(0, 7)));
    if (months.size < 2) continue;

    const amountCounts = {};
    for (const txn of txns) {
      const a = String(txn.amount);
      amountCounts[a] = (amountCounts[a] || 0) + 1;
    }
    const mostCommonAmount = Number(
      Object.entries(amountCounts).sort((a, b) => b[1] - a[1])[0][0]
    );

    const latest = txns.reduce((a, b) => (a.date > b.date ? a : b));
    suggestions.push({
      key,
      description: latest.description,
      amount: mostCommonAmount,
      type: latest.type,
      categoryId: latest.categoryId,
      accountId: latest.accountId,
      months: months.size,
      occurrences: txns.length
    });
  }

  return suggestions
    .sort((a, b) => b.months - a.months || b.occurrences - a.occurrences)
    .slice(0, 3);
}

function dismissRecurringSuggestion(key) {
  const dismissed = new Set(JSON.parse(localStorage.getItem(RECURRING_SUGGESTIONS_DISMISSED_KEY) || "[]"));
  dismissed.add(key);
  localStorage.setItem(RECURRING_SUGGESTIONS_DISMISSED_KEY, JSON.stringify([...dismissed]));
}

function prefillRecurringForm(suggestion) {
  const descInput = document.getElementById("recurringDescription");
  const amountInput = document.getElementById("recurringAmount");
  const typeSelect = document.getElementById("recurringType");
  const cadenceSelect = document.getElementById("recurringCadence");
  const accountSelect = document.getElementById("recurringAccount");
  const categorySelect = document.getElementById("recurringCategory");

  if (descInput) descInput.value = suggestion.description;
  if (amountInput) amountInput.value = suggestion.amount.toFixed(2);
  if (cadenceSelect) cadenceSelect.value = "monthly";
  if (typeSelect) {
    typeSelect.value = suggestion.type;
    typeSelect.dispatchEvent(new Event("change"));
  }
  if (accountSelect && suggestion.accountId) accountSelect.value = suggestion.accountId;
  setTimeout(() => {
    if (categorySelect && suggestion.categoryId) categorySelect.value = suggestion.categoryId;
  }, 50);
}

function renderGhostSuggestions() {
  const panel = document.getElementById("recurringGhostPanel");
  if (!panel) return;

  const suggestions = detectRecurringSuggestions();
  if (!suggestions.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <div class="tx-ghost-panel-header">
      <span class="tx-ghost-badge">Recurring?</span>
      <span class="tx-ghost-panel-title">We spotted patterns that might be recurring</span>
    </div>
  `;

  for (const s of suggestions) {
    const monthsLabel = `${s.months} month${s.months === 1 ? "" : "s"}`;
    const amountStr = formatCurrency(s.amount);
    const card = document.createElement("div");
    card.className = "tx-ghost-card";
    card.dataset.ghostKey = s.key;
    card.innerHTML = `
      <div class="tx-ghost-inner">
        <span class="tx-ghost-desc">${escapeHtml(s.description)}</span>
        <span class="tx-ghost-meta">seen ${monthsLabel} · ${amountStr}</span>
        <div class="tx-ghost-actions">
          <button type="button" class="tx-ghost-accept">Make recurring</button>
          <button type="button" class="tx-ghost-dismiss">Not now</button>
        </div>
      </div>
    `;
    card.querySelector(".tx-ghost-accept").addEventListener("click", () => {
      prefillRecurringForm(s);
      document.querySelector(".recurring-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      openRecurringDrawer();
    });
    card.querySelector(".tx-ghost-dismiss").addEventListener("click", () => {
      dismissRecurringSuggestion(s.key);
      renderGhostSuggestions();
    });
    panel.appendChild(card);
  }
}

function renderTransactionsTable(filteredTransactions) {
  const tbody = document.querySelector("tbody");
  const transactions =
    filteredTransactions !== undefined ? filteredTransactions : ledgerState.transactions || [];
  const isFilteredView = filteredTransactions !== undefined;

  if (!tbody) return;

  closeRowActionPopup();

  if (transactionsLoading && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr class="placeholder-row"><td colspan="8" class="placeholder placeholder-cell">${txT("transactions_loading", "Loading transactions...")}</td></tr>`;
    updateTransactionSelectionHeader();
    return;
  }

  if (hasTransactionsLoadFailed && filteredTransactions === undefined) {
    tbody.innerHTML = `<tr class="placeholder-row"><td colspan="8" class="placeholder placeholder-cell">${txT("transactions_error_load", "Unable to load transactions. Please refresh.")}</td></tr>`;
    updateTransactionSelectionHeader();
    return;
  }

  if (transactions.length === 0) {
    if (isFilteredView && ledgerState.transactions.length > 0) {
      tbody.innerHTML = `<tr class="placeholder-row"><td colspan="8" class="placeholder placeholder-cell">${txT("transactions_empty_filtered", "No matching transactions.")}</td></tr>`;
    } else {
      tbody.innerHTML = `
        <tr class="placeholder-row">
          <td colspan="8" class="placeholder placeholder-cell">
            ${buildTransactionsEmptyStateMarkup(
              typeof t === "function" ? t("transactions_empty") : "No transactions yet.",
              "Add your first transaction to start tracking income and expenses.",
              "+ Add transaction"
            )}
          </td>
        </tr>
      `;
      tbody.querySelector("#transactionsEmptyAddButton")?.addEventListener("click", () => {
        openTransactionDrawer();
      });
    }
    updateTransactionSelectionHeader();
    return;
  }

  const accountsById = mapById(getAccounts());
  const categoriesById = mapById(getCategories());
  const isAllScope = getTransactionScope() === "all";
  const canUseEdgeCaseTools = effectiveTier() === "v1";
  tbody.innerHTML = "";

  const pageStart = currentPage * PAGE_SIZE;
  const pageTransactions = transactions.slice(pageStart, pageStart + PAGE_SIZE);
  renderPagination(transactions.length);

  pageTransactions.forEach((txn) => {
    const row = document.createElement("tr");
    row.id = `txn-${txn.id}`;
    const txnId = String(txn.id);
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
    const typeBadge = txn.type === "income"
      ? formatTransactionMetaBadge(txT("transactions_type_income", "Income"), "income-type")
      : formatTransactionMetaBadge(txT("transactions_type_expense", "Expense"), "expense-type");
    const metadataBadges = [];
    const businessCurrency = String(getBusinessById(txn.businessId)?.region || businessTaxProfile.region || getResolvedRegion()).toUpperCase() === "CA"
      ? "CAD"
      : "USD";
    if (canUseEdgeCaseTools && txn.currency && txn.currency !== businessCurrency) {
      metadataBadges.push(formatTransactionMetaBadge(`FX ${txn.currency}`, "fx"));
    }
    if (canUseEdgeCaseTools && txn.taxTreatment && txn.taxTreatment !== "operating" && txn.taxTreatment !== "income") {
      metadataBadges.push(formatTransactionMetaBadge(getTaxTreatmentLabel(txn.taxTreatment), txn.taxTreatment === "capital" ? "capital" : ""));
    }
    if (canUseEdgeCaseTools && txn.personalUsePct !== null && txn.personalUsePct !== undefined && txn.personalUsePct !== "") {
      metadataBadges.push(formatTransactionMetaBadge(`${Number(txn.personalUsePct).toFixed(1)}% personal use`, "split"));
    }
    if (canUseEdgeCaseTools && txn.indirectTaxAmount !== null && txn.indirectTaxAmount !== undefined && Number(txn.indirectTaxAmount) > 0) {
      metadataBadges.push(formatTransactionMetaBadge(`${getIndirectTaxLabel(rowRegion)} ${formatCurrency(Number(txn.indirectTaxAmount) || 0, rowRegion)}`, "tax"));
    }
    if (canUseEdgeCaseTools && txn.reviewStatus && txn.reviewStatus !== "ready") {
      metadataBadges.push(formatTransactionMetaBadge(getReviewStatusLabel(txn.reviewStatus), txn.reviewStatus));
    }
    if (txn.type === "income" && txn.payerName) {
      metadataBadges.push(formatTransactionMetaBadge(`Payer: ${txn.payerName}`, "income-payer"));
    }
    if (txn.type === "income" && txn.taxFormType) {
      metadataBadges.push(formatTransactionMetaBadge(txn.taxFormType, "income-tax-form"));
    }
    const descriptionSub = [businessBadge, descriptionTail, typeBadge, metadataBadges.join(" ")].filter(Boolean).join(" ");
    const amountClass = txn.type === "income" ? "amount-positive" : "amount-negative";
    const amountPrefix = txn.type === "income" ? "+" : "-";
    const clearedMarkup = txn.cleared
      ? `<span class="status-badge status-cleared">${txT("transactions_status_cleared", "Cleared")}</span>`
      : `<span class="status-badge status-pending">${txT("transactions_status_pending", "Pending")}</span>`;
    const receiptMarkup = txn.receiptId
      ? `<span class="receipt-status attached"><span class="receipt-dot"></span><span>${txT("transactions_receipt_attached_short", "Attached")}</span></span>`
      : `<button type="button" class="receipt-attach-hover" data-action="upload-receipt" data-id="${txn.id}" title="Attach a receipt">+ attach</button>`;

    row.innerHTML = `
      <td class="table-select-cell"><input type="checkbox" class="tx-row-select" data-id="${txn.id}" aria-label="Select transaction ${escapeHtml(txn.description || txn.id)}" ${selectedTransactionIds.has(txnId) ? "checked" : ""}></td>
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
    `;
    row.classList.toggle("is-selected", selectedTransactionIds.has(txnId));
    tbody.appendChild(row);

    row.querySelector('[data-action="upload-receipt"]')?.addEventListener("click", () => {
      triggerReceiptUpload(txn.id);
    });
    row.querySelector('[data-action="toggle-cleared"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await toggleTransactionCleared(txn.id, !txn.cleared);
    });
    row.querySelector(".tx-row-select")?.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    row.querySelector(".tx-row-select")?.addEventListener("change", (e) => {
      const checkbox = e.target;
      const isChecked = checkbox.checked;
      if (isChecked) {
        selectedTransactionIds.add(txnId);
        if (selectedTransactionIds.size === 1) {
          openRowActionPopup(txn.id, checkbox, isAllScope);
        } else {
          closeRowActionPopup();
        }
      } else {
        selectedTransactionIds.delete(txnId);
        if (selectedTransactionIds.size === 1) {
          const remainingId = [...selectedTransactionIds][0];
          const remainingCheckbox = tbody.querySelector(`.tx-row-select[data-id="${remainingId}"]`);
          if (remainingCheckbox) openRowActionPopup(remainingId, remainingCheckbox, isAllScope);
        } else if (selectedTransactionIds.size === 0) {
          closeRowActionPopup();
        }
      }
      row.classList.toggle("is-selected", isChecked);
      syncBulkBar();
      updateTransactionSelectionHeader(transactions);
    });
  });

  updateTransactionSelectionHeader(transactions);

  maybeScrollToHighlightedTransaction();
}

function maybeScrollToHighlightedTransaction() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("highlight");
  if (!id) return;

  const row = document.getElementById(`txn-${id}`);
  if (!row) return;

  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("tx-highlight");
  setTimeout(() => row.classList.remove("tx-highlight"), 2000);

  const clean = new URL(window.location.href);
  clean.searchParams.delete("highlight");
  window.history.replaceState({}, "", clean.toString());
}

function renderTotals(filteredTransactions = getFilteredTransactions()) {
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

  const totals = calculateTotals(filteredTransactions);
  const comparison = calculateYearComparisons(filteredTransactions);
  const transactionsCount = filteredTransactions.length;
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
    transactionCountDelta.textContent = `${countTransactionsThisMonth(filteredTransactions)} ${txT("transactions_this_month", "this month")}`;
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
  cockpit.hidden = tier === "free" || !hasTransactions || isAllScope;
  }
  
  if (upsell) {
    const upsellDismissed = isTransactionsUpsellDismissed();
    upsell.hidden = !(tier === "free" && hasTransactions && !upsellDismissed);
  }
  updateReceiptsDot();
  maybePlaySlotAnimation();
}

function calculateTotals(transactions = ledgerState.transactions || []) {
  let income = 0;
  let expenses = 0;

  transactions.forEach((txn) => {
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

function calculateYearComparisons(transactions = ledgerState.transactions || []) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  let currentIncome = 0;
  let previousIncome = 0;
  let currentExpenses = 0;
  let previousExpenses = 0;

  transactions.forEach((txn) => {
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

function countTransactionsThisMonth(transactions = ledgerState.transactions || []) {
  const now = new Date();
  return transactions.filter((txn) => {
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
  return Array.isArray(ledgerState.accounts) ? ledgerState.accounts : [];
}

function getCategories() {
  return Array.isArray(ledgerState.categories) ? ledgerState.categories : [];
}

function getTransactions() {
  return Array.isArray(ledgerState.transactions) ? ledgerState.transactions : [];
}

function markAccountAsUsed(accountId) {
  ledgerState.accounts = getAccounts().map((account) => {
    if (account.id === accountId) {
      return { ...account, used: true };
    }
    return account;
  });
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

function getSelectedCategoryLabel(select, inputId) {
  if (select?.value === CUSTOM_CATEGORY_OPTION_VALUE) {
    return String(document.getElementById(inputId)?.value || "").trim();
  }
  return getSelectedOptionLabel(select);
}

function resolveSelectedCategoryValue(selectId, inputId) {
  const select = document.getElementById(selectId);
  if (!select) {
    return "";
  }
  if (select.value === CUSTOM_CATEGORY_OPTION_VALUE) {
    return String(document.getElementById(inputId)?.value || "").trim();
  }
  return String(select.value || "").trim();
}

function hasOptionWithValue(select, value) {
  return !!Array.from(select?.options || []).find((option) => option.value === value);
}

function appendCustomCategoryOption(select, type) {
  const option = document.createElement("option");
  option.value = CUSTOM_CATEGORY_OPTION_VALUE;
  option.textContent = type === "income"
    ? txT("transactions_custom_income_category", "Custom income category...")
    : txT("transactions_custom_expense_category", "Custom expense category...");
  select.appendChild(option);
}

function syncCustomCategoryField(selectId, inputId) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);
  if (!select || !input) {
    return;
  }
  const isCustom = select.value === CUSTOM_CATEGORY_OPTION_VALUE;
  input.hidden = !isCustom;
  input.required = isCustom;
  if (!isCustom) {
    input.value = "";
  }
}

function clearCustomCategoryField(selectId, inputId) {
  const select = document.getElementById(selectId);
  if (select) {
    select.value = "";
  }
  syncCustomCategoryField(selectId, inputId);
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
    const categorySelect = document.getElementById("category");
    return {
      message: txT("transactions_validation_category", "Select a category."),
      fieldId: categorySelect?.value === CUSTOM_CATEGORY_OPTION_VALUE ? "customCategoryName" : "category"
    };
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
  const exchangeDateInput = document.getElementById("transactionExchangeDate");
  const transactionDateInput = document.getElementById("date");
  const currencySelect = document.getElementById("transactionCurrency");
  const taxTreatmentSelect = document.getElementById("transactionTaxTreatment");
  const personalUseInput = document.getElementById("transactionPersonalUsePct");
  const reviewStatusSelect = document.getElementById("transactionReviewStatus");
  const amountInput = document.getElementById("amount");
  const infoToggle = document.getElementById("transactionFxInfoToggle");
  const applyButton = document.getElementById("transactionFxApplyButton");

  if (sourceAmountInput && exchangeRateInput) {
    sourceAmountInput.addEventListener("input", () => {
      updateConvertedAmountPreview();
      syncTransactionFxReferenceSummary();
    });
    exchangeRateInput.addEventListener("input", updateConvertedAmountPreview);
  }

  if (exchangeDateInput) {
    exchangeDateInput.addEventListener("change", () => {
      transactionFxReferenceDismissed = false;
      void refreshTransactionFxReference();
    });
  }

  if (transactionDateInput) {
    transactionDateInput.addEventListener("change", () => {
      if (!String(exchangeDateInput?.value || "").trim()) {
        transactionFxReferenceDismissed = false;
        void refreshTransactionFxReference();
      }
    });
  }

  if (currencySelect) {
    currencySelect.addEventListener("change", () => {
      transactionFxReferenceDismissed = false;
      void refreshTransactionFxReference();
    });
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

  if (infoToggle) {
    infoToggle.addEventListener("click", () => {
      const box = document.getElementById("transactionFxReferenceBox");
      const shouldOpen = !!box?.hidden;
      transactionFxReferenceDismissed = !shouldOpen;
      if (shouldOpen) {
        void refreshTransactionFxReference({ forceOpen: true });
      } else {
        clearTransactionFxReferenceBox();
      }
    });
  }

  if (applyButton) {
    applyButton.addEventListener("click", applyTransactionFxReferenceRate);
  }

  syncEdgeCaseUi();
  void refreshTransactionFxReference();
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
  syncTransactionFxReferenceSummary();
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
  receiptInputElement.value = "";
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

/* =========================================================
   CSV Import
   ========================================================= */

function initCsvImport() {
  const importBtn = document.getElementById("importCsvBtn");
  const modal = document.getElementById("csvImportModal");
  const cancelBtn = document.getElementById("csvImportCancel");
  const startBtn = document.getElementById("csvImportStart");
  const doneBtn = document.getElementById("csvImportDone");
  const accountSelect = document.getElementById("csvImportAccount");

  if (!importBtn || !modal) return;

  // Populate account dropdown from already-loaded ledger state
  function populateCsvAccounts() {
    const accounts = ledgerState.accounts || [];
    accountSelect.innerHTML = '<option value="">Select account…</option>' +
      accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("");
  }

  function todayIsoDate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Make a date <input> entirely clickable: click anywhere in the field and
  // the native picker pops up (where supported). Falls back to focus()
  // for browsers without showPicker().
  function wireDateFieldClickable(input) {
    if (!input) return;
    input.addEventListener("mousedown", (event) => {
      // Don't double-trigger when the user clicks the native indicator itself.
      if (typeof input.showPicker !== "function") return;
      event.preventDefault();
      input.focus();
      try {
        input.showPicker();
      } catch (_) {
        // showPicker can throw if the input isn't focused yet; focus alone
        // is enough on Safari.
      }
    });
  }

  const startDateInput = document.getElementById("csvImportStartDate");
  const endDateInput = document.getElementById("csvImportEndDate");
  wireDateFieldClickable(startDateInput);
  wireDateFieldClickable(endDateInput);

  importBtn.addEventListener("click", async () => {
    const canImport = await switchToActiveScopeIfNeeded();
    if (!canImport) {
      return;
    }
    populateCsvAccounts();
    document.getElementById("csvImportStep1").hidden = false;
    document.getElementById("csvImportStep2").hidden = true;
    document.getElementById("csvImportError").hidden = true;
    document.getElementById("csvImportFile").value = "";
    if (startDateInput) startDateInput.value = todayIsoDate();
    if (endDateInput) endDateInput.value = "";
    modal.classList.remove("hidden");
    modal.focus();
  });

  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modal.classList.add("hidden");
  });

  doneBtn.addEventListener("click", async () => {
    modal.classList.add("hidden");
    await loadTransactions();
  });

  startBtn.addEventListener("click", async () => {
    const accountId = accountSelect.value;
    const fileInput = document.getElementById("csvImportFile");
    const errorEl = document.getElementById("csvImportError");

    errorEl.hidden = true;

    if (!accountId) {
      errorEl.textContent = "Please select a destination account.";
      errorEl.hidden = false;
      return;
    }

    if (!fileInput.files || !fileInput.files[0]) {
      errorEl.textContent = "Please select a CSV file.";
      errorEl.hidden = false;
      return;
    }

    const startDateValue = startDateInput ? startDateInput.value.trim() : "";
    const endDateValue = endDateInput ? endDateInput.value.trim() : "";
    if (startDateValue && endDateValue && startDateValue > endDateValue) {
      errorEl.textContent = "Start date must be on or before end date.";
      errorEl.hidden = false;
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("account_id", accountId);
    if (startDateValue) formData.append("start_date", startDateValue);
    if (endDateValue) formData.append("end_date", endDateValue);

    startBtn.disabled = true;
    startBtn.textContent = "Importing…";

    try {
      const res = await apiFetch("/api/transactions/import/csv", {
        method: "POST",
        body: formData
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorEl.textContent = data.error || "Import failed.";
        errorEl.hidden = false;
        return;
      }

      const resultEl = document.getElementById("csvImportResult");
      const errRows = (data.errors || []).slice(0, 10);
      const truncNote = data.truncated ? `<p class="csv-import-note">Only the first ${data.truncated_at} rows were processed.</p>` : "";
      const outOfRange = Number(data.out_of_range || 0);
      const outOfRangeStat = outOfRange > 0
        ? `<div class="csv-stat"><span class="csv-stat-num">${escapeHtml(String(outOfRange))}</span> outside date range</div>`
        : "";
      resultEl.innerHTML = `
        <div class="csv-import-success">
          <div class="csv-stat"><span class="csv-stat-num">${escapeHtml(String(data.imported))}</span> imported</div>
          <div class="csv-stat"><span class="csv-stat-num">${escapeHtml(String(data.skipped))}</span> skipped</div>
          ${outOfRangeStat}
        </div>
        ${truncNote}
        ${errRows.length ? `<ul class="csv-error-list">${errRows.map((e) => `<li>${escapeHtml(e.reason)}</li>`).join("")}</ul>` : ""}
        <p class="csv-import-note">Imported transactions are flagged <strong>Needs Review</strong> — check the category assignments before reporting.</p>
      `;
      document.getElementById("csvImportStep1").hidden = true;
      document.getElementById("csvImportStep2").hidden = false;
      setTransactionFormMessage(`CSV import complete. Imported ${data.imported || 0} and skipped ${data.skipped || 0}.`);
      await loadTransactions();
      renderTotals();
    } catch (err) {
      errorEl.textContent = "An unexpected error occurred. Please try again.";
      errorEl.hidden = false;
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = "Import";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initCsvImport();
  initOcrPrefill();
  initDrawerCloseBtn();
  initTaxBannerControls();
  initPeriodPicker();
  initTransactionUndoBar();
  initRowActionPopup();
  initRecurringRowActionPopup();
});

function initTransactionUndoBar() {
  const undoButton = document.getElementById("txUndoDeleteButton");
  undoButton?.addEventListener("click", async () => {
    undoButton.disabled = true;
    try {
      await handleUndoArchivedTransaction();
    } finally {
      syncTransactionUndoBar();
    }
  });
  syncTransactionUndoBar();
}

function initDrawerCloseBtn() {
  const closeBtn = document.getElementById("txDrawerClose");
  closeBtn?.addEventListener("click", () => closeTransactionDrawer());
}

function initTaxBannerControls() {
  const banner = document.getElementById("tax-cockpit");
  const collapseBtn = document.getElementById("taxBannerCollapseBtn");
  const infoBtn = document.getElementById("taxInfoBtn");
  const tooltip = document.getElementById("taxInfoTooltip");

  const COLLAPSE_KEY = "lb_tax_banner_collapsed";
  if (banner && localStorage.getItem(COLLAPSE_KEY) === "true") {
    banner.classList.add("is-collapsed");
    if (collapseBtn) collapseBtn.setAttribute("aria-label", "Expand tax estimate");
  }

  collapseBtn?.addEventListener("click", () => {
    const collapsed = banner?.classList.toggle("is-collapsed");
    try { localStorage.setItem(COLLAPSE_KEY, String(!!collapsed)); } catch (_) {}
    collapseBtn.setAttribute("aria-label", collapsed ? "Expand tax estimate" : "Collapse tax estimate");
  });

  infoBtn?.addEventListener("click", () => {
    if (tooltip) tooltip.hidden = !tooltip.hidden;
  });
}

function initPeriodPicker() {
  const chips = document.querySelectorAll(".tx-period-chip");
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.period === transactionFilters.period);
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      transactionFilters.period = chip.dataset.period || "this-month";
      localStorage.setItem("lb_tx_period", transactionFilters.period);
      applyFilters(true);
      window.dispatchEvent(new CustomEvent("txPeriodChanged", { detail: chip.dataset.period }));
    });
  });
}

let _popupTxnId = null;
let _popupAnchorElement = null;
let _popupRecurringTemplateId = null;
let _popupRecurringAnchorElement = null;

function initRowActionPopup() {
  const popup = document.getElementById("txRowPopup");
  if (!popup) return;

  document.getElementById("txPopupEdit")?.addEventListener("click", () => {
    if (_popupTxnId) handleEditEntry(_popupTxnId);
    closeRowActionPopup();
  });

  document.getElementById("txPopupReview")?.addEventListener("click", async () => {
    const id = _popupTxnId;
    closeRowActionPopup();
    if (!id) return;
    try {
      const res = await apiFetch(`/api/transactions/${id}/review-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: "needs_review" })
      });
      if (res && res.ok) await loadTransactions();
    } catch (err) {
      console.error("Mark for review failed", err);
    }
  });

  document.getElementById("txPopupDelete")?.addEventListener("click", () => {
    if (_popupTxnId) openTransactionModal(_popupTxnId);
    closeRowActionPopup();
  });

  document.getElementById("txBulkDeleteBtn")?.addEventListener("click", async () => {
    const ids = [...selectedTransactionIds];
    if (!ids.length) return;
    const bar = document.getElementById("txBulkBar");
    const btn = document.getElementById("txBulkDeleteBtn");
    if (btn) btn.disabled = true;
    try {
      await Promise.all(ids.map(id =>
        apiFetch(`/api/transactions/${id}`, { method: "DELETE" })
      ));
      selectedTransactionIds.clear();
      if (bar) bar.hidden = true;
      await loadTransactions();
    } catch (err) {
      console.error("Bulk delete failed", err);
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("txBulkCancelBtn")?.addEventListener("click", () => {
    selectedTransactionIds.clear();
    document.querySelectorAll(".tx-row-select").forEach(cb => {
      cb.checked = false;
      cb.closest("tr")?.classList.remove("is-selected");
    });
    const bar = document.getElementById("txBulkBar");
    if (bar) bar.hidden = true;
    closeRowActionPopup();
  });

  document.addEventListener("click", (e) => {
    if (!popup.hidden && !popup.contains(e.target) && !e.target.closest(".tx-row-select")) closeRowActionPopup();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRowActionPopup();
  });

  window.addEventListener("resize", () => {
    if (_popupTxnId && _popupAnchorElement) {
      positionRowActionPopup(_popupAnchorElement);
    }
  });

  window.addEventListener("scroll", () => {
    if (_popupTxnId && _popupAnchorElement) {
      positionRowActionPopup(_popupAnchorElement);
    }
  }, true);
}

function openRowActionPopup(txnId, anchorEl, isAllScope) {
  const popup = document.getElementById("txRowPopup");
  if (!popup) return;

  closeRecurringRowActionPopup();
  _popupTxnId = txnId;
  _popupAnchorElement = anchorEl;

  const editBtn = document.getElementById("txPopupEdit");
  const deleteBtn = document.getElementById("txPopupDelete");
  if (editBtn) editBtn.disabled = !!isAllScope;
  if (deleteBtn) deleteBtn.disabled = !!isAllScope;

  popup.removeAttribute("hidden");
  positionRowActionPopup(anchorEl);
}

function positionRowActionPopup(anchorEl) {
  const popup = document.getElementById("txRowPopup");
  if (!popup || !anchorEl) return;

  positionActionPopup(popup, anchorEl);
}

function positionActionPopup(popup, anchorEl) {
  if (!popup || !anchorEl) return;

  const anchorCell = anchorEl.closest(".table-select-cell") || anchorEl;
  const rect = anchorCell.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const gap = 10;
  const viewportPadding = 8;

  let left = rect.right + gap;
  if (left + popupRect.width > window.innerWidth - viewportPadding) {
    left = rect.left - popupRect.width - gap;
  }
  left = Math.max(viewportPadding, left);

  let top = rect.top + Math.max(0, (rect.height - popupRect.height) / 2);
  if (top + popupRect.height > window.innerHeight - viewportPadding) {
    top = window.innerHeight - popupRect.height - viewportPadding;
  }
  top = Math.max(viewportPadding, top);

  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
}

function closeRowActionPopup() {
  const popup = document.getElementById("txRowPopup");
  if (popup) popup.setAttribute("hidden", "");
  _popupTxnId = null;
  _popupAnchorElement = null;
}

function initRecurringRowActionPopup() {
  const popup = document.getElementById("recurringRowPopup");
  if (!popup) return;

  document.getElementById("recurringPopupRun")?.addEventListener("click", async () => {
    const templateId = _popupRecurringTemplateId;
    closeRecurringRowActionPopup();
    if (templateId) {
      await runRecurringTemplate(templateId);
    }
  });

  document.getElementById("recurringPopupStatus")?.addEventListener("click", async () => {
    const template = (recurringState.templates || []).find((item) => String(item.id) === String(_popupRecurringTemplateId));
    const templateId = template?.id;
    closeRecurringRowActionPopup();
    if (templateId) {
      await toggleRecurringTemplateStatus(templateId, !template.active);
    }
  });

  document.addEventListener("click", (event) => {
    if (!popup.hidden && !popup.contains(event.target) && !event.target.closest(".recurring-row-select")) {
      closeRecurringRowActionPopup();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRecurringRowActionPopup();
    }
  });

  window.addEventListener("resize", () => {
    if (_popupRecurringTemplateId && _popupRecurringAnchorElement) {
      positionRecurringRowActionPopup(_popupRecurringAnchorElement);
    }
  });

  window.addEventListener("scroll", () => {
    if (_popupRecurringTemplateId && _popupRecurringAnchorElement) {
      positionRecurringRowActionPopup(_popupRecurringAnchorElement);
    }
  }, true);
}

function openRecurringRowActionPopup(templateId, anchorEl) {
  const popup = document.getElementById("recurringRowPopup");
  if (!popup) return;

  const template = (recurringState.templates || []).find((item) => String(item.id) === String(templateId));
  if (!template) return;

  closeRowActionPopup();
  _popupRecurringTemplateId = template.id;
  _popupRecurringAnchorElement = anchorEl;

  const runButton = document.getElementById("recurringPopupRun");
  const statusButton = document.getElementById("recurringPopupStatus");
  if (runButton) {
    runButton.textContent = txT("transactions_recurring_post_next", "Post next");
  }
  if (statusButton) {
    statusButton.textContent = template.active
      ? txT("transactions_recurring_pause", "Pause")
      : txT("transactions_recurring_resume", "Resume");
  }

  popup.removeAttribute("hidden");
  positionRecurringRowActionPopup(anchorEl);
}

function positionRecurringRowActionPopup(anchorEl) {
  const popup = document.getElementById("recurringRowPopup");
  if (!popup || !anchorEl) return;

  positionActionPopup(popup, anchorEl);
}

function closeRecurringRowActionPopup() {
  const popup = document.getElementById("recurringRowPopup");
  if (popup) popup.setAttribute("hidden", "");
  _popupRecurringTemplateId = null;
  _popupRecurringAnchorElement = null;
}

function initOcrPrefill() {
  const params = new URLSearchParams(window.location.search);
  const ocrAmount = params.get("ocr_amount");
  const ocrDate = params.get("ocr_date");
  const ocrDesc = params.get("ocr_desc");
  const ocrMerchant = params.get("ocr_merchant");
  const ocrCurrency = params.get("ocr_currency");

  if (!ocrAmount && !ocrDate && !ocrDesc && !ocrMerchant) return;

  // Wait for the drawer to initialise then pre-fill and open it
  const tryPrefill = () => {
    const toggle = document.getElementById("addTxTogglePage");
    const amountEl = document.getElementById("amount");
    const dateEl = document.getElementById("date");
    const descEl = document.getElementById("description");
    if (!amountEl) return false;

    // Set expense intent
    const expenseBtn = document.querySelector('[data-intent="expense"]');
    expenseBtn?.click();

    if (ocrAmount) amountEl.value = ocrAmount;
    if (ocrDate) dateEl.value = ocrDate;
    if (ocrDesc) descEl.value = ocrDesc;
    else if (ocrMerchant) descEl.value = ocrMerchant;

    // Open drawer
    if (transactionDrawerElement && transactionDrawerElement.hidden) {
      toggle?.click();
    }

    // Clean URL
    const clean = new URL(window.location.href);
    ["ocr_amount", "ocr_date", "ocr_desc", "ocr_merchant", "ocr_currency"].forEach((k) => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.toString());
    return true;
  };

  // Retry up to 20 times (50ms each = 1s) waiting for form elements to mount
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (tryPrefill() || attempts >= 20) clearInterval(interval);
  }, 50);
}
