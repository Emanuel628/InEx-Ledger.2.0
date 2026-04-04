const EXPORT_HISTORY_KEY = "lb_export_history";
const TRANSACTIONS_KEY = "lb_transactions";
const ACCOUNTS_KEY = "lb_accounts";
const CATEGORIES_KEY = "lb_categories";
const RECEIPTS_KEY = "lb_receipts";
const MILEAGE_KEY = "lb_mileage";
const EXPORT_LANG_KEY = "lb_export_language";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  wireExportForm();
  initExportLanguageSelect();
  setupPdfButton();
  renderExportHistory();
});

function wireExportForm() {
  const form = document.getElementById("exportForm");
  const historySelect = document.getElementById("exportHistoryDropdown");
  const historyDetails = document.getElementById("exportHistoryDetails");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");

  if (historySelect) {
    historySelect.addEventListener("change", () => {
      if (!historySelect.value) {
        if (historyDetails) {
          historyDetails.innerHTML = "";
          historyDetails.classList.remove("active");
        }
        if (historyPlaceholder) {
          historyPlaceholder.hidden = false;
        }
        return;
      }
      renderHistoryDetails(historySelect.value);
    });
  }

  if (historyDetails) {
    historyDetails.addEventListener("click", (event) => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest(".history-replay")
          : null;
      if (!target) {
        return;
      }
      event.preventDefault();
      const entryId = target.dataset.historyId;
      replayHistoryEntry(entryId);
    });
  }

  populateExportFilters();

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    exportCsv(range.startDate, range.endDate);
  });
}

function getValidatedExportRange() {
  const messageNode = document.getElementById("exportFormMessage");
  const startInput = document.getElementById("period-start");
  const endInput = document.getElementById("period-end");

  const startDate = startInput?.value || "";
  const endDate = endInput?.value || "";

  if (!startDate || !endDate) {
    if (messageNode) {
      messageNode.textContent = t
        ? t("exports_error_dates_required")
        : "Start and end dates are required.";
    }
    return null;
  }

  if (startDate > endDate) {
    if (messageNode) {
      messageNode.textContent = t
        ? t("exports_error_dates_order")
        : "End date must be same or after start date.";
    }
    return null;
  }

  if (messageNode) {
    messageNode.textContent = "";
  }

  return { startDate, endDate };
}

function initExportLanguageSelect() {
  const select = document.getElementById("exportLanguage");
  if (!select) return;

  const appLang = localStorage.getItem("lb_language") || DEFAULT_EXPORT_LANG;
  const saved = clampExportLang(localStorage.getItem(EXPORT_LANG_KEY) || appLang);
  select.value = saved;
  select.addEventListener("change", (event) => {
    const next = clampExportLang(event.target.value);
    select.value = next;
    localStorage.setItem(EXPORT_LANG_KEY, next);
  });
}

function setupPdfButton() {
  const btn = document.getElementById("exportPdfBtn");
  const note = document.getElementById("exportPdfNote");
  if (!btn) return;
  const tier = typeof effectiveTier === "function" ? effectiveTier() : "free";
  const isV1 = tier === "v1";
  btn.disabled = !isV1;
  if (note) {
    note.hidden = isV1;
  }
  btn.addEventListener("click", () => {
    if (!isV1) {
      return;
    }
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    exportPdf(range.startDate, range.endDate);
  });
}

