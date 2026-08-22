"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const routeFiles = [
  "transactions.routes.js",
  "exports.routes.js",
  "businesses.routes.js",
  "billing.routes.js"
];

const routeDir = path.join(__dirname, "..", "routes");

function findMutationRoutes(source) {
  const routes = [];
  const routeStart = /router\.(post|put|patch|delete)\s*\(/g;
  let match;
  while ((match = routeStart.exec(source)) !== null) {
    const preview = source.slice(match.index, match.index + 300);
    routes.push({
      method: match[1],
      preview,
      line: source.slice(0, match.index).split(/\r?\n/).length
    });
  }
  return routes;
}

test("Phase 12 mutation routes in mixed helper files use asyncRoute consistently", () => {
  const violations = [];

  for (const file of routeFiles) {
    const source = fs.readFileSync(path.join(routeDir, file), "utf8");
    for (const route of findMutationRoutes(source)) {
      if (file === "billing.routes.js" && route.preview.includes('"/webhook"')) {
        continue;
      }
      if (!route.preview.includes("asyncRoute(")) {
        violations.push(`${file}:${route.line} router.${route.method} is not wrapped in asyncRoute`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("Phase 12 transaction mutations use ApiError translation instead of response helpers", () => {
  const source = fs.readFileSync(path.join(routeDir, "transactions.routes.js"), "utf8");

  assert.equal(source.includes("handleTransactionMutationError"), false);
  assert.equal(source.includes("toTransactionMutationApiError(res,"), false);
});
