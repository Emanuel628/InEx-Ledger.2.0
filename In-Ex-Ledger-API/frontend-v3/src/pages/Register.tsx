import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { registerUser } from '../lib/authApi'

function Register(props: PageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitRegister() {
    setSubmitting(true)
    setError('')
    try {
      if (!acceptedTerms) {
        throw new Error('You must accept the Terms and Privacy Policy to create an account.')
      }
      const { verificationState, signupBootstrapToken } = await registerUser({ firstName, lastName, email, password, acceptedTerms })
      window.sessionStorage.setItem('inex-verify-email-address', email)
      window.sessionStorage.setItem('inex-verify-email-state', verificationState)
      window.sessionStorage.setItem('inex-verify-signup-token', signupBootstrapToken)
      props.onNavigate('VerifyEmail')
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Unable to create account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Create account</h2>
      <p>Set up your personal login before creating the first business workspace.</p>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitRegister()
      }}>
        <div className="auth-form-grid">
          <label>
            First name
            <input autoComplete="given-name" placeholder="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            Last name
            <input autoComplete="family-name" placeholder="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          Email
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Create password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="auth-check">
          <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
          Show password
        </label>
        <label className="auth-check">
          <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
          I agree to the Terms and Privacy Policy.
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
      </form>
      <div className="auth-card-footer">
        <span>Already have an account?</span>
        <button className="auth-link" type="button" onClick={() => props.onNavigate('Login')}>Sign in</button>
      </div>
    </AuthShell>
  )
}

export default Register
