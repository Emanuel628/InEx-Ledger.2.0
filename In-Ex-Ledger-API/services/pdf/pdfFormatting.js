"use strict";

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
    footer_brand: "InEx Ledger",
  },
  fr: {
    us_report_title: "Export de dossier CPA - Etats-Unis",
    ca_report_title: "Export de dossier CPA - Canada",
    secure_badge: "Export securise",
    redacted_badge: "Export expurge",
    draft_badge: "Brouillon - Revision CPA requise",
    workpaper_badge: "Dossier CPA pret",
    not_filed:
      "Cet export est un document comptable de travail, non une declaration fiscale deposee.",
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
    footer_brand: "InEx Ledger",
  },
  es: {
    us_report_title: "Exportacion de expediente CPA - EE.UU.",
    ca_report_title: "Exportacion de expediente CPA - Canada",
    secure_badge: "Exportacion segura",
    redacted_badge: "Exportacion redactada",
    draft_badge: "Borrador - Revision CPA requerida",
    workpaper_badge: "Expediente CPA listo",
    not_filed:
      "Esta exportacion es un documento contable de trabajo, no una declaracion de impuestos presentada.",
    executive_summary: "Resumen ejecutivo",
    mapping_summary: "Resumen de mapeo fiscal",
    tax_packet_title_us: "Revision del expediente Schedule C",
    tax_packet_title_ca: "Revision del expediente T2125",
    ledger_title: "Libro mayor detallado de transacciones",
    exclusions_title: "Calendario de elementos excluidos",
    unresolved_exceptions_title: "Calendario de excepciones no resolues",
    evidence_schedule_title: "Calendario de evidencias",
    checklist_title: "Lista de verificacion CPA",
    support_title: "Anexos de soporte y divulgacion final",
    payer_review: "Revision de pagador/formulario",
    footer_brand: "InEx Ledger",
  },
};

const PAGE = { width: 612, height: 792, margin: 40, top: 752, bottom: 52 };
const COLORS = {
  black: 0,
  dark: 0.15,
  mid: 0.45,
  light: 0.9,
  fill: 0.96,
  fill2: 0.93,
};

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
  return normalizePdfText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfLiteral(text) {
  return `(${escapePdfLiteral(text)})`;
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
    maximumFractionDigits: 2,
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
  const random = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
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
  const totalLineCount = (lines || []).reduce(
    (sum, line) => sum + wrapText(line, maxChars).length,
    0,
  );
  return Math.max(
    options.minHeight || 68,
    headerHeight + totalLineCount * lineHeight + footerPadding,
  );
}

function buildTransactionText(txn) {
  return [
    txn?.description,
    txn?.note,
    txn?.memo,
    txn?.merchant,
    txn?.payee,
    txn?.payer_name,
    txn?.reference,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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

module.exports = {
  COLORS,
  PAGE,
  buildReportId,
  buildTransactionText,
  chunkArray,
  coerceBoolean,
  estimateCardHeight,
  formatCurrencyForPdf,
  formatDistance,
  formatReportTimestamp,
  getPdfLabels,
  mapByKey,
  maskTaxId,
  matchesAnyPattern,
  normalizeMoneyAmount,
  normalizePdfDate,
  normalizePdfText,
  pdfLiteral,
  resolveIndirectTaxAmount,
  safeValue,
  sanitizePackageActor,
  truncateText,
  wrapText,
};
