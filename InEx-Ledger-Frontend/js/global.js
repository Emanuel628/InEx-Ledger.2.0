/* Global helpers shared across pages */

function applyGlobalTheme() {
  const savedTheme = localStorage.getItem("lb_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.classList.remove("dark", "light");
  document.body.classList.add(savedTheme);
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

document.addEventListener("DOMContentLoaded", () => {
  applyGlobalTheme();
  highlightNavigation();
});