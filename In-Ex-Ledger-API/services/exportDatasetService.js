"use strict";

const {
  __private: {
    buildReviewInsights,
    calculateTotals,
    computeReceiptCoverage,
    computeTaxLineSummary,
    deriveBusinessAmounts,
    normalizeRegionCode,
    resolveBusinessCurrency,
    summarizeExportTransactions
  }
} = require("./pdfGeneratorService.js");

function mapById(rows) {
  return Object.fromEntries((rows || []).map((row) => [row?.id, row]));
}

function normalizeAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function normalizeIsoDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return raw;
}

function resolveSignedAmount(txn) {
  const gross = normalizeAmount(txn?.amount);
  return String(txn?.type || "").toLowerCase() === "income" ? gross : -gross;
}

function statusNeedsSupport(status) {
  if (!status || status.needsCategory || !status.isMapped) return false;
  return status.flags.some((flag) => ["FC", "RS", "BP", "AL", "ML", "HO", "CA", "RV"].includes(flag));
}

function buildMappingStatus(status, includedInPnl) {
  if (!includedInPnl) return "Excluded";
  if (status.needsCategory) return "Needs category";
  if (!status.isMapped) return "Unmapped";
  if (statusNeedsSupport(status)) return "Needs support";
  return "Mapped";
}

function buildSupportStatusLabel(status, includedInPnl) {
  if (!includedInPnl) return "Excluded";
  switch (status.supportStatus) {
    case "category_required": return "Needs category";
    case "receipt_missing": return "Needs receipt/support";
    case "business_purpose_needed": return "Business purpose needed";
    case "allocation_needed": return "Needs allocation";
    case "mileage_log_needed": return "Needs mileage log";
    case "home_office_support_needed": return "Needs home-office support";
    case "capital_asset_review_needed": return "Capital asset review";
    case "payer_support_needed": return "Payer support needed";
    case "refund_reversal_match_needed": return "Refund/reversal review";
    case "cpa_review": return "CPA review";
    default: return "Mapped";
  }
}

function buildInclusionStatus(includedInPnl) {
  return includedInPnl ? "Included in business P&L" : "Excluded from business P&L";
}

function buildReviewStatus(row, status) {
  if (!row.includedInPnl) {
    return row.exclusionCode ? "Excluded - review schedule" : "Excluded";
  }
  if (status.needsCategory || !status.isMapped) return "Action needed";
  if (statusNeedsSupport(status) || status.flags.length) return "Needs review";
  return "Mapped";
}

function extractTaxLineCode(label) {
  const value = String(label || "").trim();
  if (!value) return "";
  const lineMatch = value.match(/^(Line\s+[0-9A-Za-z/]+)\b/i);
  if (lineMatch) return lineMatch[1];
  if (/^Cost of goods sold/i.test(value)) return "COGS";
  if (/^Needs category/i.test(value)) return "";
  if (/^Unmapped$/i.test(value)) return "";
  return value;
}

function listReceiptFilenames(receiptsByTxId, txnId) {
  return (receiptsByTxId.get(txnId) || []).map((receipt) => String(receipt?.filename || "").trim()).filter(Boolean);
}

function buildReceiptMap(receipts) {
  const byTxId = new Map();
  for (const receipt of receipts || []) {
    const txId = receipt?.transaction_id || receipt?.transactionId;
    if (!txId) continue;
    const current = byTxId.get(txId) || [];
    current.push(receipt);
    byTxId.set(txId, current);
  }
  return byTxId;
}

function buildCategorySummary(rows) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (!row.includedInPnl) continue;
    const key = [
      row.businessId,
      row.categoryName,
      row.rawType,
      row.taxLine,
      row.taxLineLabel,
      row.mappingStatus,
      row.supportStatus
    ].join("|");
    const current = buckets.get(key) || {
      businessId: row.businessId,
      businessName: row.businessName,
      category: row.categoryName,
      type: row.rawType,
      taxLine: row.taxLine,
      taxLineLabel: row.taxLineLabel,
      mappingStatus: row.mappingStatus,
      supportStatus: row.supportStatus,
      transactionCount: 0,
      amount: 0,
      receiptCount: 0,
      missingReceiptCount: 0,
      reviewFlags: new Set()
    };
    current.transactionCount += 1;
    current.amount += row.rawType === "income" ? row.amount : row.potentialDeductibleAmount;
    current.receiptCount += row.receiptCount;
    if (row.rawType === "expense" && !row.receiptAttached) current.missingReceiptCount += 1;
    row.reviewFlags.forEach((flag) => current.reviewFlags.add(flag));
    buckets.set(key, current);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    businessId: bucket.businessId,
    businessName: bucket.businessName,
    category: bucket.category,
    type: bucket.type,
    taxLine: bucket.taxLine,
    taxLineLabel: bucket.taxLineLabel,
    mappingStatus: bucket.mappingStatus,
    supportStatus: bucket.supportStatus,
    transactionCount: bucket.transactionCount,
    amount: Number(bucket.amount.toFixed(2)),
    receiptCount: bucket.receiptCount,
    missingReceiptCount: bucket.missingReceiptCount,
    reviewFlags: Array.from(bucket.reviewFlags).sort()
  })).sort((left, right) => right.amount - left.amount);
}

