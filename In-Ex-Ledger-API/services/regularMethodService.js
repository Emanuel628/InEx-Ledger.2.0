"use strict";

// GST/HST Regular Method reconciliation.
//
// Unlike the Quick Method (a single remittance rate on gross sales), the
// Regular Method nets the GST/HST collected on taxable sales against the input
// tax credits (ITCs) claimed on eligible business expenses (ETA s. 225). This
// worksheet is built entirely from the per-transaction indirect-tax amounts the
// ledger already captures, so a CPA can review the reconciliation explicitly.

function indirectTaxAmount(txn) {
  return Math.abs(Number(txn?.indirect_tax_amount ?? txn?.indirectTaxAmount) || 0);
}

function isRecoverable(txn) {
  return txn?.indirect_tax_recoverable === true || txn?.indirectTaxRecoverable === true;
}

function transactionType(txn) {
  return String(txn?.type || "").toLowerCase();
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function buildRegularMethodSchedule(options = {}) {
  const transactions = Array.isArray(options.transactions) ? options.transactions : [];
  const taxYear = options.taxYear || null;
  const province = options.province || "";

  let collectedOnSales = 0;
  let incomeCount = 0;
  let incomeWithTaxCount = 0;
  let itcsClaimed = 0;
  let expenseRecoverableCount = 0;
  let taxPaidNotClaimed = 0;
  let expenseTaxNotRecoverableCount = 0;

  for (const txn of transactions) {
    const tax = indirectTaxAmount(txn);
    const type = transactionType(txn);
    if (type === "income") {
      incomeCount += 1;
      if (tax > 0) {
        collectedOnSales += tax;
        incomeWithTaxCount += 1;
      }
    } else if (type === "expense" && tax > 0) {
      if (isRecoverable(txn)) {
        itcsClaimed += tax;
        expenseRecoverableCount += 1;
      } else {
        taxPaidNotClaimed += tax;
        expenseTaxNotRecoverableCount += 1;
      }
    }
  }

  collectedOnSales = round2(collectedOnSales);
  itcsClaimed = round2(itcsClaimed);
  taxPaidNotClaimed = round2(taxPaidNotClaimed);
  const netTaxToRemit = round2(collectedOnSales - itcsClaimed);

  // Avoid pretending there is a reconciliation when no GST/HST was tracked.
  if (collectedOnSales === 0 && itcsClaimed === 0 && taxPaidNotClaimed === 0) {
    return {
      supported: false,
      taxYear,
      province,
      collectedOnSales: 0,
      itcsClaimed: 0,
      netTaxToRemit: 0,
      unsupportedReason: "No GST/HST amounts were recorded on transactions in this period. Capture indirect tax per transaction (and flag recoverable expense tax) to produce a regular-method reconciliation.",
      note: "Regular-method reconciliation needs per-transaction GST/HST amounts."
    };
  }

  return {
    supported: true,
    taxYear,
    province,
    collectedOnSales,
    itcsClaimed,
    taxPaidNotClaimed,
    netTaxToRemit,
    isRefund: netTaxToRemit < 0,
    incomeCount,
    incomeWithTaxCount,
    expenseRecoverableCount,
    expenseTaxNotRecoverableCount,
    note: "Net tax = GST/HST collected on sales minus input tax credits (ITCs) on eligible expenses (ETA s. 225)."
  };
}

module.exports = {
  buildRegularMethodSchedule
};
