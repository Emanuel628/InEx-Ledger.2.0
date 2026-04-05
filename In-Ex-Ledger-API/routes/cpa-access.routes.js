const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const {
  listOwnedCpaGrants,
  listOwnedCpaAuditLogs,
  listAssignedCpaGrants,
  listAccessibleBusinessScopeForUser,
  resolveAccessiblePortfolioForUser,
  createCpaGrant,
  revokeOwnedCpaGrant,
  acceptAssignedCpaGrant,
  logCpaAuditEvent
} = require("../services/cpaAccessService.js");
const { pool } = require("../db.js");
const { buildRedactedStream } = require("../services/exportStorage.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter({ max: 60 }));

router.get("/grants/owned", async (req, res) => {
  try {
    const grants = await listOwnedCpaGrants(req.user.id);
    res.json({ grants });
  } catch (error) {
    console.error("GET /api/cpa-access/grants/owned error:", error.message);
    res.status(500).json({ error: "Failed to load CPA access grants." });
  }
});

router.get("/grants/assigned", async (req, res) => {
  try {
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    console.error("GET /api/cpa-access/grants/assigned error:", error.message);
    res.status(500).json({ error: "Failed to load assigned CPA access." });
  }
});

router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const logs = await listOwnedCpaAuditLogs(req.user.id, limit);
    res.json({ logs });
  } catch (error) {
    console.error("GET /api/cpa-access/audit error:", error.message);
    res.status(500).json({ error: "Failed to load CPA audit logs." });
  }
});

router.get("/portfolio", async (req, res) => {
  try {
    const portfolios = await listAccessibleBusinessScopeForUser(req.user);
    res.json({ portfolios });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio error:", error.message);
    res.status(500).json({ error: "Failed to load CPA portfolio access." });
  }
});

async function resolveGrantedPortfolioOr404(req, res) {
  const ownerUserId = String(req.params.ownerUserId || "").trim();
  const businessId = String(req.query.business_id || "").trim();
  const portfolio = await resolveAccessiblePortfolioForUser(req.user, ownerUserId, businessId);
  if (!portfolio) {
    res.status(404).json({ error: "CPA portfolio access not found." });
    return null;
  }
  return portfolio;
}

router.get("/portfolio/:ownerUserId/summary", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const ids = portfolio.business_ids;
    const [transactionsResult, receiptsResult, mileageResult, exportsResult] = await Promise.all([
      pool.query(
        `SELECT business_id,
                type,
                COALESCE(SUM(ABS(amount)), 0) AS total,
                COUNT(*)::int AS count
           FROM transactions
          WHERE business_id = ANY($1::uuid[])
          GROUP BY business_id, type`,
        [ids]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
           FROM receipts
          WHERE business_id = ANY($1::uuid[])`,
        [ids]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
           FROM mileage
          WHERE business_id = ANY($1::uuid[])`,
        [ids]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
           FROM exports
          WHERE business_id = ANY($1::uuid[])`,
        [ids]
      )
    ]);

    let income = 0;
    let expenses = 0;
    let transactionCount = 0;
    const businessSummaryMap = new Map(
      portfolio.businesses.map((business) => [
        business.id,
        {
          business_id: business.id,
          business_name: business.name || "Business",
          region: String(business.region || "US").toUpperCase(),
          province: String(business.province || "").toUpperCase(),
          language: business.language || "en",
          currency: String(business.region || "").toUpperCase() === "CA" ? "CAD" : "USD",
          tax_form_label: String(business.region || "").toUpperCase() === "CA" ? "Canada T2125" : "U.S. Schedule C",
          total_income: 0,
          total_expenses: 0,
          net_profit: 0,
          transaction_count: 0
        }
      ])
    );

    transactionsResult.rows.forEach((row) => {
      const total = Number(row.total) || 0;
      const count = Number(row.count) || 0;
      transactionCount += count;
      if (row.type === "income") {
        income += total;
      } else {
        expenses += total;
      }

      const businessSummary = businessSummaryMap.get(row.business_id);
      if (!businessSummary) {
        return;
      }
      businessSummary.transaction_count += count;
      if (row.type === "income") {
        businessSummary.total_income += total;
      } else {
        businessSummary.total_expenses += total;
      }
    });

    for (const summary of businessSummaryMap.values()) {
      summary.net_profit = summary.total_income - summary.total_expenses;
    }

    const businessSummaries = [...businessSummaryMap.values()];
    const currencies = [...new Set(businessSummaries.map((summary) => summary.currency))];

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_summary_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids
      }
    });

    res.json({
      owner_user_id: portfolio.owner_user_id,
      owner_email: portfolio.owner_email,
      grant_scope: portfolio.grant_scope,
      businesses: portfolio.businesses,
      summary: {
        total_income: income,
        total_expenses: expenses,
        net_profit: income - expenses,
        transaction_count: transactionCount,
        receipt_count: Number(receiptsResult.rows[0]?.count || 0),
        mileage_count: Number(mileageResult.rows[0]?.count || 0),
        export_count: Number(exportsResult.rows[0]?.count || 0),
        currency: currencies.length === 1 ? currencies[0] : null,
        mixed_currency_scope: currencies.length > 1
      },
      business_summaries: businessSummaries
    });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/summary error:", error.message);
    res.status(500).json({ error: "Failed to load CPA summary." });
  }
});

router.get("/portfolio/:ownerUserId/transactions", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await pool.query(
      `SELECT t.id,
              t.business_id,
              b.name AS business_name,
              b.region AS business_region,
              t.account_id,
              a.name AS account_name,
              t.category_id,
              c.name AS category_name,
              t.amount,
              t.type,
              t.cleared,
              t.description,
              t.date,
              t.note,
              t.created_at
         FROM transactions t
         JOIN businesses b ON b.id = t.business_id
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = ANY($1::uuid[])
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT $2 OFFSET $3`,
      [portfolio.business_ids, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM transactions
        WHERE business_id = ANY($1::uuid[])`,
      [portfolio.business_ids]
    );

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_transactions_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids,
        limit,
        offset
      }
    });

    res.json({
      data: result.rows,
      total: Number(countResult.rows[0]?.count || 0),
      limit,
      offset,
      businesses: portfolio.businesses
    });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/transactions error:", error.message);
    res.status(500).json({ error: "Failed to load CPA transactions." });
  }
});

