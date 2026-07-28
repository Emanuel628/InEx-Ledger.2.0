import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { normalizeLanguage } from '../lib/i18n'
import { sendOnboardingVerificationCode, verifyOnboardingCode } from '../lib/authApi'
import { completeOnboarding, type OnboardingDraft } from '../lib/settingsApi'

type OnboardingStep = 'business' | 'mfa-prompt' | 'verify-code'

function Onboarding(props: PageProps) {
  const [step, setStep] = useState<OnboardingStep>('business')
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

  const [wantsMfa, setWantsMfa] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [digits, setDigits] = useState(Array<string>(6).fill(''))
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)

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

  async function finishOnboarding() {
    setSubmitting(true)
    setError('')
    try {
      const { user } = await completeOnboarding(draft)
      props.onAuthChange(user)
      props.onNavigate('Transactions')
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : 'Unable to complete onboarding.')
    } finally {
      setSubmitting(false)
    }
  }

  function submitBusiness() {
    setError('')
    // A user resuming onboarding after already verifying their email (e.g.
    // they reloaded partway through) doesn't need to go through the code
    // step again -- just finish setup directly.
    if (props.authUser?.emailVerified) {
      void finishOnboarding()
      return
    }
    setStep('mfa-prompt')
  }

  async function chooseMfa(choice: boolean) {
    setSubmitting(true)
    setError('')
    try {
      setWantsMfa(choice)
      const response = await sendOnboardingVerificationCode(choice)
      setMfaToken(response.mfa_token || '')
      setStep('verify-code')
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : 'Unable to send verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  function updateDigit(index: number, value: string) {
    const nextValue = value.replace(/\D/g, '').slice(-1)
    setDigits((current) => current.map((digit, digitIndex) => (digitIndex === index ? nextValue : digit)))
    setError('')
  }

  async function submitCode() {
    const code = digits.join('')
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await verifyOnboardingCode(mfaToken, code)
      await finishOnboarding()
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Invalid or expired code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function resendCode() {
    setResending(true)
    setError('')
    setMessage('')
    try {
      const response = await sendOnboardingVerificationCode(wantsMfa)
      setMfaToken(response.mfa_token || '')
      setMessage(response.message || 'We emailed you a new verification code.')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Unable to resend the code.')
    } finally {
      setResending(false)
    }
  }

  const stepNumber = step === 'business' ? 2 : 3

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>{step === 'business' ? 'Business basics' : step === 'mfa-prompt' ? 'Secure your account' : 'Verify your email'}</h2>
      <p>
        {step === 'business'
          ? 'Set the workspace details and first account so the app opens with real defaults.'
          : step === 'mfa-prompt'
            ? 'Optional: add a one-time code at sign-in for extra protection.'
            : `Enter the 6-digit code we emailed to ${props.authUser?.email || 'your email'}.`}
      </p>
      <div className="onboarding-steps">
        <div className="onboarding-step">
          <span>1</span>
          <div><strong>Account created</strong><small>Sign-in is ready.</small></div>
        </div>
        <div className={`onboarding-step ${stepNumber === 2 ? 'is-active' : ''}`}>
          <span>2</span>
          <div><strong>Business profile</strong><small>Add the business name, region, and first account.</small></div>
        </div>
        <div className={`onboarding-step ${stepNumber === 3 ? 'is-active' : ''}`}>
          <span>3</span>
          <div><strong>Secure and verify</strong><small>Optional MFA, then confirm your email with a 6-digit code.</small></div>
        </div>
      </div>

      {step === 'business' ? (
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault()
          submitBusiness()
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
      ) : null}

      {step === 'mfa-prompt' ? (
        <div className="auth-form">
          <p>
            Multi-factor authentication asks for a one-time emailed code each time you sign in from a new
            device. You can turn it on now, or skip it and enable it later in Settings.
          </p>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="button" disabled={submitting} onClick={() => void chooseMfa(true)}>
            {submitting && wantsMfa ? 'Sending code...' : 'Turn on MFA'}
          </button>
          <button className="auth-link" type="button" disabled={submitting} onClick={() => void chooseMfa(false)}>
            {submitting && !wantsMfa ? 'Sending code...' : 'Skip for now'}
          </button>
        </div>
      ) : null}

      {step === 'verify-code' ? (
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault()
          void submitCode()
        }}>
          <div className="auth-code-row" aria-label="Security code">
            {Array.from({ length: 6 }).map((_, index) => (
              <input
                key={index}
                inputMode="numeric"
                maxLength={1}
                aria-label={`Digit ${index + 1}`}
                value={digits[index]}
                onChange={(event) => updateDigit(index, event.target.value)}
              />
            ))}
          </div>
          {wantsMfa ? <p>This code will also turn on MFA for your account.</p> : null}
          {message ? <p className="auth-success" role="status">{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Verifying...' : 'Verify and enter dashboard'}
          </button>
          <button className="auth-link" type="button" disabled={resending} onClick={() => void resendCode()}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </form>
      ) : null}
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
