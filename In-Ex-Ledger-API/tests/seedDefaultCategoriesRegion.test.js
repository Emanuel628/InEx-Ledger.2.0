"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { seedDefaultCategoriesForBusiness } = require("../api/utils/seedDefaultsForBusiness.js");

test("seedDefaultCategoriesForBusiness reactivates the current region defaults on conflict", async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/SELECT region FROM businesses/i.test(sql)) {
        return { rows: [{ region: "US" }], rowCount: 1 };
      }

      if (/INSERT INTO categories/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unhandled SQL in seedDefaultCategoriesRegion.test.js: ${sql}`);
    }
  };

  await seedDefaultCategoriesForBusiness(db, "00000000-0000-4000-8000-000000000711");

  const insertStatements = calls.filter((entry) => /INSERT INTO categories/i.test(entry.sql));
  assert.ok(insertStatements.length > 0, "default category inserts should run");
  assert.ok(
    insertStatements.every((entry) => /ON CONFLICT \(business_id, name\) DO UPDATE/i.test(entry.sql)),
    "default category seed should reactivate region defaults instead of skipping on conflict"
  );
  assert.ok(
    insertStatements.every((entry) => /is_active = true/i.test(entry.sql)),
    "default category conflict handling should mark restored defaults active"
  );
});
