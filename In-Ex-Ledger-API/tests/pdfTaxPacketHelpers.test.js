"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __private: {
    buildTransactionStatus,
    buildExclusionSummary,
    classifyExcludedTransaction,
    computeReceiptCoverage,
    computeAttachedReceiptSummary,
    computePayerSummary,
    computeTaxLineSummary,
    expectedTaxFormForPayer,
    validateExportProfile,
    summarizeExportTransactions,
    deriveBusinessAmounts,
    resolveBusinessCurrency,
    normalizeRegionCode,
    buildCpaActionLines,
    buildCleanupPriorityLines,
    buildSupportWorksheetLines,
    buildChecklistItems,
    isWorkpaperReady,
    buildCategoryBuckets
  }
} = require("../services/pdfGeneratorService.js");

test("computeReceiptCoverage counts only receipts attached to expense transactions", () => {
  const cov = computeReceiptCoverage(
    [
      { id: "t1", type: "expense" },
      { id: "t2", type: "expense" },
      { id: "t3", type: "income" },
      { id: "t4", type: "expense" }
    ],
    [{ transaction_id: "t1" }, { transaction_id: "t3" }, { transaction_id: "missing" }]
  );
  assert.equal(cov.expense_count, 3);
  assert.equal(cov.with_receipt, 1);
  assert.equal(cov.missing, 2);
  assert.equal(cov.coverage_pct, 33.3);
});

test("computeAttachedReceiptSummary counts receipt files on any included transaction type", () => {
  const summary = computeAttachedReceiptSummary(
    [
      { id: "t1", type: "income" },
      { id: "t2", type: "expense" },
      { id: "t3", type: "income" }
    ],
    [
      { transaction_id: "t1", filename: "income-1.pdf" },
      { transaction_id: "t1", filename: "income-2.pdf" },
      { transaction_id: "t2", filename: "expense-1.pdf" },
      { transaction_id: "missing", filename: "ignored.pdf" }
    ]
  );
  assert.equal(summary.transaction_count, 2);
  assert.equal(summary.file_count, 3);
});

test("expectedTaxFormForPayer applies US and Canada thresholds", () => {
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 600, transactionCount: 1, taxYear: 2025 }), "1099-NEC");
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 1500, transactionCount: 1, taxYear: 2026 }), null);
  assert.equal(expectedTaxFormForPayer({ region: "US", total: 25000, transactionCount: 250, taxYear: 2026 }), "1099-K");
  assert.equal(expectedTaxFormForPayer({ region: "CA", total: 500, transactionCount: 1, taxYear: 2026 }), "T4A");
});

test("computePayerSummary groups income by payer and resolves expected forms", () => {
  const summary = computePayerSummary([
    { type: "income", payer_name: "Stripe", amount: 800, tax_form_type: "1099-NEC" },
    { type: "income", payer_name: "Stripe", amount: 200 },
    { type: "income", payer_name: "Client B", amount: 5000 },
    { type: "income", payer_name: "", amount: 100 },
    { type: "expense", payer_name: "Ignored", amount: 25 }
  ], "US", 2025);
  assert.equal(summary.payer_count, 3);
  assert.equal(summary.total_income, 6100);
  assert.equal(summary.payers.find((row) => row.payer_name === "Stripe").expected_form, "1099-NEC");
  assert.equal(summary.payers.find((row) => row.payer_name === "Client B").expected_form, "1099-NEC");
  assert.ok(summary.payers.find((row) => row.payer_name === "(unspecified)"));
});

test("fuel mapped to Line 9 does not use TM or UM", () => {
  const status = buildTransactionStatus(
    { id: "fuel1", type: "expense", amount: 45, description: "Shell fuel", categoryId: "c1" },
    { id: "c1", name: "Fuel & Gas", tax_map_us: "" },
    { region: "US", receiptTxIds: new Set() }
  );
  assert.match(status.taxLineDisplay, /Line 9/i);
  assert.ok(status.flags.includes("ML"));
  assert.ok(status.flags.includes("FC"));
  assert.equal(status.flags.includes("TM"), false);
  assert.equal(status.flags.includes("UM"), false);
});

