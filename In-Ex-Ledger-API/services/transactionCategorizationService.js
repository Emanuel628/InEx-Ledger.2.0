"use strict";

const { findDefaultCategoryForRegion } = require("../api/utils/seedDefaultsForBusiness.js");
const { normalizeRuleValue } = require("./transactionMappingRuleService.js");

const MAX_HISTORY_ROWS = 4000;
const IMPORTED_CATEGORY_NAMES = {
  income: "Imported Income",
  expense: "Imported Expense"
};
const LOW_SIGNAL_HISTORY_KEYS = new Set([
  "payment",
  "deposit",
  "purchase",
  "transfer",
  "withdrawal",
  "debit",
  "credit",
  "online payment",
  "card payment",
  "bank transfer",
  "direct deposit",
  "thank you"
]);

const REVIEW_ONLY_PATTERNS = [
  /\bonline payment thank you\b/i,
  /\bcredit card payment\b/i,
  /\btransfer (to|from)\b/i,
  /\bpayment to card\b/i,
  /\bloan payment\b/i,
  /\baffirm\b/i,
  /\bafterpay\b/i,
  /\bklarna\b/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
  /\badp\b/i,
  /\bpaychex\b/i,
  /\birs tax refund\b/i,
  /\bcra tax refund\b/i,
  /\bcash back\b/i,
  /\bredemption\b/i
];

