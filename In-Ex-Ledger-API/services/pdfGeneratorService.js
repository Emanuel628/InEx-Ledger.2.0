"use strict";

const { getTaxFormThresholds } = require("../utils/taxFormThresholds.js");
const {
  normalizeRegionCode,
  resolveCategorySlugFromName,
  resolveTaxLineFromCategory,
  getTaxMappingRules
} = require("./pdf/taxMappings.js");

const PDF_LABELS = {
  en: {
    us_report_title: "US CPA Workpaper Export",
    ca_report_title: "Canada CPA Workpaper Export",
    secure_badge: "Secure Export",
    redacted_badge: "Redacted Export",
    draft_badge: "Draft - CPA Review Required",
    workpaper_badge: "CPA Workpaper Ready",
    not_filed: "This export is a bookkeeping workpaper, not a filed return.",
    executive_summary: "Executive Summary",
    mapping_summary: "Tax Mapping Summary",
    tax_packet_title_us: "Schedule C Workpaper Review",
    tax_packet_title_ca: "T2125 Workpaper Review",
    ledger_title: "Detailed Transaction Ledger",
    exclusions_title: "Excluded Items Schedule",
    unresolved_exceptions_title: "Unresolved Exceptions Schedule",
    evidence_schedule_title: "Evidence Schedule",
    checklist_title: "CPA Workpaper Checklist",
    support_title: "Supporting Schedules and Final Disclosure",
    payer_review: "Payer/Form Review",
    footer_brand: "InEx Ledger"
  },
  fr: {
    us_report_title: "Export de dossier CPA - Etats-Unis",
    ca_report_title: "Export de dossier CPA - Canada",
    secure_badge: "Export securise",
    redacted_badge: "Export expurge",
    draft_badge: "Brouillon - Revision CPA requise",
    workpaper_badge: "Dossier CPA pret",
    not_filed: "Cet export est un document comptable de travail, non une declaration fiscale deposee.",
    executive_summary: "Resume executif",
    mapping_summary: "Sommaire du mappage fiscal",
    tax_packet_title_us: "Revision du dossier Schedule C",
    tax_packet_title_ca: "Revision du dossier T2125",
    ledger_title: "Grand livre detaille des transactions",
    exclusions_title: "Calendrier des elements exclus",
    unresolved_exceptions_title: "Calendrier des exceptions non resolues",
    evidence_schedule_title: "Calendrier des pieces justificatives",
    checklist_title: "Liste de verification CPA",
    support_title: "Annexes de soutien et divulgation finale",
    payer_review: "Revision payeur/formulaire",
    footer_brand: "InEx Ledger"
  },
  es: {
    us_report_title: "Exportacion de expediente CPA - EE.UU.",
    ca_report_title: "Exportacion de expediente CPA - Canada",
    secure_badge: "Exportacion segura",
    redacted_badge: "Exportacion redactada",
    draft_badge: "Borrador - Revision CPA requerida",
    workpaper_badge: "Expediente CPA listo",
    not_filed: "Esta exportacion es un documento contable de trabajo, no una declaracion de impuestos presentada.",
    executive_summary: "Resumen ejecutivo",
    mapping_summary: "Resumen de mapeo fiscal",
    tax_packet_title_us: "Revision del expediente Schedule C",
    tax_packet_title_ca: "Revision del expediente T2125",
    ledger_title: "Libro mayor detallado de transacciones",
    exclusions_title: "Calendario de elementos excluidos",
    unresolved_exceptions_title: "Calendario de excepciones no resueltas",
    evidence_schedule_title: "Calendario de evidencias",
    checklist_title: "Lista de verificacion CPA",
    support_title: "Anexos de soporte y divulgacion final",
    payer_review: "Revision de pagador/formulario",
    footer_brand: "InEx Ledger"
  }
};

const PAGE = { width: 612, height: 792, margin: 40, top: 752, bottom: 52 };
const COLORS = { black: 0, dark: 0.15, mid: 0.45, light: 0.9, fill: 0.96, fill2: 0.93 };

const FLAG_DESCRIPTIONS = {
  NC: "Needs business category assignment before filing.",
  UM: "No jurisdiction-specific tax line resolved after category review.",
  FC: "Final confirmation still required before relying on the mapped line.",
  RS: "Receipt or support is missing.",
  BP: "Business purpose documentation is required.",
  AL: "Business-use allocation is required.",
  ML: "Mileage log or actual-expense support is required.",
  HO: "Home-office support and square-foot allocation are required.",
  CA: "Capital asset / depreciation review is required.",
  PR: "Possible personal-use item.",
  TR: "Possible transfer or balance movement.",
  RR: "Refund, reversal, or cashback review is required.",
  DUP: "Possible duplicate transaction.",
  MD: "Description is missing or too weak.",
  FX: "Foreign currency / conversion review is required.",
  IT: "Indirect tax review is required.",
  RV: "CPA review is required before filing."
};

const EXCLUSION_DEFINITIONS = {
  TRANSFER: { label: "TRANSFER", title: "Transfer", description: "Account-to-account transfer excluded from business P&L.", includeInPnl: false, severity: "info" },
  CC_PAY: { label: "CC PAY", title: "Credit card payment", description: "Credit-card payment excluded from P&L; deduct underlying card charges instead.", includeInPnl: false, severity: "info" },
  PAYROLL: { label: "PAYROLL", title: "Payroll / wages", description: "Payroll or wage item excluded from sole-prop income/expense totals.", includeInPnl: false, severity: "info" },
  PERSONAL: { label: "PERSONAL", title: "Personal item", description: "Likely personal-use item excluded pending client confirmation.", includeInPnl: false, severity: "review" },
  TAX_REF: { label: "TAX REF", title: "Tax refund", description: "Tax refund excluded from operating income.", includeInPnl: false, severity: "info" },
  TAX_PAY: { label: "TAX PAY", title: "Tax payment", description: "Tax payment excluded from operating expenses pending preparer treatment.", includeInPnl: false, severity: "review" },
  INVEST: { label: "INVEST", title: "Investment transfer", description: "Investment or brokerage movement excluded from business P&L.", includeInPnl: false, severity: "info" },
  LOAN_DEBT: { label: "LOAN/DEBT", title: "Loan or debt payment", description: "Loan or debt principal movement excluded; interest must be reviewed separately.", includeInPnl: false, severity: "review" },
  OWNER_DRAW: { label: "OWNER DRAW", title: "Owner draw", description: "Owner draw excluded from business P&L.", includeInPnl: false, severity: "info" },
  OWNER_CONTRIB: { label: "OWNER CONTRIB", title: "Owner contribution", description: "Owner contribution excluded from business P&L.", includeInPnl: false, severity: "info" },
  REFUND_REV: { label: "REFUND/REV", title: "Refund or reversal", description: "Refund, reimbursement, or reversal excluded until matched to the originating entry.", includeInPnl: false, severity: "review" },
  CASHBACK: { label: "CASHBACK", title: "Cashback or reward", description: "Cashback or reward credit excluded from sales by default.", includeInPnl: false, severity: "review" },
  WIRE_FEE: { label: "WIRE FEE", title: "Wire fee", description: "Wire or transfer fee excluded until business purpose is confirmed.", includeInPnl: false, severity: "review" },
  REVIEW: { label: "REVIEW", title: "Needs review", description: "Excluded pending client or CPA review.", includeInPnl: false, severity: "review" }
};

const NATURE_PATTERNS = {
  payroll_or_wages: [
    /\bpayro\b/i,
    /\bpayroll\b/i,
    /\bwages?\b/i,
    /\bsalary\b/i,
    /\bgivaudan flavors payroll\b/i,
    /\bemployer deposit\b/i,
    /\bdirect deposit.*payroll\b/i
  ],
  credit_card_payment: [
    /\bciti card online payment\b/i,
    /\bpayment to chase card\b/i,
    /\bchase credit card payment\b/i,
    /\bcapital one mobile pmt\b/i,
    /\bamex payment\b/i,
    /\bdiscover e-?payment\b/i,
    /\bonline payment thank you\b/i,
    /\bcredit card autopay\b/i,
    /\bamazon corp syf paymnt\b/i,
    /\bsynchrony\b/i,
    /\bsyf\b/i,
    /\bpaypal credit\b/i,
    /\bvalley bank bill pay\b/i,
    /\bvenmo credit\b/i
  ],
  loan_or_debt_payment: [
    /\baffirm\b/i,
    /\bklarna\b/i,
    /\bloan payment\b/i,
    /\bdebt payment\b/i,
    /\bmortgage\b/i,
    /\bstudent loan\b/i,
    /\bnelnet\b/i,
    /\bnavient\b/i,
    /\bmohela\b/i,
    /\bsallie mae\b/i,
    /\bsofi\b/i,
    /\blendingclub\b/i,
    /\bauto loan\b/i,
    /\bcar loan\b/i,
    /\bpersonal loan\b/i
  ],
  transfer: [
    /\btransfer to sav\b/i,
    /\btransfer from sav\b/i,
    /\bonline transfer to sav\b/i,
    /\bonline transfer from sav\b/i,
    /\bonline realtime transfer\b/i,
    /\brealtime transfer\b/i,
    /\binternal transfer\b/i,
    /\bchecking\/savings transfer\b/i,
    /\bsavings transfer\b/i,
    /\bchecking transfer\b/i,
    /\baffinity transfer\b/i,
    /\bxfer\b/i,
    /\btransfer\b/i
  ],
  investment_transfer: [
    /\bfidelity\b/i,
    /\bvanguard\b/i,
    /\bschwab\b/i,
    /\brobinhood\b/i,
    /\bquestrade\b/i,
    /\bwealthsimple\b/i,
    /\bbrokerage\b/i,
    /\binvestment transfer\b/i
  ],
  tax_refund: [
    /\birs treas\b/i,
    /\btax ref\b/i,
    /\btax refund\b/i,
    /\bnjsttaxrfd\b/i,
    /\bstate of n\.j\.\b/i,
    /\bstate tax refund\b/i,
    /\bcra refund\b/i,
    /\bdept of revenue\b/i
  ],
  tax_payment: [
    /\birs eftps\b/i,
    /\bcra remittance\b/i,
    /\bgst\/hst payment\b/i,
    /\bsales tax payment\b/i,
    /\btax payment\b/i
  ],
  cashback_or_reward: [
    /\bcash redemption\b/i,
    /\bcashback\b/i,
    /\bcash back\b/i,
    /\brewards?\b/i,
    /\breward redemption\b/i,
    /\bstatement credit.*reward\b/i,
    /\bpoints redemption\b/i
  ],
  refund_or_reversal: [
    /\breversal:\b/i,
    /\breversal\b/i,
    /\bmerchant refund\b/i,
    /\bapple\.com\/bill\b/i,
    /\bwalmart credit\b/i,
    /\brefund\b/i,
    /\breimburse/i,
    /\bcredit\/refund\b/i
  ],
  owner_draw: [
    /\bowner draw\b/i,
    /\bdrawing account\b/i
  ],
  owner_contribution: [
    /\bowner contribution\b/i,
    /\bcapital contribution\b/i
  ],
  bank_wire_or_fee_review: [
    /\bonline domestic wire transfer\b/i,
    /\bonline domestic wire fee\b/i,
    /\bwire transfer\b/i,
    /\bwire fee\b/i
  ],
  personal_expense: [
    /\bnetflix\b/i,
    /\bspotify\b/i,
    /\bbeauty\b/i,
    /\bpersonal care\b/i,
    /\bgrocery\b/i,
    /\bwhole foods\b/i,
    /\btrader joe\b/i,
    /\bmortgage\b/i,
    /\bfamily expense\b/i,
    /\bpersonal expense\b/i,
    /\bhaircut\b/i,
    /\bgym membership\b/i
  ]
};

const LIKELY_BUSINESS_INCOME_PATTERNS = [
  /\binvoice\b/i,
  /\bclient\b/i,
  /\bcustomer\b/i,
  /\bsales?\b/i,
  /\bservice\b/i,
  /\b1099-k\b/i,
  /\b1099-nec\b/i,
  /\bt4a\b/i,
  /\bstripe\b/i,
  /\bsquare\b/i,
  /\bshopify\b/i,
  /\bpaypal\b/i,
  /\bvenmo\b/i,
  /\bzelle\b/i
];

function getPdfLabels(lang) {
  return PDF_LABELS[String(lang || "en").toLowerCase()] || PDF_LABELS.en;
}

function normalizePdfText(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, (char) => {
      if (char === "\n") return "\n";
      return "?";
    });
}

function escapePdfLiteral(text) {
  return normalizePdfText(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, "\\n");
}

function pdfLiteral(text) {
  return `(${escapePdfLiteral(text)})`;
}

class PdfCanvas {
  constructor() {
    this.commands = [];
  }

  text(x, y, text, size = 10, font = "F1") {
    const fx = Number(x || 0).toFixed(2);
    const fy = Number(y || 0).toFixed(2);
    this.commands.push("BT");
    this.commands.push(`/${font} ${size} Tf`);
    this.commands.push(`1 0 0 1 ${fx} ${fy} Tm`);
    this.commands.push(`${pdfLiteral(text)} Tj`);
    this.commands.push("ET");
  }

  setStrokeGray(gray) {
    this.commands.push(`${Number(gray).toFixed(3)} G`);
  }

  setFillGray(gray) {
    this.commands.push(`${Number(gray).toFixed(3)} g`);
  }

