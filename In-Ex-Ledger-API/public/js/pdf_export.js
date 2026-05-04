const CA_TAX_RATES = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15,
  NT: 0.05, NU: 0.05, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, YT: 0.05
};

class PdfCanvas {
  constructor() {
    this.commands = [];
  }

  text(x, y, text, size = 11, font = 'F1') {
    const fx = Number.isFinite(x) ? x.toFixed(2) : '0.00';
    const fy = Number.isFinite(y) ? y.toFixed(2) : '0.00';
    this.commands.push('BT');
    this.commands.push(`/${font} ${size} Tf`);
    this.commands.push(`1 0 0 1 ${fx} ${fy} Tm`);
    this.commands.push(`${pdfLiteral(text)} Tj`);
    this.commands.push('ET');
  }

  addFooter(pageNumber, totalPages, footerText) {
    this.text(40, 28, footerText || `Page ${pageNumber}/${totalPages}`, 8);
  }

  build() {
    return this.commands.join('\n');
  }
}

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u00df/g, 'ss')
    .replace(/\u00c6/g, 'AE')
    .replace(/\u00e6/g, 'ae')
    .replace(/\u0152/g, 'OE')
    .replace(/\u0153/g, 'oe')
    .replace(/\u00d8/g, 'O')
    .replace(/\u00f8/g, 'o')
    .replace(/\u0141/g, 'L')
    .replace(/\u0142/g, 'l')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '?');
}

function escapePdfLiteral(text) {
  return normalizePdfText(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\n/g, '\\n');
}

function pdfLiteral(text) {
  return `(${escapePdfLiteral(text)})`;
}

function resolvePdfTaxRate(region, province) {
  const normalizedRegion = String(region || '').toLowerCase();
  const normalizedProvince = String(province || '').toUpperCase();
  if (normalizedRegion === 'ca') return CA_TAX_RATES[normalizedProvince] || 0.05;
  return 0.24;
}

function calculateTotals(transactions, region, province) {
  let income = 0;
  let expenses = 0;
  (transactions || []).forEach((txn) => {
    const amount = Math.abs(Number(txn.amount) || 0);
    if (String(txn.type || '').toLowerCase() === 'income') income += amount;
    else expenses += amount;
  });
  const netProfit = income - expenses;
  return {
    income,
    expenses,
    netProfit,
    estimatedTax: Math.max(0, netProfit) * resolvePdfTaxRate(region, province)
  };
}

