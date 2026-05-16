'use strict';

const PDF_LABELS = {
  en: {
    report_title: 'Bookkeeping Export for CPA Review',
    report_subtitle_secure: 'Contains taxpayer identification provided for confidential professional use.',
    report_subtitle_redacted: 'Taxpayer identification withheld for general sharing.',
    badge_secure: 'Secure Export',
    badge_redacted: 'Redacted Export',
    entity_section_title: 'Entity Summary',
    reporting_section_title: 'Reporting Metadata',
    financial_summary_title: 'Financial Summary',
    tax_estimate_title: 'Tax Review Status',
    review_flags_title: 'Quick Review Flags',
    legal_name: 'Legal business name',
    business_name: 'Operating name (DBA)',
    tax_id: 'Tax ID',
    tax_id_redacted: 'Tax ID (redacted)',
    tax_id_withheld: 'Withheld',
    reporting_period: 'Reporting period',
    business_activity_code: 'Business activity code',
    jurisdiction: 'Jurisdiction',
    accounting_basis: 'Accounting basis',
    accounting_basis_unspecified: 'Not specified',
    currency: 'Currency',
    export_created: 'Export created',
    export_id: 'Export ID',
    prepared_from: 'Prepared from',
    prepared_from_value: 'InEx Ledger',
    gross_income: 'Gross income',
    total_expenses: 'Total expenses',
    net_profit: 'Net profit / loss',
    transaction_count: 'Transactions included',
    uncategorized_transactions: 'Uncategorized transactions',
    review_flagged_transactions: 'Review-flagged transactions',
    receipt_coverage: 'Receipt coverage',
    estimated_tax: 'Tax calculation',
    estimated_tax_disclaimer: 'Automatic tax estimation is disabled. Review income, expenses, and jurisdiction-specific obligations with your accountant before filing.',
    category_breakdown_title: 'Category Totals and Suggested Tax Mapping',
    no_category_data: 'No category totals were recorded for this reporting period.',
    transaction_log_title: 'Detailed Transaction Ledger',
    no_transaction_data: 'No transactions were recorded for this reporting period.',
    receipts_index_title: 'Receipt Support Index',
    mileage_summary_title: 'Mileage Summary',
    mileage_note_csv: 'Full detailed mileage log remains available in CSV export.',
    review_items_title: 'Review Items and Exceptions',
    review_items_none: 'No review items were identified from the current bookkeeping rules.',
    review_uncategorized: 'Uncategorized transactions',
    review_missing_description: 'Transactions missing description',
    review_possible_duplicates: 'Possible duplicate transactions',
    review_negative_expenses: 'Negative expense entries',
    review_mixed_use: 'Mixed-use or personal-use entries',
    review_special_categories: 'Meals, auto, travel, or home-office items',
    review_missing_receipts: 'Expense transactions without receipt attachment',
    review_samples_title: 'Sample items for review',
    disclosure_title: 'Disclosure',
    disclosure_body: 'This report was prepared from bookkeeping records maintained in InEx Ledger for the reporting period shown. It is intended as a supporting workpaper for accounting or tax preparation review. It is not a filed tax return and may include user-entered data subject to professional review.',
    us_report_title: 'US CPA Workpaper Export',
    ca_report_title: 'Canada CPA Workpaper Export',
    us_report_subtitle: 'Prepared for Schedule C and related IRS bookkeeping review.',
    ca_report_subtitle: 'Prepared for T2125 and related CRA bookkeeping review.',
    validation_title: 'Export Requirements',
    validation_blocked_prefix: 'Export blocked due to missing required business details:',
    us_tax_profile_title: 'US Filing Profile',
    ca_tax_profile_title: 'Canada Filing Profile',
    address: 'Business address',
    fiscal_year_start: 'Fiscal year start',
    province: 'Province',
    accounting_method: 'Accounting method',
    material_participation: 'Material participation',
    gst_hst_registered: 'GST/HST registered',
    gst_hst_number: 'GST/HST number',
    gst_hst_method: 'GST/HST accounting method',
    tax_packet_title_us: 'US Schedule C Workpaper Summary',
    tax_packet_title_ca: 'Canada T2125 Workpaper Summary',
    tax_packet_payer_title_us: 'Income by payer (1099 reconciliation)',
    tax_packet_payer_title_ca: 'Income by payer (T4A reconciliation)',
    tax_packet_line_title_us: 'Totals by Schedule C mapping',
    tax_packet_line_title_ca: 'Totals by T2125 mapping',
    transfers_excluded_title: 'Excluded from income and expense totals',
    transfers_excluded_note: 'Transfer-like items, payroll wages, and personal-use items should be reviewed separately and are not treated as business P&L support.',
    toc_title: 'Workpaper Contents',
    profile_note_us: 'Schedule C support requires the business header, material participation, and payer reconciliation to be reviewed before filing.',
    profile_note_ca: 'T2125 support requires province, fiscal year, GST/HST profile, and net-of-tax treatment to be reviewed before filing.',
    tax_rules_title: 'Jurisdiction Rules Snapshot',
    tax_rules_us_threshold: '1099-NEC threshold',
    tax_rules_ca_threshold: 'T4A support threshold',
    tax_rules_meals: 'Meals and entertainment',
    tax_rules_vehicle: 'Vehicle support',
    tax_rules_receipts: 'Receipt rule',
    tax_rules_gst: 'GST/HST treatment',
    exclusions_schedule_title: 'Transfers, Payroll, and Personal Review Schedule',
    exclusions_reason: 'Reason',
    exclusions_booked_amount: 'Booked amount',
    deductions_title_us: 'Deductibility Adjustments and IRS Warnings',
    deductions_title_ca: 'Deductibility Adjustments and CRA Warnings',
    deduction_gross: 'Gross',
    deduction_tax_component: 'Tax',
    deduction_net: 'Net',
    deduction_allowed: 'Deductible',
    deduction_disallowed: 'Non-deductible',
    deduction_warning: 'Warning',
    section_continued: 'continued',
    type_income: 'Income',
    type_expense: 'Expense',
    type_transfer: 'Transfer',
    reason_transfer: 'Transfer / credit-card payment',
    reason_payroll: 'Payroll / wage deposit',
    reason_personal: 'Potential personal use',
    reason_refund: 'Refund / reimbursement review',
    warning_meals_us: '50% meals limit applies. Review business purpose and attendees.',
    warning_meals_ca: '50% meals limit applies. CRA support still required.',
    warning_vehicle_us: 'Mileage log or actual-expense support required.',
    warning_vehicle_ca: 'CRA logbook required or deduction may be denied.',
    warning_receipt_us: 'Receipt required under IRC 274(d) for travel, meals, or lodging support.',
    warning_receipt_ca: 'Receipt support required. GST/HST detail should be retained when registered.',
    warning_home_office_us: 'Home-office deduction requires Form 8829 support.',
    warning_home_office_ca: 'Business-use-of-home is limited and may carry forward.',
    warning_travel: 'Business purpose, destination, and dates should be documented.',
    warning_gst_income: 'Indirect tax tracked separately from business income.',
    warning_gst_expense: 'Tracked GST/HST removed from deductible expense total.',
    warning_unmapped: 'Category still requires explicit tax-line review.',
    line_other_expenses_us: 'Schedule C Part V - Other expenses',
    line_other_expenses_ca: 'T2125 Line 9270 - Other expenses',
    final_disclaimer_title: 'Final CPA Workpaper Note',
    final_disclaimer_body_us: 'This US export is a bookkeeping workpaper for Schedule C and related review. It excludes transfers, payroll wages, and flagged personal-use items from business totals where detected, but final classification remains the preparer\'s responsibility.',
    final_disclaimer_body_ca: 'This Canada export is a bookkeeping workpaper for T2125 and related CRA review. GST/HST treatment depends on the indirect tax captured in the ledger and still requires preparer confirmation before filing.',
    col_category: 'InEx Category',
    col_tax_mapping: 'Suggested tax mapping',
    col_amount: 'Amount',
    col_review_status: 'Review',
    col_date: 'Date',
    col_tx_id: 'Tx ID',
    col_payee_memo: 'Payee / Memo',
    col_account_category: 'Account / Category',
    col_tax_map_short: 'Tax map',
    col_flag: 'Flag',
    col_type_receipt: 'Type / Receipt',
    review_ok: 'OK',
    review_review: 'Review',
    review_action_needed: 'Action needed',
    footer_brand: 'InEx Ledger',
    footer_confidential: 'Confidential'
  },
  es: {},
  fr: {}
};