  drawLine(x1, y1, x2, y2) {
    this.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  drawRect(x, y, width, height) {
    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }

  drawFilledRect(x, y, width, height, fillGray = COLORS.fill) {
    this.setFillGray(fillGray);
    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    this.setFillGray(COLORS.black);
  }

  drawDivider(y) {
    this.setStrokeGray(COLORS.light);
    this.drawLine(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    this.setStrokeGray(COLORS.black);
  }

  drawRightAlignedText(xRight, y, text, size = 10, font = "F1") {
    const normalized = normalizePdfText(text);
    const widthEstimate = normalized.length * size * 0.48;
    this.text(xRight - widthEstimate, y, normalized, size, font);
  }

  drawWrappedText(x, y, text, maxChars = 72, lineHeight = 12, size = 10, font = "F1") {
    const lines = wrapText(text, maxChars);
    lines.forEach((line, index) => {
      this.text(x, y - (index * lineHeight), line, size, font);
    });
    return y - (lines.length * lineHeight);
  }

  drawSectionHeader(title, x, y, options = {}) {
    const width = options.width || (PAGE.width - PAGE.margin * 2);
    this.drawFilledRect(x, y - 14, width, 20, COLORS.fill2);
    this.text(x + 8, y, title, options.size || 11, "F2");
  }

  drawBadge(x, y, text, variant = "neutral") {
    const fillGray = variant === "warning" ? 0.88 : variant === "success" ? 0.92 : 0.94;
    const normalized = normalizePdfText(text);
    const fontSize = 8;
    const width = Math.max(44, normalized.length * 5.6 + 12);
    this.drawFilledRect(x, y - 10, width, 16, fillGray);
    this.drawRect(x, y - 10, width, 16);
    const textWidth = normalized.length * fontSize * 0.48;
    const textX = x + Math.max(4, (width - textWidth) / 2);
    this.text(textX, y - 2, normalized, fontSize, "F2");
    return width;
  }

  drawCard(x, yTop, width, height, title, lines, options = {}) {
    this.drawFilledRect(x, yTop - height, width, height, options.fillGray ?? COLORS.fill);
    this.drawRect(x, yTop - height, width, height);
    this.text(x + 10, yTop - 18, title, 11, "F2");
    let y = yTop - 34;
    for (const line of lines || []) {
      y = this.drawWrappedText(x + 10, y, line, options.maxChars || Math.max(18, Math.floor((width - 18) / 5.6)), 11, 9);
    }
    return yTop - height;
  }

  drawMetricCard(x, yTop, width, height, label, value, note, status) {
    this.drawCard(x, yTop, width, height, label, [String(value || ""), ...(note ? [note] : [])], { fillGray: COLORS.fill });
    if (status) this.drawBadge(x + width - 58, yTop - 18, status, status === "Action" ? "warning" : "neutral");
  }

  drawKeyValueBlock(x, yTop, rows, options = {}) {
    let y = yTop;
    const valueX = x + (options.valueOffset || 122);
    rows.forEach(([label, value]) => {
      this.text(x, y, label, options.labelSize || 9, "F2");
      this.drawWrappedText(valueX, y, safeValue(value, "-"), options.maxChars || 24, 11, options.valueSize || 9);
      y -= options.rowGap || 14;
    });
    return y;
  }

  drawTableHeader(columns, y) {
    this.drawFilledRect(PAGE.margin, y - 12, PAGE.width - PAGE.margin * 2, 18, COLORS.fill2);
    columns.forEach((column) => {
      if (column.align === "right") {
        this.drawRightAlignedText(column.x + column.width, y, column.label, 8, "F2");
      } else {
        this.text(column.x, y, column.label, 8, "F2");
      }
    });
  }

  drawTableRow(columns, values, y, options = {}) {
    if (options.fillGray != null) this.drawFilledRect(PAGE.margin, y - 10, PAGE.width - PAGE.margin * 2, options.rowHeight || 14, options.fillGray);
    columns.forEach((column) => {
      const value = values[column.key] == null ? "" : String(values[column.key]);
      if (column.align === "right") {
        this.drawRightAlignedText(column.x + column.width, y, value, column.size || 8, column.font || "F1");
      } else {
        this.text(column.x, y, value, column.size || 8, column.font || "F1");
      }
    });
  }

  addFooter(pageNumber, totalPages, footerText) {
    this.drawDivider(36);
    this.text(PAGE.margin, 24, footerText || `Page ${pageNumber}/${totalPages}`, 8);
  }

  build() {
    return this.commands.join("\n");
  }
}

function safeValue(value, fallback = "Not specified") {
  const text = String(value || "").trim();
  return text || fallback;
}

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  if (value == null) return false;
  return /^(true|1|yes)$/i.test(String(value));
}

function normalizeMoneyAmount(txn) {
  return Math.abs(Number(txn?.amount) || 0);
}

function resolveIndirectTaxAmount(txn) {
  return Math.abs(Number(txn?.indirect_tax_amount ?? txn?.indirectTaxAmount) || 0);
}

function formatCurrencyForPdf(value, currency = "USD") {
  const safeCurrency = String(currency || "USD").toUpperCase();
  return new Intl.NumberFormat(safeCurrency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatDistance(value) {
  return Number(value || 0).toFixed(2);
}

function normalizePdfDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function formatReportTimestamp(rawValue) {
  const date = rawValue ? new Date(rawValue) : new Date();
  if (Number.isNaN(date.getTime())) return String(rawValue || "");
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function buildReportId(rawValue) {
  if (rawValue) return String(rawValue);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `EXP-${stamp}-${random}`;
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function wrapText(text, maxLength) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else if (word.length > maxLength && !current) {
      lines.push(word.slice(0, maxLength));
      current = word.slice(maxLength);
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function mapByKey(items, key) {
  return (items || []).reduce((acc, item) => {
    if (item && item[key]) acc[item[key]] = item;
    return acc;
  }, {});
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function estimateCardHeight(width, lines, options = {}) {
  const maxChars = options.maxChars || Math.max(18, Math.floor((width - 18) / 5.6));
  const lineHeight = options.lineHeight || 11;
  const headerHeight = options.headerHeight || 34;
  const footerPadding = options.footerPadding || 12;
  const totalLineCount = (lines || []).reduce((sum, line) => sum + wrapText(line, maxChars).length, 0);
  return Math.max(options.minHeight || 68, headerHeight + (totalLineCount * lineHeight) + footerPadding);
}

function buildTransactionText(txn) {
  return [
    txn?.description,
    txn?.note,
    txn?.memo,
    txn?.merchant,
    txn?.payee,
    txn?.payer_name,
    txn?.reference
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function matchesAnyPattern(text, patterns) {
  return (patterns || []).some((pattern) => pattern.test(text));
}

function maskTaxId(value) {
  const text = String(value || "").trim();
  if (!text) return "Withheld";
  if (text.length <= 4) return text;
  return `${text.slice(0, Math.min(5, text.length - 2))}***`;
}

function sanitizePackageActor(value, fallbackLabel, isSecure) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isSecure) return text;
  return fallbackLabel;
}

function normalizeExportCategoryName(category) {
  return String(category?.name || "").trim();
}

function normalizeEntityTypeDisplay(entityType, region) {
  const raw = String(entityType || "").trim().toLowerCase();
  if (!raw) return { label: "Not specified", note: "" };
  const map = {
    sole_prop: { label: "Sole proprietorship", note: "" },
    soleproprietorship: { label: "Sole proprietorship", note: "" },
    sole_proprietorship: { label: "Sole proprietorship", note: "" },
    partnership: { label: "Partnership", note: "" },
    corporation: { label: "Corporation", note: "" },
    corp: { label: "Corporation", note: "" },
    llc: normalizeRegionCode(region) === "CA"
      ? { label: "Foreign/US LLC", note: "Confirm in Canada" }
      : { label: "LLC", note: "" },
    ltd: { label: "Corporation", note: "" },
    inc: { label: "Corporation", note: "" }
  };
  return map[raw] || {
    label: raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    note: ""
  };
}

function getActivityCodeValidation(region, code) {
  const value = String(code || "").trim();
  if (!value) return "Needs review";
  return /^\d{6}$/.test(value) ? "Format OK" : "Needs review";
}

function formatFiscalYearDisplay(fiscalYearStart, endDate) {
  const raw = String(fiscalYearStart || "").trim();
  if (!raw) return "Fiscal year not specified";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const start = new Date(`${raw}T12:00:00Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      end.setUTCDate(end.getUTCDate() - 1);
      return `Fiscal year: ${normalizePdfDate(start)} to ${normalizePdfDate(end)}`;
    }
  }
  if (/^\d{2}-\d{2}$/.test(raw)) return `Fiscal year starts annually on ${raw}`;
  if (endDate) return `Fiscal year start: ${raw} | Confirm with preparer`;
  return `Fiscal year start: ${raw}`;
}

function statusNeedsSupport(status) {
  return Boolean(
    status &&
    !status.needsCategory &&
    status.isMapped &&
    status.flags.some((flag) => ["FC", "RS", "BP", "AL", "ML", "HO", "CA", "RV"].includes(flag))
  );
}

function inferCategorySlug(txn, category, nature) {
  const categoryName = normalizeExportCategoryName(category);
  if (!categoryName) return nature === "business_income" ? "needs_category" : "needs_category";
  const normalizedName = categoryName.toLowerCase();
  if (/^imported expense/i.test(categoryName)) return "needs_category";
  if (/^imported income/i.test(categoryName)) return "needs_category";
  const fromName = resolveCategorySlugFromName(categoryName);
  if (fromName) return fromName;
  const text = `${normalizedName} ${buildTransactionText(txn).toLowerCase()}`;
  if (nature === "business_income") {
    if (/service/i.test(text)) return "service_revenue";
    if (/refund|reimburse/i.test(text)) return "refunds_reimbursements";
    return "sales_revenue";
  }
  return "other_expense";
}

function isLikelyConfirmedBusinessIncome(txn, category) {
  const categoryName = normalizeExportCategoryName(category);
  const text = `${categoryName} ${buildTransactionText(txn)}`.trim();
  if (/^sales revenue$|^service revenue$|^other business income$/i.test(categoryName)) return true;
  if (txn?.tax_form_type || txn?.taxFormType) return true;
  if (txn?.payer_name || txn?.payerName) {
    const payer = String(txn?.payer_name || txn?.payerName).trim();
    if (payer && !/\b(state of|irs|cra|department of revenue)\b/i.test(payer)) return true;
  }
  return matchesAnyPattern(text, LIKELY_BUSINESS_INCOME_PATTERNS);
}

function classifyTransactionNature(txn, category) {
  const type = String(txn?.type || "").toLowerCase();
  const categoryName = normalizeExportCategoryName(category).toLowerCase();
  const text = `${categoryName} ${buildTransactionText(txn).toLowerCase()}`;

  if (/split/i.test(String(txn?.tax_treatment || txn?.taxTreatment || ""))) return "split_transaction";
  if (matchesAnyPattern(text, NATURE_PATTERNS.payroll_or_wages)) return "payroll_or_wages";
  if (matchesAnyPattern(text, NATURE_PATTERNS.credit_card_payment)) return "credit_card_payment";
  if (matchesAnyPattern(text, NATURE_PATTERNS.loan_or_debt_payment)) return "loan_or_debt_payment";
  if (matchesAnyPattern(text, NATURE_PATTERNS.investment_transfer)) return "investment_transfer";
  if (matchesAnyPattern(text, NATURE_PATTERNS.bank_wire_or_fee_review)) return "bank_wire_or_fee_review";
  if (type === "transfer" || matchesAnyPattern(text, NATURE_PATTERNS.transfer)) return "transfer";
  if (matchesAnyPattern(text, NATURE_PATTERNS.owner_draw)) return "owner_draw";
  if (matchesAnyPattern(text, NATURE_PATTERNS.owner_contribution)) return "owner_contribution";
  if (type === "income" && matchesAnyPattern(text, NATURE_PATTERNS.tax_refund)) return "tax_refund";
  if (type !== "income" && matchesAnyPattern(text, NATURE_PATTERNS.tax_payment)) return "tax_payment";
  if (matchesAnyPattern(text, NATURE_PATTERNS.cashback_or_reward)) return "cashback_or_reward";
  if (matchesAnyPattern(text, NATURE_PATTERNS.refund_or_reversal)) return "refund_or_reversal";
  if (matchesAnyPattern(text, NATURE_PATTERNS.personal_expense)) return "personal_expense";
  if (type === "income" && !isLikelyConfirmedBusinessIncome(txn, category)) return "unknown_needs_review";
  if (type === "income") return "business_income";
  if (type === "expense") return "business_expense";
  return "unknown_needs_review";
}

function classifyExcludedTransaction(txn, category, region) {
  const nature = classifyTransactionNature(txn, category, region);
  const map = {
    transfer: "TRANSFER",
    credit_card_payment: "CC_PAY",
    payroll_or_wages: "PAYROLL",
    personal_expense: "PERSONAL",
    tax_refund: "TAX_REF",
    tax_payment: "TAX_PAY",
    investment_transfer: "INVEST",
    loan_or_debt_payment: "LOAN_DEBT",
    owner_draw: "OWNER_DRAW",
    owner_contribution: "OWNER_CONTRIB",
    refund_or_reversal: "REFUND_REV",
    cashback_or_reward: "CASHBACK",
    bank_wire_or_fee_review: "WIRE_FEE"
  };
  const code = map[nature] || null;
  if (!code) return null;
  return { code, ...EXCLUSION_DEFINITIONS[code] };
}

function deriveBusinessAmounts(txn, category, options = {}) {
  const amount = normalizeMoneyAmount(txn);
  const region = normalizeRegionCode(options.region);
  const gstHstRegistered = coerceBoolean(options.gstHstRegistered);
  const gstHstMethod = String(options.gstHstMethod || "regular").toLowerCase();
  const taxAmount = resolveIndirectTaxAmount(txn);
  const categorySlug = inferCategorySlug(txn, category, classifyTransactionNature(txn, category));

  let netAmount = amount;

  // CA GST/HST: strip indirect tax from the expense base ONLY under the Regular Method.
  // Under the Quick Method the registrant does not claim ITCs, so the full amount
  // (including GST/HST paid) remains a deductible business expense (ITA s. 20(1)(c) / ETA).
  if (region === "CA" && gstHstRegistered && gstHstMethod === "regular" && taxAmount > 0) {
    netAmount = Math.max(0, amount - taxAmount);
  }

  let deductibleAmount = netAmount;
  let nonDeductibleAmount = 0;

  // Statutory 50% meals limitation: IRC s. 274(n) (US) / ITA s. 67.1 (CA).
  if (categorySlug === "meals") {
    deductibleAmount = Number((netAmount * 0.50).toFixed(2));
    nonDeductibleAmount = Number((netAmount - deductibleAmount).toFixed(2));
  }

  // Entertainment is 100% nondeductible for US filers since TCJA (IRC §274(a)).
  // Track the spend for documentation; deductible amount is zero.
  // Note: CA uses meals_entertainment (50% under ITA s.67.1), not this slug.
  if (categorySlug === "entertainment" && region === "US") {
    deductibleAmount = 0;
    nonDeductibleAmount = netAmount;
  }

  // Capital assets bypass the current-year deduction entirely; they enter a
  // depreciation / CCA schedule (Schedule C line 13 / T2125 line 9936).
  if (categorySlug === "equipment_capital_asset") {
    deductibleAmount = 0;
    nonDeductibleAmount = netAmount;
  }

  // Vehicle claim override: if this transaction has a registered claim detail
  // (mileage or actual expense), replace the deductible amount with the auditor-computed value.
  // This resolves the ML/AL flags and corrects net profit to use audited figures.
  const vehicleClaim = options.vehicleClaim;
  if (vehicleClaim && vehicleClaim.calculated_deduction != null) {
    deductibleAmount = Number(Number(vehicleClaim.calculated_deduction).toFixed(2));
    nonDeductibleAmount = Number(Math.max(0, netAmount - deductibleAmount).toFixed(2));
  }

  // Phone/internet split-use: apply the stored personal-use percentage.
  const txPersonalUsePct = Number(txn?.personal_use_pct ?? txn?.personalUsePct) || 0;
  if (txPersonalUsePct > 0 && categorySlug === "phone_internet" && !vehicleClaim) {
    deductibleAmount = Number((netAmount * (1 - txPersonalUsePct / 100)).toFixed(2));
    nonDeductibleAmount = Number((netAmount - deductibleAmount).toFixed(2));
  }

  return {
    grossAmount: Number(amount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    netAmount: Number(netAmount.toFixed(2)),
    deductibleAmount: Number(deductibleAmount.toFixed(2)),
    nonDeductibleAmount: Number(nonDeductibleAmount.toFixed(2))
  };
}

function buildTransactionStatus(txn, category, context = {}) {
  const region = normalizeRegionCode(context.region);
  const nature = classifyTransactionNature(txn, category);
  const categorySlug = inferCategorySlug(txn, category, nature);
  const taxLineDisplay = resolveTaxLineFromCategory({ categorySlug, category, region });
  const isIncome = String(txn?.type || "").toLowerCase() === "income";
  const isExpense = !isIncome;
  const flags = [];
  const text = buildTransactionText(txn).toLowerCase();
  const hasReceipt = Boolean(txn?.receipt_id || txn?.receiptId || context.receiptTxIds?.has(txn?.id));
  const importedIncome = /^imported income/i.test(normalizeExportCategoryName(category));
  const importedExpense = /^imported expense/i.test(normalizeExportCategoryName(category));
  const missingCategoryId = !(txn?.category_id || txn?.categoryId);
  const duplicate = context.duplicateKeys?.get(normalizeDuplicateKey(txn)) > 1;
  const personalUsePct = Number(txn?.personal_use_pct ?? txn?.personalUsePct) || 0;
  const currencyCode = String(txn?.currency || "").toUpperCase();
  const supportArtifacts = Array.isArray(context.supportArtifacts) ? context.supportArtifacts : [];
  const supportArtifactTypes = new Set(
    supportArtifacts
      .filter((artifact) => String(artifact?.review_status || artifact?.reviewStatus || "pending").trim().toLowerCase() !== "rejected")
      .filter((artifact) => String(artifact?.storage_status || artifact?.storageStatus || "present").trim().toLowerCase() !== "deleted")
      .map((artifact) => String(artifact?.artifact_type || artifact?.artifactType || "").trim().toLowerCase())
      .filter(Boolean)
  );

  let categoryStatus = "mapped";
  let taxMapStatus = taxLineDisplay ? "mapped" : "unmapped";
  let supportStatus = "ready";

  if (missingCategoryId || importedExpense || importedIncome || categorySlug === "needs_category") {
    categoryStatus = "needs_category";
    flags.push("NC");
  }
  if ((importedExpense || (missingCategoryId && isExpense)) && !flags.includes("UM")) {
    flags.push("UM");
  }
  if (!String(txn?.description || txn?.note || "").trim()) flags.push("MD");
  if (duplicate) flags.push("DUP");
  if (personalUsePct > 0 || /personal/.test(text)) flags.push("PR");
  if (currencyCode && !["USD", "CAD", ""].includes(currencyCode)) flags.push("FX");
  if (resolveIndirectTaxAmount(txn) > 0) flags.push("IT");

  const mappedReviewCategory = ["vehicle_fuel", "vehicle_maintenance", "vehicle_parking_tolls", "meals", "phone_internet", "insurance_vehicle", "home_office", "equipment_capital_asset", "travel"].includes(categorySlug);
  const needsFinalConfirmation = mappedReviewCategory;
  const hasSupportReceipt = supportArtifactTypes.has("receipt") || supportArtifactTypes.has("invoice");
  const hasReviewNote = supportArtifactTypes.has("review_note");
  const hasMileageLog = supportArtifactTypes.has("mileage_log");
  const hasAllocationWorksheet = supportArtifactTypes.has("allocation_worksheet");
  const hasHomeOfficeWorksheet = supportArtifactTypes.has("home_office_worksheet");
  const hasCapitalAssetSupport = supportArtifactTypes.has("capital_asset_support");
  const needsMileageLog = ["vehicle_fuel", "vehicle_parking_tolls"].includes(categorySlug) && !hasMileageLog;
  const needsBusinessPurpose = ["meals", "travel"].includes(categorySlug) && !hasReviewNote;
  const needsAllocation = ["phone_internet", "insurance_vehicle", "vehicle_fuel", "vehicle_maintenance", "vehicle_parking_tolls", "home_office"].includes(categorySlug)
    && !(hasAllocationWorksheet || hasHomeOfficeWorksheet)
    && !(categorySlug === "phone_internet" && personalUsePct > 0);
  const needsHomeOfficeSupport = categorySlug === "home_office" && !hasHomeOfficeWorksheet;
  const needsCapitalAssetReview = categorySlug === "equipment_capital_asset" && !hasCapitalAssetSupport;
  const needsReceipt = isExpense && !hasReceipt && !hasSupportReceipt && !["needs_category"].includes(categorySlug);
  const incomeNeedsReview = isIncome && (importedIncome || nature === "unknown_needs_review");
  const hasFinalConfirmationSupport = (() => {
    if (context.vehicleClaim) return true;
    if (["vehicle_fuel", "vehicle_parking_tolls"].includes(categorySlug)) {
      return hasMileageLog || hasAllocationWorksheet;
    }
    if (["vehicle_maintenance", "insurance_vehicle"].includes(categorySlug)) {
      return hasAllocationWorksheet;
    }
    if (["meals", "travel"].includes(categorySlug)) {
      return hasReviewNote;
    }
    if (categorySlug === "phone_internet") {
      return hasAllocationWorksheet || personalUsePct > 0;
    }
    if (categorySlug === "home_office") {
      return hasHomeOfficeWorksheet || hasAllocationWorksheet;
    }
    if (categorySlug === "equipment_capital_asset") {
      return hasCapitalAssetSupport || !!context.capitalAsset;
    }
    return false;
  })();

  if (nature === "refund_or_reversal" || nature === "cashback_or_reward") flags.push("RR");
  if (nature === "transfer" || nature === "credit_card_payment") flags.push("TR");
  if (nature === "unknown_needs_review" || incomeNeedsReview) flags.push("RV");

  if (categoryStatus === "needs_category") {
    supportStatus = importedIncome && /refund|reversal|cash.?back|reward/.test(text) ? "refund_reversal_match_needed" : "payer_support_needed";
  }

  if (!taxLineDisplay && categoryStatus !== "needs_category" && nature !== "business_income") {
    taxMapStatus = "unmapped";
    flags.push("UM");
  }

  if (needsFinalConfirmation && !hasFinalConfirmationSupport) flags.push("FC");
  if (needsReceipt) flags.push("RS");
  if (needsBusinessPurpose) flags.push("BP");
  if (needsAllocation) flags.push("AL");
  if (needsMileageLog) flags.push("ML");
  if (needsHomeOfficeSupport) flags.push("HO");
  if (needsCapitalAssetReview) flags.push("CA");

  // If a Phase 2 vehicle claim has been registered, the mileage/allocation requirement is satisfied.
  if (context.vehicleClaim) {
    const idx = (f) => flags.indexOf(f);
    ["ML", "AL", "FC"].forEach((f) => { if (idx(f) !== -1) flags.splice(idx(f), 1); });
  }
  // If a capital asset record exists for this transaction, the CA review flag is satisfied.
  if (context.capitalAsset) {
    const caIdx = flags.indexOf("CA");
    if (caIdx !== -1) flags.splice(caIdx, 1);
    const fcIdx = flags.indexOf("FC");
    if (fcIdx !== -1) flags.splice(fcIdx, 1);
  }

  if (categoryStatus === "needs_category") supportStatus = "category_required";
  else if (needsHomeOfficeSupport) supportStatus = "home_office_support_needed";
  else if (needsCapitalAssetReview && !context.capitalAsset) supportStatus = "capital_asset_review_needed";
  else if (needsMileageLog && !context.vehicleClaim) supportStatus = "mileage_log_needed";
  else if (needsBusinessPurpose) supportStatus = "business_purpose_needed";
  else if (needsAllocation && !context.vehicleClaim) supportStatus = "allocation_needed";
  else if (needsReceipt) supportStatus = "receipt_missing";
  else if (nature === "refund_or_reversal" || nature === "cashback_or_reward") supportStatus = "refund_reversal_match_needed";
  else if (flags.includes("RV")) supportStatus = "cpa_review";

  const severity = categoryStatus === "needs_category" || taxMapStatus === "unmapped"
    ? "action"
    : (flags.length ? "review" : "mapped");

  const supportPhrases = [];
  if (categoryStatus === "needs_category") supportPhrases.push("Assign category");
  if (needsReceipt) supportPhrases.push("Receipt needed");
  if (needsBusinessPurpose) supportPhrases.push("Business purpose needed");
  if (needsMileageLog) supportPhrases.push("Mileage log needed");
  if (needsAllocation) supportPhrases.push("Allocation needed");
  if (needsHomeOfficeSupport) supportPhrases.push("Home-office support needed");
  if (needsCapitalAssetReview) supportPhrases.push("Capital asset review");
  if (flags.includes("RR")) supportPhrases.push("Refund/reversal review");
  if (flags.includes("RV")) supportPhrases.push("CPA review required");

  return {
    nature,
    categorySlug,
    categoryStatus,
    taxMapStatus,
    supportStatus,
    severity,
    flags: Array.from(new Set(flags)),
    taxLineDisplay: categoryStatus === "needs_category"
      ? "Needs category / no tax line yet"
      : (taxLineDisplay || (nature === "business_income" ? (region === "CA" ? "Line 8000 - Gross business income" : "Line 1 - Gross receipts or sales") : "Unmapped")),
    supportSummary: supportPhrases.join(" + ") || "Mapped",
    isMapped: categoryStatus !== "needs_category" && (Boolean(taxLineDisplay) || nature === "business_income"),
    needsCategory: categoryStatus === "needs_category",
    needsFinalConfirmation,
    needsReceipt,
    needsBusinessPurpose,
    needsAllocation,
    needsMileageLog,
    needsHomeOfficeSupport,
    needsCapitalAssetReview
  };
}

function normalizeDuplicateKey(txn) {
  return `${normalizePdfDate(txn?.date)}|${Math.abs(Number(txn?.amount) || 0).toFixed(2)}|${String(txn?.description || txn?.note || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function summarizeExportTransactions(transactions, categories, options = {}) {
  const categoryMap = mapByKey(categories || [], "id");
  const receiptTxIds = new Set((options.receipts || []).map((receipt) => receipt?.transaction_id || receipt?.transactionId));
  const supportArtifactMap = options.supportArtifactMap instanceof Map ? options.supportArtifactMap : new Map();
  const duplicateKeys = new Map();
  for (const txn of transactions || []) {
    const key = normalizeDuplicateKey(txn);
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }

  // Phase 2 compliance maps: keyed by transaction ID.
  // vehicleClaimMap: Map<txId, vehicle_expense_details row> — overrides deductible amount
  // capitalAssetTxMap: Map<txId, capital_assets row> — resolves CA flag
  const vehicleClaimMap = options.vehicleClaimMap instanceof Map ? options.vehicleClaimMap : new Map();
  const capitalAssetTxMap = options.capitalAssetTxMap instanceof Map ? options.capitalAssetTxMap : new Map();

  const included = [];
  const excluded = [];

  for (const txn of transactions || []) {
    const category = categoryMap[txn?.category_id || txn?.categoryId] || txn?.__category || null;
    const exclusionReason = classifyExcludedTransaction(txn, category, options.region);
    const vehicleClaim = vehicleClaimMap.get(txn.id) || null;
    const capitalAsset = capitalAssetTxMap.get(txn.id) || null;
    const supportArtifacts = supportArtifactMap.get(txn.id) || [];
    const businessAmounts = deriveBusinessAmounts(txn, category, { ...options, vehicleClaim });
    const status = buildTransactionStatus(txn, category, {
      region: options.region,
      receiptTxIds,
      duplicateKeys,
      vehicleClaim,
      capitalAsset,
      supportArtifacts
    });
    const enriched = {
      ...txn,
      __category: category,
      __businessAmounts: businessAmounts,
      __status: status,
      __exclusionReason: exclusionReason,
      __vehicleClaim: vehicleClaim,
      __capitalAsset: capitalAsset,
      __supportArtifacts: supportArtifacts
    };
    if (exclusionReason) excluded.push(enriched);
    else included.push(enriched);
  }

  return { included, excluded };
}

function calculateTotals(transactions, options = {}) {
  let income = 0;
  let expenses = 0;
  for (const txn of transactions || []) {
    const type = String(txn?.type || "").toLowerCase();
    if (type === "income") income += Number(txn?.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn));
    else if (type === "expense") expenses += Number(txn?.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn));
  }
  // Capital asset depreciation is added to expenses separately; the underlying transactions
  // have deductibleAmount = 0 until their CCA/MACRS schedule is worked out.
  const capitalDepreciation = Number(options.capitalDepreciation || 0);
  const totalExpenses = expenses + capitalDepreciation;
  return {
    income: Number(income.toFixed(2)),
    expenses: Number(totalExpenses.toFixed(2)),
    capitalDepreciation: Number(capitalDepreciation.toFixed(2)),
    netProfit: Number((income - totalExpenses).toFixed(2)),
    estimatedTax: null
  };
}

function transactionHasReceiptSupport(txn, supportArtifactMap) {
  const supportArtifacts = supportArtifactMap instanceof Map ? (supportArtifactMap.get(txn?.id) || []) : [];
  return supportArtifacts.some((artifact) => {
    const reviewStatus = String(artifact?.review_status || artifact?.reviewStatus || "pending").trim().toLowerCase();
    const storageStatus = String(artifact?.storage_status || artifact?.storageStatus || "present").trim().toLowerCase();
    const type = String(artifact?.artifact_type || artifact?.artifactType || "").trim().toLowerCase();
    return reviewStatus !== "rejected" &&
      storageStatus !== "deleted" &&
      (type === "receipt" || type === "invoice");
  });
}

function computeReceiptCoverage(transactions, receipts, supportArtifactMap) {
  const expenseTxIds = new Set((transactions || []).filter((t) => String(t.type || "").toLowerCase() === "expense").map((t) => t.id));
  const withReceipt = new Set();
  for (const receipt of receipts || []) {
    const txId = receipt?.transaction_id || receipt?.transactionId;
    if (expenseTxIds.has(txId)) withReceipt.add(txId);
  }
  for (const txn of transactions || []) {
    if (!expenseTxIds.has(txn?.id)) continue;
    if (transactionHasReceiptSupport(txn, supportArtifactMap)) {
      withReceipt.add(txn.id);
    }
  }
  const expenseCount = expenseTxIds.size;
  const coveragePct = expenseCount === 0 ? null : Number(((withReceipt.size / expenseCount) * 100).toFixed(1));
  return {
    expense_count: expenseCount,
    with_receipt: withReceipt.size,
    missing: Math.max(0, expenseCount - withReceipt.size),
    coverage_pct: coveragePct
  };
}

function computeAttachedReceiptSummary(transactions, receipts, supportArtifactMap) {
  const includedTxIds = new Set((transactions || []).map((txn) => txn?.id).filter(Boolean));
  const txWithReceipts = new Set();
  let attachedFileCount = 0;
  for (const receipt of receipts || []) {
    const txId = receipt?.transaction_id || receipt?.transactionId;
    if (!includedTxIds.has(txId)) continue;
    txWithReceipts.add(txId);
    attachedFileCount += 1;
  }
  if (supportArtifactMap instanceof Map) {
    for (const [txId, artifacts] of supportArtifactMap.entries()) {
      if (!includedTxIds.has(txId)) continue;
      const receiptArtifacts = (artifacts || []).filter((artifact) => {
        const reviewStatus = String(artifact?.review_status || artifact?.reviewStatus || "pending").trim().toLowerCase();
        const storageStatus = String(artifact?.storage_status || artifact?.storageStatus || "present").trim().toLowerCase();
        const type = String(artifact?.artifact_type || artifact?.artifactType || "").trim().toLowerCase();
        return reviewStatus !== "rejected" &&
          storageStatus !== "deleted" &&
          (type === "receipt" || type === "invoice");
      });
      if (!receiptArtifacts.length) continue;
      txWithReceipts.add(txId);
      attachedFileCount += receiptArtifacts.length;
    }
  }
  return {
    transaction_count: txWithReceipts.size,
    file_count: attachedFileCount
  };
}

function summarizeSupportArtifacts(transactions, supportArtifactMap) {
  const txIds = new Set((transactions || []).map((txn) => txn?.id).filter(Boolean));
  const summary = {
    totalCount: 0,
    transactionCount: 0,
    acceptedCount: 0,
    pendingCount: 0,
    reviewNoteCount: 0,
    mileageLogCount: 0,
    allocationWorksheetCount: 0,
    homeOfficeWorksheetCount: 0,
    capitalAssetSupportCount: 0,
    receiptLikeCount: 0
  };

  if (!(supportArtifactMap instanceof Map)) {
    return summary;
  }

  for (const [transactionId, artifacts] of supportArtifactMap.entries()) {
    if (!txIds.has(transactionId)) continue;
    const eligible = (artifacts || []).filter((artifact) => {
      const storageStatus = String(artifact?.storage_status || artifact?.storageStatus || "present").trim().toLowerCase();
      return storageStatus !== "deleted";
    });
    if (!eligible.length) continue;

    summary.transactionCount += 1;
    for (const artifact of eligible) {
      const type = String(artifact?.artifact_type || artifact?.artifactType || "").trim().toLowerCase();
      const reviewStatus = String(artifact?.review_status || artifact?.reviewStatus || "pending").trim().toLowerCase();
      summary.totalCount += 1;
      if (reviewStatus === "accepted") summary.acceptedCount += 1;
      else summary.pendingCount += 1;

      if (type === "review_note") summary.reviewNoteCount += 1;
      else if (type === "mileage_log") summary.mileageLogCount += 1;
      else if (type === "allocation_worksheet") summary.allocationWorksheetCount += 1;
      else if (type === "home_office_worksheet") summary.homeOfficeWorksheetCount += 1;
      else if (type === "capital_asset_support") summary.capitalAssetSupportCount += 1;
      else if (type === "receipt" || type === "invoice") summary.receiptLikeCount += 1;
    }
  }

  return summary;
}

function buildReceiptFilenameMap(receipts) {
  const map = new Map();
  for (const receipt of receipts || []) {
    const txId = receipt?.transaction_id || receipt?.transactionId;
    if (!txId) continue;
    const filename = String(receipt?.filename || "").trim();
    if (!filename) continue;
    const current = map.get(txId) || [];
    current.push(filename);
    map.set(txId, current);
  }
  return map;
}

function expectedTaxFormForPayer({ region, total, transactionCount, taxYear }) {
  const normalizedRegion = normalizeRegionCode(region);
  const thresholds = getTaxFormThresholds(normalizedRegion, taxYear);
  if (normalizedRegion === "CA") return total >= thresholds.t4a ? "T4A" : null;
  if (total >= thresholds.kAmount && transactionCount >= thresholds.kCount) return "1099-K";
  return total >= thresholds.nec ? "1099-NEC" : null;
}

function computePayerSummary(transactions, region, taxYear) {
  const byPayer = new Map();
  for (const txn of transactions || []) {
    if (String(txn?.type || "").toLowerCase() !== "income") continue;
    const payer = String(txn?.payer_name || txn?.payerName || "").trim() || "(unspecified)";
    const entry = byPayer.get(payer) || { payer_name: payer, total: 0, count: 0, declared_forms: new Map() };
    const amount = Number(txn?.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn));
    entry.total += amount;
    entry.count += 1;
    const form = txn?.tax_form_type || txn?.taxFormType || null;
    if (form && form !== "none") entry.declared_forms.set(form, (entry.declared_forms.get(form) || 0) + amount);
    byPayer.set(payer, entry);
  }
  const payers = Array.from(byPayer.values()).map((entry) => ({
    payer_name: entry.payer_name,
    total: Number(entry.total.toFixed(2)),
    count: entry.count,
    declared_form: Array.from(entry.declared_forms.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    expected_form: expectedTaxFormForPayer({ region, total: entry.total, transactionCount: entry.count, taxYear })
  })).sort((a, b) => b.total - a.total);
  return {
    total_income: Number(payers.reduce((sum, payer) => sum + payer.total, 0).toFixed(2)),
    payer_count: payers.length,
    payers
  };
}

function computeTaxLineSummary(transactions, categories, region) {
  const categoryMap = mapByKey(categories || [], "id");
  const incomeLines = new Map();
  const expenseLines = new Map();
  let unmapped_total = 0;
  let unmapped_count = 0;
  let mapped_review_total = 0;
  let mapped_review_count = 0;
  let mapped_ready_total = 0;
  let mapped_ready_count = 0;
  let imported_total = 0;
  let imported_count = 0;

  for (const txn of transactions || []) {
    const category = txn.__category || categoryMap[txn?.category_id || txn?.categoryId] || null;
    const status = txn.__status || buildTransactionStatus(txn, category, { region });
    const amount = String(txn?.type || "").toLowerCase() === "income"
      ? Number(txn?.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn))
      : Number(txn?.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn));

    if (status.needsCategory) {
      imported_total += amount;
      imported_count += 1;
    } else if (!status.isMapped && String(txn?.type || "").toLowerCase() === "expense") {
      unmapped_total += amount;
      unmapped_count += 1;
    } else if (status.flags.some((flag) => ["FC", "RS", "BP", "AL", "ML", "HO", "CA", "RV"].includes(flag)) && String(txn?.type || "").toLowerCase() === "expense") {
      mapped_review_total += amount;
      mapped_review_count += 1;
    } else if (String(txn?.type || "").toLowerCase() === "expense") {
      mapped_ready_total += amount;
      mapped_ready_count += 1;
    }

    const targetMap = String(txn?.type || "").toLowerCase() === "income" ? incomeLines : expenseLines;
    const key = status.taxLineDisplay;
    const entry = targetMap.get(key) || { tax_line: key, total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    targetMap.set(key, entry);
  }

  return {
    income_lines: Array.from(incomeLines.values()).map((entry) => ({ ...entry, total: Number(entry.total.toFixed(2)) })).sort((a, b) => b.total - a.total),
    expense_lines: Array.from(expenseLines.values()).map((entry) => ({ ...entry, total: Number(entry.total.toFixed(2)) })).sort((a, b) => b.total - a.total),
    unmapped_total: Number(unmapped_total.toFixed(2)),
    unmapped_count,
    mapped_review_total: Number(mapped_review_total.toFixed(2)),
    mapped_review_count,
    mapped_ready_total: Number(mapped_ready_total.toFixed(2)),
    mapped_ready_count,
    imported_total: Number(imported_total.toFixed(2)),
    imported_count
  };
}

function buildReviewInsights(transactions, categories, receipts, meta = {}) {
  const supportArtifactMap = meta.supportArtifactMap instanceof Map ? meta.supportArtifactMap : new Map();
  const coverage = computeReceiptCoverage(transactions, receipts, supportArtifactMap);
  const attachmentSummary = computeAttachedReceiptSummary(transactions, receipts, supportArtifactMap);
  const excluded = Array.isArray(meta.excluded) ? meta.excluded : [];
  const byExclusionCode = {};
  let needsCategoryCount = 0;
  let unmappedTaxCount = 0;
  let mappedNeedsSupportCount = 0;
  let missingDescriptionCount = 0;
  let duplicateCount = 0;
  let missingReceiptCount = 0;
  let mappedReceiptSupportCount = 0;
  let vehicleCount = 0;
  let vehicleTotal = 0;
  let mealsCount = 0;
  let mealsTotal = 0;
  let phoneAllocationCount = 0;
  let phoneAllocationTotal = 0;
  let homeOfficeCount = 0;
  let homeOfficeTotal = 0;
  let capitalAssetCount = 0;
  let capitalAssetTotal = 0;
  const flagged = [];

  for (const txn of transactions || []) {
    const status = txn.__status;
    const amount = Number(txn?.__businessAmounts?.deductibleAmount ?? txn?.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn));
    if (status.needsCategory) needsCategoryCount += 1;
    if (!status.needsCategory && !status.isMapped && String(txn?.type || "").toLowerCase() === "expense") unmappedTaxCount += 1;
    if (statusNeedsSupport(status)) mappedNeedsSupportCount += 1;
    if (status.flags.includes("MD")) missingDescriptionCount += 1;
    if (status.flags.includes("DUP")) duplicateCount += 1;
    if (status.flags.includes("RS")) missingReceiptCount += 1;
    if (status.flags.includes("RS") && !status.needsCategory && status.isMapped) mappedReceiptSupportCount += 1;
    if (["vehicle_fuel", "vehicle_maintenance", "vehicle_parking_tolls", "insurance_vehicle"].includes(status.categorySlug)) {
      vehicleCount += 1;
      vehicleTotal += amount;
    }
    if (status.categorySlug === "meals") {
      mealsCount += 1;
      mealsTotal += amount;
    }
    if (status.categorySlug === "phone_internet") {
      phoneAllocationCount += 1;
      phoneAllocationTotal += amount;
    }
    if (status.categorySlug === "home_office") {
      homeOfficeCount += 1;
      homeOfficeTotal += amount;
    }
    if (status.categorySlug === "equipment_capital_asset") {
      capitalAssetCount += 1;
      capitalAssetTotal += amount;
    }
    if (status.flags.length) {
      flagged.push({
        amount,
        description: buildTransactionText(txn) || "(No description)",
        reason: status.flags.join(" ")
      });
    }
  }

  for (const txn of excluded) {
    const code = txn?.__exclusionReason?.code || "REVIEW";
    const amount = normalizeMoneyAmount(txn);
    if (!byExclusionCode[code]) {
      byExclusionCode[code] = { code, label: EXCLUSION_DEFINITIONS[code]?.label || code, count: 0, amount: 0 };
    }
    byExclusionCode[code].count += 1;
    byExclusionCode[code].amount += amount;
  }

  flagged.sort((a, b) => b.amount - a.amount);

  return {
    transactionCount: (transactions || []).length,
    expenseTransactionCount: coverage.expense_count,
    receiptLinkedCount: coverage.with_receipt,
    transactionWithReceiptCount: attachmentSummary.transaction_count,
    attachedReceiptFileCount: attachmentSummary.file_count,
    expenseWithoutReceiptAttachmentCount: coverage.missing,
    receiptCoverageText: `${coverage.with_receipt} of ${coverage.expense_count}`,
    missingReceiptCount,
    mappedReceiptSupportCount,
    needsCategoryCount,
    unmappedTaxCount,
    mappedNeedsSupportCount,
    missingDescriptionCount,
    duplicateCount,
    uncategorizedCount: needsCategoryCount,
    reviewFlagCount: flagged.length,
    excludedCount: excluded.length,
    exclusionReasonBreakdown: Object.fromEntries(Object.entries(byExclusionCode).map(([code, row]) => [code, row.count])),
    exclusionSummary: Object.values(byExclusionCode).map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)) })).sort((a, b) => b.amount - a.amount),
    vehicleCount,
    vehicleTotal: Number(vehicleTotal.toFixed(2)),
    mealsCount,
    mealsTotal: Number(mealsTotal.toFixed(2)),
    phoneAllocationCount,
    phoneAllocationTotal: Number(phoneAllocationTotal.toFixed(2)),
    homeOfficeCount,
    homeOfficeTotal: Number(homeOfficeTotal.toFixed(2)),
    capitalAssetCount,
    capitalAssetTotal: Number(capitalAssetTotal.toFixed(2)),
    samples: flagged.slice(0, 6).map((item) => ({
      reason: item.reason,
      description: truncateText(item.description, 42),
      amount: item.amount
    }))
  };
}

function buildExclusionSummary(excluded, currency) {
  const summary = {};
  for (const txn of excluded || []) {
    const code = txn?.__exclusionReason?.code || "REVIEW";
    if (!summary[code]) {
      const definition = EXCLUSION_DEFINITIONS[code] || EXCLUSION_DEFINITIONS.REVIEW;
      summary[code] = { code, label: definition.label, count: 0, amount: 0, title: definition.title, description: definition.description };
    }
    summary[code].count += 1;
    summary[code].amount += normalizeMoneyAmount(txn);
  }
  return Object.values(summary).map((row) => ({
    ...row,
    amount_display: formatCurrencyForPdf(row.amount, currency),
    amount: Number(row.amount.toFixed(2))
  })).sort((a, b) => b.amount - a.amount);
}

function buildCpaActionLines(reviewInsights, currency) {
  return [
    `${reviewInsights.needsCategoryCount} imported / uncategorized transactions need real category assignment.`,
    `${reviewInsights.unmappedTaxCount} categorized transactions remain truly unmapped after category review.`,
    `${reviewInsights.mappedReceiptSupportCount} mapped expense rows still missing receipt or support document.`,
    `${reviewInsights.attachedReceiptFileCount} receipt file${reviewInsights.attachedReceiptFileCount !== 1 ? "s" : ""} linked total - ${reviewInsights.receiptLinkedCount} to expense rows, ${Math.max(0, reviewInsights.transactionWithReceiptCount - reviewInsights.receiptLinkedCount)} to non-expense rows.`,
    `${reviewInsights.expenseWithoutReceiptAttachmentCount} expense transactions do not have receipt attachments.`,
    `${reviewInsights.vehicleCount} vehicle items require mileage or actual-expense support.`,
    `${reviewInsights.mealsCount} meal items require business-purpose support.`,
    `${reviewInsights.phoneAllocationCount} phone/internet items require business-use allocation.`,
    `${reviewInsights.homeOfficeCount} home-office items require worksheet support.`,
    `${reviewInsights.capitalAssetCount} capital asset items require asset review support.`
  ];
}

function buildCleanupPriorityLines(reviewInsights) {
  const rawPriorities = [];
  if (reviewInsights.needsCategoryCount > 0) rawPriorities.push(`Categorize ${reviewInsights.needsCategoryCount} imported or uncategorized transaction${reviewInsights.needsCategoryCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.unmappedTaxCount > 0) rawPriorities.push(`Map ${reviewInsights.unmappedTaxCount} categorized expense transaction${reviewInsights.unmappedTaxCount !== 1 ? "s" : ""} to a tax line.`);
  if (reviewInsights.expenseWithoutReceiptAttachmentCount > 0) rawPriorities.push(`Add receipts or support for ${reviewInsights.expenseWithoutReceiptAttachmentCount} expense row${reviewInsights.expenseWithoutReceiptAttachmentCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.vehicleCount > 0) rawPriorities.push(`Link mileage or actual-expense support for ${reviewInsights.vehicleCount} vehicle item${reviewInsights.vehicleCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.mealsCount > 0) rawPriorities.push(`Document business purpose for ${reviewInsights.mealsCount} meal item${reviewInsights.mealsCount !== 1 ? "s" : ""} (50% limit applies).`);
  if (reviewInsights.phoneAllocationCount > 0) rawPriorities.push(`Set business-use percentage for ${reviewInsights.phoneAllocationCount} phone/internet item${reviewInsights.phoneAllocationCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.homeOfficeCount > 0) rawPriorities.push(`Attach worksheet support for ${reviewInsights.homeOfficeCount} home-office item${reviewInsights.homeOfficeCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.capitalAssetCount > 0) rawPriorities.push(`Attach asset review support for ${reviewInsights.capitalAssetCount} capital item${reviewInsights.capitalAssetCount !== 1 ? "s" : ""}.`);
  if (reviewInsights.duplicateCount > 0) rawPriorities.push(`Review ${reviewInsights.duplicateCount} potential duplicate transaction${reviewInsights.duplicateCount !== 1 ? "s" : ""} flagged in the ledger.`);
  return rawPriorities;
}

function buildSupportWorksheetLines(reviewInsights, artifactSummary, currency) {
  const lines = [];
  if (reviewInsights.homeOfficeCount > 0) {
    lines.push(`Home office: ${reviewInsights.homeOfficeCount} totaling ${formatCurrencyForPdf(reviewInsights.homeOfficeTotal, currency)}`);
  }
  if (reviewInsights.capitalAssetCount > 0) {
    lines.push(`Capital assets: ${reviewInsights.capitalAssetCount} totaling ${formatCurrencyForPdf(reviewInsights.capitalAssetTotal, currency)}`);
  }
  if (reviewInsights.homeOfficeCount > 0 || reviewInsights.capitalAssetCount > 0) {
    lines.push(`Home-office worksheets: ${artifactSummary.homeOfficeWorksheetCount} | Asset support files: ${artifactSummary.capitalAssetSupportCount}`);
  }
  if (reviewInsights.homeOfficeCount > 0 && reviewInsights.capitalAssetCount > 0) {
    lines.push("Worksheet allocation and depreciation / CCA support still required.");
  } else if (reviewInsights.homeOfficeCount > 0) {
    lines.push("Square-foot allocation and worksheet support still required.");
  } else if (reviewInsights.capitalAssetCount > 0) {
    lines.push("Depreciation / CCA support still required before final handoff.");
  }
  return lines;
}

function buildUnresolvedSummaryLines(flagged) {
  const rows = Array.isArray(flagged) ? flagged : [];
  return [
    `${rows.filter((txn) => txn.__status.flags.includes("NC")).length} transactions still need a real business category.`,
    `${rows.filter((txn) => txn.__status.flags.includes("UM")).length} categorized expense transactions still need tax-line mapping.`,
    `${rows.filter((txn) => txn.__status.flags.includes("RS")).length} transactions still need receipt or source support.`,
    `${rows.filter((txn) => txn.__status.flags.some((flag) => ["ML", "BP", "AL", "HO", "CA"].includes(flag))).length} transactions still need schedule-specific support.`,
    `${rows.filter((txn) => txn.__status.flags.includes("RV")).length} transactions still need CPA review before filing.`
  ];
}

function buildFinalDisclosureLines(reviewInsights, artifactSummary, labels) {
  return [
    "Potential deductible amounts shown here are bookkeeping workpaper estimates only.",
    `${labels.statusBadgeText}. ${labels.not_filed}`,
    `${reviewInsights.attachedReceiptFileCount} receipt file${reviewInsights.attachedReceiptFileCount !== 1 ? "s" : ""} linked; ${artifactSummary.totalCount} additional support artifact${artifactSummary.totalCount !== 1 ? "s" : ""} linked across ${artifactSummary.transactionCount} transaction${artifactSummary.transactionCount !== 1 ? "s" : ""}.`
  ];
}

function buildChecklistItems(reviewInsights, currency, reviewDecisionSummary = {}, packageAttribution = {}, isSecure = true) {
  const nonExpenseWithReceipt = Math.max(0, reviewInsights.transactionWithReceiptCount - reviewInsights.receiptLinkedCount);
  const receiptNonExpenseNote = nonExpenseWithReceipt > 0 ? ` ${nonExpenseWithReceipt} linked to non-expense rows.` : "";
  return [
    { badge: reviewInsights.missingReceiptCount > 0 ? "ACTION" : "OK", title: "Receipts", description: `${reviewInsights.attachedReceiptFileCount} receipt file${reviewInsights.attachedReceiptFileCount !== 1 ? "s" : ""} linked total. ${reviewInsights.receiptLinkedCount} are linked to expense rows and count toward receipt coverage.${receiptNonExpenseNote}` },
    { badge: reviewInsights.needsCategoryCount > 0 ? "ACTION" : "OK", title: "Category cleanup", description: `${reviewInsights.needsCategoryCount} imported or uncategorized transactions need real business categories before filing.` },
    { badge: reviewInsights.unmappedTaxCount > 0 ? "ACTION" : "OK", title: "Tax-line mapping", description: `${reviewInsights.unmappedTaxCount} categorized expense transactions still need a real tax-line mapping after category review.` },
    { badge: reviewInsights.vehicleCount > 0 ? "ACTION" : "OK", title: "Vehicle support", description: `${reviewInsights.vehicleCount} vehicle/fuel transactions totaling ${formatCurrencyForPdf(reviewInsights.vehicleTotal, currency)} need mileage or actual-expense support.` },
    { badge: reviewInsights.mealsCount > 0 ? "REVIEW" : "OK", title: "Meals", description: `${reviewInsights.mealsCount} meal transactions totaling ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)} require business purpose documentation. Potential 50% limit applies.` },
    { badge: reviewInsights.phoneAllocationCount > 0 ? "ACTION" : "OK", title: "Phone / Internet allocation", description: `${reviewInsights.phoneAllocationCount} phone/internet transactions totaling ${formatCurrencyForPdf(reviewInsights.phoneAllocationTotal, currency)} require business-use allocation.` },
    { badge: reviewInsights.homeOfficeCount > 0 ? "ACTION" : "OK", title: "Home office support", description: `${reviewInsights.homeOfficeCount} home-office transactions totaling ${formatCurrencyForPdf(reviewInsights.homeOfficeTotal, currency)} need worksheet support and square-foot allocation.` },
    { badge: reviewInsights.capitalAssetCount > 0 ? "ACTION" : "OK", title: "Capital asset review", description: `${reviewInsights.capitalAssetCount} capital asset transactions totaling ${formatCurrencyForPdf(reviewInsights.capitalAssetTotal, currency)} need depreciation or CCA review support.` },
    { badge: "OK", title: "Excluded non-business items", description: `${reviewInsights.excludedCount} non-business items were excluded from P&L and listed in a separate schedule.` },
    { badge: Number(reviewDecisionSummary.openHard || 0) > 0 ? "ACTION" : Number(reviewDecisionSummary.openWarning || 0) > 0 ? "REVIEW" : "OK", title: "Reviewer decisions", description: `${Number(reviewDecisionSummary.openHard || 0)} hard reviewer issues and ${Number(reviewDecisionSummary.openWarning || 0)} warning reviewer issues remain open. ${Number(reviewDecisionSummary.waived || 0)} issues were waived and ${Number(reviewDecisionSummary.resolved || 0)} were resolved before export.` },
    { badge: packageAttribution.certifiedByName ? "OK" : "REVIEW", title: "Package attribution", description: buildPackageAttributionLines(packageAttribution, isSecure).join(". ") || "Package generation and finalization attribution will appear after reviewer actions and finalized export certification are recorded." }
  ];
}

function isWorkpaperReady(reviewInsights = {}) {
  return Number(reviewInsights.reviewFlagCount || 0) === 0
    && Number(reviewInsights.needsCategoryCount || 0) === 0
    && Number(reviewInsights.unmappedTaxCount || 0) === 0
    && Number(reviewInsights.mappedNeedsSupportCount || 0) === 0
    && Number(reviewInsights.missingDescriptionCount || 0) === 0
    && Number(reviewInsights.duplicateCount || 0) === 0;
}

function shortenTaxLine(text) {
  const value = String(text || "").trim();
  if (!value) return "Unmapped";
  if (/^Needs category \/ no tax line yet$/i.test(value)) return "Needs category";
  const compactMap = [
    [/^Line 1\b.*gross receipts/i, "L1 Gross receipts"],
    [/^Line 6\b.*other income/i, "L6 Other income"],
    [/^Line 8\b.*advertising/i, "L8 Advertising"],
    [/^Line 9\b/i, "L9 Vehicle"],
    [/^Line 11\b/i, "L11 Contract labor"],
    [/^Line 13\b/i, "L13 Depreciation"],
    [/^Line 15\b/i, "L15 Insurance"],
    [/^Line 17\b/i, "L17 Legal/accounting"],
    [/^Line 18\b/i, "L18 Office"],
    [/^Line 20b\b/i, "L20b Rent/lease"],
    [/^Line 21\b/i, "L21 Repairs"],
    [/^Line 22\b/i, "L22 Supplies"],
    [/^Line 23\b/i, "L23 Taxes/licenses"],
    [/^Line 24a\b/i, "L24a Travel"],
    [/^Line 24b\b/i, "L24b Meals"],
    [/^Line 25\/27a\b.*phone/i, "L25/27a Phone/util"],
    [/^Line 25\b.*utilities/i, "L25 Utilities"],
    [/^Line 27a\b.*software/i, "L27a Software"],
    [/^Line 27a\b.*other expenses/i, "L27a Other expenses"],
    [/^Line 30\b/i, "L30 Home office"],
    [/^Line 8000\b/i, "L8000 Gross income"],
    [/^Line 8230\b/i, "L8230 Other income"],
    [/^Line 8520\b/i, "L8520 Advertising"],
    [/^Line 8523\b/i, "L8523 Meals"],
    [/^Line 8690\b/i, "L8690 Insurance"],
    [/^Line 8710\b/i, "L8710 Interest/bank"],
    [/^Line 8760\b/i, "L8760 Taxes/licenses"],
    [/^Line 8810\b/i, "L8810 Office"],
    [/^Line 8811\b/i, "L8811 Supplies"],
    [/^Line 8860\b/i, "L8860 Professional fees"],
    [/^Line 8912\b/i, "L8912 Rent"],
    [/^Line 8960\b/i, "L8960 Repairs"],
    [/^Line 9060\b/i, "L9060 Wages"],
    [/^Line 9200\b/i, "L9200 Travel"],
    [/^Line 9220\b/i, "L9220 Utilities"],
    [/^Line 9270\b.*telephone/i, "L9270 Phone/util"],
    [/^Line 9270\b/i, "L9270 Other expenses"],
    [/^Line 9281\b/i, "L9281 Motor vehicle"],
    [/^Line 9936\b/i, "L9936 CCA review"],
    [/^Line 9945\b/i, "L9945 Home office"],
    [/^Cost of goods sold/i, "COGS / resale"]
  ];
  for (const [pattern, label] of compactMap) {
    if (pattern.test(value)) return label;
  }
  if (/^Line\s+\d+/i.test(value)) {
    const match = value.match(/^Line\s+([^ ]+)/i);
    if (match) return `L${match[1]}`;
  }
  return truncateText(value, 24);
}

function resolveBusinessCurrency(region, currency) {
  const normalizedRegion = normalizeRegionCode(region);
  const desired = String(currency || "").toUpperCase();
  if (!desired) return normalizedRegion === "CA" ? "CAD" : "USD";
  return desired;
}

function normalizeYesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not specified";
}

function validateExportProfile(profile = {}) {
  const region = normalizeRegionCode(profile.region);
  const missing = [];
  if (!String(profile.legalName || profile.businessName || "").trim()) missing.push(["legal_name", "Legal business name"]);
  if (!String(profile.naics || "").trim()) missing.push(["business_activity_code", "Business activity code"]);
  if (!String(profile.address || "").trim()) missing.push(["address", "Business address"]);
  if (!String(profile.accountingMethod || profile.accountingBasis || "").trim()) missing.push(["accounting_method", "Accounting method"]);
  if (region === "US") {
    if (profile.materialParticipation == null) missing.push(["material_participation", "Material participation"]);
  } else {
    if (!String(profile.province || "").trim()) missing.push(["province", "Province"]);
    if (!String(profile.fiscalYearStart || "").trim()) missing.push(["fiscal_year_start", "Fiscal year start"]);
    if (coerceBoolean(profile.gstHstRegistered)) {
      if (!String(profile.gstHstNumber || "").trim()) missing.push(["gst_hst_number", "GST/HST registration number"]);
      if (!String(profile.gstHstMethod || "").trim()) missing.push(["gst_hst_method", "GST/HST accounting method"]);
    }
  }
  if (!missing.length) return;
  const error = new Error(`Export blocked due to missing required business details: ${missing.map(([, label]) => label).join(", ")}`);
  error.status = 400;
  error.missingFieldKeys = missing.map(([key]) => key);
  error.missingFields = missing.map(([, label]) => label);
  throw error;
}

function ensureSpace(state, requiredHeight, startNewPage) {
  if (state.y - requiredHeight < PAGE.bottom) startNewPage();
}

function estimateTextWidth(text, size = 10) {
  return String(text || "").length * size * 0.48;
}

function drawReportHeader(canvas, { title, subtitle, badges = [] }) {
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;
  const top = PAGE.height - PAGE.margin;
  const titleY = top - 20;
  const subtitleY = top - 44;
  const badgeRowY = top - 70;
  const bandHeight = 104;
  canvas.drawFilledRect(left, top - bandHeight, width, bandHeight, COLORS.fill2);
  canvas.drawRect(left, top - bandHeight, width, bandHeight);
  canvas.text(left + 12, titleY, title, 18, "F2");
  canvas.text(left + 12, subtitleY, subtitle, 9);

  let badgeX = left + 12;
  badges.forEach((badge) => {
    const widthValue = canvas.drawBadge(badgeX, badgeRowY, badge.text, badge.variant);
    badgeX += widthValue + 8;
  });

  return {
    top,
    bottom: top - bandHeight,
    contentStartY: top - 120
  };
}

function buildIdentityPage(data) {
  const {
    labels, totals, currency, legalName, operatingName, taxId, naics, startDate, endDate,
    reportId, generatedAt, accountingBasis, accountingMethod, entityType, region, province,
    fiscalYearStart, address, materialParticipation, gstHstRegistered, gstHstNumber, gstHstMethod,
    reviewInsights, isSecure
  } = data;

  const regionCode = normalizeRegionCode(region);
  const entityTypeDisplay = normalizeEntityTypeDisplay(entityType, regionCode);
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, { title: regionCode === "CA" ? labels.ca_report_title : labels.us_report_title, subtitle: regionCode === "CA" ? "Prepared for T2125 bookkeeping review" : "Prepared for Schedule C bookkeeping review", badges: [
    { text: isSecure ? labels.secure_badge : labels.redacted_badge, variant: "neutral" },
    { text: labels.statusBadgeText, variant: labels.statusBadgeVariant }
  ] });

  canvas.text(PAGE.margin, header.contentStartY, labels.executive_summary, 13, "F2");
  canvas.drawDivider(header.contentStartY - 8);

  const cardTop = header.contentStartY - 22;
  canvas.drawCard(40, cardTop, 252, 126, "Entity / Profile", [
    `Legal business name: ${safeValue(legalName)}`,
    ...(String(operatingName || "").trim() ? [`Operating name (DBA): ${operatingName}`] : []),
    `Tax ID: ${isSecure ? safeValue(taxId) : "Withheld"}`,
    `Entity type: ${entityTypeDisplay.label}`,
    ...(entityTypeDisplay.note ? [`Filing treatment: ${entityTypeDisplay.note}`] : []),
    `Business activity code: ${safeValue(naics)}`,
    `Validation: ${getActivityCodeValidation(regionCode, naics)}`,
    `Jurisdiction: ${regionCode}${province ? `-${String(province).toUpperCase()}` : ""}`,
    `Accounting method: ${safeValue(accountingMethod || accountingBasis)}`
  ]);

  canvas.drawCard(320, cardTop, 252, 126, "Reporting", [
    `Reporting period: ${startDate} to ${endDate}`,
    `Currency: ${currency}`,
    `Export ID: ${reportId}`,
    `Prepared from: InEx Ledger`,
    `Export created: ${formatReportTimestamp(generatedAt)}`,
    regionCode === "US"
      ? `Material participation: ${normalizeYesNo(materialParticipation)}`
      : `Province / GST-HST: ${safeValue(province)} | ${gstHstRegistered ? safeValue(gstHstNumber, "Registered") : "Not registered"}`
  ]);

  const metricY = cardTop - 148;
  canvas.drawMetricCard(40, metricY, 112, 72, "Gross income", formatCurrencyForPdf(totals.income, currency), null);
  canvas.drawMetricCard(160, metricY, 112, 72, "Total expenses", formatCurrencyForPdf(totals.expenses, currency), null);
  canvas.drawMetricCard(280, metricY, 112, 72, "Net profit/loss", formatCurrencyForPdf(totals.netProfit, currency), null);
  canvas.drawMetricCard(400, metricY, 82, 72, "Included", String(reviewInsights.transactionCount), "Transactions");
  canvas.drawMetricCard(490, metricY, 82, 72, "Excluded", String(reviewInsights.excludedCount), "Transactions");

  const actionLines = buildCpaActionLines(reviewInsights, currency);
  canvas.drawCard(40, metricY - 88, 532, 172, "CPA Action Required", actionLines, { maxChars: 88 });
  canvas.text(52, metricY - 242, labels.not_filed, 9, "F2");
  if (regionCode === "CA") {
    canvas.text(52, metricY - 258, `${formatFiscalYearDisplay(fiscalYearStart, endDate)} | GST/HST method: ${gstHstRegistered ? safeValue(gstHstMethod) : "Not registered"}`, 8);
    canvas.text(52, metricY - 272, "Confirm fiscal year with preparer.", 8);
  } else {
    canvas.text(52, metricY - 258, `Business address: ${safeValue(address)}`, 8);
  }

  return canvas;
}

function buildCategoryBuckets(transactions, currency) {
  const buckets = new Map();
  for (const txn of transactions || []) {
    const status = txn.__status;
    const categoryName = normalizeExportCategoryName(txn.__category) || (String(txn.type || "").toLowerCase() === "income" ? "Imported Income" : "Imported Expense");
    const key = `${String(txn.type || "").toLowerCase()}::${categoryName}::${status.taxLineDisplay}::${status.supportStatus}`;
    const bucket = buckets.get(key) || {
      category: categoryName,
      type: String(txn.type || "").toLowerCase() === "income" ? "Income" : "Expense",
      taxLine: status.taxLineDisplay,
      amount: 0,
      mappingStatus: status.needsCategory ? "Needs category" : (!status.isMapped ? "Unmapped" : (status.flags.some((flag) => ["FC", "RS", "BP", "AL", "ML", "HO", "CA", "RV"].includes(flag)) ? "Needs support" : "Mapped")),
      supportStatus: formatSupportStatus(status)
    };
    bucket.amount += Number(txn.__businessAmounts?.deductibleAmount ?? txn.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn));
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    amountDisplay: formatCurrencyForPdf(bucket.amount, currency),
    amount: Number(bucket.amount.toFixed(2))
  })).sort((a, b) => b.amount - a.amount);
}

function formatSupportStatus(status) {
  if (status.needsCategory) return "Needs category";
  if (!status.isMapped) return "Unmapped";
  if (status.needsMileageLog) return "Needs mileage log";
  if (status.needsBusinessPurpose) return "Business purpose needed";
  if (status.needsHomeOfficeSupport) return "Needs home-office support";
  if (status.needsCapitalAssetReview) return "Capital asset review";
  if (status.needsAllocation) return "Needs allocation";
  if (status.needsReceipt) return "Needs receipt/support";
  if (status.needsFinalConfirmation) return "Needs final confirmation";
  return "Mapped";
}

function buildCategoryPages(transactions, categories, receipts, currency, labels, embeddedCount = 0, region = "US", supportArtifactMap = null) {
  const rows = buildCategoryBuckets(transactions, currency).slice(embeddedCount);
  const coverage = computeReceiptCoverage(transactions, receipts, supportArtifactMap);
  const totals = {
    needsCategory: rows.filter((row) => row.mappingStatus === "Needs category").reduce((sum, row) => sum + row.amount, 0),
    mappedNeedsSupport: rows.filter((row) => row.mappingStatus === "Needs support").reduce((sum, row) => sum + row.amount, 0),
    mappedReady: rows.filter((row) => row.supportStatus === "Mapped").reduce((sum, row) => sum + row.amount, 0),
    included: rows.reduce((sum, row) => sum + row.amount, 0)
  };
  const chunks = chunkArray(rows, 18);
  return chunks.map((chunk, index) => {
    const canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, { title: labels.mapping_summary, subtitle: normalizeRegionCode(region) === "CA" ? "T2125 category and tax-line resolution" : "Schedule C category and tax-line resolution", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
    const metricTop = header.contentStartY - 8;
    canvas.drawMetricCard(40, metricTop, 126, 70, "Needs category", formatCurrencyForPdf(totals.needsCategory, currency), "Imported / uncategorized");
    canvas.drawMetricCard(178, metricTop, 126, 70, "Needs support", formatCurrencyForPdf(totals.mappedNeedsSupport, currency), "Mapped but incomplete");
    canvas.drawMetricCard(316, metricTop, 126, 70, "Mapped ready", formatCurrencyForPdf(totals.mappedReady, currency), "Mapped");
    canvas.drawMetricCard(454, metricTop, 118, 70, "Included total", formatCurrencyForPdf(totals.included, currency), "Income + expense");
    const columns = [
      { key: "category", label: "Category", x: 40, width: 132 },
      { key: "type", label: "Type", x: 180, width: 48 },
      { key: "taxLine", label: "Tax line", x: 232, width: 166 },
      { key: "amountDisplay", label: "Amount", x: 408, width: 72, align: "right" },
      { key: "mappingStatus", label: "Mapping status", x: 490, width: 82 },
      { key: "supportStatus", label: "Support status", x: 40, width: 520 }
    ];
    let y = metricTop - 110;
    canvas.drawTableHeader(columns.slice(0, 5), y);
    y -= 20;
    chunk.forEach((row, rowIndex) => {
      canvas.drawTableRow(columns.slice(0, 5), {
        category: truncateText(row.category, 24),
        type: row.type,
        taxLine: truncateText(shortenTaxLine(row.taxLine), 30),
        amountDisplay: row.amountDisplay,
        mappingStatus: truncateText(row.mappingStatus, 18)
      }, y, { fillGray: rowIndex % 2 === 0 ? 0.985 : null });
      y -= 12;
      canvas.text(40, y, `Support: ${row.supportStatus}`, 7);
      y -= 12;
    });
    if (index === 0) {
      const mappedSupportTransactions = transactions.filter((txn) => statusNeedsSupport(txn.__status));
      const riskCardTop = Math.max(y - 10, 210);
      canvas.drawCard(40, riskCardTop, 532, 76, "Support Risk Summary", [
        `Mapped needing support: ${mappedSupportTransactions.length} | Needs category: ${rows.filter((row) => row.mappingStatus === "Needs category").length} | Missing receipts/support: ${coverage.missing}`,
        `Vehicle/mileage log categories: ${rows.filter((row) => /mileage/i.test(row.supportStatus)).length} | Meals/business-purpose categories: ${rows.filter((row) => /business purpose/i.test(row.supportStatus)).length} | Phone/internet allocation categories: ${rows.filter((row) => /allocation/i.test(row.supportStatus)).length}`
      ], { maxChars: 92 });
      canvas.drawCard(40, riskCardTop - 88, 532, 54, "Summary note", [
        `Needing category: ${formatCurrencyForPdf(totals.needsCategory, currency)} | Mapped needing support: ${formatCurrencyForPdf(totals.mappedNeedsSupport, currency)} | Mapped and support-ready: ${formatCurrencyForPdf(totals.mappedReady, currency)}`
      ], { maxChars: 92 });
    }
    return canvas;
  });
}

function buildTaxPacketPages({ transactions, categories, receipts, currency, region, labels, taxYear }) {
  const coverage = computeReceiptCoverage(transactions, receipts);
  const payerSummary = computePayerSummary(transactions, region, taxYear);
  const lineSummary = computeTaxLineSummary(transactions, categories, region);
  const mappedSupportTransactions = transactions.filter((txn) => statusNeedsSupport(txn.__status));
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, { title: normalizeRegionCode(region) === "CA" ? labels.tax_packet_title_ca : labels.tax_packet_title_us, subtitle: normalizeRegionCode(region) === "CA" ? "Payer/form review and T2125 line summary" : "Payer/form review and Schedule C line summary", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
  const cardTop = header.contentStartY - 8;
  canvas.drawCard(40, cardTop, 252, 96, "Receipt Review", [
    `Expense transactions: ${coverage.expense_count}`,
    `With receipt attachment: ${coverage.with_receipt}`,
    `Without receipt attachment: ${coverage.missing}`,
    `Mapped expenses still needing support: ${mappedSupportTransactions.length}`
  ]);
  canvas.drawCard(320, cardTop, 252, 96, labels.payer_review, [
    `Payers detected: ${payerSummary.payer_count}`,
    `Income total: ${formatCurrencyForPdf(payerSummary.total_income, currency)}`,
    `Expected form indicator is informational; confirm with preparer.`
  ]);

  const payerCols = [
    { key: "payer", label: "Payer", x: 40, width: 210 },
    { key: "count", label: "Count", x: 258, width: 38, align: "right" },
    { key: "total", label: "Total", x: 304, width: 80, align: "right" },
    { key: "declared", label: "Declared", x: 392, width: 72 },
    { key: "expected", label: "Expected", x: 474, width: 98 }
  ];
  let y = cardTop - 124;
  canvas.drawSectionHeader(labels.payer_review, 40, y);
  y -= 24;
  canvas.drawTableHeader(payerCols, y);
  y -= 18;
  payerSummary.payers.slice(0, 8).forEach((payer, index) => {
    canvas.drawTableRow(payerCols, {
      payer: truncateText(payer.payer_name, 34),
      count: String(payer.count),
      total: formatCurrencyForPdf(payer.total, currency),
      declared: payer.declared_form || "-",
      expected: payer.expected_form || "-"
    }, y, { fillGray: index % 2 === 0 ? 0.985 : null });
    y -= 12;
  });

  const expenseBucketRows = [
    {
      bucket: "Needs category",
      count: lineSummary.imported_count,
      amount: lineSummary.imported_total,
      meaning: "Assign real category before tax mapping."
    },
    {
      bucket: "Mapped review line",
      count: lineSummary.mapped_review_count,
      amount: lineSummary.mapped_review_total,
      meaning: "Tax line resolved; support still required."
    },
    {
      bucket: "Mapped support-ready",
      count: lineSummary.mapped_ready_count,
      amount: lineSummary.mapped_ready_total,
      meaning: "Mapped with no major support flags."
    },
    {
      bucket: "Truly unmapped",
      count: lineSummary.unmapped_count,
      amount: lineSummary.unmapped_total,
      meaning: "Category exists but no tax line resolved."
    }
  ];
  y -= 14;
  canvas.drawSectionHeader("Expense Mapping Summary", 40, y);
  y -= 30;
  expenseBucketRows.forEach((line) => {
    canvas.drawCard(40, y, 532, 52, line.bucket, [
      `${line.count} transactions | ${formatCurrencyForPdf(line.amount, currency)}`,
      line.meaning
    ], { maxChars: 90 });
    y -= 64;
  });
  y -= 4;
  canvas.drawCard(40, y, 532, 96, "Mapping Totals", [
    `Truly unmapped expenses: ${lineSummary.unmapped_count} totaling ${formatCurrencyForPdf(lineSummary.unmapped_total, currency)}`,
    `Mapped review-line expenses: ${lineSummary.mapped_review_count} totaling ${formatCurrencyForPdf(lineSummary.mapped_review_total, currency)}`,
    `Mapped support-ready expenses: ${lineSummary.mapped_ready_count} totaling ${formatCurrencyForPdf(lineSummary.mapped_ready_total, currency)}`,
    `Imported / needs-category items: ${lineSummary.imported_count} totaling ${formatCurrencyForPdf(lineSummary.imported_total, currency)}`
  ], { maxChars: 94 });
  return [canvas];
}

function buildTransactionPages(transactions, accounts, categories, receipts, currency, labels, region) {
  const accountMap = mapByKey(accounts || [], "id");
  const receiptFilenameMap = buildReceiptFilenameMap(receipts);
  const sorted = [...(transactions || [])].sort((a, b) => normalizePdfDate(a.date).localeCompare(normalizePdfDate(b.date)));
  if (!sorted.length) {
    const canvas = new PdfCanvas();
    drawReportHeader(canvas, { title: labels.ledger_title, subtitle: "No included transactions in this period", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
    return [canvas];
  }
  const pages = [];
  let canvas = null;
  const state = { y: 0, firstPage: true };
  const startPage = () => {
    canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, { title: labels.ledger_title, subtitle: "Primary line: date, payee, tax line, amount, flags", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
    canvas.drawSectionHeader(state.firstPage ? "Flag Legend" : "Flag legend shown on first ledger page", 40, header.contentStartY);
    if (state.firstPage) {
      let legendY = header.contentStartY - 24;
      const legendChunks = chunkArray(Object.entries(FLAG_DESCRIPTIONS), 7);
      legendChunks.forEach((chunk, columnIndex) => {
        let colY = legendY;
        const x = columnIndex * 266 + 40;
        chunk.forEach(([code, description]) => {
          canvas.text(x, colY, `${code} - ${description}`, 7);
          colY -= 11;
        });
      });
      state.y = header.contentStartY - 112;
    } else {
      state.y = header.contentStartY - 24;
    }
    state.firstPage = false;
  };
  startPage();

  let currentMonth = "";
  for (const txn of sorted) {
    const monthKey = normalizePdfDate(txn.date).slice(0, 7);
    if (monthKey !== currentMonth) {
      ensureSpace(state, 24, () => { pages.push(canvas); startPage(); });
      currentMonth = monthKey;
      canvas.drawSectionHeader(new Date(`${monthKey}-01T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), 40, state.y);
      state.y -= 26;
    }
    const status = txn.__status;
    const account = accountMap[txn?.account_id || txn?.accountId] || null;
    const receiptFilenames = receiptFilenameMap.get(txn.id) || [];
    const primaryHeight = buildTransactionText(txn).length > 56 ? 28 : 14;
    const categoryName = normalizeExportCategoryName(txn.__category) || (String(txn.type || "").toLowerCase() === "income" ? "Imported Income" : "Imported Expense");
    const detail = String(txn.type || "").toLowerCase() === "income"
      ? `Cat: ${categoryName} | Payer: ${safeValue(txn.payer_name || txn.payerName, "-")} | Support: ${status.supportSummary || "Confirm payer/form"}`
      : `Acct: ${safeValue(account?.name, "-")} | Cat: ${categoryName} | Support: ${status.supportSummary}`;
    const detailLines = wrapText(detail, 108);
    const receiptLines = receiptFilenames.length ? wrapText(`Receipts: ${receiptFilenames.join(", ")}`, 108) : [];
    const secondaryNeeded = Math.max(14, detailLines.length * 14);
    const tertiaryNeeded = receiptLines.length ? receiptLines.length * 14 : 0;
    ensureSpace(state, 22 + primaryHeight + secondaryNeeded + tertiaryNeeded, () => { pages.push(canvas); startPage(); });
    const amountValue = String(txn.type || "").toLowerCase() === "income"
      ? Number(txn.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn))
      : Number(txn.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn));
    const payeeLines = wrapText(buildTransactionText(txn) || "(No description)", 42);
    canvas.text(40, state.y, normalizePdfDate(txn.date), 8);
    canvas.text(104, state.y, payeeLines[0], 8);
    canvas.text(346, state.y, truncateText(shortenTaxLine(status.taxLineDisplay), 26), 8);
    canvas.drawRightAlignedText(496, state.y, formatCurrencyForPdf(amountValue, currency), 8);
    canvas.text(506, state.y, status.flags.join(" "), 8, "F2");
    state.y -= 12;
    if (payeeLines[1]) {
      canvas.text(104, state.y, payeeLines[1], 8);
      state.y -= 12;
    }
    detailLines.forEach((line) => {
      canvas.text(104, state.y, line, 7);
      state.y -= 14;
    });
    if (receiptLines.length) {
      receiptLines.forEach((line) => {
        canvas.text(104, state.y, line, 7);
        state.y -= 14;
      });
    }
    canvas.drawDivider(state.y + 4);
    state.y -= 6;
  }
  pages.push(canvas);
  return pages;
}

