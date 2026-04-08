/**
 * SHARED AUTH CONTRACT
 * This file is the canonical auth guard used by the API-hosted frontend.
 * It handles session validation, token refresh, and subscription state.
 *
 * Do NOT embed Railway or hardcoded API URLs here.
 */

const TOKEN_KEY = "token";
const TIER_KEY = "tier";
const TRIAL_EXPIRED_KEY = "luna_trial_expired";
const TRIAL_ENDS_AT_KEY = "luna_trial_ends_at";
const SUBSCRIPTION_KEY = "lb_subscription";
const ACTIVE_BUSINESS_ID_KEY = "lb_active_business_id";
const ACTIVE_BUSINESS_NAME_KEY = "lb_business_name";
const ONBOARDING_PAGE = "/onboarding";
const LOGIN_PAGE = "/login";
const ACCOUNT_MENU_STYLE_ID = "luna-account-menu-style";
const ONBOARDING_RUNTIME_PAGES = new Set([
  "/transactions",
  "/accounts",
  "/categories",
  "/receipts",
  "/mileage",
  "/exports"
]);

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
  [
    "lb_accounts",
    "lb_categories",
    "lb_transactions",
    "lb_transactions_upsell_hidden",
    ACTIVE_BUSINESS_ID_KEY,
    ACTIVE_BUSINESS_NAME_KEY
  ].forEach(
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

function getBusinessCollection(profile = {}) {
  return Array.isArray(profile.businesses) ? profile.businesses : [];
}

function getActiveBusiness(profile = {}) {
  if (profile.active_business && typeof profile.active_business === "object") {
    return profile.active_business;
  }

  const activeBusinessId =
    profile.active_business_id || profile.business_id || localStorage.getItem(ACTIVE_BUSINESS_ID_KEY) || "";
  const businesses = getBusinessCollection(profile);
  return businesses.find((business) => business.id === activeBusinessId) || null;
}

function getAssignedCpaPortfolios(profile = {}) {
  return Array.isArray(profile.assigned_cpa_portfolios) ? profile.assigned_cpa_portfolios : [];
}

/**
 * Sync region and province from the active business to localStorage and
 * window globals so region-hardening functions have the correct context.
 */
function syncRegionFromProfile(profile = {}) {
  const activeBusiness = getActiveBusiness(profile);
  if (!activeBusiness || !activeBusiness.region) {
    return;
  }
  const region = String(activeBusiness.region).toLowerCase();
  const province = String(activeBusiness.province || "").toUpperCase();
  if (region === "us" || region === "ca") {
    localStorage.setItem("lb_region", region);
    window.LUNA_REGION = region;
  }
  if (province) {
    localStorage.setItem("lb_province", province);
    window.LUNA_PROVINCE = province;
  }
  // Trigger hardening if i18n is already loaded
  if (typeof window.applyRegionHardening === "function") {
    window.applyRegionHardening(region, province);
  }
}

function persistBusinessContext(profile = {}) {
  const activeBusiness = getActiveBusiness(profile);
  if (!activeBusiness?.id) {
    return;
  }

  localStorage.setItem(ACTIVE_BUSINESS_ID_KEY, activeBusiness.id);
  localStorage.setItem(ACTIVE_BUSINESS_NAME_KEY, activeBusiness.name || "Business");
}

function updateAuthenticatedChrome(profile = {}) {
  const displayName = getUserDisplayName(profile);
  const initials = getUserInitials(profile);

  persistBusinessContext(profile);
  ensureLegacyUserPills();
  ensureBusinessPills(profile);

  document.querySelectorAll(".user-name").forEach((node) => {
    node.textContent = displayName;
  });

  document.querySelectorAll(".user-avatar").forEach((node) => {
    node.textContent = initials;
    node.setAttribute("aria-label", `${displayName} initials`);
  });

  initBusinessMenus(profile);
  initAccountMenus(displayName, profile);
}

function getNormalizedPathname() {
  const path = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
  return path;
}

function isOnboardingRoute(pathname = getNormalizedPathname()) {
  return pathname === ONBOARDING_PAGE;
}

function shouldRedirectToOnboarding(profile = {}) {
  return !profile?.onboarding?.completed && !isOnboardingRoute();
}

function maybeLoadOnboardingRuntime(profile = {}) {
  const path = getNormalizedPathname();
  if (!profile?.onboarding?.completed || !ONBOARDING_RUNTIME_PAGES.has(path)) {
    return;
  }

  if (!document.querySelector('link[data-onboarding-runtime="true"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/pages/onboarding.css";
    link.dataset.onboardingRuntime = "true";
    document.head.appendChild(link);
  }

  if (!document.querySelector('script[data-onboarding-runtime="true"]')) {
    const script = document.createElement("script");
    script.src = "/js/onboarding.js?v=20260405c";
    script.dataset.onboardingRuntime = "true";
    document.body.appendChild(script);
  }
}

function ensureLegacyUserPills() {
  if (document.querySelector(".user-pill")) {
    return;
  }

  const header = document.querySelector("header");
  if (!header) {
    return;
  }

  header.classList.add("legacy-auth-header");

  const pill = document.createElement("div");
  pill.className = "user-pill legacy-user-pill";
  pill.innerHTML = `
    <span class="user-avatar">U</span>
    <span class="user-name">User</span>
  `;

  header.appendChild(pill);
}

function ensureBusinessPills(profile = {}) {
  const activeBusiness = getActiveBusiness(profile);
  if (!activeBusiness) {
    return;
  }

  document.querySelectorAll(".user-pill").forEach((userPill, index) => {
    const parent = userPill.parentElement;
    if (!parent) {
      return;
    }

    let businessPill = parent.querySelector(`.business-pill[data-business-pill-index="${index}"]`);
    if (!businessPill) {
      businessPill = document.createElement("div");
      businessPill.className = "business-pill";
      businessPill.dataset.businessPillIndex = String(index);
      businessPill.innerHTML = `
        <span class="business-pill-icon" aria-hidden="true">B</span>
        <span class="business-pill-copy">
          <span class="business-pill-label">Business</span>
          <span class="business-pill-name">Business</span>
        </span>
      `;
      parent.insertBefore(businessPill, userPill);
    }

    businessPill.querySelector(".business-pill-name").textContent = activeBusiness.name || "Business";
  });
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
      window.__LUNA_ME__ = payload;
      window.__LUNA_ONBOARDING__ = payload?.onboarding || null;
      if (payload?.subscription) {
        applySubscriptionState(payload.subscription);
      }
      if (payload) {
        updateAuthenticatedChrome(payload);
      }
      // Sync region and province from active business profile
      syncRegionFromProfile(payload);
      if (shouldRedirectToOnboarding(payload)) {
        window.__AUTH_GUARD_STATE__.running = false;
        window.location.href = ONBOARDING_PAGE;
        return;
      }
      maybeLoadOnboardingRuntime(payload);
      if (typeof window !== "undefined" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("lunaProfileReady", { detail: payload }));
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
      window.__LUNA_ME__ = payload;
      window.__LUNA_ONBOARDING__ = payload?.onboarding || null;
      if (payload?.subscription) {
        applySubscriptionState(payload.subscription);
      }
      if (payload) {
        updateAuthenticatedChrome(payload);
      }
      syncRegionFromProfile(payload);
      window.location.href = payload?.onboarding?.completed ? "/transactions" : ONBOARDING_PAGE;
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
  window.location.href = "/";
}

function wireMenuTrigger(trigger, menu) {
  const setOpenState = (isOpen) => {
    menu.classList.toggle("hidden", !isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  const toggleMenu = () => {
    const isHidden = menu.classList.contains("hidden");
    closeAllAccountMenus();
    setOpenState(isHidden);
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu();
    }
    if (event.key === "Escape") {
      setOpenState(false);
    }
  });
}

function initBusinessMenus(profile = {}) {
  ensureAccountMenuStyles();
  ensureBusinessCreationModal();
  const businesses = getBusinessCollection(profile);
  const activeBusiness = getActiveBusiness(profile);
  const businessCountLabel = `${businesses.length} business${businesses.length === 1 ? "" : "es"}`;

  document.querySelectorAll(".business-pill").forEach((pill, index) => {
    const menuId = `businessMenu-${index + 1}`;
    let menu = pill.querySelector(".business-menu");
    if (!menu) {
      pill.classList.add("menu-trigger");
      pill.setAttribute("role", "button");
      pill.setAttribute("tabindex", "0");
      pill.setAttribute("aria-haspopup", "menu");
      pill.setAttribute("aria-expanded", "false");
      pill.setAttribute("aria-controls", menuId);

      menu = document.createElement("div");
      menu.className = "account-menu business-menu hidden";
      menu.id = menuId;
      menu.setAttribute("role", "menu");
      pill.appendChild(menu);
      wireMenuTrigger(pill, menu);
    }

    menu.innerHTML = `
      <div class="account-menu-section">
        <div class="account-menu-caption">Active business</div>
        <div class="account-menu-current">${activeBusiness?.name || "Business"}</div>
        <div class="account-menu-hint">${businessCountLabel}</div>
      </div>
      <div class="account-menu-section">
        ${businesses.map((business) => `
          <button
            type="button"
            class="account-menu-item business-menu-item ${business.is_active ? "is-active" : ""}"
            data-business-switch="${business.id}"
            role="menuitem"
          >
            <span class="business-menu-copy">
              <span class="account-menu-label">${business.name || "Business"}</span>
              <span class="account-menu-hint">${business.region || "US"}</span>
            </span>
            ${business.is_active ? '<span class="business-menu-state">Current</span>' : ""}
          </button>
        `).join("")}
      </div>
      <button type="button" class="account-menu-item account-menu-secondary" data-business-create="true" role="menuitem">
        <span class="account-menu-label">Add another business</span>
        <span class="account-menu-hint">Create and switch instantly</span>
      </button>
    `;

    menu.onclick = async (event) => {
      event.stopPropagation();
      const switchId = event.target.closest("[data-business-switch]")?.getAttribute("data-business-switch");
      if (switchId) {
        event.preventDefault();
        closeAllAccountMenus();
        await switchActiveBusiness(switchId);
        return;
      }

      if (event.target.closest("[data-business-create]")) {
        event.preventDefault();
        closeAllAccountMenus();
        openBusinessCreationModal();
      }
    };
  });
}

function initAccountMenus(displayName = "User", profile = {}) {
  ensureAccountMenuStyles();
  ensureBusinessCreationModal();
  const activeBusiness = getActiveBusiness(profile);
  const assignedCpaPortfolios = getAssignedCpaPortfolios(profile);
  const hasCpaWorkspace = assignedCpaPortfolios.length > 0;

  document.querySelectorAll(".user-pill").forEach((pill, index) => {
    let menu = pill.querySelector(".account-menu");
    const menuId = `accountMenu-${index + 1}`;

    pill.classList.add("menu-trigger");
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("aria-haspopup", "menu");
    pill.setAttribute("aria-expanded", "false");
    pill.setAttribute("aria-controls", menuId);

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "account-menu hidden";
      menu.id = menuId;
      menu.setAttribute("role", "menu");
      pill.appendChild(menu);
      wireMenuTrigger(pill, menu);
    }

    menu.innerHTML = `
      <div class="account-menu-section">
        <div class="account-menu-caption">${typeof t === "function" ? t("auth_signed_in_as") : "Signed in as"}</div>
        <div class="account-menu-current">${displayName}</div>
        <div class="account-menu-hint">${activeBusiness?.name || (typeof t === "function" ? t("common_business") : "Business")}</div>
      </div>
      ${hasCpaWorkspace ? `
      <button type="button" class="account-menu-item account-menu-secondary" data-account-menu-action="cpa-workspace" role="menuitem">
        <span class="account-menu-label">${typeof t === "function" ? t("auth_cpa_workspace") : "CPA workspace"}</span>
        <span class="account-menu-hint">${assignedCpaPortfolios.length} ${typeof t === "function" ? t(assignedCpaPortfolios.length === 1 ? "auth_portfolio_assigned_singular" : "auth_portfolio_assigned_plural") : assignedCpaPortfolios.length === 1 ? "portfolio assigned" : "portfolios assigned"}</span>
      </button>
      ` : ""}
      <button type="button" class="account-menu-item account-menu-secondary" data-account-menu-action="add-business" role="menuitem">
        <span class="account-menu-label">${typeof t === "function" ? t("auth_add_another_business") : "Add another business"}</span>
        <span class="account-menu-hint">${typeof t === "function" ? t("auth_create_and_switch") : "Create and switch instantly"}</span>
      </button>
      <button type="button" class="account-menu-item" data-account-menu-action="logout" role="menuitem">
        ${typeof t === "function" ? t("auth_sign_out") : "Sign out"}
      </button>
    `;

    menu.onclick = async (event) => {
      event.stopPropagation();
      const action = event.target.closest("[data-account-menu-action]")?.getAttribute("data-account-menu-action");
      if (!action) {
        return;
      }

      event.preventDefault();
      closeAllAccountMenus();

      if (action === "logout") {
        await signOut();
        return;
      }

      if (action === "cpa-workspace") {
        window.location.href = "/cpa-dashboard";
        return;
      }

      if (action === "add-business") {
        openBusinessCreationModal();
      }
    };
  });
}

function closeAllAccountMenus() {
  document.querySelectorAll(".account-menu, .business-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });
  document.querySelectorAll(".menu-trigger[aria-expanded]").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

function ensureAccountMenuStyles() {
  if (document.getElementById(ACCOUNT_MENU_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = ACCOUNT_MENU_STYLE_ID;
  style.textContent = `
    .legacy-auth-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .legacy-auth-header .user-pill,
    .business-pill,
    .legacy-user-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px 5px 6px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.1);
      border: 0.5px solid rgba(15, 25, 35, 0.12);
      color: var(--ink);
      min-width: 0;
      flex-shrink: 1;
    }
    .legacy-auth-header .user-pill,
    .legacy-user-pill {
      margin-left: auto;
    }
    .business-pill {
      position: relative;
      min-width: 0;
      max-width: min(320px, 36vw);
    }
    .business-pill-copy {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 1px;
    }
    .business-pill-label {
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink3);
    }
    .business-pill-name {
      font-size: 12px;
      font-weight: 600;
      color: inherit;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .business-pill-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--surface2);
      color: var(--ink);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .legacy-auth-header .user-avatar,
    .legacy-user-pill .user-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--accent2, #2563a8);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 500;
      flex-shrink: 0;
    }
    .legacy-auth-header .user-name,
    .legacy-user-pill .user-name {
      font-size: 12px;
      color: inherit;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .menu-trigger {
      position: relative;
      cursor: pointer;
      min-width: 0;
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
    .account-menu-caption {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink3);
      margin-bottom: 4px;
    }
    .account-menu-current {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
    }
    .account-menu-section {
      padding: 8px 10px;
    }
    .business-menu-item {
      align-items: center;
    }
    .business-menu-item.is-active {
      background: rgba(37, 99, 168, 0.08);
    }
    .business-menu-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      align-items: flex-start;
    }
    .business-menu-state {
      font-size: 11px;
      font-weight: 600;
      color: var(--accent2, #2563a8);
    }
    .account-menu-hint {
      font-size: 11px;
      color: var(--ink3);
    }
    .business-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 25, 35, 0.52);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 240;
    }
    .business-modal-backdrop[hidden] {
      display: none;
    }
    .business-modal {
      width: min(100%, 420px);
      border-radius: 18px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, rgba(15, 25, 35, 0.12));
      box-shadow: 0 24px 60px rgba(15, 25, 35, 0.24);
      padding: 22px;
    }
    .business-modal h3 {
      margin: 0 0 6px;
      font-size: 20px;
      color: var(--ink);
    }
    .business-modal p {
      margin: 0 0 16px;
      color: var(--ink2, #4b5563);
      font-size: 13px;
    }
    .business-modal-form {
      display: grid;
      gap: 12px;
    }
    .business-modal-form label {
      display: grid;
      gap: 6px;
      font-size: 12px;
      color: var(--ink2, #4b5563);
    }
    .business-modal-form input,
    .business-modal-form select {
      width: 100%;
      min-height: 42px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--border, rgba(15, 25, 35, 0.12));
      background: var(--surface2, #f8fafc);
      color: var(--ink);
    }
    .business-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 8px;
    }
    .business-modal-actions button {
      min-height: 40px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--border, rgba(15, 25, 35, 0.12));
      background: var(--surface2, #f8fafc);
      color: var(--ink);
      cursor: pointer;
    }
    .business-modal-actions button[data-business-submit] {
      background: var(--accent2, #2563a8);
      border-color: var(--accent2, #2563a8);
      color: #fff;
    }
    .business-modal-error {
      min-height: 18px;
      font-size: 12px;
      color: #b42318;
    }
  `;

  document.head.appendChild(style);
}

function ensureBusinessCreationModal() {
  if (document.getElementById("businessCreationModal")) {
    return;
  }

  const modal = document.createElement("div");
  modal.id = "businessCreationModal";
  modal.className = "business-modal-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="business-modal" role="dialog" aria-modal="true" aria-labelledby="businessModalTitle">
      <h3 id="businessModalTitle">Add another business</h3>
      <p>Create a new business and make it the active scope across the app.</p>
      <form class="business-modal-form" id="businessCreationForm">
        <label>
          Business name
          <input type="text" id="businessNameInput" maxlength="120" placeholder="River Street Rentals LLC" required />
        </label>
        <label>
          Region
          <select id="businessRegionInput">
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </label>
        <label>
          Language
          <select id="businessLanguageInput">
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
          </select>
        </label>
        <div class="business-modal-error" id="businessModalError"></div>
        <div class="business-modal-actions">
          <button type="button" data-business-cancel>Cancel</button>
          <button type="submit" data-business-submit>Create business</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-business-cancel]")) {
      closeBusinessCreationModal();
    }
  });

  modal.querySelector("#businessCreationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitBusinessCreation();
  });
}

