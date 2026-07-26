import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { confirmEmailChange, requestEmailChange } from '../lib/authApi'

function ChangeEmail(props: PageProps) {
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitRequest() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await requestEmailChange({ newEmail, password })
      setMessage(response.verificationCode ? `Verification code: ${response.verificationCode}` : response.message)
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Unable to start email change.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitConfirm() {
    setSubmitting(true)
    setError('')
    try {
      const { user } = await confirmEmailChange(code)
      props.onAuthChange(user)
      props.onNavigate('Settings')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Unable to confirm email change.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Change email</h2>
      <p>Confirm the current email, enter the new email, then verify the change before it takes effect.</p>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Current email
          <input type="email" autoComplete="email" value={props.authUser?.email || ''} readOnly />
        </label>
        <label>
          New email
          <input type="email" autoComplete="email" placeholder="new@example.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" placeholder="Confirm password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          Verification code
          <input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="button" disabled={submitting} onClick={() => void submitRequest()}>
          {submitting ? 'Sending...' : 'Send verification'}
        </button>
        <button className="secondary-button" type="button" disabled={submitting} onClick={() => void submitConfirm()}>
          Confirm email change
        </button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Cancel</button>
      </form>
    </AuthShell>
  )
}

export default ChangeEmail
