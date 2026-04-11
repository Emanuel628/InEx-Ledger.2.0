/* =========================================================
   Privacy Policy Page JS
   ========================================================= */

init();

function init() {
  if (typeof t === "function") {
    document.title = `InEx Ledger - ${t("footer_privacy")}`;
  }
  initPublicLanguageSwitcher();
}

/**
 * Injects a small language selector into the footer of public legal pages.
 * Uses the same setCurrentLanguage() from i18n.js that the rest of the app uses.
 */
function initPublicLanguageSwitcher() {
  var footer = document.querySelector("footer");
  if (!footer) return;

  var wrapper = document.createElement("p");
  wrapper.className = "public-lang-switcher";

  var select = document.createElement("select");
  select.setAttribute("aria-label", "Language / Langue");
  select.className = "lang-select-public";

  var langs = [
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" }
  ];
  var current = typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en";
  langs.forEach(function (l) {
    var opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.label;
    if (l.code === current) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", function () {
    if (typeof setCurrentLanguage === "function") {
      setCurrentLanguage(select.value);
    }
    if (typeof t === "function") {
      document.title = "InEx Ledger - " + t("footer_privacy");
    }
  });

  wrapper.appendChild(select);
  footer.appendChild(wrapper);
}
