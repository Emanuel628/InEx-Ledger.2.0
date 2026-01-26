-- =========================================
-- Remove duplicate accounts and categories then enforce uniqueness by business_id + name
-- =========================================

-- Remove duplicate accounts for the same business/name (keep lowest UUID)
DELETE FROM accounts a
USING (
  SELECT business_id, name, MIN(id) AS keep_id, COUNT(*) as cnt
  FROM accounts
  GROUP BY business_id, name
  HAVING COUNT(*) > 1
) d
WHERE a.business_id = d.business_id
  AND a.name = d.name
  AND a.id <> d.keep_id;

-- Remove duplicate categories for the same business/name (keep lowest UUID)
DELETE FROM categories c
USING (
  SELECT business_id, name, MIN(id) AS keep_id, COUNT(*) as cnt
  FROM categories
  GROUP BY business_id, name
  HAVING COUNT(*) > 1
) d
WHERE c.business_id = d.business_id
  AND c.name = d.name
  AND c.id <> d.keep_id;

-- Enforce unique names per business
CREATE UNIQUE INDEX IF NOT EXISTS accounts_business_name_unique
  ON accounts (business_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS categories_business_name_unique
  ON categories (business_id, name);
