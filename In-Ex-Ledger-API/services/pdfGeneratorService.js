'use strict';

// Server-side PDF generator — adapted from public/js/pdf_labels.js and public/js/pdf_export.js

const PDF_LABELS = {
  en: {
    report_title: "Business export summary",
    legal_name: "Legal business name",
    business_name: "Operating name (DBA)",
    tax_id: "Tax ID",
    reporting_period: "Reporting period",
    business_activity_code: "Business activity code",
    currency: "Currency",
    total_income: "Total income",
    total_expenses: "Total expenses",
    net_profit: "Net profit",
    estimated_tax: "Estimated tax",
    estimated_tax_disclaimer: "Estimate only — not tax advice.",
    category_breakdown_title: "Category breakdown",
    transaction_log_title: "Transaction ledger",
    receipts_index_title: "Receipts index",
    mileage_summary_title: "Mileage summary",
    mileage_note_csv: "Full detailed mileage log available in CSV export.",
    cpa_edge_cases_title: "CPA edge-case summary",
    cpa_edge_cases_none: "No edge-case items were detected in this reporting period.",
    cpa_edge_case_foreign_currency: "Foreign currency entries",
    cpa_edge_case_capital_item: "Capital items",
    cpa_edge_case_split_use: "Split-use or personal-use entries",
    cpa_edge_case_indirect_tax: "Indirect tax entries",
    cpa_edge_case_needs_review: "Transactions with edge-case flags",
    cpa_edge_case_reason: "Reason",
    cpa_edge_case_transaction: "Transaction"
  },
  es: {
    report_title: "Informe de exportación",
    legal_name: "Nombre legal de la empresa",
    business_name: "Nombre comercial (DBA)",
    tax_id: "Identificación fiscal",
    reporting_period: "Periodo reportado",
    business_activity_code: "Código de actividad",
    currency: "Moneda",
    total_income: "Ingresos totales",
    total_expenses: "Gastos totales",
    net_profit: "Utilidad neta",
    estimated_tax: "Impuesto estimado",
    estimated_tax_disclaimer: "Solo estimado — no constituye consejo fiscal.",
    category_breakdown_title: "Desglose por categoría",
    transaction_log_title: "Registro de transacciones",
    receipts_index_title: "Índice de recibos",
    mileage_summary_title: "Resumen de kilometraje",
    mileage_note_csv: "El registro completo de kilometraje está disponible en el CSV.",
    cpa_edge_cases_title: "Resumen de casos especiales para el CPA",
    cpa_edge_cases_none: "No se detectaron partidas especiales en este período.",
    cpa_edge_case_foreign_currency: "Entradas en moneda extranjera",
    cpa_edge_case_capital_item: "Bienes de capital",
    cpa_edge_case_split_use: "Entradas de uso mixto o personal",
    cpa_edge_case_indirect_tax: "Entradas de impuesto indirecto",
    cpa_edge_case_needs_review: "Transacciones con indicadores especiales",
    cpa_edge_case_reason: "Razón",
    cpa_edge_case_transaction: "Transacción"
  },
  fr: {
    report_title: "Rapport d'exportation",
    legal_name: "Raison sociale",
    business_name: "Nom commercial (DBA)",
    tax_id: "ID fiscal",
    reporting_period: "Période couverte",
    business_activity_code: "Code d'activité",
    currency: "Devise",
    total_income: "Revenus totaux",
    total_expenses: "Dépenses totales",
    net_profit: "Bénéfice net",
    estimated_tax: "Impôt estimé",
    estimated_tax_disclaimer: "Estimation uniquement — pas un conseil fiscal.",
    category_breakdown_title: "Répartition par catégorie",
    transaction_log_title: "Journal des transactions",
    receipts_index_title: "Index des reçus",
    mileage_summary_title: "Résumé du kilométrage",
    mileage_note_csv: "Le journal complet du kilométrage est disponible dans l'export CSV.",
    cpa_edge_cases_title: "Résumé des cas particuliers pour le CPA",
    cpa_edge_cases_none: "Aucun élément particulier détecté pour cette période.",
    cpa_edge_case_foreign_currency: "Entrées en devise étrangère",
    cpa_edge_case_capital_item: "Éléments d'actif immobilisé",
    cpa_edge_case_split_use: "Entrées à usage mixte ou personnel",
    cpa_edge_case_indirect_tax: "Entrées de taxe indirecte",
    cpa_edge_case_needs_review: "Transactions avec indicateurs particuliers",
    cpa_edge_case_reason: "Raison",
    cpa_edge_case_transaction: "Transaction"
  }
};

