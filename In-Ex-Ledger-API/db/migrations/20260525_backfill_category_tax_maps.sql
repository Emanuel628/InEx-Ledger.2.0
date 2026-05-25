UPDATE categories AS c
SET tax_map_us = CASE LOWER(c.name)
  WHEN 'sales revenue' THEN 'gross_receipts_sales'
  WHEN 'service income' THEN 'gross_receipts_sales'
  WHEN 'interest income' THEN 'interest_income'
  WHEN 'other income' THEN 'other_income'
  WHEN 'advertising & marketing' THEN 'advertising'
  WHEN 'bank fees' THEN 'bank_fees'
  WHEN 'car & truck expenses' THEN 'car_truck'
  WHEN 'contract labor' THEN 'contract_labor'
  WHEN 'home office' THEN 'home_office'
  WHEN 'insurance' THEN 'insurance_other_than_health'
  WHEN 'legal & professional' THEN 'legal_professional'
  WHEN 'meals' THEN 'meals'
  WHEN 'office supplies' THEN 'supplies'
  WHEN 'phone & internet' THEN 'utilities'
  WHEN 'rent' THEN 'rent_lease_other'
  WHEN 'repairs & maintenance' THEN 'repairs_maintenance'
  WHEN 'sales tax' THEN 'taxes_licenses'
  WHEN 'software & subscriptions' THEN 'software_subscriptions'
  WHEN 'supplies' THEN 'supplies'
  WHEN 'travel' THEN 'travel'
  WHEN 'utilities' THEN 'utilities'
  WHEN 'wages & salaries' THEN 'wages'
  WHEN 'other expense' THEN 'other_expense'
  ELSE c.tax_map_us
END,
tax_map_ca = NULL
FROM businesses AS b
WHERE b.id = c.business_id
  AND UPPER(COALESCE(b.region, 'US')) = 'US'
  AND LOWER(c.name) IN (
    'sales revenue', 'service income', 'interest income', 'other income',
    'advertising & marketing', 'bank fees', 'car & truck expenses', 'contract labor',
    'home office', 'insurance', 'legal & professional', 'meals', 'office supplies',
    'phone & internet', 'rent', 'repairs & maintenance', 'sales tax',
    'software & subscriptions', 'supplies', 'travel', 'utilities', 'wages & salaries',
    'other expense'
  );

UPDATE categories AS c
SET tax_map_ca = CASE LOWER(c.name)
  WHEN 'sales revenue' THEN 'sales'
  WHEN 'service income' THEN 'sales'
  WHEN 'gst/hst collected' THEN 'gst_hst_collected'
  WHEN 'grants & subsidies' THEN 'subsidies_grants'
  WHEN 'other income' THEN 'other_income'
  WHEN 'advertising' THEN 'advertising'
  WHEN 'business tax & licenses' THEN 'business_tax_fees_licenses_memberships'
  WHEN 'delivery & freight' THEN 'delivery_freight'
  WHEN 'gst/hst paid' THEN 'gst_hst_paid'
  WHEN 'home office' THEN 'home_office'
  WHEN 'insurance' THEN 'insurance'
  WHEN 'interest & bank charges' THEN 'interest_bank_charges'
  WHEN 'legal & accounting fees' THEN 'legal_accounting'
  WHEN 'meals & entertainment' THEN 'meals_entertainment'
  WHEN 'motor vehicle' THEN 'motor_vehicle'
  WHEN 'office expenses' THEN 'office_expense'
  WHEN 'office supplies' THEN 'office_supplies'
  WHEN 'phone & internet' THEN 'utilities'
  WHEN 'property taxes' THEN 'property_taxes'
  WHEN 'rent' THEN 'rent'
  WHEN 'repairs & maintenance' THEN 'maintenance_repairs'
  WHEN 'salaries & wages' THEN 'salaries_wages_benefits'
  WHEN 'software & subscriptions' THEN 'other_expense'
  WHEN 'travel' THEN 'travel'
  WHEN 'utilities' THEN 'utilities'
  WHEN 'other expense' THEN 'other_expense'
  ELSE c.tax_map_ca
END,
tax_map_us = NULL
FROM businesses AS b
WHERE b.id = c.business_id
  AND UPPER(COALESCE(b.region, 'US')) = 'CA'
  AND LOWER(c.name) IN (
    'sales revenue', 'service income', 'gst/hst collected', 'grants & subsidies',
    'other income', 'advertising', 'business tax & licenses', 'delivery & freight',
    'gst/hst paid', 'home office', 'insurance', 'interest & bank charges',
    'legal & accounting fees', 'meals & entertainment', 'motor vehicle',
    'office expenses', 'office supplies', 'phone & internet', 'property taxes',
    'rent', 'repairs & maintenance', 'salaries & wages', 'software & subscriptions',
    'travel', 'utilities', 'other expense'
  );

INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca, is_default, is_active, created_at)
SELECT gen_random_uuid(), b.id, seed.name, 'expense', seed.color, seed.tax_map_us, seed.tax_map_ca, true, true, NOW()
FROM businesses AS b
JOIN (
  VALUES
    ('US', 'Phone & Internet', 'slate', 'utilities', NULL),
    ('US', 'Supplies', 'blue', 'supplies', NULL),
    ('CA', 'Office Expenses', 'blue', NULL, 'office_expense'),
    ('CA', 'Phone & Internet', 'slate', NULL, 'utilities'),
    ('CA', 'Software & Subscriptions', 'blue', NULL, 'other_expense')
) AS seed(region, name, color, tax_map_us, tax_map_ca)
  ON seed.region = UPPER(COALESCE(b.region, 'US'))
WHERE NOT EXISTS (
  SELECT 1
  FROM categories AS c
  WHERE c.business_id = b.id
    AND LOWER(c.name) = LOWER(seed.name)
);
