-- =========================================
-- Remove duplicate accounts and categories then enforce uniqueness by business_id + name
-- =========================================

-- Remove duplicate accounts for the same business/name (keep lowest UUID)
WITH ranked_accounts AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id, name ORDER BY id) AS rn
  FROM accounts
)
DELETE FROM accounts
WHERE id IN (SELECT id FROM ranked_accounts WHERE rn > 1);

-- Remove duplicate categories for the same business/name (keep lowest UUID)
WITH ranked_categories AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id, name ORDER BY id) AS rn
  FROM categories
)
DELETE FROM categories
WHERE id IN (SELECT id FROM ranked_categories WHERE rn > 1);

-- Enforce unique names per business
CREATE UNIQUE INDEX IF NOT EXISTS accounts_business_name_unique
  ON accounts (business_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS categories_business_name_unique
  ON categories (business_id, name);
