import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import {
  confirmEmailChange,
  getCurrentUser,
  resendLoginMfa,
  sendSignupVerificationCode,
  verifyLoginMfa,
  verifySignupCode,
} from '../lib/authApi'

function MfaChallenge(props: PageProps) {
  const context = useMemo(() => window.sessionStorage.getItem('inex-mfa-context'), [])
  const isEmailChange = context === 'email-change'
  const isLogin = context === 'login'
  const isSignup = context === 'signup'
  const [mfaToken, setMfaToken] = useState(() => window.sessionStorage.getItem('inex-mfa-token') || '')
  const [digits, setDigits] = useState(Array<string>(6).fill(''))
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const sentInitialSignupCode = useRef(false)
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([])

  function clearMfaSession() {
    window.sessionStorage.removeItem('inex-mfa-context')
    window.sessionStorage.removeItem('inex-mfa-token')
  }

  // Signup verification has no prior "choose an option" screen -- the code
  // is requested the moment the user lands here, rather than gated behind a
  // button click.
  useEffect(() => {
    if (!isSignup || sentInitialSignupCode.current) return
    sentInitialSignupCode.current = true
    setSubmitting(true)
    sendSignupVerificationCode()
      .then((response) => {
        if (response.mfa_token) {
          setMfaToken(response.mfa_token)
          window.sessionStorage.setItem('inex-mfa-token', response.mfa_token)
        }
      })
      .catch((sendError) => {
        setError(sendError instanceof Error ? sendError.message : 'Unable to send verification code.')
      })
      .finally(() => setSubmitting(false))
  }, [isSignup])

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

      if (isSignup) {
        await verifySignupCode(mfaToken, code)
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
    if (isSignup) {
      setResending(true)
      setError('')
      setMessage('')
      try {
        const response = await sendSignupVerificationCode()
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
      return
    }

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

  // A single input receiving the browser's OTP autofill suggestion (or a
  // paste of the whole code) gets the full string in one onChange, not one
  // digit at a time -- distribute it across the boxes from this index on.
  function fillDigitsFrom(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '').slice(0, 6 - index)
    if (!clean) return
    setDigits((current) => {
      const next = [...current]
      for (let offset = 0; offset < clean.length; offset += 1) {
        next[index + offset] = clean[offset]
      }
      return next
    })
    setError('')
    const nextEmptyIndex = Math.min(index + clean.length, 5)
    codeInputRefs.current[nextEmptyIndex]?.focus()
    if (index + clean.length >= 6) {
      codeInputRefs.current[5]?.blur()
    }
  }

  function updateDigit(index: number, value: string) {
    const digitsOnly = value.replace(/\D/g, '')
    const previous = digits[index]
    // A controlled single-digit box that already held a value shows the old
    // and new character together for one tick before React corrects it (e.g.
    // "5" -> "53" when the user types "3" over it) -- that's an ordinary
    // keystroke, not autofill, so only treat a genuine multi-digit value as a
    // fill/paste when it isn't just the previous digit plus one more.
    if (digitsOnly.length > 1 && !(previous && digitsOnly.startsWith(previous))) {
      fillDigitsFrom(index, digitsOnly)
      return
    }
    const nextValue = digitsOnly.slice(-1)
    setDigits((current) => current.map((digit, digitIndex) => (digitIndex === index ? nextValue : digit)))
    setError('')
    if (nextValue && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  function handleCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  function handleCodePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    if (/\d/.test(pasted)) {
      event.preventDefault()
      fillDigitsFrom(index, pasted)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>{isEmailChange ? 'Verify email change' : isSignup ? 'Verify your email' : 'Enter security code'}</h2>
      <p>
        {isEmailChange
          ? 'Use the code sent to your current email to finish changing your account email.'
          : isSignup
            ? `Enter the 6-digit code we emailed to ${props.authUser?.email || 'your email'} to finish creating your account.`
            : 'Use the code sent to your email for this sign-in attempt.'}
      </p>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <div className="auth-code-row" aria-label="Security code">
          {Array.from({ length: 6 }).map((_, index) => (
            <input
              key={index}
              ref={(element) => { codeInputRefs.current[index] = element }}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${index + 1}`}
              value={digits[index]}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleCodeKeyDown(index, event)}
              onPaste={(event) => handleCodePaste(index, event)}
            />
          ))}
        </div>
        {isLogin ? <label className="auth-check">
          <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
          Trust this device
        </label> : null}
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={submitting || (isSignup && !mfaToken)} onClick={() => void submitCode()}>
          {submitting ? (isSignup && !mfaToken ? 'Sending code...' : 'Verifying...') : 'Continue'}
        </button>
        {isLogin || isSignup ? (
          <button className="auth-link" type="button" disabled={resending} onClick={() => void resendCode()}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        ) : null}
        {isSignup ? null : (
          <button className="secondary-button" type="button" onClick={() => props.onNavigate(isEmailChange ? 'Settings' : 'Login')}>
            {isEmailChange ? 'Back to Settings' : 'Back to sign in'}
          </button>
        )}
      </form>
    </AuthShell>
  )
}

export default MfaChallenge
