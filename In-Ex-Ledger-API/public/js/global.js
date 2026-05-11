// === V2/BUSINESS DEMO UNLOCK FLAG ===
/* Global helpers shared across pages */

const DEFAULT_THEME = "light";
const THEME_VERSION = "3";
const US_ESTIMATED_TAX_RATE = 0.24;
const CANADA_ESTIMATED_TAX_RATES = {
  AB: 0.05,
  BC: 0.12,
  MB: 0.12,
  NB: 0.15,
  NL: 0.15,
  NS: 0.15,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.14975,
  SK: 0.11,
  YT: 0.05
};
const DEFAULT_CA_ESTIMATED_TAX_RATE = 0.05;

function persistDefaultTheme() {
  try {
    localStorage.setItem("lb_theme", DEFAULT_THEME);
    localStorage.setItem("lb_theme_version", THEME_VERSION);
  } catch (_) {}
}

function applyThemeToDocument(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.classList.remove("dark", "light");
  document.body.classList.add(theme);
}

function resolveSavedTheme() {
  try {
    const storedVersion = localStorage.getItem("lb_theme_version");
    const storedTheme = localStorage.getItem("lb_theme");
    if (storedVersion !== THEME_VERSION || storedTheme !== DEFAULT_THEME) {
      persistDefaultTheme();
    }
  } catch (_) {}
  return DEFAULT_THEME;
}

function applyGlobalTheme() {
  applyThemeToDocument(resolveSavedTheme());
}

function setGlobalTheme(theme) {
  const normalized = DEFAULT_THEME;
  persistDefaultTheme();
  applyThemeToDocument(normalized);
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("lunaThemeChanged", { detail: normalized }));
  }
  return normalized;
}

function normalizeRoute(value) {
  const raw = String(value || "").split(/[?#]/)[0];
  const segment = raw.split("/").filter(Boolean).pop() || "landing";
  return segment.replace(/\.html$/i, "") || "landing";
}

function renderCanonicalTopbarNavigation() {
  const links = [
    {
      href: "/transactions",
      route: "transactions",
      i18n: "nav_transactions",
      label: "Transactions",
      icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2"></rect><line x1="5" y1="6" x2="11" y2="6"></line><line x1="5" y1="9" x2="9" y2="9"></line></svg>'
    },
    {
      href: "/accounts",
      route: "accounts",
      i18n: "nav_accounts",
      label: "Accounts",
      icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5"></rect><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"></path></svg>'
    },
    {
      href: "/categories",
      route: "categories",
      i18n: "nav_categories",
      label: "Categories",
      icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3l2 1.5"></path></svg>'
    },
    {
      href: "/receipts",
      route: "receipts",
      i18n: "nav_receipts",
      label: "Receipts",
      icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5"></rect><path d="M6 5h4M6 8h4M6 11h2"></path></svg>'
    },
    {
      href: "/mileage",
      route: "mileage",
      i18n: "nav_mileage",
      label: "Mileage",
      icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2"></circle><path d="M8 2v2M8 12v2M2 8h2M12 8h2"></path></svg>'
    },
    {
      href: "/exports",
      route: "exports",
      i18n: "nav_exports",
      label: "Exports",
      icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 10l3-4 2 2 3-4 3 4"></path><rect x="2" y="2" width="12" height="12" rx="2"></rect></svg>'
    },
    {
       href: "/invoices",
       route: "invoices",
       i18n: "nav_invoices",
       label: "Invoices",
       icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5"></rect><path d="M5 5h6M5 8h6M5 11h4"></path></svg>'
    },
    {
      href: "/analytics",
      route: "analytics",
      i18n: "nav_analytics",
      label: "Analytics",
      icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 3 2 4-6"></path><rect x="2" y="2" width="12" height="12" rx="2"></rect></svg>'
    },
    {
      href: "/settings",
      route: "settings",
      i18n: "nav_settings",
      label: "Settings",
      icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2"></circle><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"></path></svg>'
    },
    {
      href: "/messages",
      route: "messages",
      label: "Messages",
      dataAttr: ' data-nav-messages="true"',
      icon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"></path><path d="M2 4l6 5 6-5"></path></svg>',
      trailing: '<span class="nav-msg-badge" data-count="0" hidden></span>'
    }
  ];

  const currentRoute = normalizeRoute(window.location.pathname);
  document.querySelectorAll(".app-topbar .topbar-nav").forEach((nav) => {
    nav.innerHTML = links.map((link) => {
      const activeClass = currentRoute === link.route ? " is-active" : "";
      const i18nAttr = link.i18n ? ` data-i18n="${link.i18n}"` : "";
      const dataAttr = link.dataAttr || "";
      return `<a href="${link.href}" class="${activeClass.trim()}"${dataAttr}>
        <span class="nav-icon" aria-hidden="true">${link.icon}</span>
        <span${i18nAttr}>${link.label}</span>
        ${link.trailing || ""}
      </a>`;
    }).join("");
    nav.classList.add("is-ready");
  });
}

function highlightNavigation() {

  const path = normalizeRoute(window.location.pathname);
  document.querySelectorAll("nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (normalizeRoute(href) === path) {
      link.classList.add("nav-link-active");
    } else {
      link.classList.remove("nav-link-active");
    }
  });
}

function applyDateInputConstraints() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('input[type="date"]:not([data-allow-future-date])').forEach((input) => {
    input.max = today;
  });
}

function markRequiredFields() {
  document.querySelectorAll("input[required], select[required], textarea[required]").forEach((field) => {
    field.setAttribute("aria-required", "true");
    const parentLabel = field.closest("label");
    if (parentLabel) {
      parentLabel.classList.add("is-required");
      return;
    }

    const fieldId = field.getAttribute("id");
    if (!fieldId) {
      return;
    }
    const label = document.querySelector(`label[for="${fieldId}"]`);
    label?.classList.add("is-required");
  });
}

function disableNumberInputWheel() {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("wheel", (event) => {
      if (document.activeElement !== input) {
        return;
      }
      event.preventDefault();
    }, { passive: false });
  });
}

function normalizeEstimatedTaxRegion(region) {
  const normalized = String(region || "").trim().toLowerCase();
  if (normalized === "ca" || normalized === "canada") {
    return "CA";
  }
  if (normalized === "us" || normalized === "usa" || normalized === "united states" || normalized === "united states of america") {
    return "US";
  }
  return "US";
}

function normalizeEstimatedTaxProvince(province) {
  return String(province || "").toUpperCase();
}

function formatEstimatedTaxPercent(rate, province = "") {
  const normalizedProvince = normalizeEstimatedTaxProvince(province);
  const decimals = normalizedProvince === "QC" ? 3 : 0;
  return `${(Number(rate || 0) * 100).toFixed(decimals)}%`;
}

function gT(key, fallback) {
  if (typeof window.t === "function") {
    const result = window.t(key);
    if (result && result !== key) {
      return result;
    }
  }
  return fallback;
}