const CA_TAX_RATES = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15, NS: 0.15,
  NT: 0.05, NU: 0.05, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11, YT: 0.05
};

function getPdfLabels(lang) {
  if (!lang || !PDF_LABELS[lang]) return PDF_LABELS.en;
  return { ...PDF_LABELS.en, ...PDF_LABELS[lang] };
}

class PdfCanvas {
  constructor() {
    this.commands = ['BT'];
  }

  text(x, y, text, size = 11) {
    const fx = Number.isFinite(x) ? x.toFixed(2) : '0.00';
    const fy = Number.isFinite(y) ? y.toFixed(2) : '0.00';
    this.commands.push(`/F1 ${size} Tf`);
    this.commands.push(`1 0 0 1 ${fx} ${fy} Tm`);
    this.commands.push(`${pdfLiteral(text)} Tj`);
  }

  addFooter(pageNumber, totalPages) {
    this.text(260, 30, `Page ${pageNumber} of ${totalPages}`, 9);
  }

  build() {
    return [...this.commands, 'ET'].join('\n');
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
  const r = String(region || '').toLowerCase();
  const p = String(province || '').toUpperCase();
  if (r === 'ca') return CA_TAX_RATES[p] || 0.05;
  return 0.24;
}

function calculateTotals(transactions, region, province) {
  let income = 0;
  let expenses = 0;
  (transactions || []).forEach((txn) => {
    const amount = Math.abs(Number(txn.amount) || 0);
    if (txn.type === 'income') income += amount;
    else expenses += amount;
  });
  const netProfit = income - expenses;
  const taxRate = resolvePdfTaxRate(region, province);
  const estimatedTax = Math.max(0, netProfit) * taxRate;
  return { income, expenses, netProfit, estimatedTax };
}

function formatCurrencyForPdf(value, currency) {
  const formatter = new Intl.NumberFormat(
    currency === 'CAD' ? 'en-CA' : 'en-US',
    { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }
  );
  return formatter.format(Number(value) || 0);
}

function formatDistance(value) {
  return Number(value || 0).toFixed(2);
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

function mapByKey(items, key) {
  return (items || []).reduce((acc, item) => {
    if (item && item[key]) acc[item[key]] = item;
    return acc;
  }, {});
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function buildIdentityPage(data) {
  const { labels, totals, currency, legalName, operatingName, taxId, naics, businessName, startDate, endDate } = data;
  const canvas = new PdfCanvas();
  let y = 760;
  canvas.text(40, y, labels.report_title, 20); y -= 32;
  canvas.text(40, y, `${labels.legal_name}: ${legalName || businessName || '\u2014'}`, 11); y -= 18;
  canvas.text(40, y, `${labels.business_name}: ${operatingName || '\u2014'}`, 11); y -= 18;
  canvas.text(40, y, `${labels.tax_id}: ${taxId || '\u2014'}`, 11); y -= 18;
  canvas.text(40, y, `${labels.business_activity_code}: ${naics || '\u2014'}`, 11); y -= 18;
  canvas.text(40, y, `${labels.reporting_period}:`, 11); y -= 14;
  canvas.text(60, y, `${startDate} \u2013 ${endDate}`, 11); y -= 18;
  canvas.text(40, y, `${labels.currency}: ${currency}`, 11);

  let sy = 680;
  const sx = 400;
  canvas.text(sx, sy, `${labels.total_income}: ${formatCurrencyForPdf(totals.income, currency)}`, 11); sy -= 18;
  canvas.text(sx, sy, `${labels.total_expenses}: ${formatCurrencyForPdf(totals.expenses, currency)}`, 11); sy -= 18;
  canvas.text(sx, sy, `${labels.net_profit}: ${formatCurrencyForPdf(totals.netProfit, currency)}`, 11); sy -= 18;
  canvas.text(sx, sy, `${labels.estimated_tax}: ${formatCurrencyForPdf(totals.estimatedTax, currency)}`, 11); sy -= 22;
  canvas.text(sx, sy, labels.estimated_tax_disclaimer, 9);
  return canvas;
}

function buildCategoryPages(transactions, categories, currency, labels) {
  const categoryMap = mapByKey(categories, 'id');
  const breakdown = {};
  (transactions || []).forEach((txn) => {
    if (txn.type !== 'expense') return;
    const category = categoryMap[txn.category_id || txn.categoryId];
    const label = (category?.tax_label || category?.taxLabel || '').trim() || 'Unmapped';
    breakdown[label] = (breakdown[label] || 0) + Math.abs(Number(txn.amount) || 0);
  });
  const entries = Object.entries(breakdown).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  if (!entries.length) {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16);
    canvas.text(40, 720, 'No expense data available for this reporting period.', 11);
    return [canvas];
  }
  return chunkArray(entries, 28).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16);
    canvas.text(40, 730, 'Tax Label', 11);
    canvas.text(320, 730, 'Total Amount', 11);
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.label, 10);
      canvas.text(320, y, formatCurrencyForPdf(row.amount, currency), 10);
      y -= 16;
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
    canvas.text(40, 760, labels.transaction_log_title, 16);
    canvas.text(40, 720, 'No transactions recorded for this period.', 11);
    return [canvas];
  }
  const rows = sorted.map((txn) => {
    const category = categoryMap[txn.category_id || txn.categoryId];
    const accountName = accountMap[txn.account_id || txn.accountId]?.name || '-';
    const categoryName = category?.name || '-';
    const type = txn.type || (category?.kind === 'income' ? 'income' : 'expense');
    return {
      date: txn.date || '',
      description: truncateText(txn.description || '-', 28),
      typeLabel: type === 'income' ? 'Income' : 'Expense',
      account: truncateText(accountName, 18),
      category: truncateText(categoryName, 18),
      amount: formatCurrencyForPdf(Math.abs(Number(txn.amount) || 0), currency),
      receipt: txn.receipt_id || txn.receiptId ? 'Yes' : 'No'
    };
  });
  return chunkArray(rows, 24).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16);
    const hy = 730;
    canvas.text(40, hy, 'Date', 11); canvas.text(110, hy, 'Description', 11);
    canvas.text(280, hy, 'Type', 11); canvas.text(340, hy, 'Account', 11);
    canvas.text(420, hy, 'Category', 11); canvas.text(500, hy, 'Amount', 11);
    canvas.text(560, hy, 'Receipt', 11);
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.date, 10); canvas.text(110, y, row.description, 10);
      canvas.text(280, y, row.typeLabel, 10); canvas.text(340, y, row.account, 10);
      canvas.text(420, y, row.category, 10); canvas.text(500, y, row.amount, 10);
      canvas.text(560, y, row.receipt, 10);
      y -= 16;
    });
    return canvas;
  });
}

