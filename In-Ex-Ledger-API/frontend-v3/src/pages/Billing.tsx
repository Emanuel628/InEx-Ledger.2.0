import { useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, Download, ExternalLink, FileText, ShieldCheck, X, type LucideIcon } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import {
  formatBillingDateFromUnix,
  formatBillingInvoiceAmount,
  loadBillingOverview,
  openBillingPortal,
  type BillingInvoice,
  type BillingOverview,
} from '../lib/billingApi'

function Billing(props: PageProps) {
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')

  async function refreshBilling() {
    setLoadingData(true)
    setDataError('')
    try {
      setOverview(await loadBillingOverview())
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load billing.')
      setOverview(null)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshBilling()
  }, [])

  async function handleOpenPortal() {
    try {
      await openBillingPortal()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to open Stripe portal.')
    }
  }

  const invoices = overview?.invoices || []
  const paymentMethod = overview?.paymentMethod
  const subscription = overview?.subscription
  const planName = subscription?.effectiveTierName || 'Basic'
  const status = subscription?.effectiveStatus || subscription?.status || 'free'

  return (
    <AppShell {...props}>
      <main className="transactions-page billing-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h1>Billing</h1>
            <p>Payment methods, invoices, and Stripe portal actions stay here. Plan changes live in Subscription.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to settings</button>
            <button className="primary-button" type="button" onClick={() => void handleOpenPortal()}>
              <ExternalLink size={18} />
              Open Stripe
            </button>
          </div>
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Refresh billing or open Subscription to review your plan.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss billing warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="billing-focus-grid">
          <article className="billing-hero-card">
            <div className="billing-card-icon">
              <CreditCard size={22} />
            </div>
            <div>
              <p className="eyebrow">Current billing</p>
              <h2>{loadingData ? 'Loading billing' : `${planName} plan`}</h2>
              <p>{buildBillingSummary(status, subscription?.billingInterval || null, invoices.length)}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Subscription')}>
              Manage plan
            </button>
          </article>

          <article className="billing-side-card">
            <span className={`status-pill ${paymentMethod ? 'status-income' : 'status-draft'}`}>
              {paymentMethod ? 'Connected' : 'Not connected'}
            </span>
            <strong>{formatPaymentMethod(paymentMethod)}</strong>
            <p>{paymentMethod ? 'Default payment method for Stripe subscription billing.' : 'A default payment method will appear here after Stripe checkout.'}</p>
          </article>
        </section>

        <section className="billing-action-grid">
          <BillingAction icon={ExternalLink} title="Stripe portal" description="Update cards, download official invoices, or cancel in Stripe." action="Open portal" onClick={handleOpenPortal} />
          <BillingAction icon={ShieldCheck} title="Billing owner" description="The workspace owner controls Stripe billing for this business." action="Settings" onClick={() => props.onNavigate('Settings')} />
          <BillingAction icon={FileText} title="Tax receipts" description="Keep subscription receipts separate from customer invoices." action="History" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} />
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Invoice history</h2>
              <p>Recent subscription invoices and receipts.</p>
            </div>
            <button className="secondary-button" type="button" disabled={!invoices.length}>
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
                    <BillingInvoiceRow invoice={invoice} method={formatPaymentMethod(paymentMethod)} key={invoice.id} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-table-state">
                        <strong>{loadingData ? 'Loading subscription invoices' : 'No subscription invoices yet'}</strong>
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

function BillingInvoiceRow({ invoice, method }: { invoice: BillingInvoice; method: string }) {
  return (
    <tr>
      <td data-label="Invoice">
        <strong>{invoice.number || invoice.id}</strong>
      </td>
      <td data-label="Date">{formatBillingDateFromUnix(invoice.created)}</td>
      <td data-label="Payment method">{method}</td>
      <td data-label="Status">
        <span className="status-pill status-income">{invoice.status || 'paid'}</span>
      </td>
      <td data-label="Total" className="align-right amount">{formatBillingInvoiceAmount(invoice)}</td>
      <td data-label="Action" className="action-col receipt-actions">
        {invoice.hosted_invoice_url ? <a className="row-action" href={invoice.hosted_invoice_url} rel="noreferrer" target="_blank">View</a> : null}
        {invoice.invoice_pdf ? <a className="row-action" href={invoice.invoice_pdf} rel="noreferrer" target="_blank">PDF</a> : null}
      </td>
    </tr>
  )
}

function BillingAction({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  action: string
  onClick: () => void | Promise<void>
}) {
  return (
    <article className="billing-action-card">
      <div className="billing-card-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => void onClick()}>{action}</button>
    </article>
  )
}

function buildBillingSummary(status: string, interval: string | null, invoiceCount: number) {
  const billingCadence = interval ? `${interval} billing` : 'billing'
  if (invoiceCount) {
    return `Stripe has ${invoiceCount} subscription invoice${invoiceCount === 1 ? '' : 's'} on file for ${billingCadence}.`
  }
  if (status === 'free') {
    return 'No paid subscription is currently attached to this workspace.'
  }
  return `Subscription status is ${status} with ${billingCadence}.`
}

function formatPaymentMethod(method?: { type?: string; brand?: string; bankName?: string; last4?: string; expMonth?: number | null; expYear?: number | null } | null) {
  if (!method) return 'No payment method yet'
  if (method.type === 'card') {
    return `${method.brand || 'Card'} ending ${method.last4 || '----'}`
  }
  if (method.type === 'us_bank_account') {
    return `${method.bankName || 'Bank account'} ending ${method.last4 || '----'}`
  }
  return method.type || 'Payment method'
}

export default Billing
