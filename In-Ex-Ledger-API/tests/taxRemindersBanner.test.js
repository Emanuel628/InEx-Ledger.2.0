"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// June 1, 2026 — 14 days before the US Q2 (June 15) estimated-tax deadline, so
// the reminder banner renders deterministically regardless of the wall clock.
const FIXED_NOW = new Date(2026, 5, 1);

class FakeDate extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(FIXED_NOW.getTime());
    } else {
      super(...args);
    }
  }
  static now() {
    return FIXED_NOW.getTime();
  }
}

function makeNode(tag) {
  return {
    tag,
    className: "",
    dataset: {},
    children: [],
    firstChild: null,
    textContent: "",
    setAttribute() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      this.firstChild = this.children[0];
      return child;
    },
    insertBefore(child) {
      this.children.unshift(child);
      this.firstChild = this.children[0];
      return child;
    },
    querySelector() {
      return null;
    },
    remove() {}
  };
}

function collectText(node) {
  if (!node) return "";
  if (Array.isArray(node.children) && node.children.length) {
    return node.children.map(collectText).join("");
  }
  return node.textContent || "";
}

function loadBanner() {
  const scriptPath = path.resolve(__dirname, "..", "public/js/taxReminders.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const taxOwed = makeNode("div");
  taxOwed.textContent = "$0.00";
  const created = [];

  const documentStub = {
    readyState: "complete",
    getElementById(id) {
      return id === "taxOwed" ? taxOwed : null;
    },
    querySelector() {
      return null;
    },
    createElement(tag) {
      const node = makeNode(tag);
      created.push(node);
      return node;
    },
    createTextNode(textContent) {
      return { textContent };
    },
    body: makeNode("body"),
    addEventListener() {}
  };

  const context = {
    window: { LUNA_REGION: "US" },
    document: documentStub,
    localStorage: {
      _store: new Map(),
      getItem(key) {
        return this._store.has(key) ? this._store.get(key) : null;
      },
      setItem(key, value) {
        this._store.set(key, String(value));
      },
      removeItem(key) {
        this._store.delete(key);
      }
    },
    Date: FakeDate,
    console
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: scriptPath });

  const banner = created.find((node) => String(node.className).includes("tax-reminder-banner"));
  return { banner, bannerText: collectText(banner) };
}

test("reminder banner shows the due date and pay link", () => {
  const { banner, bannerText } = loadBanner();
  assert.ok(banner, "expected the reminder banner to render");
  assert.match(bannerText, /Q2 payment is due/);
  assert.match(bannerText, /in 14 days/);
  assert.match(bannerText, /Pay via IRS Direct Pay/);
});

test("reminder banner never shows a dollar estimate the user might overpay on", () => {
  const { bannerText } = loadBanner();
  assert.doesNotMatch(bannerText, /draft estimate/i);
  assert.doesNotMatch(bannerText, /\$/);
});
