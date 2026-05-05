/* Early theme bootstrap
   Runs before page CSS finishes loading so dark mode can style landing/auth/app
   pages on first paint instead of waiting for global.js at the bottom of body. */
(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("lb_theme") === "dark" ? "dark" : "light";
  } catch (_) {
    theme = "light";
  }

  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);

  function syncBodyTheme() {
    if (!document.body) return;
    document.body.classList.remove("dark", "light");
    document.body.classList.add(theme);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncBodyTheme, { once: true });
  } else {
    syncBodyTheme();
  }
})();