function formatCurrencyForPdf(value, currency) {
  const formatter = new Intl.NumberFormat(currency === 'CAD' ? 'en-CA' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(Number(value) || 0);
}

function formatDistance(value) {
  return Number(value || 0).toFixed(2);
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function mapByKey(items, key) {
  return (items || []).reduce((acc, item) => {
    if (item && item[key]) acc[item[key]] = item;
    return acc;
  }, {});
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function wrapText(text, maxLength) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function safeValue(value, fallback = 'Not specified') {
  const text = String(value || '').trim();
  return text || fallback;
}

function formatReportTimestamp(rawValue) {
  const date = rawValue ? new Date(rawValue) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildReportId(rawValue) {
  if (rawValue) return String(rawValue);
  const stamp = formatReportTimestamp(new Date()).replace(/[-: ]/g, '').slice(0, 8);
  const random = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `EXP-${stamp}-${random}`;
}

function formatJurisdiction(region, province) {
  const normalizedRegion = String(region || '').toUpperCase() === 'CA' ? 'CA' : 'US';
  const normalizedProvince = String(province || '').toUpperCase();
  return normalizedProvince ? `${normalizedRegion}-${normalizedProvince}` : normalizedRegion;
}

function isSpecialReviewCategory(categoryName, taxMapping) {
  return /(meal|travel|vehicle|auto|fuel|car|mileage|home office)/i.test(`${categoryName} ${taxMapping}`);
}

function getTransactionFlags(txn, category) {
  const flags = [];
  const taxTreatment = String(txn.tax_treatment || txn.taxTreatment || '').toLowerCase();
  const reviewStatus = String(txn.review_status || txn.reviewStatus || '').toLowerCase();
  const categoryName = category?.name || '';
  const taxMapping = category?.tax_label || category?.taxLabel || '';
  if (!txn.category_id && !txn.categoryId) flags.push('Uncategorized');
  if (!String(txn.description || '').trim()) flags.push('Missing description');
  if (String(txn.type || '').toLowerCase() !== 'income' && Number(txn.amount) < 0) flags.push('Negative expense');
  if (taxTreatment === 'split_use' || Number(txn.personal_use_pct ?? txn.personalUsePct) > 0) flags.push('Mixed-use');
  if (reviewStatus && reviewStatus !== 'ready') flags.push('Review');
  if (Number(txn.indirect_tax_amount ?? txn.indirectTaxAmount) > 0) flags.push('Indirect tax');
  if (String(txn.currency || '').toUpperCase() && String(txn.currency || '').toUpperCase() !== 'USD' && String(txn.currency || '').toUpperCase() !== 'CAD') flags.push('FX');
  if (isSpecialReviewCategory(categoryName, taxMapping)) flags.push('Special category');
  return Array.from(new Set(flags));
}

function normalizeDuplicateKey(txn) {
  const description = String(txn.description || txn.note || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const amount = Math.abs(Number(txn.amount) || 0).toFixed(2);
  return `${txn.date || ''}|${amount}|${description}`;
}

function buildReviewInsights(transactions, categories) {
  const categoryMap = mapByKey(categories, 'id');
  const duplicateMap = new Map();
  (transactions || []).forEach((txn) => {
    const key = normalizeDuplicateKey(txn);
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  });

  const expenseTransactions = (transactions || []).filter((txn) => String(txn.type || '').toLowerCase() !== 'income');
  const receiptLinkedCount = expenseTransactions.filter((txn) => txn.receipt_id || txn.receiptId).length;

  const samples = [];
  let uncategorizedCount = 0;
  let missingDescriptionCount = 0;
  let duplicateCount = 0;
  let negativeExpenseCount = 0;
  let mixedUseCount = 0;
  let specialCategoryCount = 0;
  let reviewFlagCount = 0;

  (transactions || []).forEach((txn) => {
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const flags = getTransactionFlags(txn, category);
    if (!txn.category_id && !txn.categoryId) uncategorizedCount += 1;
    if (!String(txn.description || '').trim()) missingDescriptionCount += 1;
    if (duplicateMap.get(normalizeDuplicateKey(txn)) > 1) duplicateCount += 1;
    if (String(txn.type || '').toLowerCase() !== 'income' && Number(txn.amount) < 0) negativeExpenseCount += 1;
    if (flags.includes('Mixed-use')) mixedUseCount += 1;
    if (flags.includes('Special category')) specialCategoryCount += 1;
    if (flags.length) reviewFlagCount += 1;
    if (flags.length && samples.length < 6) {
      samples.push({
        reason: flags.join(', '),
        description: truncateText(txn.description || '(No description)', 36),
        amount: Math.abs(Number(txn.amount) || 0)
      });
    }
  });

  return {
    transactionCount: (transactions || []).length,
    expenseTransactionCount: expenseTransactions.length,
    uncategorizedCount,
    missingDescriptionCount,
    duplicateCount,
    negativeExpenseCount,
    mixedUseCount,
    specialCategoryCount,
    reviewFlagCount,
    receiptLinkedCount,
    missingReceiptCount: Math.max(0, expenseTransactions.length - receiptLinkedCount),
    receiptCoverageText: `${receiptLinkedCount} of ${expenseTransactions.length || 0}`,
    samples
  };
}

function buildCategoryBuckets(transactions, categories, labels, currency) {
  const categoryMap = mapByKey(categories, 'id');
  const buckets = new Map();

  (transactions || []).forEach((txn) => {
    const categoryId = txn.category_id || txn.categoryId || '';
    const category = categoryMap[categoryId] || null;
    const categoryName = safeValue(category?.name, 'Uncategorized');
    const taxMapping = safeValue(category?.tax_label || category?.taxLabel, 'Unmapped');
    const bucketKey = `${categoryId || 'uncategorized'}::${String(txn.type || 'expense').toLowerCase()}`;
    const existing = buckets.get(bucketKey) || {
      categoryName,
      taxMapping,
      amount: 0,
      needsReview: false,
      needsAction: false,
      hasSpecialCategory: false,
      type: String(txn.type || 'expense').toLowerCase()
    };
    existing.amount += Math.abs(Number(txn.amount) || 0);
    if (taxMapping === 'Unmapped' || categoryName === 'Uncategorized') existing.needsAction = true;
    if (getTransactionFlags(txn, category).length) existing.needsReview = true;
    if (isSpecialReviewCategory(categoryName, taxMapping)) existing.hasSpecialCategory = true;
    buckets.set(bucketKey, existing);
  });

  return Array.from(buckets.values())
    .map((bucket) => ({
      categoryName: bucket.type === 'income' ? `${bucket.categoryName} (income)` : bucket.categoryName,
      taxMapping: bucket.taxMapping,
      amount: formatCurrencyForPdf(bucket.amount, currency),
      sortAmount: bucket.amount,
      reviewStatus: bucket.needsAction
        ? labels.review_action_needed
        : (bucket.needsReview || bucket.hasSpecialCategory ? labels.review_review : labels.review_ok)
    }))
    .sort((a, b) => b.sortAmount - a.sortAmount);
}

function buildKeyValueRows(canvas, x, startY, rows, size = 10, gap = 16) {
  let y = startY;
  rows.forEach(([label, value]) => {
    canvas.text(x, y, `${label}: ${value}`, size);
    y -= gap;
  });
  return y;
}

function buildIdentityPage(data) {
  const {
    labels, totals, currency, legalName, operatingName, taxId, naics, businessName,
    startDate, endDate, reportId, generatedAt, accountingBasis, region, province,
    reviewInsights, isSecure, categoryPreviewEntries = []
  } = data;

  const canvas = new PdfCanvas();
  let y = 760;
  canvas.text(40, y, labels.report_title, 18, 'F2'); y -= 20;
  canvas.text(40, y, isSecure ? labels.report_subtitle_secure : labels.report_subtitle_redacted, 10); y -= 18;
  canvas.text(40, y, isSecure ? labels.badge_secure : labels.badge_redacted, 11, 'F2');

  canvas.text(40, 690, labels.entity_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 670, [
    [labels.legal_name, safeValue(legalName || businessName)],
    [labels.business_name, safeValue(operatingName)],
    [isSecure ? labels.tax_id : labels.tax_id_redacted, isSecure ? safeValue(taxId) : labels.tax_id_withheld],
    [labels.business_activity_code, safeValue(naics)],
    [labels.jurisdiction, formatJurisdiction(region, province)]
  ]);

  canvas.text(330, 690, labels.reporting_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 670, [
    [labels.reporting_period, `${startDate} to ${endDate}`],
    [labels.accounting_basis, safeValue(accountingBasis, labels.accounting_basis_unspecified)],
    [labels.currency, currency],
    [labels.export_created, formatReportTimestamp(generatedAt)],
    [labels.export_id, reportId],
    [labels.prepared_from, labels.prepared_from_value]
  ]);

  canvas.text(40, 555, labels.financial_summary_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 535, [
    [labels.gross_income, formatCurrencyForPdf(totals.income, currency)],
    [labels.total_expenses, formatCurrencyForPdf(totals.expenses, currency)],
    [labels.net_profit, formatCurrencyForPdf(totals.netProfit, currency)],
    [labels.transaction_count, String(reviewInsights.transactionCount)]
  ]);

  canvas.text(330, 555, labels.tax_estimate_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 535, [
    [labels.estimated_tax, formatCurrencyForPdf(totals.estimatedTax, currency)]
  ]);
  wrapText(labels.estimated_tax_disclaimer, 34).forEach((line, index) => {
    canvas.text(330, 519 - (index * 14), line, 9);
  });

  canvas.text(40, 430, labels.review_flags_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 410, [
    [labels.uncategorized_transactions, String(reviewInsights.uncategorizedCount)],
    [labels.review_flagged_transactions, String(reviewInsights.reviewFlagCount)],
    ['Possible duplicate transactions', String(reviewInsights.duplicateCount)],
    [labels.receipt_coverage, reviewInsights.receiptCoverageText]
  ]);

  if (categoryPreviewEntries.length) {
    canvas.text(40, 318, labels.category_breakdown_title, 12, 'F2');
    canvas.text(40, 296, labels.col_category, 9, 'F2');
    canvas.text(220, 296, labels.col_tax_mapping, 9, 'F2');
    canvas.text(470, 296, labels.col_amount, 9, 'F2');
    canvas.text(540, 296, labels.col_review_status, 9, 'F2');
    let categoryY = 276;
    categoryPreviewEntries.forEach((row) => {
      canvas.text(40, categoryY, truncateText(row.categoryName, 28), 8);
      canvas.text(220, categoryY, truncateText(row.taxMapping, 40), 8);
      canvas.text(470, categoryY, row.amount, 8);
      canvas.text(540, categoryY, row.reviewStatus, 8);
      categoryY -= 14;
    });
  }

  return canvas;
}

function buildCategoryPages(transactions, categories, currency, labels, embeddedCount = 0) {
  const entries = buildCategoryBuckets(transactions, categories, labels, currency);
  const remainingEntries = entries.slice(embeddedCount);
  if (!remainingEntries.length) {
    if (entries.length) return [];
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16, 'F2');
    canvas.text(40, 720, labels.no_category_data, 11);
    return [canvas];
  }

  return chunkArray(remainingEntries, 22).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16, 'F2');
    canvas.text(40, 730, labels.col_category, 10, 'F2');
    canvas.text(220, 730, labels.col_tax_mapping, 10, 'F2');
    canvas.text(470, 730, labels.col_amount, 10, 'F2');
    canvas.text(540, 730, labels.col_review_status, 10, 'F2');
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, truncateText(row.categoryName, 28), 9);
      canvas.text(220, y, truncateText(row.taxMapping, 40), 9);
      canvas.text(470, y, row.amount, 9);
      canvas.text(540, y, row.reviewStatus, 9);
      y -= 18;
    });
    return canvas;
  });
}

