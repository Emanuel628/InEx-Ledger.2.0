const EXPORT_HISTORY_KEY = "lb_export_history";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";

let serverHistoryCache = null;
let isFetchingHistory = false;

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  wireExportForm();
  initExportLanguageSelect();
  setupPdfButton();
  fetchServerHistory();
});

function wireExportForm() {
  const form = document.getElementById("exportForm");
  const historySelect = document.getElementById("exportHistoryDropdown");
  const historyDetails = document.getElementById("exportHistoryDetails");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");

  setupTaxIdControls();
  populateExportFilters();

  historySelect?.addEventListener("change", () => {
    if (!historySelect.value) {
      resetHistoryDetails(historyDetails, historyPlaceholder);
      return;
    }
    renderHistoryDetails(historySelect.value);
  });

  historyDetails?.addEventListener("click", (event) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest(".history-replay")
        : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    replayHistoryEntry(target.dataset.historyId);
  });

  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const range = getValidatedExportRange();
    if (!range) return;
    exportCsv(range.startDate, range.endDate);
  });
}

function setupTaxIdControls() {
  const checkbox = document.getElementById("exportIncludeTaxId");
  const row = document.getElementById("exportTaxIdRow");

  if (!checkbox || !row) return;
  checkbox.addEventListener("change", () => {
    row.hidden = !checkbox.checked;
  });
}

async function setupPdfButton() {
  const btn = document.getElementById("exportPdfBtn");
  const note = document.getElementById("exportPdfNote");
  if (!btn) return;
  const tier = typeof effectiveTier === "function" ? effectiveTier() : "free";
  const isV1 = tier === "v1";
  btn.disabled = !isV1;
  if (note) {
    note.hidden = isV1;
  }
  btn.addEventListener("click", async () => {
    if (!isV1) return;
    const range = getValidatedExportRange();
    if (!range) return;
    await startPdfExport(range, { recordHistory: true });
  });
}

async function startPdfExport(range, { recordHistory = true, includeTaxIdOverride } = {}) {
  const messageNode = document.getElementById("exportFormMessage");
  clearFormMessage();

  const includeTaxId = typeof includeTaxIdOverride === "boolean"
    ? includeTaxIdOverride
    : Boolean(document.getElementById("exportIncludeTaxId")?.checked);

  let taxId_jwe;
  if (includeTaxId) {
    const taxInput = document.getElementById("exportTaxId");
    const taxId = taxInput?.value?.trim();
    if (!taxId) {
      return setFormMessage("Enter your EIN or business number to include it in the export.");
    }
    try {
      const encrypted = await window.exportCrypto?.encryptTaxId(taxId);
      if (!encrypted) {
        throw new Error("Encryption failed");
      }
      taxId_jwe = encrypted;
    } catch (err) {
      console.error("Encrypt tax ID failed:", err);
      return setFormMessage("Unable to encrypt tax ID right now. Try again shortly.");
    } finally {
      if (taxInput) {
        taxInput.value = "";
        taxInput.blur();
      }
    }
  }

  const exportLang = clampExportLang(getCurrentExportLanguage());
  const currency = getCurrencyForRegion(getRegion());
  const grantBody = {
    exportType: "pdf",
    includeTaxId,
    dateRange: {
      startDate: range.startDate,
      endDate: range.endDate
    },
    language: exportLang,
    currency,
    templateVersion: "v1"
  };

  const grantResponse = await apiFetch("/api/exports/request-grant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(grantBody)
  });

  if (!grantResponse) {
    return setFormMessage("Session expired. Please sign in again.");
  }

  if (!grantResponse.ok) {
    const payload = await safeJson(grantResponse);
    return setFormMessage(payload?.error || "Unable to request export grant.");
  }

  const { grantToken } = await grantResponse.json();
  const generateResponse = await apiFetch("/api/exports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantToken,
      taxId_jwe,
      language: exportLang,
      currency,
      templateVersion: "v1"
    })
  });

  if (!generateResponse) {
    return setFormMessage("Session expired. Please sign in again.");
  }

  if (!generateResponse.ok) {
    const payload = await safeJson(generateResponse);
    return setFormMessage(payload?.error || "Export generation failed.");
  }

  const blob = await generateResponse.blob();
  const filename = makePdfFilename(range.startDate, range.endDate);
  downloadFile(blob, filename, "application/pdf");

  appendExportHistory({
    id: `exp_${Date.now()}`,
    startDate: range.startDate,
    endDate: range.endDate,
    exportedAt: new Date().toISOString(),
    filename,
    tier: "v1",
    format: PDF_FORMAT,
    exportLang
  });

  if (recordHistory) {
    await fetchServerHistory();
  }
}

