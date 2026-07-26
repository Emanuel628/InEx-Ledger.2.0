import type { ReactNode } from 'react'
import type { AppPage, ThemeMode } from '../App'

type AuthShellProps = {
  theme: ThemeMode
  onNavigate: (page: AppPage) => void
  children: ReactNode
}

function AuthShell({ theme, onNavigate, children }: AuthShellProps) {
  return (
    <main className="auth-shell" data-theme={theme}>
      <section className="auth-brand-panel">
        <button className="auth-brand" type="button" onClick={() => onNavigate('Landing')}>
          <span>
            <img src="/brand/inex-mark-color.svg" alt="" aria-hidden="true" />
          </span>
          InEx Ledger
        </button>
      </section>

      <section className="auth-card">
        {children}
      </section>
    </main>
  )
}

export default AuthShell
