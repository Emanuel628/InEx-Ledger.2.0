const EXPORT_HISTORY_KEY = "lb_export_history";
const TRANSACTIONS_KEY = "lb_transactions";
const ACCOUNTS_KEY = "lb_accounts";
const CATEGORIES_KEY = "lb_categories";
const RECEIPTS_KEY = "lb_receipts";
const MILEAGE_KEY = "lb_mileage";
const EXPORT_LANG_KEY = "lb_export_language";
const BUSINESS_PROFILE_KEY = "lb_business_profile";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";
const EXPORT_TOAST_MS = 3000;

let exportToastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  populateExportFilters();
  initExportLanguageSelect();
  initPresetChips();
  initBusinessTaxId();
  setupExportForm();
  setupPdfButton();
  updateReceiptsDot();
  updateExportSummary();
  renderExportHistory();
});

function setupExportForm() {
  const form = document.getElementById("exportForm");
  const historyRows = document.getElementById("exportHistoryRows");

  applyDatePreset("2026-ytd");
  updatePresetChipState("2026-ytd");

  ["period-start", "period-end", "exportAccountFilter", "exportCategoryFilter", "exportLanguage", "exportIncludeTaxId"].forEach((id) => {
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
    replayHistoryEntry(target.dataset.historyId);
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
    exportPdf(range.startDate, range.endDate);
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

  const profile = readBusinessProfile();
  const region = getRegion();
  const taxId = profile.ein || localStorage.getItem(region === "ca" ? "lb_bn" : "lb_ein") || "";
  taxIdNode.textContent = taxId || "Not set";
}

function getValidatedExportRange() {
  const messageNode = document.getElementById("exportFormMessage");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";

  if (!startDate || !endDate) {
    if (messageNode) {
      messageNode.textContent = typeof t === "function" ? t("exports_error_dates_required") : "Start and end dates are required.";
    }
    return null;
  }

  if (startDate > endDate) {
    if (messageNode) {
      messageNode.textContent = typeof t === "function" ? t("exports_error_dates_order") : "End date must be same or after start date.";
    }
    return null;
  }

  if (messageNode) {
    messageNode.textContent = "";
  }

  return { startDate, endDate };
}

function updateExportSummary() {
  const summaryPeriod = document.getElementById("exportSummaryPeriod");
  const summaryIncome = document.getElementById("exportSummaryIncome");
  const summaryExpenses = document.getElementById("exportSummaryExpenses");
  const summaryNet = document.getElementById("exportSummaryNet");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";

  if (!summaryPeriod || !summaryIncome || !summaryExpenses || !summaryNet) {
    return;
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
  summaryIncome.textContent = formatMoney(income);
  summaryExpenses.textContent = formatMoney(expenses);
  summaryNet.textContent = formatMoney(net);
}

function exportCsv(startDate, endDate, recordHistory = true, explicitFilename, tierOverride, exportLangOverride) {
  const tier = tierOverride || (typeof effectiveTier === "function" ? effectiveTier() : "free");
  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const region = getRegion();
  const currency = getCurrencyForRegion(region);
  const transactions = filterTransactions(startDate, endDate);
  const isFull = tier === "v1";
  const format = isFull ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT;
  const filename = explicitFilename || (isFull ? makeExportFilename(startDate, endDate) : makeBasicFilename(startDate, endDate));
  const csvContent = isFull ? buildFullCsv(transactions, currency) : buildBasicCsv(transactions);

  downloadFile(csvContent, filename, "text/csv");
  showExportToast("CSV export generated");

  if (recordHistory) {
    appendExportHistory({
      id: `exp_${Date.now()}`,
      startDate,
      endDate,
      exportedAt: new Date().toISOString(),
      filename,
      tier,
      format,
      exportLang
    });
    renderExportHistory();
  }
}

function exportPdf(startDate, endDate, recordHistory = true, explicitFilename, exportLangOverride) {
  if (typeof buildPdfExport !== "function") {
    console.warn("PDF export helper is not available.");
    return;
  }

  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const filename = explicitFilename || makePdfFilename(startDate, endDate);
  const region = getRegion();
  const businessProfile = readBusinessProfile();
  const includeTaxId = !!document.getElementById("exportIncludeTaxId")?.checked;
  const taxId = includeTaxId ? (businessProfile.ein || localStorage.getItem(region === "ca" ? "lb_bn" : "lb_ein") || "") : "";
  const pdfBytes = buildPdfExport({
    transactions: filterTransactions(startDate, endDate),
    accounts: getAccounts(),
    categories: getCategories(),
    receipts: getReceipts(),
    mileage: getMileage(),
    startDate,
    endDate,
    exportLang,
    currency: getCurrencyForRegion(region),
    legalName: localStorage.getItem("lb_legal_name") || businessProfile.name || "",
    businessName: businessProfile.name || localStorage.getItem("lb_business_name") || "",
    operatingName: localStorage.getItem("lb_dba") || "",
    taxId,
    naics: localStorage.getItem("lb_naics") || "",
    region
  });

  downloadFile(pdfBytes, filename, "application/pdf");
  showExportToast("PDF export generated");

  if (recordHistory) {
    appendExportHistory({
      id: `exp_${Date.now()}`,
      startDate,
      endDate,
      exportedAt: new Date().toISOString(),
      filename,
      tier: "v1",
      format: PDF_FORMAT,
      exportLang
    });
    renderExportHistory();
  }
}

function buildBasicCsv(transactions) {
  const rows = [
    ["Date", "Description", "Type", "Amount"]
  ];

  transactions
    .slice()
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""))
    .forEach((transaction) => {
      rows.push([
        transaction.date || "",
        transaction.description || "",
        resolveTransactionType(transaction),
        String(Math.abs(Number(transaction.amount) || 0))
      ]);
    });

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function buildFullCsv(transactions, currency) {
  const accounts = mapById(getAccounts());
  const categories = mapById(getCategories());
  const rows = [["Date", "Description", "Type", "Amount", "Account", "Category", "Receipt Attached", "Currency"]];

  transactions
    .slice()
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""))
    .forEach((transaction) => {
      const type = resolveTransactionType(transaction, categories[transaction.categoryId]);
      rows.push([
        transaction.date || "",
        transaction.description || "",
        type,
        String(Math.abs(Number(transaction.amount) || 0)),
        accounts[transaction.accountId]?.name || "",
        categories[transaction.categoryId]?.name || "",
        transaction.receiptId || transaction.receipt_id ? "Yes" : "No",
        currency
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
  const history = getExportHistory();
  history.unshift(entry);
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history));
}

function renderExportHistory() {
  const historyRows = document.getElementById("exportHistoryRows");
  if (!historyRows) {
    return;
  }

  const history = getExportHistory()
    .slice()
    .sort((left, right) => new Date(right.exportedAt) - new Date(left.exportedAt))
    .slice(0, 5);

  if (history.length === 0) {
    historyRows.innerHTML = '<div class="history-empty">No exports yet.</div>';
    return;
  }

  historyRows.innerHTML = history.map((entry) => {
    const descriptor = describeHistoryEntry(entry);
    const formatClass = descriptor.formatLabel === "PDF" ? "pdf" : "csv";
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
          <button type="button" class="history-download" data-history-id="${escapeHtml(entry.id || "")}">
            <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v7M5 7l3 3 3-3"></path><line x1="3" y1="13" x2="13" y2="13"></line></svg>
            <span>Download</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function replayHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }
  const entry = getExportHistory().find((record) => record.id === entryId);
  if (!entry) {
    return;
  }

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

function getExportHistory() {
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
    accountSelect.innerHTML = '<option value="">All accounts</option>';
    accounts.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.id || "";
      option.textContent = account.name || "Account";
      accountSelect.appendChild(option);
    });
    accountSelect.disabled = accounts.length === 0;
  }

  if (categorySelect) {
    const categories = getCategories();
    categorySelect.innerHTML = '<option value="">All categories</option>';
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id || "";
      option.textContent = category.name || "Category";
      categorySelect.appendChild(option);
    });
    categorySelect.disabled = categories.length === 0;
  }
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }
  dot.hidden = !getReceipts().some((receipt) => !receipt.transactionId);
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

function makeExportFilename(startDate, endDate) {
  return `luna-business-export-${startDate}_to_${endDate}.csv`;
}

function makeBasicFilename(startDate, endDate) {
  return `luna-business-basic-export-${startDate}_to_${endDate}.csv`;
}

function makePdfFilename(startDate, endDate) {
  return `luna-business-export-${startDate}_to_${endDate}.pdf`;
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

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: getCurrencyForRegion(getRegion()),
    minimumFractionDigits: 2
  }).format(amount || 0);
}

function getRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored?.toLowerCase() === "ca" ? "ca" : "us";
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
