/* =========================================================
   Terms of Service Page JS
   ========================================================= */

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("footer_terms")}`;
  }
  console.log("Terms page loaded.");
}
