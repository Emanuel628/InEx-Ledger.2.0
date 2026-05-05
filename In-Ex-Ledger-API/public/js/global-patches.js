/* Global app behavior helpers loaded after global.js. */
(function () {
  function loadScriptOnce(src, id) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  loadScriptOnce("/js/sidebar-multiselect.js?v=20260505b", "sidebar-multiselect-js");
  loadScriptOnce("/js/quick-add-entitlements.js?v=20260505a", "quick-add-entitlements-js");
})();
