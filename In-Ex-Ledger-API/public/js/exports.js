const EXPORT_HISTORY_KEY = "ledger_export_history";
const TRANSACTIONS_KEY = "ledger_transactions";
const ACCOUNTS_KEY = "ledger_accounts";
const CATEGORIES_KEY = "ledger_categories";
const RECEIPTS_KEY = "ledger_receipts";
const MILEAGE_KEY = "ledger_mileage";
const BUSINESSES_KEY = "ledger_businesses";
const EXPORT_LANG_KEY = "ledger_export_language";
const EXPORT_SCOPE_KEY = "ledger_export_scope";
const BUSINESS_PROFILE_KEY = "ledger_business_profile";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";
const EXPORT_TOAST_MS = 3000;

let exportToastTimer = null;
let resetInlineTaxIdState = () => {};
let unattachedReceiptsCount = 0;
let transactionsCacheFresh = false;
let exportContext = {
  activeBusinessId: "",
  businesses: []
};
let exportState = {
  transactions: [],
  accounts: [],
  categories: [],
  receipts: [],
  mileage: [],
  businessProfile: {}
};

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function resolveExportBusinessId() {
  return exportContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "";
}

function resolveExportBusinessIdForScope(scope) {
  return scope === "all" ? "all" : resolveExportBusinessId();
}

function getExportPreferenceKey(key) {
  const businessId = resolveExportBusinessId();
  if (window.lunaStorage?.getKey) {
    return window.lunaStorage.getKey(key, { businessId });
  }
  const userId = window.__LUNA_ME__?.id || window.__LUNA_ME__?.user_id || window.__LUNA_ME__?.userId || "";
  if (!userId || !businessId || !key) {
    return null;
  }
  return `lb:${userId}:${businessId}:${key}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  await hydrateBusinessList();
  initExportScopeSelect();
  await hydrateExportData();
  populateExportFilters();
  initExportLanguageSelect();
  initPresetChips();
  setupExportForm();
  setupPdfButton();
  wireInlineTaxId();
  await refreshReceiptsDot();
  updateExportSummary();
  renderExportHistory();
});

async function hydrateExportData() {
  await Promise.all([
    hydrateTransactionsCache(),
    hydrateAccountsCache(),
    hydrateCategoriesCache(),
    hydrateReceiptsCache(),
    hydrateBusinessProfileCache(),
    hydrateMileageCache()
  ]);
}

async function hydrateMileageCache() {
  try {
    const response = await apiFetch("/api/mileage?limit=500");
    if (!response || !response.ok) {
      exportState.mileage = [];
      return;
    }
    const payload = await response.json().catch(() => null);
    const records = Array.isArray(payload?.data) ? payload.data : [];
    exportState.mileage = records.map((item) => ({
      id: item.id,
      businessId: item.business_id || "",
      date: item.trip_date || "",
      purpose: item.purpose || "",
      destination: item.destination || "",
      miles: item.miles != null ? Number(item.miles) : null,
      km: item.km != null ? Number(item.km) : null
    }));
  } catch (error) {
    console.warn("[Exports] Unable to hydrate mileage", error);
    exportState.mileage = [];
  }
}

async function hydrateBusinessList() {
  try {
    const response = await apiFetch("/api/businesses");
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    exportContext = {
      activeBusinessId: payload?.active_business_id || "",
      businesses: Array.isArray(payload?.businesses) ? payload.businesses : []
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate businesses", error);
  }
}

function initExportScopeSelect() {
  const select = document.getElementById("exportScope");
  if (!select) {
    return;
  }

  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  setExportScope(select, scopeKey ? localStorage.getItem(scopeKey) : null);
  syncExportScopeUi();
  select.addEventListener("change", async () => {
    setExportScope(select, select.value);
    await hydrateExportData();
    populateExportFilters();
    await refreshReceiptsDot();
    syncExportScopeUi();
    updateExportSummary();
    renderExportHistory();
  });
}

function getExportScope() {
  const select = document.getElementById("exportScope");
  if (select?.value === "all") {
    return "all";
  }
  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  return scopeKey && localStorage.getItem(scopeKey) === "all" ? "all" : "active";
}

function setExportScope(select, value) {
  const normalized = value === "all" ? "all" : "active";
  if (select) {
    select.value = normalized;
  }
  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  if (scopeKey) {
    localStorage.setItem(scopeKey, normalized);
  }
}

function buildScopeQuery() {
  return getExportScope() === "all" ? "?scope=all" : "";
}

function getStoredBusinesses() {
  return Array.isArray(exportContext.businesses) ? exportContext.businesses : [];
}

function getActiveBusinessId() {
  return exportContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "";
}

function getBusinessById(businessId) {
  return getStoredBusinesses().find((business) => business.id === businessId) || null;
}

function getBusinessesInScope() {
  const businesses = getStoredBusinesses();
  if (getExportScope() === "all") {
    return businesses;
  }
  const active = businesses.find((business) => business.id === getActiveBusinessId());
  return active ? [active] : businesses.slice(0, 1);
}

function syncExportScopeOptionLabel() {
  const select = document.getElementById("exportScope");
  const activeOption = select?.querySelector('option[value="active"]');
  if (!activeOption) {
    return;
  }

  const activeBusiness = getBusinessById(getActiveBusinessId()) || getStoredBusinesses()[0] || null;
  activeOption.textContent = activeBusiness?.name || tx("exports_scope_active_short");
}

function getBusinessCurrency(businessId) {
  const region = String(getBusinessById(businessId)?.region || "").toLowerCase() === "ca" ? "ca" : "us";
  return getCurrencyForRegion(region);
}

function hasMixedCurrenciesInScope() {
  const currencies = new Set(
    getBusinessesInScope().map((business) => getBusinessCurrency(business.id))
  );
  return currencies.size > 1;
}

function syncExportScopeUi() {
  const scopeHelp = document.getElementById("exportScopeHelp");
  const taxIdCheckbox = document.getElementById("exportIncludeTaxId");
  const inlineTaxId = document.getElementById("exportInlineTaxId");
  const pdfNote = document.getElementById("exportPdfNote");
  const scope = getExportScope();
  const mixedCurrencies = hasMixedCurrenciesInScope();

  syncExportScopeOptionLabel();

  if (scopeHelp) {
    scopeHelp.textContent =
      scope === "all"
        ? tx("exports_scope_help_all")
        : tx("exports_scope_help_active");
  }

  if (taxIdCheckbox) {
    taxIdCheckbox.disabled = scope === "all";
    if (scope === "all") {
      taxIdCheckbox.checked = false;
      if (inlineTaxId) {
        inlineTaxId.hidden = true;
        const inp = document.getElementById("exportInlineTaxIdInput");
        if (inp) inp.value = "";
        const cb = document.getElementById("exportInlineTaxIdCheckbox");
        if (cb) cb.checked = false;
      }
    }
  }

  if (pdfNote) {
    pdfNote.textContent =
      scope === "all"
        ? tx("exports_pdf_note_bulk")
        : tx("exports_pdf_note_single");
  }

  const summaryNet = document.getElementById("exportSummaryNet");
  if (scope === "all" && mixedCurrencies && summaryNet) {
    summaryNet.textContent = tx("exports_per_business");
  }
}

async function hydrateTransactionsCache() {
  try {
    const response = await apiFetch(`/api/transactions${buildScopeQuery()}`);
    if (!response || !response.ok) {
      transactionsCacheFresh = false;
      exportState.transactions = [];
      return;
    }
    const payload = await response.json().catch(() => null);
    const transactions = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transactions)
      ? payload.transactions
      : Array.isArray(payload?.data)
      ? payload.data
      : [];
    exportState.transactions = transactions.map((transaction) => ({
      id: transaction.id,
      businessId: transaction.businessId || transaction.business_id || "",
      businessName: transaction.businessName || transaction.business_name || "",
      date: String(transaction.date || "").slice(0, 10),
      description: transaction.description || "",
      amount: Number(transaction.amount) || 0,
      accountId: transaction.accountId || transaction.account_id || "",
      categoryId: transaction.categoryId || transaction.category_id || "",
      type: transaction.type === "income" ? "income" : "expense",
      note: transaction.note || "",
      receiptId: transaction.receiptId || transaction.receipt_id || "",
      cleared: transaction.cleared === true,
      currency: String(transaction.currency || "").toUpperCase(),
      sourceAmount: transaction.sourceAmount ?? transaction.source_amount ?? null,
      exchangeRate: transaction.exchangeRate ?? transaction.exchange_rate ?? null,
      exchangeDate: String(transaction.exchangeDate || transaction.exchange_date || "").slice(0, 10),
      convertedAmount: transaction.convertedAmount ?? transaction.converted_amount ?? null,
      taxTreatment: transaction.taxTreatment || transaction.tax_treatment || "",
      indirectTaxAmount: transaction.indirectTaxAmount ?? transaction.indirect_tax_amount ?? null,
      indirectTaxRecoverable:
        transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true,
      personalUsePct: transaction.personalUsePct ?? transaction.personal_use_pct ?? null,
      reviewStatus: transaction.reviewStatus || transaction.review_status || "",
      reviewNotes: transaction.reviewNotes || transaction.review_notes || ""
    }));
    transactionsCacheFresh = true;
  } catch (error) {
    transactionsCacheFresh = false;
    console.warn("[Exports] Unable to hydrate transactions", error);
    exportState.transactions = [];
  }
}

async function hydrateAccountsCache() {
  try {
    const response = await apiFetch(`/api/accounts${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const accounts = await response.json().catch(() => []);
    if (Array.isArray(accounts)) {
      exportState.accounts = accounts.map((account) => ({
        ...account,
        businessId: account.businessId || account.business_id || "",
        businessName: account.businessName || account.business_name || ""
      }));
      return;
    }
    exportState.accounts = [];
  } catch (error) {
    console.warn("[Exports] Unable to hydrate accounts", error);
    exportState.accounts = [];
  }
}

