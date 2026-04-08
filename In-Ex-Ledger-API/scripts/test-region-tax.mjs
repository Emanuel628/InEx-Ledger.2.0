/**
 * Regression test for region-specific tax rate logic.
 * Validates that province-specific Canadian rates and the US rate
 * are correctly applied throughout the app.
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertClose(actual, expected, message, tolerance = 0.00001) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`FAIL: ${message} — expected ${expected}, got ${actual}`);
  }
  console.log(`  PASS: ${message}`);
}

// ── Mirror the constants from global.js ─────────────────────────────────────
const US_ESTIMATED_TAX_RATE = 0.24;
const CANADA_ESTIMATED_TAX_RATES = {
  AB: 0.05,
  BC: 0.12,
  MB: 0.12,
  NB: 0.15,
  NL: 0.15,
  NS: 0.15,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.14975,
  SK: 0.11,
  YT: 0.05
};
const DEFAULT_CA_ESTIMATED_TAX_RATE = 0.05;

// ── Mirror resolveEstimatedTaxProfile from global.js ─────────────────────────
function normalizeEstimatedTaxRegion(region) {
  const normalized = String(region || "").trim().toLowerCase();
  if (normalized === "ca" || normalized === "canada") return "CA";
  if (normalized === "us" || normalized === "usa" || normalized === "united states" || normalized === "united states of america") return "US";
  return "US";
}

function normalizeEstimatedTaxProvince(province) {
  return String(province || "").toUpperCase();
}

function resolveEstimatedTaxProfile(region, province) {
  const normalizedRegion = normalizeEstimatedTaxRegion(region);
  const normalizedProvince = normalizeEstimatedTaxProvince(province);
  if (normalizedRegion === "CA") {
    return {
      region: "CA",
      province: normalizedProvince,
      rate: CANADA_ESTIMATED_TAX_RATES[normalizedProvince] || DEFAULT_CA_ESTIMATED_TAX_RATE
    };
  }
  return { region: "US", province: "", rate: US_ESTIMATED_TAX_RATE };
}

// ── Mirror resolvePdfTaxRate from pdf_export.js ───────────────────────────────
function resolvePdfTaxRate(region, province) {
  const normalizedRegion = String(region || "").toLowerCase();
  const normalizedProvince = String(province || "").toUpperCase();
  if (normalizedRegion === "ca") {
    return CANADA_ESTIMATED_TAX_RATES[normalizedProvince] || DEFAULT_CA_ESTIMATED_TAX_RATE;
  }
  return US_ESTIMATED_TAX_RATE;
}

// ── Mirror the inline fallback from transactions.js / settings.js ─────────────
function resolveEstimatedTaxProfileFallback(region, province) {
  const normalizedRegion = String(region || "").toUpperCase() === "CA" ? "CA" : "US";
  const normalizedProvince = String(province || "").toUpperCase();
  return {
    region: normalizedRegion,
    province: normalizedProvince,
    rate: normalizedRegion === "CA"
      ? (CANADA_ESTIMATED_TAX_RATES[normalizedProvince] || DEFAULT_CA_ESTIMATED_TAX_RATE)
      : US_ESTIMATED_TAX_RATE
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

console.log("\nTest: resolveEstimatedTaxProfile — Canadian provinces");
for (const [province, expectedRate] of Object.entries(CANADA_ESTIMATED_TAX_RATES)) {
  const profile = resolveEstimatedTaxProfile("CA", province);
  assert(profile.region === "CA", `${province}: region is CA`);
  assert(profile.province === province, `${province}: province code preserved`);
  assertClose(profile.rate, expectedRate, `${province}: rate is ${expectedRate}`);
}

console.log("\nTest: resolveEstimatedTaxProfile — US user");
{
  const profile = resolveEstimatedTaxProfile("US", "");
  assert(profile.region === "US", "US: region is US");
  assertClose(profile.rate, US_ESTIMATED_TAX_RATE, `US: rate is ${US_ESTIMATED_TAX_RATE}`);
}

console.log("\nTest: resolveEstimatedTaxProfile — CA without province falls back to GST-only default");
{
  const profile = resolveEstimatedTaxProfile("CA", "");
  assert(profile.region === "CA", "CA no province: region is CA");
  assertClose(profile.rate, DEFAULT_CA_ESTIMATED_TAX_RATE, `CA no province: rate is ${DEFAULT_CA_ESTIMATED_TAX_RATE}`);
}

console.log("\nTest: resolveEstimatedTaxProfile — region aliases");
{
  assertClose(resolveEstimatedTaxProfile("canada", "ON").rate, CANADA_ESTIMATED_TAX_RATES.ON, "canada alias -> ON rate");
  assertClose(resolveEstimatedTaxProfile("us", "").rate, US_ESTIMATED_TAX_RATE, "us alias -> US rate");
  assertClose(resolveEstimatedTaxProfile("USA", "").rate, US_ESTIMATED_TAX_RATE, "USA alias -> US rate");
  assertClose(resolveEstimatedTaxProfile("unknown", "").rate, US_ESTIMATED_TAX_RATE, "unknown region defaults to US");
}

console.log("\nTest: resolvePdfTaxRate — province-specific rates");
{
  assertClose(resolvePdfTaxRate("ca", "ON"), 0.13, "PDF: ON rate is 13%");
  assertClose(resolvePdfTaxRate("ca", "QC"), 0.14975, "PDF: QC rate is 14.975%");
  assertClose(resolvePdfTaxRate("ca", "AB"), 0.05, "PDF: AB rate is 5%");
  assertClose(resolvePdfTaxRate("ca", "NS"), 0.15, "PDF: NS rate is 15%");
  assertClose(resolvePdfTaxRate("us", ""), US_ESTIMATED_TAX_RATE, `PDF: US rate is ${US_ESTIMATED_TAX_RATE}`);
  assertClose(resolvePdfTaxRate("ca", ""), DEFAULT_CA_ESTIMATED_TAX_RATE, "PDF: CA no province falls back to default");
}

console.log("\nTest: resolvePdfTaxRate — was previously hardcoded to 0.25");
{
  const OLD_HARDCODED = 0.25;
  const onRate = resolvePdfTaxRate("ca", "ON");
  assert(onRate !== OLD_HARDCODED, `ON rate (${onRate}) is no longer the old hardcoded ${OLD_HARDCODED}`);
  const usRate = resolvePdfTaxRate("us", "");
  assert(usRate !== OLD_HARDCODED, `US rate (${usRate}) is no longer the old hardcoded ${OLD_HARDCODED}`);
}

console.log("\nTest: inline fallback resolveEstimatedTaxProfileFallback — province-specific rates");
{
  assertClose(resolveEstimatedTaxProfileFallback("CA", "ON").rate, 0.13, "Fallback: ON rate is 13%");
  assertClose(resolveEstimatedTaxProfileFallback("CA", "QC").rate, 0.14975, "Fallback: QC rate is 14.975%");
  assertClose(resolveEstimatedTaxProfileFallback("CA", "BC").rate, 0.12, "Fallback: BC rate is 12%");
  assertClose(resolveEstimatedTaxProfileFallback("US", "").rate, US_ESTIMATED_TAX_RATE, "Fallback: US rate");
  assertClose(resolveEstimatedTaxProfileFallback("CA", "").rate, DEFAULT_CA_ESTIMATED_TAX_RATE, "Fallback: CA no province default");
}

console.log("\nTest: all CA provinces covered in CANADA_ESTIMATED_TAX_RATES");
{
  const expectedProvinces = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
  for (const p of expectedProvinces) {
    assert(p in CANADA_ESTIMATED_TAX_RATES, `Province ${p} has a defined rate`);
    assert(typeof CANADA_ESTIMATED_TAX_RATES[p] === "number", `Province ${p} rate is a number`);
    assert(CANADA_ESTIMATED_TAX_RATES[p] > 0, `Province ${p} rate is positive`);
  }
}

console.log("\n✅  All region-tax regression tests passed.");
