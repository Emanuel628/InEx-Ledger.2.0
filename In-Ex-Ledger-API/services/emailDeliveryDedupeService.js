"use strict";

const crypto = require("crypto");

function buildEmailDedupeKey(category, scope, parts = []) {
  const normalizedCategory = String(category || "").trim();
  const normalizedScope = String(scope || "").trim();
  if (!normalizedCategory || !normalizedScope) {
    throw new Error("Email dedupe key requires category and scope.");
  }

  const digest = crypto
    .createHash("sha256")
    .update(
      [normalizedCategory, normalizedScope, ...parts]
        .map((part) => String(part ?? ""))
        .join(":"),
    )
    .digest("hex")
    .slice(0, 40);
  return `${normalizedCategory}:${normalizedScope}:${digest}`;
}

async function reserveEmailDelivery(
  db,
  { dedupeKey, category, businessId = null, recipientEmail = null, metadata = {} },
) {
  const result = await db.query(
    `INSERT INTO email_delivery_dedupe (
        dedupe_key,
        category,
        business_id,
        recipient_email,
        status,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, 'reserved', $5::jsonb)
      ON CONFLICT (dedupe_key) DO UPDATE
        SET status = 'reserved',
            attempts = email_delivery_dedupe.attempts + 1,
            recipient_email = EXCLUDED.recipient_email,
            metadata_json = email_delivery_dedupe.metadata_json || EXCLUDED.metadata_json,
            last_error = NULL,
            failed_at = NULL,
            updated_at = NOW()
      WHERE email_delivery_dedupe.status = 'failed'
      RETURNING dedupe_key`,
    [
      dedupeKey,
      category,
      businessId,
      recipientEmail,
      JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
    ],
  );
  return result.rowCount > 0;
}

async function markEmailDeliverySent(db, dedupeKey, providerMessageId = null) {
  await db.query(
    `UPDATE email_delivery_dedupe
        SET status = 'sent',
            provider_message_id = $2,
            sent_at = NOW(),
            failed_at = NULL,
            last_error = NULL,
            updated_at = NOW()
      WHERE dedupe_key = $1`,
    [dedupeKey, providerMessageId],
  );
}

async function markEmailDeliveryFailed(db, dedupeKey, error) {
  await db.query(
    `UPDATE email_delivery_dedupe
        SET status = 'failed',
            failed_at = NOW(),
            last_error = LEFT($2, 1000),
            updated_at = NOW()
      WHERE dedupe_key = $1`,
    [dedupeKey, error?.message || String(error || "Email delivery failed")],
  );
}

module.exports = {
  buildEmailDedupeKey,
  reserveEmailDelivery,
  markEmailDeliverySent,
  markEmailDeliveryFailed,
};
