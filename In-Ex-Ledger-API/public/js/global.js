/* Global helpers shared across pages */

const DEFAULT_THEME = "light";
const THEME_VERSION = "2";

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

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  highlightNavigation();
  applyDateInputConstraints();
});

window.applyGlobalTheme = applyGlobalTheme;
window.setGlobalTheme = setGlobalTheme;