function buildNormalizedRow(enrichedTxn, context) {
  const {
    accountsById,
    receiptsByTxId,
    business,
    region,
    province,
    currency
  } = context;
  const category = enrichedTxn.__category || null;
  const status = enrichedTxn.__status;
  const exclusion = enrichedTxn.__exclusionReason || null;
  const receipts = listReceiptFilenames(receiptsByTxId, enrichedTxn.id);
  const receiptCount = receipts.length;
  const receiptAttached = receiptCount > 0;
  const businessName = String(
    business?.name ||
    business?.businessName ||
    context.businessName ||
    ""
  ).trim();
  const categoryName = String(category?.name || "").trim() || (String(enrichedTxn.type || "").toLowerCase() === "income" ? "Imported Income" : "Imported Expense");
  const taxLineLabel = status.needsCategory ? "" : (status.taxLineDisplay || "");
  const taxLine = extractTaxLineCode(taxLineLabel);
  const includedInPnl = !exclusion;
  const personalUsePct = Number(enrichedTxn?.personal_use_pct ?? enrichedTxn?.personalUsePct);
  const potentialDeductibleAmount = includedInPnl
    ? normalizeAmount(enrichedTxn?.__businessAmounts?.deductibleAmount)
    : 0;
  const potentialNonDeductibleAmount = includedInPnl
    ? normalizeAmount(enrichedTxn?.__businessAmounts?.nonDeductibleAmount)
    : normalizeAmount(enrichedTxn?.__businessAmounts?.grossAmount ?? enrichedTxn?.amount);

  const row = {
    id: enrichedTxn.id,
    businessId: business?.id || enrichedTxn.business_id || enrichedTxn.businessId || "",
    businessName,
    date: normalizeIsoDate(enrichedTxn.date),
    description: String(enrichedTxn.description || enrichedTxn.note || "").trim(),
    rawType: String(enrichedTxn.type || "").toLowerCase(),
    amount: normalizeAmount(enrichedTxn.amount),
    signedAmount: resolveSignedAmount(enrichedTxn),
    currency: String(enrichedTxn.currency || currency || "").toUpperCase() || resolveBusinessCurrency(region, currency),
    accountId: enrichedTxn.account_id || enrichedTxn.accountId || "",
    accountName: accountsById[enrichedTxn.account_id || enrichedTxn.accountId]?.name || "",
    categoryId: category?.id || enrichedTxn.category_id || enrichedTxn.categoryId || "",
    categoryName,
    transactionNature: status.nature,
    includedInPnl,
    inclusionStatus: buildInclusionStatus(includedInPnl),
    exclusionCode: exclusion?.label || "",
    exclusionReason: exclusion?.description || "",
    taxJurisdiction: normalizeRegionCode(region),
    taxForm: normalizeRegionCode(region) === "CA" ? "T2125" : "Schedule C",
    taxLine,
    taxLineLabel,
    mappingStatus: buildMappingStatus(status, includedInPnl),
    supportStatus: buildSupportStatusLabel(status, includedInPnl),
    reviewFlags: Array.from(status.flags || []),
    receiptAttached,
    receiptCount,
    receiptFilenames: receipts,
    needsCategory: !!status.needsCategory,
    needsReceipt: !!status.needsReceipt,
    needsBusinessPurpose: !!status.needsBusinessPurpose,
    needsAllocation: !!status.needsAllocation,
    needsMileageLog: !!status.needsMileageLog,
    needsHomeOfficeSupport: !!status.needsHomeOfficeSupport,
    needsCapitalAssetReview: !!status.needsCapitalAssetReview,
    needsFinalConfirmation: !!status.needsFinalConfirmation,
    needsCpaReview: status.flags.includes("RV"),
    potentialDeductibleAmount,
    potentialNonDeductibleAmount,
    payerName: enrichedTxn.payer_name || enrichedTxn.payerName || "",
    taxFormType: enrichedTxn.tax_form_type || enrichedTxn.taxFormType || "",
    sourceAmount: enrichedTxn.source_amount ?? enrichedTxn.sourceAmount ?? "",
    exchangeRate: enrichedTxn.exchange_rate ?? enrichedTxn.exchangeRate ?? "",
    exchangeDate: normalizeIsoDate(enrichedTxn.exchange_date || enrichedTxn.exchangeDate),
    convertedAmount: enrichedTxn.converted_amount ?? enrichedTxn.convertedAmount ?? "",
    taxTreatment: enrichedTxn.tax_treatment || enrichedTxn.taxTreatment || "",
    indirectTaxAmount: enrichedTxn.indirect_tax_amount ?? enrichedTxn.indirectTaxAmount ?? "",
    indirectTaxRecoverable: enrichedTxn.indirect_tax_recoverable === true || enrichedTxn.indirectTaxRecoverable === true,
    personalUsePct: Number.isFinite(personalUsePct) ? personalUsePct : "",
    reviewStatus: buildReviewStatus({ includedInPnl, exclusionCode: exclusion?.label || "" }, status),
    reviewNotes: String(enrichedTxn.review_notes || enrichedTxn.reviewNotes || enrichedTxn.note || "").trim(),
    province,
    supportSummary: status.supportSummary || "",
    internalTransactionId: enrichedTxn.id || ""
  };

  return row;
}

