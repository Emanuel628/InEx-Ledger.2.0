import { useState, type ReactNode } from 'react'
import {
  Bell,
  Building2,
  CreditCard,
  Database,
  Download,
  Globe2,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  Mail,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps, ThemeMode } from '../App'
import AppShell from '../components/AppShell'

type SettingsSection = 'Account' | 'Business' | 'Billing' | 'Security' | 'Preferences' | 'Data'

const settingsSections = [
  { label: 'Account', note: 'Profile and email', icon: UserRound },
  { label: 'Business', note: 'Identity and taxes', icon: Building2 },
  { label: 'Billing', note: 'Plan and invoices', icon: CreditCard },
  { label: 'Security', note: 'MFA and sessions', icon: ShieldCheck },
  { label: 'Preferences', note: 'Language and defaults', icon: SlidersHorizontal },
  { label: 'Data', note: 'Exports and deletion', icon: Database },
] satisfies { label: SettingsSection; note: string; icon: LucideIcon }[]

function Settings(props: PageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('Account')

  return (
    <AppShell {...props} searchPlaceholder="Search settings, billing, security">
      <main className="transactions-page settings-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Workspace controls</p>
            <h1>Settings</h1>
            <p>Manage account access, business identity, billing, preferences, and protected data from one place.</p>
          </div>
          <button className="primary-button" type="button">
            <Save size={18} />
            Save changes
          </button>
        </section>

        <section className="settings-layout">
          <aside className="settings-section-nav" aria-label="Settings sections">
            {settingsSections.map(({ label, note, icon: Icon }) => (
              <button
                className={activeSection === label ? 'is-selected' : ''}
                key={label}
                type="button"
                onClick={() => setActiveSection(label)}
              >
                <Icon size={19} />
                <span>
                  <strong>{label}</strong>
                  <small>{note}</small>
                </span>
              </button>
            ))}
          </aside>

          <div className="settings-content">
            {activeSection === 'Account' ? <AccountSettings authUser={props.authUser} onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Business' ? <BusinessSettings authUser={props.authUser} /> : null}
            {activeSection === 'Billing' ? <BillingSettings onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Security' ? <SecuritySettings onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Preferences' ? <PreferenceSettings theme={props.theme} setTheme={props.setTheme} /> : null}
            {activeSection === 'Data' ? <DataSettings /> : null}
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function AccountSettings({ authUser, onNavigate }: { authUser: PageProps['authUser']; onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel
      eyebrow="Account"
      title="Profile and sign-in"
      description="Keep the account owner details clean. Email and password changes should stay deliberate."
    >
      <div className="settings-form-grid">
        <Field label="Full name" value={[authUser?.firstName, authUser?.lastName].filter(Boolean).join(' ')} placeholder="Not set" />
        <Field label="Account email" value={authUser?.email || ''} placeholder="Not set" type="email" />
      </div>
      <SettingsRow icon={Mail} title="Change email" description="Require confirmation before the new address becomes active.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('ChangeEmail')}>Update email</button>
      </SettingsRow>
      <SettingsRow icon={KeyRound} title="Password" description="Change the password attached to this account.">
        <button className="secondary-button" type="button">Change password</button>
      </SettingsRow>
      <SettingsRow icon={HelpCircle} title="Help and support" description="Open help topics or start a support request from the message center.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Help')}>Open help</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function BusinessSettings({ authUser }: { authUser: PageProps['authUser'] }) {
  return (
    <SettingsPanel
      eyebrow="Business"
      title="Business profile"
      description="These details drive tax categories, exports, invoices, and business switching."
    >
      <div className="settings-form-grid">
        <Field label="Business name" value={authUser?.business?.name || ''} placeholder="Not set" />
        <Field label="Contact name" value={[authUser?.firstName, authUser?.lastName].filter(Boolean).join(' ')} placeholder="Not set" />
        <SelectField label="Business type" value="" options={['Sole proprietor', 'Single-member LLC', 'LLC', 'Corporation', 'Partnership']} />
        <Field label="Fiscal year start" value="" type="date" />
        <Field label="Operating name" placeholder="Optional DBA" />
        <Field label="Business activity code" placeholder="6-digit NAICS code" />
        <SelectField label="Accounting method" value="Cash" options={['Cash', 'Accrual']} />
        <SelectField label="Material participation" value="Yes" options={['Yes', 'No']} />
      </div>
      <SettingsRow icon={LockKeyhole} title="Accounting period lock" description="Block edits, deletes, and new transactions on or before a closing date.">
        <button className="secondary-button" type="button">Set lock</button>
      </SettingsRow>
      <SettingsRow icon={Building2} title="Businesses on this account" description="Switch, rename, or remove businesses without touching billing ownership.">
        <button className="secondary-button" type="button">Manage</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function BillingSettings({ onNavigate }: { onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel
      eyebrow="Billing"
      title="Plan and billing"
      description="Keep subscription actions visible, but send payment methods and invoices through Stripe."
    >
      <div className="settings-status-card">
        <span className="status-pill status-draft">Free tier</span>
        <div>
          <strong>No paid subscription attached</strong>
          <p>Checkout, extra business slots, and invoices are managed in billing.</p>
        </div>
      </div>
      <SettingsRow icon={CreditCard} title="Stripe billing portal" description="Payment methods, invoices, cancellation, and reactivation belong in the billing portal.">
        <button className="primary-button" type="button" onClick={() => onNavigate('Billing')}>Open billing</button>
      </SettingsRow>
      <SettingsRow icon={Download} title="Billing history" description="Download receipts and invoice records for your subscription.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Subscription')}>Manage plan</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function SecuritySettings({ onNavigate }: { onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel
      eyebrow="Security"
      title="Account protection"
      description="Control MFA, trusted devices, and active sessions from a single security area."
    >
      <SettingsRow icon={ShieldCheck} title="Multi-factor authentication" description="Require a second check on new or untrusted devices.">
        <Toggle enabled label="On" />
      </SettingsRow>
      <SettingsRow icon={MonitorSmartphone} title="Active sessions" description="Review signed-in devices and revoke sessions you do not recognize.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Sessions')}>Review sessions</button>
      </SettingsRow>
      <SettingsRow icon={KeyRound} title="Trusted devices" description="Clear remembered devices after travel, staff changes, or shared-device use.">
        <button className="secondary-button" type="button">Clear devices</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function PreferenceSettings({ theme, setTheme }: { theme: ThemeMode; setTheme: PageProps['setTheme'] }) {
  return (
    <SettingsPanel
      eyebrow="Preferences"
      title="Defaults"
      description="Set the interface, reports, and mileage defaults used across the app."
    >
      <div className="settings-form-grid">
        <SelectField label="Language" value="English" options={['English', 'Spanish', 'French']} />
        <SelectField label="Region" value="United States" options={['United States', 'Canada']} />
        <SelectField label="Currency" value="USD" options={['USD', 'CAD']} />
        <SelectField label="Distance units" value="Miles" options={['Miles', 'Kilometers']} />
        <SelectField label="Timezone" value="America/New_York" options={['America/New_York', 'America/Chicago', 'America/Los_Angeles']} />
        <SelectField
          label="Theme"
          value={theme === 'dark' ? 'Dark' : 'Light'}
          options={['Light', 'Dark']}
          onChange={(value) => setTheme(value === 'Dark' ? 'dark' : 'light')}
        />
      </div>
      <SettingsRow icon={Bell} title="Notifications" description="Choose which billing, support, invoice, and export events send alerts.">
        <button className="secondary-button" type="button">Manage alerts</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function DataSettings() {
  return (
    <SettingsPanel
      eyebrow="Data"
      title="Privacy, exports, and deletion"
      description="Sensitive IDs and deletion controls should be explicit, reviewable, and hard to trigger by mistake."
    >
      <SettingsRow icon={Download} title="Account data export" description="Download a complete data package for records or migration.">
        <button className="secondary-button" type="button">Export data</button>
      </SettingsRow>
      <SettingsRow icon={Globe2} title="Product analytics" description="Help improve the product without sharing private financial data.">
        <Toggle label="Off" />
      </SettingsRow>
      <div className="settings-danger-zone">
        <div>
          <strong>Danger zone</strong>
          <p>Delete a business or close the account only after export and ownership checks are complete.</p>
        </div>
        <button className="secondary-button danger-button" type="button">
          <Trash2 size={17} />
          Delete
        </button>
      </div>
    </SettingsPanel>
  )
}

function SettingsPanel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
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

function SettingsRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
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

function Field({ label, value, placeholder, type = 'text' }: { label: string; value?: string; placeholder?: string; type?: string }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type={type} defaultValue={value} placeholder={placeholder} />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange?: (value: string) => void
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select
        {...(onChange
          ? { value, onChange: (event) => onChange(event.target.value) }
          : { defaultValue: value })}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function Toggle({ enabled = false, label }: { enabled?: boolean; label: string }) {
  return (
    <button className={`settings-toggle ${enabled ? 'is-on' : ''}`} type="button" aria-pressed={enabled}>
      <span />
      {label}
    </button>
  )
}

export default Settings