function getPdfLabels(lang) {
  if (!lang || !PDF_LABELS[lang]) return PDF_LABELS.en;
  return { ...PDF_LABELS.en, ...PDF_LABELS[lang] };
}

function normalizeRegionCode(region) {
  return String(region || '').toUpperCase() === 'CA' ? 'CA' : 'US';
}

function resolveBusinessCurrency(region, fallbackCurrency) {
  const normalized = normalizeRegionCode(region);
  return normalized === 'CA' ? 'CAD' : (String(fallbackCurrency || 'USD').toUpperCase() || 'USD');
}

function normalizeYesNo(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not specified';
}

function validateExportProfile(profile) {
  const region = normalizeRegionCode(profile.region);
  const missing = [];
  const hasValue = (value) => String(value || '').trim().length > 0;

  if (!hasValue(profile.legalName || profile.businessName)) missing.push('Legal business name');
  if (!hasValue(profile.taxId || profile.storedTaxId)) missing.push(region === 'CA' ? 'Business number / SIN' : 'Tax ID (EIN / SSN)');
  if (!hasValue(profile.naics)) missing.push(region === 'CA' ? 'Industry / activity code' : 'Business activity code');
  if (!hasValue(profile.address)) missing.push('Business address');
  if (!hasValue(profile.accountingMethod)) missing.push('Accounting method');

  if (region === 'CA') {
    if (!hasValue(profile.province)) missing.push('Province of business operations');
    if (!hasValue(profile.fiscalYearStart)) missing.push('Fiscal year start');
    if (profile.gstHstRegistered) {
      if (!hasValue(profile.gstHstNumber)) missing.push('GST/HST registration number');
      if (!hasValue(profile.gstHstMethod)) missing.push('GST/HST accounting method');
    }
  } else if (profile.materialParticipation !== true && profile.materialParticipation !== false) {
    missing.push('Material participation');
  }

  if (missing.length) {
    const error = new Error(`Missing required export profile fields: ${missing.join(', ')}`);
    error.code = 'EXPORT_PROFILE_INCOMPLETE';
    error.status = 400;
    error.missingFields = missing;
    throw error;
  }
}

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

