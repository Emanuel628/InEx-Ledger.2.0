import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { registerUser } from '../lib/authApi'

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { key: 'uppercase', label: 'Includes an uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'number', label: 'Includes a number', test: (value: string) => /\d/.test(value) },
  { key: 'special', label: 'Includes a symbol', test: (value: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value) },
] as const

function passwordMeetsRequirements(value: string) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(value))
}

function Register(props: PageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const metRequirements = useMemo(
    () => PASSWORD_REQUIREMENTS.map((requirement) => ({ ...requirement, met: requirement.test(password) })),
    [password],
  )
  const strengthScore = metRequirements.filter((requirement) => requirement.met).length
  const strengthLabel = password.length === 0 ? '' : strengthScore <= 1 ? 'Weak' : strengthScore <= 3 ? 'Fair' : 'Strong'
  const passwordsMatch = confirmPassword.length === 0 ? null : password === confirmPassword

  async function submitRegister() {
    setSubmitting(true)
    setError('')
    try {
      if (!acceptedTerms) {
        throw new Error('You must accept the Terms and Privacy Policy to create an account.')
      }
      if (!passwordMeetsRequirements(password)) {
        throw new Error('Password does not meet the requirements below.')
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }
      const { user } = await registerUser({ firstName, lastName, email, password, acceptedTerms })
      // onAuthChange alone routes to the right destination (chooseAuthenticatedPage
      // sends a fresh, unverified user to Onboarding) -- calling onNavigate right
      // after would race the setAuthUser state update and read the stale (still
      // logged-out) authUser from this render's closure.
      props.onAuthChange(user)
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

        <div className="password-meter-row">
          <div className="password-meter" aria-hidden="true">
            <div className={`meter-segment${strengthScore >= 2 ? ' is-filled' : ''}${strengthScore <= 1 && password.length > 0 ? ' is-weak' : ''}`} />
            <div className={`meter-segment${strengthScore >= 3 ? ' is-filled' : ''}${strengthScore === 2 || strengthScore === 3 ? ' is-fair' : ''}`} />
            <div className={`meter-segment${strengthScore >= 4 ? ' is-filled' : ''}${strengthScore >= 4 ? ' is-strong' : ''}`} />
          </div>
          {strengthLabel ? <p className="password-strength-text">{strengthLabel}</p> : null}
        </div>

        <ul className="password-requirements" aria-label="Password requirements">
          {metRequirements.map((requirement) => (
            <li key={requirement.key} className={requirement.met ? 'is-met' : ''}>{requirement.label}</li>
          ))}
        </ul>

        <label>
          Confirm password
          <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {passwordsMatch === false ? <p className="password-match-message is-mismatch">Passwords do not match.</p> : null}
        {passwordsMatch === true ? <p className="password-match-message is-match">Passwords match.</p> : null}

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
