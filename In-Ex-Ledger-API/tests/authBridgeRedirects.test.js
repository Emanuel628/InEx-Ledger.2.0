"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStorage(initialEntries = []) {
  return {
    _store: new Map(initialEntries),
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
}

function loadScript(relativePath, contextExtras = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  const localStorage = contextExtras.localStorage || createStorage();
  const sessionStorage = contextExtras.sessionStorage || createStorage();
  const windowObject = {
    API_BASE: "",
    location: { pathname: "/", search: "", hash: "", href: "/" },
    addEventListener() {},
    ...(contextExtras.window || {})
  };
  const context = vm.createContext({
    window: windowObject,
    document: {
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    localStorage,
    sessionStorage,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    FormData: class FormData {},
    URLSearchParams,
    fetch: async () => ({ ok: false, status: 401, async json() { return {}; } }),
    redirectIfAuthenticated() {},
    buildApiUrl(pathname) { return pathname; },
    csrfHeader() { return {}; },
    authHeader() { return {}; },
    t(key) { return key; },
    ...contextExtras
  });
  context.window = windowObject;
  vm.runInContext(source, context, { filename: relativePath });
  return context;
}

test("legacy auth next paths canonicalize deprecated app-v3 routes", () => {
  const context = loadScript("public/js/auth.js", {
    window: {
      location: {
        pathname: "/login",
        search: "?next=%2Fapp-v3%2Fsettings%3Ftab%3Dsecurity",
        hash: "",
        href: "/login?next=%2Fapp-v3%2Fsettings%3Ftab%3Dsecurity"
      }
    }
  });

  assert.equal(context.resolveSafeNextPathFromLocation(), "/settings?tab=security");
});

test("legacy auth guard redirects expired sessions to login with canonical next", async () => {
  const context = loadScript("public/js/auth.js", {
    window: {
      location: {
        pathname: "/app-v3/settings",
        search: "?tab=security",
        hash: "#mfa",
        href: "/app-v3/settings?tab=security#mfa"
      }
    },
    fetch: async () => ({ ok: false, status: 401, async json() { return {}; } })
  });

  await context.requireValidSessionOrRedirect();

  assert.equal(context.window.location.href, "/login?reason=expired&next=%2Fsettings%3Ftab%3Dsecurity%23mfa");
});

test("legacy login and MFA bridge store only canonical post-auth paths", () => {
  const loginContext = loadScript("public/js/login.js", {
    window: {
      location: {
        pathname: "/login",
        search: "?next=%2Fapp-v3%2Faccounts",
        hash: "",
        href: "/login?next=%2Fapp-v3%2Faccounts"
      }
    }
  });
  assert.equal(loginContext.resolveSafePostLoginPath(), "/accounts");

  const sessionStorage = createStorage([["lb_pending_mfa_next", "/app-v3/messages"]]);
  const mfaContext = loadScript("public/js/mfa-challenge.js", {
    sessionStorage
  });
  assert.equal(mfaContext.getPendingMfaNext(), "/messages");
});