const CATEGORY_RULES = [
  {
    kind: "income",
    usCategory: "Service Income",
    caCategory: "Service Income",
    keywords: [
      "consulting fee", "consultant fee", "service fee", "freelance fee", "retainer fee",
      "project fee", "client payment", "invoice payment", "payment received",
      "stripe", "paypal", "square", "direct deposit client", "billable"
    ],
    providerHints: ["income", "service", "professional_services", "business_services"]
  },
  {
    kind: "income",
    usCategory: "Sales Revenue",
    caCategory: "Sales Revenue",
    keywords: [
      "shopify", "amazon seller", "etsy", "ebay sale", "point of sale", "store sale",
      "retail sale", "sales receipt", "product sale", "merchant payout"
    ],
    providerHints: ["general_merchandise", "shopping", "retail", "sales"]
  },
  {
    kind: "income",
    usCategory: "Interest Income",
    caCategory: "Other Income",
    keywords: ["interest paid", "interest income", "bank interest", "savings interest"],
    providerHints: ["interest"]
  },
  {
    kind: "expense",
    usCategory: "Advertising & Marketing",
    caCategory: "Advertising",
    keywords: [
      "google ads", "google adwords", "facebook ads", "meta ads", "instagram ads",
      "tiktok ads", "linkedin ads", "bing ads", "mailchimp", "klaviyo",
      "activecampaign", "ad spend", "marketing"
    ],
    providerHints: ["advertising", "marketing"]
  },
  {
    kind: "expense",
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "adobe", "github", "slack", "zoom", "dropbox", "google workspace",
      "notion", "figma", "canva", "aws", "digitalocean", "cloudflare", "twilio",
      "sendgrid", "openai", "anthropic", "subscription", "saas", "software"
    ],
    providerHints: ["software", "internet_software", "digital_goods"]
  },
  {
    kind: "expense",
    usCategory: "Phone & Internet",
    caCategory: "Phone & Internet",
    keywords: [
      "rogers", "bell canada", "telus", "fido", "koodo", "shaw", "videotron",
      "at&t", "att wireless", "verizon", "t-mobile", "tmobile", "comcast",
      "xfinity", "spectrum", "cox communication", "google fi", "internet service",
      "wireless service", "cell phone", "phone", "internet"
    ],
    providerHints: ["telecom", "utilities"]
  },
  {
    kind: "expense",
    usCategory: "Insurance",
    caCategory: "Insurance",
    keywords: [
      "allstate", "state farm", "geico", "progressive", "farmers insurance",
      "liberty mutual", "usaa", "intact insurance", "co-operators", "aviva",
      "insurance premium", "insurance payment"
    ],
    providerHints: ["insurance"]
  },
  {
    kind: "expense",
    usCategory: "Office Supplies",
    caCategory: "Office Supplies",
    keywords: [
      "staples", "office depot", "officemax", "uline", "printer ink", "printer paper",
      "stationery", "toner cartridge", "office supplies"
    ],
    providerHints: ["office_supplies", "general_merchandise"]
  },
  {
    kind: "expense",
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "restaurant", "coffee", "cafe", "pizza", "burger", "ubereats", "doordash",
      "skip the dishes", "grubhub", "client lunch", "meal", "food", "dining"
    ],
    providerHints: ["food", "restaurant", "dining"]
  },
  {
    kind: "expense",
    usCategory: "Travel",
    caCategory: "Travel",
    keywords: [
      "airbnb", "marriott", "hilton", "hyatt", "westjet", "air canada",
      "american airlines", "delta air", "united airlines", "expedia", "booking.com",
      "kayak", "hotel", "airfare", "flight", "business trip", "conference travel"
    ],
    providerHints: ["travel", "lodging", "airfare", "transportation"]
  },
  {
    kind: "expense",
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "shell", "chevron", "esso", "petro canada", "gas station", "fuel", "gas",
      "jiffy lube", "valvoline", "autozone", "napa auto", "parking meter", "parking lot",
      "auto repair", "oil change", "vehicle"
    ],
    providerHints: ["automotive", "gas", "fuel", "vehicle"]
  },
  {
    kind: "expense",
    usCategory: "Legal & Professional",
    caCategory: "Legal & Accounting Fees",
    keywords: [
      "accounting fee", "bookkeeping", "bookkeeper", "cpa fee", "lawyer fee",
      "legal fee", "professional fee", "law firm", "attorney", "accountant", "notary"
    ],
    providerHints: ["legal", "accounting", "professional_services"]
  },
  {
    kind: "expense",
    usCategory: "Contract Labor",
    caCategory: "Legal & Accounting Fees",
    keywords: [
      "upwork", "toptal", "99designs", "freelance payment", "contractor payment",
      "subcontractor", "contract labor"
    ],
    providerHints: ["contractor", "freelance", "labor"]
  },
  {
    kind: "expense",
    usCategory: "Bank Fees",
    caCategory: "Interest & Bank Charges",
    keywords: [
      "bank fee", "service fee", "monthly fee", "nsf fee", "overdraft fee",
      "wire fee", "atm fee"
    ],
    providerHints: ["bank_fees", "fees"]
  },
  {
    kind: "expense",
    usCategory: "Rent",
    caCategory: "Rent",
    keywords: ["rent payment", "lease payment", "monthly rent", "office rent"],
    providerHints: ["rent"]
  },
  {
    kind: "expense",
    usCategory: "Utilities",
    caCategory: "Utilities",
    keywords: [
      "hydro", "bc hydro", "enbridge", "atco gas", "fortis", "epcor", "alectra",
      "electric utility", "natural gas utility", "water utility", "sewage"
    ],
    providerHints: ["utilities", "electric", "water", "gas"]
  },
  {
    kind: "expense",
    usCategory: "Sales Tax",
    caCategory: "Business Tax & Licenses",
    keywords: [
      "business license", "permit fee", "service ontario", "service canada",
      "sales tax remittance", "hst payment", "gst payment", "property tax"
    ],
    providerHints: ["tax", "government"]
  }
];

function normalizeMappingText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\b(checkcard|pos|debit|credit|purchase|payment|online|withdrawal|transfer)\b/g, " ")
    .replace(/[#*x]{1,}\d+/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isImportedPlaceholderCategory(name) {
  return /^(imported income|imported expense)$/i.test(String(name || "").trim());
}

function isLowSignalHistoryKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return true;
  if (normalized.length < 5) return true;
  return LOW_SIGNAL_HISTORY_KEYS.has(normalized);
}

function buildCategoryLookup(categories = []) {
  const lookup = new Map();
  for (const category of categories) {
    if (!category?.id || !category?.name || !category?.kind) continue;
    const key = `${String(category.kind).toLowerCase()}::${String(category.name).trim().toLowerCase()}`;
    lookup.set(key, category);
  }
  return lookup;
}

function buildRuleIndex(rules = []) {
  const index = new Map();
  for (const rule of rules) {
    if (!rule?.category_name || !rule?.transaction_kind || !rule?.match_field || !rule?.match_value_normalized) continue;
    const key = `${String(rule.transaction_kind).toLowerCase()}::${String(rule.match_field).toLowerCase()}::${String(rule.match_value_normalized).trim()}`;
    index.set(key, rule.category_name);
  }
  return index;
}