function buildNormalizedExportDataset(options = {}) {
  const transactions = Array.isArray(options.transactions) ? options.transactions : [];
  const accounts = Array.isArray(options.accounts) ? options.accounts : [];
  const categories = Array.isArray(options.categories) ? options.categories : [];
  const receipts = Array.isArray(options.receipts) ? options.receipts : [];
  const vehicleCosts = Array.isArray(options.vehicleCosts) ? options.vehicleCosts : [];
  const business = options.business || {};
  const region = normalizeRegionCode(options.region || business.region);
  const province = options.province || business.province || "";
  const currency = resolveBusinessCurrency(region, options.currency || business.currency);

  const classified = summarizeExportTransactions(transactions, categories, {
    region,
    receipts,
    supportArtifactMap: options.supportArtifactMap,
    vehicleClaimMap: options.vehicleClaimMap,
    capitalAssetTxMap: options.capitalAssetTxMap,
    gstHstRegistered: business.gst_hst_registered === true || options.gstHstRegistered === true,
    gstHstMethod: business.gst_hst_method || options.gstHstMethod || "regular"
  });

  const receiptsByTxId = buildReceiptMap(receipts);
  const accountsById = mapById(accounts);
  const context = {
    accountsById,
    receiptsByTxId,
    business,
    businessName: options.businessName,
    region,
    province,
    currency
  };

  const includedRows = classified.included.map((txn) => buildNormalizedRow(txn, context));
  const excludedRows = classified.excluded.map((txn) => buildNormalizedRow(txn, context));
  const rows = [...includedRows, ...excludedRows].sort((left, right) => {
    const dateCompare = String(left.date || "").localeCompare(String(right.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });

  const receiptSummary = computeReceiptCoverage(classified.included, receipts, options.supportArtifactMap);
  const mappingSummary = computeTaxLineSummary(classified.included, categories, region);
  const supportSummary = buildReviewInsights(classified.included, categories, receipts, {
    excluded: classified.excluded,
    supportArtifactMap: options.supportArtifactMap
  });
  const profitTotals = calculateTotals(classified.included);
  const categorySummary = buildCategorySummary(rows);

  const needsCategoryAmount = includedRows
    .filter((row) => row.mappingStatus === "Needs category")
    .reduce((sum, row) => sum + (row.rawType === "income" ? row.amount : row.potentialDeductibleAmount), 0);

  return {
    rows,
    includedRows,
    excludedRows,
    categorySummary,
    receiptSummary,
    mappingSummary,
    supportSummary,
    totals: {
      grossIncome: profitTotals.income,
      totalExpenses: profitTotals.expenses,
      netProfit: profitTotals.netProfit,
      includedCount: includedRows.length,
      excludedCount: excludedRows.length,
      needsCategoryCount: supportSummary.needsCategoryCount,
      needsCategoryAmount: Number(needsCategoryAmount.toFixed(2)),
      mappedSupportCount: mappingSummary.mapped_review_count,
      mappedSupportAmount: mappingSummary.mapped_review_total,
      trulyUnmappedCount: mappingSummary.unmapped_count,
      trulyUnmappedAmount: mappingSummary.unmapped_total,
      missingReceiptCount: receiptSummary.missing,
      vehicleItemCount: supportSummary.vehicleCount,
      mealItemCount: supportSummary.mealsCount,
      phoneAllocationCount: supportSummary.phoneAllocationCount
    },
    metadata: {
      businessId: business.id || options.businessId || "",
      businessName: String(business.name || options.businessName || "").trim(),
      region,
      province,
      currency,
      startDate: options.startDate || "",
      endDate: options.endDate || "",
      taxForm: region === "CA" ? "T2125" : "Schedule C",
      vehicleCostCount: vehicleCosts.length
    }
  };
}

module.exports = {
  buildNormalizedExportDataset
};
