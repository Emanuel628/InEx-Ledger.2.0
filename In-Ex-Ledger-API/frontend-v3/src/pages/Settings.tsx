import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Building2,
  CreditCard,
  Database,
  Globe2,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  Mail,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import DataSettingsPanel from '../components/settings/DataSettingsPanel'
import { Field, SelectField, SettingsPanel, SettingsRow, Toggle } from '../components/settings/SettingsPrimitives'
import { usePlan } from '../context/PlanContext'
import { normalizeLanguage as normalizeLanguageValue } from '../lib/i18n'
import { confirmMfaToggle, loadMfaStatus, requestMfaToggle } from '../lib/authApi'
import {
  loadAccountingLock,
  loadBusinessProfile,
  loadPrivacySettings,
  refreshCurrentUser,
  saveAccountingLock,
  saveBusinessProfile,
  savePrivacySettings,
  saveProfile,
  type AccountingLock,
  type BusinessProfile,
  type PrivacySettings,
} from '../lib/settingsApi'

type SettingsSection = 'Account' | 'Business' | 'Billing' | 'Security' | 'Preferences' | 'Data'

const settingsSections = [
  { label: 'Account', note: 'Profile and email', icon: UserRound },
  { label: 'Business', note: 'Identity and taxes', icon: Building2 },
  { label: 'Billing', note: 'Plan and invoices', icon: CreditCard },
  { label: 'Security', note: 'MFA and sessions', icon: ShieldCheck },
  { label: 'Preferences', note: 'Theme and privacy', icon: SlidersHorizontal },
  { label: 'Data', note: 'Exports and deletion', icon: Database },
] satisfies { label: SettingsSection; note: string; icon: LucideIcon }[]

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
]

const provinceOptions = [
  { value: '', label: 'Select province or territory' },
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
]