function recordHistorySignal(targetMap, key, categoryName, kind) {
  if (!key || !categoryName || !kind) return;
  const scopedKey = `${kind}::${key}`;
  const bucket = targetMap.get(scopedKey) || new Map();
  bucket.set(categoryName, (bucket.get(categoryName) || 0) + 1);
  targetMap.set(scopedKey, bucket);
}

function selectHistoryWinner(bucket) {
  if (!bucket || bucket.size === 0) return null;
  const ranked = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
  const [winnerName, winnerCount] = ranked[0];
  const runnerUpCount = ranked[1]?.[1] || 0;
  if (winnerCount === 1 && ranked.length > 1) return null;
  if (runnerUpCount > 0 && winnerCount < runnerUpCount * 1.5) return null;
  return winnerName;
}

function buildHistoryIndex(rows = []) {
  const merchantHistory = new Map();
  const descriptionHistory = new Map();

  for (const row of rows) {
    const kind = String(row?.category_kind || "").toLowerCase();
    if (!row?.category_name || isImportedPlaceholderCategory(row.category_name)) continue;
    if (kind !== "income" && kind !== "expense") continue;
    const merchantKey = normalizeMappingText(row.merchant_name);
    const descriptionKey = normalizeMappingText(row.description);
    if (!isLowSignalHistoryKey(merchantKey)) {
      recordHistorySignal(merchantHistory, merchantKey, row.category_name, kind);
    }
    if (!isLowSignalHistoryKey(descriptionKey)) {
      recordHistorySignal(descriptionHistory, descriptionKey, row.category_name, kind);
    }
  }

  return { merchantHistory, descriptionHistory };
}

function pickRuleCategoryName(rule, region) {
  return String(region || "").toUpperCase() === "CA" ? rule.caCategory : rule.usCategory;
}

function resolveCanonicalCategoryTemplate(name, kind, region) {
  const matchedDefault = findDefaultCategoryForRegion(region, name, kind);
  if (matchedDefault) {
    return {
      color: matchedDefault.color || null,
      tax_map_us: matchedDefault.tax_map_us || null,
      tax_map_ca: matchedDefault.tax_map_ca || null
    };
  }

  const normalizedRegion = String(region || "").toUpperCase() === "CA" ? "CA" : "US";
  if (kind === "income") {
    return normalizedRegion === "CA"
      ? { color: "slate", tax_map_us: null, tax_map_ca: "other_income" }
      : { color: "slate", tax_map_us: "other_income", tax_map_ca: null };
  }

  return normalizedRegion === "CA"
    ? { color: "slate", tax_map_us: null, tax_map_ca: "other_expense" }
    : { color: "slate", tax_map_us: "other_expense", tax_map_ca: null };
}

function getImportedFallbackCategoryName(kind) {
  return kind === "income" ? IMPORTED_CATEGORY_NAMES.income : IMPORTED_CATEGORY_NAMES.expense;
}

function categoryExists(categoryLookup, kind, name) {
  return categoryLookup.has(`${kind}::${String(name || "").trim().toLowerCase()}`);
}

function scoreRule(rule, { haystack, providerHintText }) {
  let score = 0;
  for (const keyword of rule.keywords || []) {
    if (haystack.includes(keyword)) {
      score += keyword.includes(" ") ? 3 : 2;
    }
  }
  for (const hint of rule.providerHints || []) {
    if (providerHintText.includes(hint)) {
      score += 2;
    }
  }
  return score;
}

