import { useState } from 'react'
import { LogIn } from 'lucide-react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { loginUser } from '../lib/authApi'

function getSignedOutReason() {
  const reason = new URLSearchParams(window.location.search).get('reason')
  return reason === 'inactive' || reason === 'expired' ? reason : null
}

function Login(props: PageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signedOutReason] = useState(getSignedOutReason)

  async function submitLogin() {
    setSubmitting(true)
    setError('')
    try {
      const result = await loginUser(email, password)
      if (result.mfaRequired) {
        window.sessionStorage.setItem('inex-mfa-context', 'login')
        window.sessionStorage.setItem('inex-mfa-token', result.mfaToken)
        props.onNavigate('MfaChallenge')
        return
      }
      props.onAuthChange(result.user)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Sign in</h2>
      <p>Use the email and password attached to your InEx Ledger account.</p>
      {signedOutReason === 'inactive' ? (
        <p className="auth-success" role="status">You were signed out after 15 minutes of inactivity.</p>
      ) : null}
      {signedOutReason === 'expired' ? (
        <p className="auth-success" role="status">Your session expired. Please sign in again.</p>
      ) : null}
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitLogin()
      }}>
        <label>
          Email
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <div className="auth-inline-row">
          <label className="auth-check">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            Show password
          </label>
          <button className="auth-link" type="button" onClick={() => props.onNavigate('ForgotPassword')}>Forgot password?</button>
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>
          <LogIn size={18} />
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <div className="auth-card-footer">
        <span>New here?</span>
        <button className="auth-link" type="button" onClick={() => props.onNavigate('Register')}>Create an account</button>
      </div>
    </AuthShell>
  )
}

export default Login