test("meals mapped to Line 24b do not use TM or UM", () => {
  const status = buildTransactionStatus(
    { id: "meal1", type: "expense", amount: 30, description: "Client lunch", categoryId: "c1" },
    { id: "c1", name: "Food & Dining", tax_map_us: "" },
    { region: "US", receiptTxIds: new Set() }
  );
  assert.match(status.taxLineDisplay, /Line 24b/i);
  assert.ok(status.flags.includes("BP"));
  assert.ok(status.flags.includes("FC"));
  assert.equal(status.flags.includes("TM"), false);
  assert.equal(status.flags.includes("UM"), false);
});

test("phone and internet mapped to allocation review do not use TM or UM", () => {
  const status = buildTransactionStatus(
    { id: "phone1", type: "expense", amount: 80, description: "Phone service", categoryId: "c1" },
    { id: "c1", name: "Phone & Internet", tax_map_us: "" },
    { region: "US", receiptTxIds: new Set() }
  );
  assert.match(status.taxLineDisplay, /Line 25\/27a/i);
  assert.ok(status.flags.includes("AL"));
  assert.ok(status.flags.includes("FC"));
  assert.equal(status.flags.includes("TM"), false);
  assert.equal(status.flags.includes("UM"), false);
});

test("auto insurance uses allocation review without a mileage-log flag", () => {
  const status = buildTransactionStatus(
    { id: "ins1", type: "expense", amount: 128, description: "Progressive auto insurance", categoryId: "c1" },
    { id: "c1", name: "Auto Insurance", tax_map_us: "" },
    { region: "US", receiptTxIds: new Set() }
  );
  assert.match(status.taxLineDisplay, /Line 9/i);
  assert.ok(status.flags.includes("AL"));
  assert.ok(status.flags.includes("FC"));
  assert.equal(status.flags.includes("ML"), false);
  assert.equal(status.flags.includes("UM"), false);
});

test("imported expense has NC and UM when it remains unresolved", () => {
  const status = buildTransactionStatus(
    { id: "exp1", type: "expense", amount: 10, description: "Bank import" },
    { id: "c1", name: "Imported Expense", tax_map_us: "" },
    { region: "US" }
  );
  assert.ok(status.flags.includes("NC"));
  assert.equal(status.needsCategory, true);
});

test("imported income refund or reversal has NC and RR", () => {
  const status = buildTransactionStatus(
    { id: "inc1", type: "income", amount: 12, description: "Cashback refund" },
    { id: "c1", name: "Imported Income", tax_map_us: "" },
    { region: "US" }
  );
  assert.ok(status.flags.includes("NC"));
  assert.ok(status.flags.includes("RR"));
});

test("imported income with unknown source is not mapped-ready gross receipts by default", () => {
  const status = buildTransactionStatus(
    { id: "inc2", type: "income", amount: 120, description: "Zelle payment from Mike" },
    { id: "c1", name: "Imported Income", tax_map_us: "" },
    { region: "US" }
  );
  assert.equal(status.needsCategory, true);
  assert.equal(status.isMapped, false);
  assert.equal(status.supportStatus, "category_required");
  assert.equal(status.taxLineDisplay, "Needs category / no tax line yet");
  assert.ok(status.flags.includes("NC"));
  assert.ok(status.flags.includes("RV"));
});

test("classifyExcludedTransaction returns structured exclusion objects", () => {
  const ccPay = classifyExcludedTransaction(
    { type: "expense", description: "Online payment thank you", amount: 200 },
    null,
    "US"
  );
  assert.deepEqual(ccPay, {
    code: "CC_PAY",
    label: "CC PAY",
    title: "Credit card payment",
    description: "Credit-card payment excluded from P&L; deduct underlying card charges instead.",
    includeInPnl: false,
    severity: "info"
  });
});

