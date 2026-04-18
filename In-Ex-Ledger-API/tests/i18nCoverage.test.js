"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const I18N_PATH = path.join(PUBLIC_DIR, "js", "i18n.js");
const LANGS = ["en", "es", "fr"];

function walkFiles(dir, collected = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, collected);
      continue;
    }
    if (/\.(html|js)$/.test(entry.name)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

function extractDefinedKeys() {
  const source = fs.readFileSync(I18N_PATH, "utf8");
  const sandbox = {
    window: {},
    document: {
      documentElement: {},
      querySelectorAll: () => [],
      addEventListener() {}
    },
    localStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {}
    },
    CustomEvent: function CustomEvent() {},
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;globalThis.__TEST_TRANSLATIONS__ = TRANSLATIONS;`, sandbox, {
    filename: "i18n.js"
  });

  const defined = {};
  const translations = sandbox.__TEST_TRANSLATIONS__;
  assert.ok(translations, "translations should be loaded from i18n.js");
  for (const lang of LANGS) {
    defined[lang] = new Set(Object.keys(translations[lang] || {}));
  }
  return defined;
}

function extractUsedKeys() {
  const used = new Set();
  const files = walkFiles(PUBLIC_DIR);

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([a-zA-Z0-9_]+)"/g)) {
      used.add(match[1]);
    }
    for (const match of source.matchAll(/\b(?:t|tx|txT)\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)) {
      used.add(match[1]);
    }
  }

  return [...used].sort();
}

test("frontend i18n keys referenced by public files exist in every shipped language", () => {
  const defined = extractDefinedKeys();
  const used = extractUsedKeys();

  for (const lang of LANGS) {
    const missing = used.filter((key) => !defined[lang].has(key));
    assert.deepEqual(missing, [], `missing ${lang} translation keys:\n${missing.join("\n")}`);
  }
});
