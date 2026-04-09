-- Migration 041: enforce case-insensitive category uniqueness per business

-- Remove duplicate categories for the same business/name (case-insensitive), keep lowest UUID
WITH ranked_categories AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id, lower(name) ORDER BY id) AS rn
  FROM categories
)
DELETE FROM categories
WHERE id IN (SELECT id FROM ranked_categories WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS categories_business_name_unique_ci
  ON categories (business_id, lower(name));
