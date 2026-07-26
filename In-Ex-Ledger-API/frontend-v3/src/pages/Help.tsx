import { BookOpen, LifeBuoy, Mail, Search } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

const helpItems = [
  { title: 'Getting started', body: 'Set up a business, add accounts, and record the first transaction.', icon: BookOpen },
  { title: 'Billing and subscription', body: 'Review plan status, Stripe portal actions, and renewal options.', icon: LifeBuoy },
  { title: 'Message support', body: 'Send a support request and keep replies attached to the account record.', icon: Mail },
]

function Help(props: PageProps) {
  return (
    <AppShell {...props} searchPlaceholder="Search help, billing, support">
      <main className="transactions-page help-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Support</p>
            <h1>Help</h1>
            <p>Find the next action quickly. Support and knowledge base tools should stay simple.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => props.onNavigate('Messages')}>
            <Mail size={18} />
            Request support
          </button>
        </section>

        <section className="table-toolbar">
          <div className="field">
            <Search size={18} />
            <input type="search" placeholder="Search help topics" />
          </div>
          <div className="filter-actions">
            <button className="secondary-button" type="button">Account</button>
            <button className="secondary-button" type="button">Billing</button>
            <button className="secondary-button" type="button">Exports</button>
          </div>
        </section>

        <section className="billing-action-grid">
          {helpItems.map(({ title, body, icon: Icon }) => (
            <article className="billing-action-card" key={title}>
              <div className="billing-card-icon">
                <Icon size={20} />
              </div>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
              <button className="secondary-button" type="button">Open</button>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  )
}

export default Help
