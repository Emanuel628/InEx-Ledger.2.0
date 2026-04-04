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

  const existing = await pool.query(
    "SELECT id FROM businesses WHERE user_id = $1 LIMIT 1",
    [user.id]
  );

  if (existing.rowCount > 0) {
    const businessId = existing.rows[0].id;
    user.business_id = businessId;
    return businessId;
  }

  const businessId = crypto.randomUUID();
  const businessName = buildBusinessName(user);

  await pool.query(
    `INSERT INTO businesses (id, user_id, name, region, language)
     VALUES ($1, $2, $3, 'US', 'en')`,
    [businessId, user.id, businessName]
  );

  const { rows: existingAccounts } = await pool.query(
    "SELECT 1 FROM accounts WHERE business_id = $1 LIMIT 1",
    [businessId]
  );

  if (existingAccounts.length === 0) {
    await seedDefaultsForBusiness(pool, businessId);
  }

  user.business_id = businessId;
  return businessId;
}

module.exports = { resolveBusinessIdForUser };