function resolveEstimatedTaxProfile(region, province) {
  const normalizedRegion = normalizeEstimatedTaxRegion(region);
  const normalizedProvince = normalizeEstimatedTaxProvince(province);
  if (normalizedRegion === "CA") {
    return {
      region: "CA",
      province: normalizedProvince,
      rate: CANADA_ESTIMATED_TAX_RATES[normalizedProvince] || DEFAULT_CA_ESTIMATED_TAX_RATE
    };
  }

  return {
    region: "US",
    province: "",
    rate: US_ESTIMATED_TAX_RATE
  };
}

const DESKTOP_VIEW_KEY = "lb_desktop_view";

function isDesktopViewRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "desktop") {
    return true;
  }
  try {
    return localStorage.getItem(DESKTOP_VIEW_KEY) === "true";
  } catch (_) {
    return false;
  }
}

function applyDesktopViewport() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  meta.content = "width=1280";
}

function isMobileDevice() {
  // Exclude Macintosh to avoid false-positive on iPads using "Request Desktop Website"
  // (which sends a Mac UA but still has touch points)
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && !/Macintosh/i.test(navigator.userAgent));
}

function injectSkipLink() {
  const main = document.querySelector("main");
  if (!main) return;

  if (!main.id) {
    main.id = "main-content";
  }

  const targetHref = "#" + main.id;
  const existingLink = Array.from(document.querySelectorAll(".skip-link"))
    .find((link) => link.getAttribute("href") === targetHref);
  if (existingLink) {
    return;
  }

  const link = document.createElement("a");
  link.className = "skip-link";
  link.href = targetHref;
  link.setAttribute("data-i18n", "a11y_skip_to_main");
  link.textContent = "Skip to main content";
  document.body.insertBefore(link, document.body.firstChild);
}

function injectMobileDesktopLink() {
  if (!isMobileDevice() || isDesktopViewRequested()) {
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "mobile-desktop-link";
  const link = document.createElement("a");
  link.href = "#";
  link.setAttribute("data-i18n", "mobile_desktop_version");
  link.textContent = "Desktop Version";
  link.addEventListener("click", function (e) {
    e.preventDefault();
    try {
      localStorage.setItem(DESKTOP_VIEW_KEY, "true");
    } catch (_) {}
    const url = new URL(window.location.href);
    url.searchParams.set("view", "desktop");
    window.location.href = url.toString();
  });
  wrapper.appendChild(link);
  document.body.appendChild(wrapper);
}

function injectMobileMenu() {
  const topbar = document.querySelector(".app-topbar");
  const nav = document.querySelector(".app-topbar .topbar-nav");
  if (!topbar || !nav) return;

  const HAMBURGER_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M3 5h14M3 10h14M3 15h14"/></svg>';
  const CLOSE_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M5 5l10 10M15 5L5 15"/></svg>';

  const btn = document.createElement("button");
  btn.className = "topbar-hamburger";
  btn.setAttribute("aria-label", "Open navigation menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = HAMBURGER_SVG;
  topbar.appendChild(btn);

  const overlay = document.createElement("div");
  overlay.className = "mobile-nav-overlay";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  const drawer = document.createElement("nav");
  drawer.className = "mobile-nav-drawer";
  drawer.setAttribute("aria-label", "Mobile navigation");
  drawer.innerHTML = nav.innerHTML;
  document.body.appendChild(drawer);

  function openMenu() {
    drawer.classList.add("is-open");
    overlay.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Close navigation menu");
    btn.innerHTML = CLOSE_SVG;
    document.body.classList.add("body--nav-open");
  }

  function closeMenu() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Open navigation menu");
    btn.innerHTML = HAMBURGER_SVG;
    document.body.classList.remove("body--nav-open");
  }

  btn.addEventListener("click", function () {
    drawer.classList.contains("is-open") ? closeMenu() : openMenu();
  });

  overlay.addEventListener("click", closeMenu);

  drawer.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });
}

function injectHelpNavLink() {
  document.querySelectorAll(".app-topbar .topbar-nav").forEach((nav) => {
    if (nav.querySelector('[data-nav-help="true"]')) {
      return;
    }

    const link = document.createElement("a");
    link.href = "/help";
    link.setAttribute("data-nav-help", "true");
    link.setAttribute("data-i18n", "nav_help");
    link.innerHTML = '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5h6a1 1 0 0 1 1 1V13h-6a1 1 0 0 1-1-1z"></path><path d="M9.5 4.5H12a1 1 0 0 1 1 1V13h-3.5"></path><path d="M6 7.5h2.5M6 10h2.5"></path></svg></span><span>Help</span>';
    nav.appendChild(link);
  });
}

function injectMessagesNavLink() {
  document.querySelectorAll(".app-topbar .topbar-nav").forEach((nav) => {
    if (nav.querySelector('[data-nav-messages="true"]')) {
      return;
    }

    const link = document.createElement("a");
    link.href = "/messages";
    link.setAttribute("data-nav-messages", "true");
    link.innerHTML =
      '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"></path><path d="M2 4l6 5 6-5"></path></svg></span>' +
      '<span>Messages</span>' +
      '<span class="nav-msg-badge" data-count="0" hidden></span>';
    nav.appendChild(link);
  });
}

function updateNavMessageBadges(count) {
  document.querySelectorAll(".nav-msg-badge").forEach(function (badge) {
    badge.setAttribute("data-count", String(count));
    badge.textContent = "";
    badge.hidden = count <= 0;

    if (count > 0) {
      var label = count === 1 ? "1 unread message" : count + " unread messages";
      badge.setAttribute("aria-label", label);
      badge.title = label;
    } else {
      badge.removeAttribute("aria-label");
      badge.removeAttribute("title");
    }
  });
}

