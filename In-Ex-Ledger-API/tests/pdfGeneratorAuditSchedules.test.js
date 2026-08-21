"use strict";

/**
 * Regression coverage for three real bugs found in pdfGeneratorService.js by
 * an independent code review:
 *
 *  1. The redacted-export footer still printed part of the real tax ID
 *     regardless of the isSecure flag (buildFooterText called maskTaxId
 *     unconditionally).
 *  2. buildVehicleAuditSchedule/buildCapitalAssetSchedule silently dropped
 *     every row past the first page instead of paginating (a `return`
 *     inside `.forEach()` only skips one iteration, not the whole loop).
 *  3. buildVehicleAuditSchedule and buildQuickMethodRemittancePage were
 *     each declared twice; function-declaration hoisting meant the second
 *     (buggy, in the vehicle case) declaration silently won.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../services/pdfGeneratorService.js");
const { buildFooterText, buildVehicleAuditSchedule, buildCapitalAssetSchedule } = __private;

const LABELS = { statusBadgeText: "Draft", statusBadgeVariant: "warning" };

function commandsOf(canvas) {
  return canvas.commands.join("\n");
}

test("buildFooterText withholds the tax ID entirely when isSecure is false", () => {
  const secureFooter = buildFooterText(LABELS, "R-1", new Date().toISOString(), true, 1, 1, "Acme LLC", "123-45-6789");
  const redactedFooter = buildFooterText(LABELS, "R-1", new Date().toISOString(), false, 1, 1, "Acme LLC", "123-45-6789");

  assert.match(secureFooter, /123-4/, "secure footer should show the masked-but-partial real tax ID");
  assert.doesNotMatch(redactedFooter, /123-4/, "redacted footer must not leak any part of the real tax ID");
  assert.match(redactedFooter, /Withheld/);
});

test("buildVehicleAuditSchedule paginates instead of silently dropping rows past the first page", () => {
  const claims = Array.from({ length: 60 }, (_, i) => ({
    transaction_date: "2026-03-01",
    description: `Vehicle claim ${i + 1}`,
    claim_method: "mileage",
    distance: 100 + i,
    distance_unit: "mi",
    tax_year_rate: "0.67",
    calculated_deduction: 50 + i
  }));

  const pages = buildVehicleAuditSchedule(claims, "USD", LABELS, "US");
  assert.ok(pages.length > 1, "60 claims must not fit on a single page — expected multiple pages");

  const allText = pages.map(commandsOf).join("\n");
  for (const claim of claims) {
    assert.match(allText, new RegExp(claim.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `expected "${claim.description}" to appear somewhere across the paginated schedule`);
  }
});

test("buildVehicleAuditSchedule's last page carries the total and Method Reference card, earlier pages don't duplicate it", () => {
  const claims = Array.from({ length: 45 }, (_, i) => ({
    transaction_date: "2026-03-01",
    description: `Claim ${i + 1}`,
    claim_method: "actual",
    business_use_pct: 50,
    calculated_deduction: 10
  }));

  const pages = buildVehicleAuditSchedule(claims, "USD", LABELS, "US");
  assert.ok(pages.length >= 2);

  const lastPageText = commandsOf(pages[pages.length - 1]);
  assert.match(lastPageText, /Total audited vehicle deduction/);
  assert.match(lastPageText, /Method Reference/);

  for (const page of pages.slice(0, -1)) {
    assert.doesNotMatch(commandsOf(page), /Total audited vehicle deduction/);
  }
});

test("buildCapitalAssetSchedule paginates instead of silently dropping rows past the first page", () => {
  const assets = Array.from({ length: 50 }, (_, i) => ({
    name: `Asset ${i + 1}`,
    cca_class: "10",
    original_cost: 1000 + i,
    prior_depreciation: 100,
    current_year_depreciation: 50,
    remaining_basis: 850
  }));

  const pages = buildCapitalAssetSchedule(assets, "USD", LABELS, "CA");
  assert.ok(pages.length > 1, "50 assets must not fit on a single page — expected multiple pages");

  const allText = pages.map(commandsOf).join("\n");
  for (const asset of assets) {
    assert.match(allText, new RegExp(asset.name), `expected "${asset.name}" to appear somewhere across the paginated schedule`);
  }

  const lastPageText = commandsOf(pages[pages.length - 1]);
  assert.match(lastPageText, /Total current-year depreciation/);
});

test("buildVehicleAuditSchedule and buildCapitalAssetSchedule each fit small lists on a single page", () => {
  const claims = [{ transaction_date: "2026-01-01", description: "One claim", claim_method: "mileage", distance: 10, distance_unit: "mi", calculated_deduction: 6.7 }];
  assert.equal(buildVehicleAuditSchedule(claims, "USD", LABELS, "US").length, 1);

  const assets = [{ name: "Laptop", cca_class: "50", original_cost: 2000, prior_depreciation: 0, current_year_depreciation: 400, remaining_basis: 1600 }];
  assert.equal(buildCapitalAssetSchedule(assets, "USD", LABELS, "US").length, 1);
});

test("buildVehicleAuditSchedule and buildCapitalAssetSchedule return [] for empty input", () => {
  assert.deepEqual(buildVehicleAuditSchedule([], "USD", LABELS, "US"), []);
  assert.deepEqual(buildVehicleAuditSchedule(null, "USD", LABELS, "US"), []);
  assert.deepEqual(buildCapitalAssetSchedule([], "USD", LABELS, "US"), []);
});
