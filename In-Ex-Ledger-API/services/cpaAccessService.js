const crypto = require("crypto");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { listBusinessesForUser } = require("../api/utils/resolveBusinessIdForUser.js");

let _resend = null;

function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "InEx Ledger <noreply@inexledger.com>";

function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  metadata = {},
  ipAddress = null
}) {
  if (!action) {
    return;
  }

  await pool.query(
    `INSERT INTO cpa_audit_logs
       (id, actor_user_id, owner_user_id, grant_id, business_id, action, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      crypto.randomUUID(),
      actorUserId,
      ownerUserId,
      grantId,
      businessId,
      action,
      JSON.stringify(metadata || {}),
      ipAddress || null
    ]
  );
}

async function sendCpaInviteEmail({
  to,
  ownerName,
  ownerEmail,
  ownerUserId,
  scope,
  businessName,
  businessId,
  status
}) {
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = baseUrl
    ? `${baseUrl}/cpa-dashboard?owner=${encodeURIComponent(ownerUserId || ownerEmail || "")}${businessId ? `&business=${encodeURIComponent(businessId)}` : ""}`
    : "";
  const appLoginUrl = baseUrl ? `${baseUrl}/login` : "";
  const subject = status === "active"
    ? "InEx Ledger CPA access granted"
    : "InEx Ledger CPA access invite";
  const intro = status === "active"
    ? "You now have active CPA access in InEx Ledger."
    : "You have been invited to review InEx Ledger data as a CPA.";
  const actionCopy = status === "active"
    ? "Open the shared workspace to review the client profile and granted data."
    : "Sign in with this email to accept the invitation. If you do not yet have an account, create one with the same email address.";
  const primaryLabel = status === "active" ? "View shared workspace" : "Accept invitation";
  const primaryUrl = dashboardUrl || appLoginUrl;
  const scopeLabel = scope === "all" ? "All businesses" : `One business: ${businessName || "Selected business"}`;

  const html = `
    <div style="margin:0;padding:0;background:#f4f6f8;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;font-family:Arial,Helvetica,sans-serif;color:#172033;">
        <div style="background:#0f172a;color:#fff;border-radius:18px 18px 0 0;padding:24px 28px;">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.72;">InEx Ledger</div>
          <div style="font-size:28px;line-height:1.2;font-weight:700;margin-top:8px;">CPA access ${status === "active" ? "granted" : "invite"}</div>
        </div>
        <div style="background:#fff;border:1px solid #dfe5ec;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeHtml(intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="padding:10px 0;border-top:1px solid #edf1f5;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Owner:</strong> ${escapeHtml(ownerName || ownerEmail || "InEx Ledger user")}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #edf1f5;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Access scope:</strong> ${escapeHtml(scopeLabel)}</td>
            </tr>
          </table>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(actionCopy)}</p>
          ${primaryUrl ? `
            <div style="margin:0 0 18px;">
              <a href="${escapeHtml(primaryUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">${escapeHtml(primaryLabel)}</a>
            </div>
            <p style="margin:0 0 16px;font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(primaryUrl)}</p>
          ` : ""}
          <p style="margin:0;font-size:12px;color:#6b7280;">If you were not expecting this, you can ignore this message.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    intro,
    `Owner: ${ownerName || ownerEmail || "InEx Ledger user"}`,
    `Access scope: ${scopeLabel}`,
    actionCopy,
    primaryUrl ? `${primaryLabel}: ${primaryUrl}` : null,
    "If you were not expecting this, you can ignore this message."
  ].filter(Boolean).join("\n\n");

  return getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html,
    text
  });
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
        },
        ipAddress: null
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
            CASE
              WHEN g.status = 'revoked' THEN g.revoked_at + INTERVAL '30 days'
              ELSE NULL
            END AS revoked_visible_until,
            u.id AS grantee_user_id,
            u.full_name AS grantee_full_name,
            u.display_name AS grantee_display_name
       FROM cpa_access_grants g
       LEFT JOIN businesses b ON b.id = g.business_id
       LEFT JOIN users u ON u.id = g.grantee_user_id
      WHERE g.owner_user_id = $1
        AND (
          g.status <> 'revoked'
          OR g.revoked_at >= NOW() - INTERVAL '30 days'
        )
      ORDER BY
        CASE
          WHEN g.status = 'active' THEN 0
          WHEN g.status = 'pending' THEN 1
          ELSE 2
        END,
        COALESCE(g.revoked_at, g.accepted_at, g.created_at) DESC`,
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

async function createCpaGrant(ownerUser, payload, grantIp = null) {
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
  let businessName = null;
  if (scope === "business") {
    businessId = String(payload?.business_id || "").trim();
    if (!businessId) {
      throw new Error("A business must be selected for scoped CPA access.");
    }
    const ownsBusiness = businesses.some((business) => business.id === businessId);
    if (!ownsBusiness) {
      throw new Error("Selected business was not found.");
    }
    businessName = businesses.find((business) => business.id === businessId)?.name || null;
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
         (id, owner_user_id, grantee_user_id, grantee_email, scope, business_id, status, accepted_at, grant_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        crypto.randomUUID(),
        ownerUser.id,
        existingUser.rows[0]?.id || null,
        email,
        scope,
        businessId,
        status,
        acceptedAt,
        grantIp || null
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
      },
      ipAddress: grantIp || null
    });

    let emailSent = false;
    try {
      await sendCpaInviteEmail({
        to: email,
        ownerName: ownerUser.full_name || ownerUser.display_name || ownerUser.email || null,
        ownerEmail: ownerUser.email || null,
        ownerUserId: ownerUser.id,
        scope,
        businessName,
        businessId,
        status
      });
      emailSent = true;
    } catch (emailError) {
      console.error("CPA invite email failed:", emailError.message);
    }

    return { grantId, emailSent };
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("A CPA access grant with this scope already exists.");
    }
    throw error;
  }
}

async function revokeOwnedCpaGrant(ownerUserId, grantId, ipAddress = null) {
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
    },
    ipAddress
  });

  return true;
}

async function deleteOwnedRevokedCpaGrant(ownerUserId, grantId, ipAddress = null) {
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
    },
    ipAddress
  });

  return true;
}

async function acceptAssignedCpaGrant(user, grantId, ipAddress = null) {
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
    },
    ipAddress
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
