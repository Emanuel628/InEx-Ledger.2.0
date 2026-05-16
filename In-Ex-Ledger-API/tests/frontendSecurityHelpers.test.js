"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(relativePath, contextExtras = {}) {
  const scriptPath = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = vm.createContext({
    window: {},
    console,
    setTimeout,
    clearTimeout,
    URL: {
      createObjectURL() { return "blob:test"; },
      revokeObjectURL() {}
    },
    document: {
      createElement() {
        return {
          click() {},
          remove() {}
        };
      },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
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
    ...contextExtras
  });
  vm.runInContext(source, context, { filename: scriptPath });
  return context;
}

test("billing-pricing exports a frozen pricing helper object", () => {
  const context = loadScript("public/js/billing-pricing.js");
  assert.equal(Object.isFrozen(context.window.billingPricing), true);
  assert.equal(Object.isFrozen(context.window.billingPricing.PRICING_TABLE), true);
  assert.equal(
    Object.isFrozen(context.window.billingPricing.PRICING_TABLE.usd.monthly),
    true
  );
});

test("privacyService does not persist local settings when the server save fails", async () => {
  const fetchCalls = [];
  const context = loadScript("public/js/privacyService.js", {
    fetch: async (url) => {
      fetchCalls.push(url);
      if (url === "/health") {
        return { ok: true };
      }
      if (url === "/api/privacy/settings") {
        throw new Error("network down");
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });

  context.localStorage.setItem("lb_privacy_settings", JSON.stringify({
    dataSharingOptOut: false,
    consentGiven: false
  }));

  await assert.rejects(
    context.window.privacyService.setPrivacySettings({ dataSharingOptOut: true }),
    /network down/
  );

  const saved = JSON.parse(context.localStorage.getItem("lb_privacy_settings"));
  assert.equal(saved.dataSharingOptOut, false);
  assert.deepEqual(fetchCalls, ["/health", "/api/privacy/settings"]);
});

test("privacyService surfaces server deletion errors to the caller", async () => {
  const context = loadScript("public/js/privacyService.js", {
    fetch: async (url) => {
      if (url === "/health") {
        return { ok: true };
      }
      if (url === "/api/privacy/delete") {
        return {
          ok: false,
          async json() {
            return { error: "Incorrect password" };
          }
        };
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });

  await assert.rejects(
    context.window.privacyService.deleteBusinessData({ password: "bad" }),
    /Incorrect password/
  );
});

test("jwe-utils deduplicates concurrent public-key fetches", async () => {
  let fetchCalls = 0;
  const context = loadScript("public/js/jwe-utils.js", {
    fetch: async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        ok: true,
        async json() {
          return {
            kid: "kid_test_001",
            jwk: {
              kty: "RSA",
              n: "abc",
              e: "AQAB",
              alg: "RSA-OAEP-256",
              use: "enc"
            }
          };
        }
      };
    }
  });

  const [first, second] = await Promise.all([
    context.window.exportCrypto.fetchExportPublicKey(),
    context.window.exportCrypto.fetchExportPublicKey()
  ]);

  assert.equal(fetchCalls, 1);
  assert.equal(first.kid, "kid_test_001");
  assert.equal(second.kid, "kid_test_001");
});

test("jwe-utils rejects mismatched server key metadata instead of masking it", async () => {
  const context = loadScript("public/js/jwe-utils.js", {
    fetch: async () => ({
      ok: true,
      async json() {
        return {
          kid: "kid_test_002",
          jwk: {
            kty: "RSA",
            n: "abc",
            e: "AQAB",
            alg: "RSA1_5",
            use: "enc"
          }
        };
      }
    })
  });

  await assert.rejects(
    context.window.exportCrypto.fetchExportPublicKey(),
    /Unexpected export public key algorithm/
  );
});

test("auth trial helpers ignore tampered local trial flags when server subscription state says trial expired", () => {
  const storage = {
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
  };
  const context = loadScript("public/js/auth.js", {
    window: {
      location: { href: "/" }
    },
    document: {
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    localStorage: storage,
    sessionStorage: storage
  });

  storage.setItem("luna_trial_expired", "false");
  storage.setItem("luna_trial_ends_at", String(Date.now() + 30 * 24 * 60 * 60 * 1000));
  storage.setItem("lb_subscription", JSON.stringify({
    effectiveTier: "free",
    effectiveStatus: "trial_expired",
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }));

  assert.equal(context.isTrialValid(), false);
  assert.equal(context.effectiveTier(), "free");
});

test("auth tier helpers fail closed when there is no server subscription bootstrap", () => {
  const storage = {
    _store: new Map(),
    getItem(key) {
      return this._store.has(key) ? this._store.get(key) : null;
    },
    setItem(key, value) {
      this._store.set(key, String(value));
    }
  };
  const context = loadScript("public/js/auth.js", {
    window: {
      location: { href: "/" }
    },
    document: {
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    localStorage: storage,
    sessionStorage: storage
  });

  storage.setItem("lb_subscription", JSON.stringify({
    effectiveTier: "v1",
    effectiveStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }));

  assert.equal(context.isTrialValid(), false);
  assert.equal(context.effectiveTier(), "free");
});

test("auth apiFetch can return an expected 401 without forcing logout when explicitly allowed", async () => {
  const localStorage = {
    _store: new Map(),
    getItem(key) {
      return this._store.has(key) ? this._store.get(key) : null;
    },
    setItem(key, value) {
      this._store.set(key, String(value));
    },
    removeItem(key) {
      this._store.delete(key);
    },
    clear() {
      this._store.clear();
    }
  };
  const sessionStorage = {
    _store: new Map(),
    getItem(key) {
      return this._store.has(key) ? this._store.get(key) : null;
    },
    setItem(key, value) {
      this._store.set(key, String(value));
    },
    removeItem(key) {
      this._store.delete(key);
    },
    clear() {
      this._store.clear();
    }
  };
  const fetchCalls = [];
  const context = loadScript("public/js/auth.js", {
    window: {
      location: { href: "/subscription" },
      __AUTH_GUARD_STATE__: { running: false, count: 0, lastError: null }
    },
    document: {
      cookie: "",
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    localStorage,
    sessionStorage,
    fetch: async (url) => {
      fetchCalls.push(url);
      if (String(url).includes("/api/auth/refresh")) {
        return { ok: false, status: 401, async json() { return {}; } };
      }
      return { ok: false, status: 401, async json() { return { error: "Incorrect password." }; } };
    },
    FormData: class FormData {}
  });

  context.setToken("token_123");
  const response = await context.apiFetch("/api/businesses/biz_123", {
    method: "DELETE",
    allowUnauthorizedResponse: true
  });

  assert.equal(response.status, 401);
  assert.equal(context.window.location.href, "/subscription");
  assert.equal(context.getToken(), "token_123");
  assert.equal(fetchCalls.length, 2);
});

test("trial.js ignores stored subscription fallback and does not mint a synthetic fresh trial window", () => {
  const context = loadScript("public/js/trial.js", {
    window: {},
    getStoredSubscriptionState() {
      return {
        effectiveTier: "v1",
        effectiveStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    }
  });

  assert.equal(context.getTrialRemaining(), null);
  assert.equal(context.getTrialRemainingForDisplay(), 0);
  assert.equal(context.formatTrialRemaining(), "Trial status unavailable.");
});

test("accounts ghost suggestions tolerate corrupted dismissed-suggestions storage", () => {
  const localStorage = {
    _store: new Map([["lb_account_suggestions_dismissed", "{bad json"]]),
    getItem(key) {
      return this._store.has(key) ? this._store.get(key) : null;
    },
    setItem(key, value) {
      this._store.set(key, String(value));
    },
    removeItem(key) {
      this._store.delete(key);
    }
  };
  const context = loadScript("public/js/accounts.js", {
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; }
    },
    window: {
      dispatchEvent() {}
    },
    localStorage,
    CustomEvent: class CustomEvent {
      constructor(name, init = {}) {
        this.type = name;
        this.detail = init.detail;
      }
    }
  });

  const suggestions = context.detectAccountSuggestions(
    [{ description: "Card ending in 1234" }],
    []
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].last4, "1234");
});

test("receipts date formatting keeps ISO calendar dates stable", () => {
  const context = loadScript("public/js/receipts.js", {
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    window: {
      location: { href: "/" },
      open() { return null; },
      setTimeout,
      clearTimeout,
      addEventListener() {}
    }
  });

  assert.equal(context.formatReceiptDate("2026-05-01T00:00:00.000Z"), "5/1/2026");
});
