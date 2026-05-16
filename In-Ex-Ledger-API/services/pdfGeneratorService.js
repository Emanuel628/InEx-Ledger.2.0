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
    review_mixed_use: 'Explicitly split-use / partial personal (tagged)',
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

const FLAG_CODE_MAP = {
  'Uncategorized': 'UC',
  'Needs category': 'NC',
  'Missing description': 'MD',
  'Negative expense': 'NE',
  'Mixed-use': 'MU',
  'Review': 'RV',
  'Indirect tax': 'IX',
  'FX': 'FX',
  'Needs tax mapping': 'TM',
  'Special category': 'SC'
};
const FLAG_CODE_LEGEND = 'UC=Uncategorized  NC=Needs category  TM=Tax map missing  MD=No description  SC=Meals/auto/home  MU=Mixed-use  RV=Review';


const SCHEDULE_C_LINE_MAP = {
  gross_receipts: 'Line 1 — Gross receipts or sales',
  gross_receipts_sales: 'Line 1 — Gross receipts or sales',
  sales: 'Line 1 — Gross receipts or sales',
  sales_revenue: 'Line 1 — Gross receipts or sales',
  revenue: 'Line 1 — Gross receipts or sales',
  business_income: 'Line 1 — Gross receipts or sales',
  returns_allowances: 'Line 2 — Returns and allowances',
  cost_of_goods_sold: 'Line 4 — Cost of goods sold',
  other_income: 'Line 6 — Other income',
  advertising: 'Line 8 — Advertising',
  marketing: 'Line 8 — Advertising',
  car_and_truck: 'Line 9 — Car and truck expenses',
  vehicle: 'Line 9 — Car and truck expenses',
  auto: 'Line 9 — Car and truck expenses',
  fuel: 'Line 9 — Car and truck expenses',
  gas: 'Line 9 — Car and truck expenses',
  mileage: 'Line 9 — Car and truck expenses',
  commissions: 'Line 10 — Commissions and fees',
  commissions_and_fees: 'Line 10 — Commissions and fees',
  contract_labor: 'Line 11 — Contract labor',
  depletion: 'Line 12 — Depletion',
  depreciation: 'Line 13 — Depreciation and section 179',
  employee_benefits: 'Line 14 — Employee benefit programs',
  employee_benefit_programs: 'Line 14 — Employee benefit programs',
  insurance: 'Line 15 — Insurance (other than health)',
  insurance_other_than_health: 'Line 15 — Insurance (other than health)',
  mortgage_interest: 'Line 16a — Mortgage interest',
  other_interest: 'Line 16b — Other interest',
  interest: 'Line 16b — Other interest',
  bank_interest: 'Line 16b — Other interest',
  legal_professional: 'Line 17 — Legal and professional services',
  legal: 'Line 17 — Legal and professional services',
  professional_services: 'Line 17 — Legal and professional services',
  accounting: 'Line 17 — Legal and professional services',
  office_expense: 'Line 18 — Office expense',
  office: 'Line 18 — Office expense',
  office_supplies: 'Line 18 — Office expense',
  pension: 'Line 19 — Pension and profit-sharing plans',
  pension_profit_sharing: 'Line 19 — Pension and profit-sharing plans',
  rent_vehicles: 'Line 20a — Rent/lease (vehicles, machinery)',
  rent_lease_vehicles: 'Line 20a — Rent/lease (vehicles, machinery)',
  rent_other: 'Line 20b — Rent/lease (other property)',
  rent_lease_other: 'Line 20b — Rent/lease (other property)',
  rent: 'Line 20b — Rent/lease (other property)',
  repairs: 'Line 21 — Repairs and maintenance',
  repairs_maintenance: 'Line 21 — Repairs and maintenance',
  supplies: 'Line 22 — Supplies',
  taxes_licenses: 'Line 23 — Taxes and licenses',
  taxes: 'Line 23 — Taxes and licenses',
  licenses: 'Line 23 — Taxes and licenses',
  travel: 'Line 24a — Travel',
  meals: 'Line 24b — Deductible meals (50% limit)',
  meals_entertainment: 'Line 24b — Deductible meals (50% limit)',
  dining: 'Line 24b — Deductible meals (50% limit)',
  entertainment: 'Line 24b — Deductible meals (50% limit)',
  deductible_meals: 'Line 24b — Deductible meals (50% limit)',
  utilities: 'Line 25 — Utilities',
  wages: 'Line 26 — Wages',
  home_office: 'Line 30 — Home office (Form 8829)',
  software: 'Line 27a/Part V — Other expenses (software)',
  software_subscriptions: 'Line 27a/Part V — Other expenses (software subscriptions)',
  subscriptions: 'Line 27a/Part V — Other expenses (subscriptions)',
  bank_fees: 'Line 27a/Part V — Other expenses (bank fees)',
  bank_charges: 'Line 27a/Part V — Other expenses (bank charges)',
  professional_development: 'Line 27a/Part V — Other expenses (education/training)',
  education: 'Line 27a/Part V — Other expenses (education/training)',
  training: 'Line 27a/Part V — Other expenses (education/training)',
  other_expenses: 'Line 27a/Part V — Other expenses',
};

