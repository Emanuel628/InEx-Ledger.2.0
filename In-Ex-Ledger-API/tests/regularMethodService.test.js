"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRegularMethodSchedule } = require("../services/regularMethodService.js");

test("nets GST/HST collected on sales against recoverable ITCs", () => {
  const schedule = buildRegularMethodSchedule({
    taxYear: 2026,
    province: "ON",
    transactions: [
      { type: "income", amount: 1130, indirect_tax_amount: 130 },
      { type: "income", amount: 565, indirect_tax_amount: 65 },
      { type: "expense", amount: 113, indirect_tax_amount: 13, indirect_tax_recoverable: true },
      { type: "expense", amount: 226, indirect_tax_amount: 26, indirect_tax_recoverable: true },
      // GST paid but not flagged recoverable — tracked for review, not claimed.
      { type: "expense", amount: 56.5, indirect_tax_amount: 6.5, indirect_tax_recoverable: false }
    ]
  });

  assert.equal(schedule.supported, true);
  assert.equal(schedule.collectedOnSales, 195);
  assert.equal(schedule.itcsClaimed, 39);
  assert.equal(schedule.netTaxToRemit, 156);
  assert.equal(schedule.isRefund, false);
  assert.equal(schedule.taxPaidNotClaimed, 6.5);
  assert.equal(schedule.incomeWithTaxCount, 2);
  assert.equal(schedule.expenseRecoverableCount, 2);
  assert.equal(schedule.expenseTaxNotRecoverableCount, 1);
});

test("reports a refund when ITCs exceed tax collected", () => {
  const schedule = buildRegularMethodSchedule({
    taxYear: 2026,
    province: "BC",
    transactions: [
      { type: "income", amount: 105, indirect_tax_amount: 5 },
      { type: "expense", amount: 226, indirect_tax_amount: 26, indirect_tax_recoverable: true }
    ]
  });

  assert.equal(schedule.supported, true);
  assert.equal(schedule.collectedOnSales, 5);
  assert.equal(schedule.itcsClaimed, 26);
  assert.equal(schedule.netTaxToRemit, -21);
  assert.equal(schedule.isRefund, true);
});

test("is unsupported when no GST/HST was recorded on any transaction", () => {
  const schedule = buildRegularMethodSchedule({
    taxYear: 2026,
    province: "ON",
    transactions: [
      { type: "income", amount: 1000 },
      { type: "expense", amount: 200, indirect_tax_amount: 0 }
    ]
  });

  assert.equal(schedule.supported, false);
  assert.match(schedule.unsupportedReason, /No GST\/HST amounts were recorded/i);
});

test("counts income coverage so gaps in tax capture are visible", () => {
  const schedule = buildRegularMethodSchedule({
    taxYear: 2026,
    province: "ON",
    transactions: [
      { type: "income", amount: 113, indirect_tax_amount: 13 },
      { type: "income", amount: 500 }, // taxable sale with no GST captured
      { type: "expense", amount: 113, indirect_tax_amount: 13, indirect_tax_recoverable: true }
    ]
  });

  assert.equal(schedule.supported, true);
  assert.equal(schedule.incomeCount, 2);
  assert.equal(schedule.incomeWithTaxCount, 1);
});
