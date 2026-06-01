"use strict";

const BOM = "\uFEFF";
const CRLF = "\r\n";

function escapeCsv(value) {
  const stringValue = neutralizeFormulaCell(`${value ?? ""}`);
  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function neutralizeFormulaCell(value) {
  const stringValue = `${value ?? ""}`;
  return /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(digits);
}

function formatPercentFromPersonalUse(personalUsePct) {
  if (personalUsePct === null || personalUsePct === undefined || personalUsePct === "") return "";
  const pct = Number(personalUsePct);
  if (!Number.isFinite(pct)) return "";
  return Math.max(0, 100 - pct).toFixed(1);
}

function toCsvBuffer(rows) {
  const body = rows.map((row) => row.map(escapeCsv).join(",")).join(CRLF);
  return Buffer.from(`${BOM}${body}${CRLF}`, "utf8");
}

function maybeBusinessColumn(includeBusiness, row) {
  return includeBusiness ? [row.businessName || ""] : [];
}

function buildBasicLedgerCsv(dataset, options = {}) {
  const includeBusiness = options.includeBusiness === true;
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Type",
    "Amount",
    "Currency",
    "Account",
    "Category",
    "Receipt Attached",
    "Notes"
  ]];

  for (const row of dataset.includedRows || []) {
    rows.push([
      ...maybeBusinessColumn(includeBusiness, row),
      row.date,
      row.description,
      row.rawType,
      formatNumber(row.amount),
      row.currency,
      row.accountName,
      row.categoryName,
      yesNo(row.receiptAttached),
      row.reviewNotes || row.supportStatus || ""
    ]);
  }

  return toCsvBuffer(rows);
}

function buildFullCpaCsv(dataset, options = {}) {
  const includeBusiness = options.includeBusiness !== false;
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Raw Type",
    "Gross Amount",
    "Currency",
    "Account",
    "Category",
    "Transaction Nature",
    "Included In P&L",
    "Inclusion Status",
    "Exclusion Code",
    "Exclusion Reason",
    "Tax Jurisdiction",
    "Tax Form",
    "Tax Line",
    "Tax Line Label",
    "Mapping Status",
    "Support Status",
    "Review Flags",
    "Receipt Attached",
    "Receipt Count",
    "Receipt Filenames",
    "Support Artifacts",
    "Support Artifact Count",
    "Payer Name",
    "Tax Form Type",
    "Business Use %",
    "Potential Deductible Amount",
    "Potential Non-Deductible Amount",
    "Source Amount",
    "Exchange Rate",
    "Exchange Date",
    "Converted Amount",
    "Tax Treatment",
    "Indirect Tax Amount",
    "Indirect Tax Recoverable",
    "Review Status",
    "Review Notes",
    "Internal Transaction ID"
  ]];

  for (const row of dataset.rows || []) {
    rows.push([
      ...maybeBusinessColumn(includeBusiness, row),
      row.date,
      row.description,
      row.rawType,
      formatNumber(row.amount),
      row.currency,
      row.accountName,
      row.categoryName,
      row.transactionNature,
      yesNo(row.includedInPnl),
      row.inclusionStatus,
      row.exclusionCode,
      row.exclusionReason,
      row.taxJurisdiction,
      row.taxForm,
      row.taxLine,
      row.taxLineLabel,
      row.mappingStatus,
      row.supportStatus,
      (row.reviewFlags || []).join(" "),
      yesNo(row.receiptAttached),
      String(row.receiptCount || 0),
      (row.receiptFilenames || []).join("; "),
      (row.supportArtifactTypes || []).join("; "),
      String(row.supportArtifactCount || 0),
      row.payerName || "",
      row.taxFormType || "",
      formatPercentFromPersonalUse(row.personalUsePct),
      formatNumber(row.potentialDeductibleAmount),
      formatNumber(row.potentialNonDeductibleAmount),
      row.sourceAmount === "" ? "" : formatNumber(row.sourceAmount),
      row.exchangeRate === "" ? "" : String(row.exchangeRate),
      row.exchangeDate || "",
      row.convertedAmount === "" ? "" : formatNumber(row.convertedAmount),
      row.taxTreatment || "",
      row.indirectTaxAmount === "" ? "" : formatNumber(row.indirectTaxAmount),
      row.indirectTaxRecoverable ? "Yes" : "No",
      row.reviewStatus,
      row.reviewNotes || "",
      row.internalTransactionId
    ]);
  }

  return toCsvBuffer(rows);
}

function buildExcludedItemsCsv(dataset, options = {}) {
  const includeBusiness = options.includeBusiness !== false;
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Amount",
    "Currency",
    "Account",
    "Category",
    "Transaction Nature",
    "Exclusion Code",
    "Exclusion Reason",
    "Included In P&L",
    "Review Needed",
    "Original Type",
    "Notes",
    "Internal Transaction ID"
  ]];

  for (const row of dataset.excludedRows || []) {
    rows.push([
      ...maybeBusinessColumn(includeBusiness, row),
      row.date,
      row.description,
      formatNumber(row.amount),
      row.currency,
      row.accountName,
      row.categoryName,
      row.transactionNature,
      row.exclusionCode,
      row.exclusionReason,
      yesNo(row.includedInPnl),
      row.reviewStatus.toLowerCase().includes("review") ? "Yes" : "No",
      row.rawType,
      row.reviewNotes || "",
      row.internalTransactionId
    ]);
  }

  return toCsvBuffer(rows);
}

function buildCategorySummaryCsv(dataset, options = {}) {
  const includeBusiness = options.includeBusiness !== false;
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Category",
    "Type",
    "Tax Line",
    "Tax Line Label",
    "Mapping Status",
    "Support Status",
    "Transaction Count",
    "Amount",
    "Receipt Count",
    "Missing Receipt Count",
    "Review Flags"
  ]];

  for (const row of dataset.categorySummary || []) {
    rows.push([
      ...maybeBusinessColumn(includeBusiness, row),
      row.category,
      row.type,
      row.taxLine,
      row.taxLineLabel,
      row.mappingStatus,
      row.supportStatus,
      String(row.transactionCount),
      formatNumber(row.amount),
      String(row.receiptCount),
      String(row.missingReceiptCount),
      (row.reviewFlags || []).join(" ")
    ]);
  }

  return toCsvBuffer(rows);
}

function buildCsvBundle(dataset, options = {}) {
  const exportType = String(options.exportType || "csv_full").toLowerCase();
  if (exportType === "csv_basic") return buildBasicLedgerCsv(dataset, options);
  if (exportType === "csv_excluded") return buildExcludedItemsCsv(dataset, options);
  if (exportType === "csv_category_summary") return buildCategorySummaryCsv(dataset, options);
  return buildFullCpaCsv(dataset, options);
}

module.exports = {
  buildBasicLedgerCsv,
  buildFullCpaCsv,
  buildExcludedItemsCsv,
  buildCategorySummaryCsv,
  buildCsvBundle,
  escapeCsv,
  neutralizeFormulaCell
};
