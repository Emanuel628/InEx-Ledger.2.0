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

function loadTaxReminders() {
  const scriptPath = path.resolve(__dirname, "..", "public/js/taxReminders.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const taxOwed = makeNode("div");
  taxOwed.textContent = "$0.00";
  const created = [];
  let mutationCallback = null;

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

  class MutationObserverStub {
    constructor(cb) {
      mutationCallback = cb;
    }
    observe() {}
    disconnect() {}
  }

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
    MutationObserver: MutationObserverStub,
    Date: FakeDate,
    console
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: scriptPath });

  return {
    api: context.window.inexTaxReminder,
    taxOwed,
    estimateNode: created.find((node) => node.className === "tax-reminder-estimate") || null,
    triggerMutation() {
      if (mutationCallback) mutationCallback();
    }
  };
}

test("estimateIsMeaningful hides the $0.00 placeholder but accepts a real total", () => {
  const { api } = loadTaxReminders();
  assert.equal(api.estimateIsMeaningful("$0.00"), false);
  assert.equal(api.estimateIsMeaningful("$4,968.21"), true);
  assert.equal(api.estimateIsMeaningful(""), false);
  assert.equal(api.estimateIsMeaningful("Not shown"), false);
  assert.equal(api.estimateIsMeaningful("Switch to one business"), false);
});

test("cleanEstimate drops unavailable markers and keeps real figures", () => {
  const { api } = loadTaxReminders();
  assert.equal(api.cleanEstimate("  $4,968.21 "), "$4,968.21");
  assert.equal(api.cleanEstimate("Not shown"), "");
  assert.equal(api.cleanEstimate(""), "");
});

test("banner omits the draft estimate while #taxOwed is the $0.00 placeholder", () => {
  const { estimateNode } = loadTaxReminders();
  assert.ok(estimateNode, "expected the reminder banner to render an estimate node");
  assert.equal(estimateNode.textContent, "");
});

test("banner picks up the real estimate once the page computes it", () => {
  const { estimateNode, taxOwed, triggerMutation } = loadTaxReminders();
  assert.ok(estimateNode);

  // transactions.js computes the estimate asynchronously and writes it here.
  taxOwed.textContent = "$4,968.21";
  triggerMutation();

  assert.equal(estimateNode.textContent, " Current draft estimate: $4,968.21.");
});
