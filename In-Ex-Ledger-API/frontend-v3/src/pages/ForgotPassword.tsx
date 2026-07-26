import { useState } from 'react'
import { Mail } from 'lucide-react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { requestPasswordReset } from '../lib/authApi'

function ForgotPassword(props: PageProps) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitResetRequest() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await requestPasswordReset(email)
      setMessage(response.resetCode ? `Reset code: ${response.resetCode}` : response.message)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to create reset code.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Forgot password</h2>
      <p>Enter your email and we will send a reset link if the account exists.</p>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitResetRequest()
      }}>
        <label>
          Email
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>
          <Mail size={18} />
          {submitting ? 'Creating code...' : 'Send reset code'}
        </button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('ResetPassword')}>I have a code</button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Login')}>Back to sign in</button>
      </form>
    </AuthShell>
  )
}

export default ForgotPassword