function buildExclusionPages(transactions, currency, labels) {
  if (!transactions.length) return [];
  const rows = [...transactions].sort((a, b) => normalizePdfDate(a.date).localeCompare(normalizePdfDate(b.date)));
  const summary = buildExclusionSummary(rows, currency);
  const pages = [];
  let index = 0;
  let firstPage = true;
  while (index < rows.length || firstPage) {
    const canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, { title: firstPage ? labels.exclusions_title : `${labels.exclusions_title} - continued`, subtitle: "Short reason codes shown; full legend appears on the first excluded-items page", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
    let y = header.contentStartY - 4;
    if (firstPage) {
      canvas.drawCard(40, y, 532, 118, "Exclusion Summary", summary.map((row) => `${row.label} - ${row.count} items - ${row.amount_display}`), { maxChars: 92 });
      y -= 132;
      const legendLines = Object.entries(EXCLUSION_DEFINITIONS).map(([, entry]) => `${entry.label}: ${entry.description}`);
      canvas.drawCard(40, y, 532, 110, "Legend", legendLines.slice(0, 8), { maxChars: 90 });
      y -= 124;
    }
    const perPage = firstPage ? 24 : 30;
    const chunk = rows.slice(index, index + perPage);
    const cols = [
      { key: "date", label: "Date", x: 40, width: 62 },
      { key: "payee", label: "Payee / Memo", x: 110, width: 294 },
      { key: "code", label: "Reason", x: 412, width: 64 },
      { key: "amount", label: "Booked amount", x: 486, width: 86, align: "right" }
    ];
    canvas.drawTableHeader(cols, y);
    y -= 18;
    chunk.forEach((txn, rowIndex) => {
      canvas.drawTableRow(cols, {
        date: normalizePdfDate(txn.date),
        payee: truncateText(buildTransactionText(txn) || "(No description)", 50),
        code: txn.__exclusionReason?.label || txn.__exclusionReason?.code || "REVIEW",
        amount: formatCurrencyForPdf(normalizeMoneyAmount(txn), currency)
      }, y, { fillGray: rowIndex % 2 === 0 ? 0.985 : null });
      y -= 12;
    });
    index += chunk.length;
    firstPage = false;
    pages.push(canvas);
    if (!chunk.length) break;
  }
  return pages;
}

function buildUnresolvedExceptionPages(transactions, currency, labels, region) {
  const flagged = [...(transactions || [])]
    .filter((txn) => Array.isArray(txn?.__status?.flags) && txn.__status.flags.length)
    .sort((a, b) => {
      const severityWeight = (txn) => {
        const flags = new Set(txn?.__status?.flags || []);
        if (flags.has("NC") || flags.has("UM") || flags.has("RV")) return 0;
        if (flags.has("RS") || flags.has("ML") || flags.has("BP") || flags.has("AL") || flags.has("HO") || flags.has("CA")) return 1;
        return 2;
      };
      const bySeverity = severityWeight(a) - severityWeight(b);
      if (bySeverity !== 0) return bySeverity;
      const amountA = Number(a?.__businessAmounts?.deductibleAmount ?? a?.__businessAmounts?.netAmount ?? 0);
      const amountB = Number(b?.__businessAmounts?.deductibleAmount ?? b?.__businessAmounts?.netAmount ?? 0);
      return amountB - amountA;
    });
  if (!flagged.length) return [];

  const chunks = chunkArray(flagged, 18);
  return chunks.map((chunk, index) => {
    const canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, {
      title: index === 0 ? labels.unresolved_exceptions_title : `${labels.unresolved_exceptions_title} - continued`,
      subtitle: normalizeRegionCode(region) === "CA"
        ? "Transactions still blocking a finalized T2125-ready package"
        : "Transactions still blocking a finalized Schedule C-ready package",
      badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
    });

    let y = header.contentStartY - 8;
    if (index === 0) {
      const summaryLines = buildUnresolvedSummaryLines(flagged);
      canvas.drawCard(40, y, 532, 108, "Open blocker summary", summaryLines, { maxChars: 90 });
      y -= 126;
    }

    const cols = [
      { key: "date", label: "Date", x: 40, width: 60 },
      { key: "payee", label: "Transaction", x: 108, width: 184 },
      { key: "taxLine", label: "Tax line", x: 300, width: 102 },
      { key: "amount", label: "Amount", x: 410, width: 72, align: "right" },
      { key: "flags", label: "Flags", x: 490, width: 82 }
    ];
    canvas.drawTableHeader(cols, y);
    y -= 18;

    chunk.forEach((txn, rowIndex) => {
      const amount = String(txn?.type || "").toLowerCase() === "income"
        ? Number(txn?.__businessAmounts?.netAmount ?? normalizeMoneyAmount(txn))
        : Number(txn?.__businessAmounts?.deductibleAmount ?? normalizeMoneyAmount(txn));
      const payee = truncateText(buildTransactionText(txn) || "(No description)", 30);
      const taxLine = truncateText(shortenTaxLine(txn.__status.taxLineDisplay), 18);
      const flags = txn.__status.flags.join(" ");
      canvas.drawTableRow(cols, {
        date: normalizePdfDate(txn.date),
        payee,
        taxLine,
        amount: formatCurrencyForPdf(amount, currency),
        flags
      }, y, { fillGray: rowIndex % 2 === 0 ? 0.985 : null });
      y -= 12;
      canvas.text(108, y, truncateText(`Action: ${txn.__status.supportSummary || "Needs review"}`, 82), 7);
      y -= 12;
    });

    return canvas;
  });
}

