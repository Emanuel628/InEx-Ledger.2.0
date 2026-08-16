import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type SelectOption = string | { value: string; label: string }

export function SettingsPanel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

export function SettingsRow({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon">
        <Icon size={19} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="settings-row-action">{children}</div>
    </div>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
  error,
}: {
  label: string
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  type?: string
  readOnly?: boolean
  error?: string
}) {
  return (
    <label className={`settings-field ${error ? 'is-invalid' : ''}`}>
      <span>{label}</span>
      <input type={type} value={value || ''} readOnly={readOnly} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
      {error ? <small className="settings-field-error">{error}</small> : null}
    </label>
  )
}

export function SelectField({ label, value, options, error, onChange }: { label: string; value: string; options: SelectOption[]; error?: string; onChange: (value: string) => void }) {
  return (
    <label className={`settings-field ${error ? 'is-invalid' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const normalized = typeof option === 'string' ? { value: option, label: option || 'Not set' } : option
          return <option key={normalized.value || 'blank'} value={normalized.value}>{normalized.label}</option>
        })}
      </select>
      {error ? <small className="settings-field-error">{error}</small> : null}
    </label>
  )
}

export function Toggle({ enabled = false, label, onClick }: { enabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`settings-toggle ${enabled ? 'is-on' : ''}`} type="button" aria-pressed={enabled} onClick={onClick}>
      <span />
      {label}
    </button>
  )
}
