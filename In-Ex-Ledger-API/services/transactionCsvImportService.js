"use strict";

// Pure/near-pure helpers for POST /api/transactions/import/csv: parsing raw
// CSV text, detecting which columns hold date/amount/description across
// common bank-export formats, and deciding which rows are importable. Kept
// side-effect-free where possible (parsing/detection) or DB-access-injected
// (countImportableCsvRows) so they're directly testable without a database.

const { assertDateUnlocked } = require("./accountingLockService.js");
const { findDuplicateCandidates } = require("./transactionImportService.js");

/**
 * Parses raw CSV text into an array of row objects keyed by normalized header names.
 * Supports quoted commas, escaped quotes, and embedded newlines inside quoted fields.
 */
function parseCsv(text) {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.trim()) {
    return [];
  }

  const rows = [];
  let row = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === '"') {
      if (inQuote && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (ch === "," && !inQuote) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (ch === "\n" && !inQuote) {
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => String(value || "").trim())) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((value) => String(value || "").trim())) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").toLowerCase().replace(/[^a-z0-9_$]/g, "_"));
  return rows.slice(1).map((cells) => {
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index] ?? "";
    });
    return mapped;
  });
}

const DATE_PATTERNS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,          // YYYY-MM-DD
  /^(\d{2})\/(\d{2})\/(\d{4})$/,         // MM/DD/YYYY
  /^(\d{2})-(\d{2})-(\d{4})$/,           // MM-DD-YYYY
  /^(\d{2})\/(\d{2})\/(\d{2})$/,         // MM/DD/YY
];

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const [m1] = DATE_PATTERNS;
  if (m1.test(s)) return s; // already YYYY-MM-DD

  // MM/DD/YYYY
  const mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mm) return `${mm[3]}-${mm[1].padStart(2, "0")}-${mm[2].padStart(2, "0")}`;

  // MM-DD-YYYY
  const md = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (md) return `${md[3]}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;

  // MM/DD/YY
  const ms = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ms) {
    const yr = Number(ms[3]) >= 50 ? `19${ms[3]}` : `20${ms[3]}`;
    return `${yr}-${ms[1].padStart(2, "0")}-${ms[2].padStart(2, "0")}`;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

/**
 * Tries to detect date/amount/description columns from CSV headers.
 * Supports common Canadian bank export formats (BMO, TD, RBC, Scotiabank, CIBC, etc.)
 */
function detectColumns(headers) {
  const h = headers.map((x) => x.toLowerCase());
  const find = (...candidates) => candidates.find((c) => h.includes(c)) || null;

  const dateCol = find(
    "date", "transaction_date", "trans__date", "posted_date", "posting_date",
    "post_date", "date_", "date_posted", "trans_date", "value_date",
    "effective_date", "settlement_date", "completed_date", "started_date"
  );
  const descCol = find(
    "description", "transaction_description", "transaction_description_1",
    "description_1", "description_2",
    "payee", "merchant", "memo", "details", "narrative",
    "trans__description", "particulars", "beneficiary", "name"
  );
  const merchantCol = find(
    "merchant_name", "merchant", "payee", "beneficiary", "counterparty", "vendor", "name"
  );
  const categoryCol = find(
    "category", "category_guess", "plaid_category", "personal_finance_category", "type_description"
  );
  const amountCol = find(
    "amount", "transaction_amount", "net_amount", "debit_credit", "cad_", "usd_"
  );
  const withdrawalCol = find(
    "withdrawal", "debit", "withdrawals", "cheques_and_other_deductions",
    "withdrawals_debits", "withdrawals__dr_", "amount_debit", "debit_amount", "money_out"
  );
  const depositCol = find(
    "deposit", "credit", "deposits", "deposits_and_other_credits",
    "deposits_credits", "deposits__cr_", "amount_credit", "credit_amount", "money_in"
  );

  return { dateCol, descCol, merchantCol, categoryCol, amountCol, withdrawalCol, depositCol };
}

function derivePseudoMerchant(description) {
  if (!description) return "";
  const cleaned = String(description)
    .toLowerCase()
    .replace(/\b(usd|cad|payment|debit|credit|purchase|pos|online|withdrawal|transfer)\b/g, " ")
    .replace(/[#*]+\d+|\d{3,}/g, " ")
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").filter(Boolean).slice(0, 3).join(" ");
}

function collectCsvTextFields(row, fields) {
  const seen = new Set();
  const values = [];
  for (const field of fields) {
    if (!field || seen.has(field)) continue;
    seen.add(field);
    const value = String(row[field] || "").trim();
    if (value) values.push(value);
  }
  return values;
}

function extractRowData(row, cols) {
  let amount = null;
  let type = null;

  if (cols.amountCol && row[cols.amountCol] !== undefined && row[cols.amountCol] !== "") {
    const raw = String(row[cols.amountCol]).replace(/[$, ]/g, "");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) {
      amount = Math.abs(n);
      type = n < 0 ? "expense" : "income";
    }
  } else {
    const withdrawal = String(row[cols.withdrawalCol] || "").replace(/[$, ]/g, "");
    const deposit = String(row[cols.depositCol] || "").replace(/[$, ]/g, "");
    const wAmt = Number.parseFloat(withdrawal);
    const dAmt = Number.parseFloat(deposit);
    if (Number.isFinite(dAmt) && dAmt > 0) {
      amount = dAmt;
      type = "income";
    } else if (Number.isFinite(wAmt) && wAmt > 0) {
      amount = wAmt;
      type = "expense";
    }
  }

  const description = collectCsvTextFields(row, [
    cols.descCol,
    "transaction_description_1",
    "transaction_description_2",
    "description_1",
    "description_2",
    "details",
    "memo",
    "narrative",
    "particulars"
  ]).join(" ").trim().slice(0, 500);
  const merchantName = (String(
    row[cols.merchantCol] ||
    row["merchant_name"] ||
    row["merchant"] ||
    row["payee"] ||
    row["beneficiary"] ||
    ""
  ).trim() || derivePseudoMerchant(description)).slice(0, 200);
  const categoryGuess = String(
    row[cols.categoryCol] ||
    row["category_guess"] ||
    row["category"] ||
    row["personal_finance_category"] ||
    ""
  ).trim().slice(0, 120);

  const date = normalizeDate(row[cols.dateCol]);

  return { amount, type, description, merchantName, categoryGuess, date };
}

const IMPORT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate optional start_date / end_date on the CSV import body.
 * Returns either { error: "..." } or { startDate, endDate } with each
 * field a YYYY-MM-DD string or null.
 */
function parseImportDateRange(body = {}) {
  const start = String(body.start_date || "").trim();
  const end = String(body.end_date || "").trim();
  if (start && !IMPORT_ISO_DATE_RE.test(start)) {
    return { error: "start_date must be YYYY-MM-DD." };
  }
  if (end && !IMPORT_ISO_DATE_RE.test(end)) {
    return { error: "end_date must be YYYY-MM-DD." };
  }
  if (start && end && start > end) {
    return { error: "start_date must be on or before end_date." };
  }
  return { startDate: start || null, endDate: end || null };
}

function isPlannedCsvDuplicate(plannedRows, candidate, dateWindowDays = 2) {
  if (!candidate || !Array.isArray(plannedRows) || !plannedRows.length) {
    return false;
  }

  const candidateTime = Date.parse(candidate.date);
  if (Number.isNaN(candidateTime)) {
    return false;
  }

  return plannedRows.some((row) => {
    if (
      row.accountId !== candidate.accountId ||
      row.amount !== candidate.amount ||
      row.type !== candidate.type ||
      row.description !== candidate.description
    ) {
      return false;
    }

    const rowTime = Date.parse(row.date);
    if (Number.isNaN(rowTime)) {
      return false;
    }

    const diffDays = Math.abs(candidateTime - rowTime) / 86400000;
    return diffDays <= dateWindowDays;
  });
}

async function countImportableCsvRows(rows, cols, options = {}) {
  const {
    client,
    businessId,
    accountId,
    filterStartDate = null,
    filterEndDate = null,
    skipDuplicates = true,
    lockState = null,
    findDuplicateCandidatesFn = findDuplicateCandidates,
    assertDateUnlockedFn = assertDateUnlocked
  } = options;

  const plannedRows = [];
  let importableRows = 0;

  for (const row of rows) {
    const preview = extractRowData(row, cols);
    if (!preview.date || !preview.amount || !preview.type || preview.amount <= 0 || !preview.description) {
      continue;
    }
    if (filterStartDate && preview.date < filterStartDate) {
      continue;
    }
    if (filterEndDate && preview.date > filterEndDate) {
      continue;
    }

    try {
      if (lockState) {
        assertDateUnlockedFn(lockState, preview.date);
      }
    } catch (_) {
      continue;
    }

    if (skipDuplicates) {
      if (isPlannedCsvDuplicate(plannedRows, { ...preview, accountId })) {
        continue;
      }

      const candidates = await findDuplicateCandidatesFn(client, {
        businessId,
        accountId,
        date: preview.date,
        amount: preview.amount,
        type: preview.type,
        description: preview.description,
        dateWindowDays: 2
      });

      if (Array.isArray(candidates) && candidates.length > 0) {
        continue;
      }
    }

    plannedRows.push({
      accountId,
      date: preview.date,
      amount: preview.amount,
      type: preview.type,
      description: preview.description
    });
    importableRows += 1;
  }

  return importableRows;
}

module.exports = {
  parseCsv,
  normalizeDate,
  detectColumns,
  derivePseudoMerchant,
  collectCsvTextFields,
  extractRowData,
  parseImportDateRange,
  isPlannedCsvDuplicate,
  countImportableCsvRows
};
