const express = require("express");
const fs = require("fs");
const { requireAuth, requireMfa } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter, createRouteLimiter } = require("../middleware/rate-limit.middleware.js");

// Tighter limiter for sensitive audit-log and grant-mutation endpoints
const cpaAuditLimiter = createRouteLimiter({ windowMs: 60 * 1000, max: 10, keyPrefix: "rl:cpa:audit" });
const cpaGrantMutationLimiter = createRouteLimiter({ windowMs: 60 * 1000, max: 20, keyPrefix: "rl:cpa:grant" });
const {
  listOwnedCpaGrants,
  listOwnedCpaAuditLogs,
  listAssignedCpaGrants,
  listAccessibleBusinessScopeForUser,
  resolveAccessiblePortfolioForUser,
  createCpaGrant,
  revokeOwnedCpaGrant,
  deleteOwnedRevokedCpaGrant,
  acceptAssignedCpaGrant,
  logCpaAuditEvent
} = require("../services/cpaAccessService.js");
const { pool } = require("../db.js");
const { buildRedactedStream } = require("../services/exportStorage.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireMfa);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter({ max: 60 }));

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

router.get("/grants/owned", async (req, res) => {
  try {
    const grants = await listOwnedCpaGrants(req.user.id);
    res.json({ grants });
  } catch (error) {
    logError("GET /api/cpa-access/grants/owned error:", error.message);
    res.status(500).json({ error: "Failed to load CPA access grants." });
  }
});

router.get("/grants/assigned", async (req, res) => {
  try {
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    logError("GET /api/cpa-access/grants/assigned error:", error.message);
    res.status(500).json({ error: "Failed to load assigned CPA access." });
  }
});

router.get("/audit", cpaAuditLimiter, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const logs = await listOwnedCpaAuditLogs(req.user.id, limit);
    res.json({ logs });
  } catch (error) {
    logError("GET /api/cpa-access/audit error:", error.message);
    res.status(500).json({ error: "Failed to load CPA audit logs." });
  }
});

router.get("/portfolio", async (req, res) => {
  try {
    const portfolios = await listAccessibleBusinessScopeForUser(req.user);
    res.json({ portfolios });
  } catch (error) {
    logError("GET /api/cpa-access/portfolio error:", error.message);
    res.status(500).json({ error: "Failed to load CPA portfolio access." });
  }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveGrantedPortfolioOr404(req, res) {
  const ownerUserId = String(req.params.ownerUserId || "").trim();
  const businessId = String(req.query.business_id || "").trim();

  if (!UUID_RE.test(ownerUserId)) {
    res.status(400).json({ error: "Invalid owner user ID." });
    return null;
  }
  if (businessId && !UUID_RE.test(businessId)) {
    res.status(400).json({ error: "Invalid business ID." });
    return null;
  }

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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/summary error:", error.message);
    res.status(500).json({ error: "Failed to load CPA summary." });
  }
});

router.get("/portfolio/:ownerUserId/transactions", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
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
          AND t.deleted_at IS NULL
          AND (t.is_void = false OR t.is_void IS NULL)
          AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT $2 OFFSET $3`,
      [portfolio.business_ids, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM transactions
        WHERE business_id = ANY($1::uuid[])
          AND deleted_at IS NULL
          AND (is_void = false OR is_void IS NULL)
          AND (is_adjustment = false OR is_adjustment IS NULL)`,
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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/transactions error:", error.message);
    res.status(500).json({ error: "Failed to load CPA transactions." });
  }
});

router.get("/portfolio/:ownerUserId/receipts", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

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
        ORDER BY b.name ASC, r.created_at DESC NULLS LAST
        LIMIT $2 OFFSET $3`,
      [portfolio.business_ids, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM receipts
        WHERE business_id = ANY($1::uuid[])`,
      [portfolio.business_ids]
    );

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: portfolio.business_ids.length === 1 ? portfolio.business_ids[0] : null,
      action: "portfolio_receipts_viewed",
      metadata: {
        grant_scope: portfolio.grant_scope,
        business_ids: portfolio.business_ids,
        limit,
        offset
      }
    });

    res.json({
      receipts: result.rows,
      total: Number(countResult.rows[0]?.count || 0),
      limit,
      offset,
      businesses: portfolio.businesses
    });
  } catch (error) {
    logError("GET /api/cpa-access/portfolio/:ownerUserId/receipts error:", error.message);
    res.status(500).json({ error: "Failed to load CPA receipts." });
  }
});

