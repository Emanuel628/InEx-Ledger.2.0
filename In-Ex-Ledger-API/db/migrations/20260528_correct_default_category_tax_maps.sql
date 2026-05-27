-- Correct two default-category tax mappings to match official IRS / CRA
-- guidance. Earlier seeds shipped slightly imprecise mappings that still
-- pass validation but route the expense to the wrong line on the
-- generated workpaper.
--
-- 1. US "Office Supplies" had tax_map_us = 'supplies' (Schedule C Line 22
--    "Supplies", which is for materials consumed in trade/production).
--    Per Schedule C instructions, office supplies belong on Line 18
--    "Office expense" (tax_map_us = 'office_expense').
--
-- 2. CA "Software & Subscriptions" had tax_map_ca = 'other_expense'
--    (T2125 Line 9270 catch-all). Per CRA guidance for T2125 Line 8810,
--    software and subscription costs are office expenses
--    (tax_map_ca = 'office_expense').
--
-- Only the default rows are touched; categories the user has customized
-- (renamed, edited the tax mapping, or marked non-default) are left
-- alone so we never overwrite explicit user choices.

UPDATE categories
SET tax_map_us = 'office_expense'
WHERE is_default = TRUE
  AND LOWER(name) = 'office supplies'
  AND tax_map_us = 'supplies';

UPDATE categories
SET tax_map_ca = 'office_expense'
WHERE is_default = TRUE
  AND LOWER(name) = 'software & subscriptions'
  AND tax_map_ca = 'other_expense';
