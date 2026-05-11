-- Migration: add is_active flag to categories
-- Item 29 (categories polish): lets users hide categories they no longer
-- use without breaking historical transactions that reference them.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_categories_business_active
  ON categories (business_id, is_active);

COMMENT ON COLUMN categories.is_active IS
  'False means the category is hidden from new-transaction pickers but kept for historical reference. Default true.';
