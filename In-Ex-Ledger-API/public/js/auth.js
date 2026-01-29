/**
 * SHARED AUTH CONTRACT
 * This file MUST remain identical in:
 * - InEx-Ledger-Frontend
 * - In-Ex-Ledger-API/public
 * 
 * Do NOT edit in only one bundle.
 * Always apply changes to BOTH.
 */

const TOKEN_KEY = "token";
const TIER_KEY = "tier";
const TRIAL_EXPIRED_KEY = "luna_trial_expired";
const TRIAL_ENDS_AT_KEY = "luna_trial_ends_at";
const LOGIN_PAGE = "/html/login.html";

if (!window.API_BASE) {
  window.API_BASE = "https://inex-ledger20-production.up.railway.app";
}

if (!window.__AUTH_GUARD_STATE__) {
  window.__AUTH_GUARD_STATE__ = { running: false, count: 0, lastError: null };
}

function getApiBase() {
  console.log("[AUTH] API_BASE =", window.API_BASE);
  return window.API_BASE;
}

function buildApiUrl(path = "") {
  const base = getApiBase();
  const url = /^https?:\/\//i.test(path) && path ? path : `${base}${path}`;
  console.log("[AUTH] buildApiUrl:", url);
  return url;
}

function clearAppState() {
  ["lb_accounts", "lb_categories", "lb_transactions", "lb_transactions_upsell_hidden"].forEach(
    (key) => localStorage.removeItem(key)
  );
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  console.log("[AUTH] setToken length =", token ? token.length : 0);
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  console.log("[AUTH] clearToken called");
  localStorage.removeItem(TOKEN_KEY);
  clearAppState();
  if (window.__AUTH_GUARD_STATE__) {
    window.__AUTH_GUARD_STATE__.lastError = null;
  }
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function mapAuthError(status, apiError) {
  const errorMessage = typeof apiError === "string" ? apiError : apiError?.error;
  if (status === 401) {
    return "Invalid email or password.";
  }
  if (status === 409) {
    return "An account with this email already exists.";
  }
  if (status === 429) {
    return errorMessage || "Too many attempts. Try again later.";
  }
  return errorMessage || "Something went wrong. Please try again.";
}

async function requireValidSessionOrRedirect() {
  if (window.__AUTH_GUARD_STATE__.running) {
    console.log("[AUTH] Guard already running, skipping");
    return;
  }

  window.__AUTH_GUARD_STATE__.running = true;
  window.__AUTH_GUARD_STATE__.count += 1;

  const token = getToken();
  console.log("[AUTH] Guard start. token exists =", !!token);

  if (!token) {
    console.log("[AUTH] No token -> redirect to login");
    window.__AUTH_GUARD_STATE__.running = false;
    window.location.href = LOGIN_PAGE;
    return;
  }

  try {
    const meUrl = buildApiUrl("/api/me");
    console.log("[AUTH] /api/me url:", meUrl);
    const response = await fetch(meUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeader()
      }
    });

    console.log("[AUTH] /api/me status =", response.status);

    if (response.status === 200) {
      console.log("[AUTH] Session valid");
      window.__AUTH_GUARD_STATE__.running = false;
      window.__AUTH_GUARD_STATE__.lastError = null;
      return true;
    }

    if (response.status === 401) {
      console.log("[AUTH] Session invalid -> clearToken + redirect");
      clearToken();
      window.__AUTH_GUARD_STATE__.running = false;
      window.__AUTH_GUARD_STATE__.lastError = "expired";
      window.location.href = `${LOGIN_PAGE}?reason=expired`;
      return;
    }

    console.log("[AUTH] Unexpected /api/me status =", response.status);
    window.__AUTH_GUARD_STATE__.running = false;
    window.__AUTH_GUARD_STATE__.lastError = `me_${response.status}`;
  } catch (err) {
    console.error("[AUTH] Session validation failed:", err);
    clearToken();
    window.__AUTH_GUARD_STATE__.running = false;
    window.__AUTH_GUARD_STATE__.lastError = "network";
    window.location.href = `${LOGIN_PAGE}?reason=network`;
  }
}

async function redirectIfAuthenticated() {
  try {
    const response = await fetch(buildApiUrl("/api/me"), {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeader()
      }
    });
    console.log("[AUTH] redirectIfAuthenticated /api/me status =", response.status);
    if (response.status === 200) {
      window.location.href = "transactions.html";
    }
  } catch (err) {
    console.error("[AUTH] redirectIfAuthenticated failed:", err);
  }
}

async function apiFetch(url, options = {}) {
  const apiUrl = buildApiUrl(url);
  const headers = { ...(options.headers || {}), ...authHeader() };
  const response = await fetch(apiUrl, {
    ...options,
    credentials: "include",
    headers
  });

  if (response.status === 401) {
    console.log("[AUTH] apiFetch 401 -> clearing token + redirect");
    clearToken();
    window.location.href = LOGIN_PAGE;
    return null;
  }

  return response;
}

function isTrialValid() {
  const forcedFlag = localStorage.getItem(TRIAL_EXPIRED_KEY);
  if (forcedFlag !== null) {
    return forcedFlag === "false";
  }

  const endsAt = Number(localStorage.getItem(TRIAL_ENDS_AT_KEY));
  if (!endsAt) {
    return true;
  }

  return Date.now() < endsAt;
}

function isAuthenticated() {
  return Boolean(getToken());
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = LOGIN_PAGE;
  }
}

async function signOut() {
  clearToken();
  try {
    await fetch(buildApiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include"
    });
  } catch (err) {
    console.error("Logout error:", err);
  }
  window.location.href = "landing.html";
}

function effectiveTier() {
  const tier = localStorage.getItem(TIER_KEY);

  if (!tier) {
    return "free";
  }

  if (tier === "trial" && isTrialValid()) {
    return "v1";
  }

  return tier;
}

function requireTier(minTier) {
  const tier = effectiveTier();
  const order = ["free", "v1", "v2"];
  const currentIndex = order.indexOf(tier);
  const requiredIndex = order.indexOf(minTier);

  if (currentIndex < 0 || requiredIndex < 0) {
    return;
  }

  if (currentIndex < requiredIndex) {
    window.location.href = "upgrade.html";
  }
}

function requireAuthAndTier(minTier) {
  requireAuth();
  requireTier(minTier);
}

// SIGN OUT (uses auth.js)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-logout]");
  if (!btn) return;

  if (typeof signOut === "function") {
    signOut();
  } else {
    clearToken();
    window.location.href = "landing.html";
  }
});
