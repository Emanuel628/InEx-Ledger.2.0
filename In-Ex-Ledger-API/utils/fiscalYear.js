"use strict";

const FISCAL_YEAR_START_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_FISCAL_YEAR_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function normalizeFiscalYearStart(value) {
  if (value == null) {
    return { valid: true, value: null };
  }

  const raw = String(value).trim();
  if (!raw) {
    return { valid: true, value: null };
  }

  if (FISCAL_YEAR_START_RE.test(raw)) {
    return { valid: true, value: raw };
  }

  if (ISO_FISCAL_YEAR_RE.test(raw)) {
    return { valid: true, value: raw.slice(5) };
  }

  return {
    valid: false,
    error: "fiscal_year_start must be in MM-DD format with valid month (01-12) and day (01-31)."
  };
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildFiscalYearBounds(year, fiscalYearStart) {
  const normalizedYear = Number.parseInt(year, 10);
  if (!Number.isFinite(normalizedYear)) {
    throw new Error("year must be a valid integer");
  }

  const normalizedFiscalYear = normalizeFiscalYearStart(fiscalYearStart);
  const resolvedStart = normalizedFiscalYear.valid && normalizedFiscalYear.value
    ? normalizedFiscalYear.value
    : "01-01";
  const [month, day] = resolvedStart.split("-").map(Number);

  const startDate = new Date(Date.UTC(normalizedYear, month - 1, day));
  const nextStartDate = new Date(Date.UTC(normalizedYear + 1, month - 1, day));
  const endDate = new Date(nextStartDate.getTime() - 24 * 60 * 60 * 1000);

  return {
    start: formatUtcDate(startDate),
    end: formatUtcDate(endDate)
  };
}

module.exports = {
  normalizeFiscalYearStart,
  buildFiscalYearBounds
};