async function fetchServerHistory() {
  if (isFetchingHistory) {
    return;
  }
  isFetchingHistory = true;
  try {
    const response = await apiFetch("/api/exports/history");
    if (response && response.ok) {
      const data = await response.json();
      serverHistoryCache = data.map((entry) => normalizeHistoryEntry(entry));
      localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(serverHistoryCache));
      renderExportHistory();
    }
  } catch (err) {
    console.error("Unable to sync export history:", err);
  } finally {
    isFetchingHistory = false;
  }
}

function getValidatedExportRange() {
  const messageNode = document.getElementById("exportFormMessage");
  const startInput = document.getElementById("period-start");
  const endInput = document.getElementById("period-end");
  const startDate = startInput?.value || "";
  const endDate = endInput?.value || "";

  if (!startDate || !endDate) {
    setFormMessage("Start and end dates are required.");
    return null;
  }
  if (startDate > endDate) {
    setFormMessage("End date must be the same as or after start date.");
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
  const saved = clampExportLang(localStorage.getItem("lb_language") || appLang);
  select.value = saved;
  select.addEventListener("change", (event) => {
    const next = clampExportLang(event.target.value);
    select.value = next;
    localStorage.setItem("lb_language", next);
  });
}

function exportCsv(startDate, endDate, recordHistory = true, explicitFilename, tierOverride, exportLangOverride) {
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
  const csvContent = isFull ? buildFullCsv(transactions, currency) : buildBasicCsv(transactions);
  const filename =
    explicitFilename ||
    (isFull ? makeExportFilename(startDate, endDate) : makeBasicFilename(startDate, endDate));

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

function appendExportHistory(entry) {
  const history = getExportHistory();
  history.unshift(entry);
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history));
  serverHistoryCache = history;
}