function calculateTotals(transactions, region, province) {
  let income = 0;
  let expenses = 0;
  (transactions || []).forEach((txn) => {
    const amount = Number(
      String(txn.type || '').toLowerCase() === 'income'
        ? (txn.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn))
        : (txn.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn))
    ) || 0;
    const normalizedType = String(txn.type || '').toLowerCase();
    if (normalizedType === 'income') {
      income += amount;
      return;
    }
    if (normalizedType === 'expense') {
      expenses += amount;
    }
  });
  const netProfit = income - expenses;
  return {
    income,
    expenses,
    netProfit,
    estimatedTax: null
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

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return false;
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

function normalizeTaxLineText(value, region) {
  const text = String(value || '').trim();
  if (text) return text;
  return normalizeRegionCode(region) === 'CA' ? 'Unmapped T2125 line' : 'Unmapped Schedule C line';
}

function buildTransactionText(txn) {
  return [
    txn.description,
    txn.note,
    txn.memo,
    txn.payee,
    txn.payee_name,
    txn.payer_name,
    txn.reference
  ].filter(Boolean).join(' ');
}

function normalizeMoneyAmount(txn) {
  return Math.abs(Number(txn?.amount) || 0);
}

function resolveIndirectTaxAmount(txn, options = {}) {
  const tracked = Math.abs(Number(txn?.indirect_tax_amount ?? txn?.indirectTaxAmount) || 0);
  if (!tracked) return 0;
  return coerceBoolean(options.gstHstRegistered) ? Math.min(tracked, normalizeMoneyAmount(txn)) : tracked;
}

function isMealsLike(categoryName, taxMapping, text) {
  return /(meal|meals|dining|restaurant|entertainment)/i.test(`${categoryName} ${taxMapping} ${text}`);
}

function isVehicleLike(categoryName, taxMapping, text) {
  return /(vehicle|auto|fuel|gas|repair|insurance|mileage|truck|car)/i.test(`${categoryName} ${taxMapping} ${text}`);
}

function isTravelLike(categoryName, taxMapping, text) {
  return /(travel|lodging|hotel|airfare|flight|uber|lyft|taxi)/i.test(`${categoryName} ${taxMapping} ${text}`);
}

function isHomeOfficeLike(categoryName, taxMapping, text) {
  return /(home office|workspace|mortgage|rent|utilities|internet)/i.test(`${categoryName} ${taxMapping} ${text}`);
}

function deriveBusinessAmounts(txn, category, options = {}) {
  const region = normalizeRegionCode(options.region);
  const amount = normalizeMoneyAmount(txn);
  const taxAmount = resolveIndirectTaxAmount(txn, options);
  const isExpense = String(txn?.type || '').toLowerCase() !== 'income';
  const categoryName = category?.name || '';
  const taxMapping = category?.tax_label || category?.taxLabel || category?.tax_map_us || category?.tax_map_ca || '';
  const text = buildTransactionText(txn);

  let netAmount = amount;
  if (region === 'CA' && coerceBoolean(options.gstHstRegistered) && taxAmount > 0) {
    netAmount = Math.max(0, amount - taxAmount);
  }

  let deductibleAmount = netAmount;
  let nonDeductibleAmount = 0;
  const warnings = [];

  if (isExpense && isMealsLike(categoryName, taxMapping, text)) {
    deductibleAmount = Number((netAmount * 0.5).toFixed(2));
    nonDeductibleAmount = Number((netAmount - deductibleAmount).toFixed(2));
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_meals_ca : PDF_LABELS.en.warning_meals_us);
  }

  if (isExpense && isVehicleLike(categoryName, taxMapping, text)) {
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_vehicle_ca : PDF_LABELS.en.warning_vehicle_us);
  }
  if (isExpense && isHomeOfficeLike(categoryName, taxMapping, text)) {
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_home_office_ca : PDF_LABELS.en.warning_home_office_us);
  }
  if (isExpense && isTravelLike(categoryName, taxMapping, text)) {
    warnings.push(PDF_LABELS.en.warning_travel);
    if (!(txn?.receipt_id || txn?.receiptId)) {
      warnings.push(region === 'CA' ? PDF_LABELS.en.warning_receipt_ca : PDF_LABELS.en.warning_receipt_us);
    }
  }
  if (isExpense && !category) {
    warnings.push(PDF_LABELS.en.warning_unmapped);
  }
  if (region === 'CA' && taxAmount > 0) {
    warnings.push(isExpense ? PDF_LABELS.en.warning_gst_expense : PDF_LABELS.en.warning_gst_income);
  }

  return {
    grossAmount: Number(amount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    netAmount: Number(netAmount.toFixed(2)),
    deductibleAmount: Number(deductibleAmount.toFixed(2)),
    nonDeductibleAmount: Number(nonDeductibleAmount.toFixed(2)),
    warnings: Array.from(new Set(warnings))
  };
}

function classifyExcludedTransaction(txn, category, region) {
  const normalizedType = String(txn?.type || '').toLowerCase();
  const categoryName = category?.name || '';
  const taxMapping = category?.tax_label || category?.taxLabel || category?.tax_map_us || category?.tax_map_ca || '';
  const text = buildTransactionText(txn);

  if (normalizedType === 'transfer' || /(transfer|credit card payment|cc payment|internal transfer|online transfer from sav|online transfer to sav)/i.test(`${categoryName} ${taxMapping} ${text}`)) {
    return region === 'CA' ? PDF_LABELS.en.reason_transfer : PDF_LABELS.en.reason_transfer;
  }
  if (normalizeRegionCode(region) === 'US' && /\bpayro\b|payroll|w-2|salary deposit|employer deposit/i.test(text)) {
    return PDF_LABELS.en.reason_payroll;
  }
  if (/(grocery|groceries|netflix|haircut|mortgage payment|personal|family expense)/i.test(`${categoryName} ${taxMapping} ${text}`)) {
    return PDF_LABELS.en.reason_personal;
  }
  if (String(txn?.tax_treatment || txn?.taxTreatment || '').toLowerCase() === 'split_use' || Number(txn?.personal_use_pct ?? txn?.personalUsePct) > 0) {
    return PDF_LABELS.en.reason_personal;
  }
  if (/(refund|reimbursement)/i.test(text) && normalizedType !== 'income') {
    return PDF_LABELS.en.reason_refund;
  }
  return null;
}

function normalizePdfDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(parsed.toISOString())) {
    return parsed.toISOString().slice(0, 10);
  }
  return text;
}

function maskTaxId(value) {
  const text = String(value || '').trim();
  if (!text) return 'No Tax ID';
  if (text.length <= 5) return text;
  return `${text.slice(0, 5)}***`;
}

