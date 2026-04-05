/* =========================================================
   Legal Page JS
   ========================================================= */

// Legal pages are public by design

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("legal_title")}`;
  }
  console.log("Legal page loaded.");
}