async function hydrateCategoriesCache() {
  try {
    const response = await apiFetch(`/api/categories${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const categories = await response.json().catch(() => []);
    if (Array.isArray(categories)) {
      exportState.categories = categories.map((category) => ({
        id: category.id,
        businessId: category.businessId || category.business_id || "",
        businessName: category.businessName || category.business_name || "",
        name: category.name,
        type: category.kind || category.type || "",
        taxLabel: category.tax_map_us || category.tax_map_ca || ""
      }));
      return;
    }
    exportState.categories = [];
  } catch (error) {
    console.warn("[Exports] Unable to hydrate categories", error);
    exportState.categories = [];
  }
}

async function hydrateReceiptsCache() {
  try {
    const response = await apiFetch(`/api/receipts${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const receipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];
    exportState.receipts = receipts.map((receipt) => ({
      id: receipt.id,
      businessId: receipt.businessId || receipt.business_id || "",
      businessName: receipt.businessName || receipt.business_name || "",
      filename: receipt.filename || "",
      uploadedAt: receipt.created_at || "",
      transactionId: receipt.transaction_id || "",
      mimeType: receipt.mime_type || ""
    }));
    unattachedReceiptsCount = exportState.receipts.filter((receipt) => !receipt.transactionId).length;
  } catch (error) {
    console.warn("[Exports] Unable to hydrate receipts", error);
    exportState.receipts = [];
    unattachedReceiptsCount = 0;
  }
}

async function hydrateBusinessProfileCache() {
  if (getExportScope() === "all") {
    exportState.businessProfile = {
      name: tx("exports_scope_all"),
      type: "",
      ein: "",
      taxId: "",
      fiscalYearStart: "",
      address: ""
    };
    return;
  }

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      exportState.businessProfile = {};
      return;
    }
    const business = await response.json().catch(() => null);
    if (!business) {
      exportState.businessProfile = {};
      return;
    }
    exportState.businessProfile = {
      name: business.name || "",
      type: business.business_type || "",
      ein: business.tax_id || "",
      taxId: business.tax_id || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || ""
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate business profile", error);
    exportState.businessProfile = {};
  }
}

