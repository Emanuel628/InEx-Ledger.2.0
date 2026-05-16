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

module.exports = {
  normalizeFiscalYearStart
};
