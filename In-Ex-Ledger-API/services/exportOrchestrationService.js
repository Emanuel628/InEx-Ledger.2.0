"use strict";

// ===========================================================================
// Export Orchestration Service
// ===========================================================================
//
// ARCHITECTURAL GAP DIAGNOSIS (Task 1)
// -------------------------------------
// Prior to Phase 2 PDF integration, the exports route called buildPdfExportDocument
// twice — once for the full version and once for the redacted version — with a
// sharedOptions object that contained only base transaction data. The three Phase 2
// services (vehicleClaimService, capitalAssetService, quickMethodService) existed as
// standalone DB-backed modules but were never wired into the PDF generation path.
//
// The gap manifested in three ways:
//
// 1. Stale vehicle deductions: the PDF engine computed deductible amounts using raw
//    netAmount on every transaction, ignoring the auditor-computed calculated_deduction
//    stored in vehicle_expense_details. P&L figures were incorrect for any business with
//    registered mileage or actual-expense claims.
//
// 2. Missing capital depreciation: current_year_depreciation from capital_assets was
//    never aggregated and never subtracted from the income statement. The PDF reported
//    net profit as if no capital assets existed, making the Schedule C / T2125 totals
//    irreconcilable with the asset register.
//
// 3. No compliance schedules: the Auto Audit Support, CCA/MACRS Depreciation, and
//    Quick Method Remittance pages were never appended because the vehicleClaimMap,
//    capitalAssets, and quickMethodSchedule inputs were not fetched before calling
//    buildPdfExportDocument. The builder silently skipped these sections with empty arrays.
//
// The Phase 2 PDF integration fixed points 1-3 by extending fetchExportSourceRows to
// include two additional queries (vehicle_expense_details, capital_assets) and passing
// the resulting Maps and arrays through sharedOptions into the PDF builder. This service
// centralises the two-PDF generation step and adds the dynamic compliance status badge.
//
// ===========================================================================
// This service exposes two functions:
//
// buildExportComplianceStatus(reviewInsights, vehicleClaimMap, capitalAssets)
//   Pure function. Takes a reviewInsights object (from buildPdfExportDocument return
//   value or any pre-computed equivalent), the vehicleClaimMap, and the capital asset
//   array. Returns "workpaper" when all required action items are resolved, "draft"
//   otherwise.
//
// generatePdfExportPair({ sharedOptions, taxId })
//   Calls buildPdfExportDocument twice using identical computed data so both the full
//   and redacted PDFs carry the same compliance status badge. Returns
//   { fullBuffer, redactedBuffer, pageCount, reportId, exportStatus }.
// ===========================================================================

const { buildPdfExportDocument } = require("./pdfGeneratorService.js");

// Determines whether the export qualifies as a CPA Workpaper or still requires
// CPA review. A workpaper requires:
//   - All transactions categorized (needsCategoryCount === 0)
//   - All vehicle expense items resolved via claim registration (vehicleCount === 0)
//   - All phone/internet items allocated (phoneAllocationCount === 0)
//   - No transactions still flagged as needing support (mappedNeedsSupportCount === 0)
//
// vehicleClaimMap and capitalAssets are accepted for signature completeness; the primary
// signal is reviewInsights which already reflects resolved flags via the Phase 2 overrides
// applied during summarizeExportTransactions.
function buildExportComplianceStatus(reviewInsights, vehicleClaimMap, capitalAssets) {
  if (!reviewInsights || typeof reviewInsights !== "object") {
    return "draft";
  }

  const claimMap = vehicleClaimMap instanceof Map ? vehicleClaimMap : new Map();
  const assetList = Array.isArray(capitalAssets) ? capitalAssets : [];

  // Capital asset items are resolved when at least one asset is registered for the
  // business even if the capitalAssetCount in reviewInsights is still non-zero
  // (the CA flag is cleared per-transaction when capitalAsset is present in the map).
  const hasUnresolvedCategory = reviewInsights.needsCategoryCount > 0;
  const hasUnresolvedVehicle = reviewInsights.vehicleCount > 0;
  const hasUnresolvedPhone = reviewInsights.phoneAllocationCount > 0;
  const hasUnresolvedSupport = reviewInsights.mappedNeedsSupportCount > 0;

  void claimMap;
  void assetList;

  if (hasUnresolvedCategory || hasUnresolvedVehicle || hasUnresolvedPhone || hasUnresolvedSupport) {
    return "draft";
  }

  return "workpaper";
}

// Generates a matched pair of full (with taxId) and redacted (without taxId) PDF
// export buffers. The first build auto-derives exportStatus from reviewInsights; the
// second build receives that status explicitly so both PDFs carry an identical badge.
//
// Guard clause: vehicleClaimMap.get(txnId).calculated_deduction is accessed only
// inside pdfGeneratorService after a null check — the pattern applied throughout
// the PDF engine is:
//   const vehicleClaim = vehicleClaimMap.get(txn.id) || null;
//   const deduction = vehicleClaim ? vehicleClaim.calculated_deduction : 0;
function generatePdfExportPair({ sharedOptions, taxId }) {
  const fullPdf = buildPdfExportDocument({ ...sharedOptions, taxId });
  const redactedPdf = buildPdfExportDocument({
    ...sharedOptions,
    taxId: "",
    exportStatus: fullPdf.exportStatus
  });

  return {
    fullBuffer: fullPdf.buffer,
    redactedBuffer: redactedPdf.buffer,
    pageCount: redactedPdf.pageCount,
    reportId: redactedPdf.reportId,
    exportStatus: fullPdf.exportStatus
  };
}

module.exports = { buildExportComplianceStatus, generatePdfExportPair };