function setupExportForm() {
  const form = document.getElementById("exportForm");
  const historyRows = document.getElementById("exportHistoryRows");
  const ytdYear = new Date().getUTCFullYear();
  const defaultPreset = `${ytdYear}-ytd`;

  applyDatePreset(defaultPreset);
  updatePresetChipState(defaultPreset);

  ["period-start", "period-end", "exportAccountFilter", "exportCategoryFilter", "exportLanguage", "exportIncludeTaxId", "exportScope"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      if (id === "period-start" || id === "period-end") {
        clearCustomPresetState();
      }
      updateExportSummary();
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    await exportCsv(range.startDate, range.endDate);
  });

  historyRows?.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLElement)) return;

    const deleteBtn = event.target.closest(".history-delete");
    if (deleteBtn) {
      const backendId = deleteBtn.dataset.deleteBackendId;
      if (backendId) {
        deleteBackendExport(backendId, deleteBtn.closest(".history-item"));
      }
      return;
    }

    const downloadBtn = event.target.closest(".history-download");
    if (!downloadBtn) return;
    if (downloadBtn.dataset.historyId) {
      if ((downloadBtn.dataset.historyFormat || PDF_FORMAT) === PDF_FORMAT) {
        downloadBackendExport(downloadBtn.dataset.historyId);
      } else {
        replayHistoryEntry(downloadBtn.dataset.historyId);
      }
    }
  });
}

function setupPdfButton() {
  const button = document.getElementById("exportPdfBtn");
  const note = document.getElementById("exportPdfNote");
  if (!button) {
    return;
  }

  const syncPdfState = () => {
    const isV1 = (typeof effectiveTier === "function" ? effectiveTier() : "free") === "v1";
    button.disabled = !isV1;
    if (note) {
      note.hidden = isV1;
    }
    return isV1;
  };

  syncPdfState();

  button.addEventListener("click", async () => {
    if (!syncPdfState()) {
      return;
    }
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    const scope = getExportScope();
    const includeTaxId = scope !== "all" && !!document.getElementById("exportIncludeTaxId")?.checked;
    if (includeTaxId) {
      const taxIdInput = document.getElementById("exportInlineTaxIdInput");
      const agreementCheckbox = document.getElementById("exportInlineTaxIdCheckbox");
      const errorEl = document.getElementById("exportInlineTaxIdError");
      const setError = (msg) => {
        if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove("hidden"); }
      };
      const clearError = () => {
        if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }
      };
      clearError();
      const taxId = taxIdInput?.value?.trim() || "";
      if (!taxId) {
        setError(tx("secure_export_modal_error_taxid"));
        taxIdInput?.focus();
        return;
      }
      if (!isValidTaxId(taxId)) {
        setError(tx("secure_export_modal_error_taxid_format"));
        taxIdInput?.focus();
        return;
      }
      if (!agreementCheckbox?.checked) {
        setError(tx("secure_export_modal_error_checkbox"));
        return;
      }
      button.disabled = true;
      try {
        await submitSecureExport(taxId, range.startDate, range.endDate);
        if (typeof resetInlineTaxIdState === "function") {
          resetInlineTaxIdState({ hideSection: true });
        } else if (taxIdInput) {
          taxIdInput.value = "";
        }
      } catch (err) {
        if (taxIdInput) taxIdInput.value = "";
        setError(err?.message || tx("secure_export_modal_error_generic"));
      } finally {
        syncPdfState();
      }
    } else {
      await exportPdf(range.startDate, range.endDate);
    }
  });
}

function initPresetChips() {
  document.querySelectorAll("[data-range-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.rangePreset || "custom";
      applyDatePreset(preset);
      updatePresetChipState(preset);
      updateExportSummary();
    });
  });
}

function applyDatePreset(preset) {
  const startInput = document.getElementById("period-start");
  const endInput = document.getElementById("period-end");
  if (!startInput || !endInput) {
    return;
  }

  const today = new Date();
  const ytdYear = today.getUTCFullYear();
  const ytdMonth = String(today.getUTCMonth() + 1).padStart(2, "0");
  const ytdDay = String(today.getUTCDate()).padStart(2, "0");
  const ytdToday = `${ytdYear}-${ytdMonth}-${ytdDay}`;
  const prevYear = ytdYear - 1;

  const ranges = {
    [`${prevYear}-tax-year`]: [`${prevYear}-01-01`, `${prevYear}-12-31`],
    "2025-tax-year": ["2025-01-01", "2025-12-31"],
    [`${ytdYear}-ytd`]: [`${ytdYear}-01-01`, ytdToday],
    "2026-ytd": [`${ytdYear}-01-01`, ytdToday],
    [`q1-${ytdYear}`]: [`${ytdYear}-01-01`, `${ytdYear}-03-31`],
    "q1-2026": ["2026-01-01", "2026-03-31"],
    [`q4-${prevYear}`]: [`${prevYear}-10-01`, `${prevYear}-12-31`],
    "q4-2025": ["2025-10-01", "2025-12-31"]
  };

  if (preset === "custom") {
    return;
  }

  const [startDate, endDate] = ranges[preset] || ranges[`${ytdYear}-ytd`] || [ranges["2026-ytd"][0], ytdToday];
  startInput.value = startDate;
  endInput.value = endDate;
}

function updatePresetChipState(activePreset) {
  document.querySelectorAll("[data-range-preset]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rangePreset === activePreset);
  });
}

function clearCustomPresetState() {
  const activeButton = document.querySelector(".preset-chip.is-active");
  const customButton = document.querySelector('[data-range-preset="custom"]');
  if (activeButton && activeButton !== customButton) {
    activeButton.classList.remove("is-active");
  }
  customButton?.classList.add("is-active");
}

function initExportLanguageSelect() {
  const select = document.getElementById("exportLanguage");
  if (!select) {
    return;
  }

  const appLang = localStorage.getItem("lb_language") || DEFAULT_EXPORT_LANG;
  const langKey = getExportPreferenceKey(EXPORT_LANG_KEY);
  const saved = clampExportLang((langKey ? localStorage.getItem(langKey) : null) || appLang);
  select.value = saved;
  select.addEventListener("change", () => {
    const next = clampExportLang(select.value);
    select.value = next;
    if (langKey) {
      localStorage.setItem(langKey, next);
    }
  });
}