function createTransactionCategorizer({ categories = [], region = "US", historyRows = [], mappingRules = [] } = {}) {
  const categoryLookup = buildCategoryLookup(categories);
  const { merchantHistory, descriptionHistory } = buildHistoryIndex(historyRows);
  const ruleIndex = buildRuleIndex(mappingRules);

  return function categorizeTransaction({
    type,
    description,
    merchantName,
    categoryGuess
  } = {}) {
    const kind = String(type || "").toLowerCase() === "income" ? "income" : "expense";
    const rawDescription = String(description || "");
    const rawMerchant = String(merchantName || "");
    const merchantKey = normalizeMappingText(rawMerchant);
    const descriptionKey = normalizeMappingText(rawDescription);
    const merchantRuleKey = normalizeRuleValue(rawMerchant);
    const descriptionRuleKey = normalizeRuleValue(rawDescription);
    const categoryGuessKey = normalizeRuleValue(categoryGuess);
    const haystack = `${rawMerchant} ${rawDescription} ${String(categoryGuess || "")}`.toLowerCase();
    const providerHintText = normalizeMappingText(categoryGuess);

    const explicitRuleCategory =
      ruleIndex.get(`${kind}::merchant_name::${merchantKey}`)
      || ruleIndex.get(`${kind}::merchant_name::${merchantRuleKey}`)
      || ruleIndex.get(`${kind}::category_guess::${categoryGuessKey}`)
      || ruleIndex.get(`${kind}::description::${descriptionKey}`)
      || ruleIndex.get(`${kind}::description::${descriptionRuleKey}`);
    if (explicitRuleCategory && categoryExists(categoryLookup, kind, explicitRuleCategory)) {
      return { categoryName: explicitRuleCategory, reason: "mapping_rule", confidence: "high" };
    }

    const learnedMerchantCategory = selectHistoryWinner(merchantHistory.get(`${kind}::${merchantKey}`));
    if (learnedMerchantCategory && categoryExists(categoryLookup, kind, learnedMerchantCategory)) {
      return { categoryName: learnedMerchantCategory, reason: "merchant_history", confidence: "high" };
    }

    const learnedDescriptionCategory = selectHistoryWinner(descriptionHistory.get(`${kind}::${descriptionKey}`));
    if (learnedDescriptionCategory && categoryExists(categoryLookup, kind, learnedDescriptionCategory)) {
      return { categoryName: learnedDescriptionCategory, reason: "description_history", confidence: "medium" };
    }

    if (REVIEW_ONLY_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "review_only_pattern",
        confidence: "low"
      };
    }

    let bestRule = null;
    let bestScore = 0;
    let secondBestScore = 0;
    for (const rule of CATEGORY_RULES) {
      if (rule.kind !== kind) continue;
      const score = scoreRule(rule, { haystack, providerHintText });
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestRule = rule;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    if (bestRule && bestScore >= 3 && bestScore > secondBestScore) {
      const categoryName = pickRuleCategoryName(bestRule, region);
      return {
        categoryName,
        reason: "canonical_rule",
        confidence: bestScore >= 5 ? "high" : "medium"
      };
    }

    return {
      categoryName: getImportedFallbackCategoryName(kind),
      reason: "fallback_imported",
      confidence: "low"
    };
  };
}

async function buildBusinessTransactionCategorizer(pool, { businessId, region = "US" } = {}) {
  const [categoriesResult, historyResult, rulesResult] = await Promise.all([
    pool.query(
      `SELECT id, name, kind, color, tax_map_us, tax_map_ca, is_active
         FROM categories
        WHERE business_id = $1
          AND is_active = true`,
      [businessId]
    ),
    pool.query(
      `SELECT t.category_id,
              c.name AS category_name,
              c.kind AS category_kind,
              t.description,
              t.merchant_name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1
          AND t.deleted_at IS NULL
          AND t.category_id IS NOT NULL
          AND c.is_active = true
          AND (
            COALESCE(t.import_source, '') = ''
            OR t.review_status IN ('ready', 'matched', 'locked')
          )
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT $2`,
      [businessId, MAX_HISTORY_ROWS]
    ),
    pool.query(
      `SELECT r.transaction_kind,
              r.match_field,
              r.match_value_normalized,
              c.name AS category_name
         FROM transaction_mapping_rules r
         JOIN categories c ON c.id = r.category_id
        WHERE r.business_id = $1
          AND c.is_active = true`,
      [businessId]
    )
  ]);

  return createTransactionCategorizer({
    categories: categoriesResult.rows,
    region,
    historyRows: historyResult.rows,
    mappingRules: rulesResult.rows
  });
}

module.exports = {
  buildBusinessTransactionCategorizer,
  createTransactionCategorizer,
  resolveCanonicalCategoryTemplate,
  getImportedFallbackCategoryName,
  __private: {
    normalizeMappingText,
    buildHistoryIndex,
    selectHistoryWinner,
    buildCategoryLookup,
    buildRuleIndex
  }
};