function buildCategoryBuckets(transactions, categories, labels, currency, region) {
  const categoryMap = mapByKey(categories, 'id');
  const buckets = new Map();
  const taxKey = normalizeRegionCode(region) === 'CA' ? 'tax_map_ca' : 'tax_map_us';

  (transactions || []).forEach((txn) => {
    const categoryId = txn.category_id || txn.categoryId || '';
    const category = categoryMap[categoryId] || null;
    const categoryName = safeValue(category?.name, 'Uncategorized');
    const taxMapping = normalizeTaxLineText(category?.[taxKey] || category?.tax_label || category?.taxLabel, region);
    const bucketKey = `${categoryId || 'uncategorized'}::${String(txn.type || 'expense').toLowerCase()}`;
    const existing = buckets.get(bucketKey) || {
      categoryName: categoryName,
      taxMapping,
      amount: 0,
      needsReview: false,
      needsAction: false,
      hasSpecialCategory: false,
      type: String(txn.type || 'expense').toLowerCase()
    };
    existing.amount += String(txn.type || '').toLowerCase() === 'income'
      ? Number(txn.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn))
      : Number(txn.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn));
    if (/^Unmapped\b/.test(taxMapping) || categoryName === 'Uncategorized') existing.needsAction = true;
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

function normalizeDuplicateKey(txn) {
  const description = String(txn.description || txn.note || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const amount = Math.abs(Number(txn.amount) || 0).toFixed(2);
  return `${normalizePdfDate(txn.date)}|${amount}|${description}`;
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

function summarizeExportTransactions(transactions, categories, options = {}) {
  const region = normalizeRegionCode(options.region);
  const categoryMap = mapByKey(categories || [], 'id');
  const included = [];
  const excluded = [];

  for (const txn of transactions || []) {
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const exclusionReason = classifyExcludedTransaction(txn, category, region);
    const amounts = deriveBusinessAmounts(txn, category, options);
    const enriched = {
      ...txn,
      __category: category,
      __businessAmounts: amounts,
      __exclusionReason: exclusionReason
    };
    if (exclusionReason) {
      excluded.push(enriched);
    } else {
      included.push(enriched);
    }
  }

  return { included, excluded };
}

function buildReviewInsights(transactions, categories, receipts, meta = {}) {
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
    excludedCount: Number(meta.excludedCount) || 0,
    samples
  };
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
    reviewInsights, isSecure, categoryPreviewEntries = [], address = "", fiscalYearStart = "",
    materialParticipation, gstHstRegistered, gstHstNumber, gstHstMethod
  } = data;

  const normalizedRegion = normalizeRegionCode(region);
  const canvas = new PdfCanvas();
  let y = 760;
  canvas.text(40, y, normalizedRegion === 'CA' ? labels.ca_report_title : labels.us_report_title, 18, 'F2'); y -= 20;
  canvas.text(40, y, normalizedRegion === 'CA' ? labels.ca_report_subtitle : labels.us_report_subtitle, 10); y -= 16;
  canvas.text(40, y, isSecure ? labels.report_subtitle_secure : labels.report_subtitle_redacted, 10); y -= 18;
  canvas.text(40, y, isSecure ? labels.badge_secure : labels.badge_redacted, 11, 'F2');

  canvas.text(40, 690, labels.entity_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 670, [
    [labels.legal_name, safeValue(legalName || businessName)],
    [labels.business_name, safeValue(operatingName)],
    [isSecure ? labels.tax_id : labels.tax_id_redacted, isSecure ? safeValue(taxId) : labels.tax_id_withheld],
    [labels.business_activity_code, safeValue(naics)],
    [labels.jurisdiction, formatJurisdiction(region, province)],
    [labels.address, safeValue(address)],
    [labels.fiscal_year_start, safeValue(fiscalYearStart)]
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

  canvas.text(40, 590, normalizedRegion === 'CA' ? labels.ca_tax_profile_title : labels.us_tax_profile_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 570, normalizedRegion === 'CA'
    ? [
        [labels.province, safeValue(province)],
        [labels.gst_hst_registered, gstHstRegistered ? 'Yes' : 'No'],
        [labels.gst_hst_number, gstHstRegistered ? safeValue(gstHstNumber) : 'Not registered'],
        [labels.gst_hst_method, gstHstRegistered ? safeValue(gstHstMethod) : 'Not registered']
      ]
    : [
        [labels.material_participation, normalizeYesNo(materialParticipation)]
      ]
  );

  canvas.text(330, 590, labels.financial_summary_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 570, [
    [labels.gross_income, formatCurrencyForPdf(totals.income, currency)],
    [labels.total_expenses, formatCurrencyForPdf(totals.expenses, currency)],
    [labels.net_profit, formatCurrencyForPdf(totals.netProfit, currency)],
    [labels.transaction_count, String(reviewInsights.transactionCount)]
  ]);

  canvas.text(330, 500, labels.tax_estimate_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 480, [
    [labels.estimated_tax, 'Manual review required']
  ]);
  wrapText(labels.estimated_tax_disclaimer, 34).forEach((line, index) => {
    canvas.text(330, 464 - (index * 14), line, 9);
  });

  canvas.text(40, 430, labels.review_flags_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 410, [
    [labels.uncategorized_transactions, String(reviewInsights.uncategorizedCount)],
    [labels.review_flagged_transactions, String(reviewInsights.reviewFlagCount)],
    ['Possible duplicate transactions', String(reviewInsights.duplicateCount)],
    [labels.receipt_coverage, reviewInsights.receiptCoverageText],
    [labels.transfers_excluded_title, String(reviewInsights.excludedCount || 0)]
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

function buildContentsPage(labels, region) {
  const canvas = new PdfCanvas();
  const normalizedRegion = normalizeRegionCode(region);
  const rows = normalizedRegion === 'CA'
    ? [
        '1. Entity and tax profile',
        '2. Workpaper contents',
        '3. CRA rules snapshot',
        '4. Category totals by T2125 mapping',
        '5. Income / T4A reconciliation',
        '6. Deductibility adjustments and GST/HST review',
        '7. Detailed transaction ledger',
        '8. Excluded transfers, payroll, and personal review',
        '9. Support schedules and disclosure'
      ]
    : [
        '1. Entity and tax profile',
        '2. Workpaper contents',
        '3. IRS rules snapshot',
        '4. Category totals by Schedule C mapping',
        '5. Income / 1099 reconciliation',
        '6. Deductibility adjustments and receipt review',
        '7. Detailed transaction ledger',
        '8. Excluded transfers, payroll, and personal review',
        '9. Support schedules and disclosure'
      ];

  canvas.text(40, 760, labels.toc_title, 16, 'F2');
  let y = 724;
  rows.forEach((row) => {
    canvas.text(40, y, row, 10);
    y -= 20;
  });
  canvas.text(40, 500, normalizedRegion === 'CA' ? labels.profile_note_ca : labels.profile_note_us, 9);
  return [canvas];
}

function buildRulesSnapshotPage(labels, region, taxYear, gstHstRegistered) {
  const normalizedRegion = normalizeRegionCode(region);
  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.tax_rules_title, 16, 'F2');
  const necThreshold = taxYear >= 2026 ? '$2,000' : '$600';
  const rows = normalizedRegion === 'CA'
    ? [
        [labels.tax_rules_ca_threshold, '$500 payer support threshold'],
        [labels.tax_rules_meals, '50% deductible unless special exception applies'],
        [labels.tax_rules_vehicle, 'CRA logbook support is expected'],
        [labels.tax_rules_receipts, 'Keep vendor/date/amount/GST details'],
        [labels.tax_rules_gst, gstHstRegistered ? 'Net-of-tracked GST/HST in this export' : 'Gross amounts retained because business is not registered']
      ]
    : [
        [labels.tax_rules_us_threshold, `${necThreshold} per payer for tax year ${taxYear}`],
        [labels.tax_rules_meals, '50% deductible unless a specific exception applies'],
        [labels.tax_rules_vehicle, 'Mileage or actual-expense support still required'],
        [labels.tax_rules_receipts, 'Travel, meals, and lodging need stronger support'],
        [labels.tax_rules_gst, 'Not applicable to US Schedule C reporting']
      ];
  buildKeyValueRows(canvas, 40, 720, rows, 10, 20);
  return [canvas];
}

function buildExclusionPages(transactions, currency, labels) {
  if (!transactions.length) return [];
  return chunkArray(transactions, 18).map((chunk, index) => {
    const canvas = new PdfCanvas();
    const title = index === 0
      ? labels.exclusions_schedule_title
      : `${labels.exclusions_schedule_title} - ${labels.section_continued}`;
    canvas.text(40, 760, title, 16, 'F2');
    canvas.text(40, 730, labels.col_date, 9, 'F2');
    canvas.text(120, 730, labels.col_payee_memo, 9, 'F2');
    canvas.text(360, 730, labels.exclusions_reason, 9, 'F2');
    canvas.text(520, 730, labels.exclusions_booked_amount, 9, 'F2');
    let y = 706;
    chunk.forEach((txn) => {
      canvas.text(40, y, normalizePdfDate(txn.date), 8);
      canvas.text(120, y, truncateText(buildTransactionText(txn) || '(No description)', 42), 8);
      canvas.text(360, y, truncateText(txn.__exclusionReason || labels.reason_transfer, 26), 8);
      canvas.text(520, y, formatCurrencyForPdf(normalizeMoneyAmount(txn), currency), 8);
      y -= 16;
    });
    if (index === 0) {
      canvas.text(40, 80, labels.transfers_excluded_note, 8);
    }
    return canvas;
  });
}

function buildDeductionPages(transactions, currency, labels, region) {
  const rows = (transactions || [])
    .filter((txn) => String(txn.type || '').toLowerCase() !== 'income')
    .map((txn) => {
      const category = txn.__category || null;
      const details = txn.__businessAmounts || deriveBusinessAmounts(txn, category, { region });
      if (!(details.nonDeductibleAmount > 0 || details.taxAmount > 0 || details.warnings.length)) {
        return null;
      }
      return {
        date: normalizePdfDate(txn.date),
        description: truncateText(buildTransactionText(txn) || '(No description)', 28),
        gross: formatCurrencyForPdf(details.grossAmount, currency),
        tax: formatCurrencyForPdf(details.taxAmount, currency),
        net: formatCurrencyForPdf(details.netAmount, currency),
        allowed: formatCurrencyForPdf(details.deductibleAmount, currency),
        blocked: formatCurrencyForPdf(details.nonDeductibleAmount, currency),
        warning: truncateText(details.warnings.join(' | '), 44)
      };
    })
    .filter(Boolean);

  if (!rows.length) return [];

  return chunkArray(rows, 14).map((chunk, index) => {
    const canvas = new PdfCanvas();
    const titleBase = normalizeRegionCode(region) === 'CA' ? labels.deductions_title_ca : labels.deductions_title_us;
    const title = index === 0 ? titleBase : `${titleBase} - ${labels.section_continued}`;
    canvas.text(40, 760, title, 16, 'F2');
    canvas.text(40, 730, labels.col_date, 8, 'F2');
    canvas.text(95, 730, labels.col_payee_memo, 8, 'F2');
    canvas.text(250, 730, labels.deduction_gross, 8, 'F2');
    canvas.text(308, 730, labels.deduction_tax_component, 8, 'F2');
    canvas.text(360, 730, labels.deduction_net, 8, 'F2');
    canvas.text(418, 730, labels.deduction_allowed, 8, 'F2');
    canvas.text(480, 730, labels.deduction_disallowed, 8, 'F2');
    canvas.text(40, 712, labels.deduction_warning, 8, 'F2');
    let y = 690;
    chunk.forEach((row) => {
      canvas.text(40, y, row.date, 8);
      canvas.text(95, y, row.description, 8);
      canvas.text(250, y, row.gross, 8);
      canvas.text(308, y, row.tax, 8);
      canvas.text(360, y, row.net, 8);
      canvas.text(418, y, row.allowed, 8);
      canvas.text(480, y, row.blocked, 8);
      y -= 12;
      canvas.text(40, y, row.warning, 8);
      y -= 18;
    });
    return canvas;
  });
}

function buildTransactionPages(transactions, accounts, categories, currency, labels, region) {
  const accountMap = mapByKey(accounts, 'id');
  const categoryMap = mapByKey(categories, 'id');
  const taxKey = normalizeRegionCode(region) === 'CA' ? 'tax_map_ca' : 'tax_map_us';
  const sorted = (transactions || [])
    .slice()
    .sort((a, b) => normalizePdfDate(a.date).localeCompare(normalizePdfDate(b.date)));
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
    const businessAmounts = txn.__businessAmounts || deriveBusinessAmounts(txn, category, { region });
    const payerDetails = [];
    const payerName = txn.payer_name || txn.payerName || "";
    const taxFormType = txn.tax_form_type || txn.taxFormType || "";
    if (String(txn.type || "").toLowerCase() === "income" && payerName) {
      payerDetails.push(`Payer: ${payerName}`);
    }
    if (String(txn.type || "").toLowerCase() === "income" && taxFormType) {
      payerDetails.push(`Form: ${taxFormType}`);
    }
    const payeeMemoParts = [txn.description || txn.note || "(No description)", ...payerDetails];
    const detailParts = [
      `Type: ${String(txn.type || 'expense') === 'income' ? labels.type_income : labels.type_expense}`,
      `Receipt: ${txn.receipt_id || txn.receiptId ? 'Yes' : 'No'}`
    ];
    if (businessAmounts.taxAmount > 0) {
      detailParts.push(`Tax: ${formatCurrencyForPdf(businessAmounts.taxAmount, currency)}`);
    }
    if (businessAmounts.nonDeductibleAmount > 0) {
      detailParts.push(`Non-deductible: ${formatCurrencyForPdf(businessAmounts.nonDeductibleAmount, currency)}`);
    }
    if (businessAmounts.warnings.length) {
      detailParts.push(truncateText(businessAmounts.warnings.join(' | '), 52));
    }
    return {
      date: normalizePdfDate(txn.date),
      id: truncateText(txn.id || '', 10),
      payeeMemo: truncateText(payeeMemoParts.join(" | "), 25),
      accountCategory: truncateText(`${safeValue(account?.name, '-') } / ${safeValue(category?.name, 'Uncategorized')}`, 24),
      taxMapping: truncateText(normalizeTaxLineText(category?.[taxKey] || category?.tax_label || category?.taxLabel, region), 24),
      amount: formatCurrencyForPdf(String(txn.type || '').toLowerCase() === 'income' ? businessAmounts.netAmount : businessAmounts.deductibleAmount, currency),
      flag: flags.length ? truncateText(flags.join(', '), 18) : labels.review_ok,
      detail: detailParts.join(' | ')
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
      txDate: normalizePdfDate(txn.date),
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
  const categoryMap = mapByKey(categories, 'id');
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

function buildSupportPages(receipts, transactions, mileage, labels, currency, reviewInsights, region) {
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
  canvas.text(40, y, labels.final_disclaimer_title, 10, 'F2');
  y -= 16;
  wrapText(normalizeRegionCode(region) === 'CA' ? labels.final_disclaimer_body_ca : labels.final_disclaimer_body_us, 88).forEach((line) => {
    ensureSpace(12);
    canvas.text(40, y, line, 8);
    y -= 12;
  });

  pages.push(canvas);
  return pages;
}

// =========================================================
// Tax Packet additions (item 26): receipt coverage, payer
// summary, tax-line breakdown. Computed from already-loaded
// transactions / categories / receipts so we don't re-query.
// =========================================================

function computeReceiptCoverage(transactions, receipts) {
  const expenseTxIds = new Set();
  for (const t of transactions || []) {
    if (String(t.type || "").toLowerCase() === "expense") {
      expenseTxIds.add(t.id);
    }
  }
  const expenseCount = expenseTxIds.size;
  const withReceipt = new Set();
  for (const r of receipts || []) {
    const txId = r.transaction_id || r.transactionId;
    if (expenseTxIds.has(txId)) withReceipt.add(txId);
  }
  const missing = Math.max(0, expenseCount - withReceipt.size);
  const coveragePct = expenseCount === 0 ? null : Number(((withReceipt.size / expenseCount) * 100).toFixed(1));
  return {
    expense_count: expenseCount,
    with_receipt: withReceipt.size,
    missing,
    coverage_pct: coveragePct
  };
}

function expectedTaxFormForPayer({ region, total, transactionCount, taxYear }) {
  const r = String(region || "").toUpperCase();
  if (r === "CA") {
    return total >= 500 ? "T4A" : null;
  }
  if (total >= 20000 && transactionCount >= 200) return "1099-K";
  const necThreshold = Number(taxYear) >= 2026 ? 2000 : 600;
  if (total >= necThreshold) return "1099-NEC";
  return null;
}

function computePayerSummary(transactions, region, taxYear) {
  const byPayer = new Map();
  for (const t of transactions || []) {
    if (String(t.type || "").toLowerCase() !== "income") continue;
    const rawName = t.payer_name || t.payerName || "";
    const name = String(rawName || "").trim() || "(unspecified)";
    if (!byPayer.has(name)) {
      byPayer.set(name, { payer_name: name, total: 0, count: 0, declared_forms: new Map() });
    }
    const entry = byPayer.get(name);
    const amount = Number(t.__businessAmounts?.netAmount ?? t.amount) || 0;
    entry.total += amount;
    entry.count += 1;
    const form = t.tax_form_type || t.taxFormType || null;
    if (form && form !== "none") {
      entry.declared_forms.set(form, (entry.declared_forms.get(form) || 0) + amount);
    }
  }
  const payers = Array.from(byPayer.values()).map((entry) => {
    const declared = Array.from(entry.declared_forms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      payer_name: entry.payer_name,
      total: Number(entry.total.toFixed(2)),
      count: entry.count,
      declared_form: declared,
      expected_form: expectedTaxFormForPayer({ region, total: entry.total, transactionCount: entry.count, taxYear })
    };
  });
  payers.sort((a, b) => b.total - a.total);
  return {
    total_income: Number(payers.reduce((acc, p) => acc + p.total, 0).toFixed(2)),
    payer_count: payers.length,
    payers
  };
}

function computeTaxLineSummary(transactions, categories, region) {
  const taxKey = String(region || "").toUpperCase() === "CA" ? "tax_map_ca" : "tax_map_us";
  const catMap = mapByKey(categories || [], "id");
  const byLine = new Map();
  let unmappedTotal = 0;
  let unmappedCount = 0;
  for (const t of transactions || []) {
    const category = t.__category || catMap[t.category_id || t.categoryId] || null;
    const taxLine = category ? (category[taxKey] || null) : null;
    const amount = Number(
      String(t.type || '').toLowerCase() === 'income'
        ? (t.__businessAmounts?.netAmount ?? t.amount)
        : (t.__businessAmounts?.deductibleAmount ?? t.amount)
    ) || 0;
    if (!taxLine) {
      if (String(t.type || "").toLowerCase() === "expense") {
        unmappedTotal += amount;
        unmappedCount += 1;
      }
      continue;
    }
    if (!byLine.has(taxLine)) {
      byLine.set(taxLine, { tax_line: taxLine, total: 0, count: 0 });
    }
    const entry = byLine.get(taxLine);
    entry.total += amount;
    entry.count += 1;
  }
  const lines = Array.from(byLine.values()).map((entry) => ({
    tax_line: entry.tax_line,
    total: Number(entry.total.toFixed(2)),
    count: entry.count
  }));
  lines.sort((a, b) => b.total - a.total);
  return {
    lines,
    unmapped_total: Number(unmappedTotal.toFixed(2)),
    unmapped_count: unmappedCount
  };
}

function buildTaxPacketPages({ transactions, categories, receipts, currency, region, labels, taxYear }) {
  const coverage = computeReceiptCoverage(transactions, receipts);
  const payerSummary = computePayerSummary(transactions, region, taxYear);
  const taxLineSummary = computeTaxLineSummary(transactions, categories, region);

  const pages = [];
  let canvas = new PdfCanvas();
  let y = 760;

  const startPage = () => {
    canvas = new PdfCanvas();
    y = 760;
    canvas.text(40, y, normalizeRegionCode(region) === 'CA' ? labels.tax_packet_title_ca : labels.tax_packet_title_us, 16, "F2");
    y -= 28;
  };

  const pushPage = () => {
    pages.push(canvas);
    startPage();
  };

  const ensureSpace = (needed) => {
    if (y - needed < 60) pushPage();
  };

  startPage();

  // Receipt coverage block
  canvas.text(40, y, "Receipt Coverage", 12, "F2");
  y -= 20;
  canvas.text(40, y, `Expense transactions: ${coverage.expense_count}`, 9); y -= 14;
  canvas.text(40, y, `With receipt attached: ${coverage.with_receipt}`, 9); y -= 14;
  canvas.text(40, y, `Missing receipts: ${coverage.missing}`, 9); y -= 14;
  if (coverage.coverage_pct !== null) {
    canvas.text(40, y, `Coverage: ${coverage.coverage_pct}%`, 9); y -= 14;
  }
  if (coverage.missing > 0) {
    canvas.text(40, y, "Note: expenses without receipts may not be deductible if challenged.", 8);
    y -= 14;
  }
  y -= 10;

  // Payer summary
  ensureSpace(60);
  canvas.text(40, y, normalizeRegionCode(region) === 'CA' ? labels.tax_packet_payer_title_ca : labels.tax_packet_payer_title_us, 12, "F2");
  y -= 20;
  if (!payerSummary.payers.length) {
    canvas.text(40, y, "No income transactions in this range.", 9);
    y -= 18;
  } else {
    canvas.text(40, y, "Payer", 9, "F2");
    canvas.text(260, y, "Count", 9, "F2");
    canvas.text(320, y, "Total", 9, "F2");
    canvas.text(420, y, "Declared", 9, "F2");
    canvas.text(490, y, "Expected", 9, "F2");
    y -= 16;
    const topPayers = payerSummary.payers.slice(0, 12);
    for (const p of topPayers) {
      ensureSpace(14);
      canvas.text(40, y, truncateText(p.payer_name, 36), 9);
      canvas.text(260, y, String(p.count), 9);
      canvas.text(320, y, formatCurrencyForPdf(p.total, currency), 9);
      canvas.text(420, y, safeValue(p.declared_form, "—"), 9);
      const expected = p.expected_form || "—";
      const mismatch = p.expected_form && p.declared_form !== p.expected_form ? "*" : "";
      canvas.text(490, y, `${expected}${mismatch}`, 9);
      y -= 14;
    }
    if (payerSummary.payers.length > 12) {
      canvas.text(40, y, `... and ${payerSummary.payers.length - 12} more payers`, 8);
      y -= 14;
    }
    canvas.text(40, y, "* indicates the declared form differs from the expected form.", 8);
    y -= 18;
    canvas.text(40, y, `Total income: ${formatCurrencyForPdf(payerSummary.total_income, currency)}`, 9, "F2");
    y -= 18;
  }

  // Tax-line summary
  ensureSpace(60);
  canvas.text(40, y, normalizeRegionCode(region) === 'CA' ? labels.tax_packet_line_title_ca : labels.tax_packet_line_title_us, 12, "F2");
  y -= 20;
  if (!taxLineSummary.lines.length) {
    canvas.text(40, y, "No categories with tax-line mappings in this range.", 9);
    y -= 18;
  } else {
    canvas.text(40, y, "Tax line", 9, "F2");
    canvas.text(420, y, "Count", 9, "F2");
    canvas.text(490, y, "Total", 9, "F2");
    y -= 16;
    for (const line of taxLineSummary.lines.slice(0, 20)) {
      ensureSpace(14);
      canvas.text(40, y, truncateText(line.tax_line, 60), 9);
      canvas.text(420, y, String(line.count), 9);
      canvas.text(490, y, formatCurrencyForPdf(line.total, currency), 9);
      y -= 14;
    }
    if (taxLineSummary.lines.length > 20) {
      canvas.text(40, y, `... and ${taxLineSummary.lines.length - 20} more lines`, 8);
      y -= 14;
    }
  }
  if (taxLineSummary.unmapped_count > 0) {
    ensureSpace(28);
    y -= 6;
    canvas.text(40, y, `Unmapped expenses: ${taxLineSummary.unmapped_count} totaling ${formatCurrencyForPdf(taxLineSummary.unmapped_total, currency)}`, 9, "F2");
    y -= 14;
    canvas.text(40, y, "These transactions are uncategorized for tax purposes. Map their categories to a Schedule C or T2125 line.", 8);
    y -= 14;
  }

  pages.push(canvas);
  return pages;
}

function buildFooterText(labels, reportId, generatedAt, isSecure, pageNumber, totalPages, legalName, taxId) {
  const confidentiality = isSecure ? labels.footer_confidential : labels.badge_redacted;
  return truncateText(`${safeValue(legalName, labels.footer_brand)} | ${maskTaxId(taxId)} | ${reportId} | ${formatReportTimestamp(generatedAt)} | ${confidentiality} | Page ${pageNumber}/${totalPages}`, 110);
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
  return Buffer.from(encoder.encode(parts.join('')));
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
    storedTaxId = '',
    naics = '',
    region = 'us',
    province = '',
    generatedAt,
    reportId,
    accountingBasis,
    fiscalYearStart = '',
    address = '',
    accountingMethod = '',
    materialParticipation = null,
    gstHstRegistered = false,
    gstHstNumber = '',
    gstHstMethod = ''
  } = options;

  validateExportProfile({
    legalName,
    businessName,
    taxId,
    storedTaxId,
    naics,
    region,
    province,
    fiscalYearStart,
    address,
    accountingMethod,
    materialParticipation,
    gstHstRegistered,
    gstHstNumber,
    gstHstMethod
  });

  const labels = getPdfLabels(exportLang);
  const effectiveGeneratedAt = generatedAt || new Date().toISOString();
  const effectiveReportId = buildReportId(reportId);
  const normalizedRegion = normalizeRegionCode(region);
  const effectiveCurrency = resolveBusinessCurrency(normalizedRegion, currency);
  const resolvedTaxId = String(taxId || storedTaxId || '');
  const taxYear = Number(String(endDate || '').slice(0, 4)) || new Date().getFullYear();
  const transactionSummary = summarizeExportTransactions(transactions, categories, {
    region: normalizedRegion,
    gstHstRegistered
  });
  const includedTransactions = transactionSummary.included;
  const excludedTransactions = transactionSummary.excluded;
  const totals = calculateTotals(includedTransactions, region, province);
  const reviewInsights = buildReviewInsights(includedTransactions, categories, receipts, {
    excludedCount: excludedTransactions.length
  });
  const isSecure = Boolean(String(taxId || '').trim());
  const categoryEntries = buildCategoryBuckets(includedTransactions, categories, labels, effectiveCurrency, normalizedRegion);
  const categoryPreviewEntries = categoryEntries.slice(0, 6);

  const canvases = [
    buildIdentityPage({
      labels,
      totals,
      currency: effectiveCurrency,
      legalName,
      operatingName,
      taxId: resolvedTaxId,
      naics,
      businessName,
      startDate,
      endDate,
      reportId: effectiveReportId,
      generatedAt: effectiveGeneratedAt,
      accountingBasis: accountingMethod || accountingBasis,
      region: normalizedRegion,
      province,
      fiscalYearStart,
      address,
      materialParticipation,
      gstHstRegistered,
      gstHstNumber,
      gstHstMethod,
      reviewInsights,
      isSecure,
      categoryPreviewEntries
    }),
    ...buildContentsPage(labels, normalizedRegion),
    ...buildRulesSnapshotPage(labels, normalizedRegion, taxYear, gstHstRegistered),
    ...buildCategoryPages(includedTransactions, categories, effectiveCurrency, labels, categoryPreviewEntries.length),
    ...buildTaxPacketPages({ transactions: includedTransactions, categories, receipts, currency: effectiveCurrency, region: normalizedRegion, labels, taxYear }),
    ...buildDeductionPages(includedTransactions, effectiveCurrency, labels, normalizedRegion),
    ...buildTransactionPages(includedTransactions, accounts, categories, effectiveCurrency, labels, normalizedRegion),
    ...buildExclusionPages(excludedTransactions, effectiveCurrency, labels),
    ...buildSupportPages(receipts, includedTransactions, mileage, labels, effectiveCurrency, reviewInsights, normalizedRegion)
  ];

  const totalPages = canvases.length;
  const pageContents = canvases.map((canvas, index) => {
    canvas.addFooter(index + 1, totalPages, buildFooterText(labels, effectiveReportId, effectiveGeneratedAt, isSecure, index + 1, totalPages, legalName || businessName, resolvedTaxId));
    return canvas.build();
  });

  return createPdfBytes(pageContents);
}

module.exports = {
  buildPdfExport,
  __private: {
    calculateTotals,
    computeReceiptCoverage,
    computePayerSummary,
    computeTaxLineSummary,
    expectedTaxFormForPayer,
    validateExportProfile,
    summarizeExportTransactions,
    deriveBusinessAmounts,
    classifyExcludedTransaction,
    normalizeRegionCode,
    resolveBusinessCurrency
  }
};