function buildTransactionPages(transactions, accounts, categories, currency, labels) {
  const accountMap = mapByKey(accounts, 'id');
  const categoryMap = mapByKey(categories, 'id');
  const sorted = (transactions || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!sorted.length) {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16, 'F2');
    canvas.text(40, 720, labels.no_transaction_data, 11);
    return [canvas];
  }

  const rows = sorted.map((txn) => {
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const account = accountMap[txn.account_id || txn.accountId] || null;
    const flags = getTransactionFlags(txn, category);
    return {
      date: txn.date || '',
      id: truncateText(txn.id || '', 10),
      payeeMemo: truncateText(txn.description || txn.note || '(No description)', 25),
      accountCategory: truncateText(`${safeValue(account?.name, '-')} / ${safeValue(category?.name, 'Uncategorized')}`, 24),
      taxMapping: truncateText(safeValue(category?.tax_label || category?.taxLabel, 'Unmapped'), 18),
      amount: formatCurrencyForPdf(Math.abs(Number(txn.amount) || 0), currency),
      flag: flags.length ? truncateText(flags.join(', '), 18) : labels.review_ok,
      detail: `Type: ${String(txn.type || 'expense')} | Receipt: ${txn.receipt_id || txn.receiptId ? 'Yes' : 'No'}`
    };
  });

  return chunkArray(rows, 12).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16, 'F2');
    canvas.text(40, 732, labels.col_date, 10, 'F2');
    canvas.text(95, 732, labels.col_tx_id, 10, 'F2');
    canvas.text(150, 732, labels.col_payee_memo, 10, 'F2');
    canvas.text(305, 732, labels.col_account_category, 10, 'F2');
    canvas.text(430, 732, labels.col_tax_map_short, 10, 'F2');
    canvas.text(515, 732, labels.col_amount, 10, 'F2');
    canvas.text(560, 732, labels.col_flag, 10, 'F2');
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.date, 9);
      canvas.text(95, y, row.id, 9);
      canvas.text(150, y, row.payeeMemo, 9);
      canvas.text(305, y, row.accountCategory, 9);
      canvas.text(430, y, row.taxMapping, 9);
      canvas.text(515, y, row.amount, 9);
      canvas.text(560, y, row.flag, 8);
      y -= 12;
      canvas.text(150, y, truncateText(row.detail, 60), 8);
      y -= 18;
    });
    return canvas;
  });
}

