import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { resetPassword } from '../lib/authApi'

function ResetPassword(props: PageProps) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitReset() {
    setSubmitting(true)
    setError('')
    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }

      await resetPassword({ email, code, password })
      props.onNavigate('Login')
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Reset password</h2>
      <p>Enter the reset code from your email and choose a new password.</p>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitReset()
      }}>
        <label>
          Email
          <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Reset code
          <input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Updating...' : 'Update password'}</button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to Settings</button>
      </form>
    </AuthShell>
  )
}

export default ResetPassword