function pollGlobalUnreadCount() {
  var token = "";
  try {
    token = typeof getToken === "function"
      ? (getToken() || "")
      : (sessionStorage.getItem("token") || "");
  } catch (_) {}
  if (!token) return Promise.resolve(false);

  if (typeof apiFetch === "function") {
    return apiFetch("/api/messages/unread-count")
      .then(function (response) {
        if (!response) return false;  // null = auth redirect occurred; stop polling
        if (!response.ok) return !response || response.status === 401 ? false : true;
        return response.json().then(function (data) {
          if (!data) return true;
          var count = data.count || 0;
          updateNavMessageBadges(count);
          return true;
        });
      })
      .catch(function () { return true; });
  }

  return fetch("/api/messages/unread-count", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(function (response) {
      if (response.status === 401) {
        if (typeof clearToken === "function") {
          clearToken();
        }
        return false;
      }
      if (!response.ok) return true;
      return response.json().then(function (data) {
        if (!data) return true;
        var count = data.count || 0;
        updateNavMessageBadges(count);
        return true;
      });
    })
    .catch(function () { return true; });
}

function applyMileageNavLabel() {
  const isKm = localStorage.getItem("lb_unit_metric") === "true";
  const label = isKm ? "Kilometres" : "Mileage";
  document.querySelectorAll('[data-i18n="nav_mileage"]').forEach((el) => {
    el.textContent = label;
  });
}

const DYNAMIC_SIDEBAR_FAVORITES_KEY = "lb_dynamic_sidebar_favorites";
const DYNAMIC_SIDEBAR_DEFAULT_FAVORITES = ["transactions", "receipts", "invoices", "mileage", "accounts", "categories"];
const DYNAMIC_SIDEBAR_CORE_FEATURE_IDS = new Set([
  "transactions",
  "receipts",
  "mileage",
  "accounts",
  "categories",
  "exports",
  "invoices"
]);
const DYNAMIC_SIDEBAR_BUSINESS_FEATURE_IDS = new Set([
  "customers",
  "bills",
  "vendors",
  "projects",
  "billable-expenses",
  "billable_expenses"
]);
let dynamicSidebarSaveTimer = null;

const DYNAMIC_SIDEBAR_FEATURES = [
  {
    id: "transactions",
    label: "Transactions",
    labelKey: "nav_transactions",
    route: "transactions",
    group: "Core",
    actionLabel: "Add transaction",
    actionKey: "quick_add_action_add_transaction",
    icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2"></rect><line x1="5" y1="6" x2="11" y2="6"></line><line x1="5" y1="9" x2="9" y2="9"></line></svg>'
  },
  {
    id: "receipts",
    label: "Receipts",
    labelKey: "nav_receipts",
    route: "receipts",
    group: "Core",
    actionLabel: "Upload receipt",
    actionKey: "quick_add_action_upload_receipt",
    icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5"></rect><path d="M6 5h4M6 8h4M6 11h2"></path></svg>'
  },
  {
    id: "mileage",
    label: "Mileage",
    labelKey: "nav_mileage",
    route: "mileage",
    group: "Core",
    actionLabel: "Add trip",
    actionKey: "quick_add_action_add_trip",
    icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2"></circle><path d="M8 2v2M8 12v2M2 8h2M12 8h2"></path></svg>'
  },
  {
    id: "accounts",
    label: "Accounts",
    labelKey: "nav_accounts",
    route: "accounts",
    group: "Core",
    actionLabel: "Add account",
    actionKey: "quick_add_action_add_account",
    icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5"></rect><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"></path></svg>'
  },
  {
    id: "categories",
    label: "Categories",
    labelKey: "nav_categories",
    route: "categories",
    group: "Core",
    actionLabel: "Add category",
    actionKey: "quick_add_action_add_category",
    icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3l2 1.5"></path></svg>'
  },
  {
    id: "exports",
    label: "Exports",
    labelKey: "nav_exports",
    route: "exports",
    group: "Core",
    actionLabel: "Create export",
    actionKey: "quick_add_action_create_export",
    icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 10l3-4 2 2 3-4 3 4"></path><rect x="2" y="2" width="12" height="12" rx="2"></rect></svg>'
  },
  {
    id: "customers",
    label: "Customers",
    labelKey: "nav_customers",
    route: "customers",
    group: "Business",
    actionLabel: "Open customers",
    actionKey: "quick_add_action_open_customers",
    icon: '<svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5"></circle><path d="M2.5 13a3.5 3.5 0 0 1 7 0"></path><path d="M10.5 4.5a2 2 0 0 1 0 4M11.5 10.5A3 3 0 0 1 14 13"></path></svg>'
  },
  {
    id: "invoices",
    label: "Invoices",
    labelKey: "nav_invoices",
    route: "invoices",
    group: "Business",
    actionLabel: "Open invoices",
    actionKey: "quick_add_action_open_invoices",
    icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5"></rect><path d="M6 5h4M6 8h4M6 11h2"></path></svg>'
  },
  {
    id: "bills",
    label: "Bills",
    labelKey: "nav_bills",
    route: "bills",
    group: "Business",
    actionLabel: "Open bills",
    actionKey: "quick_add_action_open_bills",
    icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 2.5h8v11l-2-1-2 1-2-1-2 1v-11z"></path><path d="M6 6h4M6 9h3"></path></svg>'
  },
  {
    id: "vendors",
    label: "Vendors",
    labelKey: "nav_vendors",
    route: "vendors",
    group: "Business",
    actionLabel: "Open vendors",
    actionKey: "quick_add_action_open_vendors",
    icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 7h10v6H3z"></path><path d="M4 7V4h8v3M6 10h4"></path></svg>'
  },
  {
    id: "projects",
    label: "Projects",
    labelKey: "nav_projects",
    route: "projects",
    group: "Business",
    actionLabel: "Open projects",
    actionKey: "quick_add_action_open_projects",
    icon: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5"></rect><path d="M6 4l1-1h3l1 1"></path></svg>'
  },
  {
    id: "billable-expenses",
    label: "Billable Expenses",
    labelKey: "nav_billable_expenses",
    route: "billable-expenses",
    group: "Business",
    actionLabel: "Open billable expenses",
    actionKey: "quick_add_action_open_billable_expenses",
    icon: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 3h10v10H3z"></path><path d="M5 6h6M5 9h4"></path></svg>'
  }
];

function normalizeDynamicSidebarTier(value) {
  return String(value || "").trim().toLowerCase();
}

function getDynamicSidebarSubscription() {
  const profileSubscription = window.__LUNA_ME__?.subscription;
  if (profileSubscription && typeof profileSubscription === "object") {
    return profileSubscription;
  }

  try {
    return JSON.parse(localStorage.getItem("lb_subscription") || "null") || null;
  } catch (_) {
    return null;
  }
}

function getDynamicSidebarTier() {
  const subscription = getDynamicSidebarSubscription();
  const candidates = [
    subscription?.effectiveTier,
    subscription?.tier,
    subscription?.plan,
    subscription?.planCode,
    subscription?.plan_code,
    localStorage.getItem("tier")
  ];

  return candidates.map(normalizeDynamicSidebarTier).find(Boolean) || "free";
}

function hasDynamicSidebarQuickAddAccess() {
  const tier = getDynamicSidebarTier();
  return tier === "v1" || tier === "pro" || tier === "business" || tier === "v2";
}

function hasDynamicSidebarBusinessTier() {
  const tier = getDynamicSidebarTier();
  return tier === "business" || tier === "v2" || tier === "business_tier";
}

function getDynamicSidebarAvailableFeatures() {
  if (!hasDynamicSidebarQuickAddAccess()) {
    return [];
  }

  const allowBusiness = hasDynamicSidebarBusinessTier();
  return DYNAMIC_SIDEBAR_FEATURES.filter((feature) => {
    if (DYNAMIC_SIDEBAR_BUSINESS_FEATURE_IDS.has(feature.id)) {
      return allowBusiness;
    }
    return DYNAMIC_SIDEBAR_CORE_FEATURE_IDS.has(feature.id);
  });
}

function initDynamicSidebar() {
  const shell = document.querySelector("main.app-shell");
  const sidebar = shell?.querySelector(".app-sidebar");
  if (!shell || !sidebar) return;

  const availableFeatures = getDynamicSidebarAvailableFeatures();
  if (!availableFeatures.length) {
    sidebar.hidden = true;
    sidebar.setAttribute("aria-hidden", "true");
    sidebar.innerHTML = "";
    return;
  }

  sidebar.hidden = false;
  sidebar.removeAttribute("aria-hidden");

  const featureMap = new Map(availableFeatures.map((feature) => [feature.id, feature]));
  let favorites = getDynamicSidebarFavorites(featureMap, window.__LUNA_ME__?.ui_preferences);
  let draggedFeatureId = "";
  let shouldKeepLibraryOpen = false;

  sidebar.className = "app-sidebar app-sidebar--dynamic";
  sidebar.setAttribute("aria-label", "Favorites");

  const quickPanel = ensureDynamicSidebarQuickPanel();

  function render() {
    favorites = favorites.filter((id) => featureMap.has(id));
    const favoriteMarkup = favorites.map((id) => renderDynamicSidebarFavorite(featureMap.get(id))).join("");
    const groupedLibrary = availableFeatures.reduce((groups, feature) => {
      if (!groups[feature.group]) groups[feature.group] = [];
      groups[feature.group].push(feature);
      return groups;
    }, {});

    sidebar.innerHTML = `
      <div class="dynamic-sidebar-header">
        <div>
          <div class="sidebar-section-label">${escapeDynamicSidebarHtml(gT("quick_add_title", "Quick Add"))}</div>
        </div>
        <button type="button" class="dynamic-sidebar-manage" data-sidebar-manage aria-expanded="${String(shouldKeepLibraryOpen)}">${escapeDynamicSidebarHtml(shouldKeepLibraryOpen ? gT("common_done", "Done") : gT("common_add", "Add"))}</button>
      </div>
      <nav class="sidebar-nav dynamic-sidebar-favorites" data-sidebar-favorites aria-label="Quick add actions">
        ${favoriteMarkup}
      </nav>
      <div class="dynamic-sidebar-empty" data-sidebar-empty${favorites.length ? " hidden" : ""}><span class="dynamic-sidebar-empty-icon">+</span> ${escapeDynamicSidebarHtml(gT("quick_add_empty", "Click Add above to add quick-add shortcuts"))}</div>
      <div class="dynamic-sidebar-library" data-sidebar-library${shouldKeepLibraryOpen ? "" : " hidden"}>
        ${Object.keys(groupedLibrary).map((group) => `
          <div class="dynamic-sidebar-library-group">
            <div class="sidebar-section-label">${escapeDynamicSidebarHtml(group === "Business" ? gT("quick_add_group_business", "Business") : gT("quick_add_group_core", "Core"))}</div>
            ${groupedLibrary[group].map((feature) => renderDynamicSidebarLibraryItem(feature, favorites.includes(feature.id))).join("")}
          </div>
        `).join("")}
      </div>
    `;

    wireDynamicSidebarEvents();
  }

  function wireDynamicSidebarEvents() {
    const manageButton = sidebar.querySelector("[data-sidebar-manage]");
    const library = sidebar.querySelector("[data-sidebar-library]");
    const favoritesNav = sidebar.querySelector("[data-sidebar-favorites]");

    manageButton?.addEventListener("click", () => {
      shouldKeepLibraryOpen = !shouldKeepLibraryOpen;
      render();
    });

    favoritesNav?.addEventListener("dragover", (event) => {
      if (!draggedFeatureId) return;
      event.preventDefault();
      favoritesNav.classList.add("is-drag-target");
    });

    favoritesNav?.addEventListener("dragleave", () => {
      favoritesNav.classList.remove("is-drag-target");
    });

    favoritesNav?.addEventListener("drop", (event) => {
      if (!draggedFeatureId || !featureMap.has(draggedFeatureId)) return;
      event.preventDefault();
      favoritesNav.classList.remove("is-drag-target");
      const beforeId = event.target.closest("[data-favorite-id]")?.getAttribute("data-favorite-id") || "";
      addOrMoveDynamicSidebarFavorite(draggedFeatureId, beforeId);
    });

    sidebar.querySelectorAll("[data-feature-id]").forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        draggedFeatureId = item.getAttribute("data-feature-id") || "";
        event.dataTransfer?.setData("text/plain", draggedFeatureId);
        event.dataTransfer?.setDragImage?.(item, 12, 12);
      });
      item.addEventListener("dragend", () => {
        draggedFeatureId = "";
        favoritesNav?.classList.remove("is-drag-target");
      });
    });

    sidebar.querySelectorAll("[data-sidebar-add]").forEach((button) => {
      button.addEventListener("click", () => {
        addOrMoveDynamicSidebarFavorite(button.getAttribute("data-sidebar-add") || "");
      });
    });

    sidebar.querySelectorAll("[data-sidebar-remove]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.getAttribute("data-sidebar-remove") || "";
        favorites = favorites.filter((favoriteId) => favoriteId !== id);
        saveDynamicSidebarFavorites(favorites);
        closeDynamicSidebarQuickPanel(quickPanel);
        render();
      });
    });

    sidebar.querySelectorAll("[data-sidebar-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const feature = featureMap.get(button.getAttribute("data-sidebar-action") || "");
        if (feature) openDynamicSidebarQuickPanel(feature, button, quickPanel);
      });
    });
  }

  function addOrMoveDynamicSidebarFavorite(id, beforeId = "") {
    if (!featureMap.has(id)) return;
    favorites = favorites.filter((favoriteId) => favoriteId !== id);
    const beforeIndex = beforeId ? favorites.indexOf(beforeId) : -1;
    if (beforeIndex >= 0) {
      favorites.splice(beforeIndex, 0, id);
    } else {
      favorites.push(id);
    }
    shouldKeepLibraryOpen = true;
    saveDynamicSidebarFavorites(favorites);
    render();
  }

  render();

  const applyProfileFavorites = (profile) => {
    const nextFavorites = getDynamicSidebarFavorites(featureMap, profile?.ui_preferences);
    if (JSON.stringify(nextFavorites) === JSON.stringify(favorites)) {
      return;
    }
    favorites = nextFavorites;
    render();
  };

  if (window.__LUNA_ME__) {
    applyProfileFavorites(window.__LUNA_ME__);
  }

  window.addEventListener("lunaProfileReady", (event) => {
    applyProfileFavorites(event.detail);
  });
}

