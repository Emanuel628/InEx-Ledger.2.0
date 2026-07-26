import { useState } from 'react'
import { Building2, Check, CreditCard, ExternalLink, Plus, ShieldAlert } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

type SubscriptionBusiness = { name: string; role: string; status: string }

function Subscription(props: PageProps) {
  const [interval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const businesses: SubscriptionBusiness[] = props.authUser?.business?.name
    ? [{ name: props.authUser.business.name, role: 'Workspace owner', status: 'Active' }]
    : []
  const price = interval === 'monthly' ? '$12/mo' : '$122.40/yr'
  const note = interval === 'monthly' ? 'Billed monthly. Cancel or change later in Stripe.' : '$10.20/mo equivalent, billed yearly.'

  return (
    <AppShell {...props} searchPlaceholder="Search plans, businesses, billing">
      <main className="transactions-page subscription-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Subscription</p>
            <h1>Subscription</h1>
            <p>Choose the plan cadence before checkout, review business capacity, and keep destructive actions separate.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Billing')}>Billing history</button>
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to settings</button>
          </div>
        </section>

        <section className="subscription-plan-panel">
          <div className="subscription-plan-copy">
            <span className="status-pill status-draft">Current plan</span>
            <h2>Basic access</h2>
            <p>Start checkout when you are ready to unlock invoices, protected exports, receipt workflows, and mileage tools.</p>
          </div>
          <div className="subscription-renew-card">
            <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
              <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" onClick={() => setBillingInterval('monthly')}>
                Monthly
                <strong>$12</strong>
              </button>
              <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" onClick={() => setBillingInterval('yearly')}>
                Yearly
                <strong>$122.40</strong>
              </button>
            </div>
            <div className="subscription-price-line">
              <strong>{price}</strong>
              <span>{note}</span>
            </div>
            <button className="primary-button" type="button">
              <CreditCard size={18} />
              Continue to secure checkout
            </button>
          </div>
        </section>

        <section className="subscription-detail-grid">
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Building2 size={21} />
            </div>
            <span>Businesses allowed</span>
            <strong>1</strong>
            <p>Upgrade later when multi-business support is needed.</p>
          </article>
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Check size={21} />
            </div>
            <span>Status</span>
            <strong>Free tier</strong>
            <p>No paid renewal is currently attached to this workspace.</p>
          </article>
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <ExternalLink size={21} />
            </div>
            <span>Stripe portal</span>
            <strong>Available</strong>
            <p>Cancel, reactivate, or update payment methods in Stripe.</p>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Workspace capacity</h2>
              <p>Businesses attached to this subscription.</p>
            </div>
            <button className="secondary-button" type="button">
              <Plus size={17} />
              Add business
            </button>
          </div>
          <div className="subscription-business-list">
            {businesses.length ? (
              businesses.map((business) => (
                <article className="subscription-business-row" key={business.name}>
                  <div className="merchant-logo merchant-blue">{business.name.charAt(0)}</div>
                  <div>
                    <strong>{business.name}</strong>
                    <p>{business.role}</p>
                  </div>
                  <span className="status-pill status-income">{business.status}</span>
                  <button className="secondary-button compact-button" type="button">Manage</button>
                </article>
              ))
            ) : (
              <div className="empty-table-state">
                <strong>No business attached yet</strong>
                <span>Create a business before starting checkout or adding workspace capacity.</span>
              </div>
            )}
          </div>
        </section>

        <section className="subscription-danger-panel">
          <div className="billing-card-icon danger-icon">
            <ShieldAlert size={20} />
          </div>
          <div>
            <strong>Cancel subscription</strong>
            <p>Cancellation should keep Pro active until the paid period ends, then return the account to Basic.</p>
          </div>
          <button className="secondary-button danger-button" type="button">Cancel</button>
        </section>
      </main>
    </AppShell>
  )
}

export default Subscription