function buildEvidenceSchedulePages(transactions, receipts, supportArtifactMap, labels, region) {
  const supportMap = supportArtifactMap instanceof Map ? supportArtifactMap : new Map();
  const txMap = new Map((transactions || []).map((txn) => [txn.id, txn]));
  const evidenceRows = [];

  if (supportMap.size > 0) {
    for (const [transactionId, artifacts] of supportMap.entries()) {
      const txn = txMap.get(transactionId);
      if (!txn) continue;
      for (const artifact of artifacts || []) {
        const reviewStatus = String(artifact?.review_status || artifact?.reviewStatus || "").trim().toLowerCase();
        const storageStatus = String(artifact?.storage_status || artifact?.storageStatus || "").trim().toLowerCase();
        if (reviewStatus === "rejected" || storageStatus === "deleted") continue;
        evidenceRows.push({
          transactionId,
          date: normalizePdfDate(txn.date),
          payee: buildTransactionText(txn) || "(No description)",
          artifactType: String(artifact?.artifact_type || artifact?.artifactType || "").trim() || "support",
          artifactName: String(artifact?.filename || artifact?.name || "Support item").trim(),
          artifactStatus: String(artifact?.review_status || artifact?.reviewStatus || "accepted").trim(),
          notes: String(artifact?.notes || "").trim()
        });
      }
    }
  } else {
    for (const receipt of receipts || []) {
      const transactionId = receipt?.transaction_id || receipt?.transactionId;
      const txn = txMap.get(transactionId);
      if (!txn) continue;
      evidenceRows.push({
        transactionId,
        date: normalizePdfDate(txn.date),
        payee: buildTransactionText(txn) || "(No description)",
        artifactType: "receipt",
        artifactName: String(receipt?.filename || "Receipt").trim(),
        artifactStatus: "accepted",
        notes: ""
      });
    }
  }

  if (!evidenceRows.length) return [];

  evidenceRows.sort((a, b) => {
    const byDate = String(a.date || "").localeCompare(String(b.date || ""));
    if (byDate !== 0) return byDate;
    return String(a.payee || "").localeCompare(String(b.payee || ""));
  });

  const chunks = chunkArray(evidenceRows, 22);
  return chunks.map((chunk, index) => {
    const canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, {
      title: index === 0 ? labels.evidence_schedule_title : `${labels.evidence_schedule_title} - continued`,
      subtitle: normalizeRegionCode(region) === "CA"
        ? "Support artifacts linked to exported transactions"
        : "Support artifacts linked to exported transactions",
      badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
    });
    let y = header.contentStartY - 8;
    if (index === 0) {
      canvas.drawCard(40, y, 532, 72, "Evidence mapping", [
        `${evidenceRows.length} support artifacts are linked to transactions in this export.`,
        `This schedule shows which transaction each artifact supports and whether the artifact was accepted into the workpaper.`
      ], { maxChars: 90 });
      y -= 90;
    }

    const cols = [
      { key: "date", label: "Date", x: 40, width: 60 },
      { key: "payee", label: "Transaction", x: 108, width: 172 },
      { key: "artifactType", label: "Type", x: 288, width: 82 },
      { key: "artifactName", label: "Artifact", x: 378, width: 124 },
      { key: "artifactStatus", label: "Status", x: 510, width: 62 }
    ];
    canvas.drawTableHeader(cols, y);
    y -= 18;

    chunk.forEach((row, rowIndex) => {
      canvas.drawTableRow(cols, {
        date: row.date,
        payee: truncateText(row.payee, 28),
        artifactType: truncateText(row.artifactType.replace(/_/g, " "), 14),
        artifactName: truncateText(row.artifactName, 18),
        artifactStatus: truncateText(row.artifactStatus, 10)
      }, y, { fillGray: rowIndex % 2 === 0 ? 0.985 : null });
      y -= 12;
      if (row.notes) {
        canvas.text(108, y, truncateText(`Notes: ${row.notes}`, 84), 7);
        y -= 12;
      }
    });

    return canvas;
  });
}