function buildReceiptsPages(receipts, transactions, labels) {
  const txMap = mapByKey(transactions, 'id');
  const rows = (receipts || []).map((receipt) => {
    const txnId = receipt.transaction_id || receipt.transactionId;
    const txn = txMap[txnId];
    if (!txn) return null;
    return {
      receiptId: receipt.id || '',
      txDate: txn.date || '',
      txDescription: truncateText(txn.description || '(No description)', 28),
      fileName: truncateText(receipt.filename || 'Not specified', 22)
    };
  }).filter(Boolean);

  if (!rows.length) return [];

  return chunkArray(rows, 22).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.receipts_index_title, 16);
    canvas.text(40, 730, 'Receipt ID', 10);
    canvas.text(150, 730, 'Tx Date', 10);
    canvas.text(240, 730, 'Tx Description', 10);
    canvas.text(430, 730, 'File Name', 10);
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.receiptId, 9);
      canvas.text(150, y, row.txDate, 9);
      canvas.text(240, y, row.txDescription, 9);
      canvas.text(430, y, row.fileName, 9);
      y -= 16;
    });
    return canvas;
  });
}

function buildMileagePage(mileage, labels) {
  if (!Array.isArray(mileage) || !mileage.length) return [];
  const totalMiles = mileage.reduce((sum, row) => sum + Math.abs(Number(row.miles) || 0), 0);
  const totalKm = mileage.reduce((sum, row) => sum + Math.abs(Number(row.km) || 0), 0);
  const totalDistance = mileage.reduce((sum, row) => {
    const start = Number(row.odometer_start);
    const end = Number(row.odometer_end);
    return Number.isFinite(start) && Number.isFinite(end) ? sum + Math.abs(end - start) : sum;
  }, 0);
  const businessPct = totalDistance > 0 ? (totalKm / totalDistance) * 100 : null;

  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.mileage_summary_title, 16);
  let y = 724;
  if (totalMiles > 0) { canvas.text(40, y, `Total business miles: ${formatDistance(totalMiles)} mi`, 11); y -= 18; }
  if (totalKm > 0) { canvas.text(40, y, `Total business kilometers: ${formatDistance(totalKm)} km`, 11); y -= 18; }
  if (businessPct !== null) { canvas.text(40, y, `Business-use percentage: ${businessPct.toFixed(1)}%`, 11); y -= 18; }
  y -= 6;
  canvas.text(40, y, labels.mileage_note_csv, 10);
  return [canvas];
}

