"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const failOnUntranslated =
  process.argv.includes("--fail-on-untranslated") ||
  process.env.I18N_FAIL_ON_UNTRANSLATED === "1";

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "i18n.js"), "utf8");
const sandbox = {
  window: {},
  document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  CustomEvent: function CustomEvent() {},
  console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(`${source}\n;globalThis.__T__ = TRANSLATIONS;`, sandbox, { filename: "i18n.js" });

const T = sandbox.__T__;
const en = T.en;
const es = T.es;
const fr = T.fr;
const enKeys = Object.keys(en);
const esSet = new Set(Object.keys(es));
const frSet = new Set(Object.keys(fr));

const missingES = enKeys.filter((key) => !esSet.has(key));
const missingFR = enKeys.filter((key) => !frSet.has(key));
const extraES = Object.keys(es).filter((key) => !Object.prototype.hasOwnProperty.call(en, key));
const extraFR = Object.keys(fr).filter((key) => !Object.prototype.hasOwnProperty.call(en, key));

function skipTranslation(key, value) {
  if (value === "InEx Ledger" || value === "Mejor Tech LLC") return true;
  if (value.length <= 4) return true;
  if (/^https?:/.test(value)) return true;
  if (/^\$[\d]/.test(value)) return true;
  if (/^\+\$?\d/.test(value)) return true;
  if (/^\d+(\.\d+)?%?$/.test(value)) return true;
  if (/^[A-Z0-9\-\/]+$/.test(value)) return true;
  if (/^[A-Z]{2,5}\s?\([A-Z]{2,5}\)$/.test(value)) return true;
  if (/^[A-Z0-9-]+ \([A-Za-z]+\)$/.test(value)) return true;
  if (/^[a-z_]+\.(html|js|css)$/.test(value)) return true;
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(,\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})*$/.test(value)) return true;
  if (/\bexample\.com\b/.test(value)) return true;
  if (/^e\.g\./i.test(value)) return true;
  if (/\b(LLC|DBA|NAICS|CSV|PDF|MFA|YTD|GST|HST|QST|T2125|1099|Stripe|Schedule C|Pro Beta)\b/.test(value)) return true;
  if (/_(currency|tax_form|copyright|placeholder)_/.test(`_${key}_`)) return true;
  return false;
}

const sameAsEnES = enKeys.filter((key) => esSet.has(key) && es[key] === en[key] && !skipTranslation(key, en[key]));
const sameAsEnFR = enKeys.filter((key) => frSet.has(key) && fr[key] === en[key] && !skipTranslation(key, en[key]));

function printSection(title, keys, values) {
  console.log(`=== ${title} (${keys.length}) ===`);
  keys.forEach((key) => console.log(`  ${key}: ${JSON.stringify(values[key]).slice(0, 100)}`));
  console.log("");
}

console.log(`EN keys: ${enKeys.length}`);
console.log(`ES keys: ${Object.keys(es).length}`);
console.log(`FR keys: ${Object.keys(fr).length}`);
console.log("");

printSection("MISSING FROM ES", missingES, en);
printSection("MISSING FROM FR", missingFR, en);
printSection("EXTRA IN ES (not in EN)", extraES, es);
printSection("EXTRA IN FR (not in EN)", extraFR, fr);
printSection("IDENTICAL TO EN IN ES - likely untranslated", sameAsEnES, en);
printSection("IDENTICAL TO EN IN FR - likely untranslated", sameAsEnFR, en);

if (
  missingES.length ||
  missingFR.length ||
  extraES.length ||
  extraFR.length ||
  (failOnUntranslated && (sameAsEnES.length || sameAsEnFR.length))
) {
  process.exitCode = 1;
}
