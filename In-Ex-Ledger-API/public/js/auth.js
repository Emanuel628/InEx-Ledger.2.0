const TOKEN_KEY = "token";
const TIER_KEY = "tier";
const TRIAL_EXPIRED_KEY = "luna_trial_expired";
const TRIAL_ENDS_AT_KEY = "luna_trial_ends_at";
const LOGIN_PAGE = "/html/login.html";
const DEFAULT_API_BASE = "https://inex-ledger20-production.up.railway.app";

window.API_BASE = window.API_BASE || DEFAULT_API_BASE;

function getApiBase() {
  return window.API_BASE;
}

function buildApiUrl(pathOrUrl = "") {
  const base = getApiBase();
  if (!pathOrUrl) {
    return base;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  if (pathOrUrl.startsWith("/")) {
    return `${base}${pathOrUrl}`;
  }

  return `${base}/${pathOrUrl}`;
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
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  clearAppState();
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requireValidSessionOrRedirect({ redirectOnFailure = true } = {}) {
  console.log("requireValidSessionOrRedirect() running");
  const token = getToken();
  console.log("Token at guard start:", token);

  if (!token) {
    if (redirectOnFailure) {
      window.location.href = LOGIN_PAGE;
    }
    return false;
  }

  try {
    console.log("Calling /api/me with header:", authHeader());
    const response = await fetch(buildApiUrl("/api/me"), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...authHeader()
      }
    });

    console.log("/api/me status:", response.status);
    if (response.ok) {
      return true;
    }

    const text = await response.text();
    console.log("/api/me body:", text);
    clearToken();
    if (redirectOnFailure) {
      window.location.href = LOGIN_PAGE;
    }
    return false;
  } catch (err) {
    console.error("Session validation failed:", err);
    clearToken();
    if (redirectOnFailure) {
      window.location.href = LOGIN_PAGE;
    }
    return false;
  }
}

function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = "transactions.html";
  }
}

async function apiFetch(url, options = {}) {
  const apiUrl = buildApiUrl(url);
  const headers = { ...(options.headers || {}), ...authHeader() };
  const response = await fetch(apiUrl, { ...options, headers });

  if (response.status === 401) {
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

function signOut() {
  clearToken();
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
