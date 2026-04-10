const EXPORT_HISTORY_KEY = "lb_export_history";
const TRANSACTIONS_KEY = "lb_transactions";
const ACCOUNTS_KEY = "lb_accounts";
const CATEGORIES_KEY = "lb_categories";
const RECEIPTS_KEY = "lb_receipts";
const MILEAGE_KEY = "lb_mileage";
const BUSINESSES_KEY = "lb_businesses";
const EXPORT_LANG_KEY = "lb_export_language";
const EXPORT_SCOPE_KEY = "lb_export_scope";
const BUSINESS_PROFILE_KEY = "lb_business_profile";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";
const EXPORT_TOAST_MS = 3000;

let exportToastTimer = null;
let unattachedReceiptsCount = 0;
let transactionsCacheFresh = false;
let exportContext = {
  activeBusinessId: "",
  businesses: []
};

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  await hydrateBusinessList();
  initExportScopeSelect();
  await hydrateExportData();
  populateExportFilters();
  initExportLanguageSelect();
  initPresetChips();
  initBusinessTaxId();
  setupExportForm();
  setupPdfButton();
  initSecureExportModal();
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
    hydrateBusinessProfileCache()
  ]);
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
    localStorage.setItem(BUSINESSES_KEY, JSON.stringify(exportContext));
  } catch (error) {
    console.warn("[Exports] Unable to hydrate businesses", error);
  }
}

function initExportScopeSelect() {
  const select = document.getElementById("exportScope");
  if (!select) {
    return;
  }

  setExportScope(select, localStorage.getItem(EXPORT_SCOPE_KEY));
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
  return localStorage.getItem(EXPORT_SCOPE_KEY) === "all" ? "all" : "active";
}

function setExportScope(select, value) {
  const normalized = value === "all" ? "all" : "active";
  if (select) {
    select.value = normalized;
  }
  localStorage.setItem(EXPORT_SCOPE_KEY, normalized);
}

function buildScopeQuery() {
  return getExportScope() === "all" ? "?scope=all" : "";
}

function getStoredBusinesses() {
  if (Array.isArray(exportContext.businesses) && exportContext.businesses.length) {
    return exportContext.businesses;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(BUSINESSES_KEY) || "null");
    if (parsed && Array.isArray(parsed.businesses)) {
      exportContext = parsed;
      return parsed.businesses;
    }
  } catch {}
  return [];
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
  const taxIdValue = document.getElementById("exportTaxIdValue");
  const pdfNote = document.getElementById("exportPdfNote");
  const scope = getExportScope();
  const mixedCurrencies = hasMixedCurrenciesInScope();

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
    }
  }

  if (taxIdValue && scope === "all") {
    taxIdValue.textContent = tx("exports_per_business");
  } else if (taxIdValue) {
    initBusinessTaxId();
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
    const normalized = transactions.map((transaction) => ({
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
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(normalized));
    transactionsCacheFresh = true;
  } catch (error) {
    transactionsCacheFresh = false;
    console.warn("[Exports] Unable to hydrate transactions", error);
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
      const normalized = accounts.map((account) => ({
        ...account,
        businessId: account.businessId || account.business_id || "",
        businessName: account.businessName || account.business_name || ""
      }));
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(normalized));
    }
  } catch (error) {
    console.warn("[Exports] Unable to hydrate accounts", error);
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
      const normalized = categories.map((category) => ({
        id: category.id,
        businessId: category.businessId || category.business_id || "",
        businessName: category.businessName || category.business_name || "",
        name: category.name,
        type: category.kind,
        taxLabel: category.tax_map_us || category.tax_map_ca || ""
      }));
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(normalized));
    }
  } catch (error) {
    console.warn("[Exports] Unable to hydrate categories", error);
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
    const normalized = receipts.map((receipt) => ({
      id: receipt.id,
      businessId: receipt.businessId || receipt.business_id || "",
      businessName: receipt.businessName || receipt.business_name || "",
      filename: receipt.filename || "",
      uploadedAt: receipt.created_at || "",
      transactionId: receipt.transaction_id || "",
      mimeType: receipt.mime_type || ""
    }));
    unattachedReceiptsCount = normalized.filter((receipt) => !receipt.transactionId).length;
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn("[Exports] Unable to hydrate receipts", error);
  }
}

