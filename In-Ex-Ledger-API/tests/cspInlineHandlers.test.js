"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readHtml(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

test("login page no longer uses inline focus handlers", () => {
  const html = readHtml("public/html/login.html");
  assert.doesNotMatch(html, /\sonfocus=/i);
});

test("transactions page no longer uses inline click handlers", () => {
  const html = readHtml("public/html/transactions.html");
  assert.doesNotMatch(html, /\sonclick=/i);
});
