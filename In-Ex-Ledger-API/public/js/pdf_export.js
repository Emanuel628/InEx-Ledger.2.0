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
  other_income: 'Line 8230 — Other income',
  commission_income: 'Line 8000 — Gross business income',
  contract_labor: 'Line 9270 — Other expenses (subcontractors)',
  commissions: 'Line 9270 — Other expenses (commissions paid)',
  commissions_and_fees: 'Line 9270 — Other expenses (commissions paid)',
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
    .replace(/ß/g, 'ss')
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .replace(/Œ/g, 'OE')
    .replace(/œ/g, 'oe')
    .replace(/Ø/g, 'O')
    .replace(/ø/g, 'o')
    .replace(/Ł/g, 'L')
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/–|—|−/g, '-')
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/ /g, ' ')
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

function normalizeTaxLineText(value, region) {
  const text = String(value || '').trim();
  const isCA = String(region || '').toUpperCase() === 'CA';
  if (!text) return isCA ? 'Unmapped T2125' : 'Unmapped Sch C';
  if (/^(Line\s+\d|T\d{4}|8\d{3}|9\d{3})/i.test(text)) return text;
  const slugKey = text.toLowerCase().replace(/[-\s]+/g, '_');
  const map = isCA ? T2125_LINE_MAP : SCHEDULE_C_LINE_MAP;
  return map[slugKey] || map[text.toLowerCase()] || text;
}

function shortenTaxLine(text) {
  if (!text) return text;
  if (/^Unmapped\b/i.test(text)) return 'Unmapped';
  // "Line 27a/Part V — Other expenses (software)" → "L27a Other"
  // "Line 15 — Insurance (other than health)" → "L15 Insurance"
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
  return [txn.description, txn.note, txn.memo, txn.payee, txn.payee_name, txn.payer_name, txn.reference]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+https?:\/\/\S+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
}

function classifyExcludedTransaction(txn, category) {
  const normalizedType = String(txn?.type || '').toLowerCase();
  const categoryName = category?.name || '';
  const taxMapping = category?.tax_label || category?.taxLabel || category?.tax_map_us || category?.tax_map_ca || '';
  const text = buildTransactionText(txn);
  const combined = `${categoryName} ${taxMapping} ${text}`;

  if (normalizedType === 'transfer' || /(transfer|credit card payment|cc payment|internal transfer|online transfer from sav|online transfer to sav)/i.test(combined)) {
    return 'Transfer / credit-card payment';
  }
  if (/(payment to chase|chase credit crd|chase crd|citi\s*card\s*online|capital one\s*mobile\s*pmt|capital one\s*online\s*pmt|amazon corp syf pay|synchrony bank|affirm\s*\*?\s*pay|klarna|valley bank bill pay|elan financial|discover e-?payment|autopay payment|online payment thank you|amex\s*autopay|bank of america\s*online|discover\s*card\s*pay|barclaycard|credit\s*card\s*autopay|minimum payment|statement balance)/i.test(text)) {
    return 'Credit card payment — not deductible (deduct the underlying card charges instead)';
  }
  if (/\bpayro\b|payroll|w-2\b|salary deposit|employer deposit/i.test(text)) {
    return 'Payroll / wage deposit';
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
    return 'Potential personal use';
  }
  if (String(txn?.tax_treatment || txn?.taxTreatment || '').toLowerCase() === 'split_use' || Number(txn?.personal_use_pct ?? txn?.personalUsePct) > 0) {
    return 'Potential personal use';
  }
  if (/(refund|reimbursement)/i.test(text) && normalizedType !== 'income') {
    return 'Refund / reimbursement review';
  }
  return null;
}

function summarizeExportTransactions(transactions, categories) {
  const categoryMap = mapByKey(categories, 'id');
  const included = [];
  const excluded = [];
  for (const txn of (transactions || [])) {
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const exclusionReason = classifyExcludedTransaction(txn, category);
    if (exclusionReason) {
      excluded.push({ ...txn, __category: category, __exclusionReason: exclusionReason });
    } else {
      included.push({ ...txn, __category: category });
    }
  }
  return { included, excluded };
}

