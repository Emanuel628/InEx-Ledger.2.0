import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
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
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps, ThemeMode } from '../App'
import AppShell from '../components/AppShell'
import {
  exportAccountData,
  loadBusinessProfile,
  loadPrivacySettings,
  refreshCurrentUser,
  saveBusinessProfile,
  savePrivacySettings,
  saveProfile,
  type BusinessProfile,
  type PrivacySettings,
} from '../lib/settingsApi'

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
  const [fullName, setFullName] = useState('')
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFullName([props.authUser?.firstName, props.authUser?.lastName].filter(Boolean).join(' '))
  }, [props.authUser])

  useEffect(() => {
    const businessId = props.authUser?.currentBusinessId
    if (!businessId) return

    loadBusinessProfile(businessId)
      .then(setBusinessProfile)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load business profile.'))

    loadPrivacySettings()
      .then(setPrivacySettings)
      .catch(() => setPrivacySettings(null))
  }, [props.authUser?.currentBusinessId])

  const saveButtonLabel = useMemo(() => {
    if (saving) return 'Saving'
    if (activeSection === 'Account') return 'Save account'
    if (activeSection === 'Business') return 'Save business'
    if (activeSection === 'Preferences' || activeSection === 'Data') return 'Save choices'
    return 'Save changes'
  }, [activeSection, saving])

  async function saveCurrentSection() {
    setSaving(true)
    setError('')
    setStatusMessage('')
    try {
      if (activeSection === 'Account') {
        const { user } = await saveProfile(fullName)
        props.onAuthChange(user)
      }
      if (activeSection === 'Business' && businessProfile) {
        const saved = await saveBusinessProfile(businessProfile.id, businessProfile)
        setBusinessProfile(saved)
        props.onAuthChange((await refreshCurrentUser()).user)
      }
      if ((activeSection === 'Preferences' || activeSection === 'Data') && privacySettings) {
        await savePrivacySettings(privacySettings)
      }
      setStatusMessage('Changes saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  function updateBusiness<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setBusinessProfile((current) => current ? { ...current, [key]: value } : current)
  }

  function updatePrivacy<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    setPrivacySettings((current) => current ? { ...current, [key]: value } : current)
  }

  return (
    <AppShell {...props} searchPlaceholder="Search settings, billing, security">
      <main className="transactions-page settings-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Workspace controls</p>
            <h1>Settings</h1>
            <p>Manage account access, business identity, billing, preferences, and protected data from one place.</p>
          </div>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void saveCurrentSection()}>
            <Save size={18} />
            {saveButtonLabel}
          </button>
        </section>

        {error ? <TopAlert message={error} detail="Review the fields and try again." onDismiss={() => setError('')} /> : null}
        {statusMessage ? <TopAlert message={statusMessage} detail="Your workspace settings are up to date." onDismiss={() => setStatusMessage('')} /> : null}

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
            {activeSection === 'Account' ? <AccountSettings authUser={props.authUser} fullName={fullName} setFullName={setFullName} onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Business' ? <BusinessSettings profile={businessProfile} updateBusiness={updateBusiness} /> : null}
            {activeSection === 'Billing' ? <BillingSettings onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Security' ? <SecuritySettings onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Preferences' ? <PreferenceSettings privacySettings={privacySettings} updatePrivacy={updatePrivacy} theme={props.theme} setTheme={props.setTheme} /> : null}
            {activeSection === 'Data' ? <DataSettings privacySettings={privacySettings} updatePrivacy={updatePrivacy} setError={setError} /> : null}
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function TopAlert({ message, detail, onDismiss }: { message: string; detail: string; onDismiss: () => void }) {
  return (
    <section className="top-alert" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>{message}</strong>
        <span>{detail}</span>
      </div>
      <button className="top-alert-close" type="button" aria-label="Dismiss settings alert" onClick={onDismiss}>
        <X size={16} />
      </button>
    </section>
  )
}

function AccountSettings({
  authUser,
  fullName,
  setFullName,
  onNavigate,
}: {
  authUser: PageProps['authUser']
  fullName: string
  setFullName: (value: string) => void
  onNavigate: PageProps['onNavigate']
}) {
  return (
    <SettingsPanel eyebrow="Account" title="Profile and sign-in" description="Keep account owner details clean. Email and password changes stay deliberate.">
      <div className="settings-form-grid">
        <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Full name" />
        <Field label="Account email" value={authUser?.email || ''} placeholder="Not set" type="email" readOnly />
      </div>
      <SettingsRow icon={Mail} title="Change email" description="Require confirmation before the new address becomes active.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('ChangeEmail')}>Update email</button>
      </SettingsRow>
      <SettingsRow icon={KeyRound} title="Password" description="Use the secure reset flow if the password needs to change.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('ForgotPassword')}>Reset password</button>
      </SettingsRow>
      <SettingsRow icon={HelpCircle} title="Help and support" description="Open help topics or start a support request from the message center.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Help')}>Open help</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function BusinessSettings({
  profile,
  updateBusiness,
}: {
  profile: BusinessProfile | null
  updateBusiness: <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => void
}) {
  if (!profile) {
    return <SettingsPanel eyebrow="Business" title="Business profile" description="Business details load after onboarding."><div className="empty-table-state">No business profile loaded.</div></SettingsPanel>
  }

  return (
    <SettingsPanel eyebrow="Business" title="Business profile" description="These details drive tax categories, exports, invoices, and business switching.">
      <div className="settings-form-grid">
        <Field label="Business name" value={profile.name || ''} onChange={(value) => updateBusiness('name', value)} placeholder="Business name" />
        <Field label="Contact name" value={profile.contact_full_name || ''} onChange={(value) => updateBusiness('contact_full_name', value)} placeholder="Contact name" />
        <SelectField label="Region" value={profile.region || 'US'} options={['US', 'CA']} onChange={(value) => updateBusiness('region', value as BusinessProfile['region'])} />
        <SelectField label="Language" value={profile.language || 'en'} options={['en', 'es', 'fr']} onChange={(value) => updateBusiness('language', value)} />
        {profile.region === 'CA' ? <SelectField label="Province" value={profile.province || ''} options={['', 'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']} onChange={(value) => updateBusiness('province', value)} /> : null}
        <Field label="Fiscal year start" value={profile.fiscal_year_start || ''} onChange={(value) => updateBusiness('fiscal_year_start', value)} type="date" />
        <Field label="Operating name" value={profile.operating_name || ''} onChange={(value) => updateBusiness('operating_name', value)} placeholder="Optional DBA" />
        <Field label="Business activity code" value={profile.business_activity_code || ''} onChange={(value) => updateBusiness('business_activity_code', value)} placeholder="6-digit NAICS code" />
        <SelectField label="Accounting method" value={profile.accounting_method || ''} options={['', 'cash', 'accrual']} onChange={(value) => updateBusiness('accounting_method', value)} />
        {profile.region === 'US' ? <SelectField label="Material participation" value={profile.material_participation ? 'yes' : 'no'} options={['yes', 'no']} onChange={(value) => updateBusiness('material_participation', value === 'yes')} /> : null}
      </div>
      <SettingsRow icon={LockKeyhole} title="Accounting period lock" description="Period lock setup remains protected in the legacy accounting controls.">
        <button className="secondary-button" type="button" disabled>Protected</button>
      </SettingsRow>
      <SettingsRow icon={Building2} title="Businesses on this account" description="Add, switch, or remove businesses from Subscription and the top business switcher.">
        <button className="secondary-button" type="button" disabled>Top bar</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function BillingSettings({ onNavigate }: { onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel eyebrow="Billing" title="Plan and billing" description="Keep subscription actions visible, but send payment methods and invoices through Stripe.">
      <SettingsRow icon={CreditCard} title="Stripe billing portal" description="Payment methods, invoices, cancellation, and reactivation belong in billing.">
        <button className="primary-button" type="button" onClick={() => onNavigate('Billing')}>Open billing</button>
      </SettingsRow>
      <SettingsRow icon={Download} title="Subscription" description="Choose monthly or yearly checkout and review workspace capacity.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Subscription')}>Manage plan</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function SecuritySettings({ onNavigate }: { onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel eyebrow="Security" title="Account protection" description="Control sessions and protected account changes from one security area.">
      <SettingsRow icon={ShieldCheck} title="Multi-factor authentication" description="MFA setup stays in the hardened legacy auth flow until rebuilt.">
        <button className="secondary-button" type="button" onClick={() => window.location.assign('/settings#security')}>Manage MFA</button>
      </SettingsRow>
      <SettingsRow icon={MonitorSmartphone} title="Active sessions" description="Review signed-in devices and revoke sessions you do not recognize.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Sessions')}>Review sessions</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function PreferenceSettings({
  privacySettings,
  updatePrivacy,
  theme,
  setTheme,
}: {
  privacySettings: PrivacySettings | null
  updatePrivacy: <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => void
  theme: ThemeMode
  setTheme: PageProps['setTheme']
}) {
  return (
    <SettingsPanel eyebrow="Preferences" title="Defaults" description="Set the interface and privacy choices used across the app.">
      <div className="settings-form-grid">
        <SelectField label="Theme" value={theme === 'dark' ? 'Dark' : 'Light'} options={['Light', 'Dark']} onChange={(value) => setTheme(value === 'Dark' ? 'dark' : 'light')} />
        <Field label="Data residency" value={privacySettings?.dataResidency || ''} readOnly placeholder="Not set" />
      </div>
      <SettingsRow icon={Bell} title="Marketing email" description="Receive product updates and billing-adjacent announcements.">
        <Toggle enabled={Boolean(privacySettings?.marketingEmailOptIn)} label={privacySettings?.marketingEmailOptIn ? 'On' : 'Off'} onClick={() => updatePrivacy('marketingEmailOptIn', !privacySettings?.marketingEmailOptIn)} />
      </SettingsRow>
      <SettingsRow icon={Globe2} title="Product analytics" description="Help improve the product without sharing private financial data.">
        <Toggle enabled={Boolean(privacySettings?.analyticsOptIn)} label={privacySettings?.analyticsOptIn ? 'On' : 'Off'} onClick={() => updatePrivacy('analyticsOptIn', !privacySettings?.analyticsOptIn)} />
      </SettingsRow>
    </SettingsPanel>
  )
}

function DataSettings({
  privacySettings,
  updatePrivacy,
  setError,
}: {
  privacySettings: PrivacySettings | null
  updatePrivacy: <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => void
  setError: (value: string) => void
}) {
  async function runExport(format: 'json' | 'csv') {
    try {
      await exportAccountData(format)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export account data.')
    }
  }

  return (
    <SettingsPanel eyebrow="Data" title="Privacy, exports, and deletion" description="Sensitive exports and deletion controls stay explicit and reviewable.">
      <SettingsRow icon={Download} title="Account data export" description="Download a complete data package for records or migration.">
        <div className="filter-actions">
          <button className="secondary-button" type="button" onClick={() => void runExport('json')}>JSON</button>
          <button className="secondary-button" type="button" onClick={() => void runExport('csv')}>CSV</button>
        </div>
      </SettingsRow>
      <SettingsRow icon={Globe2} title="Data sharing" description="Control privacy consent and data sharing preferences.">
        <Toggle enabled={!privacySettings?.dataSharingOptOut} label={privacySettings?.dataSharingOptOut ? 'Off' : 'On'} onClick={() => {
          updatePrivacy('dataSharingOptOut', !privacySettings?.dataSharingOptOut)
          updatePrivacy('consentGiven', Boolean(privacySettings?.dataSharingOptOut))
        }} />
      </SettingsRow>
      <div className="settings-danger-zone">
        <div>
          <strong>Danger zone</strong>
          <p>Account deletion requires password and MFA checks. Use the hardened legacy deletion flow for now.</p>
        </div>
        <button className="secondary-button danger-button" type="button" onClick={() => window.location.assign('/settings#data')}>
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

function SettingsRow({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
}: {
  label: string
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  type?: string
  readOnly?: boolean
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type={type} value={value || ''} readOnly={readOnly} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || 'blank'} value={option}>{option || 'Not set'}</option>
        ))}
      </select>
    </label>
  )
}

function Toggle({ enabled = false, label, onClick }: { enabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`settings-toggle ${enabled ? 'is-on' : ''}`} type="button" aria-pressed={enabled} onClick={onClick}>
      <span />
      {label}
    </button>
  )
}

export default Settings