router.get("/portfolio/:ownerUserId/receipts/:receiptId", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    const receiptId = String(req.params.receiptId || "").trim();
    const result = await pool.query(
      `SELECT r.id,
              r.business_id,
              r.filename,
              r.mime_type,
              r.storage_path
         FROM receipts r
        WHERE r.id = $1
          AND r.business_id = ANY($2::uuid[])
        LIMIT 1`,
      [receiptId, portfolio.business_ids]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Receipt not found in granted scope." });
    }

    const receipt = result.rows[0];
    if (!receipt.storage_path || !fs.existsSync(receipt.storage_path)) {
      return res.status(404).json({ error: "Receipt file missing." });
    }

    await logCpaAuditEvent({
      actorUserId: req.user.id,
      ownerUserId: portfolio.owner_user_id,
      businessId: receipt.business_id,
      action: "portfolio_receipt_downloaded",
      metadata: {
        receipt_id: receiptId,
        grant_scope: portfolio.grant_scope
      }
    });

    res.setHeader("Cache-Control", "private, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", receipt.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(receipt.filename || `receipt-${receiptId}`)}`
    );

    return res.sendFile(receipt.storage_path);
  } catch (error) {
    logError("GET /api/cpa-access/portfolio/:ownerUserId/receipts/:receiptId error:", error.message);
    return res.status(500).json({ error: "Failed to download CPA receipt." });
  }
});

router.get("/portfolio/:ownerUserId/mileage", async (req, res) => {
  try {
    const portfolio = await resolveGrantedPortfolioOr404(req, res);
    if (!portfolio) {
      return;
    }

    // Detect which date column(s) exist (trip_date was added in a later migration;
    // older schemas may only have date).
    const colResult = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mileage'
          AND column_name IN ('date', 'trip_date')`
    );
    const existingCols = new Set(colResult.rows.map((r) => r.column_name));
    const hasTripDate = existingCols.has("trip_date");
    const hasDate = existingCols.has("date");

    // Use hard-coded column references to avoid any SQL injection risk.
    let dateSelectExpr;
    let dateOrderExpr;
    if (hasTripDate && hasDate) {
      dateSelectExpr = "COALESCE(m.trip_date, m.date)";
      dateOrderExpr = "COALESCE(m.trip_date, m.date)";
    } else if (hasTripDate) {
      dateSelectExpr = "m.trip_date";
      dateOrderExpr = "m.trip_date";
    } else {
      dateSelectExpr = "m.date";
      dateOrderExpr = "m.date";
    }

    const result = await pool.query(
      `SELECT m.id,
              m.business_id,
              b.name AS business_name,
              ${dateSelectExpr} AS trip_date,
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
        ORDER BY ${dateOrderExpr} DESC, m.created_at DESC`,
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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/mileage error:", error.message);
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
              e.created_at,
              e.type AS export_type,
              m.start_date,
              m.end_date,
              m.include_tax_id,
              m.language,
              COALESCE(m.currency, CASE WHEN b.region = 'CA' THEN 'CAD' ELSE 'USD' END) AS currency,
              m.page_count
         FROM exports e
         JOIN businesses b ON b.id = e.business_id
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'start_date' THEN value END) AS start_date,
                  MAX(CASE WHEN key = 'end_date' THEN value END) AS end_date,
                  MAX(CASE WHEN key = 'include_tax_id' THEN value END) AS include_tax_id,
                  MAX(CASE WHEN key = 'language' THEN value END) AS language,
                  MAX(CASE WHEN key = 'currency' THEN value END) AS currency,
                  MAX(CASE WHEN key = 'page_count' THEN value END) AS page_count
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/exports error:", error.message);
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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/audit error:", error.message);
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
              m.file_path
         FROM exports e
         LEFT JOIN LATERAL (
           SELECT MAX(CASE WHEN key = 'file_path' THEN value END) AS file_path
             FROM export_metadata
            WHERE export_id = e.id
         ) m ON TRUE
        WHERE e.id = $1
          AND e.business_id = ANY($2::uuid[])
        LIMIT 1`,
      [exportId, portfolio.business_ids]
    );

    if (!result.rowCount || !result.rows[0].file_path) {
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
    logError("GET /api/cpa-access/portfolio/:ownerUserId/exports/:exportId/redacted error:", error.message);
    res.status(500).json({ error: "Failed to download CPA export." });
  }
});

router.post("/grants", cpaGrantMutationLimiter, async (req, res) => {
  try {
    const grant = await createCpaGrant(req.user, req.body, getClientIp(req));
    const grants = await listOwnedCpaGrants(req.user.id);
    res.status(201).json({
      id: grant.grantId,
      email_sent: grant.emailSent,
      grants
    });
  } catch (error) {
    const message = error?.message || "Failed to create CPA access grant.";
    const status = /required|cannot invite|not found|already exists/i.test(message) ? 400 : 500;
    logError("POST /api/cpa-access/grants error:", message);
    res.status(status).json({ error: message });
  }
});

router.post("/grants/:id/accept", cpaGrantMutationLimiter, async (req, res) => {
  try {
    const accepted = await acceptAssignedCpaGrant(req.user, req.params.id, getClientIp(req));
    if (!accepted) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    logError("POST /api/cpa-access/grants/:id/accept error:", error.message);
    res.status(500).json({ error: "Failed to accept CPA access." });
  }
});

router.delete("/grants/:id", cpaGrantMutationLimiter, async (req, res) => {
  try {
    const revoked = await revokeOwnedCpaGrant(req.user.id, req.params.id, getClientIp(req));
    if (!revoked) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    res.status(204).end();
  } catch (error) {
    logError("DELETE /api/cpa-access/grants/:id error:", error.message);
    res.status(500).json({ error: "Failed to revoke CPA access." });
  }
});

router.delete("/grants/:id/permanent", cpaGrantMutationLimiter, async (req, res) => {
  try {
    const deleted = await deleteOwnedRevokedCpaGrant(req.user.id, req.params.id, getClientIp(req));
    if (!deleted) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    res.status(204).end();
  } catch (error) {
    const message = error?.message || "Failed to delete CPA access grant.";
    const status = /only revoked/i.test(message) ? 400 : 500;
    logError("DELETE /api/cpa-access/grants/:id/permanent error:", message);
    res.status(status).json({ error: message });
  }
});

module.exports = router;