function wireInlineTaxId() {
  const checkbox = document.getElementById("exportIncludeTaxId");
  const section = document.getElementById("exportInlineTaxId");
  const input = document.getElementById("exportInlineTaxIdInput");
  const toggle = document.getElementById("exportInlineTaxIdToggle");

  if (!checkbox || !section) {
    return;
  }

  resetInlineTaxIdState = ({ hideSection = false } = {}) => {
    if (input) {
      input.value = "";
      input.type = "password";
    }
    if (toggle) toggle.textContent = tx("secure_export_modal_show");
    const cb = document.getElementById("exportInlineTaxIdCheckbox");
    if (cb) cb.checked = false;
    const errorEl = document.getElementById("exportInlineTaxIdError");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }
    if (hideSection) {
      section.hidden = true;
      checkbox.checked = false;
    }
  };

  checkbox.addEventListener("change", () => {
    const show = checkbox.checked;
    section.hidden = !show;
    if (!show) {
      resetInlineTaxIdState();
    }
    if (show) {
      resetInlineTaxIdState();
      const canadaText = document.getElementById("exportInlineTaxIdCanadaText");
      if (canadaText) {
        canadaText.classList.toggle("hidden", getRegion() !== "ca");
      }
      input?.focus();
    }
  });

  toggle?.addEventListener("click", () => {
    if (!input) return;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    if (toggle) toggle.textContent = isPassword ? tx("secure_export_modal_hide") : tx("secure_export_modal_show");
  });
}

function getValidatedExportRange() {
  const messageNode = document.getElementById("exportFormMessage");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";

  if (!startDate || !endDate) {
    if (messageNode) {
      messageNode.textContent = tx("exports_error_dates_required");
    }
    return null;
  }

  if (startDate > endDate) {
    if (messageNode) {
      messageNode.textContent = tx("exports_error_dates_order");
    }
    return null;
  }

  if (messageNode) {
    messageNode.textContent = "";
  }

  return { startDate, endDate };
}

function updateExportSummary() {
  const summaryScope = document.getElementById("exportSummaryScope");
  const summaryTaxForm = document.getElementById("exportSummaryTaxForm");
  const taxContextNote = document.getElementById("exportTaxContext");
  const summaryPeriod = document.getElementById("exportSummaryPeriod");
  const summaryIncome = document.getElementById("exportSummaryIncome");
  const summaryExpenses = document.getElementById("exportSummaryExpenses");
  const summaryNet = document.getElementById("exportSummaryNet");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";
  const scope = getExportScope();
  const mixedCurrencies = hasMixedCurrenciesInScope();

  if (!summaryPeriod || !summaryIncome || !summaryExpenses || !summaryNet) {
    return;
  }

  const taxContext = getTaxFormContextForScope();
  if (summaryScope) {
    summaryScope.textContent =
      scope === "all" ? tx("exports_scope_all") : getBusinessById(getActiveBusinessId())?.name || tx("exports_scope_active_short");
  }
  if (summaryTaxForm) {
    summaryTaxForm.textContent = taxContext.label;
  }
  if (taxContextNote) {
    const textNode = document.getElementById("exportTaxContextText");
    const label = `${tx("exports_tax_context_prefix")}: ${taxContext.exportLabel}`;
    if (textNode) textNode.textContent = label;
    taxContextNote.hidden = !taxContext.exportLabel;
  }

  if (!startDate || !endDate || startDate > endDate) {
    summaryPeriod.textContent = "-";
    summaryIncome.textContent = formatMoney(0);
    summaryExpenses.textContent = formatMoney(0);
    summaryNet.textContent = formatMoney(0);
    return;
  }

  const transactions = filterTransactions(startDate, endDate);
  const income = transactions
    .filter((transaction) => resolveTransactionType(transaction) === "income")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const expenses = transactions
    .filter((transaction) => resolveTransactionType(transaction) !== "income")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const net = income - expenses;

  summaryPeriod.textContent = `${startDate} to ${endDate}`;
  if (scope === "all" && mixedCurrencies) {
    summaryIncome.textContent = tx("exports_per_business");
    summaryExpenses.textContent = tx("exports_per_business");
    summaryNet.textContent = tx("exports_per_business");
    return;
  }

  const currencyRegion = scope === "all"
    ? String(getBusinessesInScope()[0]?.region || "").toLowerCase()
    : getRegion();
  summaryIncome.textContent = formatMoney(income, currencyRegion);
  summaryExpenses.textContent = formatMoney(expenses, currencyRegion);
  summaryNet.textContent = formatMoney(net, currencyRegion);
}

async function exportCsv(startDate, endDate, recordHistory = true, explicitFilename, tierOverride, exportLangOverride) {
  if (!transactionsCacheFresh) {
    showExportToast(tx("exports_error_stale_data"));
    return;
  }
  const tier = tierOverride || (typeof effectiveTier === "function" ? effectiveTier() : "free");
  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const scope = getExportScope();
  const transactions = filterTransactions(startDate, endDate);
  const isFull = tier === "v1";
  const format = isFull ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT;
  const batches = buildExportBatches(transactions, scope);
  const historyEntries = [];

  if (!batches.length) {
    showExportToast(tx("exports_no_data"));
    return;
  }

  batches.forEach((batch, index) => {
    const currency = batch.region ? getCurrencyForRegion(batch.region) : getCurrencyForRegion(getRegion());
    const filename = explicitFilename && batches.length === 1
      ? explicitFilename
      : isFull
      ? makeExportFilename(startDate, endDate, batch)
      : makeBasicFilename(startDate, endDate, batch);
    const csvContent = isFull
      ? buildFullCsv(batch.transactions, currency, scope === "all")
      : buildBasicCsv(batch.transactions, scope === "all");

    window.setTimeout(() => {
      downloadFile(csvContent, filename, "text/csv");
    }, index * 120);

    historyEntries.push({
      id: `exp_${Date.now()}_${index}`,
      startDate,
      endDate,
      exportedAt: new Date().toISOString(),
      filename,
      tier,
      format,
      exportLang,
      scope,
      businessId: batch.businessId || "",
      batchMode: batches.length > 1
    });
  });

  showExportToast(batches.length > 1 ? `${tx("exports_exported_prefix")} ${batches.length} CSV ${tx("exports_exported_suffix")}` : tx("exports_generated_csv"));

  if (recordHistory) {
    await Promise.all(historyEntries.map((entry) => recordExportHistory(entry)));
    await renderExportHistory();
  }
}

