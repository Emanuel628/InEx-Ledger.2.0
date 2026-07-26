import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { verifyEmail } from '../lib/authApi'

function VerifyEmail(props: PageProps) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitVerification() {
    setSubmitting(true)
    setError('')
    try {
      const { user } = await verifyEmail()
      props.onAuthChange(user)
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify email.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Check your email</h2>
      <p>Enter the code sent to your inbox to continue creating your workspace.</p>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitVerification()
      }}>
        <div className="auth-code-row" aria-label="Verification code">
          {Array.from({ length: 6 }).map((_, index) => (
            <input key={index} inputMode="numeric" maxLength={1} aria-label={`Digit ${index + 1}`} />
          ))}
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Verifying...' : 'Verify email'}</button>
        <button className="auth-link" type="button">Resend code</button>
      </form>
    </AuthShell>
  )
}

export default VerifyEmail