function rowsCount(rows, predicate) {
  return (rows || []).reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

function buildPackageAttributionLines(packageAttribution = {}, isSecure = true) {
  const lines = [];
  if (packageAttribution.generatedByName) {
    const actor = sanitizePackageActor(packageAttribution.generatedByName, "Preparer on file", isSecure);
    lines.push(`Generated by ${actor}${packageAttribution.generatedAt ? ` on ${normalizePdfDate(packageAttribution.generatedAt)}` : ""}`);
  }
  if (packageAttribution.certifiedByName) {
    const actor = sanitizePackageActor(packageAttribution.certifiedByName, "Finalizer on file", isSecure);
    lines.push(`Finalized by ${actor}${packageAttribution.certifiedAt ? ` on ${normalizePdfDate(packageAttribution.certifiedAt)}` : ""}`);
  }
  return lines;
}

function buildReviewerDecisionPages(reviewStateRows, transactions, labels, region, packageAttribution = {}, isSecure = true) {
  const rows = Array.isArray(reviewStateRows) ? reviewStateRows : [];
  if (!rows.length) return [];
  const txMap = new Map((transactions || []).map((txn) => [txn.id, txn]));
  const scheduleRows = rows
    .map((row) => {
      const txn = txMap.get(row.transaction_id);
      if (!txn) return null;
      return {
        date: normalizePdfDate(txn.date),
        payee: buildTransactionText(txn) || "(No description)",
        issueCode: String(row.issue_code || "").trim() || "reviewer_note",
        severity: String(row.issue_severity || "warning").trim(),
        status: String(row.issue_status || "open").trim(),
        notes: String(row.review_notes || "").trim(),
        createdByName: String(row.created_by_name || "").trim(),
        resolvedByName: String(row.resolved_by_name || "").trim()
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const statusWeight = (value) => value === "open" ? 0 : value === "waived" ? 1 : 2;
      const byStatus = statusWeight(a.status) - statusWeight(b.status);
      if (byStatus !== 0) return byStatus;
      return String(a.date || "").localeCompare(String(b.date || ""));
    });

  if (!scheduleRows.length) return [];
  const chunks = chunkArray(scheduleRows, 20);
  return chunks.map((chunk, index) => {
    const canvas = new PdfCanvas();
    const header = drawReportHeader(canvas, {
      title: index === 0 ? "Reviewer Decisions Schedule" : "Reviewer Decisions Schedule - continued",
      subtitle: normalizeRegionCode(region) === "CA"
        ? "Persisted reviewer decisions applied to this T2125 package"
        : "Persisted reviewer decisions applied to this Schedule C package",
      badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
    });
    let y = header.contentStartY - 8;
    if (index === 0) {
      const openCount = scheduleRows.filter((row) => row.status === "open").length;
      const waivedCount = scheduleRows.filter((row) => row.status === "waived").length;
      const resolvedCount = scheduleRows.filter((row) => row.status === "resolved").length;
      const attributionLines = buildPackageAttributionLines(packageAttribution, isSecure);
      canvas.drawCard(40, y, 532, 84, "Reviewer state", [
        `${openCount} reviewer issues remain open in this package.`,
        `${waivedCount} issues were waived and ${resolvedCount} issues were marked resolved before export.`,
        ...attributionLines
      ], { maxChars: 90 });
      y -= 102;
    }
    const cols = [
      { key: "date", label: "Date", x: 40, width: 60 },
      { key: "payee", label: "Transaction", x: 108, width: 182 },
      { key: "issueCode", label: "Issue", x: 298, width: 108 },
      { key: "severity", label: "Severity", x: 414, width: 66 },
      { key: "status", label: "Status", x: 488, width: 84 }
    ];
    canvas.drawTableHeader(cols, y);
    y -= 18;
    chunk.forEach((row, rowIndex) => {
      canvas.drawTableRow(cols, {
        date: row.date,
        payee: truncateText(row.payee, 30),
        issueCode: truncateText(row.issueCode.replace(/_/g, " "), 18),
        severity: truncateText(row.severity, 10),
        status: truncateText(row.status, 10)
      }, y, { fillGray: rowIndex % 2 === 0 ? 0.985 : null });
      y -= 12;
      if (row.notes) {
        canvas.text(108, y, truncateText(`Reviewer note: ${row.notes}`, 82), 7);
        y -= 12;
      }
      if (row.createdByName || row.resolvedByName) {
        const actorText = [
          row.createdByName ? `Created by ${sanitizePackageActor(row.createdByName, "Reviewer on file", isSecure)}` : "",
          row.resolvedByName ? `${row.status === "waived" ? "Waived" : "Resolved"} by ${sanitizePackageActor(row.resolvedByName, "Reviewer on file", isSecure)}` : ""
        ].filter(Boolean).join(" | ");
        if (actorText) {
          canvas.text(108, y, truncateText(actorText, 82), 7);
          y -= 12;
        }
      }
    });
    return canvas;
  });
}

function buildCpaChecklistPage(opts) {
  const { labels, region, reviewInsights, currency, reviewDecisionSummary = {}, packageAttribution = {}, isSecure = true } = opts;
  const isCA = normalizeRegionCode(region) === "CA";
  const items = buildChecklistItems(reviewInsights, currency, reviewDecisionSummary, packageAttribution, isSecure);
  const pages = [];
  let canvas = new PdfCanvas();
  let header = drawReportHeader(canvas, { title: labels.checklist_title, subtitle: isCA ? "T2125 bookkeeping workpaper checklist" : "Schedule C bookkeeping workpaper checklist", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
  let y = header.contentStartY - 4;
  const colWidth = 252;
  const colX = [40, 320];
  const rowGap = 12;

  const rawPriorities = buildCleanupPriorityLines(reviewInsights);
  const topPriorities = rawPriorities.slice(0, 4).map((line, idx) => `${idx + 1}. ${line}`);
  const priorityCardLines = topPriorities.length ? topPriorities : ["No critical cleanup items detected. Review the checklist below for any remaining action items."];
  const priorityCardHeight = estimateCardHeight(532, priorityCardLines, { maxChars: 88, minHeight: 68 });
  canvas.drawCard(40, y, 532, priorityCardHeight, "Top Cleanup Priorities", priorityCardLines, { maxChars: 88 });
  y -= priorityCardHeight + rowGap;

  const itemRows = chunkArray(items, 2);

  const startNewPage = () => {
    pages.push(canvas);
    canvas = new PdfCanvas();
    header = drawReportHeader(canvas, { title: labels.checklist_title, subtitle: isCA ? "T2125 bookkeeping workpaper checklist" : "Schedule C bookkeeping workpaper checklist", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
    y = header.contentStartY - 4;
  };

  itemRows.forEach((row) => {
    const rowHeight = Math.max(...row.map((item) => estimateCardHeight(colWidth, [item.description], { maxChars: 40, minHeight: 82 })));
    if (y - rowHeight < PAGE.bottom + 8) {
      startNewPage();
    }
    row.forEach((item, index) => {
      const badgeVariant = item.badge === "ACTION" ? "warning" : item.badge === "OK" ? "success" : "neutral";
      const x = colX[index];
      canvas.drawCard(x, y, colWidth, rowHeight, item.title, [item.description], { maxChars: 40 });
      const badgeWidth = Math.max(44, String(item.badge || "").length * 5.6 + 12);
      canvas.drawBadge(x + colWidth - badgeWidth - 12, y - 18, item.badge, badgeVariant);
    });
    y -= rowHeight + rowGap;
  });

  pages.push(canvas);
  return pages;
}

function summarizeVehicleCosts(vehicleCosts, currency) {
  const buckets = { fuel: 0, insurance: 0, repairs: 0, tolls: 0, registration: 0, other: 0 };
  for (const row of vehicleCosts || []) {
    const key = String(row?.entry_type || row?.title || "").toLowerCase();
    const amount = Math.abs(Number(row?.amount) || 0);
    if (/fuel|gas/.test(key)) buckets.fuel += amount;
    else if (/insurance/.test(key)) buckets.insurance += amount;
    else if (/repair|maintenance/.test(key)) buckets.repairs += amount;
    else if (/toll|parking/.test(key)) buckets.tolls += amount;
    else if (/registration|licen/.test(key)) buckets.registration += amount;
    else buckets.other += amount;
  }
  const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  return {
    ...buckets,
    total,
    lines: [
      `Fuel: ${formatCurrencyForPdf(buckets.fuel, currency)}`,
      `Insurance: ${formatCurrencyForPdf(buckets.insurance, currency)}`,
      `Repairs: ${formatCurrencyForPdf(buckets.repairs, currency)}`,
      `Tolls / parking: ${formatCurrencyForPdf(buckets.tolls, currency)}`,
      `Registration: ${formatCurrencyForPdf(buckets.registration, currency)}`,
      `Other vehicle costs: ${formatCurrencyForPdf(buckets.other, currency)}`,
      `Total vehicle costs: ${formatCurrencyForPdf(total, currency)}`
    ]
  };
}

function buildSupportPages(receipts, transactions, mileage, vehicleCosts, supportArtifactMap, labels, currency, reviewInsights, region) {
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, { title: labels.support_title, subtitle: normalizeRegionCode(region) === "CA" ? "Support dashboard and final CRA review notes" : "Support dashboard and final IRS review notes", badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }] });
  const vehicleSummary = summarizeVehicleCosts(vehicleCosts, currency);
  const artifactSummary = summarizeSupportArtifacts(transactions, supportArtifactMap);
  const top = header.contentStartY - 8;
  canvas.drawCard(40, top, 252, 126, "Vehicle Review", [
    `Transactions: ${reviewInsights.vehicleCount}`,
    `Ledger total: ${formatCurrencyForPdf(reviewInsights.vehicleTotal, currency)}`,
    `Mileage log status: ${(mileage || []).length ? "Mileage entries present" : "Mileage log needed"}`,
    `Actual-expense support: Receipts and allocation still required`,
    ...(vehicleSummary.total > 0 ? vehicleSummary.lines : ["No separate vehicle cost schedule attached. Fuel/auto transactions detected from ledger require mileage/actual support."])
  ], { maxChars: 34 });
  canvas.drawCard(320, top, 252, 126, "Meals Review", [
    `Transactions: ${reviewInsights.mealsCount}`,
    `Total amount: ${formatCurrencyForPdf(reviewInsights.mealsTotal, currency)}`,
    `Potential 50% limited amount: ${formatCurrencyForPdf(reviewInsights.mealsTotal * 0.5, currency)}`,
    `Business purpose required for each meal entry`
  ], { maxChars: 34 });
  canvas.drawCard(40, top - 146, 252, 96, "Phone / Internet / Utilities", [
    `Transactions: ${reviewInsights.phoneAllocationCount}`,
    `Total amount: ${formatCurrencyForPdf(reviewInsights.phoneAllocationTotal, currency)}`,
    `Business-use percentage needed before final deduction`
  ], { maxChars: 34 });
  canvas.drawCard(320, top - 146, 252, 96, "Receipt Review", [
    `Attached receipt files: ${reviewInsights.attachedReceiptFileCount}`,
    `Transactions with any receipt file: ${reviewInsights.transactionWithReceiptCount}`,
    `Expense rows with receipt: ${reviewInsights.receiptLinkedCount}`,
    `Expense rows missing receipt: ${reviewInsights.expenseWithoutReceiptAttachmentCount}`,
    `Coverage: ${reviewInsights.expenseTransactionCount ? `${((reviewInsights.receiptLinkedCount / reviewInsights.expenseTransactionCount) * 100).toFixed(1)}%` : "-"}`
  ], { maxChars: 34 });
  canvas.drawCard(40, top - 256, 252, 98, "Additional Support Artifacts", [
    `Linked: ${artifactSummary.totalCount} across ${artifactSummary.transactionCount} transactions`,
    `Accepted: ${artifactSummary.acceptedCount} | Pending: ${artifactSummary.pendingCount}`,
    `Review notes: ${artifactSummary.reviewNoteCount} | Mileage logs: ${artifactSummary.mileageLogCount}`,
    `Allocation worksheets: ${artifactSummary.allocationWorksheetCount} | Asset support: ${artifactSummary.capitalAssetSupportCount}`
  ], { maxChars: 34 });
  const worksheetLines = buildSupportWorksheetLines(reviewInsights, artifactSummary, currency);
  if (worksheetLines.length > 0) {
    canvas.drawCard(320, top - 256, 252, 98, reviewInsights.homeOfficeCount > 0 && reviewInsights.capitalAssetCount > 0 ? "Worksheet / Asset Review" : (reviewInsights.homeOfficeCount > 0 ? "Home Office Review" : "Capital Asset Review"), worksheetLines, { maxChars: 34 });
  } else {
    canvas.drawCard(320, top - 256, 252, 98, "Receipt Scope", [
      `Expense rows in export: ${reviewInsights.expenseTransactionCount}`,
      `Expense rows with receipt: ${reviewInsights.receiptLinkedCount}`,
      `Expense rows missing receipt: ${reviewInsights.expenseWithoutReceiptAttachmentCount}`,
      `Receipts on non-expense rows: ${Math.max(0, reviewInsights.transactionWithReceiptCount - reviewInsights.receiptLinkedCount)}`
    ], { maxChars: 34 });
  }
  const topExceptions = [...(transactions || [])]
    .filter((txn) => txn.__status.flags.length)
    .sort((a, b) => Number(b.__businessAmounts?.deductibleAmount ?? b.__businessAmounts?.netAmount ?? 0) - Number(a.__businessAmounts?.deductibleAmount ?? a.__businessAmounts?.netAmount ?? 0))
    .slice(0, 5)
    .map((txn) => `${truncateText(buildTransactionText(txn) || "(No description)", 34)} - ${formatCurrencyForPdf(Number(txn.__businessAmounts?.deductibleAmount ?? txn.__businessAmounts?.netAmount ?? 0), currency)} - ${txn.__status.flags.join(" ")}`);
  canvas.drawCard(40, top - 372, 532, 132, "Top Exceptions", topExceptions.length ? topExceptions : ["No large flagged exceptions detected."], { maxChars: 90 });
  canvas.drawCard(40, top - 520, 532, 92, "Final Disclosure", buildFinalDisclosureLines(reviewInsights, artifactSummary, labels), { maxChars: 90 });
  return [canvas];
}

// ─── PHASE 2 SCHEDULE PAGES ───────────────────────────────────────────────────

function buildVehicleAuditSchedule(vehicleClaims, currency, labels, region) {
  if (!vehicleClaims || vehicleClaims.length === 0) return [];
  const isCA = normalizeRegionCode(region) === "CA";
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, {
    title: "Auto Audit Support Schedule",
    subtitle: isCA ? "CRA vehicle expense claim details (per-transaction)" : "IRS vehicle expense claim details (per-transaction)",
    badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
  });

  const cols = [
    { key: "date", label: "Date", x: 40, width: 68 },
    { key: "description", label: "Description", x: 116, width: 174 },
    { key: "method", label: "Method", x: 298, width: 62 },
    { key: "detail", label: "Distance / Pct", x: 368, width: 90 },
    { key: "rate", label: "Rate", x: 466, width: 48 },
    { key: "deduction", label: "Deduction", x: 522, width: 50, align: "right" }
  ];

  let y = header.contentStartY - 10;
  canvas.drawSectionHeader("Vehicle Claim Detail", 40, y);
  y -= 24;
  canvas.drawTableHeader(cols, y);
  y -= 18;

  let totalDeduction = 0;
  vehicleClaims.forEach((claim, index) => {
    const isMileage = claim.claim_method === "mileage";
    const detail = isMileage
      ? `${Number(claim.distance || 0).toFixed(1)} ${claim.distance_unit || "mi"}`
      : `${Number(claim.business_use_pct || 0).toFixed(1)}%`;
    const rate = isMileage && claim.tax_year_rate
      ? `$${Number(claim.tax_year_rate).toFixed(4)}`
      : "-";
    const deductionAmt = Number(claim.calculated_deduction || 0);
    totalDeduction += deductionAmt;

    if (y < PAGE.bottom + 24) {
      canvas.addFooter(1, 1, "Auto Audit Support Schedule continued");
      // For simplicity, truncate at page bottom; full multi-page is future work
      return;
    }

    canvas.drawTableRow(cols, {
      date: normalizePdfDate(claim.transaction_date || ""),
      description: truncateText(claim.description || "(No description)", 28),
      method: isMileage ? "Mileage" : "Actual %",
      detail,
      rate,
      deduction: formatCurrencyForPdf(deductionAmt, currency)
    }, y, { fillGray: index % 2 === 0 ? 0.985 : null });
    y -= 13;
  });

  y -= 10;
  canvas.setStrokeGray(COLORS.mid);
  canvas.drawLine(40, y + 6, 572, y + 6);
  canvas.setStrokeGray(COLORS.black);
  canvas.text(40, y - 4, `Total audited vehicle deduction: ${formatCurrencyForPdf(totalDeduction, currency)}`, 9, "F2");
  y -= 24;
  canvas.drawCard(40, y, 532, 68, "Method Reference", [
    isCA
      ? "Mileage: CRA per-km rate applied (tiered: first 5,000 km / remainder). Actual: gross amount × business-use %. CRA Form T777 or T2200 required."
      : "Mileage: IRS standard mileage rate applied. Actual: gross amount × business-use %. IRS Form 4562 may be required for first-year vehicles.",
    "Rates stored per tax year. Run VALIDATE CONSTRAINT after data cleanup to enable query-planner optimization."
  ], { maxChars: 90 });

  return [canvas];
}

function buildCapitalAssetSchedule(capitalAssets, currency, labels, region) {
  if (!capitalAssets || capitalAssets.length === 0) return [];
  const isCA = normalizeRegionCode(region) === "CA";
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, {
    title: isCA ? "CCA Schedule - Capital Cost Allowance" : "MACRS / Section 179 Depreciation Schedule",
    subtitle: isCA ? "T2125 Part 13 — CCA schedule (current tax year)" : "Schedule C Line 13 — Depreciation and Section 179",
    badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
  });

  const cols = [
    { key: "name", label: "Asset", x: 40, width: 154 },
    { key: "class", label: "Class", x: 202, width: 70 },
    { key: "cost", label: "Original Cost", x: 280, width: 80, align: "right" },
    { key: "prior", label: "Prior Depr.", x: 368, width: 72, align: "right" },
    { key: "current", label: "Current Year", x: 448, width: 72, align: "right" },
    { key: "remaining", label: "UCC / Basis", x: 528, width: 44, align: "right" }
  ];

  let y = header.contentStartY - 10;
  canvas.drawSectionHeader("Asset Register", 40, y);
  y -= 24;
  canvas.drawTableHeader(cols, y);
  y -= 18;

  let totalCurrentDepreciation = 0;
  let totalRemainingBasis = 0;

  capitalAssets.forEach((asset, index) => {
    const currentDepr = Number(asset.current_year_depreciation || 0);
    const remaining = Number(asset.remaining_basis || 0);
    totalCurrentDepreciation += currentDepr;
    totalRemainingBasis += remaining;

    if (y < PAGE.bottom + 24) return; // truncate at page bottom

    canvas.drawTableRow(cols, {
      name: truncateText(asset.name || "", 26),
      class: asset.cca_class || asset.macrs_class || "-",
      cost: formatCurrencyForPdf(asset.original_cost, currency),
      prior: formatCurrencyForPdf(asset.prior_depreciation, currency),
      current: formatCurrencyForPdf(currentDepr, currency),
      remaining: formatCurrencyForPdf(remaining, currency)
    }, y, { fillGray: index % 2 === 0 ? 0.985 : null });
    y -= 13;
  });

  y -= 10;
  canvas.setStrokeGray(COLORS.mid);
  canvas.drawLine(40, y + 6, 572, y + 6);
  canvas.setStrokeGray(COLORS.black);
  canvas.text(40, y - 4, `Total current-year depreciation: ${formatCurrencyForPdf(totalCurrentDepreciation, currency)}   Remaining UCC / basis: ${formatCurrencyForPdf(totalRemainingBasis, currency)}`, 9, "F2");
  y -= 28;

  canvas.drawCard(40, y, 532, 78, "Depreciation Notes", [
    isCA
      ? "CCA uses declining-balance rates with a mandatory 50% first-year rule (CCRA IT-285R2). Assets in Class 12 (100%) and Class 14.1 (5%) use straight-line. Total added to T2125 line 9936."
      : "MACRS uses IRS Rev. Proc. 87-57 tables with half-year convention. Section 179 deduction taken in full in the election year. Total carried to Schedule C line 13.",
    "Equipment transactions categorized as 'equipment_capital_asset' have deductibleAmount = 0 in the ledger; this schedule supplies the actual deduction."
  ], { maxChars: 92 });

  return [canvas];
}

function buildQuickMethodRemittancePage(qmSchedule, currency, labels) {
  if (!qmSchedule) return [];
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, {
    title: "CRA Quick Method Remittance Schedule",
    subtitle: "ETA s. 227 — Simplified accounting for small businesses",
    badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }, { text: "QUICK METHOD", variant: "neutral" }]
  });

  let y = header.contentStartY - 10;
  canvas.drawCard(40, y, 252, 118, "Remittance Calculation", [
    `Gross revenues (incl. HST/GST): ${formatCurrencyForPdf(qmSchedule.grossSalesInclTax, currency)}`,
    `Remittance rate (${String(qmSchedule.provinceGroup || "").replace(/_/g, "/")} ${qmSchedule.supplyType}): ${(Number(qmSchedule.remittanceRate) * 100).toFixed(1)}%`,
    `Net tax to remit: ${formatCurrencyForPdf(qmSchedule.netTaxToRemit, currency)}`,
    `Tax collected from customers: ${formatCurrencyForPdf(qmSchedule.taxCollected, currency)}`
  ], { maxChars: 34 });

  canvas.drawCard(320, y, 252, 118, "Method Parameters", [
    `Province / group: ${qmSchedule.province || "-"}`,
    `Supply type: ${qmSchedule.supplyType || "-"}`,
    `Tax year: ${qmSchedule.taxYear || "-"}`,
    `HST/GST rate: ${(Number(qmSchedule.hstRate) * 100).toFixed(0)}%`
  ], { maxChars: 34 });

  y -= 138;
  canvas.drawCard(40, y, 532, 110, "Quick Method — ITC Treatment", [
    "Under the Quick Method, ITCs on business expenses (other than capital property) are NOT claimed.",
    "The expense amounts in the transaction ledger represent the full cost including GST/HST paid — this is correct under ETA s. 227.",
    "The 1% credit on the first $30,000 of eligible supplies (ETA s. 227(6)) is applied separately by CRA.",
    qmSchedule.note || ""
  ], { maxChars: 90 });

  y -= 130;
  canvas.drawCard(40, y, 532, 68, "Comparison", [
    `Tax collected: ${formatCurrencyForPdf(qmSchedule.taxCollected, currency)}  |  Remittance: ${formatCurrencyForPdf(qmSchedule.netTaxToRemit, currency)}  |  Net benefit: ${formatCurrencyForPdf(qmSchedule.taxCollected - qmSchedule.netTaxToRemit, currency)}`,
    "Confirm with preparer that the Quick Method election is current and that annual revenues are under the $400,000 threshold."
  ], { maxChars: 92 });

  return [canvas];
}

