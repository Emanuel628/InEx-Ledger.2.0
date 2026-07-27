import { useState } from 'react'
import {
  BANK_CSV_HELP,
  GENERIC_STEPS,
  HELPER_COPY,
  IMPORT_REVIEW_WARNING,
  PRIVACY_COPY,
  WARNING_COPY,
  type BankCsvHelpEntry,
} from '../lib/bankCsvHelp'

function BankCsvHelpGuide({ region }: { region: 'US' | 'CA' }) {
  const banks = BANK_CSV_HELP[region] || []
  const [selectedId, setSelectedId] = useState('')
  const selected = banks.find((entry) => entry.id === selectedId) || null

  return (
    <div className="bank-csv-help-panel">
      <p className="bank-help-intro">{HELPER_COPY}</p>

      <div className="bank-help-picker">
        <label className="bank-help-label" htmlFor="bankCsvHelpSelect">Choose your bank</label>
        <select id="bankCsvHelpSelect" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Choose your bank</option>
          {banks.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
        </select>
      </div>

      {selected ? <BankCsvHelpInstructions entry={selected} /> : null}

      <p className="bank-help-warning">{WARNING_COPY}</p>
      <p className="bank-help-privacy">{PRIVACY_COPY}</p>
      <p className="bank-help-review-warning">{IMPORT_REVIEW_WARNING}</p>
    </div>
  )
}

function BankCsvHelpInstructions({ entry }: { entry: BankCsvHelpEntry }) {
  return (
    <div className="bank-help-instructions">
      <h4 className="bank-help-bank-name">{entry.name}</h4>
      <ol className="bank-help-steps">
        {(entry.steps.length ? entry.steps : GENERIC_STEPS).map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="bank-help-desktop-note">
        CSV downloads are usually easier from desktop or web banking than from the mobile app.
      </p>
      {entry.note ? <p className="bank-help-disclaimer">{entry.note}</p> : null}
      {entry.officialHelpUrl ? (
        <a className="secondary-button bank-help-link" href={entry.officialHelpUrl} target="_blank" rel="noopener noreferrer">
          {entry.helpLinkLabel || 'Open official bank help'}
        </a>
      ) : null}
    </div>
  )
}

export default BankCsvHelpGuide
