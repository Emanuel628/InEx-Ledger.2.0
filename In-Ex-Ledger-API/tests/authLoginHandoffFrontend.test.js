"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const escapeHtmlPath = path.join(__dirname, "../public/js/escape-html.js");
const escapeHtmlSource = fs.readFileSync(escapeHtmlPath, "utf8");

function createContext({ pathname, existingHandoffToken = "", existingHandoffAt = "" }) {
  const session = new Map();
  if (existingHandoffToken) session.set("lb_post_login_access_token_handoff", existingHandoffToken);
  if (existingHandoffAt) session.set("lb_post_login_access_token_handoff_at", existingHandoffAt);

  const appendedScripts = [];
  const intervals = new Map();
  let nextIntervalId = 1;

  const document = {
    head: {
      appendChild(node) {
        appendedScripts.push(node);
        return node;
      }
    },
    createElement(tagName) {
      return {
        tagName,
        set id(value) { this._id = value; },
        get id() { return this._id; },
        defer: false,
        src: ""
      };
    },
    getElementById() {
      return null;
    }
  };

  const context = {
    console,
    Date,
    String,
    Number,
    document,
    sessionStorage: {
      getItem(key) { return session.has(key) ? session.get(key) : null; },
      setItem(key, value) { session.set(key, String(value)); },
      removeItem(key) { session.delete(key); }
    },
    window: {
      location: { pathname },
      sessionStorage: null,
      setInterval(fn, _ms) {
        const id = nextIntervalId++;
        intervals.set(id, fn);
        return id;
      },
      clearInterval(id) {
        intervals.delete(id);
      }
    }
  };
  context.window.sessionStorage = context.sessionStorage;
  context.window.document = document;
  context.window.console = console;
  context.window.Date = Date;
  context.window.String = String;
  context.window.Number = Number;
  context.window.window = context.window;
  context.window.__appendedScripts = appendedScripts;
  context.window.__runIntervals = () => {
    for (const fn of Array.from(intervals.values())) fn();
  };
  context.window.__session = session;
  return vm.createContext(context);
}

test("auth handoff wraps setToken on login and writes same-tab handoff", () => {
  const context = createContext({ pathname: "/login" });
  vm.runInContext(escapeHtmlSource, context);

  let memoryToken = "";
  context.window.setToken = (token) => { memoryToken = token; };
  context.window.__runIntervals();

  context.window.setToken("login-access-token");

  assert.equal(memoryToken, "login-access-token");
  assert.equal(context.sessionStorage.getItem("lb_post_login_access_token_handoff"), "login-access-token");
  assert.ok(Number(context.sessionStorage.getItem("lb_post_login_access_token_handoff_at")) > 0);
});

test("protected page consumes fresh handoff before auth guard needs token", () => {
  const context = createContext({
    pathname: "/transactions",
    existingHandoffToken: "login-access-token",
    existingHandoffAt: String(Date.now())
  });
  vm.runInContext(escapeHtmlSource, context);

  let memoryToken = "";
  context.window.setToken = (token) => { memoryToken = token; };
  context.window.__runIntervals();

  assert.equal(memoryToken, "login-access-token");
  assert.equal(context.sessionStorage.getItem("lb_post_login_access_token_handoff"), null);
  assert.equal(context.sessionStorage.getItem("lb_post_login_access_token_handoff_at"), null);
});

test("protected page clears stale handoff and does not restore expired token", () => {
  const context = createContext({
    pathname: "/transactions",
    existingHandoffToken: "expired-token",
    existingHandoffAt: String(Date.now() - 120000)
  });
  vm.runInContext(escapeHtmlSource, context);

  let memoryToken = "";
  context.window.setToken = (token) => { memoryToken = token; };
  context.window.__runIntervals();

  assert.equal(memoryToken, "");
  assert.equal(context.sessionStorage.getItem("lb_post_login_access_token_handoff"), null);
  assert.equal(context.sessionStorage.getItem("lb_post_login_access_token_handoff_at"), null);
});
