import { CreditCard, Download, ExternalLink, FileText, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

const invoices: { id: string; date: string; total: string; status: string; method: string }[] = []

function Billing(props: PageProps) {
  return (
    <AppShell {...props} searchPlaceholder="Search billing, invoices, subscription">
      <main className="transactions-page billing-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h1>Billing</h1>
            <p>Payment methods, invoices, and Stripe portal actions stay here. Plan changes live in Subscription.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to settings</button>
            <button className="primary-button" type="button">
              <ExternalLink size={18} />
              Open Stripe
            </button>
          </div>
        </section>

        <section className="billing-focus-grid">
          <article className="billing-hero-card">
            <div className="billing-card-icon">
              <CreditCard size={22} />
            </div>
            <div>
              <p className="eyebrow">Current billing</p>
              <h2>No billing history yet</h2>
              <p>Stripe payment methods, receipts, and invoice history will appear after checkout is completed.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Subscription')}>
              Manage plan
            </button>
          </article>

          <article className="billing-side-card">
            <span className="status-pill status-draft">Not connected</span>
            <strong>No payment method yet</strong>
            <p>A default payment method will appear here after Stripe checkout.</p>
          </article>
        </section>

        <section className="billing-action-grid">
          <BillingAction icon={ExternalLink} title="Stripe portal" description="Update cards, download official invoices, or cancel in Stripe." action="Open portal" />
          <BillingAction icon={ShieldCheck} title="Billing owner" description="The billing owner will be assigned when a business starts checkout." action="Review owner" />
          <BillingAction icon={FileText} title="Tax receipts" description="Keep subscription receipts separate from customer invoices." action="Download" />
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Invoice history</h2>
              <p>Recent subscription invoices and receipts.</p>
            </div>
            <button className="secondary-button" type="button">
              <Download size={17} />
              Export CSV
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Payment method</th>
                  <th>Status</th>
                  <th className="align-right">Total</th>
                  <th className="action-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length ? (
                  invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td data-label="Invoice">
                        <strong>{invoice.id}</strong>
                      </td>
                      <td data-label="Date">{invoice.date}</td>
                      <td data-label="Payment method">{invoice.method}</td>
                      <td data-label="Status">
                        <span className="status-pill status-income">{invoice.status}</span>
                      </td>
                      <td data-label="Total" className="align-right amount">{invoice.total}</td>
                      <td data-label="Action" className="action-col receipt-actions">
                        <button className="row-action" type="button">View</button>
                        <button className="row-action" type="button">PDF</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-table-state">
                        <strong>No subscription invoices yet</strong>
                        <span>Stripe receipts will appear after the first successful checkout.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function BillingAction({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action: string }) {
  return (
    <article className="billing-action-card">
      <div className="billing-card-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button className="secondary-button" type="button">{action}</button>
    </article>
  )
}

export default Billing
