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
      '<span class="nav-msg-badge" aria-label="unread messages" data-count="0"></span>';
    nav.appendChild(link);
  });
}

function pollGlobalUnreadCount() {
  var token = "";
  try { token = localStorage.getItem("token") || ""; } catch (_) {}
  if (!token) return Promise.resolve(false);

  if (typeof apiFetch === "function") {
    return apiFetch("/api/messages/unread-count")
      .then(function (response) {
        if (!response) return false;  // null = auth redirect occurred; stop polling
        if (!response.ok) return !response || response.status === 401 ? false : true;
        return response.json().then(function (data) {
          if (!data) return true;
          var count = data.count || 0;
          document.querySelectorAll(".nav-msg-badge").forEach(function (badge) {
            badge.setAttribute("data-count", String(count));
            badge.textContent = count > 99 ? "99+" : (count > 0 ? String(count) : "");
          });
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
        document.querySelectorAll(".nav-msg-badge").forEach(function (badge) {
          badge.setAttribute("data-count", String(count));
          badge.textContent = count > 99 ? "99+" : (count > 0 ? String(count) : "");
        });
        return true;
      });
    })
    .catch(function () { return true; });
}

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  injectSkipLink();
  injectHelpNavLink();
  injectMessagesNavLink();
  injectMobileMenu();   // clones nav after Help/Messages are injected
  highlightNavigation(); // runs on all nav a elements including the drawer
  applyDateInputConstraints();
  injectMobileDesktopLink();

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
  var CONSENT_VERSION = '1';

  function getConsentRecord() {
    try {
      return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function setConsentRecord(decision) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      decision: decision,
      version: CONSENT_VERSION,
      at: new Date().toISOString()
    }));
  }

  function needsBanner() {
    var record = getConsentRecord();
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

  function initCookieBanner() {
    if (!needsBanner()) return;
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
    document.addEventListener('DOMContentLoaded', initCookieBanner);
  } else {
    initCookieBanner();
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
