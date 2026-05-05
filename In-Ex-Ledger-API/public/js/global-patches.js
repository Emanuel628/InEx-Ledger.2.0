/* Global app behavior patches loaded after global.js.
   Keep this file small and targeted; move fixes into the main modules when
   the shared shell is refactored. */
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
})();
