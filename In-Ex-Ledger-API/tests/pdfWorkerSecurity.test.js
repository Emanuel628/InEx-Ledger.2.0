"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("pdf worker compares shared worker tokens with timing-safe equality", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "pdf-worker", "index.js"), "utf8");

  assert.match(source, /crypto\.timingSafeEqual\(tokenBuffer,\s*expectedBuffer\)/);
  assert.match(source, /tokenBuffer\.length === expectedBuffer\.length/);
  assert.doesNotMatch(source, /WORKER_SECRET\s*!==/);
});