router.get("/portfolio/:ownerUserId/receipts", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const result = await pool.query(
      `SELECT r.id,
              r.business_id,
              b.name AS business_name,
              r.transaction_id,
              r.filename,
              r.mime_type,
              r.created_at
         FROM receipts r
         JOIN businesses b ON b.id = r.business_id
        WHERE r.business_id = ANY($1::uuid[])
        ORDER BY b.name ASC, r.created_at DESC NULLS LAST`,
      [portfolio.business_ids]
    );

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_receipts_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids
      }
    });

    res.json({ receipts: result.rows, businesses: portfolio.businesses });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/receipts error:", error.message);
    res.status(500).json({ error: "Failed to load CPA receipts." });
  }
});

router.get("/portfolio/:ownerUserId/mileage", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const result = await pool.query(
      `SELECT m.id,
              m.business_id,
              b.name AS business_name,
              m.trip_date,
              m.purpose,
              m.destination,
              m.miles,
              m.km,
              m.odometer_start,
              m.odometer_end,
              m.created_at
         FROM mileage m
         JOIN businesses b ON b.id = m.business_id
        WHERE m.business_id = ANY($1::uuid[])
        ORDER BY m.trip_date DESC, m.created_at DESC`,
      [portfolio.business_ids]
    );

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_mileage_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids
      }
    });

    res.json({ data: result.rows, businesses: portfolio.businesses });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/mileage error:", error.message);
    res.status(500).json({ error: "Failed to load CPA mileage." });
  }
});

router.get("/portfolio/:ownerUserId/exports", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const result = await pool.query(
      `SELECT e.id,
              e.business_id,
              b.name AS business_name,
              b.region AS business_region,
              b.province AS business_province,
              e.export_type,
              e.start_date,
              e.end_date,
              e.include_tax_id,
              e.created_at,
              m.language,
              m.currency,
              m.page_count
         FROM exports e
         JOIN businesses b ON b.id = e.business_id
         LEFT JOIN export_metadata m ON m.export_id = e.id
        WHERE e.business_id = ANY($1::uuid[])
        ORDER BY e.created_at DESC
        LIMIT 100`,
      [portfolio.business_ids]
    );

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_exports_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids
      }
    });

    res.json({ exports: result.rows, businesses: portfolio.businesses });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/exports error:", error.message);
    res.status(500).json({ error: "Failed to load CPA exports." });
  }
});

