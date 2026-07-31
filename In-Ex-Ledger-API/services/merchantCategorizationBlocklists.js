"use strict";

// Shared between transactionCategorizationService.js (auto-map scoring) and
// transactionMappingRuleService.js (learn-on-edit), so a single list governs
// both "never auto-map a category" and "never silently learn a rule for"
// ambiguous, multi-product retailers and convenience-store chains. One
// receipt from any of these can be groceries, electronics, fuel, or office
// goods -- guessing any single expense category for them is a confidently
// wrong answer, not a helpful one. They stay in Imported for manual review
// unless the business has an explicit saved mapping rule.
//
// Amazon is deliberately NOT in this list even though it's the same class of
// merchant: no expense-category keyword anywhere in this codebase references
// bare "amazon", so it already falls through to Imported with zero risk.
// Adding it here would require a carve-out for legitimate keyword hits like
// "Amazon Web Services" (Software & Subscriptions), which isn't worth the
// added complexity for a case that's already handled correctly.
const AMBIGUOUS_RETAILERS = [
  "walmart", "wal mart", "wm supercenter", "target",
  "costco", "costco wholesale", "sams club",
  "canadian tire", "best buy", "ikea",
  "7 eleven", "circle k", "wawa", "sheetz", "kum go", "caseys",
  "royal farms", "getgo", "stewarts shops", "cumberland farms",
  "kwik star", "kwik trip", "racetrac", "murphy usa", "murphy express",
  "quiktrip", "maverik", "loves country store", "rutters"
];

// If any of these appear alongside a blocklisted retailer's name, the
// transaction is unambiguously a fuel purchase (e.g. "Costco Gas", "Sheetz
// Fuel", "Canadian Tire Gas Bar") and normal keyword scoring should be
// allowed to run instead of forcing Imported.
const FUEL_CONTEXT_HINTS = ["gas", "gas station", "gas bar", "fuel", "diesel"];

function normalizeForBlocklistMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalizedText) {
  return normalizedText ? normalizedText.split(" ").filter(Boolean) : [];
}

function containsPhrase(tokens, compactText, phrase) {
  // The phrase must go through the same normalization as the text being
  // checked (e.g. "7 eleven" has its digit stripped, same as "7-Eleven" in
  // real merchant text) -- otherwise a phrase and the text it's meant to
  // match can normalize to different token sets and silently never match.
  const phraseTokens = tokenize(normalizeForBlocklistMatch(phrase));
  if (phraseTokens.length > 1) {
    for (let start = 0; start <= tokens.length - phraseTokens.length; start++) {
      if (phraseTokens.every((word, offset) => tokens[start + offset] === word)) return true;
    }
    return false;
  }
  const [word] = phraseTokens;
  if (tokens.includes(word)) return true;
  return word.length >= 5 && compactText.includes(word);
}

function textMatchesAny(tokens, compactText, phrases) {
  return phrases.some((phrase) => containsPhrase(tokens, compactText, phrase));
}

function isAmbiguousRetailerText(...rawValues) {
  const normalized = normalizeForBlocklistMatch(rawValues.join(" "));
  if (!normalized) return false;
  const tokens = tokenize(normalized);
  const compact = normalized.replace(/\s+/g, "");
  if (!textMatchesAny(tokens, compact, AMBIGUOUS_RETAILERS)) return false;
  return !textMatchesAny(tokens, compact, FUEL_CONTEXT_HINTS);
}

module.exports = {
  AMBIGUOUS_RETAILERS,
  FUEL_CONTEXT_HINTS,
  isAmbiguousRetailerText
};
