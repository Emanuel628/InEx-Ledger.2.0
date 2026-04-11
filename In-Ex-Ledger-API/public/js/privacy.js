/* =========================================================
   Privacy Policy Page JS
   ========================================================= */

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("footer_privacy")}`;
  }
  if (typeof initPublicLanguageSwitcher === "function") {
    initPublicLanguageSwitcher(function () { return "footer_privacy"; });
  }
}
