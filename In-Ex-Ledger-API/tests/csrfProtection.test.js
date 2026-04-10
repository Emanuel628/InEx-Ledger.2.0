const assert = require("node:assert");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  isValidCsrfToken,
  ensureCsrfCookie,
  requireCsrfProtection
} = require("../middleware/csrf.middleware.js");

function createResponseDouble() {
  return {
    statusCode: 200,
    cookies: [],
    body: null,
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("generated CSRF tokens are signed and verifiable", () => {
  const token = generateCsrfToken();
  assert.ok(token.includes("."), "signed token should include nonce and signature");
  assert.strictEqual(isValidCsrfToken(token), true);
  assert.strictEqual(isValidCsrfToken(`${token}tampered`), false);
});

test("ensureCsrfCookie issues a token for API bootstrap requests", async () => {
  const req = {
    method: "GET",
    path: "/api/me",
    cookies: {}
  };
  const res = createResponseDouble();
  let nextCalled = false;

  ensureCsrfCookie(req, res, () => {
    nextCalled = true;
  });

  const token = res.cookies[0]?.value || "";

  assert.strictEqual(nextCalled, true);
  assert.ok(token, "expected csrf cookie to be set");
  assert.strictEqual(res.cookies[0]?.name, CSRF_COOKIE_NAME);
  assert.strictEqual(isValidCsrfToken(token), true);
});

test("unsafe requests are rejected without a matching CSRF header", async () => {
  const token = generateCsrfToken();
  const req = {
    method: "POST",
    cookies: {
      [CSRF_COOKIE_NAME]: token
    },
    get() {
      return "";
    }
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requireCsrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { error: "CSRF token missing or invalid." });
});

test("unsafe requests succeed with matching signed cookie and header", async () => {
  const token = generateCsrfToken();
  const req = {
    method: "POST",
    cookies: {
      [CSRF_COOKIE_NAME]: token
    },
    get(name) {
      if (String(name).toLowerCase() === CSRF_HEADER_NAME) {
        return token;
      }
      return "";
    }
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requireCsrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});

test("safe GET requests are not blocked by CSRF middleware", async () => {
  const req = {
    method: "GET",
    cookies: {},
    get() {
      return "";
    }
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requireCsrfProtection(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
});
