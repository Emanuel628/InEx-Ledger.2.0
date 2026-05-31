"use strict";

const { __private: { buildTransactionStatus } } = require("./pdfGeneratorService.js");

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

function normalizeRegion(row) {
  return String(row.business_region || row.region || "").toUpperCase() === "CA" ? "CA" : "US";
}

function hasAllocation(row) {
  const value = row.personal_use_pct;
  if (value === null || value === undefined || value === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100;
}

function buildReviewStatus(row) {
  const receiptCount = Number(row.receipt_count || 0);
  const txn = {
    ...row,
    receipt_id: row.receipt_id || row.receiptId || (receiptCount > 0 ? "__review_receipt__" : null)
  };
  const category = row.category_id || row.category_name
    ? {
      id: row.category_id || row.categoryId || null,
      name: row.category_name || row.categoryName || null,
      tax_map_us: row.tax_map_us ?? null,
      tax_map_ca: row.tax_map_ca ?? null
    }
    : null;

  return buildTransactionStatus(txn, category, {
    region: normalizeRegion(row)
  });
}

function computeTransactionReviewFlags(row) {
  const type = String(row.type || "").toLowerCase();
  const isIncome = type === "income";
  const matched = isMatchedReview(row);
  const notePresent = hasText(row.note);
  const status = buildReviewStatus(row);
  const flags = status.flags.filter((flag) => ["NC", "UM", "RS", "ML", "AL", "BP", "RV"].includes(flag));

  if (matched) {
    ["ML", "BP"].forEach((flag) => {
      const index = flags.indexOf(flag);
      if (index !== -1) flags.splice(index, 1);
    });
  }

  if (isIncome && !flags.includes("NC") && !hasReceipt(row) && !notePresent && !matched) {
    flags.push("IS");
  }

  const normalizedName = categoryName(row);
  const storedTaxMap = normalizeRegion(row) === "CA" ? row.tax_map_ca : row.tax_map_us;
  if (
    /imported|needs[._-]?category|uncategorized/i.test(normalizedName) &&
    hasText(storedTaxMap)
  ) {
    const unmappedIndex = flags.indexOf("UM");
    if (unmappedIndex !== -1) flags.splice(unmappedIndex, 1);
  }

  if (
    status.categorySlug === "phone_internet" &&
    !hasAllocation(row) &&
    !flags.includes("AL")
  ) {
    flags.push("AL");
  }

  if (
    row.review_status === "needs_review" &&
    !flags.some((flag) => ["NC", "UM", "RS", "ML", "AL", "BP"].includes(flag))
    && !flags.includes("RV")
  ) {
    flags.push("RV");
  }

  return Array.from(new Set(flags));
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
