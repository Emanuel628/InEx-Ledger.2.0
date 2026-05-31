"use strict";

const crypto = require("crypto");

const VALID_MATCH_FIELDS = new Set(["merchant_name", "category_guess", "description"]);

function normalizeRuleValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCandidateRulesFromTransaction(txn, { categoryId, userId }) {
  const kind = String(txn?.type || "").toLowerCase();
  if ((kind !== "income" && kind !== "expense") || !categoryId) return [];

  const candidates = [
    { field: "merchant_name", value: txn?.merchant_name, confidence: "confirmed", minLength: 4 },
    { field: "category_guess", value: txn?.category_guess, confidence: "learned", minLength: 4 },
    { field: "description", value: txn?.description, confidence: "learned", minLength: 8 }
  ];

  return candidates
    .map((candidate) => {
      const normalized = normalizeRuleValue(candidate.value);
      if (!normalized || normalized.length < candidate.minLength) return null;
      return {
        transactionKind: kind,
        matchField: candidate.field,
        matchOperator: "equals",
        matchValue: String(candidate.value).trim().slice(0, 255),
        matchValueNormalized: normalized.slice(0, 255),
        categoryId,
        confidence: candidate.confidence,
        createdByUserId: userId || null
      };
    })
    .filter(Boolean);
}

async function upsertTransactionMappingRule(pool, businessId, rule) {
  if (!businessId || !rule?.categoryId || !VALID_MATCH_FIELDS.has(rule.matchField)) return null;
  const result = await pool.query(
    `INSERT INTO transaction_mapping_rules
       (id, business_id, category_id, transaction_kind, match_field, match_operator,
        match_value, match_value_normalized, confidence, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (business_id, transaction_kind, match_field, match_value_normalized)
     DO UPDATE SET
       category_id = EXCLUDED.category_id,
       match_value = EXCLUDED.match_value,
       confidence = EXCLUDED.confidence,
       created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, transaction_mapping_rules.created_by_user_id),
       updated_at = NOW()
     RETURNING *`,
    [
      crypto.randomUUID(),
      businessId,
      rule.categoryId,
      rule.transactionKind,
      rule.matchField,
      rule.matchOperator || "equals",
      rule.matchValue,
      rule.matchValueNormalized,
      rule.confidence || "confirmed",
      rule.createdByUserId || null
    ]
  );
  return result.rows[0] || null;
}

async function learnTransactionMappingRules(pool, businessId, txn, { categoryId, userId }) {
  const candidates = buildCandidateRulesFromTransaction(txn, { categoryId, userId });
  const saved = [];
  for (const candidate of candidates) {
    const row = await upsertTransactionMappingRule(pool, businessId, candidate);
    if (row) saved.push(row);
  }
  return saved;
}

module.exports = {
  learnTransactionMappingRules,
  upsertTransactionMappingRule,
  normalizeRuleValue,
  buildCandidateRulesFromTransaction
};