function Settings(props: PageProps) {
  const { refreshPlanContext } = usePlan()
  const [activeSection, setActiveSection] = useState<SettingsSection>('Account')
  const [fullName, setFullName] = useState('')
  const [originalFullName, setOriginalFullName] = useState('')
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [originalBusinessProfile, setOriginalBusinessProfile] = useState<BusinessProfile | null>(null)
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null)
  const [originalPrivacySettings, setOriginalPrivacySettings] = useState<PrivacySettings | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const name = [props.authUser?.firstName, props.authUser?.lastName].filter(Boolean).join(' ')
    setFullName(name)
    setOriginalFullName(name)
  }, [props.authUser])

  // Stripe checkout, the billing portal, and the additional-business-slot
  // flow all redirect back here with ?checkout=success|cancel or
  // ?billing=updated once payment is confirmed (see billing.routes.js
  // return_url / success_url). Surface that outcome and refresh the shared
  // plan snapshot so gates elsewhere in the app pick it up immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutState = params.get('checkout')
    const billingUpdated = params.get('billing') === 'updated'
    if (!checkoutState && !billingUpdated) return

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('checkout')
    cleanUrl.searchParams.delete('billing')
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
    setActiveSection('Billing')

    if (checkoutState === 'cancel') {
      setStatusMessage('Checkout was canceled. No changes were made to your plan.')
      return
    }

    setStatusMessage('Payment confirmed. Your plan is up to date.')
    void refreshPlanContext()
  }, [refreshPlanContext])

  useEffect(() => {
    const businessId = props.authUser?.currentBusinessId
    if (!businessId) return

    loadBusinessProfile(businessId)
      .then((profile) => {
        setBusinessProfile(profile)
        setOriginalBusinessProfile(profile)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load business profile.'))

    loadPrivacySettings()
      .then((settings) => {
        setPrivacySettings(settings)
        setOriginalPrivacySettings(settings)
      })
      .catch(() => setPrivacySettings(null))
  }, [props.authUser?.currentBusinessId])

  const hasUnsavedChanges = useMemo(() => {
    if (activeSection === 'Account') {
      return fullName !== originalFullName
    }
    if (activeSection === 'Business') {
      return JSON.stringify(businessProfile) !== JSON.stringify(originalBusinessProfile)
    }
    if (activeSection === 'Preferences' || activeSection === 'Data') {
      return JSON.stringify(privacySettings) !== JSON.stringify(originalPrivacySettings)
    }
    return false
  }, [activeSection, fullName, originalFullName, businessProfile, originalBusinessProfile, privacySettings, originalPrivacySettings])

  const saveButtonLabel = useMemo(() => (
    saving
      ? 'Saving'
      : activeSection === 'Account'
        ? 'Save account'
        : activeSection === 'Business'
          ? 'Save business'
          : activeSection === 'Preferences' || activeSection === 'Data'
            ? 'Save choices'
            : 'Save changes'
  ), [activeSection, saving])

  async function saveCurrentSection() {
    setSaving(true)
    setError('')
    setStatusMessage('')
    setFieldErrors({})
    try {
      if (activeSection === 'Account') {
        const { user } = await saveProfile(fullName)
        props.onAuthChange(user)
        setOriginalFullName(fullName)
      }
      if (activeSection === 'Business' && businessProfile) {
        const validationErrors = validateBusinessProfile(businessProfile)
        if (Object.keys(validationErrors).length) {
          setFieldErrors(validationErrors)
          throw new Error('Review the highlighted business fields.')
        }
        const saved = await saveBusinessProfile(businessProfile.id, businessProfile)
        setBusinessProfile(saved)
        setOriginalBusinessProfile(saved)
        props.onAuthChange((await refreshCurrentUser()).user)
      }
      if ((activeSection === 'Preferences' || activeSection === 'Data') && privacySettings) {
        await savePrivacySettings(privacySettings)
        setOriginalPrivacySettings(privacySettings)
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
    setFieldErrors((current) => {
      if (!current[String(key)]) return current
      const next = { ...current }
      delete next[String(key)]
      return next
    })
  }

  function updatePrivacy<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) {
    setPrivacySettings((current) => current ? { ...current, [key]: value } : current)
  }

  return (
    <AppShell {...props}>
      <main className="transactions-page settings-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Workspace controls</p>
            <h1>Settings</h1>
            <p>Manage account access, business identity, billing, preferences, and protected data from one place.</p>
          </div>
          {hasUnsavedChanges ? (
            <button className="primary-button" type="button" disabled={saving} onClick={() => void saveCurrentSection()}>
              <Save size={18} />
              {saveButtonLabel}
            </button>
          ) : null}
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
            {activeSection === 'Business' ? (
              <BusinessSettings
                profile={businessProfile}
                updateBusiness={updateBusiness}
                fieldErrors={fieldErrors}
                onLanguageChange={props.onLanguageChange}
              />
            ) : null}
            {activeSection === 'Billing' ? <BillingSettings onNavigate={props.onNavigate} /> : null}
            {activeSection === 'Security' ? <SecuritySettings onNavigate={props.onNavigate} authUser={props.authUser} onAuthChange={props.onAuthChange} /> : null}
            {activeSection === 'Preferences' ? <PreferenceSettings privacySettings={privacySettings} updatePrivacy={updatePrivacy} /> : null}
            {activeSection === 'Data' ? (
              <DataSettingsPanel
                privacySettings={privacySettings}
                updatePrivacy={updatePrivacy}
                setError={setError}
                setStatusMessage={setStatusMessage}
                authUser={props.authUser}
                onAuthChange={props.onAuthChange}
              />
            ) : null}
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
  fieldErrors,
  onLanguageChange,
}: {
  profile: BusinessProfile | null
  updateBusiness: <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => void
  fieldErrors: Record<string, string>
  onLanguageChange: PageProps['onLanguageChange']
}) {
  if (!profile) {
    return <SettingsPanel eyebrow="Business" title="Business profile" description="Business details load after onboarding."><div className="empty-table-state">No business profile loaded.</div></SettingsPanel>
  }

  const visibleErrors = {
    ...fieldErrors,
    ...(profile.region === 'CA' && !profile.province ? { province: fieldErrors.province || 'Select the Canadian province or territory for this business.' } : {}),
    ...(profile.region === 'CA' && !/^\d{2}-\d{2}$/.test(profile.fiscal_year_start || '') ? { fiscal_year_start: fieldErrors.fiscal_year_start || 'Use MM-DD format, for example 01-01.' } : {}),
  }

  return (
    <SettingsPanel eyebrow="Business" title="Business profile" description="These details drive tax categories, exports, invoices, and business switching.">
      <div className="settings-form-grid">
        <Field label="Business name" value={profile.name || ''} onChange={(value) => updateBusiness('name', value)} placeholder="Business name" />
        <Field label="Contact name" value={profile.contact_full_name || ''} onChange={(value) => updateBusiness('contact_full_name', value)} placeholder="Contact name" />
        <SelectField label="Region" value={profile.region || 'US'} options={['US', 'CA']} onChange={(value) => updateBusiness('region', value as BusinessProfile['region'])} />
        <SelectField
          label="Language"
          value={profile.language || 'en'}
          options={languageOptions}
          onChange={(value) => {
            updateBusiness('language', value)
            onLanguageChange(normalizeLanguageValue(value))
          }}
        />
        {profile.region === 'CA' ? (
          <SelectField
            label="Province"
            value={profile.province || ''}
            options={provinceOptions}
            error={visibleErrors.province}
            onChange={(value) => updateBusiness('province', value)}
          />
        ) : null}
        <Field
          label="Fiscal year start"
          value={profile.fiscal_year_start || ''}
          onChange={(value) => updateBusiness('fiscal_year_start', normalizeFiscalYearInput(value))}
          placeholder="MM-DD"
          error={visibleErrors.fiscal_year_start}
        />
        <Field label="Operating name" value={profile.operating_name || ''} onChange={(value) => updateBusiness('operating_name', value)} placeholder="Optional DBA" />
        <Field label="Business activity code" value={profile.business_activity_code || ''} onChange={(value) => updateBusiness('business_activity_code', value)} placeholder="6-digit NAICS code" />
        <SelectField label="Accounting method" value={profile.accounting_method || ''} options={['', 'cash', 'accrual']} onChange={(value) => updateBusiness('accounting_method', value)} />
        {profile.region === 'US' ? <SelectField label="Material participation" value={profile.material_participation ? 'yes' : 'no'} options={['yes', 'no']} onChange={(value) => updateBusiness('material_participation', value === 'yes')} /> : null}
      </div>
      <AccountingLockControls />
    </SettingsPanel>
  )
}

function AccountingLockControls() {
  const [lock, setLock] = useState<AccountingLock | null>(null)
  const [lockedThroughDate, setLockedThroughDate] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    loadAccountingLock()
      .then((nextLock) => {
        if (!active) return
        setLock(nextLock)
        setLockedThroughDate(nextLock?.lockedThroughDate || '')
        setNote(nextLock?.note || '')
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load accounting lock.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function saveLock() {
    setMessage('')
    setError('')
    if (lockedThroughDate && !window.confirm('Lock accounting period? Transactions on or before this date cannot be edited or deleted.')) {
      return
    }

    setSaving(true)
    try {
      const nextLock = await saveAccountingLock({ lockedThroughDate: lockedThroughDate || null, note })
      setLock(nextLock)
      setLockedThroughDate(nextLock?.lockedThroughDate || '')
      setNote(nextLock?.note || '')
      setMessage(lockedThroughDate ? 'Accounting lock saved.' : 'Accounting lock cleared.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save accounting lock.')
    } finally {
      setSaving(false)
    }
  }

  async function clearLock() {
    setMessage('')
    setError('')
    setSaving(true)
    try {
      const nextLock = await saveAccountingLock({ lockedThroughDate: null, note: '' })
      setLock(nextLock)
      setLockedThroughDate('')
      setNote('')
      setMessage('Accounting lock cleared.')
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Unable to clear accounting lock.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-lock-panel">
      <div className="settings-row">
        <div className="settings-row-icon">
          <LockKeyhole size={19} />
        </div>
        <div>
          <strong>Accounting period lock</strong>
          <p>{loading ? 'Checking locked period...' : lock?.lockedThroughDate ? `Transactions are locked through ${formatSettingsDate(lock.lockedThroughDate)}.` : 'No accounting period lock is active.'}</p>
        </div>
        <div className="settings-row-action">
          <span className={`status-pill ${lock?.lockedThroughDate ? 'status-inactive' : 'status-cleared'}`}>
            {lock?.lockedThroughDate ? 'Locked' : 'Unlocked'}
          </span>
        </div>
      </div>
      <div className="settings-form-grid">
        <Field label="Locked through" type="date" value={lockedThroughDate} onChange={setLockedThroughDate} />
        <Field label="Closing note" value={note} onChange={setNote} placeholder="Optional note for this close" />
      </div>
      {message ? <p className="auth-success" role="status">{message}</p> : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="filter-actions">
        <button className="primary-button" type="button" disabled={saving || loading} onClick={() => void saveLock()}>
          {saving ? 'Saving...' : 'Save lock'}
        </button>
        <button className="secondary-button" type="button" disabled={saving || loading || !lock?.lockedThroughDate} onClick={() => void clearLock()}>
          Clear lock
        </button>
      </div>
    </div>
  )
}

function BillingSettings({ onNavigate }: { onNavigate: PageProps['onNavigate'] }) {
  return (
    <SettingsPanel eyebrow="Billing" title="Plan and billing" description="Manage your plan, invoices, and payment method from one place.">
      <SettingsRow icon={CreditCard} title="Subscription" description="Review your plan, invoices, payment method, and billing interval.">
        <button className="primary-button" type="button" onClick={() => onNavigate('Subscription')}>Manage plan</button>
      </SettingsRow>
      <SettingsRow icon={Building2} title="Business workspaces" description="Switch, add, or remove business workspaces.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('BusinessWorkspaces')}>Manage workspaces</button>
      </SettingsRow>
    </SettingsPanel>
  )
}

function SecuritySettings({
  onNavigate,
  authUser,
  onAuthChange,
}: {
  onNavigate: PageProps['onNavigate']
  authUser: PageProps['authUser']
  onAuthChange: PageProps['onAuthChange']
}) {
  const [mfaOpen, setMfaOpen] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(Boolean(authUser?.mfaEnabled))

  useEffect(() => {
    setMfaEnabled(Boolean(authUser?.mfaEnabled))
  }, [authUser?.mfaEnabled])

  useEffect(() => {
    void loadMfaStatus()
      .then((status) => setMfaEnabled(Boolean(status.enabled)))
      .catch(() => undefined)
  }, [])

  return (
    <SettingsPanel eyebrow="Security" title="Account protection" description="Control sessions and protected account changes from one security area.">
      <SettingsRow icon={ShieldCheck} title="Multi-factor authentication" description="Require an emailed 6-digit code for sign-ins from new or untrusted devices.">
        <div className="settings-row-action-stack">
          <span className={`status-pill ${mfaEnabled ? 'status-cleared' : 'status-draft'}`}>{mfaEnabled ? 'On' : 'Off'}</span>
          <button className="secondary-button" type="button" onClick={() => setMfaOpen(true)}>Manage MFA</button>
        </div>
      </SettingsRow>
      <SettingsRow icon={MonitorSmartphone} title="Active sessions" description="Review signed-in devices and revoke sessions you do not recognize.">
        <button className="secondary-button" type="button" onClick={() => onNavigate('Sessions')}>Review sessions</button>
      </SettingsRow>
      {mfaOpen ? (
        <MfaSettingsModal
          enabled={mfaEnabled}
          onClose={() => setMfaOpen(false)}
          onComplete={async (enabled) => {
            setMfaEnabled(enabled)
            onAuthChange((await refreshCurrentUser()).user)
            setMfaOpen(false)
          }}
        />
      ) : null}
    </SettingsPanel>
  )
}

function MfaSettingsModal({
  enabled,
  onClose,
  onComplete,
}: {
  enabled: boolean
  onClose: () => void
  onComplete: (enabled: boolean) => Promise<void>
}) {
  const nextEnabled = !enabled
  const [code, setCode] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  async function sendCode() {
    setWorking(true)
    setError('')
    try {
      const response = await requestMfaToggle(nextEnabled)
      setMfaToken(response.mfa_token || '')
      setMessage(response.message || 'Check your email for the 6-digit verification code.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send verification code.')
    } finally {
      setWorking(false)
    }
  }

  async function confirmCode() {
    if (!mfaToken) {
      await sendCode()
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setWorking(true)
    setError('')
    try {
      await confirmMfaToggle(nextEnabled, mfaToken, code.trim())
      await onComplete(nextEnabled)
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Unable to verify MFA code.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="transaction-detail-modal settings-mfa-modal" role="dialog" aria-modal="true" aria-labelledby="mfaSettingsTitle" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 id="mfaSettingsTitle">{nextEnabled ? 'Turn on MFA' : 'Turn off MFA'}</h2>
            <p>{mfaToken ? 'Check your email for the code and enter it below.' : 'We will email a 6-digit code before changing MFA.'}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close MFA settings" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="transaction-detail-body">
          {mfaToken ? (
            <label className="field">
              Verification code
              <input inputMode="numeric" maxLength={6} value={code} placeholder="000000" onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
          ) : null}
          {message ? <p className="auth-success" role="status">{message}</p> : null}
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </div>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          {!mfaToken ? (
            <button className="primary-button" type="button" disabled={working} onClick={() => void sendCode()}>{working ? 'Sending...' : 'Send verification'}</button>
          ) : (
            <button className="primary-button" type="button" disabled={working} onClick={() => void confirmCode()}>{working ? 'Verifying...' : nextEnabled ? 'Turn on MFA' : 'Turn off MFA'}</button>
          )}
        </div>
      </section>
    </div>
  )
}

function PreferenceSettings({
  privacySettings,
  updatePrivacy,
}: {
  privacySettings: PrivacySettings | null
  updatePrivacy: <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => void
}) {
  return (
    <SettingsPanel eyebrow="Preferences" title="Defaults" description="Set the interface and privacy choices used across the app.">
      <div className="settings-form-grid">
        <Field label="Theme" value="Light" readOnly />
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

function formatSettingsDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeFiscalYearInput(value: string) {
  const cleaned = value.replace(/[^\d-]/g, '').slice(0, 5)
  if (/^\d{2}$/.test(cleaned)) return `${cleaned}-`
  return cleaned
}

function validateBusinessProfile(profile: BusinessProfile) {
  const errors: Record<string, string> = {}
  if (profile.region === 'CA' && !profile.province) {
    errors.province = 'Select the Canadian province or territory for this business.'
  }
  if (profile.region === 'CA' && !/^\d{2}-\d{2}$/.test(profile.fiscal_year_start || '')) {
    errors.fiscal_year_start = 'Use MM-DD format, for example 01-01.'
  }
  if (profile.region === 'US' && typeof profile.material_participation !== 'boolean') {
    errors.material_participation = 'Choose yes or no.'
  }
  return errors
}

export default Settings