// Override with stricter launch-safe behavior for vehicle and Quick Method workpapers.
function buildVehicleAuditSchedule(vehicleClaims, currency, labels, region) {
  if (!vehicleClaims || vehicleClaims.length === 0) return [];
  const isCA = normalizeRegionCode(region) === "CA";
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, {
    title: "Auto Audit Support Schedule",
    subtitle: isCA ? "CRA vehicle expense claim details (per-transaction)" : "IRS vehicle expense claim details (per-transaction)",
    badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }]
  });

  const cols = [
    { key: "date", label: "Date", x: 40, width: 68 },
    { key: "description", label: "Description", x: 116, width: 174 },
    { key: "method", label: "Method", x: 298, width: 62 },
    { key: "detail", label: "Distance / Pct", x: 368, width: 90 },
    { key: "rate", label: "Rate", x: 466, width: 48 },
    { key: "deduction", label: "Deduction", x: 522, width: 50, align: "right" }
  ];

  let y = header.contentStartY - 10;
  canvas.drawSectionHeader("Vehicle Claim Detail", 40, y);
  y -= 24;
  canvas.drawTableHeader(cols, y);
  y -= 18;

  let totalDeduction = 0;
  vehicleClaims.forEach((claim, index) => {
    const isMileage = claim.claim_method === "mileage";
    const detail = isMileage
      ? `${Number(claim.distance || 0).toFixed(1)} ${claim.distance_unit || "mi"}`
      : `${Number(claim.business_use_pct || 0).toFixed(1)}%`;
    const rate = isMileage && claim.tax_year_rate
      ? `$${Number(claim.tax_year_rate).toFixed(4)}`
      : "-";
    const deductionAmt = Number(claim.calculated_deduction || 0);
    totalDeduction += deductionAmt;

    if (y < PAGE.bottom + 24) {
      canvas.addFooter(1, 1, "Auto Audit Support Schedule continued");
      return;
    }

    canvas.drawTableRow(cols, {
      date: normalizePdfDate(claim.transaction_date || ""),
      description: truncateText(claim.description || "(No description)", 28),
      method: isMileage ? "Mileage" : "Actual %",
      detail,
      rate,
      deduction: formatCurrencyForPdf(deductionAmt, currency)
    }, y, { fillGray: index % 2 === 0 ? 0.985 : null });
    y -= 13;
  });

  y -= 10;
  canvas.setStrokeGray(COLORS.mid);
  canvas.drawLine(40, y + 6, 572, y + 6);
  canvas.setStrokeGray(COLORS.black);
  canvas.text(40, y - 4, `Total audited vehicle deduction: ${formatCurrencyForPdf(totalDeduction, currency)}`, 9, "F2");
  y -= 24;
  canvas.drawCard(40, y, 532, 68, "Method Reference", [
    isCA
      ? "Canadian self-employed motor vehicle claims use actual expenses with business-use allocation. Mileage logs shown in this package are support only."
      : "Mileage: IRS standard mileage rate applied. Actual: gross amount × business-use %. Use one method consistently for the tax year until per-vehicle elections are supported.",
    "Rates stored per tax year. Run VALIDATE CONSTRAINT after data cleanup to enable query-planner optimization."
  ], { maxChars: 90 });

  return [canvas];
}