function calculateTotals(transactions) {
  let income = 0;
  let expenses = 0;
  (transactions || []).forEach((txn) => {
    const amount = Math.abs(Number(txn.amount) || 0);
    const normalizedType = String(txn.type || '').toLowerCase();
    if (normalizedType === 'income') {
      income += amount;
      return;
    }
    if (normalizedType === 'expense') {
      expenses += amount;
    }
  });
  return { income, expenses, netProfit: income - expenses, estimatedTax: null };
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

function hasValue(value) {
  return String(value || '').trim().length > 0;
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

function normalizePdfDate(rawValue) {
  if (!rawValue) return '';
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return String(rawValue);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
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
  return /(meal|travel|vehicle|auto|fuel|car|mileage|home office|food|dining|restaurant|entertainment|phone|internet|telephone)/i.test(`${categoryName} ${taxMapping}`);
}

function getTransactionFlags(txn, category, region = 'us') {
  const flags = [];
  const isCA = String(region || '').toUpperCase() === 'CA';
  const taxTreatment = String(txn.tax_treatment || txn.taxTreatment || '').toLowerCase();
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
  if (!String(txn.description || txn.note || '').trim()) flags.push('Missing description');
  if (String(txn.type || '').toLowerCase() !== 'income' && Number(txn.amount) < 0) flags.push('Negative expense');
  if (taxTreatment === 'split_use' || Number(txn.personal_use_pct ?? txn.personalUsePct) > 0) flags.push('Mixed-use');
  if (Number(txn.indirect_tax_amount ?? txn.indirectTaxAmount) > 0) flags.push('Indirect tax');
  const currencyCode = String(txn.currency || '').toUpperCase();
  if (currencyCode && currencyCode !== 'USD' && currencyCode !== 'CAD') flags.push('FX');
  if (hasCategoryId && !isImportedCategory && !taxMapping.trim()) flags.push('Needs tax mapping');
  if (isSpecialReviewCategory(categoryName, taxMapping)) flags.push('Special category');
  return Array.from(new Set(flags));
}

function normalizeDuplicateKey(txn) {
  const description = String(txn.description || txn.note || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const amount = Math.abs(Number(txn.amount) || 0).toFixed(2);
  return `${txn.date || ''}|${amount}|${description}`;
}

function buildReviewInsights(transactions, categories, excluded = [], region = 'us') {
  const isCA = String(region || '').toUpperCase() === 'CA';
  const taxKey = isCA ? 'tax_map_ca' : 'tax_map_us';
  const categoryMap = mapByKey(categories, 'id');
  const duplicateMap = new Map();
  (transactions || []).forEach((txn) => {
    const key = normalizeDuplicateKey(txn);
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  });

  const expenseTransactions = (transactions || []).filter((txn) => String(txn.type || '').toLowerCase() !== 'income');
  const receiptLinkedCount = expenseTransactions.filter((txn) => txn.receipt_id || txn.receiptId).length;

  const excludedArray = Array.isArray(excluded) ? excluded : [];
  const excludedCount = excludedArray.length;
  const exclusionReasonBreakdown = {};
  excludedArray.forEach((txn) => {
    const reason = txn.__exclusionReason || 'Excluded';
    exclusionReasonBreakdown[reason] = (exclusionReasonBreakdown[reason] || 0) + 1;
  });

  const samples = [];
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
    if (!String(txn.description || txn.note || '').trim()) missingDescriptionCount += 1;
    if (duplicateMap.get(normalizeDuplicateKey(txn)) > 1) duplicateCount += 1;
    if (isExpense && Number(txn.amount) < 0) negativeExpenseCount += 1;
    if (flags.includes('Mixed-use')) mixedUseCount += 1;
    if (flags.includes('Special category')) specialCategoryCount += 1;
    if (flags.length) reviewFlagCount += 1;
    if (flags.length && samples.length < 6) {
      samples.push({
        reason: flags.join(', '),
        description: truncateText(buildTransactionText(txn) || '(No description)', 36),
        amount
      });
    }

    if (isExpense) {
      const combined = `${catName} ${taxSlug}`;
      if (/\b(vehicle|auto|fuel|truck|mileage|car_and_truck)\b/.test(combined) || /\bgas\b/.test(combined) || /\bcar\b/.test(catName)) {
        vehicleCount += 1;
        vehicleTotal += amount;
      } else if (/\b(meal|meals|meals_entertainment|dining|entertainment|deductible_meals)\b/.test(combined)) {
        mealsCount += 1;
        mealsTotal += amount;
      } else if (/home[_\s]?office|home[_\s]?business/.test(combined)) {
        homeOfficeCount += 1;
        homeOfficeTotal += amount;
      }
      if ((txn.category_id || txn.categoryId) && !taxSlug) {
        unmappedExpenseCount += 1;
      }
    }
  });

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
    excludedCount,
    exclusionReasonBreakdown,
    receiptLinkedCount,
    missingReceiptCount: Math.max(0, expenseTransactions.length - receiptLinkedCount),
    receiptCoverageText: `${receiptLinkedCount} of ${expenseTransactions.length || 0}`,
    vehicleCount,
    vehicleTotal,
    mealsCount,
    mealsTotal,
    homeOfficeCount,
    homeOfficeTotal,
    unmappedExpenseCount,
    unmappedTaxCount,
    samples
  };
}

