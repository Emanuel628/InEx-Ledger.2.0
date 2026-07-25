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
const VISIBLE_ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP_TEXT_TAGS = new Set(["script", "style", "svg", "noscript", "template"]);
const I18N_HTML_COVERAGE_EXEMPT_FILES = new Set([
  // Public copy-heavy pages are currently translated separately or left as static SEO/legal content.
  "help.html",
  "landing.html",
  "legal.html",
  "privacy.html",
  "terms.html"
]);

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

function htmlFilesWithI18nRuntime() {
  return walkFiles(path.join(PUBLIC_DIR, "html"))
    .filter((file) => file.endsWith(".html"))
    .filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /<script\b[^>]*\bi18n\.js\b/i.test(source);
    })
    .filter((file) => !I18N_HTML_COVERAGE_EXEMPT_FILES.has(path.basename(file)));
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, "-")
    .replace(/&ndash;/gi, "-")
    .replace(/&hellip;/gi, "...")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function normalizeVisibleCopy(value) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function isEnglishLikeCopy(value) {
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^\{[{%].*[}%]\}$/.test(value)) return false;
  if (/^[A-Z]{2,6}$/.test(value)) return false;
  if (/^[A-Z0-9][A-Z0-9 .:/_-]{0,12}$/.test(value) && !/\s/.test(value)) return false;
  return true;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function parseTag(token) {
  const match = token.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
  if (!match) return null;

  const isClosing = /^<\//.test(token);
  const isSelfClosing = /\/\s*>$/.test(token);
  const tag = match[1].toLowerCase();
  const attrs = {};
  const attrSource = token
    .replace(/^<\/?\s*[a-zA-Z0-9-]+/, "")
    .replace(/\/?\s*>$/, "");

  for (const attrMatch of attrSource.matchAll(/([:@a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[attrMatch[1].toLowerCase()] = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
  }

  return { tag, attrs, isClosing, isSelfClosing };
}

function hasI18nAttribute(attrs) {
  return Object.keys(attrs).some((attr) => attr === "data-i18n" || attr.startsWith("data-i18n-"));
}

function hasI18nForVisibleAttr(attrs, attr) {
  return Boolean(attrs[`data-i18n-${attr}`]);
}

function hasVisibleValueAttr(tag, attrs) {
  if (tag !== "input" || !attrs.value) return false;
  return ["button", "submit", "reset"].includes((attrs.type || "text").toLowerCase());
}

function createI18nOffender(file, line, value, context) {
  const relativeFile = path.relative(ROOT, file).replace(/\\/g, "/");
  return {
    signature: `${relativeFile}|${context}|${value}`,
    message: `${relativeFile}:${line} ${context}: "${value}"`
  };
}

function findUntaggedEnglishInHtml(file) {
  const source = fs.readFileSync(file, "utf8");
  const offenders = [];
  const stack = [];
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
  const tokenRegex = /<\/?[^>]+>|[^<]+/g;

  for (const match of withoutComments.matchAll(tokenRegex)) {
    const token = match[0];
    const index = match.index;

    if (token.startsWith("<")) {
      const parsed = parseTag(token);
      if (!parsed) continue;

      if (parsed.isClosing) {
        const stackIndex = stack.map((entry) => entry.tag).lastIndexOf(parsed.tag);
        if (stackIndex >= 0) stack.splice(stackIndex);
        continue;
      }

      const parentCovered = stack.some((entry) => entry.hasI18n);
      const hasElementI18n = hasI18nAttribute(parsed.attrs);

      for (const attr of VISIBLE_ATTRS) {
        const value = normalizeVisibleCopy(parsed.attrs[attr] || "");
        if (!value || !isEnglishLikeCopy(value)) continue;
        if (hasI18nForVisibleAttr(parsed.attrs, attr)) continue;
        offenders.push(createI18nOffender(file, lineNumberAt(source, index), value, `${parsed.tag}[${attr}]`));
      }

      if (hasVisibleValueAttr(parsed.tag, parsed.attrs)) {
        const value = normalizeVisibleCopy(parsed.attrs.value || "");
        if (value && isEnglishLikeCopy(value) && !hasI18nForVisibleAttr(parsed.attrs, "value")) {
          offenders.push(createI18nOffender(file, lineNumberAt(source, index), value, `${parsed.tag}[value]`));
        }
      }

      if (!parsed.isSelfClosing && !["meta", "link", "img", "input", "br", "hr"].includes(parsed.tag)) {
        stack.push({ tag: parsed.tag, hasI18n: hasElementI18n || parentCovered });
      }
      continue;
    }

    const value = normalizeVisibleCopy(token);
    if (!value || !isEnglishLikeCopy(value)) continue;
    if (stack.some((entry) => SKIP_TEXT_TAGS.has(entry.tag) || entry.hasI18n)) continue;
    offenders.push(createI18nOffender(file, lineNumberAt(source, index), value, "text"));
  }

  return offenders;
}

function findMojibakeMatches(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const suspicious = [
    "Ã",
    "Â",
    "â€™",
    "â€œ",
    "â€",
    "â€¦",
    "â€”",
    "â€“",
    "â€¢",
    "ðŸ"
  ];

  return suspicious.filter((token) => source.includes(token));
}

test("frontend i18n keys referenced by public files exist in every shipped language", () => {
  const defined = extractDefinedKeys();
  const used = extractUsedKeys();

  for (const lang of LANGS) {
    const missing = used.filter((key) => !defined[lang].has(key));
    assert.deepEqual(missing, [], `missing ${lang} translation keys:\n${missing.join("\n")}`);
  }
});

test("public i18n assets do not contain mojibake markers", () => {
  const files = [I18N_PATH, ...walkFiles(PUBLIC_DIR)];
  const offenders = [];

  for (const file of files) {
    const matches = findMojibakeMatches(file);
    if (matches.length) {
      offenders.push(`${path.relative(ROOT, file)} -> ${matches.join(", ")}`);
    }
  }

  assert.deepEqual(offenders, [], `found mojibake markers:\n${offenders.join("\n")}`);
});

test("i18n-enabled HTML does not ship untagged English copy", () => {
  const offenders = htmlFilesWithI18nRuntime().flatMap(findUntaggedEnglishInHtml).map((offender) => offender.message);

  assert.deepEqual(
    offenders,
    [],
    [
      "found visible English copy without data-i18n coverage",
      "Add data-i18n/data-i18n-placeholder/data-i18n-aria-label/data-i18n-title, or add an explicit allowlist entry for intentional static copy.",
      ...offenders
    ].join("\n")
  );
});
