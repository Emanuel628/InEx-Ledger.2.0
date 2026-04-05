const crypto = require("crypto");
const { pool } = require("../db.js");
const { listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeScope(value) {
  return String(value || "").trim().toLowerCase() === "all" ? "all" : "business";
}

async function logCpaAuditEvent({
  actorUserId = null,
  ownerUserId = null,
  grantId = null,
  businessId = null,
  action,
  metadata = {}
}) {
  if (!action) {
    return;
  }

  await pool.query(
    `INSERT INTO cpa_audit_logs
       (id, actor_user_id, owner_user_id, grant_id, business_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      crypto.randomUUID(),
      actorUserId,
      ownerUserId,
      grantId,
      businessId,
      action,
      JSON.stringify(metadata || {})
    ]
  );
}

async function syncPendingCpaGrantsForUser(user) {
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) {
    return;
  }

  const result = await pool.query(
    `UPDATE cpa_access_grants
        SET grantee_user_id = $1,
            status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
            accepted_at = COALESCE(accepted_at, NOW())
      WHERE lower(grantee_email) = $2
        AND status = 'pending'
    RETURNING id, owner_user_id, business_id, scope`,
    [user.id, email]
  );

  await Promise.all(
    result.rows.map((row) =>
      logCpaAuditEvent({
        actorUserId: user.id,
        ownerUserId: row.owner_user_id,
        grantId: row.id,
        businessId: row.business_id,
        action: "grant_auto_accepted",
        metadata: {
          scope: row.scope,
          grantee_email: email
        }
      })
    )
  );
}

async function listOwnedCpaGrants(ownerUserId) {
  const result = await pool.query(
    `SELECT g.id,
            g.grantee_email,
            g.scope,
            g.business_id,
            b.name AS business_name,
            g.status,
            g.created_at,
            g.accepted_at,
            g.revoked_at,
            u.id AS grantee_user_id,
            u.full_name AS grantee_full_name,
            u.display_name AS grantee_display_name
       FROM cpa_access_grants g
       LEFT JOIN businesses b ON b.id = g.business_id
       LEFT JOIN users u ON u.id = g.grantee_user_id
      WHERE g.owner_user_id = $1
      ORDER BY g.created_at DESC`,
    [ownerUserId]
  );

  return result.rows;
}

async function listOwnedCpaAuditLogs(ownerUserId, limit = 100) {
  const result = await pool.query(
    `SELECT l.id,
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
      ORDER BY l.created_at DESC
      LIMIT $2`,
    [ownerUserId, limit]
  );

  return result.rows;
}

async function listAssignedCpaGrants(user) {
  await syncPendingCpaGrantsForUser(user);

  const result = await pool.query(
    `SELECT g.id,
            g.owner_user_id,
            owner.email AS owner_email,
            owner.full_name AS owner_full_name,
            owner.display_name AS owner_display_name,
            g.scope,
            g.business_id,
            b.name AS business_name,
            g.status,
            g.created_at,
            g.accepted_at
       FROM cpa_access_grants g
       JOIN users owner ON owner.id = g.owner_user_id
       LEFT JOIN businesses b ON b.id = g.business_id
      WHERE g.grantee_user_id = $1
        AND g.status = 'active'
      ORDER BY g.created_at DESC`,
    [user.id]
  );

  return result.rows;
}

async function listAccessibleBusinessScopeForUser(user) {
  await syncPendingCpaGrantsForUser(user);

  const result = await pool.query(
    `WITH active_grants AS (
       SELECT g.owner_user_id,
              g.scope,
              g.business_id
         FROM cpa_access_grants g
        WHERE g.grantee_user_id = $1
          AND g.status = 'active'
     )
     SELECT owner.id AS owner_user_id,
            owner.email AS owner_email,
            owner.full_name AS owner_full_name,
            owner.display_name AS owner_display_name,
            b.id AS business_id,
            b.name AS business_name,
            b.region AS business_region,
            b.province AS business_province,
            b.language AS business_language,
            CASE
              WHEN EXISTS (
                SELECT 1
                  FROM active_grants ag_all
                 WHERE ag_all.owner_user_id = owner.id
                   AND ag_all.scope = 'all'
              ) THEN 'all'
              ELSE 'business'
            END AS grant_scope
       FROM users owner
       JOIN businesses b
         ON b.user_id = owner.id
      WHERE EXISTS (
              SELECT 1
                FROM active_grants ag
               WHERE ag.owner_user_id = owner.id
                 AND (
                   ag.scope = 'all'
                   OR (ag.scope = 'business' AND ag.business_id = b.id)
                 )
            )
      ORDER BY owner.email ASC, b.created_at ASC, b.id ASC`,
    [user.id]
  );

  const grouped = new Map();
  result.rows.forEach((row) => {
    const key = row.owner_user_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        owner_user_id: row.owner_user_id,
        owner_email: row.owner_email,
        owner_full_name: row.owner_full_name,
        owner_display_name: row.owner_display_name,
        grant_scope: row.grant_scope,
        businesses: []
      });
    }
    grouped.get(key).businesses.push({
      id: row.business_id,
      name: row.business_name,
      region: row.business_region,
      province: row.business_province,
      language: row.business_language
    });
  });

  return [...grouped.values()];
}

async function resolveAccessiblePortfolioForUser(user, ownerUserId, requestedBusinessId = "") {
  const portfolios = await listAccessibleBusinessScopeForUser(user);
  const portfolio = portfolios.find((item) => item.owner_user_id === ownerUserId);
  if (!portfolio) {
    return null;
  }

  const normalizedBusinessId = String(requestedBusinessId || "").trim();
  if (!normalizedBusinessId) {
    return {
      ...portfolio,
      business_ids: portfolio.businesses.map((business) => business.id)
    };
  }

  const business = portfolio.businesses.find((item) => item.id === normalizedBusinessId);
  if (!business) {
    return null;
  }

  return {
    ...portfolio,
    businesses: [business],
    business_ids: [business.id]
  };
}

async function createCpaGrant(ownerUser, payload) {
  const email = normalizeEmail(payload?.email);
  const scope = normalizeScope(payload?.scope);
  const businesses = await listBusinessesForUser(ownerUser.id);

  if (!email) {
    throw new Error("CPA email is required.");
  }
  if (email === normalizeEmail(ownerUser.email)) {
    throw new Error("You cannot invite your own email.");
  }

  let businessId = null;
  if (scope === "business") {
    businessId = String(payload?.business_id || "").trim();
    if (!businessId) {
      throw new Error("A business must be selected for scoped CPA access.");
    }
    const ownsBusiness = businesses.some((business) => business.id === businessId);
    if (!ownsBusiness) {
      throw new Error("Selected business was not found.");
    }
  }

  const existingUser = await pool.query(
    `SELECT id
       FROM users
      WHERE lower(email) = $1
      LIMIT 1`,
    [email]
  );

  const status = existingUser.rowCount ? "active" : "pending";
  const acceptedAt = status === "active" ? new Date() : null;

  try {
    const result = await pool.query(
      `INSERT INTO cpa_access_grants
         (id, owner_user_id, grantee_user_id, grantee_email, scope, business_id, status, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        crypto.randomUUID(),
        ownerUser.id,
        existingUser.rows[0]?.id || null,
        email,
        scope,
        businessId,
        status,
        acceptedAt
      ]
    );

    const grantId = result.rows[0]?.id || null;
    await logCpaAuditEvent({
      actorUserId: ownerUser.id,
      ownerUserId: ownerUser.id,
      grantId,
      businessId,
      action: status === "active" ? "grant_created_active" : "grant_created_pending",
      metadata: {
        grantee_email: email,
        scope,
        accepted_immediately: status === "active"
      }
    });

    return grantId;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("A CPA access grant with this scope already exists.");
    }
    throw error;
  }
}

