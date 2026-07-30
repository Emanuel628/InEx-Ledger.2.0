import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { normalizeLanguage } from '../lib/i18n'
import { completeOnboarding, type OnboardingDraft } from '../lib/settingsApi'

function Onboarding(props: PageProps) {
  const [draft, setDraft] = useState<OnboardingDraft>({
    // Business name and starter account name start empty (placeholders only) --
    // a business landing on onboarding was just auto-created with a filler
    // name like "My Business", which isn't something the user typed and
    // shouldn't be pre-filled as a value they have to delete first.
    businessName: '',
    region: 'US',
    province: '',
    language: 'en',
    starterAccountType: 'checking',
    starterAccountName: '',
    startFocus: 'transactions',
    businessActivityCode: '',
    accountingMethod: 'cash',
    materialParticipation: 'yes',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateDraft<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value }
      if (key === 'starterAccountType' && !current.starterAccountName.trim()) {
        next.starterAccountName = defaultAccountName(String(value), current.region)
      }
      if (key === 'region' && current.starterAccountName === defaultAccountName(current.starterAccountType, current.region)) {
        next.starterAccountName = defaultAccountName(current.starterAccountType, String(value))
      }
      return next
    })
  }

  async function submitBusiness() {
    setSubmitting(true)
    setError('')
    try {
      const { user, redirectTo } = await completeOnboarding(draft)
      props.onAuthChange(user)
      props.onNavigateToPath(redirectTo)
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : 'Unable to complete onboarding.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Business basics</h2>
      <p>Set the workspace details and first account so the app opens with real defaults.</p>
      <div className="onboarding-steps">
        <div className="onboarding-step">
          <span>1</span>
          <div><strong>Account created</strong><small>Sign-in is ready.</small></div>
        </div>
        <div className="onboarding-step is-active">
          <span>2</span>
          <div><strong>Business profile</strong><small>Add the business name, region, and first account.</small></div>
        </div>
      </div>

      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitBusiness()
      }}>
        <label>
          Business name
          <input placeholder="Business name" value={draft.businessName} onChange={(event) => updateDraft('businessName', event.target.value)} />
        </label>
        <div className="auth-form-grid">
          <label>
            Region
            <select value={draft.region} onChange={(event) => updateDraft('region', event.target.value as OnboardingDraft['region'])}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>
          <label>
            Language
            <select
              value={draft.language}
              onChange={(event) => {
                updateDraft('language', event.target.value)
                props.onLanguageChange(normalizeLanguage(event.target.value))
              }}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>
          </label>
        </div>
        {draft.region === 'CA' ? (
          <label>
            Province
            <select value={draft.province} onChange={(event) => updateDraft('province', event.target.value)}>
              <option value="">Choose province</option>
              {['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'].map((province) => (
                <option value={province} key={province}>{province}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="auth-form-grid">
          <label>
            First account type
            <select value={draft.starterAccountType} onChange={(event) => updateDraft('starterAccountType', event.target.value)}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit card</option>
              <option value="cash">Cash</option>
              <option value="loan">Loan</option>
            </select>
          </label>
          <label>
            First account name
            <input value={draft.starterAccountName} onChange={(event) => updateDraft('starterAccountName', event.target.value)} placeholder="Primary Checking" />
          </label>
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving setup...' : 'Continue'}</button>
      </form>
    </AuthShell>
  )
}

function defaultAccountName(type: string, region: string) {
  if (type === 'credit_card') return 'Business Card'
  if (type === 'savings') return 'Primary Savings'
  if (type === 'cash') return 'Cash'
  if (type === 'loan') return 'Business Loan'
  return region === 'CA' ? 'Primary Chequing' : 'Primary Checking'
}

export default Onboarding