function exportCsv(
  startDate,
  endDate,
  recordHistory = true,
  explicitFilename,
  tierOverride,
  exportLangOverride
) {
  const tier =
    tierOverride ||
    (typeof effectiveTier === "function" ? effectiveTier() : "free");
  const exportLang = clampExportLang(
    (exportLangOverride || getCurrentExportLanguage()).toLowerCase()
  );
  const region = getRegion();
  const currency = getCurrencyForRegion(region);
  const isFull = tier === "v1";
  const format = isFull ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT;
  const transactions = filterTransactions(startDate, endDate);
  const csvContent = isFull
    ? buildFullCsv(transactions, currency)
    : buildBasicCsv(transactions);
  const filename =
    explicitFilename ||
    (isFull
      ? makeExportFilename(startDate, endDate)
      : makeBasicFilename(startDate, endDate));

  downloadFile(csvContent, filename, "text/csv");

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

function exportPdf(
  startDate,
  endDate,
  recordHistory = true,
  explicitFilename,
  exportLangOverride
) {
  if (typeof buildPdfExport !== "function") {
    console.warn("PDF export helper is not available.");
    return;
  }

  const exportLang = clampExportLang(
    (exportLangOverride || getCurrentExportLanguage()).toLowerCase()
  );
  const transactions = filterTransactions(startDate, endDate);
  const accounts = getAccounts();
  const categories = getCategories();
  const receipts = getReceipts();
  const mileage = getMileage();
  const region = getRegion();
  const currency = getCurrencyForRegion(region);
  const filename =
    explicitFilename || makePdfFilename(startDate, endDate);

  const pdfBytes = buildPdfExport({
    transactions,
    accounts,
    categories,
    receipts,
    mileage,
    startDate,
    endDate,
    exportLang,
    currency,
    legalName:
      localStorage.getItem("lb_legal_name") ||
      localStorage.getItem("lb_business_name") ||
      "",
    businessName: localStorage.getItem("lb_business_name") || "",
    operatingName: localStorage.getItem("lb_dba") || "",
    taxId:
      region === "ca"
        ? localStorage.getItem("lb_bn") || ""
        : localStorage.getItem("lb_ein") || "",
    naics: localStorage.getItem("lb_naics") || "",
    region
  });

  downloadFile(pdfBytes, filename, "application/pdf");

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

function getCurrentExportLanguage() {
  const select = document.getElementById("exportLanguage");
  if (select?.value) {
    return clampExportLang(select.value);
  }
  const stored = localStorage.getItem(EXPORT_LANG_KEY);
  if (stored) {
    return clampExportLang(stored);
  }
  return clampExportLang(localStorage.getItem("lb_language") || DEFAULT_EXPORT_LANG);
}

function clampExportLang(value) {
  if (!value) {
    return DEFAULT_EXPORT_LANG;
  }

  const normalized = value.toLowerCase();
  return VALID_EXPORT_LANGS.includes(normalized)
    ? normalized
    : DEFAULT_EXPORT_LANG;
}

function getRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored?.toLowerCase() === "ca" ? "ca" : "us";
}

function getCurrencyForRegion(region) {
  return region === "ca" ? "CAD" : "USD";
}

function buildFullCsv(transactions, currency) {
  const headers = [
    "Date",
    "Description",
    "Type",
    "Amount",
    "Account",
    "Category",
    "Tax Label",
    "Receipt Attached",
    "Receipt ID",
    "Currency"
  ];

  const accounts = mapById(getAccounts());
  const categories = mapById(getCategories());

  const rows = transactions
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map((txn) => {
      const category = categories[txn.categoryId];
      const type =
        txn.type ||
        (category?.type === "income" ? "income" : "expense");
      const typeLabel = type === "income" ? "Income" : "Expense";
      const amountValue = Math.abs(Number(txn.amount) || 0);
      const accountName = accounts[txn.accountId]?.name || "";
      const categoryName = category?.name || "";
      const taxLabel = category?.taxLabel || "";
      const receiptAttached = txn.receiptId || txn.receipt_id ? "Yes" : "No";
      const receiptId =
        txn.receiptId || txn.receipt_id || txn.receiptID || "";

      return [
        csvEscape(txn.date),
        csvEscape(txn.description),
        csvEscape(typeLabel),
        csvEscape(amountValue.toFixed(2)),
        csvEscape(accountName),
        csvEscape(categoryName),
        csvEscape(taxLabel),
        csvEscape(receiptAttached),
        csvEscape(receiptId),
        csvEscape(currency)
      ].join(",");
    });

  return [headers.join(","), ...rows].join("\n");
}

function buildBasicCsv(transactions) {
  const headers = ["Date", "Description", "Amount", "Type"];

  const rows = transactions
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map((txn) => {
      const categoryType = txn.type === "income" ? "income" : "expense";
      const typeLabel = categoryType === "income" ? "Income" : "Expense";
      const amountValue = Math.abs(Number(txn.amount) || 0);

      return [
        csvEscape(txn.date),
        csvEscape(txn.description),
        csvEscape(amountValue.toFixed(2)),
        csvEscape(typeLabel)
      ].join(",");
    });

  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function appendExportHistory(entry) {
  const history = getExportHistory();
  history.unshift(entry);
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history));
}

