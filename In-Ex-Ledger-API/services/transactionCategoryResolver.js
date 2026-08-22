"use strict";

const crypto = require("crypto");
const { pool } = require("../db.js");
const { isUuid } = require("../api/utils/v2HttpValidators.js");
const {
  resolveCanonicalCategoryTemplate,
} = require("./transactionCategorizationService.js");

function deriveCategoryKindFromSlug(slug) {
  const normalized = String(slug ?? "").trim().toLowerCase();
  const parts = normalized.split("_");
  const candidate = parts[1];
  if (candidate === "income" || candidate === "expense") {
    return candidate;
  }
  return null;
}

function deriveCategoryNameFromSlug(slug) {
  const normalized = String(slug ?? "").trim();
  const parts = normalized.split("_");
  if (parts.length > 2) {
    const name = parts.slice(2).join(" ").replace(/-/g, " ");
    if (name.trim()) {
      return name.trim();
    }
  }
  return normalized;
}

function normalizeRegionCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "CA" ? "CA" : "US";
}

async function resolveBusinessRegionCode(db, businessId) {
  const result = await db.query(
    "SELECT region FROM businesses WHERE id = $1 LIMIT 1",
    [businessId],
  );
  return normalizeRegionCode(result.rows[0]?.region);
}

function getCategoryCacheEntryId(cached) {
  if (!cached) {
    return null;
  }
  return typeof cached === "object" ? cached.id || null : cached;
}

async function ensureCategoryTemplateFields(
  db,
  businessId,
  categoryId,
  template,
) {
  if (!categoryId || !template) {
    return;
  }

  await db.query(
    `UPDATE categories
        SET color = COALESCE(NULLIF(BTRIM(color), ''), $3),
            tax_map_us = COALESCE(NULLIF(BTRIM(tax_map_us), ''), $4),
            tax_map_ca = COALESCE(NULLIF(BTRIM(tax_map_ca), ''), $5)
      WHERE id = $1
        AND business_id = $2`,
    [
      categoryId,
      businessId,
      template.color || null,
      template.tax_map_us || null,
      template.tax_map_ca || null,
    ],
  );
}

async function resolveCategoryId(businessId, categoryRef, fallbackKind) {
  const raw = String(categoryRef ?? "").trim();
  if (!raw) {
    return null;
  }

  if (isUuid(raw)) {
    return raw;
  }

  const kind = deriveCategoryKindFromSlug(raw) || fallbackKind || "expense";
  const name = deriveCategoryNameFromSlug(raw);
  const region = await resolveBusinessRegionCode(pool, businessId);
  const template = resolveCanonicalCategoryTemplate(name, kind, region);

  const existing = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name],
  );

  if (existing.rowCount) {
    await ensureCategoryTemplateFields(
      pool,
      businessId,
      existing.rows[0].id,
      template,
    );
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    ON CONFLICT (business_id, lower(name)) DO NOTHING
    RETURNING id`,
    [
      crypto.randomUUID(),
      businessId,
      name,
      kind,
      template.color || null,
      template.tax_map_us || null,
      template.tax_map_ca || null,
    ],
  );

  if (inserted.rowCount) {
    return inserted.rows[0].id;
  }

  const existingAfterInsert = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name],
  );
  if (existingAfterInsert.rowCount) {
    await ensureCategoryTemplateFields(
      pool,
      businessId,
      existingAfterInsert.rows[0].id,
      template,
    );
  }
  return existingAfterInsert.rows[0]?.id || null;
}

module.exports = {
  deriveCategoryKindFromSlug,
  deriveCategoryNameFromSlug,
  ensureCategoryTemplateFields,
  getCategoryCacheEntryId,
  normalizeRegionCode,
  resolveBusinessRegionCode,
  resolveCategoryId,
};
