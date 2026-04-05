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
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.split("/").pop() === path) {
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
  return String(region || "").toUpperCase() === "CA" ? "CA" : "US";
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

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  highlightNavigation();
  applyDateInputConstraints();
});

window.applyGlobalTheme = applyGlobalTheme;
window.setGlobalTheme = setGlobalTheme;
window.LUNA_TAX = {
  US_ESTIMATED_TAX_RATE,
  CANADA_ESTIMATED_TAX_RATES,
  DEFAULT_CA_ESTIMATED_TAX_RATE,
  resolveEstimatedTaxProfile,
  formatEstimatedTaxPercent
};
