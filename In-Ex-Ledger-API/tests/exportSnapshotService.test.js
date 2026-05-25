"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashValue,
  normalizeExportMode,
  summarizeInvalidationReason,
  deriveFinalizationDecision
} = require("../services/exportSnapshotService.js");

function buildDataset(overrides = {}) {
  return {
    includedRows: [
      {
        id: "tx_1",
        rawType: "expense",
        description: "Shell fuel",
        payerName: "",
        reviewFlags: [],
        reviewIssueEntries: []
      }
    ],
    totals: {
      needsCategoryCount: 0,
      trulyUnmappedCount: 0
    },
    supportSummary: {
      mappedReviewCount: 0
    },
    ...overrides
  };
}

function buildBusiness(overrides = {}) {
  return {
    name: "Test Business",
    business_type: "sole_proprietorship",
    business_activity_code: "541611",
    accounting_method: "cash",
    fiscal_year_start: "01-01",
    material_participation: true,
    gst_hst_registered: false,
    gst_hst_number: "",
    ...overrides
  };
}

test("hashValue is stable across object key order", () => {
  const left = hashValue({ b: 2, a: { d: 4, c: 3 } });
  const right = hashValue({ a: { c: 3, d: 4 }, b: 2 });
  assert.equal(left, right);
});

test("normalizeExportMode falls back to a safe default", () => {
  assert.equal(normalizeExportMode("finalized", "workpaper"), "finalized");
  assert.equal(normalizeExportMode("nope", "draft"), "draft");
  assert.equal(normalizeExportMode("", "workpaper"), "workpaper");
});

test("deriveFinalizationDecision accepts a clean finalized package", () => {
  const decision = deriveFinalizationDecision({
    dataset: buildDataset(),
    business: buildBusiness(),
    requestedMode: "finalized",
    exportFormat: "pdf",
    jurisdiction: "US",
    certifiedByUser: true,
    includeTaxId: false
  });

  assert.equal(decision.eligibleForFinalization, true);
  assert.equal(decision.resolvedMode, "finalized");
  assert.equal(decision.hardBlockers.length, 0);
});

test("deriveFinalizationDecision blocks finalized exports with missing profile or support gaps", () => {
  const decision = deriveFinalizationDecision({
    dataset: buildDataset({
      includedRows: [{
        id: "tx_1",
        rawType: "expense",
        description: "",
        payerName: "",
        reviewFlags: ["RS"],
        reviewIssueEntries: [{ issueCode: "needs_receipt_support", severity: "hard", status: "open" }]
      }],
      totals: {
        needsCategoryCount: 1,
        trulyUnmappedCount: 0
      }
    }),
    business: buildBusiness({
      business_type: "",
      business_activity_code: ""
    }),
    requestedMode: "finalized",
    exportFormat: "pdf",
    jurisdiction: "US",
    certifiedByUser: false,
    includeTaxId: true
  });

  assert.equal(decision.eligibleForFinalization, false);
  assert.equal(decision.resolvedMode, "workpaper");
  assert.ok(decision.hardBlockers.some((issue) => issue.code === "business_profile_incomplete"));
  assert.ok(decision.hardBlockers.some((issue) => issue.code === "needs_receipt_support"));
  assert.ok(decision.hardBlockers.some((issue) => issue.code === "tax_id_certification_required"));
});

test("resolved reviewer issues no longer block finalization", () => {
  const decision = deriveFinalizationDecision({
    dataset: buildDataset({
      includedRows: [{
        id: "tx_1",
        rawType: "expense",
        description: "Shell fuel",
        payerName: "",
        reviewFlags: [],
        reviewIssueEntries: []
      }]
    }),
    business: buildBusiness(),
    requestedMode: "finalized",
    exportFormat: "pdf",
    jurisdiction: "US",
    certifiedByUser: true,
    includeTaxId: false
  });

  assert.equal(decision.eligibleForFinalization, true);
  assert.equal(decision.hardBlockers.length, 0);
});

test("summarizeInvalidationReason classifies known stale causes", () => {
  const summary = summarizeInvalidationReason("Receipt evidence changed after export.");
  assert.equal(summary.code, "receipts");
  assert.equal(summary.label, "Receipt evidence");
  assert.match(summary.nextStep, /receipt/i);
});

test("summarizeInvalidationReason falls back safely for unknown causes", () => {
  const summary = summarizeInvalidationReason("Something unusual changed after export.");
  assert.equal(summary.code, "generic");
  assert.equal(summary.label, "Source data");
});
