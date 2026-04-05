ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_business_id UUID;

CREATE INDEX IF NOT EXISTS users_active_business_id_idx
  ON users (active_business_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_active_business_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_active_business_id_fkey
      FOREIGN KEY (active_business_id)
      REFERENCES businesses (id)
      ON DELETE SET NULL;
  END IF;
END $$;

WITH first_business AS (
  SELECT DISTINCT ON (b.user_id)
         b.user_id,
         b.id AS business_id
  FROM businesses b
  WHERE b.user_id IS NOT NULL
  ORDER BY b.user_id, b.created_at ASC, b.id ASC
)
UPDATE users u
SET active_business_id = fb.business_id
FROM first_business fb
WHERE u.id = fb.user_id
  AND u.active_business_id IS NULL;