function getDynamicSidebarFavorites(featureMap, uiPreferences = null) {
  const profileFavorites = uiPreferences?.dynamic_sidebar_favorites;
  if (Array.isArray(profileFavorites)) {
    const valid = profileFavorites.filter((id) => featureMap.has(id));
    if (valid.length) {
      return Array.from(new Set(valid));
    }
  }
  return DYNAMIC_SIDEBAR_DEFAULT_FAVORITES.filter((id) => featureMap.has(id));
}

function saveDynamicSidebarFavorites(favorites) {
  const dedupedFavorites = Array.from(new Set(favorites));
  queueDynamicSidebarFavoritesSave(dedupedFavorites);
}

function getDynamicSidebarFeatureLabel(feature) {
  return gT(feature?.labelKey, feature?.label || "");
}

function getDynamicSidebarActionLabel(feature) {
  return gT(feature?.actionKey, feature?.actionLabel || gT("common_open", "Open"));
}

function queueDynamicSidebarFavoritesSave(favorites) {
  if (dynamicSidebarSaveTimer) {
    window.clearTimeout(dynamicSidebarSaveTimer);
  }

  dynamicSidebarSaveTimer = window.setTimeout(async () => {
    dynamicSidebarSaveTimer = null;
    if (typeof apiFetch !== "function" || !window.__LUNA_ME__?.id) {
      return;
    }

    try {
      const response = await apiFetch("/api/me/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dynamic_sidebar_favorites: favorites
        })
      });
      if (!response || !response.ok) {
        return;
      }
      const payload = await response.json().catch(() => null);
      if (window.__LUNA_ME__) {
        window.__LUNA_ME__.ui_preferences = payload?.ui_preferences || {
          ...(window.__LUNA_ME__.ui_preferences || {}),
          dynamic_sidebar_favorites: favorites
        };
      }
    } catch (_) {}
  }, 200);
}