function buildReceiptsPages(receipts, transactions, labels) {
  const txMap = mapByKey(transactions, 'id');
  const filtered = (receipts || []).map((r) => {
    const txnId = r.transaction_id || r.transactionId;
    if (!txnId || !txMap[txnId]) return null;
    const txn = txMap[txnId];
    return { receiptId: r.id || '', txDate: txn.date || '', txDescription: truncateText(txn.description || '-', 30), fileName: r.filename || '\u2014' };
  }).filter(Boolean);
  if (!filtered.length) return [];
  return chunkArray(filtered, 22).map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.receipts_index_title, 16);
    canvas.text(40, 730, 'Receipt ID', 11); canvas.text(160, 730, 'Tx Date', 11);
    canvas.text(260, 730, 'Tx Description', 11); canvas.text(460, 730, 'File Name', 11);
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.receiptId, 10); canvas.text(160, y, row.txDate, 10);
      canvas.text(260, y, row.txDescription, 10); canvas.text(460, y, row.fileName, 10);
      y -= 16;
    });
    return canvas;
  });
}

function buildMileagePage(mileage, labels) {
  if (!Array.isArray(mileage) || !mileage.length) return [];
  const totalMiles = mileage.reduce((s, r) => s + Math.abs(Number(r.miles) || 0), 0);
  const totalKm = mileage.reduce((s, r) => s + Math.abs(Number(r.km) || 0), 0);
  const totalDist = mileage.reduce((s, r) => {
    const start = Number(r.odometer_start), end = Number(r.odometer_end);
    return Number.isFinite(start) && Number.isFinite(end) ? s + Math.abs(end - start) : s;
  }, 0);
  const businessPct = totalDist > 0 ? (totalKm / totalDist) * 100 : null;
  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.mileage_summary_title, 16);
  let y = 720;
  if (totalMiles > 0) { canvas.text(40, y, `Total business miles: ${formatDistance(totalMiles)} mi`, 11); y -= 18; }
  if (totalKm > 0) { canvas.text(40, y, `Total business kilometers: ${formatDistance(totalKm)} km`, 11); y -= 18; }
  if (businessPct !== null) { canvas.text(40, y, `Business %: ${businessPct.toFixed(1)}%`, 11); y -= 18; }
  y -= 12;
  canvas.text(40, y, labels.mileage_note_csv, 10);
  return [canvas];
}

