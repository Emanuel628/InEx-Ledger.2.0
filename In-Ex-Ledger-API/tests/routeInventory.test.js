"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(apiRoot, "..");
const serverSource = fs.readFileSync(path.join(apiRoot, "server.js"), "utf8");
const inventory = fs.readFileSync(path.join(projectRoot, "Docs", "V3_ROUTE_INVENTORY.md"), "utf8");

function readStringSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `${name} should be declared`);
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Phase 0 route inventory covers every server-declared v3 app page", () => {
  for (const slug of readStringSet(serverSource, "V3_APP_PAGES")) {
    assert.match(inventory, new RegExp(`\\| \`${escapeRegExp(`/${slug}`)}\``), `${slug} should be in the route inventory`);
  }
});

test("Phase 0 route inventory documents stop rules and route groups", () => {
  for (const required of [
    "Do not add new product features",
    "wiring test assertion",
    "Do not make `/app-v3/*`",
    "Do not delete legacy HTML",
    "Auth Bridge Matrix",
    "Marketing And SEO Matrix",
    "Business Tier Locked Matrix"
  ]) {
    assert.match(inventory, new RegExp(escapeRegExp(required)), `${required} should be documented`);
  }
});

test("Phase 0 route inventory documents temporary legacy overlap", () => {
  for (const legacyFile of [
    "transactions.html",
    "settings.html",
    "subscription.html",
    "trial-setup.html",
    "review.html"
  ]) {
    assert.match(inventory, new RegExp(escapeRegExp(legacyFile)), `${legacyFile} should be explicitly classified`);
  }
});
