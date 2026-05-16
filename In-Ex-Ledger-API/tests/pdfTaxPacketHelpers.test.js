"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __private: {
    computeReceiptCoverage,
    computePayerSummary,
    computeTaxLineSummary,
    expectedTaxFormForPayer,
    validateExportProfile,
    summarizeExportTransactions,
    deriveBusinessAmounts,
    resolveBusinessCurrency
  }
} = require("../services/pdfGeneratorService.js");

test("computeReceiptCoverage counts only receipts attached to expense transactions", () => {
  const transactions = [
    { id: "t1", type: "expense" },
    { id: "t2", type: "expense" },
    { id: "t3", type: "income" },
    { id: "t4", type: "expense" }
  ];
  const receipts = [
    { transaction_id: "t1" },
    { transaction_id: "t3" }, // income, should not count toward expense coverage
    { transaction_id: "t-unknown" }
  ];
  const cov = computeReceiptCoverage(transactions, receipts);
  assert.equal(cov.expense_count, 3);
  assert.equal(cov.with_receipt, 1);
  assert.equal(cov.missing, 2);
  assert.equal(cov.coverage_pct, 33.3);
});

test("computeReceiptCoverage returns null coverage when no expenses", () => {
  const cov = computeReceiptCoverage([{ id: "t1", type: "income" }], []);
  assert.equal(cov.expense_count, 0);
  assert.equal(cov.coverage_pct, null);
});

test("expectedTaxFormForPayer applies US thresholds correctly", () => {
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 600, transactionCount: 1 }), "1099-NEC");
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 599, transactionCount: 1 }), null);
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 25000, transactionCount: 250 }), "1099-K");
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 25000, transactionCount: 50 }), "1099-NEC");
});

test("expectedTaxFormForPayer uses 2026 NEC threshold when tax year is 2026 or later", () => {
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 1500, transactionCount: 1, taxYear: 2026 }), null);
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 2000, transactionCount: 1, taxYear: 2026 }), "1099-NEC");
});

test("expectedTaxFormForPayer applies CA T4A threshold", () => {
  assert.equal(expectedTaxFormForPayer({ region: "CA", total: 500, transactionCount: 1 }), "T4A");
  assert.equal(expectedTaxFormForPayer({ region: "CA", total: 499, transactionCount: 1 }), null);
});

test("computePayerSummary groups income, flags expected vs declared form", () => {
  const transactions = [
    { type: "income", payer_name: "Stripe", amount: 800, tax_form_type: "1099-NEC" },
    { type: "income", payer_name: "Stripe", amount: 200, tax_form_type: null },
    { type: "income", payer_name: "Anonymous Client", amount: 5000, tax_form_type: null },
    { type: "income", payer_name: "", amount: 100 },
    { type: "expense", payer_name: "Should be ignored", amount: 999 }
  ];
  const sum = computePayerSummary(transactions, "US");
  assert.equal(sum.payer_count, 3);
  assert.equal(sum.total_income, 6100);
  const stripe = sum.payers.find((p) => p.payer_name === "Stripe");
  assert.equal(stripe.total, 1000);
  assert.equal(stripe.count, 2);
  assert.equal(stripe.declared_form, "1099-NEC");
  assert.equal(stripe.expected_form, "1099-NEC");
  const anon = sum.payers.find((p) => p.payer_name === "Anonymous Client");
  assert.equal(anon.declared_form, null);
  assert.equal(anon.expected_form, "1099-NEC");
  const unspec = sum.payers.find((p) => p.payer_name === "(unspecified)");
  assert.ok(unspec, "unnamed payers should bucket under (unspecified)");
});

test("computeTaxLineSummary picks tax_map_us or tax_map_ca based on region and surfaces unmapped expenses", () => {
  const categories = [
    { id: "c1", tax_map_us: "Schedule C Line 18", tax_map_ca: "T2125 Line 8810" },
    { id: "c2", tax_map_us: "Schedule C Line 25", tax_map_ca: null },
    { id: "c3", tax_map_us: null, tax_map_ca: null }
  ];
  const transactions = [
    { type: "expense", category_id: "c1", amount: 1000 },
    { type: "expense", category_id: "c2", amount: 200 },
    { type: "expense", category_id: "c3", amount: 50 }, // unmapped expense
    { type: "expense", category_id: null, amount: 30 }, // no category at all
    { type: "income", category_id: "c1", amount: 500 } // income mapped lines should still group
  ];
  const summaryUs = computeTaxLineSummary(transactions, categories, "US");
  assert.equal(summaryUs.lines[0].tax_line, "Schedule C Line 18");
  assert.equal(summaryUs.lines[0].total, 1500); // 1000 expense + 500 income
  assert.equal(summaryUs.unmapped_count, 2);
  assert.equal(summaryUs.unmapped_total, 80);

  const summaryCa = computeTaxLineSummary(transactions, categories, "CA");
  // Only c1 has a CA mapping; everything else is unmapped
  assert.equal(summaryCa.lines.length, 1);
  assert.equal(summaryCa.lines[0].tax_line, "T2125 Line 8810");
});

test("validateExportProfile blocks incomplete US and Canada workpapers", () => {
  assert.throws(
    () => validateExportProfile({ region: "US", legalName: "Acme", naics: "541611", address: "123 Main", accountingMethod: "cash" }),
    /Material participation/
  );

  assert.throws(
    () => validateExportProfile({
      region: "CA",
      legalName: "Maple Co",
      taxId: "123456789",
      naics: "541611",
      address: "456 Rue",
      accountingMethod: "cash",
      province: "QC",
      fiscalYearStart: "01-01",
      gstHstRegistered: true
    }),
    /GST\/HST registration number/
  );
});

test("summarizeExportTransactions excludes transfer and payroll rows from business totals", () => {
  const categories = [
    { id: "c1", name: "Transfers", tax_map_us: null, tax_map_ca: null },
    { id: "c2", name: "Sales", tax_map_us: "Schedule C Line 1", tax_map_ca: "T2125 Line 8000" }
  ];
  const transactions = [
    { id: "t1", type: "expense", description: "Online Transfer from SAV", amount: 250, category_id: "c1" },
    { id: "t2", type: "income", description: "PAYRO ACME INC", amount: 1200, category_id: "c2" },
    { id: "t3", type: "income", description: "Client invoice", amount: 800, category_id: "c2" }
  ];
  const summary = summarizeExportTransactions(transactions, categories, { region: "US" });
  assert.equal(summary.included.length, 1);
  assert.equal(summary.excluded.length, 2);
  assert.equal(summary.excluded[0].__exclusionReason != null, true);
});

test("deriveBusinessAmounts splits meals and removes tracked GST/HST in Canada", () => {
  const category = { name: "Meals", tax_map_ca: "T2125 Line 8523" };
  const tx = { type: "expense", amount: 115, indirect_tax_amount: 15 };
  const result = deriveBusinessAmounts(tx, category, { region: "CA", gstHstRegistered: true });
  assert.equal(result.netAmount, 100);
  assert.equal(result.deductibleAmount, 50);
  assert.equal(result.nonDeductibleAmount, 50);
});

test("resolveBusinessCurrency ties the export currency to the business jurisdiction", () => {
  assert.equal(resolveBusinessCurrency("CA", "USD"), "CAD");
  assert.equal(resolveBusinessCurrency("US", "CAD"), "CAD");
  assert.equal(resolveBusinessCurrency("US", ""), "USD");
});