function renderDynamicSidebarFavorite(feature) {
  if (!feature) return "";
  const receiptDot = feature.id === "receipts" ? '<span id="receiptsDot" class="sidebar-dot" hidden></span>' : "";
  const featureLabel = getDynamicSidebarFeatureLabel(feature);
  return `
    <div class="dynamic-sidebar-favorite" draggable="true" data-feature-id="${escapeDynamicSidebarAttr(feature.id)}" data-favorite-id="${escapeDynamicSidebarAttr(feature.id)}">
      <button type="button" class="sidebar-link dynamic-sidebar-link" data-sidebar-action="${escapeDynamicSidebarAttr(feature.id)}">
        <span class="sidebar-icon" aria-hidden="true">${feature.icon}</span>
        <span class="dynamic-sidebar-label">+ ${escapeDynamicSidebarHtml(featureLabel)}</span>
        ${receiptDot}
      </button>
      <button type="button" class="dynamic-sidebar-remove" data-sidebar-remove="${escapeDynamicSidebarAttr(feature.id)}" aria-label="${escapeDynamicSidebarAttr(`${gT("common_remove", "Remove")} ${featureLabel}`)}">&times;</button>
    </div>
  `;
}

function renderDynamicSidebarLibraryItem(feature, isAdded) {
  const featureLabel = getDynamicSidebarFeatureLabel(feature);
  return `
    <div class="dynamic-sidebar-library-item" draggable="true" data-feature-id="${escapeDynamicSidebarAttr(feature.id)}">
      <span class="sidebar-icon" aria-hidden="true">${feature.icon}</span>
      <span>${escapeDynamicSidebarHtml(featureLabel)}</span>
      <button type="button" data-sidebar-add="${escapeDynamicSidebarAttr(feature.id)}"${isAdded ? " disabled" : ""}>${escapeDynamicSidebarHtml(isAdded ? gT("quick_add_added", "Added") : gT("common_add", "Add"))}</button>
    </div>
  `;
}

function ensureDynamicSidebarQuickPanel() {
  let panel = document.getElementById("dynamicSidebarQuickPanel");
  if (panel) return panel;

  const backdrop = document.createElement("div");
  backdrop.id = "dynamicSidebarBackdrop";
  backdrop.className = "dynamic-sidebar-backdrop";
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  panel = document.createElement("aside");
  panel.id = "dynamicSidebarQuickPanel";
  panel.className = "dynamic-sidebar-quick-panel";
  panel.setAttribute("aria-label", "Quick action");
  panel.hidden = true;
  document.body.appendChild(panel);

  function tryClose() {
    const form = panel.querySelector("form");
    const hasInput = form && Array.from(form.elements).some((el) => {
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") return false;
      if (el.type === "file") return el.files && el.files.length > 0;
      return el.value && el.value.trim() !== "" && el.defaultValue !== el.value;
    });
    if (hasInput && !window.confirm("Close without saving? Your changes will be lost.")) return;
    closeDynamicSidebarQuickPanel(panel);
  }

  backdrop.addEventListener("click", tryClose);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) tryClose();
  });
  return panel;
}

function showDynamicSidebarBackdrop() {
  const backdrop = document.getElementById("dynamicSidebarBackdrop");
  if (backdrop) backdrop.hidden = false;
}

function hideDynamicSidebarBackdrop() {
  const backdrop = document.getElementById("dynamicSidebarBackdrop");
  if (backdrop) backdrop.hidden = true;
}

function openDynamicSidebarQuickPanel(feature, anchor, panel) {
  const anchorRect = anchor.getBoundingClientRect();
  const featureLabel = getDynamicSidebarFeatureLabel(feature);
  panel.hidden = false;
  panel.style.top = `${Math.max(68, Math.min(anchorRect.top, window.innerHeight - 420))}px`;
  showDynamicSidebarBackdrop();
  panel.innerHTML = `
    <div class="dynamic-sidebar-quick-header">
      <div>
        <div class="dynamic-sidebar-quick-kicker">${escapeDynamicSidebarHtml(gT("quick_add_title", "Quick Add"))}</div>
        <h2>${escapeDynamicSidebarHtml(featureLabel)}</h2>
      </div>
      <button type="button" data-quick-close aria-label="${escapeDynamicSidebarAttr(gT("quick_add_close_action", "Close quick action"))}">&times;</button>
    </div>
    <div class="dynamic-sidebar-quick-body" data-quick-body></div>
  `;
  panel.querySelector("[data-quick-close]")?.addEventListener("click", () => closeDynamicSidebarQuickPanel(panel));
  renderDynamicSidebarQuickAction(feature, panel.querySelector("[data-quick-body]"));
}

function closeDynamicSidebarQuickPanel(panel) {
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = "";
  hideDynamicSidebarBackdrop();
}

function renderDynamicSidebarQuickAction(feature, body) {
  if (!body) return;
  if (feature.id === "transactions") {
    renderQuickTransactionForm(body, feature);
    return;
  }
  if (feature.id === "receipts") {
    renderQuickReceiptForm(body, feature);
    return;
  }
  if (feature.id === "mileage") {
    renderQuickMileageForm(body, feature);
    return;
  }
  if (feature.id === "accounts") {
    renderQuickAccountForm(body, feature);
    return;
  }
  if (feature.id === "categories") {
    renderQuickCategoryForm(body, feature);
    return;
  }
  renderDynamicSidebarOpenPage(body, feature);
}

function renderDynamicSidebarOpenPage(body, feature) {
  body.innerHTML = `
    <div class="dynamic-sidebar-action-stack">
      <a class="dynamic-sidebar-primary-action" href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</a>
    </div>
  `;
}

