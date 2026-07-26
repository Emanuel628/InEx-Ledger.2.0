import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import type { AppPage, ThemeMode } from '../App'

type PublicShellProps = {
  theme: ThemeMode
  onNavigate: (page: AppPage) => void
  children: ReactNode
}

function PublicShell({ theme, onNavigate, children }: PublicShellProps) {
  return (
    <main className="public-shell" data-theme={theme}>
      <header className="public-header">
        <button className="public-brand" type="button" onClick={() => onNavigate('Landing')}>
          <span>
            <BarChart3 size={22} />
          </span>
          InEx Ledger
        </button>
        <nav className="public-nav" aria-label="Public navigation">
          <button type="button" onClick={() => onNavigate('Login')}>Sign in</button>
          <button className="primary-button" type="button" onClick={() => onNavigate('Register')}>Start free</button>
        </nav>
      </header>

      {children}

      <footer className="public-footer">
        <div>
          <strong>InEx Ledger</strong>
          <span>Clean books without the accounting headache.</span>
        </div>
        <nav aria-label="Legal links">
          <button type="button" onClick={() => onNavigate('Pricing')}>Pricing</button>
          <button type="button" onClick={() => onNavigate('Legal')}>Legal</button>
          <button type="button" onClick={() => onNavigate('Privacy')}>Privacy</button>
          <button type="button" onClick={() => onNavigate('Terms')}>Terms</button>
          <button type="button" onClick={() => onNavigate('Help')}>Help</button>
        </nav>
      </footer>
    </main>
  )
}

export default PublicShell
