import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const CURRENT_YEAR = new Date().getFullYear();
const START_DATE = process.env.RECEIPT_EXPORT_START_DATE || process.env.START_DATE || `${CURRENT_YEAR}-01-01`;
const END_DATE = process.env.RECEIPT_EXPORT_END_DATE || process.env.END_DATE || `${CURRENT_YEAR}-12-31`;
const BUSINESS_ID = process.env.RECEIPT_EXPORT_BUSINESS_ID || process.env.BUSINESS_ID || "";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(START_DATE) || !/^\d{4}-\d{2}-\d{2}$/.test(END_DATE) || START_DATE > END_DATE) {
  console.error("Use valid YYYY-MM-DD dates with START_DATE <= END_DATE.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false }
});

async function resolveBusinessId(client) {
  if (BUSINESS_ID) return BUSINESS_ID;
  const { rows } = await client.query(
    `SELECT business_id, COUNT(*)::int AS transaction_count
       FROM transactions
      WHERE date >= $1
        AND date <= $2
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
        AND (is_adjustment = false OR is_adjustment IS NULL)
      GROUP BY business_id
      ORDER BY transaction_count DESC
      LIMIT 1`,
    [START_DATE, END_DATE]
  );
  return rows[0]?.business_id || "";
}

async function main() {
  const client = await pool.connect();
  try {
    const businessId = await resolveBusinessId(client);
    if (!businessId) {
      console.log(`No business has exportable transactions from ${START_DATE} to ${END_DATE}.`);
      return;
    }

    const { rows: totals } = await client.query(
      `SELECT
         COUNT(*)::int AS total_receipts,
         COUNT(*) FILTER (WHERE transaction_id IS NOT NULL)::int AS linked_receipts,
         COUNT(*) FILTER (WHERE transaction_id IS NULL)::int AS unattached_receipts
       FROM receipts
       WHERE business_id = $1`,
      [businessId]
    );

    const { rows: exportRows } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE t.type = 'expense')::int AS export_expense_transactions,
         COUNT(DISTINCT r.transaction_id) FILTER (WHERE t.type = 'expense')::int AS expense_transactions_with_receipts,
         COUNT(r.id)::int AS export_visible_receipt_rows
       FROM transactions t
       LEFT JOIN receipts r
         ON r.transaction_id = t.id
        AND r.business_id = t.business_id
       WHERE t.business_id = $1
         AND t.date >= $2
         AND t.date <= $3
         AND t.deleted_at IS NULL
         AND (t.is_void = false OR t.is_void IS NULL)
         AND (t.is_adjustment = false OR t.is_adjustment IS NULL)`,
      [businessId, START_DATE, END_DATE]
    );

    const { rows: outsideRange } = await client.query(
      `SELECT COUNT(*)::int AS linked_outside_range
         FROM receipts r
         JOIN transactions t ON t.id = r.transaction_id
        WHERE r.business_id = $1
          AND t.business_id = $1
          AND (t.date < $2 OR t.date > $3)`,
      [businessId, START_DATE, END_DATE]
    );

    const total = totals[0] || {};
    const exportStats = exportRows[0] || {};
    const expenseCount = Number(exportStats.export_expense_transactions || 0);
    const withReceipts = Number(exportStats.expense_transactions_with_receipts || 0);
    const coverage = expenseCount ? ((withReceipts / expenseCount) * 100).toFixed(1) : "0.0";

    console.log("Receipt export coverage diagnostics");
    console.log("===================================");
    console.log(`Business ID: ${businessId}`);
    console.log(`Export range: ${START_DATE} to ${END_DATE}`);
    console.log(`Total receipts for business: ${total.total_receipts || 0}`);
    console.log(`Linked receipts for business: ${total.linked_receipts || 0}`);
    console.log(`Unattached receipts for business: ${total.unattached_receipts || 0}`);
    console.log(`Linked receipts outside export range: ${outsideRange[0]?.linked_outside_range || 0}`);
    console.log(`Export expense transactions: ${expenseCount}`);
    console.log(`Expense transactions with receipts: ${withReceipts}`);
    console.log(`Export-visible receipt rows: ${exportStats.export_visible_receipt_rows || 0}`);
    console.log(`Coverage: ${coverage}%`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