function buildCategoryBuckets(transactions, categories, labels, currency, region) {
  const categoryMap = mapByKey(categories, 'id');
  const isCA = String(region || '').toUpperCase() === 'CA';
  const taxKey = isCA ? 'tax_map_ca' : 'tax_map_us';
  const buckets = new Map();

  (transactions || []).forEach((txn) => {
    const categoryId = txn.category_id || txn.categoryId || '';
    const category = categoryMap[categoryId] || null;
    const categoryName = safeValue(category?.name, 'Uncategorized');
    const taxMapping = normalizeTaxLineText(
      category?.[taxKey] || category?.tax_label || category?.taxLabel,
      region
    );
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
    startDate, endDate, reportId, generatedAt, accountingBasis, accountingMethod,
    region, province, reviewInsights, isSecure, categoryPreviewEntries = [],
    address = '', fiscalYearStart = '', entityType = '', materialParticipation = null,
    gstHstRegistered = false, gstHstNumber = ''
  } = data;

  const isCA = String(region || '').toUpperCase() === 'CA';
  const effectiveAccountingMethod = accountingBasis || accountingMethod || '';
  const canvas = new PdfCanvas();
  let y = 760;
  const reportTitle = isCA ? 'Canada CPA Workpaper Export' : 'US CPA Workpaper Export';
  const reportSubtitle = isCA
    ? 'Prepared for T2125 and related CRA bookkeeping review.'
    : 'Prepared for Schedule C and related IRS bookkeeping review.';
  canvas.text(40, y, reportTitle, 18, 'F2'); y -= 20;
  canvas.text(40, y, reportSubtitle, 10); y -= 16;
  canvas.text(40, y, isSecure ? labels.report_subtitle_secure : labels.report_subtitle_redacted, 10); y -= 18;
  canvas.text(40, y, isSecure ? labels.badge_secure : labels.badge_redacted, 11, 'F2');

  const entityRows = [
    [labels.legal_name, safeValue(legalName || businessName)],
    [isSecure ? labels.tax_id : labels.tax_id_redacted, isSecure ? safeValue(taxId) : labels.tax_id_withheld],
    ['Entity type', safeValue(entityType)],
    [labels.business_activity_code, safeValue(naics)],
    [labels.jurisdiction, formatJurisdiction(region, province)],
  ];
  if (hasValue(operatingName)) entityRows.splice(1, 0, [labels.business_name, operatingName]);
  if (hasValue(address)) entityRows.push(['Business address', address]);
  if (isCA && hasValue(fiscalYearStart)) entityRows.push(['Fiscal year start', fiscalYearStart]);
  if (isCA && gstHstRegistered) entityRows.push(['GST/HST registered', gstHstNumber ? `Yes — ${gstHstNumber}` : 'Yes']);

  canvas.text(40, 690, labels.entity_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 670, entityRows);

  const reportingRows = [
    [labels.reporting_period, `${startDate} to ${endDate}`],
    [labels.currency, currency],
    [labels.export_created, formatReportTimestamp(generatedAt)],
    [labels.export_id, reportId],
    [labels.prepared_from, labels.prepared_from_value]
  ];
  if (hasValue(effectiveAccountingMethod)) {
    reportingRows.splice(1, 0, [labels.accounting_basis, effectiveAccountingMethod]);
  }
  if (!isCA && materialParticipation !== null) {
    reportingRows.push(['Material participation', materialParticipation ? 'Yes' : 'No']);
  }

  canvas.text(330, 690, labels.reporting_section_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 670, reportingRows);

  canvas.text(330, 570, labels.financial_summary_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 550, [
    [labels.gross_income, formatCurrencyForPdf(totals.income, currency)],
    [labels.total_expenses, formatCurrencyForPdf(totals.expenses, currency)],
    [labels.net_profit, formatCurrencyForPdf(totals.netProfit, currency)],
    [labels.transaction_count, String(reviewInsights.transactionCount)]
  ]);

  canvas.text(330, 470, labels.tax_estimate_title, 12, 'F2');
  buildKeyValueRows(canvas, 330, 450, [
    [labels.estimated_tax, 'Manual review required']
  ]);
  wrapText(labels.estimated_tax_disclaimer, 34).forEach((line, index) => {
    canvas.text(330, 434 - (index * 14), line, 9);
  });

  canvas.text(40, 550, labels.review_flags_title, 12, 'F2');
  buildKeyValueRows(canvas, 40, 530, [
    [labels.uncategorized_transactions, String(reviewInsights.uncategorizedCount)],
    ['Imported (needs real category)', String(reviewInsights.needsCategoryCount || 0)],
    ['Expenses missing tax mapping', String(reviewInsights.unmappedTaxCount || 0)],
    [labels.review_flagged_transactions, String(reviewInsights.reviewFlagCount)],
    ['Possible duplicate transactions', String(reviewInsights.duplicateCount)],
    [labels.receipt_coverage, reviewInsights.receiptCoverageText],
    ['Excluded non-business items', String(reviewInsights.excludedCount || 0)]
  ]);

  if (categoryPreviewEntries.length) {
    canvas.text(40, 380, labels.category_breakdown_title, 12, 'F2');
    canvas.text(40, 358, labels.col_category, 9, 'F2');
    canvas.text(220, 358, labels.col_tax_mapping, 9, 'F2');
    canvas.text(470, 358, labels.col_amount, 9, 'F2');
    canvas.text(540, 358, labels.col_review_status, 9, 'F2');
    let categoryY = 338;
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

function buildCategoryPages(transactions, categories, currency, labels, region, embeddedCount = 0) {
  const entries = buildCategoryBuckets(transactions, categories, labels, currency, region);
  const remainingEntries = entries.slice(embeddedCount);
  if (!remainingEntries.length) {
    if (entries.length) return [];
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16, 'F2');
    canvas.text(40, 720, labels.no_category_data, 11);
    return [canvas];
  }

  return chunkArray(remainingEntries, 30).map((chunk) => {
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

function buildTransactionPages(transactions, accounts, categories, currency, labels, region) {
  const accountMap = mapByKey(accounts, 'id');
  const categoryMap = mapByKey(categories, 'id');
  const isCA = String(region || '').toUpperCase() === 'CA';
  const taxKey = isCA ? 'tax_map_ca' : 'tax_map_us';
  const sorted = (transactions || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (!sorted.length) {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16, 'F2');
    canvas.text(40, 720, labels.no_transaction_data, 11);
    return [canvas];
  }

  const rowItems = [];
  let lastMonth = '';
  sorted.forEach((txn) => {
    const dateStr = normalizePdfDate(txn.date) || txn.date || '';
    const monthKey = dateStr.slice(0, 7);
    if (monthKey && monthKey !== lastMonth) {
      lastMonth = monthKey;
      const d = new Date(dateStr + 'T12:00:00Z');
      const monthLabel = Number.isNaN(d.getTime())
        ? monthKey
        : d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      rowItems.push({ isHeader: true, label: monthLabel });
    }
    const category = categoryMap[txn.category_id || txn.categoryId] || null;
    const account = accountMap[txn.account_id || txn.accountId] || null;
    const flags = getTransactionFlags(txn, category);
    const isIncome = String(txn.type || '').toLowerCase() === 'income';
    const amount = Math.abs(Number(txn.amount) || 0);
    const taxMapRaw = normalizeTaxLineText(
      category?.[taxKey] || category?.tax_label || category?.taxLabel,
      region
    );

    const noteParts = [];
    const accountName = safeValue(account?.name, '');
    if (accountName && accountName !== 'Not specified') {
      noteParts.push(`Acct: ${truncateText(accountName, 28)}`);
    }
    if (isIncome && (txn.payer_name || txn.payerName)) {
      noteParts.push(`Payer: ${truncateText(txn.payer_name || txn.payerName, 22)}`);
    }
    if (isIncome && (txn.tax_form_type || txn.taxFormType)) {
      noteParts.push(`Form: ${txn.tax_form_type || txn.taxFormType}`);
    }
    if (!(txn.receipt_id || txn.receiptId) && !isIncome && flags.includes('Special category')) {
      noteParts.push(labels.no_receipt_on_file || 'No receipt on file');
    }

    rowItems.push({
      isHeader: false,
      date: dateStr.slice(5),
      payeeMemo: truncateText(buildTransactionText(txn) || '(No description)', 28),
      categoryName: truncateText(safeValue(category?.name, 'Uncategorized'), 22),
      taxMapping: shortenTaxLine(taxMapRaw),
      amountStr: (isIncome ? '+' : '') + formatCurrencyForPdf(amount, currency),
      flagStr: flags.length ? truncateText(flags.join(', '), 16) : labels.review_ok,
      note: noteParts.length ? noteParts.join(' | ') : null
    });
  });

  const pages = [];
  let canvasObj = null;
  let y = 0;
  let isFirstPage = true;

  const startNewPage = () => {
    const c = new PdfCanvas();
    c.text(40, 760, labels.transaction_log_title, 16, 'F2');
    if (!isFirstPage) c.text(220, 760, '(continued)', 9);
    isFirstPage = false;
    c.text(40, 732, labels.col_date, 9, 'F2');
    c.text(86, 732, labels.col_payee_memo, 9, 'F2');
    c.text(262, 732, 'Category', 9, 'F2');
    c.text(368, 732, 'Tax line', 9, 'F2');
    c.text(482, 732, labels.col_amount, 9, 'F2');
    c.text(538, 732, labels.col_flag, 9, 'F2');
    canvasObj = c;
    y = 708;
  };

  startNewPage();

  rowItems.forEach((item) => {
    if (item.isHeader) {
      if (y - 22 < 60) { pages.push(canvasObj); startNewPage(); }
      canvasObj.text(40, y, item.label, 9, 'F2');
      y -= 22;
    } else {
      const needed = 14 + (item.note ? 11 : 0);
      if (y - needed < 60) { pages.push(canvasObj); startNewPage(); }
      canvasObj.text(40, y, item.date, 8);
      canvasObj.text(86, y, item.payeeMemo, 8);
      canvasObj.text(262, y, item.categoryName, 8);
      canvasObj.text(368, y, item.taxMapping, 8);
      canvasObj.text(482, y, item.amountStr, 8);
      canvasObj.text(538, y, item.flagStr, 8);
      y -= 14;
      if (item.note) {
        canvasObj.text(86, y, truncateText(item.note, 76), 7);
        y -= 11;
      }
    }
  });

  pages.push(canvasObj);
  return pages;
}

function buildExclusionPages(excludedTransactions, currency, labels) {
  if (!excludedTransactions.length) return [];

  // Sort oldest → newest for audit traceability
  const sorted = [...excludedTransactions].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  // Build reason summary for first-page header
  const reasonCounts = {};
  sorted.forEach((txn) => {
    const r = txn.__exclusionReason || 'Excluded';
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const reasonSummaryLines = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count}x ${reason}`);

  const ITEMS_PER_PAGE = 28;
  return chunkArray(sorted, ITEMS_PER_PAGE).map((chunk, index) => {
    const canvas = new PdfCanvas();
    const title = index === 0
      ? (labels.exclusion_title || 'Excluded Transfers, Payroll, and Personal Items')
      : (labels.exclusion_continued || 'Excluded Items (continued)');
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
    canvas.text(360, headerY, labels.exclusion_reason || 'Reason for exclusion', 9, 'F2');
    canvas.text(520, headerY, labels.col_amount, 9, 'F2');
    let y = headerY - 16;
    chunk.forEach((txn) => {
      const dateStr = normalizePdfDate(txn.date) || txn.date || '';
      canvas.text(40, y, dateStr, 8);
      canvas.text(120, y, truncateText(buildTransactionText(txn) || '(No description)', 38), 8);
      canvas.text(360, y, truncateText(txn.__exclusionReason || 'Excluded', 26), 8);
      canvas.text(520, y, formatCurrencyForPdf(Math.abs(Number(txn.amount) || 0), currency), 8);
      y -= 14;
    });
    if (index === 0) {
      canvas.text(40, 50, labels.exclusion_note || 'Transfer-like items, payroll wages, and personal-use items should be reviewed separately and are not treated as business P&L.', 8);
    }
    return canvas;
  });
}

function buildCpaChecklistPage(opts) {
  const {
    labels, region, isSecure, naics, entityType, accountingBasis, accountingMethod,
    totals, reviewInsights, currency, legalName, province,
    materialParticipation, gstHstRegistered, mileage
  } = opts;

  const isCA = String(region || '').toUpperCase() === 'CA';
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

  // — Entity and Filing Profile —
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

  // — Documentation and Coverage —
  sectionHead('Documentation and Receipt Coverage');
  const receiptOk = reviewInsights.expenseTransactionCount > 0 && reviewInsights.missingReceiptCount === 0;
  checkRow(receiptOk, 'Receipts attached to all expense transactions',
    `${reviewInsights.receiptLinkedCount} of ${reviewInsights.expenseTransactionCount} covered`);
  checkRow(reviewInsights.uncategorizedCount === 0, 'All transactions categorized',
    reviewInsights.uncategorizedCount > 0 ? `${reviewInsights.uncategorizedCount} uncategorized` : 'All categorized');
  checkRow(reviewInsights.unmappedExpenseCount === 0, 'All expense categories mapped to tax line',
    reviewInsights.unmappedExpenseCount > 0 ? `${reviewInsights.unmappedExpenseCount} expense transaction(s) with unmapped category` : 'All mapped');
  checkRow(reviewInsights.duplicateCount === 0, 'No duplicate transactions detected',
    reviewInsights.duplicateCount > 0 ? `${reviewInsights.duplicateCount} possible duplicate(s)` : 'None detected');
  checkRow(true, 'Personal/transfer items excluded from P&L',
    `${reviewInsights.excludedCount} item(s) excluded and shown in separate schedule`);

  // — Deductibility and Allocation —
  sectionHead('Deductibility and Allocation');
  if (reviewInsights.vehicleCount > 0) {
    checkRow(hasMileageData, isCA ? 'Vehicle — CRA logbook required' : 'Vehicle — mileage log or actual expense doc',
      `${reviewInsights.vehicleCount} transaction(s), ${formatCurrencyForPdf(reviewInsights.vehicleTotal, currency)}${hasMileageData ? ' — mileage data present' : ' — no mileage log attached'}`);
  }
  if (reviewInsights.mealsCount > 0) {
    checkRow(false, isCA ? 'Meals — 50% limit, CRA support required' : 'Meals — 50% limit, business purpose required',
      `${reviewInsights.mealsCount} transaction(s), ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)}`);
  }
  if (reviewInsights.homeOfficeCount > 0) {
    checkRow(false, isCA ? 'Home office — T2125 Part 7 allocation needed' : 'Home office — Form 8829 allocation needed',
      `${formatCurrencyForPdf(reviewInsights.homeOfficeTotal, currency)} — sq ft business-use ratio required`);
  }
  if (reviewInsights.mixedUseCount > 0) {
    checkRow(false, 'Mixed-use / split items — personal portion must be excluded',
      `${reviewInsights.mixedUseCount} item(s) require allocation`);
  }
  if (reviewInsights.vehicleCount === 0 && reviewInsights.mealsCount === 0 && reviewInsights.homeOfficeCount === 0 && reviewInsights.mixedUseCount === 0) {
    checkRow(true, 'No allocation-required categories detected in this export', '');
  }

  // — Financial Review —
  sectionHead('Financial Review');
  checkRow(!hasNegativeProfit, 'Net profit / loss',
    `Income ${formatCurrencyForPdf(totals.income, currency)}, Expenses ${formatCurrencyForPdf(totals.expenses, currency)}` +
    (hasNegativeProfit ? ` — Net loss ${formatCurrencyForPdf(Math.abs(totals.netProfit), currency)}: review at-risk / passive rules` : ''));
  checkRow(reviewInsights.negativeExpenseCount === 0, 'No negative expense entries',
    reviewInsights.negativeExpenseCount > 0 ? `${reviewInsights.negativeExpenseCount} negative expense(s) — verify credits/refunds` : 'None detected');
  checkRow(reviewInsights.missingDescriptionCount === 0, 'All transactions have descriptions',
    reviewInsights.missingDescriptionCount > 0 ? `${reviewInsights.missingDescriptionCount} missing description(s)` : 'All present');

  // Fixed-position footer notes
  canvas.text(40, 80, '[OK] = Ready for review    [!] = CPA attention required before filing', 8);
  canvas.text(40, 66, isCA
    ? 'Confirm province, GST/HST registration, fiscal year, and net-of-GST treatment with preparer before filing T2125.'
    : 'Confirm NAICS code, material participation, and 1099-NEC reconciliation with preparer before filing Schedule C.', 8);

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

function buildSupportPages(receipts, transactions, mileage, labels, currency, reviewInsights, region) {
  const isCA = String(region || '').toUpperCase() === 'CA';
  const txMap = mapByKey(transactions, 'id');
  const receiptRows = (receipts || []).map((receipt) => {
    const txnId = receipt.transaction_id || receipt.transactionId;
    const txn = txMap[txnId];
    if (!txn) return null;
    return {
      receiptId: truncateText(receipt.id || '', 28),
      txDate: normalizePdfDate(txn.date),
      txDescription: truncateText(buildTransactionText(txn) || '(No description)', 26),
      fileName: truncateText(receipt.filename || 'Not specified', 20)
    };
  }).filter(Boolean);

  const pages = [];
  let canvas = new PdfCanvas();
  let y = 760;

  const startPage = () => {
    canvas = new PdfCanvas();
    y = 760;
    canvas.text(40, y, labels.support_title || 'Supporting Schedules and Review', 16, 'F2');
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

  if (receiptRows.length) {
    canvas.text(40, y, labels.receipts_index_title, 12, 'F2');
    y -= 20;
    canvas.text(40, y, labels.col_receipt_id || 'Receipt ID', 9, 'F2');
    canvas.text(170, y, labels.col_tx_date || 'Tx Date', 9, 'F2');
    canvas.text(250, y, labels.col_tx_description || 'Tx Description', 9, 'F2');
    canvas.text(430, y, labels.col_file_name || 'File Name', 9, 'F2');
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

  // — Vehicle and mileage section —
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
      canvas.text(40, y, labels.mileage_summary_title, 10, 'F2');
      y -= 14;
      if (totalMiles > 0) { canvas.text(40, y, `${labels.total_business_miles || 'Total business miles'}: ${formatDistance(totalMiles)} mi`, 9); y -= 14; }
      if (totalKm > 0) { canvas.text(40, y, `${labels.total_business_km || 'Total business kilometers'}: ${formatDistance(totalKm)} km`, 9); y -= 14; }
      canvas.text(40, y, labels.mileage_note_csv, 9);
      y -= 14;
    }

    canvas.text(40, y, isCA
      ? 'CRA requires a logbook: date, destination, business purpose, and odometer readings for each trip.'
      : 'IRS requires a contemporaneous mileage log or actual expense records — not both methods in the same year.', 8);
    y -= 18;
  }

  // — Home office section —
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

  // — Meals deductibility note —
  if (reviewInsights.mealsCount > 0) {
    ensureSpace(70);
    canvas.text(40, y, isCA ? 'Meals and Entertainment — T2125 Line 8523' : 'Meals — Schedule C Line 24b', 12, 'F2');
    y -= 18;
    canvas.text(40, y, `Detected meal/entertainment transactions: ${reviewInsights.mealsCount}`, 9);
    y -= 14;
    canvas.text(40, y, `Total meals amount: ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)} (50% limit applies — deductible portion: ${formatCurrencyForPdf(reviewInsights.mealsTotal * 0.5, currency)})`, 9);
    y -= 14;
    canvas.text(40, y, 'Document: business purpose, names of attendees, and date for each meal. Entertainment generally not deductible under current rules.', 8);
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
    accountingBasis,
    accountingMethod,
    fiscalYearStart = '',
    address = '',
    entityType = '',
    materialParticipation = null,
    gstHstRegistered = false,
    gstHstNumber = '',
    gstHstMethod = ''
  } = options;

  const labels = typeof getPdfLabels === 'function' ? getPdfLabels(exportLang) : {};
  const effectiveGeneratedAt = generatedAt || new Date().toISOString();
  const effectiveReportId = buildReportId(reportId);
  const isSecure = Boolean(String(taxId || '').trim());

  const { included, excluded } = summarizeExportTransactions(transactions, categories);

  const totals = calculateTotals(included);
  const reviewInsights = buildReviewInsights(included, categories, excluded, region);
  const categoryEntries = buildCategoryBuckets(included, categories, labels, currency, region);
  const categoryPreviewEntries = categoryEntries.slice(0, 12);

  const sharedIdentityData = {
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
    accountingMethod,
    region,
    province,
    reviewInsights,
    isSecure,
    categoryPreviewEntries,
    address,
    fiscalYearStart,
    entityType,
    materialParticipation,
    gstHstRegistered,
    gstHstNumber
  };

  const canvases = [
    buildIdentityPage(sharedIdentityData),
    ...buildCategoryPages(included, categories, currency, labels, region, categoryPreviewEntries.length),
    ...buildTransactionPages(included, accounts, categories, currency, labels, region),
    ...buildExclusionPages(excluded, currency, labels),
    ...buildCpaChecklistPage({
      labels, region, isSecure, naics, entityType,
      accountingBasis, accountingMethod, totals, reviewInsights,
      currency, legalName, province, materialParticipation,
      gstHstRegistered, mileage
    }),
    ...buildSupportPages(receipts, included, mileage, labels, currency, reviewInsights, region)
  ];

  const totalPages = canvases.length;
  const pageContents = canvases.map((canvas, index) => {
    canvas.addFooter(index + 1, totalPages, buildFooterText(labels, effectiveReportId, effectiveGeneratedAt, isSecure, index + 1, totalPages));
    return canvas.build();
  });

  return createPdfBytes(pageContents);
}