function getEdgeCaseReasons(txn, baseCurrency) {
  const reasons = [];
  const currency = String(txn.currency || baseCurrency).toUpperCase();
  if (currency !== baseCurrency) reasons.push(`${currency} FX`);
  const treatment = String(txn.tax_treatment || txn.taxTreatment || '').toLowerCase();
  if (treatment === 'capital') reasons.push('Capital');
  if (treatment === 'split_use' || Number(txn.personal_use_pct ?? txn.personalUsePct) > 0) reasons.push('Split-use');
  if (Number(txn.indirect_tax_amount ?? txn.indirectTaxAmount) > 0) reasons.push('Indirect tax');
  const status = txn.review_status || txn.reviewStatus;
  if (status && String(status).toLowerCase() !== 'ready') reasons.push(String(status).replace(/_/g, ' '));
  return reasons;
}

function buildEdgeCaseSummaryPage(transactions, labels, region) {
  const records = Array.isArray(transactions) ? transactions : [];
  const baseCurrency = String(region || '').toLowerCase() === 'ca' ? 'CAD' : 'USD';
  const foreignCurrency = records.filter((t) => String(t.currency || baseCurrency).toUpperCase() !== baseCurrency);
  const capitalItems = records.filter((t) => String(t.tax_treatment || t.taxTreatment || '').toLowerCase() === 'capital');
  const splitUseItems = records.filter((t) => {
    const tr = String(t.tax_treatment || t.taxTreatment || '').toLowerCase();
    return tr === 'split_use' || Number(t.personal_use_pct ?? t.personalUsePct) > 0;
  });
  const indirectTaxItems = records.filter((t) => Number(t.indirect_tax_amount ?? t.indirectTaxAmount) > 0);
  const edgeCaseItems = records.filter((t) => getEdgeCaseReasons(t, baseCurrency).length > 0);
  if (!foreignCurrency.length && !capitalItems.length && !splitUseItems.length && !indirectTaxItems.length && !edgeCaseItems.length) return [];

  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.cpa_edge_cases_title, 16);
  let y = 724;
  [
    [labels.cpa_edge_case_foreign_currency, foreignCurrency.length],
    [labels.cpa_edge_case_capital_item, capitalItems.length],
    [labels.cpa_edge_case_split_use, splitUseItems.length],
    [labels.cpa_edge_case_indirect_tax, indirectTaxItems.length],
    [labels.cpa_edge_case_needs_review, edgeCaseItems.length]
  ].forEach(([label, count]) => { canvas.text(40, y, `${label}: ${count}`, 11); y -= 18; });

  y -= 8;
  canvas.text(40, y, labels.cpa_edge_case_reason, 11);
  canvas.text(220, y, labels.cpa_edge_case_transaction, 11);
  canvas.text(500, y, 'Amount', 11);
  y -= 18;

  const reviewRows = edgeCaseItems.slice(0, 10).map((t) => ({
    label: getEdgeCaseReasons(t, baseCurrency).join(', ') || 'Review',
    transaction: truncateText(t.description || '-', 28),
    amount: formatCurrencyForPdf(Math.abs(Number(t.amount) || 0), baseCurrency)
  }));

  if (!reviewRows.length) { canvas.text(40, y, labels.cpa_edge_cases_none, 11); return [canvas]; }
  reviewRows.forEach((row) => {
    canvas.text(40, y, row.label, 10); canvas.text(220, y, row.transaction, 10); canvas.text(500, y, row.amount, 10);
    y -= 16;
  });
  return [canvas];
}

function buildObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function createPdfBytes(pageContents) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageEntries = [];
  let nextId = 4;

  pageContents.forEach((content) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageEntries.push({ contentId, pageId, content });
  });

  const catalog = buildObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const pagesBody = `<< /Type /Pages /Count ${pageEntries.length} /Kids [${pageEntries.map((e) => `${e.pageId} 0 R`).join(' ')}] >>`;
  const pages = buildObject(2, pagesBody);
  const font = buildObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push(catalog, pages, font);

  pageEntries.forEach((entry) => {
    const length = encoder.encode(entry.content).length;
    const streamBody = `<< /Length ${length} >>\nstream\n${entry.content}\nendstream`;
    objects.push(buildObject(entry.contentId, streamBody));
    const resourceBody = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${entry.contentId} 0 R >>`;
    objects.push(buildObject(entry.pageId, resourceBody));
  });

  const parts = ['%PDF-1.3\n'];
  let offset = encoder.encode(parts[0]).length;
  const offsets = [0];
  objects.forEach((obj) => { offsets.push(offset); parts.push(obj); offset += encoder.encode(obj).length; });

  const xrefStart = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push('0000000000 65535 f \n');
  offsets.slice(1).forEach((v) => { parts.push(`${String(v).padStart(10, '0')} 00000 n \n`); });
  parts.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`, `startxref\n${xrefStart}\n`, '%%EOF');

  return Buffer.from(encoder.encode(parts.join('')));
}

function buildPdfExport(options) {
  const {
    transactions = [], accounts = [], categories = [], receipts = [], mileage = [],
    startDate = '', endDate = '', exportLang = 'en', currency = 'USD',
    legalName = '', businessName = '', operatingName = '', taxId = '',
    naics = '', region = 'us', province = ''
  } = options;

  const labels = getPdfLabels(exportLang);
  const totals = calculateTotals(transactions, region, province);
  const categoryPages = buildCategoryPages(transactions, categories, currency, labels);
  const transactionPages = buildTransactionPages(transactions, accounts, categories, currency, labels);
  const receiptsPages = buildReceiptsPages(receipts, transactions, labels);
  const mileagePages = buildMileagePage(mileage, labels);
  const edgeCasePages = buildEdgeCaseSummaryPage(transactions, labels, region);

  const canvases = [
    buildIdentityPage({ labels, totals, currency, legalName, operatingName, taxId, naics, businessName, startDate, endDate }),
    ...edgeCasePages, ...categoryPages, ...transactionPages, ...receiptsPages, ...mileagePages
  ];

  const totalPages = canvases.length;
  const pageContents = canvases.map((canvas, index) => { canvas.addFooter(index + 1, totalPages); return canvas.build(); });
  return createPdfBytes(pageContents);
}

module.exports = { buildPdfExport };
