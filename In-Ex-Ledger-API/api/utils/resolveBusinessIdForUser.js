const crypto = require("crypto");
const { pool } = require("../../db.js");
const { seedDefaultsForBusiness } = require("./seedDefaultsForBusiness.js");

function buildBusinessName(user) {
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (email) {
    const prefix = email.split("@")[0];
    if (prefix) {
      return `${prefix}'s Business`;
    }
  }

  if (typeof user?.name === "string" && user.name.trim()) {
    return `${user.name.trim()}'s Business`;
  }

  return "User's Business";
}

async function resolveBusinessIdForUser(user) {
  if (!user?.id) {
    throw new Error("User is required to resolve business");
  }

  const active = await pool.query(
    `SELECT b.id
     FROM users u
     JOIN businesses b
       ON b.id = u.active_business_id
      AND b.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [user.id]
  );

  if (active.rowCount > 0) {
    const businessId = active.rows[0].id;
    user.business_id = businessId;
    return businessId;
  }

  const existing = await pool.query(
    `SELECT id
     FROM businesses
     WHERE user_id = $1
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [user.id]
  );

  if (existing.rowCount > 0) {
    const businessId = existing.rows[0].id;
    await pool.query(
      "UPDATE users SET active_business_id = $1 WHERE id = $2",
      [businessId, user.id]
    );
    user.business_id = businessId;
    return businessId;
  }

  const businessId = crypto.randomUUID();
  const businessName = buildBusinessName(user);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO businesses (id, user_id, name, region, language)
       VALUES ($1, $2, $3, 'US', 'en')`,
      [businessId, user.id, businessName]
    );

    await client.query(
      "UPDATE users SET active_business_id = $1 WHERE id = $2",
      [businessId, user.id]
    );

    const { rows: existingAccounts } = await client.query(
      "SELECT 1 FROM accounts WHERE business_id = $1 LIMIT 1",
      [businessId]
    );

    if (existingAccounts.length === 0) {
      await seedDefaultsForBusiness(client, businessId);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  user.business_id = businessId;
  return businessId;
}

async function listBusinessesForUser(userId) {
  const result = await pool.query(
    `SELECT b.id,
            b.name,
            b.region,
            b.province,
            b.language,
            b.created_at,
            (u.active_business_id = b.id) AS is_active
     FROM businesses b
     JOIN users u
       ON u.id = b.user_id
     WHERE b.user_id = $1
     ORDER BY (u.active_business_id = b.id) DESC, b.created_at ASC, b.id ASC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name || "",
    region: row.region || "US",
    province: row.province || "",
    language: row.language || "en",
    created_at: row.created_at || "",
    is_active: row.is_active === true
  }));
}

async function getBusinessScopeForUser(user, requestedScope = "active") {
  const activeBusinessId = await resolveBusinessIdForUser(user);
  const businesses = await listBusinessesForUser(user.id);
  const activeBusiness = businesses.find((business) => business.id === activeBusinessId) || null;
  const scope = String(requestedScope || "active").toLowerCase() === "all" ? "all" : "active";
  const businessIds =
    scope === "all" ? businesses.map((business) => business.id) : [activeBusinessId];

  return {
    scope,
    activeBusinessId,
    activeBusiness,
    businesses,
    businessIds
  };
}

async function setActiveBusinessForUser(userId, businessId) {
  const result = await pool.query(
    `UPDATE users u
     SET active_business_id = $1
     WHERE u.id = $2
       AND EXISTS (
         SELECT 1
         FROM businesses b
         WHERE b.id = $1
           AND b.user_id = u.id
       )
     RETURNING active_business_id`,
    [businessId, userId]
  );

  return result.rowCount > 0;
}

async function createBusinessForUser(user, payload = {}) {
  if (!user?.id) {
    throw new Error("User is required to create a business");
  }

  const businessId = crypto.randomUUID();
  const businessName = String(payload.name || "").trim() || buildBusinessName(user);
  const region = String(payload.region || "US").trim().toUpperCase() === "CA" ? "CA" : "US";
  const language = ["en", "es", "fr"].includes(String(payload.language || "").trim())
    ? String(payload.language).trim()
    : "en";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO businesses (id, user_id, name, region, language)
       VALUES ($1, $2, $3, $4, $5)`,
      [businessId, user.id, businessName, region, language]
    );

    await seedDefaultsForBusiness(client, businessId);
    await client.query(
      "UPDATE users SET active_business_id = $1 WHERE id = $2",
      [businessId, user.id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return businessId;
}

module.exports = {
  resolveBusinessIdForUser,
  getBusinessScopeForUser,
  listBusinessesForUser,
  setActiveBusinessForUser,
  createBusinessForUser
};