function buildQuickMethodRemittancePage(qmSchedule, currency, labels) {
  if (!qmSchedule) return [];
  const canvas = new PdfCanvas();
  const header = drawReportHeader(canvas, {
    title: "CRA Quick Method Remittance Schedule",
    subtitle: "ETA s. 227 - Simplified accounting for small businesses",
    badges: [{ text: labels.statusBadgeText, variant: labels.statusBadgeVariant }, { text: "QUICK METHOD", variant: "neutral" }]
  });

  let y = header.contentStartY - 10;
  if (qmSchedule.supported === false) {
    canvas.drawCard(40, y, 532, 136, "Quick Method Review Required", [
      qmSchedule.unsupportedReason || "The current ledger data is not sufficient to compute a reliable Quick Method schedule.",
      qmSchedule.warning || "",
      "This export did not auto-calculate a remittance figure. Confirm eligibility, supply type, and current CRA rates before filing."
    ].filter(Boolean), { maxChars: 92 });
    return [canvas];
  }

  canvas.drawCard(40, y, 252, 118, "Remittance Calculation", [
    `Gross revenues (incl. HST/GST): ${formatCurrencyForPdf(qmSchedule.grossSalesInclTax, currency)}`,
    `Remittance rate (${String(qmSchedule.provinceGroup || "").replace(/_/g, "/")} ${qmSchedule.supplyType}): ${(Number(qmSchedule.remittanceRate) * 100).toFixed(1)}%`,
    `Net tax to remit: ${formatCurrencyForPdf(qmSchedule.netTaxToRemit, currency)}`,
    `Tax collected from customers: ${formatCurrencyForPdf(qmSchedule.taxCollected, currency)}`
  ], { maxChars: 34 });

  canvas.drawCard(320, y, 252, 118, "Method Parameters", [
    `Province / group: ${qmSchedule.province || "-"}`,
    `Supply type: ${qmSchedule.supplyType || "-"}`,
    `Supply type source: ${qmSchedule.supplyTypeSource || "-"}`,
    `Tax year: ${qmSchedule.taxYear || "-"}`,
    `HST/GST rate: ${(Number(qmSchedule.hstRate) * 100).toFixed(0)}%`
  ], { maxChars: 34 });

  y -= 138;
  canvas.drawCard(40, y, 532, 110, "Quick Method - ITC Treatment", [
    "Under the Quick Method, ITCs on business expenses (other than capital property) are NOT claimed.",
    "The expense amounts in the transaction ledger represent the full cost including GST/HST paid - this is correct under ETA s. 227.",
    "The 1% credit on the first $30,000 of eligible supplies (ETA s. 227(6)) is applied separately by CRA.",
    qmSchedule.warning || "",
    qmSchedule.note || ""
  ].filter(Boolean), { maxChars: 90 });

  y -= 130;
  canvas.drawCard(40, y, 532, 68, "Comparison", [
    `Tax collected: ${formatCurrencyForPdf(qmSchedule.taxCollected, currency)}  |  Remittance: ${formatCurrencyForPdf(qmSchedule.netTaxToRemit, currency)}  |  Net benefit: ${formatCurrencyForPdf(qmSchedule.taxCollected - qmSchedule.netTaxToRemit, currency)}`,
    "Confirm with preparer that the Quick Method election is current and that annual revenues are under the $400,000 threshold."
  ], { maxChars: 92 });

  return [canvas];
}

