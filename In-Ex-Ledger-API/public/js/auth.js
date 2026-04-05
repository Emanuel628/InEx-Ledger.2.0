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
const SUBSCRIPTION_KEY = "lb_subscription";
const LOGIN_PAGE = "/html/login.html";
const ACCOUNT_MENU_STYLE_ID = "luna-account-menu-style";

if (!window.API_BASE) {
  window.API_BASE = "";
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

function applySubscriptionState(subscription) {
  if (!subscription || typeof subscription !== "object") {
    return;
  }

  localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));

  if (subscription.trialEndsAt) {
    localStorage.setItem(TRIAL_ENDS_AT_KEY, String(new Date(subscription.trialEndsAt).getTime()));
  } else {
    localStorage.removeItem(TRIAL_ENDS_AT_KEY);
  }

  if (subscription.effectiveStatus === "trialing") {
    localStorage.setItem(TIER_KEY, "trial");
    localStorage.setItem(TRIAL_EXPIRED_KEY, "false");
    return;
  }

  if (subscription.effectiveTier === "v1") {
    localStorage.setItem(TIER_KEY, "v1");
    localStorage.setItem(TRIAL_EXPIRED_KEY, "false");
    return;
  }

  localStorage.setItem(TIER_KEY, "free");
  if (subscription.effectiveStatus === "trial_expired") {
    localStorage.setItem(TRIAL_EXPIRED_KEY, "true");
  } else {
    localStorage.removeItem(TRIAL_EXPIRED_KEY);
  }
}

function clearSubscriptionState() {
  localStorage.removeItem(SUBSCRIPTION_KEY);
  localStorage.removeItem(TIER_KEY);
  localStorage.removeItem(TRIAL_EXPIRED_KEY);
  localStorage.removeItem(TRIAL_ENDS_AT_KEY);
}

function getUserDisplayName(profile = {}) {
  const preferred = profile.display_name || profile.full_name || "";
  if (preferred && String(preferred).trim()) {
    return String(preferred).trim();
  }

  const email = String(profile.email || "").trim();
  if (!email) {
    return "User";
  }

  return email.split("@")[0] || "User";
}

function getUserInitials(profile = {}) {
  const preferred = String(profile.display_name || profile.full_name || "").trim();
  if (preferred) {
    const parts = preferred.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
    if (initials) {
      return initials;
    }
  }

  const email = String(profile.email || "").trim();
  if (email) {
    const local = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    return (local.slice(0, 2) || "U").toUpperCase();
  }

  return "U";
}

function updateAuthenticatedChrome(profile = {}) {
  const displayName = getUserDisplayName(profile);
  const initials = getUserInitials(profile);

  document.querySelectorAll(".user-name").forEach((node) => {
    node.textContent = displayName;
  });

  document.querySelectorAll(".user-avatar").forEach((node) => {
    node.textContent = initials;
    node.setAttribute("aria-label", `${displayName} initials`);
  });

  initAccountMenus(displayName);
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
  clearSubscriptionState();
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
      const payload = await response.json().catch(() => null);
      if (payload?.subscription) {
        applySubscriptionState(payload.subscription);
      }
      if (payload) {
        updateAuthenticatedChrome(payload);
      }
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
      const payload = await response.json().catch(() => null);
      if (payload?.subscription) {
        applySubscriptionState(payload.subscription);
      }
      if (payload) {
        updateAuthenticatedChrome(payload);
      }
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

function initAccountMenus(displayName = "User") {
  ensureAccountMenuStyles();

  document.querySelectorAll(".user-pill").forEach((pill, index) => {
    if (pill.dataset.accountMenuReady === "true") {
      const menuLabel = pill.querySelector(".account-menu-label");
      if (menuLabel) {
        menuLabel.textContent = displayName;
      }
      return;
    }

    pill.dataset.accountMenuReady = "true";
    pill.classList.add("account-menu-trigger");
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("aria-haspopup", "menu");
    pill.setAttribute("aria-expanded", "false");

    const menuId = `accountMenu-${index + 1}`;
    pill.setAttribute("aria-controls", menuId);

    const menu = document.createElement("div");
    menu.className = "account-menu hidden";
    menu.id = menuId;
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button type="button" class="account-menu-item" data-account-menu-action="logout" role="menuitem">
        Sign out
      </button>
      <button type="button" class="account-menu-item account-menu-secondary" data-account-menu-action="add-business" role="menuitem">
        <span class="account-menu-label">Add another business</span>
        <span class="account-menu-hint">Coming soon</span>
      </button>
    `;

    pill.appendChild(menu);

    const setOpenState = (isOpen) => {
      menu.classList.toggle("hidden", !isOpen);
      pill.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };

    const toggleMenu = () => {
      const isHidden = menu.classList.contains("hidden");
      closeAllAccountMenus();
      setOpenState(isHidden);
    };

    pill.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });

    pill.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleMenu();
      }
      if (event.key === "Escape") {
        setOpenState(false);
      }
    });

    menu.addEventListener("click", async (event) => {
      event.stopPropagation();
      const action = event.target.closest("[data-account-menu-action]")?.getAttribute("data-account-menu-action");
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      setOpenState(false);

      if (action === "logout") {
        await signOut();
        return;
      }

      if (action === "add-business") {
        showAccountMenuNotice("Multi-business is coming next. The switcher and paid prompt are not live yet.");
      }
    });
  });
}

function closeAllAccountMenus() {
  document.querySelectorAll(".account-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });
  document.querySelectorAll(".user-pill[aria-expanded]").forEach((pill) => {
    pill.setAttribute("aria-expanded", "false");
  });
}

function ensureAccountMenuStyles() {
  if (document.getElementById(ACCOUNT_MENU_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = ACCOUNT_MENU_STYLE_ID;
  style.textContent = `
    .account-menu-trigger {
      position: relative;
      cursor: pointer;
    }
    .account-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 220px;
      padding: 8px;
      border-radius: 12px;
      background: var(--surface);
      border: 0.5px solid var(--border);
      box-shadow: 0 18px 40px rgba(15, 25, 35, 0.18);
      z-index: 120;
    }
    .account-menu.hidden {
      display: none;
    }
    .account-menu-item {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--ink);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }
    .account-menu-item:hover {
      background: var(--surface2);
    }
    .account-menu-secondary {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }
    .account-menu-label {
      font-weight: 500;
    }
    .account-menu-hint {
      font-size: 11px;
      color: var(--ink3);
    }
  `;

  document.head.appendChild(style);
}

function showAccountMenuNotice(message) {
  if (typeof showSettingsToast === "function") {
    showSettingsToast(message);
    return;
  }
  window.alert(message);
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

document.addEventListener("click", (event) => {
  if (event.target.closest(".user-pill") || event.target.closest(".account-menu")) {
    return;
  }
  closeAllAccountMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllAccountMenus();
  }
});