function buildReviewAndDisclosurePage(transactions, categories, receipts, labels, currency, region, reviewInsights) {
  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.review_items_title, 16);

  let y = 730;
  const summaryRows = [
    [labels.review_uncategorized, reviewInsights.uncategorizedCount],
    [labels.review_missing_description, reviewInsights.missingDescriptionCount],
    [labels.review_possible_duplicates, reviewInsights.duplicateCount],
    [labels.review_negative_expenses, reviewInsights.negativeExpenseCount],
    [labels.review_mixed_use, reviewInsights.mixedUseCount],
    [labels.review_special_categories, reviewInsights.specialCategoryCount],
    [labels.review_missing_receipts, reviewInsights.missingReceiptCount]
  ];

  let hasAnyReviewItem = false;
  summaryRows.forEach(([label, count]) => {
    if (count > 0) hasAnyReviewItem = true;
    canvas.text(40, y, `${label}: ${count}`, 10);
    y -= 16;
  });

  if (!hasAnyReviewItem) {
    canvas.text(40, y - 8, labels.review_items_none, 10);
    y -= 28;
  } else {
    y -= 8;
    canvas.text(40, y, labels.review_samples_title, 11);
    y -= 18;
    (reviewInsights.samples || []).slice(0, 5).forEach((sample) => {
      canvas.text(40, y, truncateText(sample.reason, 26), 9);
      canvas.text(210, y, truncateText(sample.description, 32), 9);
      canvas.text(480, y, formatCurrencyForPdf(sample.amount, currency), 9);
      y -= 15;
    });
  }

  y -= 12;
  canvas.text(40, y, labels.disclosure_title, 11);
  y -= 18;
  wrapText(labels.disclosure_body, 86).forEach((line) => {
    canvas.text(40, y, line, 9);
    y -= 13;
  });

  return [canvas];
}

