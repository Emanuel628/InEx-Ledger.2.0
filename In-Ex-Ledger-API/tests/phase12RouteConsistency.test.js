"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const routeDir = path.join(__dirname, "..", "routes");

test("Phase 12 transaction mutations use ApiError translation instead of response helpers", () => {
  const source = fs.readFileSync(path.join(routeDir, "transactions.routes.js"), "utf8");

  assert.equal(source.includes("handleTransactionMutationError"), false);
  assert.equal(source.includes("toTransactionMutationApiError(res,"), false);
});
