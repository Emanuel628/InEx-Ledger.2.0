/* Global helpers shared across pages */

const DEFAULT_THEME = "light";
const THEME_VERSION = "2";
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

function resolveSavedTheme() {
  const storedVersion = localStorage.getItem("lb_theme_version");
  if (storedVersion !== THEME_VERSION) {
    localStorage.setItem("lb_theme", DEFAULT_THEME);
    localStorage.setItem("lb_theme_version", THEME_VERSION);
    return DEFAULT_THEME;
  }

  return localStorage.getItem("lb_theme") || DEFAULT_THEME;
}

function applyGlobalTheme() {
  const savedTheme = resolveSavedTheme();
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.classList.remove("dark", "light");
  document.body.classList.add(savedTheme);
}

function setGlobalTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  localStorage.setItem("lb_theme", normalized);
  localStorage.setItem("lb_theme_version", THEME_VERSION);
  document.documentElement.setAttribute("data-theme", normalized);
  document.body.classList.remove("dark", "light");
  document.body.classList.add(normalized);
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("lunaThemeChanged", { detail: normalized }));
  }
  return normalized;
}

function highlightNavigation() {
  const normalizeRoute = (value) => {
    const raw = String(value || "").split(/[?#]/)[0];
    const segment = raw.split("/").filter(Boolean).pop() || "landing";
    return segment.replace(/\.html$/i, "") || "landing";
  };

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
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Open navigation menu");
    btn.innerHTML = HAMBURGER_SVG;
    document.body.style.overflow = "";
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
    link.href = "help";
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
    link.href = "messages";
    link.setAttribute("data-nav-messages", "true");
    link.innerHTML =
      '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"></path><path d="M2 4l6 5 6-5"></path></svg></span>' +
      '<span>Messages</span>' +
      '<span class="nav-msg-badge" aria-label="unread messages" style="display:none"></span>';
    nav.appendChild(link);
  });
}

function pollGlobalUnreadCount() {
  var token = "";
  try { token = localStorage.getItem("token") || ""; } catch (_) {}
  if (!token) return;

  fetch("/api/messages/unread-count", {
    headers: { Authorization: "Bearer " + token }
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      var count = data.count || 0;
      document.querySelectorAll(".nav-msg-badge").forEach(function (badge) {
        badge.setAttribute("data-count", String(count));
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.style.display = count > 0 ? "" : "none";
      });
    })
    .catch(function () {});
}

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  injectHelpNavLink();
  injectMessagesNavLink();
  injectMobileMenu();   // clones nav after Help/Messages are injected
  highlightNavigation(); // runs on all nav a elements including the drawer
  applyDateInputConstraints();
  injectMobileDesktopLink();

  // Poll unread message count for the nav badge every 60 s
  pollGlobalUnreadCount();
  var _globalMsgPollTimer = setInterval(function () {
    var t = "";
    try { t = localStorage.getItem("token") || ""; } catch (_) {}
    if (!t) {
      clearInterval(_globalMsgPollTimer);
      return;
    }
    pollGlobalUnreadCount();
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
    document.body.appendChild(tooltip);

    const rect = fieldElement.getBoundingClientRect();
    const TOOLTIP_MAX_WIDTH = 280;
    let left = rect.left;
    if (left + TOOLTIP_MAX_WIDTH > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - TOOLTIP_MAX_WIDTH - 8);
    }
    tooltip.style.position = "fixed";
    tooltip.style.top = (rect.bottom + 8) + "px";
    tooltip.style.left = left + "px";

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
