import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { confirmEmailChange } from '../lib/authApi'

function MfaChallenge(props: PageProps) {
  const context = useMemo(() => window.sessionStorage.getItem('inex-mfa-context'), [])
  const isEmailChange = context === 'email-change'
  const [digits, setDigits] = useState(Array<string>(6).fill(''))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
        window.sessionStorage.removeItem('inex-mfa-context')
        props.onAuthChange(null)
        props.onNavigate('Login')
        return
      }
      props.onNavigate('Transactions')
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify code.')
    } finally {
      setSubmitting(false)
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
          <input type="checkbox" />
          Trust this device
        </label>}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={submitting} onClick={() => void submitCode()}>
          {submitting ? 'Verifying...' : 'Continue'}
        </button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate(isEmailChange ? 'Settings' : 'Login')}>
          {isEmailChange ? 'Back to Settings' : 'Back to sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

export default MfaChallenge