function openBusinessCreationModal() {
  ensureBusinessCreationModal();
  const modal = document.getElementById("businessCreationModal");
  const error = document.getElementById("businessModalError");
  const nameInput = document.getElementById("businessNameInput");
  if (!modal) {
    return;
  }

  if (error) {
    error.textContent = "";
  }
  modal.hidden = false;
  setTimeout(() => nameInput?.focus(), 0);
}

function closeBusinessCreationModal() {
  const modal = document.getElementById("businessCreationModal");
  const form = document.getElementById("businessCreationForm");
  const error = document.getElementById("businessModalError");
  if (form) {
    form.reset();
  }
  if (error) {
    error.textContent = "";
  }
  if (modal) {
    modal.hidden = true;
  }
}

async function submitBusinessCreation() {
  const nameInput = document.getElementById("businessNameInput");
  const regionInput = document.getElementById("businessRegionInput");
  const languageInput = document.getElementById("businessLanguageInput");
  const submitButton = document.querySelector("[data-business-submit]");
  const error = document.getElementById("businessModalError");
  const name = String(nameInput?.value || "").trim();

  if (!name) {
    if (error) {
      error.textContent = "Business name is required.";
    }
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const response = await apiFetch("/api/businesses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        region: regionInput?.value || "US",
        language: languageInput?.value || "en"
      })
    });

    if (!response || !response.ok) {
      const payload = await response?.json().catch(() => null);
      if (error) {
        error.textContent = payload?.error || (typeof t === "function" ? t("auth_error_create_business") : "Unable to create business.");
      }
      return;
    }

    const payload = await response.json().catch(() => null);
    const activeBusiness = payload?.active_business || null;
    if (activeBusiness?.id) {
      localStorage.setItem(ACTIVE_BUSINESS_ID_KEY, activeBusiness.id);
      localStorage.setItem(ACTIVE_BUSINESS_NAME_KEY, activeBusiness.name || (typeof t === "function" ? t("common_business") : "Business"));
    }
    closeBusinessCreationModal();
    window.location.reload();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function switchActiveBusiness(businessId) {
  const response = await apiFetch(`/api/businesses/${businessId}/activate`, {
    method: "POST"
  });

  if (!response || !response.ok) {
    const payload = await response?.json().catch(() => null);
    showAccountMenuNotice(payload?.error || (typeof t === "function" ? t("auth_error_switch_business") : "Unable to switch businesses."));
    return;
  }

  const payload = await response.json().catch(() => null);
  const activeBusiness = payload?.active_business || null;
  if (activeBusiness?.id) {
    localStorage.setItem(ACTIVE_BUSINESS_ID_KEY, activeBusiness.id);
    localStorage.setItem(ACTIVE_BUSINESS_NAME_KEY, activeBusiness.name || (typeof t === "function" ? t("common_business") : "Business"));
  }
  window.location.reload();
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
    window.location.href = "/upgrade";
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
    window.location.href = "/";
  }
});

document.addEventListener("click", (event) => {
  if (
    event.target.closest(".user-pill") ||
    event.target.closest(".business-pill") ||
    event.target.closest(".account-menu") ||
    event.target.closest(".business-menu") ||
    event.target.closest(".business-modal")
  ) {
    return;
  }
  closeAllAccountMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllAccountMenus();
    closeBusinessCreationModal();
  }
});

