import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

type ExportHistoryItem = {
  id: number
  name: string
  format: 'PDF' | 'CSV'
  mode: string
  period: string
  status: 'Current' | 'Stale'
  generated: string
}

const readinessItems = [
  { label: 'Business profile', detail: 'Name, address, and filing region are present.', ready: true },
  { label: 'Tax categories', detail: '2 categories still need review before final export.', ready: false },
  { label: 'Receipts', detail: '4 receipts are unlinked or need more information.', ready: false },
  { label: 'Mileage', detail: 'Trip and vehicle-cost records are included in the package.', ready: true },
]

const exportHistory: ExportHistoryItem[] = [
  {
    id: 1,
    name: 'Schedule C workpaper - May 2024',
    format: 'PDF',
    mode: 'CPA workpaper',
    period: 'May 1 - May 31, 2024',
    status: 'Current',
    generated: 'Jun 2, 2024',
  },
  {
    id: 2,
    name: 'Ledger detail - Q1 2024',
    format: 'CSV',
    mode: 'Draft',
    period: 'Jan 1 - Mar 31, 2024',
    status: 'Stale',
    generated: 'Apr 5, 2024',
  },
  {
    id: 3,
    name: 'Tax package - 2023',
    format: 'PDF',
    mode: 'Finalized',
    period: 'Jan 1 - Dec 31, 2023',
    status: 'Current',
    generated: 'Jan 15, 2024',
  },
]