async function hydrateBusinessProfileCache() {
  if (getExportScope() === "all") {
    localStorage.setItem(
      BUSINESS_PROFILE_KEY,
      JSON.stringify({
        name: tx("exports_scope_all"),
        type: "",
        ein: "",
        taxId: "",
        fiscalYearStart: "",
        address: ""
      })
    );
    return;
  }

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return;
    }
    const business = await response.json().catch(() => null);
    if (!business) {
      return;
    }
    localStorage.setItem(
      BUSINESS_PROFILE_KEY,
      JSON.stringify({
        name: business.name || "",
        type: business.business_type || "",
        ein: business.tax_id || "",
        taxId: business.tax_id || "",
        fiscalYearStart: business.fiscal_year_start || "",
        address: business.address || ""
      })
    );
  } catch (error) {
    console.warn("[Exports] Unable to hydrate business profile", error);
  }
}

function setupExportForm() {
  const form = document.getElementById("exportForm");
  const historyRows = document.getElementById("exportHistoryRows");

  applyDatePreset("2026-ytd");
  updatePresetChipState("2026-ytd");

  ["period-start", "period-end", "exportAccountFilter", "exportCategoryFilter", "exportLanguage", "exportIncludeTaxId", "exportScope"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      if (id === "period-start" || id === "period-end") {
        clearCustomPresetState();
      }
      updateExportSummary();
    });
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    exportCsv(range.startDate, range.endDate);
  });

  historyRows?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest(".history-download") : null;
    if (!target) {
      return;
    }
    if (target.dataset.backendId) {
      downloadBackendExport(target.dataset.backendId);
    } else {
      replayHistoryEntry(target.dataset.historyId);
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

  button.addEventListener("click", () => {
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
      openSecureExportModal(range.startDate, range.endDate);
    } else {
      exportPdf(range.startDate, range.endDate);
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

  const ranges = {
    "2025-tax-year": ["2025-01-01", "2025-12-31"],
    "2026-ytd": ["2026-01-01", "2026-04-04"],
    "q1-2026": ["2026-01-01", "2026-03-31"],
    "q4-2025": ["2025-10-01", "2025-12-31"]
  };

  if (preset === "custom") {
    return;
  }

  const [startDate, endDate] = ranges[preset] || ranges["2026-ytd"];
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
  const saved = clampExportLang(localStorage.getItem(EXPORT_LANG_KEY) || appLang);
  select.value = saved;
  select.addEventListener("change", () => {
    const next = clampExportLang(select.value);
    select.value = next;
    localStorage.setItem(EXPORT_LANG_KEY, next);
  });
}

function initBusinessTaxId() {
  const taxIdNode = document.getElementById("exportTaxIdValue");
  if (!taxIdNode) {
    return;
  }

  if (getExportScope() === "all") {
    taxIdNode.textContent = tx("exports_per_business");
    return;
  }

  const profile = readBusinessProfile();
  const region = getRegion();
  const taxId = profile.ein || profile.taxId || localStorage.getItem(region === "ca" ? "lb_bn" : "lb_ein") || "";
  taxIdNode.textContent = taxId || tx("exports_tax_id_not_set");
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
    taxContextNote.textContent = `${tx("exports_tax_context_prefix")}: ${taxContext.exportLabel}`;
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

function exportCsv(startDate, endDate, recordHistory = true, explicitFilename, tierOverride, exportLangOverride) {
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
    historyEntries.forEach((entry) => appendExportHistory(entry));
    renderExportHistory();
  }
}

async function exportPdf(startDate, endDate, recordHistory = true, explicitFilename, exportLangOverride) {
  if (typeof buildPdfExport !== "function") {
    console.warn("PDF export helper is not available.");
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
    const taxId = includeTaxId
      ? businessProfile.ein || businessProfile.taxId || localStorage.getItem(region === "ca" ? "lb_bn" : "lb_ein") || ""
      : "";
    const pdfBytes = buildPdfExport({
      transactions: batch.transactions,
      accounts: getAccounts().filter((account) => !batch.businessId || account.businessId === batch.businessId),
      categories: getCategories().filter((category) => !batch.businessId || category.businessId === batch.businessId),
      receipts: getReceipts().filter((receipt) => !batch.businessId || receipt.businessId === batch.businessId),
      mileage: getMileage().filter((item) => !batch.businessId || item.businessId === batch.businessId),
      startDate,
      endDate,
      exportLang,
      currency: getCurrencyForRegion(region),
      legalName: localStorage.getItem("lb_legal_name") || businessProfile.name || "",
      businessName: businessProfile.name || batch.businessName || localStorage.getItem("lb_business_name") || "",
      operatingName: localStorage.getItem("lb_dba") || "",
      taxId,
      naics: localStorage.getItem("lb_naics") || "",
      region,
      province
    });
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
    historyEntries.forEach((entry) => appendExportHistory(entry));
    renderExportHistory();
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
        transaction.date || "",
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
        transaction.date || "",
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
        transaction.exchangeDate || transaction.exchange_date || "",
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
  const blob = content instanceof Uint8Array ? new Blob([content], { type }) : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function appendExportHistory(entry) {
  const history = getLocalExportHistory();
  history.unshift(entry);
  // Keep at most 50 local entries (CSV exports are not stored server-side)
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
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
      filename: `export_${row.start_date}_to_${row.end_date}.pdf`,
      format: PDF_FORMAT,
      exportLang: row.language || "en",
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

  const [backendEntries, localEntries] = await Promise.all([
    fetchBackendExportHistory(),
    Promise.resolve(getLocalExportHistory())
  ]);

  // Merge: backend PDF entries take precedence; avoid duplicates by id
  const backendIds = new Set(backendEntries.map((e) => e.id));
  const merged = [
    ...backendEntries,
    ...localEntries.filter((e) => !backendIds.has(e.id))
  ]
    .sort((left, right) => new Date(right.exportedAt) - new Date(left.exportedAt))
    .slice(0, 10);

  if (merged.length === 0) {
    historyRows.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_no_history"))}</div>`;
    return;
  }

  historyRows.innerHTML = merged.map((entry) => {
    const descriptor = describeHistoryEntry(entry);
    const formatClass = descriptor.formatLabel === "PDF" ? "pdf" : "csv";
    const isBackend = entry.source === "backend";
    const actionLabel = isBackend
      ? escapeHtml(tx("exports_history_download_redacted") || "Download")
      : escapeHtml(tx("exports_history_download_label"));
    const dataAttr = isBackend
      ? `data-backend-id="${escapeHtml(entry.id)}"`
      : `data-history-id="${escapeHtml(entry.id || "")}"`;
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
          <button type="button" class="history-download" ${dataAttr}>
            <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v7M5 7l3 3 3-3"></path><line x1="3" y1="13" x2="13" y2="13"></line></svg>
            <span>${actionLabel}</span>
          </button>
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

async function replayHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }
  const entry = getLocalExportHistory().find((record) => record.id === entryId);
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
    exportPdf(entry.startDate, entry.endDate, false, entry.filename, entry.exportLang);
    return;
  }

  const tier = entry.tier || (entry.format === CSV_FULL_FORMAT ? "v1" : "free");
  exportCsv(entry.startDate, entry.endDate, false, entry.filename, tier, entry.exportLang);
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
  return clampExportLang(localStorage.getItem(EXPORT_LANG_KEY) || localStorage.getItem("lb_language") || DEFAULT_EXPORT_LANG);
}

function clampExportLang(value) {
  const normalized = (value || DEFAULT_EXPORT_LANG).toLowerCase();
  return VALID_EXPORT_LANGS.includes(normalized) ? normalized : DEFAULT_EXPORT_LANG;
}

function getLocalExportHistory() {
  try {
    return JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
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

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readBusinessProfile() {
  try {
    return JSON.parse(localStorage.getItem(BUSINESS_PROFILE_KEY) || "null") || {};
  } catch {
    return {};
  }
}

function getTransactions() {
  return readStorageArray(TRANSACTIONS_KEY);
}

function getAccounts() {
  return readStorageArray(ACCOUNTS_KEY);
}

function getCategories() {
  return readStorageArray(CATEGORIES_KEY);
}

function getReceipts() {
  return readStorageArray(RECEIPTS_KEY);
}

function getMileage() {
  return readStorageArray(MILEAGE_KEY);
}

function readStorageArray(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

// ─── Secure Export Modal ──────────────────────────────────────────────────────

let secureExportPendingRange = null;

function openSecureExportModal(startDate, endDate) {
  const modal = document.getElementById("secureExportModal");
  const input = document.getElementById("secureExportTaxId");
  const checkbox = document.getElementById("secureExportCheckbox");
  const generateBtn = document.getElementById("secureExportGenerateBtn");
  const errorEl = document.getElementById("secureExportError");
  const canadaText = document.getElementById("secureExportCanadaText");
  const toggleBtn = document.getElementById("secureExportToggleBtn");

  if (!modal) {
    return;
  }

  secureExportPendingRange = { startDate, endDate };

  // Reset state
  if (input) {
    input.value = "";
    input.type = "password";
  }
  if (checkbox) {
    checkbox.checked = false;
  }
  if (generateBtn) {
    generateBtn.disabled = true;
  }
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
  if (toggleBtn) {
    toggleBtn.textContent = tx("secure_export_modal_show");
  }

  // Show Canada-specific text if the business region is Canada
  if (canadaText) {
    const region = getRegion();
    if (region === "ca") {
      canadaText.classList.remove("hidden");
    } else {
      canadaText.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  input?.focus();
}

function closeSecureExportModal() {
  const modal = document.getElementById("secureExportModal");
  const input = document.getElementById("secureExportTaxId");
  if (!modal) {
    return;
  }

  // Wipe ephemeral data immediately on close
  if (input) {
    input.value = "";
  }

  modal.classList.add("hidden");
  secureExportPendingRange = null;
}

function initSecureExportModal() {
  const modal = document.getElementById("secureExportModal");
  const input = document.getElementById("secureExportTaxId");
  const checkbox = document.getElementById("secureExportCheckbox");
  const generateBtn = document.getElementById("secureExportGenerateBtn");
  const cancelBtn = document.getElementById("secureExportCancelBtn");
  const toggleBtn = document.getElementById("secureExportToggleBtn");
  const errorEl = document.getElementById("secureExportError");

  if (!modal) {
    return;
  }

  // Cancel / backdrop close
  cancelBtn?.addEventListener("click", closeSecureExportModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeSecureExportModal();
    }
  });

  // Escape key closes
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeSecureExportModal();
    }
  });

  // Show/hide toggle
  toggleBtn?.addEventListener("click", () => {
    if (!input) {
      return;
    }
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    toggleBtn.textContent = isHidden ? tx("secure_export_modal_hide") : tx("secure_export_modal_show");
  });

  // Enable generate button only when input is non-empty, format is valid, and checkbox is checked
  const syncGenerateBtn = () => {
    if (generateBtn) {
      const val = input?.value?.trim() || "";
      generateBtn.disabled = !val || !isValidTaxId(val) || !checkbox?.checked;
    }
  };
  input?.addEventListener("input", syncGenerateBtn);
  checkbox?.addEventListener("change", syncGenerateBtn);

  // Generate export
  generateBtn?.addEventListener("click", async () => {
    if (!secureExportPendingRange) {
      return;
    }
    const taxId = input?.value?.trim() || "";
    if (!taxId) {
      showSecureExportError(tx("secure_export_modal_error_taxid"));
      return;
    }
    if (!isValidTaxId(taxId)) {
      showSecureExportError(tx("secure_export_modal_error_taxid_format"));
      return;
    }
    if (!checkbox?.checked) {
      showSecureExportError(tx("secure_export_modal_error_checkbox"));
      return;
    }

    generateBtn.disabled = true;
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }

    try {
      await submitSecureExport(taxId, secureExportPendingRange.startDate, secureExportPendingRange.endDate);
      // Wipe input immediately after API call regardless of outcome
      if (input) {
        input.value = "";
      }
      closeSecureExportModal();
    } catch (err) {
      // Input cleared even on error — no residual sensitive data
      if (input) {
        input.value = "";
      }
      generateBtn.disabled = false;
      showSecureExportError(err?.message || tx("secure_export_modal_error_generic"));
    }
  });
}

function isValidTaxId(value) {
  if (!value) return false;
  const v = value.trim();
  // US SSN: 9 digits or XXX-XX-XXXX
  const SSN_RE = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
  // Canada SIN: 9 digits or XXX-XXX-XXX
  const SIN_RE = /^(\d{3}-\d{3}-\d{3}|\d{9})$/;
  return SSN_RE.test(v) || SIN_RE.test(v);
}

function showSecureExportError(message) {
  const errorEl = document.getElementById("secureExportError");
  if (!errorEl) {
    return;
  }
  errorEl.textContent = message || tx("secure_export_modal_error_generic");
  errorEl.classList.remove("hidden");
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

  const historyEntry = {
    id: `exp_${Date.now()}`,
    startDate,
    endDate,
    exportedAt: new Date().toISOString(),
    filename: `inex-ledger-secure-export-${startDate}_to_${endDate}.pdf`,
    tier: "v1",
    format: PDF_FORMAT,
    exportLang,
    scope
  };
  appendExportHistory(historyEntry);
  renderExportHistory();
}
