"use strict";

const FORM_TYPES = ["1099-NEC", "1099-K", "T4A", "none"];

const FORM_THRESHOLDS = {
  US: { "1099-NEC": 600, "1099-K_amount": 20000, "1099-K_count": 200 },
  CA: { "T4A": 500 }
};

function normalizeYear(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function expectedFormForPayer({ region, total, transactionCount }) {
  if (region === "CA") {
    if (total >= FORM_THRESHOLDS.CA.T4A) return "T4A";
    return null;
  }
  if (total >= FORM_THRESHOLDS.US["1099-K_amount"] && transactionCount >= FORM_THRESHOLDS.US["1099-K_count"]) {
    return "1099-K";
  }
  if (total >= FORM_THRESHOLDS.US["1099-NEC"]) {
    return "1099-NEC";
  }
  return null;
}

async function getPayerSummaryForYear(pool, { businessId, year, region }) {
  const { start, end } = yearBounds(year);

  const result = await pool.query(
    `SELECT
        COALESCE(NULLIF(TRIM(payer_name), ''), '(unspecified)') AS payer_name,
        tax_form_type,
        COUNT(*)::int AS transaction_count,
        COALESCE(SUM(amount), 0)::numeric AS total_amount,
        MIN(date) AS first_date,
        MAX(date) AS last_date
       FROM transactions
      WHERE business_id = $1
        AND type = 'income'
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
        AND (is_adjustment = false OR is_adjustment IS NULL)
        AND date BETWEEN $2::date AND $3::date
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 NULLS LAST`,
    [businessId, start, end]
  );

  const byPayer = new Map();
  for (const row of result.rows) {
    const key = row.payer_name;
    if (!byPayer.has(key)) {
      byPayer.set(key, {
        payer_name: key,
        total_amount: 0,
        transaction_count: 0,
        first_date: row.first_date,
        last_date: row.last_date,
        forms: {}
      });
    }
    const entry = byPayer.get(key);
    const amount = Number(row.total_amount || 0);
    entry.total_amount += amount;
    entry.transaction_count += Number(row.transaction_count || 0);
    if (!entry.first_date || (row.first_date && row.first_date < entry.first_date)) entry.first_date = row.first_date;
    if (!entry.last_date || (row.last_date && row.last_date > entry.last_date)) entry.last_date = row.last_date;
    const formKey = row.tax_form_type || "none";
    entry.forms[formKey] = (entry.forms[formKey] || 0) + amount;
  }

  const payers = Array.from(byPayer.values()).map((entry) => {
    const declaredForm = Object.entries(entry.forms)
      .filter(([k]) => k !== "none")
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      payer_name: entry.payer_name,
      total_amount: Number(entry.total_amount.toFixed(2)),
      transaction_count: entry.transaction_count,
      first_date: entry.first_date,
      last_date: entry.last_date,
      forms: Object.fromEntries(Object.entries(entry.forms).map(([k, v]) => [k, Number(v.toFixed(2))])),
      declared_form: declaredForm,
      expected_form: expectedFormForPayer({
        region,
        total: entry.total_amount,
        transactionCount: entry.transaction_count
      })
    };
  });

  payers.sort((a, b) => b.total_amount - a.total_amount);

  const totalIncome = payers.reduce((acc, p) => acc + p.total_amount, 0);
  const payersExpectingForm = payers.filter((p) => p.expected_form !== null);

  return {
    year,
    region,
    total_income: Number(totalIncome.toFixed(2)),
    payer_count: payers.length,
    payers_expecting_form: payersExpectingForm.length,
    payers
  };
}

async function getTaxLineSummaryForYear(pool, { businessId, year, region }) {
  const { start, end } = yearBounds(year);
  const taxColumn = region === "CA" ? "c.tax_map_ca" : "c.tax_map_us";

  const result = await pool.query(
    `SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.kind AS category_kind,
        ${taxColumn} AS tax_line,
        COUNT(t.id)::int AS transaction_count,
        COALESCE(SUM(t.amount), 0)::numeric AS total_amount,
        COUNT(DISTINCT t.id) FILTER (WHERE r.id IS NOT NULL)::int AS receipt_count
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id
                              AND t.business_id = c.business_id
                              AND t.deleted_at IS NULL
                              AND (t.is_void = false OR t.is_void IS NULL)
                              AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
                              AND t.date BETWEEN $2::date AND $3::date
       LEFT JOIN receipts r ON r.transaction_id = t.id
      WHERE c.business_id = $1
      GROUP BY c.id, c.name, c.kind, ${taxColumn}
      ORDER BY ${taxColumn} NULLS LAST, c.kind, c.name`,
    [businessId, start, end]
  );

  const lines = new Map();
  let unmappedTotal = 0;
  let unmappedCount = 0;
  const unmappedCategories = [];

  for (const row of result.rows) {
    const amount = Number(row.total_amount || 0);
    const tx = Number(row.transaction_count || 0);
    const receipts = Number(row.receipt_count || 0);
    if (!row.tax_line) {
      if (tx > 0) {
        unmappedTotal += amount;
        unmappedCount += tx;
      }
      unmappedCategories.push({
        category_id: row.category_id,
        category_name: row.category_name,
        category_kind: row.category_kind,
        transaction_count: tx,
        total_amount: Number(amount.toFixed(2))
      });
      continue;
    }
    if (!lines.has(row.tax_line)) {
      lines.set(row.tax_line, {
        tax_line: row.tax_line,
        total_amount: 0,
        transaction_count: 0,
        receipt_count: 0,
        categories: []
      });
    }
    const entry = lines.get(row.tax_line);
    entry.total_amount += amount;
    entry.transaction_count += tx;
    entry.receipt_count += receipts;
    entry.categories.push({
      category_id: row.category_id,
      category_name: row.category_name,
      category_kind: row.category_kind,
      transaction_count: tx,
      total_amount: Number(amount.toFixed(2))
    });
  }

  const mapped = Array.from(lines.values())
    .map((line) => ({
      ...line,
      total_amount: Number(line.total_amount.toFixed(2))
    }))
    .sort((a, b) => b.total_amount - a.total_amount);

  return {
    year,
    region,
    mapped_lines: mapped,
    unmapped: {
      total_amount: Number(unmappedTotal.toFixed(2)),
      transaction_count: unmappedCount,
      categories: unmappedCategories
    }
  };
}

async function getUnmappedCategories(pool, { businessId, region }) {
  const taxColumn = region === "CA" ? "tax_map_ca" : "tax_map_us";
  const result = await pool.query(
    `SELECT id, name, kind, color
       FROM categories
      WHERE business_id = $1
        AND (${taxColumn} IS NULL OR TRIM(${taxColumn}) = '')
      ORDER BY kind, name`,
    [businessId]
  );
  return result.rows;
}

module.exports = {
  getPayerSummaryForYear,
  getTaxLineSummaryForYear,
  getUnmappedCategories,
  expectedFormForPayer,
  FORM_TYPES,
  FORM_THRESHOLDS,
  __private: { normalizeYear, yearBounds }
};