test("transfer and non-P&L payment patterns are excluded with structured codes", () => {
  const cases = [
    { description: "TRANSFER TO SAV XXXXX7188", type: "expense", expected: "TRANSFER" },
    { description: "Online Realtime Transfer to Affinity", type: "expense", expected: "TRANSFER" },
    { description: "CITI CARD ONLINE PAYMENT", type: "expense", expected: "CC_PAY" },
    { description: "Payment to Chase card ending in 6289", type: "expense", expected: "CC_PAY" },
    { description: "CAPITAL ONE MOBILE PMT", type: "expense", expected: "CC_PAY" },
    { description: "AFFIRM * PAY", type: "expense", expected: "LOAN_DEBT" },
    { description: "KLARNA* KLARNA", type: "expense", expected: "LOAN_DEBT" },
    { description: "AMAZON CORP SYF PAYMNT", type: "expense", expected: "CC_PAY" },
    { description: "GIVAUDAN FLAVORS PAYROLL", type: "income", expected: "PAYROLL" },
    { description: "IRS TREAS 310 TAX REF", type: "income", expected: "TAX_REF" },
    { description: "STATE OF N.J. NJSTTAXRFD", type: "income", expected: "TAX_REF" },
    { description: "Cash Redemption", type: "income", expected: "CASHBACK" },
    { description: "Reversal: APPLE.COM/BILL", type: "income", expected: "REFUND_REV" }
  ];

  for (const { description, type, expected } of cases) {
    const reason = classifyExcludedTransaction(
      { type, description, amount: 50 },
      { id: "c1", name: type === "income" ? "Imported Income" : "Imported Expense", tax_map_us: "" },
      "US"
    );
    assert.equal(reason?.code, expected, description);
    assert.equal(reason?.includeInPnl, false, description);
  }
});

test("summarizeExportTransactions routes transfers, card payments, payroll, refunds, and reversals out of included totals", () => {
  const categories = [
    { id: "sales", name: "Sales Revenue", tax_map_us: "Line 1 - Gross receipts or sales" },
    { id: "imported_expense", name: "Imported Expense", tax_map_us: "" },
    { id: "imported_income", name: "Imported Income", tax_map_us: "" }
  ];
  const summary = summarizeExportTransactions([
    { id: "t1", type: "expense", amount: 300, category_id: "imported_expense", description: "TRANSFER TO SAV XXXXX7188" },
    { id: "t2", type: "expense", amount: 250, category_id: "imported_expense", description: "CITI CARD ONLINE PAYMENT" },
    { id: "t3", type: "expense", amount: 90, category_id: "imported_expense", description: "AFFIRM * PAY" },
    { id: "t4", type: "income", amount: 1100, category_id: "imported_income", description: "GIVAUDAN FLAVORS PAYROLL" },
    { id: "t5", type: "income", amount: 150, category_id: "imported_income", description: "IRS TREAS 310 TAX REF" },
    { id: "t6", type: "income", amount: 25, category_id: "imported_income", description: "Cash Redemption" },
    { id: "t7", type: "income", amount: 40, category_id: "imported_income", description: "Reversal: APPLE.COM/BILL" },
    { id: "t8", type: "income", amount: 900, category_id: "sales", description: "Client invoice", payer_name: "Acme Client", tax_form_type: "1099-NEC" }
  ], categories, { region: "US" });

  assert.equal(summary.included.length, 1);
  assert.equal(summary.excluded.length, 7);
  assert.deepEqual(summary.excluded.map((row) => row.__exclusionReason.code).sort(), ["TRANSFER", "CC_PAY", "LOAN_DEBT", "PAYROLL", "TAX_REF", "CASHBACK", "REFUND_REV"].sort());
});