async function exportPdf(startDate, endDate, recordHistory = true, explicitFilename, exportLangOverride) {
  if (typeof buildPdfExport !== "function") {
    console.warn("PDF export helper is not available.");
    showExportToast(tx("exports_error_generic") || "PDF export is unavailable. Please refresh and try again.");
    return;
  }

  if (!transactionsCacheFresh) {
    showExportToast(tx("exports_error_stale_data"));
    return;
  }

  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const scope = getExportScope();
  const includeTaxId = scope !== "all" && !!document.getElementById("exportIncludeTaxId")?.checked;
  const transactions = filterTransactions(startDate, endDate);
  const batches = await buildExportPdfBatches(transactions, scope);
  const historyEntries = [];

  if (!batches.length) {
    showExportToast(tx("exports_no_data"));
    return;
  }

  batches.forEach((batch, index) => {
    const businessProfile = batch.businessProfile || readBusinessProfile();
    const region = String(batch.region || getRegion()).toLowerCase();
    const batchProvince = batch.province || (region === "ca" ? getProvince() : "");
    const province = String(batchProvince).toUpperCase();
    const generatedAt = new Date().toISOString();
    const reportId = `EXP-${generatedAt.slice(0, 10).replace(/-/g, "")}-${Math.random().toString(16).slice(2, 6).toUpperCase().padStart(4, "0")}`;
    const taxId = includeTaxId
      ? businessProfile.ein || businessProfile.taxId || ""
      : "";
    let pdfBytes;
    try {
      pdfBytes = buildPdfExport({
      transactions: batch.transactions,
      accounts: getAccounts().filter((account) => !batch.businessId || account.businessId === batch.businessId),
      categories: getCategories().filter((category) => !batch.businessId || category.businessId === batch.businessId),
      receipts: getReceipts().filter((receipt) => !batch.businessId || receipt.businessId === batch.businessId),
      mileage: getMileage().filter((item) => !batch.businessId || item.businessId === batch.businessId),
      startDate,
      endDate,
      exportLang,
      currency: getCurrencyForRegion(region),
      legalName: businessProfile.name || "",
      businessName: businessProfile.name || batch.businessName || "",
      operatingName: "",
      taxId,
      naics: "",
      generatedAt,
      reportId,
      region,
      province
    });
    } catch (pdfErr) {
      console.error("[Exports] PDF generation failed:", pdfErr);
      showExportToast(tx("exports_error_generic") || "PDF export failed. Please try again.");
      return;
    }
    const filename = explicitFilename && batches.length === 1
      ? explicitFilename
      : makePdfFilename(startDate, endDate, batch);

    window.setTimeout(() => {
      downloadFile(pdfBytes, filename, "application/pdf");
    }, index * 120);

    historyEntries.push({
      id: `exp_${Date.now()}_${index}`,
      startDate,
      endDate,
      exportedAt: new Date().toISOString(),
      filename,
      tier: "v1",
      format: PDF_FORMAT,
      exportLang,
      scope,
      businessId: batch.businessId || "",
      batchMode: batches.length > 1
    });
  });

  showExportToast(batches.length > 1 ? `${tx("exports_exported_prefix")} ${batches.length} PDF ${tx("exports_exported_suffix")}` : tx("exports_generated_pdf"));

  if (recordHistory) {
    await Promise.all(historyEntries.map((entry) => recordExportHistory(entry)));
    await renderExportHistory();
  }
}

function buildBasicCsv(transactions, includeBusiness = false) {
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Type",
    "Status",
    "Amount"
  ]];

  transactions
    .slice()
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""))
    .forEach((transaction) => {
      rows.push([
        ...(includeBusiness ? [transaction.businessName || getBusinessById(transaction.businessId)?.name || tx("common_business")] : []),
        formatCsvDateCell(transaction.date),
        transaction.description || "",
        resolveTransactionType(transaction),
        transaction.cleared ? tx("transactions_status_cleared") : tx("transactions_status_pending"),
        String(Math.abs(Number(transaction.amount) || 0))
      ]);
    });

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function buildFullCsv(transactions, currency, includeBusiness = false) {
  const accounts = mapById(getAccounts());
  const categories = mapById(getCategories());
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Type",
    "Status",
    "Amount",
    "Account",
    "Category",
    "Running Balance",
    "Receipt Attached",
    "Currency",
    "Source Amount",
    "Exchange Rate",
    "Exchange Date",
    "Converted Amount",
    "Tax Treatment",
    "Indirect Tax Amount",
    "Indirect Tax Recoverable",
    "Personal Use %",
    "Review Status",
    "Review Notes"
  ]];
  const runningBalances = new Map();

  transactions
    .slice()
    .sort((left, right) => {
      const accountCompare = `${left.accountId || ""}`.localeCompare(`${right.accountId || ""}`);
      if (accountCompare !== 0) return accountCompare;
      const dateCompare = (left.date || "").localeCompare(right.date || "");
      if (dateCompare !== 0) return dateCompare;
      return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
    })
    .forEach((transaction) => {
      const type = resolveTransactionType(transaction, categories[transaction.categoryId]);
      const accountId = transaction.accountId || "";
      const numericAmount = Math.abs(Number(transaction.amount) || 0);
      const signedAmount = type === "income" ? numericAmount : -numericAmount;
      const runningBalanceKey = includeBusiness ? `${transaction.businessId || ""}:${accountId}` : accountId;
      const nextBalance = (runningBalances.get(runningBalanceKey) || 0) + signedAmount;
      runningBalances.set(runningBalanceKey, nextBalance);

      rows.push([
        ...(includeBusiness ? [transaction.businessName || getBusinessById(transaction.businessId)?.name || tx("common_business")] : []),
        formatCsvDateCell(transaction.date),
        transaction.description || "",
        type,
        transaction.cleared ? tx("transactions_status_cleared") : tx("transactions_status_pending"),
        String(numericAmount),
        accounts[transaction.accountId]?.name || "",
        categories[transaction.categoryId]?.name || "",
        nextBalance.toFixed(2),
        transaction.receiptId || transaction.receipt_id ? tx("status_yes") : tx("status_no"),
        transaction.currency || currency,
        formatOptionalCsvNumber(transaction.sourceAmount ?? transaction.source_amount),
        formatOptionalCsvNumber(transaction.exchangeRate ?? transaction.exchange_rate, true),
        formatCsvDateCell(transaction.exchangeDate || transaction.exchange_date || ""),
        formatOptionalCsvNumber(transaction.convertedAmount ?? transaction.converted_amount),
        (() => {
          const treatment = String(transaction.taxTreatment || transaction.tax_treatment || "").toLowerCase();
          return treatment && treatment !== "operating" ? treatment : "";
        })(),
        formatOptionalCsvNumber(transaction.indirectTaxAmount ?? transaction.indirect_tax_amount),
        transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true ? "Yes" : "",
        (() => {
          const pct = Number(transaction.personalUsePct ?? transaction.personal_use_pct);
          return Number.isFinite(pct) && pct > 0 ? pct.toFixed(1) : "";
        })(),
        (() => {
          const status = String(transaction.reviewStatus || transaction.review_status || "").toLowerCase();
          return status && status !== "ready" ? status : "";
        })(),
        transaction.reviewNotes || transaction.review_notes || ""
      ]);
    });

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const stringValue = `${value ?? ""}`;
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function formatCsvDateCell(value) {
  const normalized = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  // Prefix with an invisible LTR mark so spreadsheet apps preserve the
  // short ISO date as text instead of auto-formatting it into truncated cells.
  return `\u200E${normalized}`;
}