function renderExportHistory() {
  const historySelect = document.getElementById("exportHistoryDropdown");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");
  if (!historySelect) {
    return;
  }

  const history = getExportHistory()
    .slice()
    .sort((a, b) => new Date(b.exportedAt) - new Date(a.exportedAt));

  historySelect.innerHTML = "";

  if (history.length === 0) {
    if (historyPlaceholder) {
      historyPlaceholder.hidden = false;
    }
    const historyDetails = document.getElementById("exportHistoryDetails");
    if (historyDetails) {
      historyDetails.innerHTML = "";
      historyDetails.classList.remove("active");
    }
    historySelect.disabled = true;
    return;
  }

  historySelect.disabled = false;
  if (historyPlaceholder) {
    historyPlaceholder.hidden = true;
  }

  history.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    const startDate = entry.startDate || "";
    const endDate = entry.endDate || "";
    const { formatLabel } = describeHistoryEntry(entry);
    option.textContent = `${formatLabel} — ${startDate} to ${endDate}`;
    historySelect.appendChild(option);
  });

  const firstEntryId = history[0].id;
  historySelect.value = firstEntryId;
  renderHistoryDetails(firstEntryId);
}

function renderHistoryDetails(entryId) {
  const historyDetails = document.getElementById("exportHistoryDetails");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");
  if (!historyDetails) {
    return;
  }
  const entry = getExportHistory().find((record) => record.id === entryId);
  if (!entry) {
    historyDetails.innerHTML = "";
    historyDetails.classList.remove("active");
    if (historyPlaceholder) {
      historyPlaceholder.hidden = false;
    }
    return;
  }

  const rangeLabel = typeof t === "function" ? t("exports_history_range_label") : "Date range";
  const exportedOnLabel =
    typeof t === "function" ? t("exports_history_exported_on") : "Exported on";
  const { formatLabel, langLabel } = describeHistoryEntry(entry);
  const startDate = entry.startDate || "---";
  const endDate = entry.endDate || "---";
  const exportedOnText = formatTimestamp(entry.exportedAt);
  historyDetails.innerHTML = `
    <p>
      <strong>${rangeLabel}</strong>
      <strong>${startDate}</strong> to <strong>${endDate}</strong>
    </p>
    <p>
      ${exportedOnLabel} ${exportedOnText}
    </p>
    <p class="small-note">
      Format: ${formatLabel} · Language: ${langLabel}
    </p>
    <p class="small-note">
      Filename: ${entry.filename}
    </p>
    <button type="button" class="history-replay" data-history-id="${entry.id}">
      Re-run export
    </button>
  `;
  historyDetails.classList.add("active");
  if (historyPlaceholder) {
    historyPlaceholder.hidden = true;
  }
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
  } else {
    const tier = entry.tier || (entry.format === CSV_FULL_FORMAT ? "v1" : "free");
    exportCsv(entry.startDate, entry.endDate, false, entry.filename, tier, entry.exportLang);
  }
}

function describeHistoryEntry(entry) {
  const lang = clampExportLang(
    entry.exportLang || localStorage.getItem(EXPORT_LANG_KEY) || DEFAULT_EXPORT_LANG
  ).toUpperCase();
  const format = entry.format || (entry.tier === "v1" ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT);
  let formatLabel = "CSV";
  if (format === CSV_FULL_FORMAT) {
    formatLabel = "CSV V1";
  } else if (format === PDF_FORMAT) {
    formatLabel = "PDF";
  }
  return { formatLabel, langLabel: lang };
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
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

function getExportHistory() {
  const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function filterTransactions(startDate, endDate) {
  const transactions = getTransactions();
  const accountFilter =
    document.getElementById("exportAccountFilter")?.value || "";
  const categoryFilter =
    document.getElementById("exportCategoryFilter")?.value || "";
  return transactions.filter((txn) => {
    if (!txn.date) return false;
    if (accountFilter && txn.accountId !== accountFilter) {
      return false;
    }
    if (categoryFilter && txn.categoryId !== categoryFilter) {
      return false;
    }
    return txn.date >= startDate && txn.date <= endDate;
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
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function mapById(items) {
  return items.reduce((acc, item) => {
    if (item && item.id) {
      acc[item.id] = item;
    }
    return acc;
  }, {});
}