function Exports(props: PageProps) {
  const [showSensitiveId, setShowSensitiveId] = useState(false)
  const [includeTaxId, setIncludeTaxId] = useState(false)
  const [certified, setCertified] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', pdfModalOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [pdfModalOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search exports, reports, tax packages"
      overlay={
        pdfModalOpen ? (
          <GeneratePdfModal
            certified={certified}
            includeTaxId={includeTaxId}
            showSensitiveId={showSensitiveId}
            setCertified={setCertified}
            setIncludeTaxId={setIncludeTaxId}
            setShowSensitiveId={setShowSensitiveId}
            onClose={() => setPdfModalOpen(false)}
          />
        ) : null
      }
    >
      <main className="transactions-page exports-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Tax package</p>
            <h1>Exports</h1>
            <p>Generate PDF and CSV records for review, filing, and accountant handoff.</p>
          </div>
          <div className="export-heading-actions">
            <button className="secondary-button" type="button">
              <FileSpreadsheet size={18} />
              Generate CSV
            </button>
            <button className="primary-button" type="button" onClick={() => setPdfModalOpen(true)}>
              <FileText size={18} />
              Generate PDF
            </button>
          </div>
        </section>

        <section className="summary-strip" aria-label="Export summary">
          <SummaryItem label="Income" value="$42,860" tone="income" icon={FileText} />
          <SummaryItem label="Expenses" value="$18,430" tone="expense" icon={FileSpreadsheet} />
          <SummaryItem label="Net profit" value="$24,430" tone="net" icon={Download} />
          <SummaryItem label="Readiness" value="2 issues" tone="review" icon={AlertTriangle} />
        </section>

        <section className="exports-layout">
          <section className="export-card export-summary-panel">
            <div className="export-card-header">
              <div>
                <p className="eyebrow">Before export</p>
                <h2>Readiness checks</h2>
              </div>
              <ShieldCheck size={21} />
            </div>

            <div className="readiness-list">
              {readinessItems.map((item) => (
                <article className="readiness-item" key={item.label}>
                  {item.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="export-total-box">
              <div>
                <span>Tax form context</span>
                <strong>U.S. Schedule C</strong>
              </div>
              <div>
                <span>Package total</span>
                <strong>$24,430 net</strong>
              </div>
            </div>
          </section>

          <form className="export-card export-form-panel" onSubmit={(event) => event.preventDefault()}>
            <div className="export-card-header">
              <div>
                <p className="eyebrow">Filters</p>
                <h2>Export range</h2>
              </div>
              <Calendar size={20} />
            </div>

            <div className="export-presets" aria-label="Date range presets">
              <button className="is-selected" type="button">2026 YTD</button>
              <button type="button">2025 tax year</button>
              <button type="button">Q1 2026</button>
              <button type="button">Custom</button>
            </div>

            <div className="export-field-grid">
              <label>
                Start date
                <input type="date" defaultValue="2026-01-01" />
              </label>
              <label>
                End date
                <input type="date" defaultValue="2026-07-25" />
              </label>
            </div>

            <label>
              Account
              <select defaultValue="">
                <option value="">All accounts</option>
                <option>Chase Checking</option>
                <option>Amex Gold</option>
                <option>Cash</option>
              </select>
            </label>

            <label>
              Category
              <select defaultValue="">
                <option value="">All categories</option>
                <option>Income</option>
                <option>Software</option>
                <option>Meals</option>
                <option>Fuel</option>
              </select>
            </label>

            <label>
              Export language
              <select defaultValue="en">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>

            <label>
              Package mode
              <select defaultValue="workpaper">
                <option value="draft">Draft</option>
                <option value="workpaper">CPA workpaper</option>
                <option value="finalized">Finalized tax package</option>
              </select>
            </label>
          </form>
        </section>

        <section className="export-card sensitive-export-card">
          <div className="export-card-header">
            <div>
              <p className="eyebrow">Sensitive data</p>
              <h2>Protected export details</h2>
            </div>
            <LockKeyhole size={21} />
          </div>

          <label className="checkbox-line">
            <input type="checkbox" checked={includeTaxId} onChange={(event) => setIncludeTaxId(event.target.checked)} />
            <span>Include tax ID, business ID, or SSN on this export only</span>
          </label>

          {includeTaxId ? (
            <div className="sensitive-entry">
              <p>
                This value is a one-time export input. The old app safeguarded this by processing it for the export
                package instead of treating it like normal stored profile data.
              </p>
              <label>
                Sensitive identifier
                <div className="secure-input-row">
                  <input
                    type={showSensitiveId ? 'text' : 'password'}
                    placeholder="EIN, business ID, or SSN for this export"
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowSensitiveId((value) => !value)}>
                    {showSensitiveId ? <EyeOff size={17} /> : <Eye size={17} />}
                    {showSensitiveId ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} />
                <span>
                  I certify I am authorized to provide this identifier and understand it is used only for this export.
                </span>
              </label>
            </div>
          ) : null}

          {includeTaxId && certified ? (
            <div className="protected-export-actions">
              <button className="primary-button" type="button" onClick={() => setPdfModalOpen(true)}>
                <FileText size={18} />
                Generate PDF
              </button>
            </div>
          ) : null}
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search export history" />
            </label>
            <div className="filter-actions">
              <button className="secondary-button" type="button">
                <History size={17} />
                History: All
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Export</th>
                  <th>Format</th>
                  <th>Mode</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Generated</th>
                  <th className="action-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exportHistory.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Export">
                      <div className="merchant-cell">
                        <span className={`merchant-icon ${item.format === 'PDF' ? 'merchant-red' : 'merchant-green'}`}>
                          {item.format === 'PDF' ? <FileText size={15} /> : <FileSpreadsheet size={15} />}
                        </span>
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td data-label="Format">
                      <span className={`type-pill ${item.format === 'PDF' ? 'type-expense' : 'type-income'}`}>{item.format}</span>
                    </td>
                    <td data-label="Mode">{item.mode}</td>
                    <td data-label="Period">{item.period}</td>
                    <td data-label="Status">
                      <span className={`status-pill ${item.status === 'Stale' ? 'status-needs-review' : ''}`}>{item.status}</span>
                    </td>
                    <td data-label="Generated">{item.generated}</td>
                    <td data-label="Actions" className="action-col receipt-actions">
                      <button className="row-action" type="button" aria-label={`Download ${item.name}`}>
                        <Download size={18} />
                      </button>
                      <button className="row-action" type="button" aria-label={`Delete ${item.name}`}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function GeneratePdfModal({
  certified,
  includeTaxId,
  showSensitiveId,
  setCertified,
  setIncludeTaxId,
  setShowSensitiveId,
  onClose,
}: {
  certified: boolean
  includeTaxId: boolean
  showSensitiveId: boolean
  setCertified: (value: boolean) => void
  setIncludeTaxId: (value: boolean) => void
  setShowSensitiveId: (value: boolean | ((current: boolean) => boolean)) => void
  onClose: () => void
}) {
  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generatePdfTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="export-modal-header">
          <div>
            <p className="eyebrow">Generate PDF</p>
            <h2 id="generatePdfTitle">Protected PDF export</h2>
            <p>Review package settings and add sensitive identifiers only when they belong on this PDF.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close PDF export modal" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="export-modal-body">
          <section className="pdf-review-grid" aria-label="PDF export summary">
            <div>
              <span>Period</span>
              <strong>Jan 1 - Jul 25, 2026</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>CPA workpaper</strong>
            </div>
            <div>
              <span>Tax form</span>
              <strong>U.S. Schedule C</strong>
            </div>
            <div>
              <span>Net profit</span>
              <strong>$24,430</strong>
            </div>
          </section>

          <section className="pdf-safeguard-box">
            <div className="pdf-safeguard-heading">
              <LockKeyhole size={18} />
              <div>
                <strong>Sensitive identifier</strong>
                <span>EIN, business ID, or SSN can be included for this PDF only.</span>
              </div>
            </div>

            <label className="checkbox-line">
              <input type="checkbox" checked={includeTaxId} onChange={(event) => setIncludeTaxId(event.target.checked)} />
              <span>Include a sensitive identifier on this PDF</span>
            </label>

            {includeTaxId ? (
              <div className="sensitive-entry">
                <label>
                  Identifier for this PDF
                  <div className="secure-input-row">
                    <input
                      type={showSensitiveId ? 'text' : 'password'}
                      placeholder="EIN, business ID, or SSN"
                      autoComplete="off"
                    />
                    <button type="button" onClick={() => setShowSensitiveId((value) => !value)}>
                      {showSensitiveId ? <EyeOff size={17} /> : <Eye size={17} />}
                      {showSensitiveId ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="checkbox-line">
                  <input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} />
                  <span>I certify I am authorized to provide this identifier for this export.</span>
                </label>
              </div>
            ) : null}
          </section>

          <section className="pdf-warning-box">
            <AlertTriangle size={18} />
            <div>
              <strong>2 readiness items need review</strong>
              <span>You can still generate a workpaper, but final packages should be clean before filing.</span>
            </div>
          </section>
        </div>

        <div className="export-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={includeTaxId && !certified}>
            <FileText size={18} />
            Generate PDF
          </button>
        </div>
      </section>
    </div>
  )
}

function SummaryItem({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: LucideIcon }) {
  return (
    <article className={`summary-item tone-${tone}`}>
      <div className="summary-icon">
        <Icon size={24} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

export default Exports
