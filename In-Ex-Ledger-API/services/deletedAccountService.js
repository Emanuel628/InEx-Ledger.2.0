"use strict";

const { pool } = require("../db.js");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function getDeletedAccountRecordByEmail(email, db = pool) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const result = await db.query(
    `SELECT id,
            email,
            full_name,
            country,
            province,
            had_trial,
            had_paid_subscription,
            deleted_at,
            reactivated_at,
            reactivation_count,
            metadata_json
       FROM deleted_account_records
      WHERE email = $1
      LIMIT 1`,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

async function upsertDeletedAccountRecord(db, payload = {}) {
  const normalizedEmail = normalizeEmail(payload.email);
  if (!normalizedEmail) {
    throw new Error("deletedAccountService: email is required");
  }

  await db.query(
    `INSERT INTO deleted_account_records (
        email,
        full_name,
        country,
        province,
        had_trial,
        had_paid_subscription,
        deleted_at,
        metadata_json,
        updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), COALESCE($8::jsonb, '{}'::jsonb), NOW())
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           country = EXCLUDED.country,
           province = EXCLUDED.province,
           had_trial = deleted_account_records.had_trial OR EXCLUDED.had_trial,
           had_paid_subscription = deleted_account_records.had_paid_subscription OR EXCLUDED.had_paid_subscription,
           deleted_at = EXCLUDED.deleted_at,
           metadata_json = COALESCE(deleted_account_records.metadata_json, '{}'::jsonb) || COALESCE(EXCLUDED.metadata_json, '{}'::jsonb),
           updated_at = NOW()`,
    [
      normalizedEmail,
      payload.fullName || null,
      payload.country || null,
      payload.province || null,
      payload.hadTrial === true,
      payload.hadPaidSubscription === true,
      payload.deletedAt || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null
    ]
  );
}

async function markDeletedAccountReactivated(db, email, metadata = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  await db.query(
    `UPDATE deleted_account_records
        SET reactivated_at = NOW(),
            reactivation_count = reactivation_count + 1,
            metadata_json = COALESCE(metadata_json, '{}'::jsonb) || COALESCE($2::jsonb, '{}'::jsonb),
            updated_at = NOW()
      WHERE email = $1`,
    [normalizedEmail, metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = {
  getDeletedAccountRecordByEmail,
  markDeletedAccountReactivated,
  normalizeEmail,
  upsertDeletedAccountRecord
};