function renderQuickTransactionForm(body, feature) {
  const today = new Date().toISOString().slice(0, 10);
  body.innerHTML = `
    <form class="dynamic-sidebar-form" data-quick-transaction-form>
      <label>Date<input name="date" type="date" value="${today}" required></label>
      <label>Type<select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label>
      <label>Description<input name="description" type="text" autocomplete="off" required></label>
      <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>
      <label>Account<select name="account_id" required><option value="">Loading...</option></select></label>
      <label>Category<select name="category_id" required><option value="">Loading...</option></select></label>
      <label>Note<textarea name="note" rows="2"></textarea></label>
      <div class="dynamic-sidebar-form-actions">
        <a href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(gT("common_open_page", "Open page"))}</a>
        <button type="submit">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</button>
      </div>
      <div class="dynamic-sidebar-form-message" data-quick-message></div>
    </form>
  `;

  const form = body.querySelector("[data-quick-transaction-form]");
  const accountSelect = form?.elements.account_id;
  const categorySelect = form?.elements.category_id;
  const typeSelect = form?.elements.type;
  let categories = [];

  Promise.all([
    dynamicSidebarFetchJson("/api/accounts"),
    dynamicSidebarFetchJson("/api/categories")
  ]).then(([accountsPayload, categoriesPayload]) => {
    const accounts = Array.isArray(accountsPayload) ? accountsPayload : accountsPayload?.accounts || [];
    categories = Array.isArray(categoriesPayload) ? categoriesPayload : categoriesPayload?.categories || [];
    accountSelect.innerHTML = `<option value="">Select account</option>${accounts.map((account) => `<option value="${escapeDynamicSidebarAttr(account.id)}">${escapeDynamicSidebarHtml(account.name || "Account")}</option>`).join("")}`;
    updateQuickTransactionCategories(categorySelect, categories, typeSelect.value);
  }).catch(() => {
    setDynamicSidebarMessage(form, "Unable to load accounts or categories.");
  });

  typeSelect?.addEventListener("change", () => {
    updateQuickTransactionCategories(categorySelect, categories, typeSelect.value);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setDynamicSidebarMessage(form, "");
    try {
      const response = await dynamicSidebarApiFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.elements.date.value,
          type: form.elements.type.value,
          description: form.elements.description.value.trim(),
          amount: form.elements.amount.value,
          account_id: form.elements.account_id.value,
          category_id: form.elements.category_id.value,
          note: form.elements.note.value.trim(),
          cleared: false,
          currency: getDynamicSidebarCurrency(),
          tax_treatment: form.elements.type.value === "income" ? "income" : "operating"
        })
      });
      await assertDynamicSidebarResponse(response, "Unable to save transaction.");
      form.reset();
      form.elements.date.value = today;
      setDynamicSidebarMessage(form, "Saved.");
      dispatchDynamicSidebarSaved("transactions");
    } catch (error) {
      setDynamicSidebarMessage(form, error.message || "Unable to save transaction.");
    } finally {
      submit.disabled = false;
    }
  });
}

function updateQuickTransactionCategories(select, categories, type) {
  if (!select) return;
  const normalizedType = type === "income" ? "income" : "expense";
  const options = categories.filter((category) => (category.kind || category.type) === normalizedType);
  select.innerHTML = `<option value="">Select category</option>${options.map((category) => `<option value="${escapeDynamicSidebarAttr(category.id)}">${escapeDynamicSidebarHtml(category.name || "Category")}</option>`).join("")}`;
}

function renderQuickReceiptForm(body, feature) {
  body.innerHTML = `
    <form class="dynamic-sidebar-form" data-quick-receipt-form>
      <label>Receipt file<input name="receipt" type="file" accept="image/*,application/pdf" required></label>
      <div class="dynamic-sidebar-form-actions">
        <a href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(gT("common_open_page", "Open page"))}</a>
        <button type="submit">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</button>
      </div>
      <div class="dynamic-sidebar-form-message" data-quick-message></div>
    </form>
  `;
  const form = body.querySelector("[data-quick-receipt-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = form.elements.receipt.files?.[0];
    if (!file) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setDynamicSidebarMessage(form, "");
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const response = await fetch(typeof buildApiUrl === "function" ? buildApiUrl("/api/receipts") : "/api/receipts", {
        method: "POST",
        credentials: "include",
        headers: {
          ...(typeof authHeader === "function" ? authHeader() : {}),
          ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
        },
        body: formData
      });
      await assertDynamicSidebarResponse(response, "Unable to upload receipt.");
      form.reset();
      setDynamicSidebarMessage(form, "Uploaded.");
      dispatchDynamicSidebarSaved("receipts");
    } catch (error) {
      setDynamicSidebarMessage(form, error.message || "Unable to upload receipt.");
    } finally {
      submit.disabled = false;
    }
  });
}

function renderQuickMileageForm(body, feature) {
  const today = new Date().toISOString().slice(0, 10);
  const distanceName = localStorage.getItem("lb_unit_metric") === "true" ? "km" : "miles";
  const distanceLabel = distanceName === "km" ? "Kilometres" : "Miles";
  body.innerHTML = `
    <form class="dynamic-sidebar-form" data-quick-mileage-form>
      <label>Date<input name="date" type="date" value="${today}" required></label>
      <label>Purpose<input name="purpose" type="text" autocomplete="off" required></label>
      <label>Destination<input name="destination" type="text" autocomplete="off"></label>
      <label>${distanceLabel}<input name="distance" type="number" min="0.1" step="0.1" inputmode="decimal" required></label>
      <div class="dynamic-sidebar-form-actions">
        <a href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(gT("common_open_page", "Open page"))}</a>
        <button type="submit">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</button>
      </div>
      <div class="dynamic-sidebar-form-message" data-quick-message></div>
    </form>
  `;
  const form = body.querySelector("[data-quick-mileage-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setDynamicSidebarMessage(form, "");
    try {
      const response = await dynamicSidebarApiFetch("/api/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_date: form.elements.date.value,
          purpose: form.elements.purpose.value.trim(),
          destination: form.elements.destination.value.trim(),
          [distanceName]: form.elements.distance.value
        })
      });
      await assertDynamicSidebarResponse(response, "Unable to save trip.");
      form.reset();
      form.elements.date.value = today;
      setDynamicSidebarMessage(form, "Saved.");
      dispatchDynamicSidebarSaved("mileage");
    } catch (error) {
      setDynamicSidebarMessage(form, error.message || "Unable to save trip.");
    } finally {
      submit.disabled = false;
    }
  });
}

function renderQuickAccountForm(body, feature) {
  body.innerHTML = `
    <form class="dynamic-sidebar-form" data-quick-account-form>
      <label>Name<input name="name" type="text" autocomplete="off" required></label>
      <label>Type<select name="type" required>
        <option value="checking">Checking</option>
        <option value="savings">Savings</option>
        <option value="credit_card">Credit card</option>
        <option value="loan">Loan</option>
        <option value="cash">Cash</option>
      </select></label>
      <div class="dynamic-sidebar-form-actions">
        <a href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(gT("common_open_page", "Open page"))}</a>
        <button type="submit">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</button>
      </div>
      <div class="dynamic-sidebar-form-message" data-quick-message></div>
    </form>
  `;
  const form = body.querySelector("[data-quick-account-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setDynamicSidebarMessage(form, "");
    try {
      const response = await dynamicSidebarApiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.elements.name.value.trim(),
          type: form.elements.type.value
        })
      });
      await assertDynamicSidebarResponse(response, "Unable to save account.");
      form.reset();
      setDynamicSidebarMessage(form, "Saved.");
      dispatchDynamicSidebarSaved("accounts");
    } catch (error) {
      setDynamicSidebarMessage(form, error.message || "Unable to save account.");
    } finally {
      submit.disabled = false;
    }
  });
}

