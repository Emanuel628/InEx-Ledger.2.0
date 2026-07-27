import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { confirmEmailChange, getCurrentUser, resendLoginMfa, verifyLoginMfa } from '../lib/authApi'

function MfaChallenge(props: PageProps) {
  const context = useMemo(() => window.sessionStorage.getItem('inex-mfa-context'), [])
  const isEmailChange = context === 'email-change'
  const isLogin = context === 'login'
  const [mfaToken, setMfaToken] = useState(() => window.sessionStorage.getItem('inex-mfa-token') || '')
  const [digits, setDigits] = useState(Array<string>(6).fill(''))
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  function clearMfaSession() {
    window.sessionStorage.removeItem('inex-mfa-context')
    window.sessionStorage.removeItem('inex-mfa-token')
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
      if (isEmailChange) {
        await confirmEmailChange(code)
        clearMfaSession()
        props.onAuthChange(null)
        props.onNavigate('Login')
        return
      }

      if (isLogin) {
        await verifyLoginMfa(mfaToken, code, trustDevice)
        clearMfaSession()
        const { user } = await getCurrentUser()
        props.onAuthChange(user)
        return
      }

      // No recognized challenge context (e.g. a stale/refreshed tab) — the
      // safest recovery is to restart from sign-in rather than guess.
      props.onNavigate('Login')
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function resendCode() {
    if (!isLogin || !mfaToken) return
    setResending(true)
    setError('')
    setMessage('')
    try {
      const response = await resendLoginMfa(mfaToken)
      if (response.mfa_token) {
        setMfaToken(response.mfa_token)
        window.sessionStorage.setItem('inex-mfa-token', response.mfa_token)
      }
      setMessage(response.message || 'We emailed you a new verification code.')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Unable to resend the code.')
    } finally {
      setResending(false)
    }
  }

  function updateDigit(index: number, value: string) {
    const nextValue = value.replace(/\D/g, '').slice(-1)
    setDigits((current) => current.map((digit, digitIndex) => (digitIndex === index ? nextValue : digit)))
    setError('')
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>{isEmailChange ? 'Verify email change' : 'Enter security code'}</h2>
      <p>{isEmailChange ? 'Use the code sent to your current email to finish changing your account email.' : 'Use the code sent to your email for this sign-in attempt.'}</p>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
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
        {isEmailChange ? null : <label className="auth-check">
          <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
          Trust this device
        </label>}
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={submitting} onClick={() => void submitCode()}>
          {submitting ? 'Verifying...' : 'Continue'}
        </button>
        {isLogin ? (
          <button className="auth-link" type="button" disabled={resending} onClick={() => void resendCode()}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={() => props.onNavigate(isEmailChange ? 'Settings' : 'Login')}>
          {isEmailChange ? 'Back to Settings' : 'Back to sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

export default MfaChallenge
