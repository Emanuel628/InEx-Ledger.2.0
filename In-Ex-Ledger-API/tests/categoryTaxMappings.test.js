"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getDefaultCategoriesForRegion } = require("../api/utils/seedDefaultsForBusiness.js");
const { normalizeCategoryTaxMap } = require("../utils/taxMappings.js");

function categoryByName(categories, name) {
  return categories.find((category) => category.name === name);
}

test("US default categories map office supplies to Schedule C Line 18 (office expense)", () => {
  // Per IRS Schedule C instructions, postage, stationery, and other
  // office supplies belong on Line 18 (office_expense), not Line 22
  // (supplies — reserved for materials consumed in trade/production).
  const defaults = getDefaultCategoriesForRegion("US");
  assert.equal(categoryByName(defaults, "Office Supplies")?.tax_map_us, "office_expense");
  assert.equal(categoryByName(defaults, "Phone & Internet")?.tax_map_us, "utilities");
  assert.equal(categoryByName(defaults, "Software & Subscriptions")?.tax_map_us, "software_subscriptions");
});

test("Canada default categories keep software on office expense and phone/internet on other expense review", () => {
  // Per CRA T2125 handling in InEx, software and subscriptions stay on
  // Line 8810 office expenses, while phone/internet is treated as an
  // allocation-heavy other-expense review item rather than generic utilities.
  const defaults = getDefaultCategoriesForRegion("CA");
  assert.equal(categoryByName(defaults, "Office Expenses")?.tax_map_ca, "office_expense");
  assert.equal(categoryByName(defaults, "Office Supplies")?.tax_map_ca, "office_supplies");
  assert.equal(categoryByName(defaults, "Phone & Internet")?.tax_map_ca, "other_expense");
  assert.equal(categoryByName(defaults, "Software & Subscriptions")?.tax_map_ca, "office_expense");
});

test("Every US default category carries a non-null tax_map_us slug", () => {
  const defaults = getDefaultCategoriesForRegion("US");
  for (const category of defaults) {
    assert.ok(
      category.tax_map_us && category.tax_map_us.length > 0,
      `US default "${category.name}" is missing tax_map_us`
    );
  }
});

test("Every CA default category carries a non-null tax_map_ca slug", () => {
  const defaults = getDefaultCategoriesForRegion("CA");
  for (const category of defaults) {
    assert.ok(
      category.tax_map_ca && category.tax_map_ca.length > 0,
      `CA default "${category.name}" is missing tax_map_ca`
    );
  }
});

test("Canada category tax mappings accept office_supplies", () => {
  const normalized = normalizeCategoryTaxMap("office_supplies", "CA");
  assert.equal(normalized.valid, true);
  assert.equal(normalized.value, "office_supplies");
});

test("every default category is tax mapped for its region", () => {
  for (const region of ["US", "CA"]) {
    const defaults = getDefaultCategoriesForRegion(region);
    for (const category of defaults) {
      const taxMap = region === "CA" ? category.tax_map_ca : category.tax_map_us;
      assert.ok(taxMap, `${region} default category "${category.name}" is missing a tax map`);
      const normalized = normalizeCategoryTaxMap(taxMap, region);
      assert.equal(normalized.valid, true, `${region} default category "${category.name}" has an invalid tax map`);
    }
  }
});

test("all US default categories are tax mapped with valid values", () => {
  const defaults = getDefaultCategoriesForRegion("US");

  for (const category of defaults) {
    assert.ok(
      category.tax_map_us,
      `US default category "${category.name}" is missing tax_map_us`
    );

    const normalized = normalizeCategoryTaxMap(category.tax_map_us, "US");
    assert.equal(
      normalized.valid,
      true,
      `US default category "${category.name}" has invalid tax_map_us "${category.tax_map_us}"`
    );
  }
});

test("all Canada default categories are tax mapped with valid values", () => {
  const defaults = getDefaultCategoriesForRegion("CA");

  for (const category of defaults) {
    assert.ok(
      category.tax_map_ca,
      `Canada default category "${category.name}" is missing tax_map_ca`
    );

    const normalized = normalizeCategoryTaxMap(category.tax_map_ca, "CA");
    assert.equal(
      normalized.valid,
      true,
      `Canada default category "${category.name}" has invalid tax_map_ca "${category.tax_map_ca}"`
    );
  }
});
