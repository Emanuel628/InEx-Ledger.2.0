"use strict";
const fs = require("fs");
const vm = require("node:vm");

const source = fs.readFileSync(__dirname + "/../public/js/i18n.js", "utf8");
const sandbox = {
  window: {},
  document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  CustomEvent: function () {},
  console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source + "\n;globalThis.__T__ = TRANSLATIONS;", sandbox, { filename: "i18n.js" });

const T = sandbox.__T__;
const en = T.en, es = T.es, fr = T.fr;
const enKeys = Object.keys(en);
const esSet = new Set(Object.keys(es));
const frSet = new Set(Object.keys(fr));

const missingES = enKeys.filter(k => !esSet.has(k));
const missingFR = enKeys.filter(k => !frSet.has(k));
const extraES = Object.keys(es).filter(k => !Object.prototype.hasOwnProperty.call(en, k));
const extraFR = Object.keys(fr).filter(k => !Object.prototype.hasOwnProperty.call(en, k));

// Strings that look like they don't need translation: very short, URLs, placeholders, currency amounts, all-caps acronyms
function skipTranslation(v) {
  if (v.length <= 4) return true;
  if (/^https?:/.test(v)) return true;
  if (/^\$[\d]/.test(v)) return true;
  if (/^\d+(\.\d+)?%?$/.test(v)) return true;
  if (/^[A-Z0-9\-\/]+$/.test(v)) return true;          // acronyms/codes like CSV, PDF, MFA
  if (/^[a-z_]+\.(html|js|css)$/.test(v)) return true; // filenames
  return false;
}

const sameAsEnES = enKeys.filter(k => esSet.has(k) && es[k] === en[k] && !skipTranslation(en[k]));
const sameAsEnFR = enKeys.filter(k => frSet.has(k) && fr[k] === en[k] && !skipTranslation(en[k]));

console.log("EN keys: " + enKeys.length);
console.log("ES keys: " + Object.keys(es).length);
console.log("FR keys: " + Object.keys(fr).length);
console.log("");

console.log("=== MISSING FROM ES (" + missingES.length + ") ===");
missingES.forEach(k => console.log("  " + k + ": " + JSON.stringify(en[k]).slice(0, 100)));
console.log("");

console.log("=== MISSING FROM FR (" + missingFR.length + ") ===");
missingFR.forEach(k => console.log("  " + k + ": " + JSON.stringify(en[k]).slice(0, 100)));
console.log("");

console.log("=== EXTRA IN ES (not in EN) (" + extraES.length + ") ===");
extraES.forEach(k => console.log("  " + k + ": " + JSON.stringify(es[k]).slice(0, 100)));
console.log("");

console.log("=== EXTRA IN FR (not in EN) (" + extraFR.length + ") ===");
extraFR.forEach(k => console.log("  " + k + ": " + JSON.stringify(fr[k]).slice(0, 100)));
console.log("");

console.log("=== IDENTICAL TO EN IN ES — likely untranslated (" + sameAsEnES.length + ") ===");
sameAsEnES.forEach(k => console.log("  " + k + ": " + JSON.stringify(en[k]).slice(0, 100)));
console.log("");

console.log("=== IDENTICAL TO EN IN FR — likely untranslated (" + sameAsEnFR.length + ") ===");
sameAsEnFR.forEach(k => console.log("  " + k + ": " + JSON.stringify(en[k]).slice(0, 100)));
