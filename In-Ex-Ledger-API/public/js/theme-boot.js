/* Early theme bootstrap
   Dark mode is temporarily disabled while the design is revisited.

   Do not delete dark-mode CSS or theme code. This boot file simply forces the
   active runtime theme to light so previous localStorage settings or system/PC
   dark preferences cannot switch the app into dark mode for now.
*/
(function () {
  var theme = "light";

  try {
    localStorage.setItem("lb_theme", "light");
    localStorage.setItem("lb_theme_version", "3");
  } catch (_) {}

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
