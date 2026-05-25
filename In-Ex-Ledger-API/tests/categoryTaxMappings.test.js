"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getDefaultCategoriesForRegion } = require("../api/utils/seedDefaultsForBusiness.js");
const { normalizeCategoryTaxMap } = require("../utils/taxMappings.js");

function categoryByName(categories, name) {
  return categories.find((category) => category.name === name);
}

test("US default categories keep office supplies on Schedule C supplies", () => {
  const defaults = getDefaultCategoriesForRegion("US");
  assert.equal(categoryByName(defaults, "Office Supplies")?.tax_map_us, "supplies");
  assert.equal(categoryByName(defaults, "Phone & Internet")?.tax_map_us, "utilities");
  assert.equal(categoryByName(defaults, "Software & Subscriptions")?.tax_map_us, "software_subscriptions");
});

test("Canada default categories distinguish office expenses from office supplies", () => {
  const defaults = getDefaultCategoriesForRegion("CA");
  assert.equal(categoryByName(defaults, "Office Expenses")?.tax_map_ca, "office_expense");
  assert.equal(categoryByName(defaults, "Office Supplies")?.tax_map_ca, "office_supplies");
  assert.equal(categoryByName(defaults, "Phone & Internet")?.tax_map_ca, "utilities");
  assert.equal(categoryByName(defaults, "Software & Subscriptions")?.tax_map_ca, "other_expense");
});

test("Canada category tax mappings accept office_supplies", () => {
  const normalized = normalizeCategoryTaxMap("office_supplies", "CA");
  assert.equal(normalized.valid, true);
  assert.equal(normalized.value, "office_supplies");
});
