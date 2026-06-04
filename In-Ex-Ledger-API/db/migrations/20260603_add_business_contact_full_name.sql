ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS contact_full_name TEXT;

UPDATE businesses AS b
SET contact_full_name = COALESCE(
  NULLIF(BTRIM(b.contact_full_name), ''),
  NULLIF(BTRIM(u.display_name), ''),
  NULLIF(BTRIM(u.full_name), ''),
  NULLIF(BTRIM(SPLIT_PART(u.email, '@', 1)), ''),
  'Business owner'
)
FROM users AS u
WHERE u.id = b.user_id
  AND (b.contact_full_name IS NULL OR BTRIM(b.contact_full_name) = '');

UPDATE businesses
SET contact_full_name = 'Business owner'
WHERE contact_full_name IS NULL
   OR BTRIM(contact_full_name) = '';

ALTER TABLE businesses
ALTER COLUMN contact_full_name SET DEFAULT 'Business owner';

ALTER TABLE businesses
ALTER COLUMN contact_full_name SET NOT NULL;

COMMENT ON COLUMN businesses.contact_full_name IS 'Required primary contact name shown on the business profile and export identity surfaces.';
