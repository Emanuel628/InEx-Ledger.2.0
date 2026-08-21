import { useState } from 'react'
import { X } from 'lucide-react'
import { formatMoney } from '../../lib/money'
import type {
  AccountOption,
  CategoryOption,
  RecurringTemplate,
  RecurringTemplateDraft,
} from '../../lib/transactionsApi'

type RecurringTemplatesWorkflowProps = {
  templates: RecurringTemplate[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  editingTemplate: RecurringTemplate | null | 'new'
  onAdd: () => void
  onEdit: (template: RecurringTemplate) => void
  onCloseEditor: () => void
  onSave: (draft: RecurringTemplateDraft, template: RecurringTemplate | null) => Promise<RecurringTemplate>
  onSaved: (template: RecurringTemplate) => void
  onRun: (template: RecurringTemplate) => void
  onToggle: (template: RecurringTemplate) => void
  onDelete: (template: RecurringTemplate) => void
}

export default function RecurringTemplatesWorkflow({
  templates,
  accounts,
  categories,
  editingTemplate,
  onAdd,
  onEdit,
  onCloseEditor,
  onSave,
  onSaved,
  onRun,
  onToggle,
  onDelete,
}: RecurringTemplatesWorkflowProps) {
  return (
    <>
      <RecurringTemplatesPanel
        templates={templates}
        accounts={accounts}
        categories={categories}
        onAdd={onAdd}
        onEdit={onEdit}
        onRun={onRun}
        onToggle={onToggle}
        onDelete={onDelete}
      />
      {editingTemplate ? (
        <RecurringTemplateModal
          template={editingTemplate === 'new' ? null : editingTemplate}
          accounts={accounts}
          categories={categories}
          onClose={onCloseEditor}
          onSave={onSave}
          onSaved={onSaved}
        />
      ) : null}
    </>
  )
}

function RecurringTemplatesPanel({
  templates,
  accounts,
  categories,
  onAdd,
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: {
  templates: RecurringTemplate[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  onAdd: () => void
  onEdit: (template: RecurringTemplate) => void
  onRun: (template: RecurringTemplate) => void
  onToggle: (template: RecurringTemplate) => void
  onDelete: (template: RecurringTemplate) => void
}) {
  if (!templates.length) {
    return (
      <div className="recurring-template-empty">
        <p className="progressive-panel-note">No recurring templates yet.</p>
        <button className="secondary-button" type="button" onClick={onAdd}>Add recurring template</button>
      </div>
    )
  }

  return (
    <div className="recurring-template-list">
      <div className="recurring-template-header">
        <p className="progressive-panel-note">Templates create repeat income or expense rows on schedule.</p>
        <button className="secondary-button" type="button" onClick={onAdd}>Add template</button>
      </div>
      {templates.map((template) => (
        <article className="recurring-template-item" key={template.id}>
          <div>
            <strong>{template.description}</strong>
            <span>
              {formatMoney(template.type === 'income' ? template.amount : -template.amount)}
              {' '}every {formatCadence(template.cadence)}
              {template.nextRunDate ? ` - next ${formatIsoDate(template.nextRunDate)}` : ''}
            </span>
            <small>
              {categories.find((category) => category.id === template.categoryId)?.name || 'Category'}
              {' '}on {accounts.find((account) => account.id === template.accountId)?.name || 'Account'}
            </small>
          </div>
          <div className="recurring-template-actions">
            <span className={`status-pill ${template.active ? 'status-cleared' : 'status-draft'}`}>{template.active ? 'Active' : 'Paused'}</span>
            <button className="secondary-button" type="button" onClick={() => onEdit(template)}>Edit</button>
            <button className="secondary-button" type="button" onClick={() => onRun(template)}>Post next</button>
            <button className="secondary-button" type="button" onClick={() => onToggle(template)}>{template.active ? 'Pause' : 'Resume'}</button>
            <button className="secondary-button danger-button" type="button" onClick={() => onDelete(template)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  )
}

function RecurringTemplateModal({
  template,
  accounts,
  categories,
  onClose,
  onSave,
  onSaved,
}: {
  template: RecurringTemplate | null
  accounts: AccountOption[]
  categories: CategoryOption[]
  onClose: () => void
  onSave: (draft: RecurringTemplateDraft, template: RecurringTemplate | null) => Promise<RecurringTemplate>
  onSaved: (template: RecurringTemplate) => void
}) {
  const [draft, setDraft] = useState<RecurringTemplateDraft>(() => templateToRecurringDraft(template))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isIncome = draft.kind === 'Income'

  function updateDraft<K extends keyof RecurringTemplateDraft>(key: K, value: RecurringTemplateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function saveTemplate() {
    setSaving(true)
    setError('')
    try {
      const saved = await onSave(draft, template)
      onSaved(saved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save recurring template.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal recurring-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurringTemplateTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="recurringTemplateTitle">{template ? 'Edit recurring template' : 'Add recurring template'}</h2>
            <p>Set the repeating transaction once and post the next entry when it is due.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close recurring template" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={`transaction-type-toggle ${isIncome ? 'is-income' : 'is-expense'}`} role="group" aria-label="Recurring template type">
          <button className={isIncome ? 'is-selected' : ''} type="button" onClick={() => updateDraft('kind', 'Income')}>Income</button>
          <button className={!isIncome ? 'is-selected' : ''} type="button" onClick={() => updateDraft('kind', 'Expense')}>Expense</button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Description
            <input value={draft.description} placeholder="Rent, subscription, client retainer" onChange={(event) => updateDraft('description', event.target.value)} />
          </label>
          <div className="form-grid-2">
            <label>
              Amount
              <input inputMode="decimal" value={draft.amount} placeholder="$0.00" onChange={(event) => updateDraft('amount', event.target.value)} />
            </label>
            <label>
              Cadence
              <select value={draft.cadence} onChange={(event) => updateDraft('cadence', event.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>
          <label>
            Account
            <select value={draft.accountId} onChange={(event) => updateDraft('accountId', event.target.value)}>
              <option value="">Select account</option>
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label>
            Category
            <select value={draft.categoryId} onChange={(event) => updateDraft('categoryId', event.target.value)}>
              <option value="">Select category</option>
              {categories
                .filter((category) => category.kind === (isIncome ? 'income' : 'expense'))
                .map((category) => <option value={category.id} key={category.id}>{category.displayLabel}</option>)}
            </select>
          </label>
          <div className="form-grid-2">
            <label>
              Start date
              <input type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={draft.endDate} onChange={(event) => updateDraft('endDate', event.target.value)} />
            </label>
          </div>
          <textarea value={draft.note} placeholder="Internal note" onChange={(event) => updateDraft('note', event.target.value)} />
          <label className="checkbox-row">
            <input type="checkbox" checked={draft.clearedDefault} onChange={(event) => updateDraft('clearedDefault', event.target.checked)} />
            Mark generated entries cleared by default
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={draft.active} onChange={(event) => updateDraft('active', event.target.checked)} />
            Active template
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void saveTemplate()}>
            {saving ? 'Saving...' : 'Save template'}
          </button>
        </div>
      </section>
    </div>
  )
}

function templateToRecurringDraft(template: RecurringTemplate | null): RecurringTemplateDraft {
  return {
    kind: template?.type === 'income' ? 'Income' : 'Expense',
    amount: template ? String(Math.abs(template.amount)) : '',
    description: template?.description || '',
    accountId: template?.accountId || '',
    categoryId: template?.categoryId || '',
    cadence: template?.cadence || 'monthly',
    startDate: template?.startDate || new Date().toISOString().slice(0, 10),
    endDate: template?.endDate || '',
    note: template?.note || '',
    clearedDefault: template?.clearedDefault ?? false,
    active: template?.active ?? true,
  }
}

function formatCadence(value: string) {
  switch (value) {
    case 'weekly':
      return 'week'
    case 'biweekly':
      return '2 weeks'
    case 'quarterly':
      return 'quarter'
    case 'yearly':
    case 'annually':
      return 'year'
    default:
      return 'month'
  }
}

function formatIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