// ─────────────────────────────────────────────────────────────────────────────

function buildFooterText(labels, reportId, generatedAt, isSecure, pageNumber, totalPages, legalName, taxId) {
  return truncateText(`${safeValue(legalName, labels.footer_brand)} | ${maskTaxId(taxId)} | ${reportId} | ${formatReportTimestamp(generatedAt)} | ${isSecure ? labels.secure_badge : labels.redacted_badge} | Page ${pageNumber}/${totalPages}`, 110);
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
  objects.push(buildObject(1, "<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(buildObject(2, `<< /Type /Pages /Count ${pageEntries.length} /Kids [${pageEntries.map((entry) => `${entry.pageId} 0 R`).join(" ")}] >>`));
  objects.push(buildObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  objects.push(buildObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"));
  pageEntries.forEach((entry) => {
    const length = encoder.encode(entry.content).length;
    objects.push(buildObject(entry.contentId, `<< /Length ${length} >>\nstream\n${entry.content}\nendstream`));
    objects.push(buildObject(entry.pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${entry.contentId} 0 R >>`));
  });
  const parts = ["%PDF-1.3\n"];
  const offsets = [0];
  let offset = encoder.encode(parts[0]).length;
  objects.forEach((obj) => {
    offsets.push(offset);
    parts.push(obj);
    offset += encoder.encode(obj).length;
  });
  const xrefStart = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((value) => parts.push(`${String(value).padStart(10, "0")} 00000 n \n`));
  parts.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return Buffer.from(encoder.encode(parts.join("")));
}

function buildPdfExportDocument(options) {
  const {
    transactions = [],
    accounts = [],
    categories = [],
    receipts = [],
    mileage = [],
    vehicleCosts = [],
    startDate = "",
    endDate = "",
    exportLang = "en",
    currency = "USD",
    legalName = "",
    businessName = "",
    operatingName = "",
    taxId = "",
    storedTaxId = "",
    naics = "",
    region = "us",
    province = "",
    generatedAt,
    reportId,
    accountingBasis,
    fiscalYearStart = "",
    address = "",
    entityType = "",
    accountingMethod = "",
    materialParticipation = null,
    gstHstRegistered = false,
    gstHstNumber = "",
    gstHstMethod = "",
    supportArtifactMap = null,
    // Phase 2 compliance data (pre-fetched by the exports route)
    vehicleClaimMap = null,      // Map<transactionId, vehicle_expense_details row> — with transaction_date, description attached
    capitalAssets = null,         // Array of capital_assets rows for the tax year
    capitalAssetTxMap = null,     // Map<transactionId, capital_assets row>
    quickMethodSchedule = null,   // Output of buildQuickMethodSchedule, or null
    reviewStateRows = [],
    packageAttribution = {},
    exportStatus: exportStatusOption = null  // "draft" | "workpaper" | null (null = auto-derive from reviewInsights)
  } = options || {};

  validateExportProfile({
    legalName: legalName || businessName,
    businessName,
    naics,
    address,
    accountingMethod: accountingMethod || accountingBasis,
    materialParticipation,
    region,
    province,
    fiscalYearStart,
    gstHstRegistered,
    gstHstNumber,
    gstHstMethod
  });

  const labels = getPdfLabels(exportLang);
  const effectiveGeneratedAt = generatedAt || new Date().toISOString();
  const effectiveReportId = buildReportId(reportId);
  const normalizedRegion = normalizeRegionCode(region);
  const effectiveCurrency = resolveBusinessCurrency(normalizedRegion, currency);
  const resolvedTaxId = String(taxId || storedTaxId || "");
  const taxYear = Number(String(endDate || "").slice(0, 4)) || new Date().getFullYear();

  // Build effective compliance maps (normalize from arrays if needed)
  const effectiveVehicleClaimMap = vehicleClaimMap instanceof Map
    ? vehicleClaimMap
    : new Map((vehicleClaimMap ? Array.from(vehicleClaimMap.entries()) : []));
  const effectiveCapitalAssetTxMap = capitalAssetTxMap instanceof Map
    ? capitalAssetTxMap
    : new Map((capitalAssetTxMap ? Array.from(capitalAssetTxMap.entries()) : []));
  const effectiveCapitalAssets = Array.isArray(capitalAssets) ? capitalAssets : [];
  const effectiveSupportArtifactMap = supportArtifactMap instanceof Map
    ? supportArtifactMap
    : new Map((supportArtifactMap ? Array.from(supportArtifactMap.entries()) : []));

  const transactionSummary = summarizeExportTransactions(transactions, categories, {
    region: normalizedRegion,
    gstHstRegistered,
    gstHstMethod,
    receipts,
    supportArtifactMap: effectiveSupportArtifactMap,
    vehicleClaimMap: effectiveVehicleClaimMap,
    capitalAssetTxMap: effectiveCapitalAssetTxMap
  });
  const includedTransactions = transactionSummary.included;
  const excludedTransactions = transactionSummary.excluded;

  // Sum current-year CCA/MACRS depreciation from registered capital assets to fix net profit
  const capitalDepreciation = effectiveCapitalAssets.reduce(
    (sum, asset) => sum + Number(asset.current_year_depreciation || 0), 0
  );
  const totals = calculateTotals(includedTransactions, { capitalDepreciation });
  const reviewInsights = buildReviewInsights(includedTransactions, categories, receipts, {
    excluded: excludedTransactions,
    region: normalizedRegion,
    supportArtifactMap: effectiveSupportArtifactMap
  });

  // Determine compliance status. Caller may pass an explicit exportStatus (used by
  // generatePdfExportPair to guarantee both PDF builds carry the same badge). When null,
  // auto-derive: workpaper requires the included transaction set to have no unresolved review flags.
  const resolvedExportStatus =
    exportStatusOption === "workpaper" || exportStatusOption === "draft"
      ? exportStatusOption
      : (isWorkpaperReady(reviewInsights) ? "workpaper" : "draft");

  labels.statusBadgeText =
    resolvedExportStatus === "workpaper" ? labels.workpaper_badge : labels.draft_badge;
  labels.statusBadgeVariant = resolvedExportStatus === "workpaper" ? "success" : "warning";

  const isSecure = Boolean(String(taxId || "").trim());

  // Build Phase 2 schedule pages from pre-fetched compliance data
  const vehicleClaimRows = Array.from(effectiveVehicleClaimMap.values());
  const vehicleSchedulePages = buildVehicleAuditSchedule(vehicleClaimRows, effectiveCurrency, labels, normalizedRegion);
  const capitalAssetPages = buildCapitalAssetSchedule(effectiveCapitalAssets, effectiveCurrency, labels, normalizedRegion);
  const quickMethodPages = buildQuickMethodRemittancePage(quickMethodSchedule, effectiveCurrency, labels);
  const unresolvedExceptionPages = buildUnresolvedExceptionPages(includedTransactions, effectiveCurrency, labels, normalizedRegion);
  const evidenceSchedulePages = buildEvidenceSchedulePages(includedTransactions, receipts, effectiveSupportArtifactMap, labels, normalizedRegion);
  const reviewerDecisionPages = buildReviewerDecisionPages(reviewStateRows, transactions, labels, normalizedRegion, packageAttribution, isSecure);
  const reviewDecisionSummary = {
    openHard: rowsCount(reviewStateRows, (row) => row.issue_status === "open" && row.issue_severity === "hard"),
    openWarning: rowsCount(reviewStateRows, (row) => row.issue_status === "open" && row.issue_severity !== "hard"),
    resolved: rowsCount(reviewStateRows, (row) => row.issue_status === "resolved"),
    waived: rowsCount(reviewStateRows, (row) => row.issue_status === "waived")
  };

  const canvases = [
    buildIdentityPage({
      labels,
      totals,
      currency: effectiveCurrency,
      legalName: legalName || businessName,
      operatingName,
      taxId: resolvedTaxId,
      naics,
      startDate,
      endDate,
      reportId: effectiveReportId,
      generatedAt: effectiveGeneratedAt,
      accountingBasis,
      accountingMethod,
      entityType,
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
    ...buildCategoryPages(includedTransactions, categories, receipts, effectiveCurrency, labels, 0, normalizedRegion, effectiveSupportArtifactMap),
    ...buildTaxPacketPages({ transactions: includedTransactions, categories, receipts, currency: effectiveCurrency, region: normalizedRegion, labels, taxYear }),
    ...buildTransactionPages(includedTransactions, accounts, categories, receipts, effectiveCurrency, labels, normalizedRegion),
    ...unresolvedExceptionPages,
    ...evidenceSchedulePages,
    ...reviewerDecisionPages,
    ...buildExclusionPages(excludedTransactions, effectiveCurrency, labels),
    ...buildCpaChecklistPage({ labels, region: normalizedRegion, reviewInsights, currency: effectiveCurrency, reviewDecisionSummary, packageAttribution, isSecure }),
    ...buildSupportPages(receipts, includedTransactions, mileage, vehicleCosts, effectiveSupportArtifactMap, labels, effectiveCurrency, reviewInsights, normalizedRegion),
    // Phase 2 supporting schedules — only included when data exists
    ...vehicleSchedulePages,
    ...capitalAssetPages,
    ...quickMethodPages
  ];

  const pageCount = canvases.length;
  const pageContents = canvases.map((canvas, index) => {
    canvas.addFooter(index + 1, pageCount, buildFooterText(labels, effectiveReportId, effectiveGeneratedAt, isSecure, index + 1, pageCount, legalName || businessName, resolvedTaxId));
    return canvas.build();
  });
  return {
    buffer: createPdfBytes(pageContents),
    pageCount,
    reportId: effectiveReportId,
    exportStatus: resolvedExportStatus
  };
}

function buildPdfExport(options) {
  return buildPdfExportDocument(options).buffer;
}

module.exports = {
  buildPdfExport,
  buildPdfExportDocument,
  __private: {
    calculateTotals,
    computeAttachedReceiptSummary,
    computeReceiptCoverage,
    computePayerSummary,
    computeTaxLineSummary,
    expectedTaxFormForPayer,
    validateExportProfile,
    summarizeExportTransactions,
    deriveBusinessAmounts,
    classifyExcludedTransaction,
    normalizeRegionCode,
    resolveBusinessCurrency,
    buildTransactionStatus,
    buildReviewInsights,
    buildCategoryBuckets,
    buildCpaActionLines,
    buildCleanupPriorityLines,
    buildSupportWorksheetLines,
    buildUnresolvedSummaryLines,
    buildFinalDisclosureLines,
    buildChecklistItems,
    isWorkpaperReady,
    buildExclusionSummary,
    getTaxMappingRules
  }
};