async function revokeOwnedCpaGrant(ownerUserId, grantId) {
  const result = await pool.query(
    `UPDATE cpa_access_grants
        SET status = 'revoked',
            revoked_at = NOW()
      WHERE id = $1
        AND owner_user_id = $2
        AND status <> 'revoked'
      RETURNING id`,
    [grantId, ownerUserId]
  );

  if (!result.rowCount) {
    return false;
  }

  const grant = await pool.query(
    `SELECT owner_user_id, business_id, scope, grantee_email
       FROM cpa_access_grants
      WHERE id = $1
      LIMIT 1`,
    [grantId]
  );

  await logCpaAuditEvent({
    actorUserId: ownerUserId,
    ownerUserId,
    grantId,
    businessId: grant.rows[0]?.business_id || null,
    action: "grant_revoked",
    metadata: {
      scope: grant.rows[0]?.scope || null,
      grantee_email: grant.rows[0]?.grantee_email || null
    }
  });

  return true;
}

async function deleteOwnedRevokedCpaGrant(ownerUserId, grantId) {
  const grantResult = await pool.query(
    `SELECT id, owner_user_id, business_id, scope, grantee_email, status
       FROM cpa_access_grants
      WHERE id = $1
        AND owner_user_id = $2
      LIMIT 1`,
    [grantId, ownerUserId]
  );

  if (!grantResult.rowCount) {
    return false;
  }

  const grant = grantResult.rows[0];
  if (grant.status !== "revoked") {
    throw new Error("Only revoked CPA grants can be deleted.");
  }

  await pool.query(
    `DELETE FROM cpa_access_grants
      WHERE id = $1
        AND owner_user_id = $2
        AND status = 'revoked'`,
    [grantId, ownerUserId]
  );

  await logCpaAuditEvent({
    actorUserId: ownerUserId,
    ownerUserId,
    grantId,
    businessId: grant.business_id || null,
    action: "grant_deleted",
    metadata: {
      scope: grant.scope || null,
      grantee_email: grant.grantee_email || null
    }
  });

  return true;
}

async function acceptAssignedCpaGrant(user, grantId) {
  const result = await pool.query(
    `UPDATE cpa_access_grants
        SET grantee_user_id = $1,
            status = 'active',
            accepted_at = COALESCE(accepted_at, NOW())
      WHERE id = $2
        AND lower(grantee_email) = $3
        AND status = 'pending'
      RETURNING id, owner_user_id, business_id, scope`,
    [user.id, grantId, normalizeEmail(user.email)]
  );

  if (!result.rowCount) {
    return false;
  }

  await logCpaAuditEvent({
    actorUserId: user.id,
    ownerUserId: result.rows[0].owner_user_id,
    grantId: result.rows[0].id,
    businessId: result.rows[0].business_id,
    action: "grant_accepted",
    metadata: {
      scope: result.rows[0].scope,
      grantee_email: normalizeEmail(user.email)
    }
  });

  return true;
}

module.exports = {
  normalizeScope,
  logCpaAuditEvent,
  syncPendingCpaGrantsForUser,
  listOwnedCpaGrants,
  listOwnedCpaAuditLogs,
  listAssignedCpaGrants,
  listAccessibleBusinessScopeForUser,
  resolveAccessiblePortfolioForUser,
  createCpaGrant,
  revokeOwnedCpaGrant,
  deleteOwnedRevokedCpaGrant,
  acceptAssignedCpaGrant
};
