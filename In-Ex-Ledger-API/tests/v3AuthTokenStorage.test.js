"use strict";

// V3's persistent auth session is cookie-only: utils/authUtils.js sets the
// real session cookie httpOnly, and apiClient.ts talks to the API with
// credentials: 'include', never an Authorization header built from stored
// state. This guards that property at the frontend source level: every
// localStorage/sessionStorage key the V3 app ever writes must be on the
// allowlist below, so a new persistent-auth-token write can't slip in
// silently. Values already allowlisted are transient/purpose-scoped (e.g.
// the MFA challenge token, verified short-lived and single-purpose on the
// backend in routes/auth.routes.js) or plain UI preferences -- never the
// long-lived session credential itself.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..", "frontend-v3", "src");

const ALLOWED_LOCAL_STORAGE_KEYS = new Set([
  "inex-theme",
  "lb_language",
  "inex-last-activity",
  "inex-v3-transactions-page-size"
]);

const ALLOWED_SESSION_STORAGE_KEYS = new Set([
  "inex-mfa-context",
  "inex-mfa-token",
  "inex-preferred-billing-interval",
  "inex-reset-email",
  "inex-verify-email-state"
]);

// useSessionDismissed.ts writes `dismissed:${key}` -- a dynamic per-banner
// dismissal flag, not a fixed literal.
const ALLOWED_SESSION_STORAGE_PREFIXES = ["dismissed:"];

function collectSourceFiles() {
  const files = [];
  const stack = [frontendRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function findSetItemCalls(store) {
  const calls = [];
  for (const file of collectSourceFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const pattern = new RegExp(`${store}\\.setItem\\(\\s*([\`'"])((?:\\\\.|(?!\\1).)*)\\1`, "g");
    let match;
    while ((match = pattern.exec(source))) {
      calls.push({ file: path.relative(frontendRoot, file), key: match[2] });
    }
  }
  return calls;
}

test("every V3 localStorage write uses an allowlisted, non-auth-token key", () => {
  const offenders = findSetItemCalls("localStorage")
    .filter((call) => !ALLOWED_LOCAL_STORAGE_KEYS.has(call.key))
    .map((call) => `${call.file} writes localStorage key "${call.key}"`);

  assert.deepEqual(offenders, []);
});

test("every V3 sessionStorage write uses an allowlisted, non-persistent-auth key", () => {
  const offenders = findSetItemCalls("sessionStorage")
    .filter((call) =>
      !ALLOWED_SESSION_STORAGE_KEYS.has(call.key) &&
      !ALLOWED_SESSION_STORAGE_PREFIXES.some((prefix) => call.key.startsWith(prefix)))
    .map((call) => `${call.file} writes sessionStorage key "${call.key}"`);

  assert.deepEqual(offenders, []);
});

test("no V3 source file writes a literal access/refresh/session-token-named storage key", () => {
  const forbiddenKeyPattern = /^(access|refresh|session|auth|jwt)[-_]?token$/i;
  const allCalls = [...findSetItemCalls("localStorage"), ...findSetItemCalls("sessionStorage")];
  const offenders = allCalls
    .filter((call) => forbiddenKeyPattern.test(call.key))
    .map((call) => `${call.file} writes a persistent-auth-shaped key "${call.key}"`);

  assert.deepEqual(offenders, []);
});

test("no V3 source file constructs an Authorization header", () => {
  const offenders = [];
  for (const file of collectSourceFiles()) {
    const source = fs.readFileSync(file, "utf8");
    if (/\bAuthorization\s*:/i.test(source) || /\.set\(\s*['"`]Authorization['"`]/i.test(source)) {
      offenders.push(path.relative(frontendRoot, file));
    }
  }

  assert.deepEqual(offenders, []);
});
