import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'

function MfaChallenge(props: PageProps) {
  return (
    <AuthShell
      theme={props.theme}
      onNavigate={props.onNavigate}
    >
      <h2>Enter security code</h2>
      <p>Use the code sent to your email for this sign-in attempt.</p>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <div className="auth-code-row" aria-label="Security code">
          {Array.from({ length: 6 }).map((_, index) => (
            <input key={index} inputMode="numeric" maxLength={1} aria-label={`Digit ${index + 1}`} />
          ))}
        </div>
        <label className="auth-check">
          <input type="checkbox" />
          Trust this device
        </label>
        <button className="primary-button" type="button" onClick={() => props.onNavigate('Transactions')}>Continue</button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Login')}>Back to sign in</button>
      </form>
    </AuthShell>
  )
}

export default MfaChallenge