test("exclusion summary includes count and amount by code", () => {
  const rows = [
    { amount: 100, __exclusionReason: { code: "CC_PAY", label: "CC PAY" } },
    { amount: 25, __exclusionReason: { code: "CC_PAY", label: "CC PAY" } },
    { amount: 80, __exclusionReason: { code: "TRANSFER", label: "TRANSFER" } }
  ];
  const summary = buildExclusionSummary(rows, "USD");
  const ccPay = summary.find((row) => row.code === "CC_PAY");
  assert.equal(ccPay.count, 2);
  assert.equal(ccPay.amount, 125);
  assert.match(ccPay.amount_display, /\$125\.00/);
});

test("computeTaxLineSummary uses resolved status mapping rather than raw category tax map only", () => {
  const transactions = [
    {
      id: "fuel1",
      type: "expense",
      amount: 50,
      __businessAmounts: { deductibleAmount: 50 },
      __status: buildTransactionStatus({ id: "fuel1", type: "expense", amount: 50, description: "Gas", categoryId: "c1" }, { id: "c1", name: "Fuel & Gas", tax_map_us: "" }, { region: "US" }),
      __category: { id: "c1", name: "Fuel & Gas", tax_map_us: "" }
    },
    {
      id: "imported1",
      type: "expense",
      amount: 20,
      __businessAmounts: { deductibleAmount: 20 },
      __status: buildTransactionStatus({ id: "imported1", type: "expense", amount: 20, description: "Import", categoryId: "c2" }, { id: "c2", name: "Imported Expense", tax_map_us: "" }, { region: "US" }),
      __category: { id: "c2", name: "Imported Expense", tax_map_us: "" }
    }
  ];
  const summary = computeTaxLineSummary(transactions, [], "US");
  assert.equal(summary.unmapped_count, 0);
  assert.equal(summary.mapped_review_count, 1);
  assert.equal(summary.imported_count, 1);
});

test("validateExportProfile blocks incomplete US and Canada workpapers", () => {
  assert.throws(() => {
    validateExportProfile({ region: "US", legalName: "Acme", naics: "541611", address: "123 Main", accountingMethod: "cash" });
  }, /Material participation/);

  assert.throws(() => {
    validateExportProfile({
      region: "CA",
      legalName: "Maple Co",
      naics: "541611",
      address: "456 Rue",
      accountingMethod: "cash",
      province: "QC",
      fiscalYearStart: "01-01",
      gstHstRegistered: true
    });
  }, /GST\/HST registration number/);
});

test("summarizeExportTransactions excludes payroll, credit card payments, tax refunds, and cashback from business totals", () => {
  const categories = [
    { id: "sales", name: "Sales Revenue", tax_map_us: "Line 1 - Gross receipts or sales" },
    { id: "other", name: "Imported Income", tax_map_us: "" }
  ];
  const summary = summarizeExportTransactions([
    { id: "p1", type: "income", amount: 1000, category_id: "sales", description: "PAYRO ACME INC" },
    { id: "c1", type: "expense", amount: 150, category_id: "other", description: "Online payment thank you" },
    { id: "t1", type: "income", amount: 75, category_id: "other", description: "IRS TAX REFUND" },
    { id: "cb1", type: "income", amount: 8, category_id: "other", description: "Cash back redemption" },
    { id: "s1", type: "income", amount: 500, category_id: "sales", description: "Client invoice" }
  ], categories, { region: "US" });
  assert.equal(summary.included.length, 1);
  assert.equal(summary.excluded.length, 4);
  assert.deepEqual(summary.excluded.map((row) => row.__exclusionReason.code).sort(), ["CASHBACK", "CC_PAY", "PAYROLL", "TAX_REF"].sort());
});

test("deriveBusinessAmounts splits meals and removes tracked GST/HST in Canada", () => {
  const amounts = deriveBusinessAmounts(
    { type: "expense", amount: 115, indirect_tax_amount: 15, description: "Client meal" },
    { name: "Meals", tax_map_ca: "Line 8523 - Meals and entertainment (50% limit review)" },
    { region: "CA", gstHstRegistered: true }
  );
  assert.equal(amounts.netAmount, 100);
  assert.equal(amounts.deductibleAmount, 50);
  assert.equal(amounts.nonDeductibleAmount, 50);
});