function buildSupportPages(receipts, transactions, mileage, labels, currency, reviewInsights) {
  const txMap = mapByKey(transactions, 'id');
  const receiptRows = (receipts || []).map((receipt) => {
    const txnId = receipt.transaction_id || receipt.transactionId;
    const txn = txMap[txnId];
    if (!txn) return null;
    return {
      receiptId: truncateText(receipt.id || '', 28),
      txDate: normalizePdfDate(txn.date),
      txDescription: truncateText(txn.description || '(No description)', 26),
      fileName: truncateText(receipt.filename || 'Not specified', 20)
    };
  }).filter(Boolean);

  const pages = [];
  let canvas = new PdfCanvas();
  let y = 760;

  const startPage = () => {
    canvas = new PdfCanvas();
    y = 760;
    canvas.text(40, y, 'Supporting Schedules and Review', 16, 'F2');
    y -= 28;
  };

  const pushPage = () => {
    pages.push(canvas);
    startPage();
  };

  const ensureSpace = (needed) => {
    if (y - needed < 60) {
      pushPage();
    }
  };

  startPage();

  if (receiptRows.length) {
    canvas.text(40, y, labels.receipts_index_title, 12, 'F2');
    y -= 20;
    canvas.text(40, y, 'Receipt ID', 9, 'F2');
    canvas.text(170, y, 'Tx Date', 9, 'F2');
    canvas.text(250, y, 'Tx Description', 9, 'F2');
    canvas.text(430, y, 'File Name', 9, 'F2');
    y -= 18;
    receiptRows.forEach((row) => {
      ensureSpace(18);
      canvas.text(40, y, row.receiptId, 8);
      canvas.text(170, y, row.txDate, 8);
      canvas.text(250, y, row.txDescription, 8);
      canvas.text(430, y, row.fileName, 8);
      y -= 14;
    });
    y -= 10;
  }

  if (Array.isArray(mileage) && mileage.length) {
    const totalMiles = mileage.reduce((sum, row) => sum + Math.abs(Number(row.miles) || 0), 0);
    const totalKm = mileage.reduce((sum, row) => sum + Math.abs(Number(row.km) || 0), 0);
    const totalDistance = mileage.reduce((sum, row) => {
      const start = Number(row.odometer_start);
      const end = Number(row.odometer_end);
      return Number.isFinite(start) && Number.isFinite(end) ? sum + Math.abs(end - start) : sum;
    }, 0);
    const businessPct = totalDistance > 0 ? (totalKm / totalDistance) * 100 : null;

    ensureSpace(84);
    canvas.text(40, y, labels.mileage_summary_title, 12, 'F2');
    y -= 20;
    if (totalMiles > 0) { canvas.text(40, y, `Total business miles: ${formatDistance(totalMiles)} mi`, 9); y -= 14; }
    if (totalKm > 0) { canvas.text(40, y, `Total business kilometers: ${formatDistance(totalKm)} km`, 9); y -= 14; }
    if (businessPct !== null) { canvas.text(40, y, `Business-use percentage: ${businessPct.toFixed(1)}%`, 9); y -= 14; }
    canvas.text(40, y, labels.mileage_note_csv, 9);
    y -= 18;
  }

  ensureSpace(170);
  canvas.text(40, y, labels.review_items_title, 12, 'F2');
  y -= 20;
  [
    [labels.review_uncategorized, reviewInsights.uncategorizedCount],
    [labels.review_missing_description, reviewInsights.missingDescriptionCount],
    [labels.review_possible_duplicates, reviewInsights.duplicateCount],
    [labels.review_negative_expenses, reviewInsights.negativeExpenseCount],
    [labels.review_mixed_use, reviewInsights.mixedUseCount],
    [labels.review_special_categories, reviewInsights.specialCategoryCount],
    [labels.review_missing_receipts, reviewInsights.missingReceiptCount]
  ].forEach(([label, count]) => {
    canvas.text(40, y, `${label}: ${count}`, 9);
    y -= 14;
  });

  if ((reviewInsights.samples || []).length) {
    y -= 6;
    canvas.text(40, y, labels.review_samples_title, 10, 'F2');
    y -= 16;
    reviewInsights.samples.slice(0, 5).forEach((sample) => {
      ensureSpace(16);
      canvas.text(40, y, truncateText(sample.reason, 26), 8);
      canvas.text(210, y, truncateText(sample.description, 32), 8);
      canvas.text(480, y, formatCurrencyForPdf(sample.amount, currency), 8);
      y -= 13;
    });
  } else {
    y -= 6;
    canvas.text(40, y, labels.review_items_none, 9);
    y -= 16;
  }

  ensureSpace(80);
  canvas.text(40, y, labels.disclosure_title, 10, 'F2');
  y -= 16;
  wrapText(labels.disclosure_body, 88).forEach((line) => {
    ensureSpace(12);
    canvas.text(40, y, line, 8);
    y -= 12;
  });

  pages.push(canvas);
  return pages;
}