function renderExportHistory() {
  const historySelect = document.getElementById("exportHistoryDropdown");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");
  if (!historySelect) return;
  const historySource = serverHistoryCache && serverHistoryCache.length ? serverHistoryCache : getExportHistory();
  const history = historySource
    .slice()
    .sort((a, b) => new Date(b.exportedAt || b.created_at) - new Date(a.exportedAt || a.created_at));

  historySelect.innerHTML = "";
  if (history.length === 0) {
    historySelect.disabled = true;
    if (historyPlaceholder) {
      historyPlaceholder.hidden = false;
    }
    resetHistoryDetails(document.getElementById("exportHistoryDetails"), historyPlaceholder);
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

function resetHistoryDetails(detailsNode, placeholder) {
  if (detailsNode) {
    detailsNode.innerHTML = "";
    detailsNode.classList.remove("active");
  }
  if (placeholder) {
    placeholder.hidden = false;
  }
}

function renderHistoryDetails(entryId) {
  const historyDetails = document.getElementById("exportHistoryDetails");
  const historyPlaceholder = document.getElementById("exportHistoryPlaceholder");
  if (!historyDetails) return;
  const entry = getExportHistory().find((record) => record.id === entryId) ||
    (serverHistoryCache || []).find((record) => record.id === entryId);
  if (!entry) {
    historyDetails.innerHTML = "";
    historyDetails.classList.remove("active");
    if (historyPlaceholder) {
      historyPlaceholder.hidden = false;
    }
    return;
  }
  const rangeLabel = typeof t === "function" ? t("exports_history_range_label") : "Date range";
  const exportedOnLabel = typeof t === "function" ? t("exports_history_exported_on") : "Exported on";
  const { formatLabel, langLabel } = describeHistoryEntry(entry);
  const startDate = entry.startDate || "---";
  const endDate = entry.endDate || "---";
  const exportedOnText = formatTimestamp(entry.exportedAt || entry.created_at);
  const taxNote = entry.includeTaxId ? "Includes tax identifier" : "Redacted record only";
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
      Filename: ${entry.filename || makePdfFilename(startDate, endDate)}
    </p>
    <p class="small-note">
      ${taxNote}
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
  const entry =
    (serverHistoryCache || []).find((record) => record.id === entryId) ||
    getExportHistory().find((record) => record.id === entryId);
  if (!entry) {
    return;
  }
  if (entry.format === PDF_FORMAT) {
    startPdfExport(
      { startDate: entry.startDate, endDate: entry.endDate },
      { recordHistory: true, includeTaxIdOverride: false }
    );
  } else {
    const tier =
      entry.tier || (entry.format === CSV_FULL_FORMAT ? "v1" : "free");
    exportCsv(entry.startDate, entry.endDate, true, entry.filename, tier, entry.exportLang);
  }
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

function clampExportLang(value) {
  if (!value) return DEFAULT_EXPORT_LANG;
  const normalized = value.toLowerCase();
  return VALID_EXPORT_LANGS.includes(normalized) ? normalized : DEFAULT_EXPORT_LANG;
}

function getRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored?.toLowerCase() === "ca" ? "ca" : "us";
}

function getCurrencyForRegion(region) {
  return region === "ca" ? "CAD" : "USD";
}

function downloadFile(content, filename, type) {
  const blob =
    content instanceof Blob
      ? content
      : new Blob([content], { type: type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function getExportHistory() {
  if (Array.isArray(serverHistoryCache) && serverHistoryCache.length) {
    return serverHistoryCache;
  }
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
  const accountFilter = document.getElementById("exportAccountFilter")?.value || "";
  const categoryFilter = document.getElementById("exportCategoryFilter")?.value || "";
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

function setFormMessage(message) {
  const node = document.getElementById("exportFormMessage");
  if (node) {
    node.textContent = message;
  }
}

function clearFormMessage() {
  setFormMessage("");
}

function safeJson(response) {
  return response.json().catch(() => null);
}

function normalizeHistoryEntry(entry) {
  return {
    id: entry.id,
    startDate: entry.start_date,
    endDate: entry.end_date,
    exportedAt: entry.created_at,
    filename: entry.filename || makePdfFilename(entry.start_date, entry.end_date),
    format: entry.export_type || PDF_FORMAT,
    exportLang: entry.language || DEFAULT_EXPORT_LANG,
    includeTaxId: entry.include_tax_id || false
  };
}

function describeHistoryEntry(entry) {
  const lang = clampExportLang(entry.exportLang || DEFAULT_EXPORT_LANG).toUpperCase();
  const format = entry.format || PDF_FORMAT;
  let formatLabel = "CSV";
  if (format === CSV_FULL_FORMAT) {
    formatLabel = "CSV V1";
  } else if (format === PDF_FORMAT) {
    formatLabel = "PDF";
  }
  return { formatLabel, langLabel: lang };
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

function getAccounts() {
  return readStorageArray("lb_accounts");
}

function getCategories() {
  return readStorageArray("lb_categories");
}

function getTransactions() {
  return readStorageArray("lb_transactions");
}

function getReceipts() {
  return readStorageArray("lb_receipts");
}

function getMileage() {
  return readStorageArray("lb_mileage");
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
      const type = txn.type || (category?.type === "income" ? "income" : "expense");
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

function mapById(items) {
  return (items || []).reduce((acc, item) => {
    if (item && item.id) {
      acc[item.id] = item;
    }
    return acc;
  }, {});
}