function renderQuickCategoryForm(body, feature) {
  body.innerHTML = `
    <form class="dynamic-sidebar-form" data-quick-category-form>
      <label>Name<input name="name" type="text" autocomplete="off" required></label>
      <label>Type<select name="kind" required>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select></label>
      <div class="dynamic-sidebar-form-actions">
        <a href="${escapeDynamicSidebarAttr(feature.route)}">${escapeDynamicSidebarHtml(gT("common_open_page", "Open page"))}</a>
        <button type="submit">${escapeDynamicSidebarHtml(getDynamicSidebarActionLabel(feature))}</button>
      </div>
      <div class="dynamic-sidebar-form-message" data-quick-message></div>
    </form>
  `;
  const form = body.querySelector("[data-quick-category-form]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setDynamicSidebarMessage(form, "");
    try {
      const kind = form.elements.kind.value;
      const response = await dynamicSidebarApiFetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.elements.name.value.trim(),
          kind,
          color: kind === "income" ? "green" : "blue"
        })
      });
      await assertDynamicSidebarResponse(response, "Unable to save category.");
      form.reset();
      setDynamicSidebarMessage(form, "Saved.");
      dispatchDynamicSidebarSaved("categories");
    } catch (error) {
      setDynamicSidebarMessage(form, error.message || "Unable to save category.");
    } finally {
      submit.disabled = false;
    }
  });
}

async function dynamicSidebarApiFetch(url, options = {}) {
  if (typeof apiFetch === "function") {
    return apiFetch(url, options);
  }
  return fetch(url, {
    credentials: "include",
    ...options
  });
}

async function dynamicSidebarFetchJson(url) {
  const response = await dynamicSidebarApiFetch(url);
  await assertDynamicSidebarResponse(response, "Unable to load data.");
  return response.json().catch(() => []);
}

async function assertDynamicSidebarResponse(response, fallback) {
  if (!response || !response.ok) {
    const payload = response ? await response.json().catch(() => null) : null;
    throw new Error(payload?.error || fallback);
  }
}

function setDynamicSidebarMessage(form, message) {
  const node = form?.querySelector("[data-quick-message]");
  if (node) node.textContent = message || "";
}

function dispatchDynamicSidebarSaved(featureId) {
  window.dispatchEvent(new CustomEvent("lunaQuickAddSaved", { detail: { featureId } }));
  const feature = DYNAMIC_SIDEBAR_FEATURES.find((item) => item.id === featureId);
  if (feature && getDynamicSidebarRoute(window.location.pathname) === getDynamicSidebarRoute(feature.route)) {
    window.setTimeout(() => window.location.reload(), 550);
  }
}

function getDynamicSidebarCurrency() {
  const region = String(localStorage.getItem("lb_region") || localStorage.getItem("region") || window.LUNA_REGION || "us").toLowerCase();
  return region === "ca" || region === "canada" ? "CAD" : "USD";
}