const T2125_LINE_MAP = {
  gross_income: 'Line 8000 — Gross business income',
  gross_receipts: 'Line 8000 — Gross business income',
  gross_receipts_sales: 'Line 8000 — Gross business income',
  sales: 'Line 8000 — Gross business income',
  sales_revenue: 'Line 8000 — Gross business income',
  revenue: 'Line 8000 — Gross business income',
  business_income: 'Line 8000 — Gross business income',
  advertising: 'Line 8520 — Advertising',
  marketing: 'Line 8520 — Advertising',
  meals: 'Line 8523 — Meals and entertainment (50%)',
  meals_entertainment: 'Line 8523 — Meals and entertainment (50%)',
  dining: 'Line 8523 — Meals and entertainment (50%)',
  entertainment: 'Line 8523 — Meals and entertainment (50%)',
  bad_debts: 'Line 8590 — Bad debts',
  insurance: 'Line 8690 — Insurance',
  insurance_other_than_health: 'Line 8690 — Insurance',
  interest: 'Line 8710 — Interest',
  bank_interest: 'Line 8710 — Interest',
  other_interest: 'Line 8710 — Interest',
  legal_professional: 'Line 8860 — Legal, accounting, and professional fees',
  professional_services: 'Line 8860 — Legal, accounting, and professional fees',
  accounting: 'Line 8860 — Legal, accounting, and professional fees',
  office_expense: 'Line 8810 — Office expenses',
  office: 'Line 8810 — Office expenses',
  office_supplies: 'Line 8810 — Office expenses',
  supplies: 'Line 8811 — Supplies',
  rent: 'Line 8912 — Rent',
  rent_other: 'Line 8912 — Rent',
  repairs: 'Line 8960 — Repairs and maintenance',
  repairs_maintenance: 'Line 8960 — Repairs and maintenance',
  taxes_licenses: 'Line 8760 — Business taxes, fees, and licences',
  licenses: 'Line 8760 — Business taxes, fees, and licences',
  taxes: 'Line 8760 — Business taxes, fees, and licences',
  management_fees: 'Line 8871 — Management and administration fees',
  admin_fees: 'Line 8871 — Management and administration fees',
  wages: 'Line 9060 — Salaries, wages, and benefits',
  salaries_wages: 'Line 9060 — Salaries, wages, and benefits',
  employee_benefits: 'Line 9060 — Salaries, wages, and benefits',
  employee_benefit_programs: 'Line 9060 — Salaries, wages, and benefits',
  travel: 'Line 9200 — Travel expenses',
  property_taxes: 'Line 9180 — Property taxes',
  delivery: 'Line 9275 — Delivery, freight, and express',
  freight: 'Line 9275 — Delivery, freight, and express',
  shipping: 'Line 9275 — Delivery, freight, and express',
  utilities: 'Line 9220 — Utilities',
  telephone: 'Line 9270 — Telephone and utilities',
  phone: 'Line 9270 — Telephone and utilities',
  internet: 'Line 9270 — Telephone and utilities',
  vehicle: 'Line 9281 — Motor vehicle expenses',
  auto: 'Line 9281 — Motor vehicle expenses',
  fuel: 'Line 9281 — Motor vehicle expenses (fuel)',
  gas: 'Line 9281 — Motor vehicle expenses (fuel)',
  mileage: 'Line 9281 — Motor vehicle expenses (mileage)',
  depreciation: 'Line 9936 — Capital cost allowance (CCA)',
  cca: 'Line 9936 — Capital cost allowance (CCA)',
  home_office: 'Line 9945 — Business-use-of-home expenses',
  software: 'Line 8810 — Office expenses (software)',
  software_subscriptions: 'Line 8810 — Office expenses (software subscriptions)',
  subscriptions: 'Line 8810 — Office expenses (subscriptions)',
  bank_fees: 'Line 8710 — Interest and bank charges',
  bank_charges: 'Line 8710 — Interest and bank charges',
  professional_development: 'Line 9270 — Other expenses (professional development)',
  education: 'Line 9270 — Other expenses (professional development)',
  training: 'Line 9270 — Other expenses (professional development)',
  other_expenses: 'Line 9270 — Other expenses',
  other_expense: 'Line 9270 — Other expenses',
  other_income: 'Line 8230 — Other income',
  commission_income: 'Line 8000 — Gross business income',
  contract_labor: 'Line 9270 — Other expenses (subcontractors)',
  commissions: 'Line 9270 — Other expenses (commissions paid)',
  commissions_and_fees: 'Line 9270 — Other expenses (commissions paid)',
  // Keys matching VALID_CA_TAX_MAPS values
  delivery_freight: 'Line 9275 — Delivery, freight, and express',
  interest_bank_charges: 'Line 8710 — Interest and bank charges',
  legal_accounting: 'Line 8860 — Legal, accounting, and professional fees',
  business_tax_fees_licenses_memberships: 'Line 8760 — Business taxes, fees, and licences',
  salaries_wages_benefits: 'Line 9060 — Salaries, wages, and benefits',
  maintenance_repairs: 'Line 8960 — Repairs and maintenance',
  motor_vehicle: 'Line 9281 — Motor vehicle expenses',
  gst_hst_paid: 'Input Tax Credit (ITC) — GST/HST paid on business expenses',
  gst_hst_collected: 'Line 8000 — Gross business income (GST/HST collected)',
  subsidies_grants: 'Line 8230 — Other income (subsidies/grants)',
  t4a_20: 'T4A Box 20 — Self-employment income',
  t4a_28: 'T4A Box 28 — Other income',
  cash_income: 'Line 8000 — Gross business income',
  sales: 'Line 8000 — Gross business income',
};

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
  const addMissing = (key, label) => {
    missing.push({ key, label });
  };

  if (!hasValue(profile.legalName || profile.businessName)) addMissing('legal_name', 'Legal business name');
  if (!hasValue(profile.naics)) addMissing('business_activity_code', region === 'CA' ? 'Industry / activity code' : 'Business activity code');
  if (!hasValue(profile.address)) addMissing('address', 'Business address');
  if (!hasValue(profile.accountingMethod)) addMissing('accounting_method', 'Accounting method');

  if (region === 'CA') {
    if (!hasValue(profile.province)) addMissing('province', 'Province of business operations');
    if (!hasValue(profile.fiscalYearStart)) addMissing('fiscal_year_start', 'Fiscal year start');
    if (profile.gstHstRegistered) {
      if (!hasValue(profile.gstHstNumber)) addMissing('gst_hst_number', 'GST/HST registration number');
      if (!hasValue(profile.gstHstMethod)) addMissing('gst_hst_method', 'GST/HST accounting method');
    }
  } else if (profile.materialParticipation !== true && profile.materialParticipation !== false) {
    addMissing('material_participation', 'Material participation');
  }

  if (missing.length) {
    const error = new Error(`Missing required export profile fields: ${missing.map((item) => item.label).join(', ')}`);
    error.code = 'EXPORT_PROFILE_INCOMPLETE';
    error.status = 400;
    error.missingFields = missing.map((item) => item.label);
    error.missingFieldKeys = missing.map((item) => item.key);
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
  if (!text) return normalizeRegionCode(region) === 'CA' ? 'Unmapped T2125 line' : 'Unmapped Schedule C line';
  if (/^(Line\s+\d|T\d{4}|8\d{3}|9\d{3})/i.test(text)) return text;
  // Handle legacy ca_XXXX / t2125_XXXX stored values — strip prefix, treat as line number
  const legacyMatch = text.match(/^(?:ca|t2125)_(\d+)$/i);
  if (legacyMatch) return `Line ${legacyMatch[1]}`;
  const slugKey = text.toLowerCase().replace(/[-\s]+/g, '_');
  const map = normalizeRegionCode(region) === 'CA' ? T2125_LINE_MAP : SCHEDULE_C_LINE_MAP;
  return map[slugKey] || map[text.toLowerCase()] || text;
}

function shortenTaxLine(text) {
  if (!text) return text;
  if (/^Unmapped\b/i.test(text)) return 'Unmapped';
  const m = text.match(/^Line\s+(\S+(?:\s+\S+)?)\s*[—\-]\s*(.+)$/i);
  if (!m) return text;
  const lineRef = m[1].trim().replace(/\/Part\s+[IVX]+/i, '').trim();
  const desc = m[2].trim()
    .replace(/\s*\([^)]+\)/g, '')
    .replace(/\s+(expenses?|programs?|plans?|activities?)$/i, '')
    .trim();
  const result = `L${lineRef} ${desc}`;
  if (result.length <= 22) return result;
  return result.slice(0, 22).replace(/\s+\S*$/, '').trim();
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
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+https?:\/\/\S+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
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
  let requiresAllocation = false;
  const warnings = [];

  if (isExpense && isMealsLike(categoryName, taxMapping, text)) {
    deductibleAmount = Number((netAmount * 0.5).toFixed(2));
    nonDeductibleAmount = Number((netAmount - deductibleAmount).toFixed(2));
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_meals_ca : PDF_LABELS.en.warning_meals_us);
  }

  if (isExpense && isVehicleLike(categoryName, taxMapping, text)) {
    requiresAllocation = true;
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_vehicle_ca : PDF_LABELS.en.warning_vehicle_us);
  }
  if (isExpense && isHomeOfficeLike(categoryName, taxMapping, text)) {
    requiresAllocation = true;
    warnings.push(region === 'CA' ? PDF_LABELS.en.warning_home_office_ca : PDF_LABELS.en.warning_home_office_us);
  }
  if (isExpense && !isMealsLike(categoryName, taxMapping, text) && /phone|internet|telephone/i.test(`${categoryName} ${taxMapping} ${text}`)) {
    requiresAllocation = true;
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
    requiresAllocation,
    warnings: Array.from(new Set(warnings))
  };
}

