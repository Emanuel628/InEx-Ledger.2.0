const assert = require("node:assert");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const apiRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

function withEmailPreferencesEnv(env = {}, fn) {
  const modulePath = require.resolve("../services/emailPreferencesService.js");
  delete require.cache[modulePath];

  const previousEnv = {
    EMAIL_PREFERENCES_SECRET: process.env.EMAIL_PREFERENCES_SECRET,
    SUPPORT_REPLY_HMAC_SECRET: process.env.SUPPORT_REPLY_HMAC_SECRET,
    JWT_SECRET: process.env.JWT_SECRET
  };

  for (const key of Object.keys(previousEnv)) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    } else {
      delete process.env[key];
    }
  }

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "../db.js" || /[\\/]db\.js$/.test(request)) {
      return { pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return fn(require(modulePath));
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("email preference unsubscribe tokens fail closed without a configured signing secret", () => {
  withEmailPreferencesEnv({
    EMAIL_PREFERENCES_SECRET: undefined,
    SUPPORT_REPLY_HMAC_SECRET: undefined,
    JWT_SECRET: undefined
  }, (service) => {
    assert.equal(service.createUnsubscribeToken({ userId: "user-1" }), "");
    assert.equal(service.verifyUnsubscribeToken("payload.signature"), null);
  });
});

test("email preference unsubscribe tokens still work with an explicit signing secret", () => {
  withEmailPreferencesEnv({
    EMAIL_PREFERENCES_SECRET: "email-preferences-test-secret"
  }, (service) => {
    const token = service.createUnsubscribeToken({ userId: "user-1" });
    assert.match(token, /^[^.]+\.[^.]+$/);
    const payload = service.verifyUnsubscribeToken(token);
    assert.equal(payload.u, "user-1");
    assert.equal(payload.s, "optional_emails");
  });

});

test("low-severity dead code and polish findings stay removed", () => {
  const rateLimiter = read("middleware/rateLimiter.js");
  const emailPreferences = read("services/emailPreferencesService.js");
  const receiptsRoutes = read("routes/receipts.routes.js");
  const server = read("server.js");
  const pdfGenerator = read("services/pdfGeneratorService.js");

  assert.doesNotMatch(rateLimiter, /const metrics\s*=/);
  assert.doesNotMatch(rateLimiter, /metrics\.increment\(/);
  assert.doesNotMatch(rateLimiter, /module\.exports\s*=\s*\{[\s\S]*\bmetrics\b/);
  assert.doesNotMatch(emailPreferences, /inex-ledger-email-preferences/);
  assert.doesNotMatch(receiptsRoutes, /require\(["']https["']\)/);
  assert.doesNotMatch(server, /SYSTEM START: INEX_LEDGER_PROD_2026/);
  assert.doesNotMatch(server, /SECURITY: JWT_SECRET detected/);
  assert.doesNotMatch(pdfGenerator, /Run VALIDATE CONSTRAINT|query-planner optimization/);
});

test("inbound support route errors delegate to the central server handler", () => {
  for (const relativePath of [
    "routes/internalSupport.routes.js",
    "routes/supportEmail.routes.js",
    "routes/email.routes.js"
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /router\.use\(\(err,\s*req,\s*res,\s*next\)\s*=>/);
    assert.doesNotMatch(source, /catch\s*\(\s*err\s*\)\s*\{\s*throw\s+err;\s*\}/);
  }
});

test("misc naming and structure polish stays consolidated", () => {
  const subscriptionService = read("services/subscriptionService.js");
  const requirePlanFeature = read("middleware/requirePlanFeature.js");
  const accountingLockService = read("services/accountingLockService.js");
  const invoiceEmailService = read("services/invoiceEmailService.js");
  const migrationPolicy = read("db/migrations/README.md");

  assert.doesNotMatch(subscriptionService, /\bPLAN_BASIC\b/);
  assert.doesNotMatch(subscriptionService, /\bPLAN_PRO\b/);
  assert.match(subscriptionService, /Historical persisted plan_code values/);
  assert.ok(
    requirePlanFeature.indexOf("Builds the standard") < requirePlanFeature.indexOf("function buildFeatureRequiresPlanResponse")
  );
  assert.ok(
    requirePlanFeature.indexOf("Express middleware factory") < requirePlanFeature.indexOf("function requirePlanFeature")
  );
  assert.match(accountingLockService, /function assertNoLockedPeriodTransactionsForReference/);
  assert.match(accountingLockService, /LOCKED_REFERENCE_COLUMNS/);
  assert.equal((accountingLockService.match(/SELECT EXISTS\(/g) || []).length, 1);
  assert.ok(
    invoiceEmailService.indexOf("function normalizeEmailAddress") < invoiceEmailService.indexOf("function getInvoiceReplyBaseEmail")
  );
  assert.equal((invoiceEmailService.match(/Returns the reply-to address pattern/g) || []).length, 1);
  assert.match(migrationPolicy, /YYYYMMDD_short_description\.sql/);
  assert.match(migrationPolicy, /Do not rename them/);
});
