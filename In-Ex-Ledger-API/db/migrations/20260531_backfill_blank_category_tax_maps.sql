UPDATE categories AS c
SET color = COALESCE(NULLIF(BTRIM(c.color), ''), seed.color),
    tax_map_us = COALESCE(NULLIF(BTRIM(c.tax_map_us), ''), seed.tax_map_us),
    tax_map_ca = COALESCE(NULLIF(BTRIM(c.tax_map_ca), ''), seed.tax_map_ca)
FROM businesses AS b
JOIN (
  VALUES
    ('US', 'Sales Revenue', 'income', 'green', 'gross_receipts_sales', NULL),
    ('US', 'Service Income', 'income', 'green', 'gross_receipts_sales', NULL),
    ('US', 'Interest Income', 'income', 'green', 'interest_income', NULL),
    ('US', 'Other Income', 'income', 'slate', 'other_income', NULL),
    ('US', 'Advertising & Marketing', 'expense', 'blue', 'advertising', NULL),
    ('US', 'Bank Fees', 'expense', 'slate', 'bank_fees', NULL),
    ('US', 'Car & Truck Expenses', 'expense', 'amber', 'car_truck', NULL),
    ('US', 'Contract Labor', 'expense', 'blue', 'contract_labor', NULL),
    ('US', 'Home Office', 'expense', 'amber', 'home_office', NULL),
    ('US', 'Insurance', 'expense', 'blue', 'insurance_other_than_health', NULL),
    ('US', 'Legal & Professional', 'expense', 'slate', 'legal_professional', NULL),
    ('US', 'Meals', 'expense', 'amber', 'meals', NULL),
    ('US', 'Office Supplies', 'expense', 'blue', 'office_expense', NULL),
    ('US', 'Phone & Internet', 'expense', 'slate', 'utilities', NULL),
    ('US', 'Rent', 'expense', 'blue', 'rent_lease_other', NULL),
    ('US', 'Repairs & Maintenance', 'expense', 'slate', 'repairs_maintenance', NULL),
    ('US', 'Sales Tax', 'expense', 'red', 'taxes_licenses', NULL),
    ('US', 'Software & Subscriptions', 'expense', 'blue', 'software_subscriptions', NULL),
    ('US', 'Supplies', 'expense', 'blue', 'supplies', NULL),
    ('US', 'Travel', 'expense', 'amber', 'travel', NULL),
    ('US', 'Utilities', 'expense', 'slate', 'utilities', NULL),
    ('US', 'Wages & Salaries', 'expense', 'blue', 'wages', NULL),
    ('US', 'Other Expense', 'expense', 'slate', 'other_expense', NULL),
    ('CA', 'Sales Revenue', 'income', 'green', NULL, 'sales'),
    ('CA', 'Service Income', 'income', 'green', NULL, 'sales'),
    ('CA', 'GST/HST Collected', 'income', 'green', NULL, 'gst_hst_collected'),
    ('CA', 'Grants & Subsidies', 'income', 'green', NULL, 'subsidies_grants'),
    ('CA', 'Other Income', 'income', 'slate', NULL, 'other_income'),
    ('CA', 'Advertising', 'expense', 'blue', NULL, 'advertising'),
    ('CA', 'Business Tax & Licenses', 'expense', 'red', NULL, 'business_tax_fees_licenses_memberships'),
    ('CA', 'Delivery & Freight', 'expense', 'amber', NULL, 'delivery_freight'),
    ('CA', 'GST/HST Paid', 'expense', 'red', NULL, 'gst_hst_paid'),
    ('CA', 'Home Office', 'expense', 'amber', NULL, 'home_office'),
    ('CA', 'Insurance', 'expense', 'blue', NULL, 'insurance'),
    ('CA', 'Interest & Bank Charges', 'expense', 'slate', NULL, 'interest_bank_charges'),
    ('CA', 'Legal & Accounting Fees', 'expense', 'slate', NULL, 'legal_accounting'),
    ('CA', 'Meals & Entertainment', 'expense', 'amber', NULL, 'meals_entertainment'),
    ('CA', 'Motor Vehicle', 'expense', 'amber', NULL, 'motor_vehicle'),
    ('CA', 'Office Expenses', 'expense', 'blue', NULL, 'office_expense'),
    ('CA', 'Office Supplies', 'expense', 'blue', NULL, 'office_supplies'),
    ('CA', 'Phone & Internet', 'expense', 'slate', NULL, 'utilities'),
    ('CA', 'Property Taxes', 'expense', 'red', NULL, 'property_taxes'),
    ('CA', 'Rent', 'expense', 'blue', NULL, 'rent'),
    ('CA', 'Repairs & Maintenance', 'expense', 'slate', NULL, 'maintenance_repairs'),
    ('CA', 'Salaries & Wages', 'expense', 'blue', NULL, 'salaries_wages_benefits'),
    ('CA', 'Software & Subscriptions', 'expense', 'blue', NULL, 'office_expense'),
    ('CA', 'Travel', 'expense', 'amber', NULL, 'travel'),
    ('CA', 'Utilities', 'expense', 'slate', NULL, 'utilities'),
    ('CA', 'Other Expense', 'expense', 'slate', NULL, 'other_expense')
) AS seed(region, name, kind, color, tax_map_us, tax_map_ca)
  ON seed.region = UPPER(COALESCE(b.region, 'US'))
WHERE b.id = c.business_id
  AND c.kind = seed.kind
  AND LOWER(c.name) = LOWER(seed.name)
  AND (
    NULLIF(BTRIM(c.color), '') IS NULL
    OR (seed.tax_map_us IS NOT NULL AND NULLIF(BTRIM(c.tax_map_us), '') IS NULL)
    OR (seed.tax_map_ca IS NOT NULL AND NULLIF(BTRIM(c.tax_map_ca), '') IS NULL)
  );
