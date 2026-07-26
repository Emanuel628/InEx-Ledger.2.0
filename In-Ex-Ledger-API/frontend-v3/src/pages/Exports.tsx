import { useEffect, useMemo, useState } from 'react'
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
import {
  deleteExportHistoryItem,
  downloadRedactedExport,
  generateExport,
  loadExportPageData,
  type ExportDatasetSummary,
  type ExportFormat,
  type ExportHistoryItem,
  type ExportMode,
  type ExportSettings,
} from '../lib/exportsApi'

const today = new Date().toISOString().slice(0, 10)
const yearStart = `${today.slice(0, 4)}-01-01`
const emptySummary: ExportDatasetSummary = {
  income: 0,
  expenses: 0,
  netProfit: 0,
  readinessIssues: 0,
  missingReceiptCount: 0,
  needsCategoryCount: 0,
  taxForm: 'Schedule C',
  currency: 'USD',
}

function Exports(props: PageProps) {
  const [startDate, setStartDate] = useState(yearStart)
  const [endDate, setEndDate] = useState(today)
  const [language, setLanguage] = useState('en')
  const [currency, setCurrency] = useState('USD')
  const [exportMode, setExportMode] = useState<ExportMode>('workpaper')
  const [csvType, setCsvType] = useState<ExportFormat>('csv_full')
  const [showSensitiveId, setShowSensitiveId] = useState(false)
  const [includeTaxId, setIncludeTaxId] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [certified, setCertified] = useState(false)
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [summary, setSummary] = useState<ExportDatasetSummary>(emptySummary)
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [generating, setGenerating] = useState<'PDF' | 'CSV' | ''>('')

  async function refreshPageData() {
    setLoadingData(true)
    setDataError('')
    try {
      const pageData = await loadExportPageData(startDate, endDate)
      setSummary(pageData.summary)
      setExportHistory(pageData.history)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load exports.')
      setSummary(emptySummary)
      setExportHistory([])
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshPageData()
  }, [endDate, startDate])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', pdfModalOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [pdfModalOpen])

  const readinessItems = useMemo(() => [
    { label: 'Business profile', detail: `${summary.taxForm} context is available for this range.`, ready: true },
    { label: 'Tax categories', detail: summary.needsCategoryCount ? `${summary.needsCategoryCount} categories still need review.` : 'Categories are ready for export.', ready: summary.needsCategoryCount === 0 },
    { label: 'Receipts', detail: summary.missingReceiptCount ? `${summary.missingReceiptCount} receipts are missing or unlinked.` : 'Receipt support is ready.', ready: summary.missingReceiptCount === 0 },
    { label: 'Mileage', detail: 'Trip and vehicle-cost records are included when present.', ready: true },
  ], [summary.missingReceiptCount, summary.needsCategoryCount, summary.taxForm])

  const filteredHistory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) {
      return exportHistory
    }
    return exportHistory.filter((item) => [
      item.name,
      item.format,
      item.mode,
      item.period,
      item.status,
      item.generated,
    ].some((value) => value.toLowerCase().includes(normalizedSearch)))
  }, [exportHistory, searchTerm])

  function buildSettings(exportType: ExportFormat): ExportSettings {
    return {
      startDate,
      endDate,
      exportType,
      exportMode,
      language,
      currency,
      includeTaxId: exportType === 'pdf' && includeTaxId,
      taxId,
      certifiedByUser: certified,
    }
  }

  function handleGenerate(exportType: ExportFormat) {
    setGenerating(exportType === 'pdf' ? 'PDF' : 'CSV')
    setDataError('')
    generateExport(buildSettings(exportType))
      .then(refreshPageData)
      .then(() => {
        if (exportType === 'pdf') {
          setPdfModalOpen(false)
        }
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to generate export.'))
      .finally(() => setGenerating(''))
  }

  function handleDownload(item: ExportHistoryItem) {
    if (!item.canDownloadRedactedPdf) {
      setDataError('CSV history is recorded, but the backend only stores downloadable redacted PDFs.')
      return
    }
    downloadRedactedExport(item.id)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to download export.'))
  }

  function handleDelete(item: ExportHistoryItem) {
    if (!window.confirm(`Delete ${item.name} from export history?`)) {
      return
    }
    deleteExportHistoryItem(item.id)
      .then(refreshPageData)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete export history.'))
  }

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search exports, reports, tax packages"
      overlay={
        pdfModalOpen ? (
          <GeneratePdfModal
            certified={certified}
            endDate={endDate}
            exportMode={exportMode}
            generating={generating === 'PDF'}
            includeTaxId={includeTaxId}
            showSensitiveId={showSensitiveId}
            startDate={startDate}
            summary={summary}
            taxId={taxId}
            setCertified={setCertified}
            setIncludeTaxId={setIncludeTaxId}
            setShowSensitiveId={setShowSensitiveId}
            setTaxId={setTaxId}
            onClose={() => setPdfModalOpen(false)}
            onGenerate={() => handleGenerate('pdf')}
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
            <button className="secondary-button" type="button" onClick={() => handleGenerate(csvType)} disabled={generating === 'CSV'}>
              <FileSpreadsheet size={18} />
              {generating === 'CSV' ? 'Generating...' : 'Generate CSV'}
            </button>
            <button className="primary-button" type="button" onClick={() => setPdfModalOpen(true)}>
              <FileText size={18} />
              Generate PDF
            </button>
          </div>
        </section>

        <section className="summary-strip" aria-label="Export summary">
          <SummaryItem label="Income" value={formatMoney(summary.income, summary.currency)} tone="income" icon={FileText} />
          <SummaryItem label="Expenses" value={formatMoney(summary.expenses, summary.currency)} tone="expense" icon={FileSpreadsheet} />
          <SummaryItem label="Net profit" value={formatMoney(summary.netProfit, summary.currency)} tone="net" icon={Download} />
          <SummaryItem label="Readiness" value={`${summary.readinessIssues} issues`} tone="review" icon={AlertTriangle} />
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Review the export range and try again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss export warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

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
                <strong>{summary.taxForm}</strong>
              </div>
              <div>
                <span>Package total</span>
                <strong>{formatMoney(summary.netProfit, summary.currency)} net</strong>
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
              <button className="is-selected" type="button" onClick={() => setPresetRange('ytd', setStartDate, setEndDate)}>YTD</button>
              <button type="button" onClick={() => setPresetRange('last-year', setStartDate, setEndDate)}>Last tax year</button>
              <button type="button" onClick={() => setPresetRange('q1', setStartDate, setEndDate)}>Q1</button>
              <button type="button">Custom</button>
            </div>

            <div className="export-field-grid">
              <label>
                Start date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>

            <label>
              CSV package
              <select value={csvType} onChange={(event) => setCsvType(event.target.value as ExportFormat)}>
                <option value="csv_basic">Basic ledger</option>
                <option value="csv_full">CPA workpaper</option>
                <option value="csv_category_summary">Category summary</option>
                <option value="csv_excluded">Excluded items</option>
              </select>
            </label>

            <label>
              Export language
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>

            <label>
              Currency
              <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
              </select>
            </label>

            <label>
              Package mode
              <select value={exportMode} onChange={(event) => setExportMode(event.target.value as ExportMode)}>
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
            <span>Include tax ID, business ID, or SSN on this PDF only</span>
          </label>

          {includeTaxId ? (
            <div className="sensitive-entry">
              <p>This identifier is encrypted in the browser and sent only for this PDF export.</p>
              <label>
                Sensitive identifier
                <div className="secure-input-row">
                  <input
                    type={showSensitiveId ? 'text' : 'password'}
                    value={taxId}
                    placeholder="EIN, business ID, or SSN for this export"
                    autoComplete="off"
                    onChange={(event) => setTaxId(event.target.value)}
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
              <input type="search" placeholder="Search export history" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <div className="filter-actions">
              <button className="secondary-button" type="button" onClick={() => void refreshPageData()}>
                <History size={17} />
                Refresh history
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
                {filteredHistory.length ? filteredHistory.map((item) => (
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
                      <button className="row-action" type="button" aria-label={`Download ${item.name}`} onClick={() => handleDownload(item)}>
                        <Download size={18} />
                      </button>
                      <button className="row-action" type="button" aria-label={`Delete ${item.name}`} onClick={() => handleDelete(item)}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-table-state">{loadingData ? 'Loading export history...' : 'No export history found.'}</div>
                    </td>
                  </tr>
                )}
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
  endDate,
  exportMode,
  generating,
  includeTaxId,
  showSensitiveId,
  startDate,
  summary,
  taxId,
  setCertified,
  setIncludeTaxId,
  setShowSensitiveId,
  setTaxId,
  onClose,
  onGenerate,
}: {
  certified: boolean
  endDate: string
  exportMode: ExportMode
  generating: boolean
  includeTaxId: boolean
  showSensitiveId: boolean
  startDate: string
  summary: ExportDatasetSummary
  taxId: string
  setCertified: (value: boolean) => void
  setIncludeTaxId: (value: boolean) => void
  setShowSensitiveId: (value: boolean | ((current: boolean) => boolean)) => void
  setTaxId: (value: string) => void
  onClose: () => void
  onGenerate: () => void
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
              <strong>{formatDate(startDate)} - {formatDate(endDate)}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{formatMode(exportMode)}</strong>
            </div>
            <div>
              <span>Tax form</span>
              <strong>{summary.taxForm}</strong>
            </div>
            <div>
              <span>Net profit</span>
              <strong>{formatMoney(summary.netProfit, summary.currency)}</strong>
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
                      value={taxId}
                      placeholder="EIN, business ID, or SSN"
                      autoComplete="off"
                      onChange={(event) => setTaxId(event.target.value)}
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
              <strong>{summary.readinessIssues} readiness items</strong>
              <span>You can generate a workpaper, but finalized packages require clean source data.</span>
            </div>
          </section>
        </div>

        <div className="export-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={generating || (includeTaxId && !certified)} onClick={onGenerate}>
            <FileText size={18} />
            {generating ? 'Generating...' : 'Generate PDF'}
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

function setPresetRange(
  preset: 'ytd' | 'last-year' | 'q1',
  setStartDate: (value: string) => void,
  setEndDate: (value: string) => void,
) {
  const year = Number(today.slice(0, 4))
  if (preset === 'last-year') {
    setStartDate(`${year - 1}-01-01`)
    setEndDate(`${year - 1}-12-31`)
    return
  }
  if (preset === 'q1') {
    setStartDate(`${year}-01-01`)
    setEndDate(`${year}-03-31`)
    return
  }
  setStartDate(yearStart)
  setEndDate(today)
}

function formatMode(mode: ExportMode) {
  if (mode === 'finalized') return 'Finalized'
  if (mode === 'draft') return 'Draft'
  return 'CPA workpaper'
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(value: number, currency: string) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
}

export default Exports
