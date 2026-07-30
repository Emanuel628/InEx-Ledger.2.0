// Region-aware "how to download a bank CSV" reference content.
// Ported from the legacy app's public/js/bank-csv-help.js so the guidance
// stays word-for-word the same as what users saw in InEx Ledger 2.0.

export type BankCsvHelpEntry = {
  id: string
  name: string
  helpLinkLabel: string
  officialHelpUrl: string
  steps: string[]
  note: string
}

const STEP_NOTE = 'Steps may vary by account type.'
const OTHER_BANK_NOTE =
  'If your bank only provides PDF statements, use manual entry for now. ' +
  "InEx Ledger's CSV import works best with CSV or spreadsheet transaction exports."

export const HELPER_COPY =
  'Most banks provide CSV downloads from their website, usually under ' +
  'account activity, transactions, download, or export. If the mobile app ' +
  'does not show a CSV option, try online banking from a desktop browser.'

export const WARNING_COPY =
  'CSV files are for importing activity into InEx Ledger. They are not the ' +
  'same as official bank statements. Keep your official monthly statements ' +
  'for proof.'

export const PRIVACY_COPY =
  'Only upload CSV files you downloaded from your bank. Do not upload ' +
  'passwords, screenshots, or full statements unless the app specifically ' +
  'asks for them.'

export const GENERIC_FALLBACK =
  'Most banks let you download transactions from online banking under ' +
  'Activity, Transactions, Download, Export, or Statements. Choose CSV, ' +
  'spreadsheet, or comma-separated values when available.'

export const GENERIC_STEPS = [
  'Sign in to your bank from a web browser.',
  'Open the account you want to import.',
  'Look for Activity, Transactions, Download, Export, or Statements.',
  'Choose CSV, spreadsheet, or comma-separated values if available.',
  'Select the date range you want to import.',
  'Download the file, then upload it here.',
]

// New for v3: every imported row lands in review, so callers should always
// show this alongside the bank guidance above.
export const IMPORT_REVIEW_WARNING =
  'Every CSV import needs a manual review. Imported transactions will not have ' +
  'receipts attached yet, and the category/tax-line mapping is a best guess, ' +
  'not a guarantee it is correct — check each imported transaction before ' +
  'relying on it for your books or taxes.'

function bank(id: string, name: string, officialHelpUrl: string): BankCsvHelpEntry {
  return {
    id,
    name,
    helpLinkLabel: 'Open official bank help',
    officialHelpUrl,
    steps: [
      `Sign in to ${name} from a web browser.`,
      'Open the account you want to import.',
      'Look for activity, transactions, download, or export.',
      'Choose CSV or spreadsheet format when available.',
      'Save the file, then upload it here.',
    ],
    note: STEP_NOTE,
  }
}

function otherBank(region: 'US' | 'CA'): BankCsvHelpEntry {
  return {
    id: region === 'CA' ? 'other-ca' : 'other-us',
    name: 'Other bank',
    helpLinkLabel: '',
    officialHelpUrl: '',
    steps: GENERIC_STEPS.slice(),
    note: OTHER_BANK_NOTE,
  }
}

export const BANK_CSV_HELP: Record<'US' | 'CA', BankCsvHelpEntry[]> = {
  US: [
    bank('chase', 'Chase', 'https://www.chase.com/digital/online-banking'),
    bank('boa', 'Bank of America', 'https://www.bankofamerica.com/online-banking/'),
    bank('wellsfargo', 'Wells Fargo', 'https://www.wellsfargo.com/online-banking/'),
    bank('capitalone', 'Capital One', 'https://www.capitalone.com/help-center/'),
    bank('citi', 'Citi', 'https://online.citi.com'),
    bank('usbank', 'U.S. Bank', 'https://www.usbank.com/online-mobile-banking.html'),
    bank('tdbank-us', 'TD Bank (U.S.)', 'https://www.td.com/us/en/personal-banking/online-banking'),
    bank('pnc', 'PNC', 'https://www.pnc.com/en/customer-service.html'),
    bank('truist', 'Truist', 'https://www.truist.com/online-banking'),
    bank('navyfederal', 'Navy Federal', 'https://www.navyfederal.org/services/online-banking.html'),
    bank('discover', 'Discover', 'https://www.discover.com/online-banking/'),
    bank('amex', 'American Express', 'https://www.americanexpress.com/en-us/account/'),
    otherBank('US'),
  ],
  CA: [
    bank('rbc', 'RBC', 'https://www.rbcroyalbank.com/ways-to-bank/online-banking/index.html'),
    bank('td-ca', 'TD Canada Trust', 'https://www.td.com/ca/en/personal-banking/how-to/easyweb-online-banking'),
    bank('scotiabank', 'Scotiabank', 'https://www.scotiabank.com/ca/en/personal/ways-to-bank/digital-banking.html'),
    bank('bmo', 'BMO', 'https://www.bmo.com/main/personal/ways-to-bank/online-banking/'),
    bank('cibc', 'CIBC', 'https://www.cibc.com/en/personal-banking/ways-to-bank/how-to/online-banking.html'),
    bank('tangerine', 'Tangerine', 'https://www.tangerine.ca/en/help'),
    bank('nationalbank', 'National Bank', 'https://www.nbc.ca/personal/accounts/online-banking.html'),
    bank('desjardins', 'Desjardins', 'https://www.desjardins.com/ca/support/index.jsp'),
    bank('capitalone-ca', 'Capital One Canada', 'https://www.capitalone.ca/support/'),
    otherBank('CA'),
  ],
}
