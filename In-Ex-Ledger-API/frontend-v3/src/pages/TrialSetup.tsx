import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'

function TrialSetup(props: PageProps) {
  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Set up Pro</h2>
      <p>Choose billing cadence and confirm the workspace before checkout is connected.</p>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Business name
          <input placeholder="Business name" />
        </label>
        <label>
          Billing cadence
          <select defaultValue="monthly">
            <option value="monthly">Monthly - $12</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label className="auth-check">
          <input type="checkbox" />
          I understand this frontend does not process payment yet.
        </label>
        <button className="primary-button" type="button" onClick={() => props.onNavigate('Subscription')}>Preview subscription</button>
      </form>
    </AuthShell>
  )
}

export default TrialSetup