function classifyExcludedTransaction(txn, category, region) {
  const normalizedType = String(txn?.type || '').toLowerCase();
  const categoryName = category?.name || '';
  const taxMapping = category?.tax_label || category?.taxLabel || category?.tax_map_us || category?.tax_map_ca || '';
  const text = buildTransactionText(txn);
  const combined = `${categoryName} ${taxMapping} ${text}`;

  if (/^(payroll|wages?|salary|w-?2|employee\s+wages?)\b/i.test(categoryName)) {
    return PDF_LABELS.en.reason_payroll;
  }
  if (normalizedType === 'transfer' || /(transfer|credit card payment|cc payment|internal transfer|online transfer from sav|online transfer to sav)/i.test(combined)) {
    return PDF_LABELS.en.reason_transfer;
  }
  if (/(payment to chase|chase credit crd|chase crd|citi\s*card\s*online|capital one\s*mobile\s*pmt|capital one\s*online\s*pmt|amazon corp syf pay|synchrony bank|affirm\s*\*?\s*pay|klarna|valley bank bill pay|elan financial|discover e-?payment|autopay payment|online payment thank you|amex\s*autopay|bank of america\s*online|discover\s*card\s*pay|barclaycard|credit\s*card\s*autopay|minimum payment|statement balance)/i.test(text)) {
    return 'Credit card payment — not deductible (deduct the underlying card charges instead)';
  }
  if (/\bpayro\b|payroll|w-2\b|salary deposit|employer deposit/i.test(text)) {
    return PDF_LABELS.en.reason_payroll;
  }
  if (/(wire\s*fee|wire\s*transfer\s*fee|outgoing wire|incoming wire|international wire)/i.test(text) && normalizedType !== 'income') {
    return 'Wire / bank transfer fee — review if business-related';
  }
  if (normalizedType === 'income' && /irs\s+treas|tax\s+refund|irs\s+tax\b/i.test(text)) {
    return 'Tax refund — not Schedule C income (report on Form 1040 Line 4)';
  }
  if (normalizedType === 'income' && /state\s+of\s+[a-z]|\bnjstt\b|state\s+treas|dept\s+of\s+revenue/i.test(text)) {
    return 'State tax refund — not Schedule C income';
  }
  if (normalizedType === 'income' && /\bfidelity\b|\bvanguard\b|\bschwab\b|\bmerrill\b|\brobinhood\b|e\*?trade\b|tdameritrade|td\s+ameritrade/i.test(text)) {
    return 'Investment account — not Schedule C income (verify source)';
  }
  if (/(grocery|groceries|supermarket|whole foods|trader joe|kroger|safeway|publix|aldi|food lion|stop\s*&\s*shop|netflix|hulu|disney plus|disney\+|spotify|amazon prime|apple music|planet fitness|anytime fitness|gym membership|haircut|barber shop|vagaro|nail salon|crosscountry|cross\s*country\s*mortgage|mortgage payment|personal expense|family expense)/i.test(combined)) {
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
    if (/^Unmapped\b/.test(taxMapping) || categoryName === 'Uncategorized' || /^Imported\s+(Expense|Income)\b/i.test(categoryName)) existing.needsAction = true;
    if (getTransactionFlags(txn, category, region).length) existing.needsReview = true;
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
    .sort((a, b) => {
      const priorityOf = (r) => r === labels.review_action_needed ? 0 : r === labels.review_review ? 1 : 2;
      const pa = priorityOf(a.reviewStatus);
      const pb = priorityOf(b.reviewStatus);
      if (pa !== pb) return pa - pb;
      return b.sortAmount - a.sortAmount;
    });
}

function normalizeDuplicateKey(txn) {
  const description = String(txn.description || txn.note || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const amount = Math.abs(Number(txn.amount) || 0).toFixed(2);
  return `${normalizePdfDate(txn.date)}|${amount}|${description}`;
}

function isSpecialReviewCategory(categoryName, taxMapping) {
  return /(meal|travel|vehicle|auto|fuel|car|mileage|home office|food|dining|restaurant|entertainment|phone|internet|telephone)/i.test(`${categoryName} ${taxMapping}`);
}

function getTransactionFlags(txn, category, region = 'us') {
  const flags = [];
  const isCA = normalizeRegionCode(region) === 'CA';
  const taxTreatment = String(txn.tax_treatment || txn.taxTreatment || '').toLowerCase();
  const reviewStatus = String(txn.review_status || txn.reviewStatus || '').toLowerCase();
  const categoryName = category?.name || '';
  const taxKey = isCA ? 'tax_map_ca' : 'tax_map_us';
  const taxMapping = category?.[taxKey] || category?.tax_label || category?.taxLabel || '';
  const isImportedCategory = /^Imported\s+(Expense|Income)\b/i.test(categoryName);
  const hasCategoryId = !!(txn.category_id || txn.categoryId);

  if (!hasCategoryId) {
    flags.push('Uncategorized');
  } else if (isImportedCategory) {
    flags.push('Needs category');
  }
  if (!String(txn.description || '').trim()) flags.push('Missing description');
  if (String(txn.type || '').toLowerCase() !== 'income' && Number(txn.amount) < 0) flags.push('Negative expense');
  if (taxTreatment === 'split_use' || Number(txn.personal_use_pct ?? txn.personalUsePct) > 0) flags.push('Mixed-use');
  if (reviewStatus && reviewStatus !== 'ready') flags.push('Review');
  if (Number(txn.indirect_tax_amount ?? txn.indirectTaxAmount) > 0) flags.push('Indirect tax');
  const currencyCode = String(txn.currency || '').toUpperCase();
  if (currencyCode && currencyCode !== 'USD' && currencyCode !== 'CAD') flags.push('FX');
  if (hasCategoryId && !isImportedCategory && !taxMapping.trim()) flags.push('Needs tax mapping');
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
  const region = meta.region || 'us';
  const isCA = normalizeRegionCode(region) === 'CA';
  const taxKey = isCA ? 'tax_map_ca' : 'tax_map_us';
  const categoryMap = mapByKey(categories, 'id');
  const duplicateMap = new Map();
  (transactions || []).forEach((txn) => {
    const key = normalizeDuplicateKey(txn);
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  });

  const expenseTransactions = (transactions || []).filter((txn) => String(txn.type || '').toLowerCase() !== 'income');
  const receiptLinkedCount = expenseTransactions.filter((txn) => txn.receipt_id || txn.receiptId).length;

  const excludedArray = Array.isArray(meta.excluded) ? meta.excluded : [];
  const excludedCount = excludedArray.length > 0 ? excludedArray.length : (Number(meta.excludedCount) || 0);
  const exclusionReasonBreakdown = {};
  excludedArray.forEach((txn) => {
    const reason = txn.__exclusionReason || 'Excluded';
    exclusionReasonBreakdown[reason] = (exclusionReasonBreakdown[reason] || 0) + 1;
  });

  const FLAG_SEVERITY = { 'Uncategorized': 0, 'Needs category': 1, 'Needs tax mapping': 2, 'Review': 3, 'Negative expense': 4, 'Missing description': 5, 'Mixed-use': 6, 'Indirect tax': 7, 'FX': 8, 'Special category': 9 };
  const allFlagged = [];
  let uncategorizedCount = 0;
  let needsCategoryCount = 0;
  let missingDescriptionCount = 0;
  let duplicateCount = 0;
  let negativeExpenseCount = 0;
  let mixedUseCount = 0;
  let specialCategoryCount = 0;
  let reviewFlagCount = 0;
  let vehicleCount = 0;
  let vehicleTotal = 0;
  let mealsCount = 0;
  let mealsTotal = 0;
  let homeOfficeCount = 0;
  let homeOfficeTotal = 0;
  let unmappedExpenseCount = 0;
  let unmappedTaxCount = 0;

  (transactions || []).forEach((txn) => {
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const flags = getTransactionFlags(txn, category, region);
    const taxSlug = String(category?.[taxKey] || category?.tax_label || category?.taxLabel || '').toLowerCase();
    const catName = String(category?.name || '').toLowerCase();
    const isExpense = String(txn.type || '').toLowerCase() === 'expense';
    const amount = Math.abs(Number(txn.amount) || 0);

    if (flags.includes('Uncategorized')) uncategorizedCount += 1;
    if (flags.includes('Needs category')) needsCategoryCount += 1;
    if (flags.includes('Needs tax mapping')) unmappedTaxCount += 1;
    if (!String(txn.description || '').trim()) missingDescriptionCount += 1;
    if (duplicateMap.get(normalizeDuplicateKey(txn)) > 1) duplicateCount += 1;
    if (isExpense && Number(txn.amount) < 0) negativeExpenseCount += 1;
    if (flags.includes('Mixed-use')) mixedUseCount += 1;
    if (flags.includes('Special category')) specialCategoryCount += 1;
    if (flags.length) {
      reviewFlagCount += 1;
      const topSeverity = Math.min(...flags.map((f) => FLAG_SEVERITY[f] ?? 99));
      allFlagged.push({ severity: topSeverity, amount, flags, description: txn.description || '(No description)' });
    }

    if (isExpense) {
      const combined = `${catName} ${taxSlug}`;
      if (/\b(vehicle|auto|fuel|truck|mileage|car_and_truck)\b/.test(combined) || /\bgas\b/.test(combined) || /\bcar\b/.test(catName)) {
        vehicleCount += 1; vehicleTotal += amount;
      } else if (/\b(meal|meals|meals_entertainment|dining|entertainment|deductible_meals)\b/.test(combined)) {
        mealsCount += 1; mealsTotal += amount;
      } else if (/home[_\s]?office|home[_\s]?business/.test(combined)) {
        homeOfficeCount += 1; homeOfficeTotal += amount;
      }
      if ((txn.category_id || txn.categoryId) && !taxSlug) unmappedExpenseCount += 1;
    }
  });

  allFlagged.sort((a, b) => a.severity !== b.severity ? a.severity - b.severity : b.amount - a.amount);
  const samples = allFlagged.slice(0, 6).map((item) => ({
    reason: item.flags.join(', '),
    description: truncateText(item.description, 36),
    amount: item.amount
  }));

  return {
    transactionCount: (transactions || []).length,
    expenseTransactionCount: expenseTransactions.length,
    uncategorizedCount,
    needsCategoryCount,
    missingDescriptionCount,
    duplicateCount,
    negativeExpenseCount,
    mixedUseCount,
    specialCategoryCount,
    reviewFlagCount,
    receiptLinkedCount,
    missingReceiptCount: Math.max(0, expenseTransactions.length - receiptLinkedCount),
    receiptCoverageText: `${receiptLinkedCount} of ${expenseTransactions.length || 0}`,
    excludedCount,
    exclusionReasonBreakdown,
    vehicleCount, vehicleTotal,
    mealsCount, mealsTotal,
    homeOfficeCount, homeOfficeTotal,
    unmappedExpenseCount,
    unmappedTaxCount,
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
    reviewInsights, isSecure, address = "", fiscalYearStart = "",
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
    ...(String(operatingName || '').trim() ? [[labels.business_name, operatingName]] : []),
    [isSecure ? labels.tax_id : labels.tax_id_redacted, isSecure ? safeValue(taxId) : labels.tax_id_withheld],
    [labels.business_activity_code, safeValue(naics)],
    [labels.jurisdiction, formatJurisdiction(region, province)],
    ...(isSecure ? [[labels.address, safeValue(address)]] : []),
    ...(String(fiscalYearStart || '').trim() ? [[labels.fiscal_year_start, fiscalYearStart]] : [])
  ]);

  canvas.text(330, 690, labels.reporting_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 670, [
    [labels.reporting_period, `${startDate} to ${endDate}`],
    ...(String(accountingBasis || '').trim() ? [[labels.accounting_basis, accountingBasis]] : []),
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
    ['Imported (needs real category)', String(reviewInsights.needsCategoryCount || 0)],
    ['Expenses missing tax mapping', String(reviewInsights.unmappedTaxCount || 0)],
    ['Meals, auto, home-office items (SC)', String(reviewInsights.specialCategoryCount || 0)],
    [labels.review_flagged_transactions, String(reviewInsights.reviewFlagCount)],
    ['Possible duplicate transactions', String(reviewInsights.duplicateCount)],
    [labels.receipt_coverage, reviewInsights.receiptCoverageText],
    [labels.transfers_excluded_title, String(reviewInsights.excludedCount || 0)]
  ]);

  canvas.text(40, 210, 'Category totals and tax mapping: see next section', 9);
  canvas.text(40, 196, 'Detailed transaction ledger: see appendix pages', 9);

  return canvas;
}

function buildCategoryPages(transactions, categories, currency, labels, embeddedCount = 0, region = 'US') {
  const entries = buildCategoryBuckets(transactions, categories, labels, currency, region);
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

function buildContentsPage(labels, region, taxYear, gstHstRegistered) {
  const canvas = new PdfCanvas();
  const normalizedRegion = normalizeRegionCode(region);
  const tocRows = normalizedRegion === 'CA'
    ? [
        '1. Entity and tax profile',
        '2. Workpaper contents and CRA rules snapshot',
        '3. Category totals by T2125 mapping',
        '4. Income / T4A reconciliation',
        '5. Deductibility adjustments and GST/HST review',
        '6. Detailed transaction ledger',
        '7. Excluded transfers, payroll, and personal review',
        '8. Support schedules and disclosure'
      ]
    : [
        '1. Entity and tax profile',
        '2. Workpaper contents and IRS rules snapshot',
        '3. Category totals by Schedule C mapping',
        '4. Income / 1099 reconciliation',
        '5. Deductibility adjustments and receipt review',
        '6. Detailed transaction ledger',
        '7. Excluded transfers, payroll, and personal review',
        '8. Support schedules and disclosure'
      ];

  canvas.text(40, 760, labels.toc_title, 16, 'F2');
  let y = 724;
  tocRows.forEach((row) => {
    canvas.text(40, y, row, 10);
    y -= 20;
  });
  canvas.text(40, y - 4, normalizedRegion === 'CA' ? labels.profile_note_ca : labels.profile_note_us, 9);

  // Rules snapshot on same page
  const necThreshold = (taxYear || 0) >= 2026 ? '$2,000' : '$600';
  const ruleRows = normalizedRegion === 'CA'
    ? [
        [labels.tax_rules_ca_threshold, '$500 payer support threshold'],
        [labels.tax_rules_meals, '50% deductible unless special exception applies'],
        [labels.tax_rules_vehicle, 'CRA logbook support is expected'],
        [labels.tax_rules_receipts, 'Keep vendor/date/amount/GST details'],
        [labels.tax_rules_gst, gstHstRegistered ? 'Net-of-tracked GST/HST in this export' : 'Gross amounts retained (not registered)']
      ]
    : [
        [labels.tax_rules_us_threshold, `${necThreshold} per payer for tax year ${taxYear}; verify with preparer`],
        [labels.tax_rules_meals, '50% deductible; business purpose required'],
        [labels.tax_rules_vehicle, 'Mileage log or actual-expense records required'],
        [labels.tax_rules_receipts, 'Travel, meals, lodging, and gifts need stronger support'],
        [labels.tax_rules_gst, 'Not applicable to US Schedule C reporting']
      ];

  canvas.text(40, 460, labels.tax_rules_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 440, ruleRows, 10, 20);
  return [canvas];
}

function buildExclusionPages(transactions, currency, labels) {
  if (!transactions.length) return [];

  const sorted = [...transactions].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  const reasonCounts = {};
  sorted.forEach((txn) => {
    const r = txn.__exclusionReason || labels.reason_transfer || 'Excluded';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonSummaryLines = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count}x ${reason}`);

  const ITEMS_PER_PAGE = 16;
  return chunkArray(sorted, ITEMS_PER_PAGE).map((chunk, index) => {
    const canvas = new PdfCanvas();
    const title = index === 0
      ? labels.exclusions_schedule_title
      : `${labels.exclusions_schedule_title} - ${labels.section_continued}`;
    canvas.text(40, 760, title, 16, 'F2');

    let headerY = 736;
    if (index === 0) {
      canvas.text(40, headerY, 'Summary by exclusion reason:', 9, 'F2');
      headerY -= 12;
      reasonSummaryLines.slice(0, 4).forEach((line) => {
        canvas.text(40, headerY, truncateText(line, 90), 8);
        headerY -= 11;
      });
      headerY -= 4;
    }

    canvas.text(40, headerY, labels.col_date, 9, 'F2');
    canvas.text(120, headerY, labels.col_payee_memo, 9, 'F2');
    canvas.text(360, headerY, labels.exclusions_reason, 9, 'F2');
    canvas.text(520, headerY, labels.exclusions_booked_amount, 9, 'F2');
    let y = headerY - 16;
    chunk.forEach((txn) => {
      canvas.text(40, y, normalizePdfDate(txn.date), 8);
      canvas.text(120, y, truncateText(buildTransactionText(txn) || '(No description)', 38), 8);
      canvas.text(360, y, truncateText(txn.__exclusionReason || labels.reason_transfer, 26), 8);
      canvas.text(520, y, formatCurrencyForPdf(normalizeMoneyAmount(txn), currency), 8);
      y -= 16;
    });
    if (index === 0) {
      canvas.text(40, 50, labels.transfers_excluded_note, 8);
    }
    return canvas;
  });
}

function buildDeductionPages(transactions, currency, labels, region) {
  const isCA = normalizeRegionCode(region) === 'CA';
  const expenseRows = (transactions || [])
    .filter((txn) => String(txn.type || '').toLowerCase() !== 'income')
    .map((txn) => {
      const category = txn.__category || null;
      const details = txn.__businessAmounts || deriveBusinessAmounts(txn, category, { region });
      if (!(details.nonDeductibleAmount > 0 || details.taxAmount > 0 || details.warnings.length || details.requiresAllocation)) {
        return null;
      }
      return {
        date: normalizePdfDate(txn.date),
        description: truncateText(buildTransactionText(txn) || '(No description)', 28),
        gross: formatCurrencyForPdf(details.grossAmount, currency),
        tax: formatCurrencyForPdf(details.taxAmount, currency),
        net: formatCurrencyForPdf(details.netAmount, currency),
        allowed: details.requiresAllocation ? 'TBD' : formatCurrencyForPdf(details.deductibleAmount, currency),
        blocked: details.requiresAllocation ? 'TBD' : formatCurrencyForPdf(details.nonDeductibleAmount, currency),
        warning: truncateText(details.warnings.join(' | '), 50),
        requiresAllocation: details.requiresAllocation
      };
    })
    .filter(Boolean);

  if (!expenseRows.length) return [];

  // Build grouped summary counts for page 1 header
  const mealsRows = expenseRows.filter((r) => /50% meals/i.test(r.warning));
  const vehicleRows = expenseRows.filter((r) => r.requiresAllocation && /mileage|logbook|vehicle/i.test(r.warning));
  const homeOfficeRows = expenseRows.filter((r) => r.requiresAllocation && /home.office|form 8829|business.use.of.home/i.test(r.warning));

  const titleBase = isCA ? labels.deductions_title_ca : labels.deductions_title_us;
  const pages = [];

  chunkArray(expenseRows, 14).forEach((chunk, index) => {
    const canvas = new PdfCanvas();
    const title = index === 0 ? titleBase : `${titleBase} - ${labels.section_continued}`;
    canvas.text(40, 760, title, 16, 'F2');

    let headerY = 738;
    if (index === 0) {
      // Summary counts so CPA sees the big picture before the wall of rows
      if (mealsRows.length) {
        canvas.text(40, headerY, `Meals requiring 50% review: ${mealsRows.length} transactions — 50% limit applied automatically below`, 9);
        headerY -= 14;
      }
      if (vehicleRows.length) {
        canvas.text(40, headerY, `Vehicle requiring mileage/actual-expense support: ${vehicleRows.length} transactions — deductible amount shown as TBD`, 9);
        headerY -= 14;
      }
      if (homeOfficeRows.length) {
        canvas.text(40, headerY, `Home-office requiring sq-ft allocation: ${homeOfficeRows.length} transactions — deductible amount shown as TBD`, 9);
        headerY -= 14;
      }
      headerY -= 4;
    }

    const colY = headerY - 4;
    canvas.text(40, colY, labels.col_date, 8, 'F2');
    canvas.text(95, colY, labels.col_payee_memo, 8, 'F2');
    canvas.text(250, colY, labels.deduction_gross, 8, 'F2');
    canvas.text(308, colY, labels.deduction_tax_component, 8, 'F2');
    canvas.text(360, colY, labels.deduction_net, 8, 'F2');
    canvas.text(418, colY, labels.deduction_allowed, 8, 'F2');
    canvas.text(480, colY, labels.deduction_disallowed, 8, 'F2');
    canvas.text(40, colY - 16, labels.deduction_warning, 8, 'F2');
    let y = colY - 36;
    chunk.forEach((row) => {
      if (y < 60) return;
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
    pages.push(canvas);
  });
  return pages;
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

  // Build row items with monthly group headers
  const rowItems = [];
  let lastMonth = '';
  sorted.forEach((txn) => {
    const dateStr = normalizePdfDate(txn.date);
    const monthKey = dateStr.slice(0, 7);
    if (monthKey !== lastMonth) {
      lastMonth = monthKey;
      const d = new Date(dateStr + 'T12:00:00Z');
      const monthLabel = Number.isNaN(d.getTime())
        ? monthKey
        : d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      rowItems.push({ isHeader: true, label: monthLabel });
    }
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const account = accountMap[txn.account_id || txn.accountId] || null;
    const flags = getTransactionFlags(txn, category, region);
    const businessAmounts = txn.__businessAmounts || deriveBusinessAmounts(txn, category, { region });
    const isIncome = String(txn.type || '').toLowerCase() === 'income';
    const taxMapRaw = normalizeTaxLineText(
      category?.[taxKey] || category?.tax_label || category?.taxLabel,
      region
    );
    // Build conditional note — only when there is genuinely useful extra detail
    const noteParts = [];
    // Line 2: account / category / payer
    const accountCatStr = `${safeValue(account?.name, '-')} / ${safeValue(category?.name, 'Uncategorized')}`;
    noteParts.push(truncateText(accountCatStr, 32));
    if (isIncome && (txn.payer_name || txn.payerName)) {
      noteParts.push(`Payer: ${truncateText(txn.payer_name || txn.payerName, 22)}`);
    }
    if (isIncome && (txn.tax_form_type || txn.taxFormType)) {
      noteParts.push(`Form: ${txn.tax_form_type || txn.taxFormType}`);
    }
    if (businessAmounts.requiresAllocation) {
      noteParts.push('Allocation pending — business-use % required');
    } else if (businessAmounts.nonDeductibleAmount > 0) {
      noteParts.push(`Non-deductible: ${formatCurrencyForPdf(businessAmounts.nonDeductibleAmount, currency)}`);
    }
    if (businessAmounts.warnings.length && !businessAmounts.requiresAllocation) {
      noteParts.push(truncateText(businessAmounts.warnings[0], 42));
    }
    if (!(txn.receipt_id || txn.receiptId) && !isIncome && flags.includes('Special category')) {
      noteParts.push('No receipt');
    }
    const amountValue = isIncome ? businessAmounts.netAmount : businessAmounts.deductibleAmount;
    const flagCodes = flags.length
      ? flags.map((f) => FLAG_CODE_MAP[f] || f.slice(0, 2).toUpperCase()).join(' ')
      : labels.review_ok;
    rowItems.push({
      isHeader: false,
      date: dateStr.slice(5),
      payeeMemo: truncateText(buildTransactionText(txn) || '(No description)', 42),
      taxMapping: shortenTaxLine(taxMapRaw),
      amountStr: (isIncome ? '+' : '') + formatCurrencyForPdf(amountValue, currency),
      flagStr: flagCodes,
      note: noteParts.join(' | ')
    });
  });

  const pages = [];
  let canvasObj = null;
  let y = 0;
  let isFirstPage = true;

  const startNewPage = () => {
    const c = new PdfCanvas();
    c.text(40, 760, labels.transaction_log_title, 16, 'F2');
    if (!isFirstPage) c.text(220, 760, `(${labels.section_continued})`, 9);
    isFirstPage = false;
    c.text(40, 738, labels.col_date, 9, 'F2');
    c.text(90, 738, labels.col_payee_memo, 9, 'F2');
    c.text(340, 738, labels.col_tax_map_short, 9, 'F2');
    c.text(462, 738, labels.col_amount, 9, 'F2');
    c.text(530, 738, labels.col_flag, 9, 'F2');
    c.text(40, 724, FLAG_CODE_LEGEND, 7);
    canvasObj = c;
    y = 706;
  };

  startNewPage();

  rowItems.forEach((item) => {
    if (item.isHeader) {
      if (y - 22 < 60) { pages.push(canvasObj); startNewPage(); }
      canvasObj.text(40, y, item.label, 9, 'F2');
      y -= 22;
    } else {
      const needed = 14 + 12; // primary row + note line always shown
      if (y - needed < 60) { pages.push(canvasObj); startNewPage(); }
      canvasObj.text(40, y, item.date, 8);
      canvasObj.text(90, y, item.payeeMemo, 8);
      canvasObj.text(340, y, item.taxMapping, 8);
      canvasObj.text(462, y, item.amountStr, 8);
      canvasObj.text(530, y, item.flagStr, 8);
      y -= 13;
      canvasObj.text(90, y, truncateText(item.note, 76), 7);
      y -= 12;
    }
  });

  pages.push(canvasObj);
  return pages;
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
    ['[CRITICAL] ' + labels.review_uncategorized, reviewInsights.uncategorizedCount],
    ['[CRITICAL] Imported categories — not yet mapped to real categories', reviewInsights.needsCategoryCount || 0],
    ['[HIGH]     ' + labels.review_missing_description, reviewInsights.missingDescriptionCount],
    ['[HIGH]     ' + labels.review_possible_duplicates, reviewInsights.duplicateCount],
    ['[HIGH]     ' + labels.review_negative_expenses, reviewInsights.negativeExpenseCount],
    ['[HIGH]     ' + labels.review_mixed_use, reviewInsights.mixedUseCount],
    ['[MEDIUM]   ' + labels.review_special_categories, reviewInsights.specialCategoryCount],
    ['[MEDIUM]   ' + labels.review_missing_receipts, reviewInsights.missingReceiptCount]
  ];

  let hasAnyReviewItem = false;
  summaryRows.forEach(([label, count]) => {
    if (count > 0) hasAnyReviewItem = true;
    canvas.text(40, y, `${label}: ${count}`, 9);
    y -= 14;
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

function buildCpaChecklistPage(opts) {
  const {
    labels, region, isSecure, naics, entityType, accountingBasis, accountingMethod,
    totals, reviewInsights, currency, legalName, province,
    materialParticipation, gstHstRegistered, mileage
  } = opts;

  const isCA = normalizeRegionCode(region) === 'CA';
  const effectiveAccountingMethod = accountingBasis || accountingMethod || '';
  const canvas = new PdfCanvas();
  const pageTitle = isCA
    ? 'CPA Workpaper Checklist — Canada T2125'
    : 'CPA Workpaper Checklist — US Schedule C';
  canvas.text(40, 760, pageTitle, 16, 'F2');
  canvas.text(40, 742, 'Review each item with your tax preparer before submission.', 9);

  let y = 718;
  const hasMileageData = Array.isArray(mileage) && mileage.length > 0;
  const hasNegativeProfit = totals.netProfit < 0;

  const checkRow = (isOk, label, note) => {
    const mark = isOk ? '[OK]' : '[!] ';
    canvas.text(40, y, mark, 9, isOk ? 'F1' : 'F2');
    canvas.text(82, y, label, 9);
    if (note) canvas.text(310, y, truncateText(note, 40), 9);
    y -= 14;
  };

  const sectionHead = (title) => {
    y -= 6;
    canvas.text(40, y, title, 11, 'F2');
    y -= 16;
  };

  sectionHead('Entity and Filing Profile');
  checkRow(Boolean(legalName), 'Legal business name', legalName ? truncateText(legalName, 32) : 'Not set');
  checkRow(Boolean(naics), 'Business activity code (NAICS/BAC)', naics || 'Not specified — required before filing');
  checkRow(isSecure, 'Tax ID on record', isSecure ? 'Present (secure export)' : 'Withheld — redacted export');
  checkRow(Boolean(entityType), 'Entity type', entityType || 'Not specified');
  checkRow(Boolean(effectiveAccountingMethod), 'Accounting method', effectiveAccountingMethod || 'Not specified');
  if (isCA) {
    checkRow(Boolean(province), 'Province', province || 'Not specified — required for T2125');
    checkRow(gstHstRegistered !== null, 'GST/HST registration status', gstHstRegistered ? 'Registered' : 'Not registered / not provided');
  } else {
    checkRow(materialParticipation !== null, 'Material participation', materialParticipation === true ? 'Yes' : materialParticipation === false ? 'No' : 'Not specified — confirm with preparer');
  }

  sectionHead('Documentation and Receipt Coverage');
  const receiptOk = reviewInsights.expenseTransactionCount > 0 && reviewInsights.missingReceiptCount === 0;
  checkRow(receiptOk, 'Receipts attached to all expense transactions',
    `${reviewInsights.receiptLinkedCount} of ${reviewInsights.expenseTransactionCount} covered`);
  checkRow(reviewInsights.uncategorizedCount === 0, 'No transactions without a category assigned',
    reviewInsights.uncategorizedCount > 0 ? `${reviewInsights.uncategorizedCount} still need a category` : 'All assigned');
  checkRow((reviewInsights.needsCategoryCount || 0) === 0, 'No imported categories — all mapped to real categories',
    (reviewInsights.needsCategoryCount || 0) > 0 ? `${reviewInsights.needsCategoryCount} in Imported Expense/Income — assign real category before filing` : 'None detected');
  checkRow(reviewInsights.unmappedExpenseCount === 0, 'All expense categories mapped to tax line',
    reviewInsights.unmappedExpenseCount > 0 ? `${reviewInsights.unmappedExpenseCount} expense(s) with unmapped category` : 'All mapped');
  checkRow(reviewInsights.duplicateCount === 0, 'No duplicate transactions detected',
    reviewInsights.duplicateCount > 0 ? `${reviewInsights.duplicateCount} possible duplicate(s)` : 'None detected');
  checkRow(true, 'Personal/transfer items excluded from P&L',
    `${reviewInsights.excludedCount} item(s) excluded and shown in separate schedule`);

  sectionHead('Deductibility and Allocation');
  if (reviewInsights.vehicleCount > 0) {
    checkRow(hasMileageData, isCA ? 'Vehicle — CRA logbook required' : 'Vehicle — mileage log or actual expense doc',
      `${reviewInsights.vehicleCount} tx, ${formatCurrencyForPdf(reviewInsights.vehicleTotal, currency)}${hasMileageData ? ' — mileage data present' : ' — no mileage log'}`);
  }
  if (reviewInsights.mealsCount > 0) {
    checkRow(false, isCA ? 'Meals — 50% limit, CRA support required' : 'Meals — 50% limit, business purpose required',
      `${reviewInsights.mealsCount} tx, ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)}`);
  }
  if (reviewInsights.homeOfficeCount > 0) {
    checkRow(false, isCA ? 'Home office — T2125 Part 7 allocation needed' : 'Home office — Form 8829 allocation needed',
      `${formatCurrencyForPdf(reviewInsights.homeOfficeTotal, currency)} — sq ft ratio required`);
  }
  if (reviewInsights.mixedUseCount > 0) {
    checkRow(false, 'Split-use tagged transactions — personal portion must be excluded',
      `${reviewInsights.mixedUseCount} item(s) have explicit split_use tag`);
  }
  if (reviewInsights.vehicleCount === 0 && reviewInsights.mealsCount === 0 && reviewInsights.homeOfficeCount === 0 && reviewInsights.mixedUseCount === 0) {
    checkRow(true, 'No allocation-required categories or split-use items detected', '');
  }

  sectionHead('Financial Review');
  checkRow(!hasNegativeProfit, 'Net profit / loss',
    `Income ${formatCurrencyForPdf(totals.income, currency)}, Expenses ${formatCurrencyForPdf(totals.expenses, currency)}` +
    (hasNegativeProfit ? ` — Net loss: review at-risk / passive rules` : ''));
  checkRow(reviewInsights.negativeExpenseCount === 0, 'No negative expense entries',
    reviewInsights.negativeExpenseCount > 0 ? `${reviewInsights.negativeExpenseCount} negative expense(s) — verify credits/refunds` : 'None detected');
  checkRow(reviewInsights.missingDescriptionCount === 0, 'All transactions have descriptions',
    reviewInsights.missingDescriptionCount > 0 ? `${reviewInsights.missingDescriptionCount} missing description(s)` : 'All present');

  canvas.text(40, 80, '[OK] = Ready for review    [!] = CPA attention required before filing', 8);
  canvas.text(40, 66, isCA
    ? 'Confirm province, GST/HST registration, fiscal year, and net-of-GST treatment with preparer before filing T2125.'
    : 'Confirm NAICS code, material participation, and 1099-NEC reconciliation with preparer before filing Schedule C.', 8);

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

  const isCA = normalizeRegionCode(region) === 'CA';

  if (reviewInsights.vehicleCount > 0 || (Array.isArray(mileage) && mileage.length)) {
    ensureSpace(120);
    canvas.text(40, y, isCA ? 'Motor Vehicle Expenses — T2125 Part 4' : 'Vehicle Expenses — Schedule C Line 9', 12, 'F2');
    y -= 18;

    if (reviewInsights.vehicleCount > 0) {
      canvas.text(40, y, `Detected vehicle/fuel transactions: ${reviewInsights.vehicleCount}`, 9);
      y -= 14;
      canvas.text(40, y, `Total vehicle expense amount: ${formatCurrencyForPdf(reviewInsights.vehicleTotal, currency)}`, 9);
      y -= 14;
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
      canvas.text(40, y, labels.mileage_summary_title, 10, 'F2');
      y -= 14;
      if (totalMiles > 0) { canvas.text(40, y, `Total business miles: ${formatDistance(totalMiles)} mi`, 9); y -= 14; }
      if (totalKm > 0) { canvas.text(40, y, `Total business kilometers: ${formatDistance(totalKm)} km`, 9); y -= 14; }
      if (businessPct !== null) { canvas.text(40, y, `Business-use percentage: ${businessPct.toFixed(1)}%`, 9); y -= 14; }
      canvas.text(40, y, labels.mileage_note_csv, 9);
      y -= 14;
    }

    canvas.text(40, y, isCA
      ? 'CRA requires a logbook: date, destination, business purpose, and odometer readings for each trip.'
      : 'IRS requires a contemporaneous mileage log or actual expense records — not both methods in the same year.', 8);
    y -= 18;
  }

  if (reviewInsights.homeOfficeCount > 0) {
    ensureSpace(90);
    canvas.text(40, y, isCA ? 'Business-Use-of-Home — T2125 Part 7' : 'Home Office Deduction — Form 8829', 12, 'F2');
    y -= 18;
    canvas.text(40, y, `Detected home office transactions: ${reviewInsights.homeOfficeCount}`, 9);
    y -= 14;
    canvas.text(40, y, `Total home office amount: ${formatCurrencyForPdf(reviewInsights.homeOfficeTotal, currency)}`, 9);
    y -= 14;
    canvas.text(40, y, isCA
      ? 'Allocation: calculate business sq ft / total home sq ft. Deduction limited to net business income before this expense.'
      : 'Calculate business-use % using sq ft method or other IRS-approved method. Use simplified method or actual expenses (Form 8829).', 8);
    y -= 18;
  }

  if (reviewInsights.mealsCount > 0) {
    ensureSpace(70);
    canvas.text(40, y, isCA ? 'Meals and Entertainment — T2125 Line 8523' : 'Meals — Schedule C Line 24b', 12, 'F2');
    y -= 18;
    canvas.text(40, y, `Detected meal/entertainment transactions: ${reviewInsights.mealsCount}`, 9);
    y -= 14;
    canvas.text(40, y, `Total meals amount: ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)} (50% limit applies — deductible: ${formatCurrencyForPdf(reviewInsights.mealsTotal * 0.5, currency)})`, 9);
    y -= 14;
    canvas.text(40, y, 'Document: business purpose, names of attendees, and date for each meal.', 8);
    y -= 18;
  }

  ensureSpace(170);
  canvas.text(40, y, labels.review_items_title, 12, 'F2');
  y -= 20;
  [
    ['[CRITICAL] ' + labels.review_uncategorized, reviewInsights.uncategorizedCount],
    ['[CRITICAL] Imported categories (not mapped)', reviewInsights.needsCategoryCount || 0],
    ['[HIGH]     ' + labels.review_missing_description, reviewInsights.missingDescriptionCount],
    ['[HIGH]     ' + labels.review_possible_duplicates, reviewInsights.duplicateCount],
    ['[HIGH]     ' + labels.review_negative_expenses, reviewInsights.negativeExpenseCount],
    ['[HIGH]     ' + labels.review_mixed_use, reviewInsights.mixedUseCount],
    ['[MEDIUM]   ' + labels.review_special_categories, reviewInsights.specialCategoryCount],
    ['[MEDIUM]   ' + labels.review_missing_receipts, reviewInsights.missingReceiptCount]
  ].forEach(([label, count]) => {
    canvas.text(40, y, `${label}: ${count}`, 9);
    y -= 13;
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
    let hasNoDeclaration = false;
    let hasMismatch = false;
    for (const p of topPayers) {
      ensureSpace(14);
      canvas.text(40, y, truncateText(p.payer_name, 36), 9);
      canvas.text(260, y, String(p.count), 9);
      canvas.text(320, y, formatCurrencyForPdf(p.total, currency), 9);
      canvas.text(420, y, safeValue(p.declared_form, "—"), 9);
      const expected = p.expected_form || "—";
      const noDecl = Boolean(p.expected_form && !p.declared_form);
      const mismatched = Boolean(p.expected_form && p.declared_form && p.declared_form !== p.expected_form);
      if (noDecl) hasNoDeclaration = true;
      if (mismatched) hasMismatch = true;
      const marker = noDecl ? "*" : (mismatched ? "†" : "");
      canvas.text(490, y, `${expected}${marker}`, 9);
      y -= 14;
    }
    if (payerSummary.payers.length > 12) {
      canvas.text(40, y, `... and ${payerSummary.payers.length - 12} more payers`, 8);
      y -= 14;
    }
    if (hasNoDeclaration) {
      canvas.text(40, y, "* No form declared — form may be required based on payment threshold.", 8);
      y -= 12;
    }
    if (hasMismatch) {
      canvas.text(40, y, "+ Declared form differs from expected form — verify with payer.", 8);
      y -= 12;
    }
    y -= 6;
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
    canvas.text(40, y, `These transactions are uncategorized for tax purposes. Map their categories to a ${normalizeRegionCode(region) === 'CA' ? 'T2125' : 'Schedule C'} line.`, 8);
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
    entityType = '',
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
    excluded: excludedTransactions,
    excludedCount: excludedTransactions.length,
    region: normalizedRegion
  });
  const isSecure = Boolean(String(taxId || '').trim());
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
      accountingMethod,
      entityType: entityType || '',
      region: normalizedRegion,
      province,
      fiscalYearStart,
      address,
      materialParticipation,
      gstHstRegistered,
      gstHstNumber,
      gstHstMethod,
      reviewInsights,
      isSecure
    }),
    ...buildContentsPage(labels, normalizedRegion, taxYear, gstHstRegistered),
    ...buildCategoryPages(includedTransactions, categories, effectiveCurrency, labels, 0, normalizedRegion),
    ...buildTaxPacketPages({ transactions: includedTransactions, categories, receipts, currency: effectiveCurrency, region: normalizedRegion, labels, taxYear }),
    ...buildDeductionPages(includedTransactions, effectiveCurrency, labels, normalizedRegion),
    ...buildTransactionPages(includedTransactions, accounts, categories, effectiveCurrency, labels, normalizedRegion),
    ...buildExclusionPages(excludedTransactions, effectiveCurrency, labels),
    ...buildCpaChecklistPage({
      labels, region: normalizedRegion, isSecure, naics, entityType: entityType || '',
      accountingBasis: accountingMethod || accountingBasis, accountingMethod,
      totals, reviewInsights, currency: effectiveCurrency, legalName, province,
      materialParticipation, gstHstRegistered, mileage
    }),
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
