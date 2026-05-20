/*
 * bank-csv-help.js - region-aware "how to download a bank CSV" helper.
 *
 * The panel uses the active business region already known by the app. It never
 * asks the user to choose a region. Unknown or invalid regions fall back to
 * generic CSV-download guidance.
 *
 * Exposes:
 *   window.BankCsvHelp.render(container, region)
 *   window.BankCsvHelp.BANK_CSV_HELP
 */
(function () {
  "use strict";

  const STEP_NOTE = "Steps may vary by account type.";
  const OTHER_BANK_NOTE =
    "If your bank only provides PDF statements, use manual entry for now. " +
    "InEx Ledger's CSV import works best with CSV or spreadsheet transaction exports.";

  const HELPER_COPY =
    "Most banks provide CSV downloads from their website, usually under " +
    "account activity, transactions, download, or export. If the mobile app " +
    "does not show a CSV option, try online banking from a desktop browser.";

  const WARNING_COPY =
    "CSV files are for importing activity into InEx Ledger. They are not the " +
    "same as official bank statements. Keep your official monthly statements " +
    "for proof.";

  const PRIVACY_COPY =
    "Only upload CSV files you downloaded from your bank. Do not upload " +
    "passwords, screenshots, or full statements unless the app specifically " +
    "asks for them.";

  const GENERIC_FALLBACK =
    "Most banks let you download transactions from online banking under " +
    "Activity, Transactions, Download, Export, or Statements. Choose CSV, " +
    "spreadsheet, or comma-separated values when available.";

  const GENERIC_STEPS = [
    "Sign in to your bank from a web browser.",
    "Open the account you want to import.",
    "Look for Activity, Transactions, Download, Export, or Statements.",
    "Choose CSV, spreadsheet, or comma-separated values if available.",
    "Select the date range you want to import.",
    "Download the file, then upload it here."
  ];

  function bank(id, region, name, officialHelpUrl) {
    return {
      id,
      region,
      name,
      helpLinkLabel: "Open official bank help",
      officialHelpUrl,
      steps: [
        "Sign in to " + name + " from a web browser.",
        "Open the account you want to import.",
        "Look for activity, transactions, download, or export.",
        "Choose CSV or spreadsheet format when available.",
        "Save the file, then upload it here."
      ],
      note: STEP_NOTE
    };
  }

  function otherBank(region, name) {
    return {
      id: region === "CA" ? "other-ca" : "other-us",
      region,
      name,
      helpLinkLabel: "",
      officialHelpUrl: "",
      steps: GENERIC_STEPS.slice(),
      note: OTHER_BANK_NOTE
    };
  }

  const BANK_CSV_HELP = {
    US: [
      bank("chase", "US", "Chase", "https://www.chase.com/digital/online-banking"),
      bank("boa", "US", "Bank of America", "https://www.bankofamerica.com/online-banking/"),
      bank("wellsfargo", "US", "Wells Fargo", "https://www.wellsfargo.com/online-banking/"),
      bank("capitalone", "US", "Capital One", "https://www.capitalone.com/help-center/"),
      bank("citi", "US", "Citi", "https://online.citi.com"),
      bank("usbank", "US", "U.S. Bank", "https://www.usbank.com/online-mobile-banking.html"),
      bank("tdbank-us", "US", "TD Bank (U.S.)", "https://www.td.com/us/en/personal-banking/online-banking"),
      bank("pnc", "US", "PNC", "https://www.pnc.com/en/customer-service.html"),
      bank("truist", "US", "Truist", "https://www.truist.com/online-banking"),
      bank("navyfederal", "US", "Navy Federal", "https://www.navyfederal.org/services/online-banking.html"),
      bank("discover", "US", "Discover", "https://www.discover.com/online-banking/"),
      bank("amex", "US", "American Express", "https://www.americanexpress.com/en-us/account/"),
      otherBank("US", "Other bank")
    ],
    CA: [
      bank("rbc", "CA", "RBC", "https://www.rbcroyalbank.com/ways-to-bank/online-banking/index.html"),
      bank("td-ca", "CA", "TD Canada Trust", "https://www.td.com/ca/en/personal-banking/how-to/easyweb-online-banking"),
      bank("scotiabank", "CA", "Scotiabank", "https://www.scotiabank.com/ca/en/personal/ways-to-bank/digital-banking.html"),
      bank("bmo", "CA", "BMO", "https://www.bmo.com/main/personal/ways-to-bank/online-banking/"),
      bank("cibc", "CA", "CIBC", "https://www.cibc.com/en/personal-banking/ways-to-bank/how-to/online-banking.html"),
      bank("tangerine", "CA", "Tangerine", "https://www.tangerine.ca/en/help"),
      bank("nationalbank", "CA", "National Bank", "https://www.nbc.ca/personal/accounts/online-banking.html"),
      bank("desjardins", "CA", "Desjardins", "https://www.desjardins.com/ca/support/index.jsp"),
      bank("capitalone-ca", "CA", "Capital One Canada", "https://www.capitalone.ca/support/"),
      otherBank("CA", "Other bank")
    ]
  };

  function normalizeRegion(region) {
    const value = String(region || "").trim().toUpperCase();
    return value === "US" || value === "CA" ? value : null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderSteps(target, steps) {
    const list = el("ol", "bank-help-steps");
    steps.forEach((step) => list.appendChild(el("li", null, step)));
    target.appendChild(list);
  }

  function renderBankInstructions(target, bankEntry) {
    target.replaceChildren();
    if (!bankEntry) return;

    target.appendChild(el("h4", "bank-help-bank-name", bankEntry.name));
    renderSteps(target, bankEntry.steps);
    target.appendChild(
      el(
        "p",
        "bank-help-desktop-note",
        "CSV downloads are usually easier from desktop or web banking than from the mobile app."
      )
    );

    if (bankEntry.note) {
      target.appendChild(el("p", "bank-help-disclaimer", bankEntry.note));
    }

    if (bankEntry.officialHelpUrl) {
      const link = document.createElement("a");
      link.className = "button button-secondary bank-help-link";
      link.href = bankEntry.officialHelpUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = bankEntry.helpLinkLabel || "Open official bank help";
      target.appendChild(link);
    }
  }

  function render(container, region) {
    if (!container) return;
    container.replaceChildren();

    const normalizedRegion = normalizeRegion(region);

    container.appendChild(el("h3", "bank-help-title", "Need help downloading a bank CSV?"));
    container.appendChild(el("p", "bank-help-intro", HELPER_COPY));

    if (!normalizedRegion) {
      container.appendChild(el("p", "bank-help-generic", GENERIC_FALLBACK));
      renderSteps(container, GENERIC_STEPS);
      container.appendChild(el("p", "bank-help-desktop-note", OTHER_BANK_NOTE));
    } else {
      const banks = BANK_CSV_HELP[normalizedRegion] || [];
      const fieldWrap = el("div", "bank-help-picker");
      const label = el("label", "bank-help-label", "Choose your bank");
      label.setAttribute("for", "bankCsvHelpSelect");

      const select = el("select", "bank-help-select");
      select.id = "bankCsvHelpSelect";
      select.name = "bankCsvHelpSelect";

      const placeholder = el("option", null, "Choose your bank");
      placeholder.value = "";
      select.appendChild(placeholder);

      banks.forEach((entry) => {
        const option = el("option", null, entry.name);
        option.value = entry.id;
        select.appendChild(option);
      });

      fieldWrap.appendChild(label);
      fieldWrap.appendChild(select);
      container.appendChild(fieldWrap);

      const instructions = el("div", "bank-help-instructions");
      container.appendChild(instructions);

      select.addEventListener("change", function () {
        const selected = banks.find((entry) => entry.id === select.value) || null;
        renderBankInstructions(instructions, selected);
      });
    }

    container.appendChild(el("p", "bank-help-warning", WARNING_COPY));
    container.appendChild(el("p", "bank-help-privacy", PRIVACY_COPY));
  }

  window.BankCsvHelp = {
    render,
    BANK_CSV_HELP
  };
})();
