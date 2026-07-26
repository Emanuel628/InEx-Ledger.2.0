import { useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { createBusiness } from '../lib/authApi'

function Onboarding(props: PageProps) {
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('llc')
  const [currency, setCurrency] = useState('usd')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submitBusiness() {
    setSubmitting(true)
    setError('')
    try {
      const { user } = await createBusiness({ name: businessName, type: businessType, currency })
      props.onAuthChange(user)
    } catch (businessError) {
      setError(businessError instanceof Error ? businessError.message : 'Unable to create business.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Business basics</h2>
      <p>These settings can be changed later in Settings.</p>
      <div className="onboarding-steps">
        <div className="onboarding-step">
          <span>1</span>
          <div><strong>Account created</strong><small>Email verified and sign-in is ready.</small></div>
        </div>
        <div className="onboarding-step">
          <span>2</span>
          <div><strong>Business profile</strong><small>Add the business name, type, region, and currency.</small></div>
        </div>
        <div className="onboarding-step">
          <span>3</span>
          <div><strong>First transaction</strong><small>Start with one income or expense entry.</small></div>
        </div>
      </div>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault()
        void submitBusiness()
      }}>
        <label>
          Business name
          <input placeholder="Sample Studio LLC" value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </label>
        <div className="auth-form-grid">
          <label>
            Business type
            <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>
              <option value="sole">Sole proprietor</option>
              <option value="llc">LLC</option>
              <option value="corp">Corporation</option>
            </select>
          </label>
          <label>
            Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="usd">USD</option>
              <option value="cad">CAD</option>
            </select>
          </label>
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating business...' : 'Enter dashboard'}</button>
      </form>
    </AuthShell>
  )
}

export default Onboarding
