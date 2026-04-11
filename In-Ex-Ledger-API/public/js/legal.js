/* =========================================================
   Legal Page JS
   ========================================================= */

// Legal pages are public by design

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("legal_title")}`;
  }
  if (typeof initPublicLanguageSwitcher === "function") {
    initPublicLanguageSwitcher(function () { return "legal_title"; });
  }
}