function formatOptionalCsvNumber(value, preservePrecision = false) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  return preservePrecision ? String(num) : num.toFixed(2);
}

function downloadFile(content, filename, type) {
  const isCsv = typeof type === "string" && type.toLowerCase().startsWith("text/csv");
  let blobData = content instanceof Uint8Array ? content.buffer : content;
  if (isCsv && typeof blobData === "string") {
    blobData = `\uFEFF${blobData}`;
  }
  const blob = new Blob([blobData], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function recordExportHistory(entry) {
  try {
    const response = await apiFetch("/api/exports/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        format: entry.format,
        startDate: entry.startDate,
        endDate: entry.endDate,
        language: entry.exportLang || DEFAULT_EXPORT_LANG,
        scope: entry.scope || getExportScope(),
        filename: entry.filename || "",
        businessId: entry.businessId || "",
        batchMode: !!entry.batchMode
      })
    });
    return !!(response && response.ok);
  } catch (error) {
    console.warn("[Exports] Unable to record export history", error);
    return false;
  }
}

async function fetchBackendExportHistory() {
  try {
    const response = await apiFetch("/api/exports/history");
    if (!response || !response.ok) {
      return [];
    }
    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      exportedAt: row.created_at,
      filename: row.filename || buildHistoryFilename(row),
      format: row.export_type || PDF_FORMAT,
      exportLang: row.language || "en",
      scope: row.scope || "active",
      source: "backend"
    }));
  } catch {
    return [];
  }
}

async function renderExportHistory() {
  const historyRows = document.getElementById("exportHistoryRows");
  if (!historyRows) {
    return;
  }

  const merged = (await fetchBackendExportHistory())
    .sort((left, right) => new Date(right.exportedAt) - new Date(left.exportedAt))
    .slice(0, 10);

  if (merged.length === 0) {
    historyRows.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_no_history"))}</div>`;
    return;
  }

  historyRows.innerHTML = merged.map((entry) => {
    const descriptor = describeHistoryEntry(entry);
    const formatClass = descriptor.formatLabel === "PDF" ? "pdf" : "csv";
    const actionLabel = entry.format === PDF_FORMAT
      ? escapeHtml(tx("exports_history_download_redacted") || "Download")
      : escapeHtml(tx("exports_history_download_label"));
    const dataAttr = `data-history-id="${escapeHtml(entry.id || "")}" data-history-format="${escapeHtml(entry.format || PDF_FORMAT)}"`;
    return `
      <div class="history-item">
        <div class="history-file">
          <span class="history-badge ${formatClass}">${descriptor.formatLabel}</span>
          <span class="history-file-name">${escapeHtml(entry.filename || descriptor.formatLabel)}</span>
        </div>
        <div class="history-period">${escapeHtml(`${entry.startDate || "-"} to ${entry.endDate || "-"}`)}</div>
        <div class="history-meta">${escapeHtml(formatHistoryDate(entry.exportedAt))}</div>
        <div class="history-size">${escapeHtml(formatHistorySize(entry.format))}</div>
        <div class="history-download-cell">
          <div class="history-actions">
            <button type="button" class="history-download" ${dataAttr}>
              <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v7M5 7l3 3 3-3"></path><line x1="3" y1="13" x2="13" y2="13"></line></svg>
              <span>${actionLabel}</span>
            </button>
            <button type="button" class="history-delete" data-delete-backend-id="${escapeHtml(entry.id || "")}" aria-label="Delete export">
              <svg viewBox="0 0 16 16" fill="none"><polyline points="2 4 14 4"></polyline><path d="M5 4V2h6v2M6 7v5M10 7v5"></path><path d="M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function downloadBackendExport(exportId) {
  if (!exportId) {
    return;
  }
  try {
    const response = await apiFetch(`/api/exports/history/${encodeURIComponent(exportId)}/redacted`);
    if (!response || !response.ok) {
      showExportToast(tx("exports_history_download_error") || "Download failed");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `export-redacted-${exportId}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Backend export download failed:", err);
    showExportToast(tx("exports_history_download_error") || "Download failed");
  }
}

async function deleteBackendExport(exportId, rowEl) {
  if (!exportId) return;
  try {
    const response = await apiFetch(`/api/exports/history/${encodeURIComponent(exportId)}`, { method: "DELETE" });
    if (!response || !response.ok) {
      showExportToast(tx("exports_history_delete_error") || "Delete failed");
      return;
    }
    rowEl?.remove();
    const historyRows = document.getElementById("exportHistoryRows");
    if (historyRows && !historyRows.querySelector(".history-item")) {
      historyRows.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_no_history"))}</div>`;
    }
    showExportToast(tx("exports_history_deleted") || "Export deleted");
  } catch (err) {
    console.error("Backend export delete failed:", err);
    showExportToast(tx("exports_history_delete_error") || "Delete failed");
  }
}

async function replayHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }
  const entry = (await fetchBackendExportHistory()).find((record) => record.id === entryId);
  if (!entry) {
    return;
  }

  setExportScope(document.getElementById("exportScope"), entry.scope);
  await hydrateExportData();
  await refreshReceiptsDot();
  syncExportScopeUi();
  populateExportFilters();
  updateExportSummary();

  if (entry.format === PDF_FORMAT) {
    await exportPdf(entry.startDate, entry.endDate, false, entry.filename, entry.exportLang);
    return;
  }

  const tier = entry.tier || (entry.format === CSV_FULL_FORMAT ? "v1" : "free");
  await exportCsv(entry.startDate, entry.endDate, false, entry.filename, tier, entry.exportLang);
}

