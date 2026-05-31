UPDATE categories AS c
SET tax_map_ca = 'other_expense'
FROM businesses AS b
WHERE b.id = c.business_id
  AND UPPER(COALESCE(b.region, 'US')) = 'CA'
  AND LOWER(c.name) = 'phone & internet'
  AND COALESCE(NULLIF(BTRIM(c.tax_map_ca), ''), '') <> 'other_expense';