function buildFooterText(labels, reportId, generatedAt, isSecure, pageNumber, totalPages) {
  const confidentiality = isSecure ? labels.footer_confidential : labels.badge_redacted;
  return truncateText(`${labels.footer_brand} | ${confidentiality} | ${reportId} | ${formatReportTimestamp(generatedAt)} | Page ${pageNumber}/${totalPages}`, 110);
}

function buildObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function createPdfBytes(pageContents) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageEntries = [];
  let nextId = 5;

  pageContents.forEach((content) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageEntries.push({ contentId, pageId, content });
  });

  objects.push(buildObject(1, '<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(buildObject(2, `<< /Type /Pages /Count ${pageEntries.length} /Kids [${pageEntries.map((entry) => `${entry.pageId} 0 R`).join(' ')}] >>`));
  objects.push(buildObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  objects.push(buildObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'));

  pageEntries.forEach((entry) => {
    const length = encoder.encode(entry.content).length;
    objects.push(buildObject(entry.contentId, `<< /Length ${length} >>\nstream\n${entry.content}\nendstream`));
    objects.push(buildObject(entry.pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${entry.contentId} 0 R >>`));
  });

  const parts = ['%PDF-1.3\n'];
  const offsets = [0];
  let offset = encoder.encode(parts[0]).length;
  objects.forEach((obj) => {
    offsets.push(offset);
    parts.push(obj);
    offset += encoder.encode(obj).length;
  });

  const xrefStart = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push('0000000000 65535 f \n');
  offsets.slice(1).forEach((value) => {
    parts.push(`${String(value).padStart(10, '0')} 00000 n \n`);
  });
  parts.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Uint8Array(new TextEncoder().encode(parts.join('')));
}

function buildPdfExport(options) {
  const {
    transactions = [],
    accounts = [],
    categories = [],
    receipts = [],
    mileage = [],
    startDate = '',
    endDate = '',
    exportLang = 'en',
    currency = 'USD',
    legalName = '',
    businessName = '',
    operatingName = '',
    taxId = '',
    naics = '',
    region = 'us',
    province = '',
    generatedAt,
    reportId,
    accountingBasis
  } = options;

  const labels = typeof getPdfLabels === 'function' ? getPdfLabels(exportLang) : {};
  const effectiveGeneratedAt = generatedAt || new Date().toISOString();
  const effectiveReportId = buildReportId(reportId);
  const totals = calculateTotals(transactions, region, province);
  const reviewInsights = buildReviewInsights(transactions, categories);
  const isSecure = Boolean(String(taxId || '').trim());
  const categoryEntries = buildCategoryBuckets(transactions, categories, labels, currency);
  const categoryPreviewEntries = categoryEntries.slice(0, 6);

  const canvases = [
    buildIdentityPage({
      labels,
      totals,
      currency,
      legalName,
      operatingName,
      taxId,
      naics,
      businessName,
      startDate,
      endDate,
      reportId: effectiveReportId,
      generatedAt: effectiveGeneratedAt,
      accountingBasis,
      region,
      province,
      reviewInsights,
      isSecure,
      categoryPreviewEntries
    }),
    ...buildCategoryPages(transactions, categories, currency, labels, categoryPreviewEntries.length),
    ...buildTransactionPages(transactions, accounts, categories, currency, labels),
    ...buildSupportPages(receipts, transactions, mileage, labels, currency, reviewInsights)
  ];

  const totalPages = canvases.length;
  const pageContents = canvases.map((canvas, index) => {
    canvas.addFooter(index + 1, totalPages, buildFooterText(labels, effectiveReportId, effectiveGeneratedAt, isSecure, index + 1, totalPages));
    return canvas.build();
  });

  return createPdfBytes(pageContents);
}
