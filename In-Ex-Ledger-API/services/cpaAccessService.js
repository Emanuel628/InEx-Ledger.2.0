const crypto = require("crypto");
const { pool } = require("../db.js");
const { listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeScope(value) {
  return String(value || "").trim().toLowerCase() === "all" ? "all" : "business";
}

async function syncPendingCpaGrantsForUser(user) {
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email) {
    return;
  }

  await pool.query(
    `UPDATE cpa_access_grants
        SET grantee_user_id = $1,
            status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
            accepted_at = COALESCE(accepted_at, NOW())
      WHERE lower(grantee_email) = $2
        AND status = 'pending'`,
    [user.id, email]
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
      region: row.business_region
    });
  });

  return [...grouped.values()];
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

    return result.rows[0]?.id || null;
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

  return result.rowCount > 0;
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
      RETURNING id`,
    [user.id, grantId, normalizeEmail(user.email)]
  );

  return result.rowCount > 0;
}

module.exports = {
  normalizeScope,
  syncPendingCpaGrantsForUser,
  listOwnedCpaGrants,
  listAssignedCpaGrants,
  listAccessibleBusinessScopeForUser,
  createCpaGrant,
  revokeOwnedCpaGrant,
  acceptAssignedCpaGrant
};