function describeHistoryEntry(entry) {
  const format = entry.format || (entry.tier === "v1" ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT);
  if (format === PDF_FORMAT) {
    return { formatLabel: "PDF" };
  }
  return { formatLabel: "CSV" };
}

function getCurrentExportLanguage() {
  const select = document.getElementById("exportLanguage");
  if (select?.value) {
    return clampExportLang(select.value);
  }
  const langKey = getExportPreferenceKey(EXPORT_LANG_KEY);
  return clampExportLang(
    (langKey ? localStorage.getItem(langKey) : null)
      || localStorage.getItem("lb_language")
      || DEFAULT_EXPORT_LANG
  );
}

function clampExportLang(value) {
  const normalized = (value || DEFAULT_EXPORT_LANG).toLowerCase();
  return VALID_EXPORT_LANGS.includes(normalized) ? normalized : DEFAULT_EXPORT_LANG;
}

function buildHistoryFilename(entry) {
  const format = entry?.export_type || entry?.format || PDF_FORMAT;
  if (format === PDF_FORMAT) {
    return `export_${entry.start_date}_to_${entry.end_date}.pdf`;
  }
  if (format === CSV_FULL_FORMAT) {
    return `export_${entry.start_date}_to_${entry.end_date}.csv`;
  }
  return `basic_export_${entry.start_date}_to_${entry.end_date}.csv`;
}

function filterTransactions(startDate, endDate) {
  const accountFilter = document.getElementById("exportAccountFilter")?.value || "";
  const categoryFilter = document.getElementById("exportCategoryFilter")?.value || "";

  return getTransactions().filter((transaction) => {
    if (!transaction.date || transaction.date < startDate || transaction.date > endDate) {
      return false;
    }
    if (accountFilter && transaction.accountId !== accountFilter) {
      return false;
    }
    if (categoryFilter && transaction.categoryId !== categoryFilter) {
      return false;
    }
    return true;
  });
}

function populateExportFilters() {
  const accountSelect = document.getElementById("exportAccountFilter");
  const categorySelect = document.getElementById("exportCategoryFilter");

  if (accountSelect) {
    const accounts = getAccounts();
    accountSelect.innerHTML = `<option value="">${escapeHtml(tx("exports_all_accounts"))}</option>`;
    accounts.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.id || "";
      option.textContent =
        getExportScope() === "all"
          ? `${account.businessName || getBusinessById(account.businessId)?.name || tx("common_business")} · ${account.name || tx("accounts_fallback_name")}`
          : account.name || tx("accounts_fallback_name");
      accountSelect.appendChild(option);
    });
    accountSelect.disabled = accounts.length === 0;
  }

  if (categorySelect) {
    const categories = getCategories();
    categorySelect.innerHTML = `<option value="">${escapeHtml(tx("exports_all_categories"))}</option>`;
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id || "";
      option.textContent =
        getExportScope() === "all"
          ? `${category.businessName || getBusinessById(category.businessId)?.name || tx("common_business")} · ${category.name || tx("categories_fallback_name")}`
          : category.name || tx("categories_fallback_name");
      categorySelect.appendChild(option);
    });
    categorySelect.disabled = categories.length === 0;
  }
}

async function refreshReceiptsDot() {
  try {
    const response = await apiFetch(`/api/receipts${buildScopeQuery()}`);
    if (response && response.ok) {
      const payload = await response.json().catch(() => []);
      const receipts = Array.isArray(payload) ? payload : Array.isArray(payload?.receipts) ? payload.receipts : [];
      unattachedReceiptsCount = receipts.filter((receipt) => !receipt?.transaction_id && !receipt?.transactionId).length;
    }
  } catch (error) {
    console.warn("[Exports] Unable to refresh receipts dot", error);
  }
  updateReceiptsDot();
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }
  dot.hidden = unattachedReceiptsCount === 0;
}

function showExportToast(message) {
  const toast = document.getElementById("exportToast");
  const messageNode = document.getElementById("exportToastMessage");
  if (!toast || !messageNode) {
    return;
  }

  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (exportToastTimer) {
    clearTimeout(exportToastTimer);
  }
  exportToastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, EXPORT_TOAST_MS);
}

function resolveTransactionType(transaction, category) {
  if (transaction.type) {
    return transaction.type;
  }
  return category?.type === "income" ? "income" : "expense";
}

function makeExportFilename(startDate, endDate, batch) {
  return `inex-ledger-${buildExportFileSlug(batch)}-export-${startDate}_to_${endDate}.csv`;
}

function makeBasicFilename(startDate, endDate, batch) {
  return `inex-ledger-${buildExportFileSlug(batch)}-basic-export-${startDate}_to_${endDate}.csv`;
}

function makePdfFilename(startDate, endDate, batch) {
  return `inex-ledger-${buildExportFileSlug(batch)}-export-${startDate}_to_${endDate}.pdf`;
}

function formatHistoryDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatHistorySize(format) {
  return format === PDF_FORMAT ? "PDF" : "CSV";
}

function formatMoney(amount, regionOverride = getRegion()) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: getCurrencyForRegion(regionOverride),
    minimumFractionDigits: 2
  }).format(amount || 0);
}

function getRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored?.toLowerCase() === "ca" ? "ca" : "us";
}

function getProvince() {
  return String(
    (typeof window !== "undefined" && window.LUNA_PROVINCE) ||
    localStorage.getItem("lb_province") ||
    ""
  ).toUpperCase();
}

function getTaxFormContext(region = getRegion()) {
  if (region === "ca") {
    return {
      label: "Canada T2125",
      exportLabel: "Canada T2125 export package",
      slug: "t2125"
    };
  }

  return {
    label: "U.S. Schedule C",
    exportLabel: "U.S. Schedule C export package",
    slug: "schedule-c"
  };
}

