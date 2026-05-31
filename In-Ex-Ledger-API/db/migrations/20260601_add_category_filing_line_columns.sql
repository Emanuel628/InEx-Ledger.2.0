-- Add CPA-ready filing-line metadata and allocation/review flags to categories.
-- filing_line_us / filing_line_ca map each category to the official Schedule C or
-- T2125 line so tax-summary exports can group correctly.
-- review_only marks categories that require manual CPA review (home office,
-- capital assets, depreciation) before they land in any filing.
-- deduction_limit_pct captures statutory limitations (e.g. 50% meals).
-- requires_allocation flags categories that need a personal_use_pct entry.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS filing_line_us       text,
  ADD COLUMN IF NOT EXISTS filing_line_ca       text,
  ADD COLUMN IF NOT EXISTS review_only          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduction_limit_pct  integer,
  ADD COLUMN IF NOT EXISTS requires_allocation  boolean NOT NULL DEFAULT false;

-- Backfill US Schedule C filing lines from existing tax_map_us values
UPDATE categories SET filing_line_us = CASE tax_map_us
  WHEN 'advertising'             THEN 'schedule_c_8'
  WHEN 'car_truck'               THEN 'schedule_c_9'
  WHEN 'contract_labor'         THEN 'schedule_c_11'
  WHEN 'legal_professional'     THEN 'schedule_c_17'
  WHEN 'office_expense'         THEN 'schedule_c_18'
  WHEN 'rent_lease_other'       THEN 'schedule_c_20b'
  WHEN 'supplies'                THEN 'schedule_c_22'
  WHEN 'taxes_licenses'         THEN 'schedule_c_23'
  WHEN 'travel'                  THEN 'schedule_c_24a'
  WHEN 'meals'                   THEN 'schedule_c_24b'
  WHEN 'utilities'               THEN 'schedule_c_25'
  WHEN 'wages'                   THEN 'schedule_c_26'
  WHEN 'software_subscriptions' THEN 'schedule_c_27a'
  WHEN 'gross_receipts_sales'   THEN 'schedule_c_1'
  ELSE NULL
END
WHERE tax_map_us IS NOT NULL AND filing_line_us IS NULL;

-- Backfill Canada T2125 filing lines from existing tax_map_ca values
UPDATE categories SET filing_line_ca = CASE tax_map_ca
  WHEN 'advertising'                          THEN 't2125_8521'
  WHEN 'meals_entertainment'                  THEN 't2125_8523'
  WHEN 'insurance'                            THEN 't2125_8690'
  WHEN 'interest_bank_charges'               THEN 't2125_8710'
  WHEN 'business_tax_fees_licenses_memberships' THEN 't2125_8760'
  WHEN 'office_expense'                       THEN 't2125_8810'
  WHEN 'office_supplies'                      THEN 't2125_8811'
  WHEN 'legal_accounting'                     THEN 't2125_8860'
  WHEN 'rent'                                 THEN 't2125_8910'
  WHEN 'motor_vehicle'                        THEN 't2125_9281'
  WHEN 'travel'                               THEN 't2125_9200'
  WHEN 'salaries_wages_benefits'             THEN 't2125_9060'
  WHEN 'sales'                               THEN 't2125_gross_sales'
  ELSE NULL
END
WHERE tax_map_ca IS NOT NULL AND filing_line_ca IS NULL;

-- Mark known review-only tax lines
UPDATE categories
SET review_only = true
WHERE NULLIF(BTRIM(COALESCE(tax_map_us, tax_map_ca)), '') IN (
  'home_office',
  'business_use_of_home',
  'equipment_capital_asset',
  'depreciation_section179',
  'ca_9936',
  'ca_9943'
);

-- Statutory 50% meals deduction limit (US and CA)
UPDATE categories
SET deduction_limit_pct = 50
WHERE NULLIF(BTRIM(COALESCE(tax_map_us, '')), '') = 'meals'
   OR NULLIF(BTRIM(COALESCE(tax_map_ca, '')), '') = 'meals_entertainment';

-- Flag categories that require personal_use_pct allocation
UPDATE categories
SET requires_allocation = true
WHERE name ~* '\yphone\y|\yinternet\y|home.?office'
  AND review_only = false;
