"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseStripeUnitAmount } = require("../services/stripePriceConfig.js");

test("parseStripeUnitAmount prefers unit_amount_decimal and converts cents to a dollar amount", () => {
  assert.equal(parseStripeUnitAmount({ unit_amount_decimal: "1999", unit_amount: 2000 }), 19.99);
  assert.equal(parseStripeUnitAmount({ unit_amount: 500 }), 5);
});

test("parseStripeUnitAmount throws when neither field is a finite number", () => {
  assert.throws(() => parseStripeUnitAmount({}), /missing a valid unit amount/);
  assert.throws(() => parseStripeUnitAmount(null), /missing a valid unit amount/);
  assert.throws(() => parseStripeUnitAmount({ unit_amount_decimal: "not-a-number" }), /missing a valid unit amount/);
});
