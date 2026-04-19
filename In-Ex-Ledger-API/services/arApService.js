// AR/AP shared logic service (V2/Business)
const db = require('../db');

// Returns AR/AP summary for a business, including aging buckets
async function getArApSummary(businessId) {
  // AR aging buckets (invoices)
  const arAging = await db.query(
    `SELECT
      SUM(CASE WHEN due_date >= CURRENT_DATE THEN total_amount ELSE 0 END) AS current,
      SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_amount ELSE 0 END) AS overdue_1_30,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days' THEN total_amount ELSE 0 END) AS overdue_31_60,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END) AS overdue_61_90,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END) AS overdue_90_plus
     FROM invoices WHERE business_id = $1 AND status IN ('open','sent','partial')`,
    [businessId]
  );
  // AP aging buckets (bills)
  const apAging = await db.query(
    `SELECT
      SUM(CASE WHEN due_date >= CURRENT_DATE THEN total_amount ELSE 0 END) AS current,
      SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_amount ELSE 0 END) AS overdue_1_30,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days' THEN total_amount ELSE 0 END) AS overdue_31_60,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END) AS overdue_61_90,
      SUM(CASE WHEN due_date < CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END) AS overdue_90_plus
     FROM bills WHERE business_id = $1 AND status IN ('open','sent','partial')`,
    [businessId]
  );
  return {
    ar: {
      current: Number(arAging.rows[0].current) || 0,
      overdue_1_30: Number(arAging.rows[0].overdue_1_30) || 0,
      overdue_31_60: Number(arAging.rows[0].overdue_31_60) || 0,
      overdue_61_90: Number(arAging.rows[0].overdue_61_90) || 0,
      overdue_90_plus: Number(arAging.rows[0].overdue_90_plus) || 0
    },
    ap: {
      current: Number(apAging.rows[0].current) || 0,
      overdue_1_30: Number(apAging.rows[0].overdue_1_30) || 0,
      overdue_31_60: Number(apAging.rows[0].overdue_31_60) || 0,
      overdue_61_90: Number(apAging.rows[0].overdue_61_90) || 0,
      overdue_90_plus: Number(apAging.rows[0].overdue_90_plus) || 0
    }
  };
}

module.exports = {
  getArApSummary
};