router.get("/portfolio/:ownerUserId/audit", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const grantsResult = await pool.query(
      `SELECT id
         FROM cpa_access_grants
        WHERE owner_user_id = $1
          AND grantee_user_id = $2
          AND status = 'active'
          AND (
            scope = 'all'
            OR business_id = ANY($3::uuid[])
          )`,
      [portfolio.owner_user_id, req.user.id, portfolio.business_ids]
    );

    const grantIds = grantsResult.rows.map((row) => row.id);
    const auditQuery = grantIds.length
      ? `SELECT l.id,
                l.actor_user_id,
                actor.email AS actor_email,
                l.owner_user_id,
                l.grant_id,
                l.business_id,
                b.name AS business_name,
                l.action,
                l.metadata,
                l.created_at
           FROM cpa_audit_logs l
           LEFT JOIN users actor ON actor.id = l.actor_user_id
           LEFT JOIN businesses b ON b.id = l.business_id
          WHERE l.owner_user_id = $1
            AND (
              l.actor_user_id = $2
              OR l.grant_id = ANY($3::uuid[])
            )
            AND (
              l.business_id IS NULL
              OR l.business_id = ANY($4::uuid[])
            )
          ORDER BY l.created_at DESC
          LIMIT $5`
      : `SELECT l.id,
                l.actor_user_id,
                actor.email AS actor_email,
                l.owner_user_id,
                l.grant_id,
                l.business_id,
                b.name AS business_name,
                l.action,
                l.metadata,
                l.created_at
           FROM cpa_audit_logs l
           LEFT JOIN users actor ON actor.id = l.actor_user_id
           LEFT JOIN businesses b ON b.id = l.business_id
          WHERE l.owner_user_id = $1
            AND l.actor_user_id = $2
            AND (
              l.business_id IS NULL
              OR l.business_id = ANY($3::uuid[])
            )
          ORDER BY l.created_at DESC
          LIMIT $4`;
    const auditParams = grantIds.length
      ? [portfolio.owner_user_id, req.user.id, grantIds, portfolio.business_ids, limit]
      : [portfolio.owner_user_id, req.user.id, portfolio.business_ids, limit];
    const auditResult = await pool.query(auditQuery, auditParams);

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_audit_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids,
        limit
      }
    });

    res.json({ logs: auditResult.rows });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/audit error:", error.message);
    res.status(500).json({ error: "Failed to load CPA audit activity." });
  }
});

router.get("/portfolio/:ownerUserId/exports/:exportId/redacted", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const exportId = String(req.params.exportId || "").trim();
    const result = await pool.query(
      `SELECT e.id,
              e.business_id,
              e.file_path
         FROM exports e
        WHERE e.id = $1
          AND e.business_id = ANY($2::uuid[])
        LIMIT 1`,
      [exportId, portfolio.business_ids]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Export not found in granted scope." });
    }

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: result.rows[0].business_id,
      action: "portfolio_export_downloaded",
      metadata: {
        export_id: exportId,
        grant_scope: portfolio.grant_scope
      }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="inex-ledger-cpa-export-${exportId}.pdf"`);
    buildRedactedStream(res, result.rows[0].file_path);
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio/:ownerUserId/exports/:exportId/redacted error:", error.message);
    res.status(500).json({ error: "Failed to download CPA export." });
  }
});

router.post("/grants", async (req, res) => {
  try {
    const grantId = await createCpaGrant(req.user, req.body);
    const grants = await listOwnedCpaGrants(req.user.id);
    res.status(201).json({ id: grantId, grants });
  } catch (error) {
    const message = error?.message || "Failed to create CPA access grant.";
    const status = /required|cannot invite|not found|already exists/i.test(message) ? 400 : 500;
    console.error("POST /api/cpa-access/grants error:", message);
    res.status(status).json({ error: message });
  }
});

router.post("/grants/:id/accept", async (req, res) => {
  try {
    const accepted = await acceptAssignedCpaGrant(req.user, req.params.id);
    if (!accepted) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    console.error("POST /api/cpa-access/grants/:id/accept error:", error.message);
    res.status(500).json({ error: "Failed to accept CPA access." });
  }
});

router.delete("/grants/:id", async (req, res) => {
  try {
    const revoked = await revokeOwnedCpaGrant(req.user.id, req.params.id);
    if (!revoked) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    res.status(204).end();
  } catch (error) {
    console.error("DELETE /api/cpa-access/grants/:id error:", error.message);
    res.status(500).json({ error: "Failed to revoke CPA access." });
  }
});

module.exports = router;
