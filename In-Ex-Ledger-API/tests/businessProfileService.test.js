"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAppUrl,
  normalizeBillingCurrency,
  normalizeBillingInterval,
  normalizeOptionalBillingInterval,
  normalizeOptionalCurrency,
  formatBillingCurrencyAmount,
  normalizeBusinessPayload,
  normalizeOptionalTrimmedString,
  normalizeBusinessProfileRow,
  buildBusinessLimitError
} = require("../services/businessProfileService.js");

function withAppBaseUrl(value, fn) {
  const original = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = value;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = original;
    }
  }
}

test("buildAppUrl joins a path onto the configured base and normalizes the legacy apex domain", () => {
  withAppBaseUrl("https://inexledger.com", () => {
    assert.equal(buildAppUrl("/subscription"), "https://www.inexledger.com/subscription");
    assert.equal(buildAppUrl("subscription"), "https://www.inexledger.com/subscription");
  });
  withAppBaseUrl("https://app.inexledger.test/", () => {
    assert.equal(buildAppUrl("/subscription"), "https://app.inexledger.test/subscription");
  });
});

test("buildAppUrl throws when APP_BASE_URL is unconfigured or non-HTTPS on a non-local host", () => {
  withAppBaseUrl("", () => {
    assert.throws(() => buildAppUrl("/x"), /APP_BASE_URL is not configured/);
  });
  withAppBaseUrl("http://example.com", () => {
    assert.throws(() => buildAppUrl("/x"), /must use HTTPS/);
  });
});

test("buildAppUrl allows plain HTTP on localhost", () => {
  withAppBaseUrl("http://localhost:3000", () => {
    assert.equal(buildAppUrl("/x"), "http://localhost:3000/x");
  });
});

test("normalizeBillingCurrency defaults to usd and only recognizes cad as an override", () => {
  assert.equal(normalizeBillingCurrency(undefined), "usd");
  assert.equal(normalizeBillingCurrency("CAD"), "cad");
  assert.equal(normalizeBillingCurrency("eur"), "usd");
});

test("normalizeBillingInterval defaults to monthly and only recognizes yearly as an override", () => {
  assert.equal(normalizeBillingInterval(undefined), "monthly");
  assert.equal(normalizeBillingInterval("YEARLY"), "yearly");
  assert.equal(normalizeBillingInterval("weekly"), "monthly");
});

test("normalizeOptionalBillingInterval/Currency return null instead of a default for unrecognized input", () => {
  assert.equal(normalizeOptionalBillingInterval(""), null);
  assert.equal(normalizeOptionalBillingInterval("weekly"), null);
  assert.equal(normalizeOptionalBillingInterval("yearly"), "yearly");
  assert.equal(normalizeOptionalCurrency(""), null);
  assert.equal(normalizeOptionalCurrency("eur"), null);
  assert.equal(normalizeOptionalCurrency("CAD"), "cad");
});

test("formatBillingCurrencyAmount formats whole and fractional amounts per currency locale", () => {
  assert.equal(formatBillingCurrencyAmount(29, "usd"), "$29");
  assert.equal(formatBillingCurrencyAmount(29.5, "usd"), "$29.50");
  assert.equal(formatBillingCurrencyAmount(29, "cad"), "$29");
  assert.equal(formatBillingCurrencyAmount(undefined, "usd"), "$0");
});

test("normalizeBusinessPayload validates name/region/language and rejects bad input", () => {
  assert.deepEqual(normalizeBusinessPayload({ name: "Acme", region: "ca", language: "FR" }), {
    valid: true,
    normalized: { name: "Acme", region: "CA", language: "fr" }
  });
  assert.equal(normalizeBusinessPayload({ name: "" }).valid, false);
  assert.equal(normalizeBusinessPayload({ name: "Acme", region: "MX" }).valid, false);
  assert.equal(normalizeBusinessPayload({ name: "Acme", language: "de" }).valid, false);
});

test("normalizeBusinessPayload defaults region to US and language to en", () => {
  assert.deepEqual(normalizeBusinessPayload({ name: "Acme" }), {
    valid: true,
    normalized: { name: "Acme", region: "US", language: "en" }
  });
});

test("normalizeOptionalTrimmedString trims strings and rejects non-strings/empty input", () => {
  assert.equal(normalizeOptionalTrimmedString("  hi  "), "hi");
  assert.equal(normalizeOptionalTrimmedString("   "), null);
  assert.equal(normalizeOptionalTrimmedString(""), null);
  assert.equal(normalizeOptionalTrimmedString(undefined), null);
  assert.equal(normalizeOptionalTrimmedString(42), null);
});

test("normalizeBusinessProfileRow returns null for a missing row", () => {
  assert.equal(normalizeBusinessProfileRow(null), null);
});

test("normalizeBusinessProfileRow decrypts tax_id/gst_hst_number and fills in defaults", () => {
  const row = normalizeBusinessProfileRow({
    id: "biz_1",
    name: "Acme",
    tax_id: null,
    gst_hst_number: null,
    gst_hst_registered: true,
    material_participation: true
  });

  assert.equal(row.id, "biz_1");
  assert.equal(row.tax_id, null);
  assert.equal(row.gst_hst_number, null);
  assert.equal(row.contact_full_name, "");
  assert.equal(row.business_type, null);
  assert.equal(row.gst_hst_registered, true);
  assert.equal(row.material_participation, true);
});

test("normalizeBusinessProfileRow coerces a non-boolean material_participation to null", () => {
  const row = normalizeBusinessProfileRow({ material_participation: "yes" });
  assert.equal(row.material_participation, null);
});

test("buildBusinessLimitError distinguishes Pro-plan vs upgrade-needed copy", () => {
  assert.match(
    buildBusinessLimitError({ effectiveTier: "v1" }, 1),
    /Pro plan currently includes 1 business/
  );
  assert.match(
    buildBusinessLimitError({ effectiveTier: "v1" }, 3),
    /Pro plan currently allows up to 3 businesses/
  );
  assert.match(
    buildBusinessLimitError({ effectiveTier: "free" }, 1),
    /Upgrade to Pro and add an additional business slot/
  );
  assert.match(
    buildBusinessLimitError(null, 3),
    /Upgrade your business access in Subscription/
  );
});