function getTaxFormContextForScope() {
  const businesses = getBusinessesInScope();
  if (getExportScope() !== "all") {
    return getTaxFormContext(String(businesses[0]?.region || getRegion()).toLowerCase());
  }

  const regions = new Set(
    businesses.map((business) => (String(business.region || "").toUpperCase() === "CA" ? "CA" : "US"))
  );
  if (regions.size === 1) {
    return getTaxFormContext([...regions][0] === "CA" ? "ca" : "us");
  }

  return {
    label: "Multi-business",
    exportLabel: "Multi-business export package",
    slug: "multi-business"
  };
}

function slugifyBusinessName(value) {
  return String(value || "business")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "business";
}

function buildExportFileSlug(batch) {
  const taxContext = getTaxFormContextForScope();
  if (!batch?.businessId || getExportScope() !== "all") {
    return taxContext.slug;
  }
  return `${taxContext.slug}-${slugifyBusinessName(batch.businessName || batch.businessId)}`;
}

function buildExportBatches(transactions, scope) {
  if (scope !== "all") {
    const activeBusiness = getBusinessById(getActiveBusinessId());
    return [{
      businessId: activeBusiness?.id || "",
      businessName: activeBusiness?.name || readBusinessProfile().name || "Business",
      region: String(activeBusiness?.region || getRegion()).toLowerCase(),
      province: String(activeBusiness?.province || getProvince()).toUpperCase(),
      businessProfile: readBusinessProfile(),
      transactions
    }];
  }

  return getBusinessesInScope().map((business) => ({
    businessId: business.id,
    businessName: business.name || "Business",
    region: String(business.region || "US").toLowerCase(),
    province: String(business.province || "").toUpperCase(),
    transactions: transactions.filter((transaction) => transaction.businessId === business.id),
    businessProfile: {
      name: business.name || "Business",
      taxId: "",
      ein: "",
      type: "",
      address: ""
    }
  })).filter((batch) => batch.transactions.length > 0);
}

async function buildExportPdfBatches(transactions, scope) {
  const batches = buildExportBatches(transactions, scope);
  if (scope !== "all") {
    return batches;
  }

  const hydratedProfiles = await Promise.all(
    batches.map(async (batch) => ({
      ...batch,
      businessProfile: await fetchBusinessProfileById(batch.businessId, batch.businessName)
    }))
  );

  return hydratedProfiles;
}

async function fetchBusinessProfileById(businessId, fallbackName = "Business") {
  if (!businessId) {
    return {
      name: fallbackName,
      taxId: "",
      ein: "",
      type: "",
      address: "",
      fiscalYearStart: ""
    };
  }

  try {
    const response = await apiFetch(`/api/businesses/${encodeURIComponent(businessId)}/profile`);
    if (!response || !response.ok) {
      throw new Error("Profile request failed");
    }
    const business = await response.json().catch(() => null);
    if (!business) {
      throw new Error("Profile payload missing");
    }

    return {
      name: business.name || fallbackName,
      type: business.business_type || "",
      ein: business.tax_id || "",
      taxId: business.tax_id || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || ""
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate business profile", businessId, error);
    return {
      name: fallbackName,
      taxId: "",
      ein: "",
      type: "",
      address: "",
      fiscalYearStart: ""
    };
  }
}

function getCurrencyForRegion(region) {
  return region === "ca" ? "CAD" : "USD";
}

function mapById(items) {
  return items.reduce((accumulator, item) => {
    if (item?.id) {
      accumulator[item.id] = item;
    }
    return accumulator;
  }, {});
}

function readBusinessProfile() {
  return exportState.businessProfile || {};
}

function getTransactions() {
  return Array.isArray(exportState.transactions) ? exportState.transactions : [];
}

function getAccounts() {
  return Array.isArray(exportState.accounts) ? exportState.accounts : [];
}

function getCategories() {
  return Array.isArray(exportState.categories) ? exportState.categories : [];
}

function getReceipts() {
  return Array.isArray(exportState.receipts) ? exportState.receipts : [];
}

function getMileage() {
  return Array.isArray(exportState.mileage) ? exportState.mileage : [];
}

function isValidTaxId(value) {
  if (!value) return false;
  const v = value.trim();
  // US SSN: 9 digits or XXX-XX-XXXX
  const SSN_RE = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
  // US EIN: 9 digits or XX-XXXXXXX
  const EIN_RE = /^(\d{2}-\d{7}|\d{9})$/;
  // Canada SIN: 9 digits or XXX-XXX-XXX
  const SIN_RE = /^(\d{3}-\d{3}-\d{3}|\d{9})$/;
  // Canada BN: 9-digit program account or full 15-char account like 123456789RT0001
  const BN_RE = /^(\d{9}|(?:\d{9}[A-Za-z]{2}\d{4})|(?:\d{9}\s?[A-Za-z]{2}\s?\d{4})|(?:\d{9}-[A-Za-z]{2}-\d{4}))$/;
  return SSN_RE.test(v) || EIN_RE.test(v) || SIN_RE.test(v) || BN_RE.test(v);
}

async function submitSecureExport(taxId, startDate, endDate) {
  // Encrypt the tax ID client-side before sending
  let taxId_jwe;
  try {
    if (!window.exportCrypto?.encryptTaxId) {
      throw new Error(tx("secure_export_modal_error_generic"));
    }
    taxId_jwe = await window.exportCrypto.encryptTaxId(taxId);
  } catch (encErr) {
    throw new Error(tx("secure_export_modal_error_generic"));
  }

  const scope = getExportScope();
  const exportLang = clampExportLang(getCurrentExportLanguage());
  const region = getRegion();
  const currency = getCurrencyForRegion(region);

  const response = await apiFetch("/api/exports/secure-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRange: { startDate, endDate },
      includeTaxId: true,
      taxId_jwe,
      language: exportLang,
      currency,
      templateVersion: "v1"
    })
  });

  if (!response || !response.ok) {
    let errorMessage = tx("secure_export_modal_error_generic");
    try {
      const payload = await response.json();
      if (payload?.error && typeof payload.error === "string") {
        errorMessage = payload.error;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inex-ledger-secure-export-${startDate}_to_${endDate}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  showExportToast(tx("exports_generated_pdf"));
  await renderExportHistory();
}