test("resolveBusinessCurrency and normalizeRegionCode keep jurisdiction stable", () => {
  assert.equal(resolveBusinessCurrency("CA", "USD"), "USD");
  assert.equal(resolveBusinessCurrency("US", ""), "USD");
  assert.equal(normalizeRegionCode("ca"), "CA");
  assert.equal(normalizeRegionCode("us"), "US");
});

test("Canada mappings resolve review lines for fuel, meals, and phone", () => {
  const fuel = buildTransactionStatus({ type: "expense", amount: 10, description: "Gas", categoryId: "c1" }, { id: "c1", name: "Fuel & Gas", tax_map_ca: "" }, { region: "CA" });
  const meals = buildTransactionStatus({ type: "expense", amount: 10, description: "Lunch", categoryId: "c2" }, { id: "c2", name: "Food & Dining", tax_map_ca: "" }, { region: "CA" });
  const phone = buildTransactionStatus({ type: "expense", amount: 10, description: "Phone", categoryId: "c3" }, { id: "c3", name: "Phone & Internet", tax_map_ca: "" }, { region: "CA" });
  assert.match(fuel.taxLineDisplay, /Line 9281/i);
  assert.match(meals.taxLineDisplay, /Line 8523/i);
  assert.match(phone.taxLineDisplay, /Line 9270/i);
});

test("buildCategoryBuckets preserves mapping status for needs-category rows", () => {
  const uncategorized = {
    id: "t_uncat",
    type: "expense",
    amount: 25,
    __businessAmounts: { deductibleAmount: 25 },
    __status: buildTransactionStatus(
      { id: "t_uncat", type: "expense", amount: 25, description: "Imported row", categoryId: "c_uncat" },
      { id: "c_uncat", name: "Imported Expense", tax_map_us: "" },
      { region: "US" }
    ),
    __category: { id: "c_uncat", name: "Imported Expense", tax_map_us: "" }
  };
  const mapped = {
    id: "t_mapped",
    type: "expense",
    amount: 40,
    __businessAmounts: { deductibleAmount: 40 },
    __status: buildTransactionStatus(
      { id: "t_mapped", type: "expense", amount: 40, description: "Office depot", categoryId: "c_mapped" },
      { id: "c_mapped", name: "Office Supplies", tax_map_us: "office_expense" },
      { region: "US", receiptTxIds: new Set(["t_mapped"]) }
    ),
    __category: { id: "c_mapped", name: "Office Supplies", tax_map_us: "office_expense" }
  };

  const buckets = buildCategoryBuckets([uncategorized, mapped], "USD");
  const uncategorizedBucket = buckets.find((row) => row.category === "Imported Expense");
  const mappedBucket = buckets.find((row) => row.category === "Office Supplies");

  assert.equal(uncategorizedBucket.mappingStatus, "Needs category");
  assert.equal(mappedBucket.mappingStatus, "Mapped");
});

test("isWorkpaperReady stays draft for truly unmapped categorized expenses", () => {
  assert.equal(isWorkpaperReady({
    reviewFlagCount: 1,
    needsCategoryCount: 0,
    unmappedTaxCount: 1,
    mappedNeedsSupportCount: 0,
    missingDescriptionCount: 0,
    duplicateCount: 0
  }), false);
});

test("isWorkpaperReady only returns true when unresolved included-review counts are clear", () => {
  assert.equal(isWorkpaperReady({
    reviewFlagCount: 0,
    needsCategoryCount: 0,
    unmappedTaxCount: 0,
    mappedNeedsSupportCount: 0,
    missingDescriptionCount: 0,
    duplicateCount: 0
  }), true);

  assert.equal(isWorkpaperReady({
    reviewFlagCount: 0,
    needsCategoryCount: 0,
    unmappedTaxCount: 0,
    mappedNeedsSupportCount: 0,
    missingDescriptionCount: 1,
    duplicateCount: 0
  }), false);
});

