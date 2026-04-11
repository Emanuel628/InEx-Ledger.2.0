/* =========================================================
   Terms of Service Page JS
   ========================================================= */

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("footer_terms")}`;
  }
  if (typeof initPublicLanguageSwitcher === "function") {
    initPublicLanguageSwitcher(function () { return "footer_terms"; });
  }
}