function getDynamicSidebarRoute(value) {
  const raw = String(value || "").split(/[?#]/)[0];
  const segment = raw.split("/").filter(Boolean).pop() || "";
  return segment.replace(/\.html$/i, "");
}

function escapeDynamicSidebarHtml(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeDynamicSidebarAttr(value) {
  return escapeDynamicSidebarHtml(value);
}

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  injectSkipLink();
  renderCanonicalTopbarNavigation();
  initDynamicSidebar();
  injectMobileMenu();   // clones the normalized nav
  highlightNavigation(); // runs on all nav a elements including the drawer
  applyDateInputConstraints();
  markRequiredFields();
  disableNumberInputWheel();
  injectMobileDesktopLink();
  applyMileageNavLabel();
  window.addEventListener("lunaDistanceUnitChanged", applyMileageNavLabel);
  window.addEventListener("lunaLanguageChanged", applyMileageNavLabel);

  // Poll unread message count for the nav badge every 60 s
  var _globalMsgPollTimer = null;
  function stopGlobalUnreadPolling() {
    if (_globalMsgPollTimer) {
      clearInterval(_globalMsgPollTimer);
      _globalMsgPollTimer = null;
    }
  }

  void pollGlobalUnreadCount().then(function (shouldContinue) {
    if (shouldContinue === false) {
      stopGlobalUnreadPolling();
    }
  });

  _globalMsgPollTimer = setInterval(function () {
    void pollGlobalUnreadCount().then(function (shouldContinue) {
      if (shouldContinue === false) {
        stopGlobalUnreadPolling();
      }
    });
  }, 60000);
});

(function () {
  if (isDesktopViewRequested()) {
    try {
      localStorage.setItem(DESKTOP_VIEW_KEY, "true");
    } catch (_) {}
    applyDesktopViewport();
  }
})();

window.applyGlobalTheme = applyGlobalTheme;
window.setGlobalTheme = setGlobalTheme;
window.LUNA_TAX = {
  US_ESTIMATED_TAX_RATE,
  CANADA_ESTIMATED_TAX_RATES,
  DEFAULT_CA_ESTIMATED_TAX_RATE,
  resolveEstimatedTaxProfile,
  formatEstimatedTaxPercent
};

/* ── Field Validation Tooltip Bubble ─────────────────────────
   Shared across all pages. Shows a white floating bubble that
   points to a specific form field with a validation message.
   ──────────────────────────────────────────────────────────── */
(function () {
  let _tooltipTimer = null;
  let _dismissListeners = [];

  function _clearTooltipState() {
    if (_tooltipTimer) {
      clearTimeout(_tooltipTimer);
      _tooltipTimer = null;
    }
    _dismissListeners.forEach(function (entry) {
      entry.target.removeEventListener(entry.type, entry.fn);
    });
    _dismissListeners = [];
  }

  function hideFieldTooltip() {
    _clearTooltipState();
    const existing = document.getElementById("field-tooltip-bubble");
    if (existing) {
      existing.remove();
    }
  }

  function showFieldTooltip(fieldElement, message) {
    hideFieldTooltip();
    if (!fieldElement) return;

    const tooltip = document.createElement("div");
    tooltip.id = "field-tooltip-bubble";
    tooltip.className = "field-tooltip-bubble";
    tooltip.textContent = message || "Please fill in this required field.";
    const parent = fieldElement.parentNode;
    if (!parent) return;
    parent.insertBefore(tooltip, fieldElement.nextSibling);

    try {
      fieldElement.focus({ preventScroll: true });
    } catch (_) {}

    function dismiss() {
      hideFieldTooltip();
    }

    var listeners = [
      { target: fieldElement, type: "input", fn: dismiss },
      { target: fieldElement, type: "change", fn: dismiss },
      { target: document, type: "keydown", fn: dismiss },
      { target: document, type: "click", fn: dismiss }
    ];

    listeners.forEach(function (entry) {
      entry.target.addEventListener(entry.type, entry.fn);
    });
    _dismissListeners = listeners;

    _tooltipTimer = setTimeout(hideFieldTooltip, 6000);
  }

  window.showFieldTooltip = showFieldTooltip;
  window.hideFieldTooltip = hideFieldTooltip;
}());

/* =========================================================
   Cookie / Consent Banner — CASL + Quebec Law 25
   ========================================================= */
(function () {
  var CONSENT_KEY = 'lb_cookie_consent';
  var CONSENT_COOKIE_NAME = 'lb_cookie_consent';
  var CONSENT_VERSION = '1';

  function parseConsentRecord(value) {
    if (!value) return null;
    try {
      var parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!parsed || !parsed.decision) return null;
      return {
        decision: parsed.decision,
        version: String(parsed.version || CONSENT_VERSION),
        at: parsed.at || new Date().toISOString()
      };
    } catch (_) {
      return null;
    }
  }

  function getCookieRecord() {
    var cookieString = String(document.cookie || '');
    if (!cookieString) return null;
    var prefix = CONSENT_COOKIE_NAME + '=';
    var match = cookieString
      .split(';')
      .map(function (part) { return part.trim(); })
      .find(function (part) { return part.indexOf(prefix) === 0; });
    if (!match) return null;
    return parseConsentRecord(decodeURIComponent(match.slice(prefix.length)));
  }

  function persistConsentRecord(record) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    } catch (_) { /* ignore */ }
    try {
      document.cookie = CONSENT_COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(record)) +
        '; Max-Age=' + String(365 * 24 * 60 * 60) +
        '; Path=/; SameSite=Lax';
    } catch (_) { /* ignore */ }
  }

  function getConsentRecord() {
    var localRecord = null;
    try {
      localRecord = parseConsentRecord(localStorage.getItem(CONSENT_KEY) || 'null');
    } catch (_) {
      localRecord = null;
    }
    if (localRecord) return localRecord;
    var cookieRecord = getCookieRecord();
    if (cookieRecord) {
      persistConsentRecord(cookieRecord);
      return cookieRecord;
    }
    return null;
  }

  async function fetchServerConsentRecord() {
    if (typeof window.fetch !== 'function') {
      return null;
    }
    try {
      var headers = {};
      if (typeof getToken === 'function') {
        var token = getToken();
        if (token) {
          headers.Authorization = 'Bearer ' + token;
        }
      }
      var response = await window.fetch('/api/consent/cookie', {
        method: 'GET',
        credentials: 'include',
        headers: headers
      });
      if (!response || !response.ok) {
        return null;
      }
      var payload = await response.json().catch(function () { return null; });
      return parseConsentRecord(payload && payload.record);
    } catch (_) {
      return null;
    }
  }

  function setConsentRecord(decision) {
    var record = { decision: decision, version: CONSENT_VERSION, at: new Date().toISOString() };
    persistConsentRecord(record);
    // Persist to DB for compliance audit trail (best-effort, fire-and-forget)
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (typeof getToken === 'function') {
        var token = getToken();
        if (token) {
          headers.Authorization = 'Bearer ' + token;
        }
      }
      window.fetch('/api/consent/cookie', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ decision: decision, version: CONSENT_VERSION })
      }).catch(function () { /* ignore — localStorage record is the source of truth */ });
    } catch (_) { /* ignore */ }
  }

  async function needsBanner() {
    var record = getConsentRecord();
    if (!record || record.version !== CONSENT_VERSION) {
      var serverRecord = await fetchServerConsentRecord();
      if (serverRecord) {
        persistConsentRecord(serverRecord);
        record = serverRecord;
      }
    }
    if (!record) return true;
    if (record.version !== CONSENT_VERSION) return true;
    return false;
  }

  function tBanner(key, fallback) {
    return (typeof window.t === 'function') ? (window.t(key) || fallback) : fallback;
  }

  function buildBanner() {
    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');

    var msg = document.createElement('span');
    msg.className = 'cookie-consent-message';
    msg.setAttribute('data-i18n', 'cookie_banner_message');
    msg.textContent = tBanner('cookie_banner_message',
      'We use essential cookies for authentication and preferences. If we ever add analytics or non-essential tracking, we will ask for your consent first.');

    var privacyLink = document.createElement('a');
    privacyLink.className = 'cookie-consent-link';
    privacyLink.href = '/privacy';
    privacyLink.setAttribute('data-i18n', 'cookie_banner_privacy_link');
    privacyLink.textContent = tBanner('cookie_banner_privacy_link', 'Privacy Policy');

    var btnAccept = document.createElement('button');
    btnAccept.type = 'button';
    btnAccept.className = 'cookie-consent-button cookie-consent-button-accept';
    btnAccept.setAttribute('data-i18n', 'cookie_banner_accept');
    btnAccept.textContent = tBanner('cookie_banner_accept', 'Accept');

    var btnDecline = document.createElement('button');
    btnDecline.type = 'button';
    btnDecline.className = 'cookie-consent-button cookie-consent-button-decline';
    btnDecline.setAttribute('data-i18n', 'cookie_banner_decline');
    btnDecline.textContent = tBanner('cookie_banner_decline', 'Decline');

    btnAccept.addEventListener('click', function () {
      setConsentRecord('accepted');
      banner.remove();
    });

    btnDecline.addEventListener('click', function () {
      setConsentRecord('declined');
      banner.remove();
    });

    banner.appendChild(msg);
    banner.appendChild(privacyLink);
    banner.appendChild(btnAccept);
    banner.appendChild(btnDecline);
    return banner;
  }

  async function initCookieBanner() {
    if (!(await needsBanner())) return;
    var banner = buildBanner();
    document.body.appendChild(banner);

    // Re-translate if language changes after banner is shown
    window.addEventListener('lunaLanguageChanged', function () {
      var b = document.getElementById('cookie-consent-banner');
      if (!b) return;
      b.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (typeof window.t === 'function') {
          var text = window.t(key);
          if (text) el.textContent = text;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { void initCookieBanner(); });
  } else {
    void initCookieBanner();
  }

  window.cookieConsent = {
    getRecord: getConsentRecord,
    hasAccepted: function () {
      var r = getConsentRecord();
      return r && r.decision === 'accepted';
    }
  };
}());

/* =========================================================
   Public page language switcher
   Used by privacy.js, terms.js, and legal.js so public visitors
   can switch language without being signed in.
   ========================================================= */
function initPublicLanguageSwitcher(getTitleKey) {
  var footer = document.querySelector("footer");
  if (!footer) return;

  var wrapper = document.createElement("p");
  wrapper.className = "public-lang-switcher";

  var select = document.createElement("select");
  select.setAttribute("aria-label", "Language / Langue");
  select.className = "lang-select-public";

  var langs = [
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" }
  ];
  var current = typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en";
  langs.forEach(function (l) {
    var opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.label;
    if (l.code === current) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", function () {
    if (typeof setCurrentLanguage === "function") {
      setCurrentLanguage(select.value);
    }
    if (typeof t === "function" && getTitleKey) {
      document.title = "InEx Ledger - " + t(getTitleKey());
    }
  });

  wrapper.appendChild(select);
  footer.appendChild(wrapper);
}

window.initPublicLanguageSwitcher = initPublicLanguageSwitcher;