test("buildCpaActionLines includes home office and capital asset support counts", () => {
  const lines = buildCpaActionLines({
    needsCategoryCount: 1,
    unmappedTaxCount: 2,
    mappedReceiptSupportCount: 3,
    attachedReceiptFileCount: 4,
    receiptLinkedCount: 2,
    transactionWithReceiptCount: 5,
    expenseWithoutReceiptAttachmentCount: 6,
    vehicleCount: 7,
    mealsCount: 8,
    phoneAllocationCount: 9,
    homeOfficeCount: 10,
    capitalAssetCount: 11
  }, "USD");

  assert.ok(lines.some((line) => /10 home-office items require worksheet support\./.test(line)));
  assert.ok(lines.some((line) => /11 capital asset items require asset review support\./.test(line)));
});

test("buildCleanupPriorityLines includes home office and capital asset priorities", () => {
  const priorities = buildCleanupPriorityLines({
    needsCategoryCount: 0,
    unmappedTaxCount: 0,
    expenseWithoutReceiptAttachmentCount: 0,
    vehicleCount: 0,
    mealsCount: 0,
    phoneAllocationCount: 0,
    homeOfficeCount: 2,
    capitalAssetCount: 3,
    duplicateCount: 0
  });

  assert.ok(priorities.some((line) => /2 home-office items/.test(line)));
  assert.ok(priorities.some((line) => /3 capital items/.test(line)));
});

test("buildChecklistItems surfaces tax mapping, home office, and capital asset cards", () => {
  const items = buildChecklistItems({
    missingReceiptCount: 0,
    attachedReceiptFileCount: 4,
    receiptLinkedCount: 3,
    transactionWithReceiptCount: 4,
    needsCategoryCount: 1,
    unmappedTaxCount: 2,
    vehicleCount: 0,
    vehicleTotal: 0,
    mealsCount: 0,
    mealsTotal: 0,
    phoneAllocationCount: 0,
    phoneAllocationTotal: 0,
    homeOfficeCount: 5,
    homeOfficeTotal: 1250,
    capitalAssetCount: 6,
    capitalAssetTotal: 4800,
    excludedCount: 0
  }, "USD");

  const taxMapping = items.find((item) => item.title === "Tax-line mapping");
  const homeOffice = items.find((item) => item.title === "Home office support");
  const capitalAsset = items.find((item) => item.title === "Capital asset review");

  assert.equal(taxMapping.badge, "ACTION");
  assert.match(taxMapping.description, /2 categorized expense transactions still need a real tax-line mapping/i);
  assert.equal(homeOffice.badge, "ACTION");
  assert.match(homeOffice.description, /5 home-office transactions totaling \$1,250\.00/i);
  assert.equal(capitalAsset.badge, "ACTION");
  assert.match(capitalAsset.description, /6 capital asset transactions totaling \$4,800\.00/i);
});

test("buildSupportWorksheetLines surfaces home office and capital asset support together", () => {
  const lines = buildSupportWorksheetLines({
    homeOfficeCount: 2,
    homeOfficeTotal: 900,
    capitalAssetCount: 3,
    capitalAssetTotal: 4100
  }, {
    homeOfficeWorksheetCount: 1,
    capitalAssetSupportCount: 2
  }, "USD");

  assert.ok(lines.some((line) => /Home office: 2 totaling \$900\.00/.test(line)));
  assert.ok(lines.some((line) => /Capital assets: 3 totaling \$4,100\.00/.test(line)));
  assert.ok(lines.some((line) => /Home-office worksheets: 1 \| Asset support files: 2/.test(line)));
  assert.ok(lines.some((line) => /Worksheet allocation and depreciation \/ CCA support still required\./.test(line)));
});
