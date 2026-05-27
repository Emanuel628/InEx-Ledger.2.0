"use strict";

const REVIEW_FILTER_KEYS = new Set(["any", "nc", "um", "rs", "ml", "al", "bp", "rv", "is", "ready"]);

const REVIEW_FILTER_CODE_MAP = {
  nc: "NC",
  um: "UM",
  rs: "RS",
  ml: "ML",
  al: "AL",
  bp: "BP",
  rv: "RV",
  is: "IS"
};

function normalizeReviewFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REVIEW_FILTER_KEYS.has(normalized) ? normalized : "";
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function isMatchedReview(row) {
  return String(row.review_status || "").trim() === "matched";
}

function categoryName(row) {
  return String(row.category_name || "").trim().toLowerCase();
}

function hasReceipt(row) {
  return Number(row.receipt_count || 0) > 0;
}

function isUncategorized(row) {
  const name = categoryName(row);
  return !row.category_id || !row.category_name || /imported|needs[._-]?category|uncategorized/i.test(name);
}

function hasTaxMap(row) {
  const region = String(row.business_region || row.region || "").toUpperCase() === "CA" ? "CA" : "US";
  const taxMap = region === "CA" ? row.tax_map_ca : row.tax_map_us;
  return hasText(taxMap);
}

function hasAllocation(row) {
  const value = row.personal_use_pct;
  if (value === null || value === undefined || value === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100;
}

function computeTransactionReviewFlags(row) {
  const flags = [];
  const type = String(row.type || "").toLowerCase();
  const isIncome = type === "income";
  const isExpense = !isIncome;
  const name = categoryName(row);
  const matched = isMatchedReview(row);
  const receiptAttached = hasReceipt(row);
  const notePresent = hasText(row.note);

  if (isUncategorized(row)) {
    flags.push("NC");
  } else {
    if (!hasTaxMap(row)) {
      flags.push("UM");
    }

    if (
      (/\bvehicle\b|\bfuel\b|\bmileage\b|auto insurance/i.test(name) || row.tax_treatment === "vehicle") &&
      !receiptAttached &&
      !matched
    ) {
      flags.push("ML");
    }

    if (
      (/\bphone\b|\binternet\b|home.?office/i.test(name) || row.tax_treatment === "split_use") &&
      !hasAllocation(row)
    ) {
      flags.push("AL");
    }

    if (
      isExpense &&
      /\bmeal|\bfood\b|\bdining\b|\brestaurant\b|\btravel\b|\bairfare\b|\bhotel\b|\bentertainment\b/i.test(name) &&
      !notePresent &&
      !matched
    ) {
      flags.push("BP");
    }

    if (isExpense && !receiptAttached) {
      flags.push("RS");
    }

    if (isIncome && !receiptAttached && !notePresent && !matched) {
      flags.push("IS");
    }
  }

  if (
    row.review_status === "needs_review" &&
    !flags.some((flag) => ["NC", "UM", "RS", "ML", "AL", "BP"].includes(flag))
  ) {
    flags.push("RV");
  }

  return flags;
}

function matchesReviewFilter(row, reviewFilter) {
  const filter = normalizeReviewFilter(reviewFilter);
  if (!filter) return true;

  const flags = computeTransactionReviewFlags(row);
  const manualReview =
    row.review_status &&
    row.review_status !== "ready" &&
    row.review_status !== "matched";

  if (filter === "any") {
    return flags.length > 0 || manualReview;
  }

  if (filter === "ready") {
    return flags.length === 0 && (!row.review_status || row.review_status === "ready" || row.review_status === "matched");
  }

  const code = REVIEW_FILTER_CODE_MAP[filter];
  return code ? flags.includes(code) : true;
}

function buildReviewSummary(rows = []) {
  const summary = {
    nc: 0,
    um: 0,
    rs: 0,
    ml: 0,
    al: 0,
    bp: 0,
    rv: 0,
    is: 0,
    any: 0,
    ready: 0
  };

  for (const row of rows) {
    const flags = computeTransactionReviewFlags(row);
    const manualReview =
      row.review_status &&
      row.review_status !== "ready" &&
      row.review_status !== "matched";

    if (flags.length > 0 || manualReview) {
      summary.any += 1;
    } else {
      summary.ready += 1;
    }

    for (const [key, code] of Object.entries(REVIEW_FILTER_CODE_MAP)) {
      if (flags.includes(code)) {
        summary[key] += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  normalizeReviewFilter,
  computeTransactionReviewFlags,
  matchesReviewFilter,
  buildReviewSummary
};