import { useEffect, useRef, useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { checkEmailVerified, completeVerifiedSignup, getCurrentUser, resendVerificationEmail } from '../lib/authApi'

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 40

function clearStoredVerification() {
  window.sessionStorage.removeItem('inex-verify-email-address')
  window.sessionStorage.removeItem('inex-verify-email-state')
  window.sessionStorage.removeItem('inex-verify-signup-token')
}

function VerifyEmail(props: PageProps) {
  const [email] = useState(() => window.sessionStorage.getItem('inex-verify-email-address') || props.authUser?.email || '')
  const [verificationState, setVerificationState] = useState(() => window.sessionStorage.getItem('inex-verify-email-state') || '')
  const [message, setMessage] = useState('Check your inbox for the verification link. This page continues automatically once you click it.')
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const pollsRemaining = useRef(MAX_POLLS)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!verificationState) {
      return undefined
    }

    let cancelled = false

    async function poll() {
      if (cancelled) return
      if (pollsRemaining.current <= 0) {
        setMessage('Still waiting for verification. Check your inbox, or resend the email below.')
        return
      }
      pollsRemaining.current -= 1

      try {
        const { verified } = await checkEmailVerified(verificationState)
        if (verified) {
          await finalizeVerification()
          return
        }
      } catch {
        // Transient network/API failure — keep polling rather than giving up.
      }

      if (!cancelled) {
        timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [verificationState])

  async function finalizeVerification() {
    setMessage('Email verified.')
    const signupBootstrapToken = window.sessionStorage.getItem('inex-verify-signup-token') || ''

    // The bootstrap token authenticates this browser directly. It only
    // succeeds when the verification link was opened on this same device
    // (the token is bound to a device fingerprint captured at registration).
    if (signupBootstrapToken) {
      try {
        await completeVerifiedSignup(signupBootstrapToken)
        clearStoredVerification()
        const { user } = await getCurrentUser()
        if (user) {
          props.onAuthChange(user)
          return
        }
      } catch {
        // Fall through — most likely the link was opened on a different
        // device/browser, so this session was never authenticated by it.
      }
    }

    // Cookies apply browser-wide, so if the link was opened in another tab
    // of this same browser, this session may already be authenticated.
    try {
      const { user } = await getCurrentUser()
      if (user?.emailVerified) {
        clearStoredVerification()
        props.onAuthChange(user)
        return
      }
    } catch {
      // Not authenticated here — send the user to sign in manually.
    }

    clearStoredVerification()
    props.onNavigate('Login')
  }

  async function resend() {
    setResending(true)
    setError('')
    try {
      const response = await resendVerificationEmail(verificationState, email)
      if (response.verification_state) {
        setVerificationState(response.verification_state)
        window.sessionStorage.setItem('inex-verify-email-state', response.verification_state)
        pollsRemaining.current = MAX_POLLS
      }
      setMessage(response.message || 'Verification email sent.')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Unable to resend verification email.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Check your email</h2>
      <p>{email ? `We sent a verification link to ${email}.` : 'We sent a verification link to your email.'} Click it to finish creating your account.</p>
      <div className="auth-form">
        <p className="auth-success" role="status">{message}</p>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={resending} onClick={() => void resend()}>
          {resending ? 'Sending...' : 'Resend verification email'}
        </button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Login')}>Back to sign in</button>
      </div>
    </AuthShell>
  )
}

export default VerifyEmail
