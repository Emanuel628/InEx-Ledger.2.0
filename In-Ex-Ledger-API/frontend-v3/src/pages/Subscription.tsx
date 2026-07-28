import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Check, CreditCard, Plus, ShieldAlert, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { ApiRequestError } from '../lib/apiClient'
import {
  cancelSubscription,
  formatSubscriptionDate,
  formatSubscriptionMoney,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
  updateAdditionalBusinesses,
  type BillingInterval,
  type BillingOverview,
  type BillingPricing,
  type BillingSubscription,
} from '../lib/billingApi'
import {
  activateBusiness,
  createBusiness,
  deleteBusiness,
  loadBusinesses,
  type BusinessRecord,
} from '../lib/businessesApi'
import { refreshCurrentUser } from '../lib/settingsApi'

type SubscriptionBusiness = { name: string; role: string; status: string }
type SubscriptionModal = 'add-business' | 'manage-business' | null

function Subscription(props: PageProps) {
  const [interval, setBillingInterval] = useState<BillingInterval>(readPreferredBillingInterval)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)
  const [businessRows, setBusinessRows] = useState<BusinessRecord[]>([])
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(props.authUser?.currentBusinessId || null)
  const [modal, setModal] = useState<SubscriptionModal>(null)
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRecord | null>(null)
  const [additionalBusinessDraft, setAdditionalBusinessDraft] = useState('0')

  const businesses: SubscriptionBusiness[] = businessRows.length
    ? businessRows.map((business) => ({
      name: business.name,
      role: business.id === activeBusinessId ? 'Active workspace' : 'Workspace',
      status: business.id === activeBusinessId ? 'Active' : 'Available',
    }))
    : props.authUser?.business?.name
      ? [{ name: props.authUser.business.name, role: 'Active workspace', status: 'Active' }]
      : []

  async function refreshSubscription() {
    setLoadingData(true)
    setDataError('')
    try {
      const [nextOverview, nextPricing] = await Promise.all([
        loadBillingOverview(),
        loadBillingPricing(),
      ])
      setOverview(nextOverview)
      setPricing(nextPricing)
      setAdditionalBusinessDraft(String(Number(nextOverview.subscription?.additionalBusinesses || 0)))
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load subscription.')
      setOverview(null)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshSubscription()
    void refreshBusinesses()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', Boolean(modal))

    return () => document.body.classList.remove('modal-is-open')
  }, [modal])

  async function refreshBusinesses() {
    try {
      const response = await loadBusinesses()
      setBusinessRows(response.businesses || [])
      setActiveBusinessId(response.active_business_id || response.active_business?.id || props.authUser?.currentBusinessId || null)
    } catch {
      setBusinessRows([])
      setActiveBusinessId(props.authUser?.currentBusinessId || null)
    }
  }

  async function refreshUser() {
    try {
      props.onAuthChange((await refreshCurrentUser()).user)
    } catch {
      // Subscription actions can still update the local page even if /api/me refresh fails.
    }
  }

  const subscription = overview?.subscription
  const planName = subscription?.effectiveTierName || 'Basic'
  const statusLabel = getSubscriptionStatus(subscription)
  const isProActive = subscription?.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing)
  const canResume = Boolean(subscription?.cancelAtPeriodEnd || subscription?.isCanceledWithRemainingAccess)
  // Only route to "Open Stripe billing" when a real Stripe subscription (paid,
  // or already checked out and still within its Stripe trial window) exists.
  // A trialing user with no Stripe subscription yet counts as Pro-tier access
  // (isProActive) but has no Stripe customer, so routing them here too made
  // the primary CTA an always-disabled portal button (portalAvailable
  // requires a Stripe customer) instead of Checkout -- meaning every new
  // trial user could never actually start Stripe checkout.
  const shouldManageExistingSubscription = Boolean((subscription?.isPaid || subscription?.stripeSubscriptionId) && !canResume)
  const needsBillingPortal = ['past_due', 'unpaid'].includes(String(subscription?.effectiveStatus || subscription?.status || '').toLowerCase())

  const capacity = useMemo(() => {
    const max = Number(subscription?.maxBusinessesAllowed || 1)
    const active = Number(subscription?.activeBusinessCount || businesses.length || 0)
    const additional = Number(subscription?.additionalBusinesses || 0)
    return { max, active, additional }
  }, [businesses.length, subscription])

  async function handleCheckout() {
    setWorking(true)
    setDataError('')
    try {
      if (canResume) {
        await handleResume()
        return
      }
      if (shouldManageExistingSubscription || needsBillingPortal) {
        await openBillingPortal()
        return
      }
      await startCheckout(interval)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start checkout.'
      if (/existing subscription|already have an active subscription|conflict/i.test(message)) {
        try {
          await openBillingPortal()
          return
        } catch (portalError) {
          setDataError(portalError instanceof Error ? portalError.message : message)
        }
      } else {
        setDataError(message)
      }
      setWorking(false)
    }
  }

  function chooseBillingInterval(nextInterval: BillingInterval) {
    setBillingInterval(nextInterval)
    window.sessionStorage.setItem('inex-preferred-billing-interval', nextInterval)
  }

  async function handleResume() {
    setWorking(true)
    setDataError('')
    try {
      const updated = await resumeSubscription(interval)
      setOverview((current) => current ? { ...current, subscription: updated } : current)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to keep Pro active.')
    } finally {
      setWorking(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this subscription? Pro stays active until the paid period ends when Stripe allows it.')) {
      return
    }
    setWorking(true)
    setDataError('')
    try {
      const updated = await cancelSubscription()
      setOverview((current) => current ? { ...current, subscription: updated } : current)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to cancel subscription.')
    } finally {
      setWorking(false)
    }
  }

  async function handleAdditionalBusinessUpdate() {
    const nextValue = Number(additionalBusinessDraft)
    if (!Number.isInteger(nextValue) || nextValue < 0 || nextValue > 100) {
      setDataError('Additional business slots must be a whole number from 0 to 100.')
      return
    }
    setWorking(true)
    setDataError('')
    try {
      const updated = await updateAdditionalBusinesses(nextValue)
      setOverview((current) => current ? { ...current, subscription: updated } : current)
      setAdditionalBusinessDraft(String(Number(updated.additionalBusinesses || nextValue)))
      await refreshBusinesses()
      await refreshUser()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to update additional business slots.')
    } finally {
      setWorking(false)
    }
  }

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
            <button className="secondary-button" type="button" disabled={working || !overview?.portalAvailable} onClick={() => void openBillingPortal().catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to open Stripe billing.'))}>Open billing</button>
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to settings</button>
          </div>
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Review the current plan state and try again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss subscription warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="subscription-plan-panel">
          <div className="subscription-plan-copy">
            <span className={`status-pill ${isProActive ? 'status-income' : 'status-draft'}`}>Current plan</span>
            <h2>{loadingData ? 'Loading plan' : `${planName} access`}</h2>
            <p>{buildPlanSummary(subscription)}</p>
          </div>
          <div className="subscription-renew-card">
            <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
              <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" data-billing-interval="monthly" onClick={() => chooseBillingInterval('monthly')}>
                Monthly
                <strong>{formatIntervalPrice(pricing, 'monthly')}</strong>
              </button>
              <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" data-billing-interval="yearly" onClick={() => chooseBillingInterval('yearly')}>
                Yearly
                <strong>{formatIntervalPrice(pricing, 'yearly')}</strong>
              </button>
            </div>
            {canResume ? (
              <button className="primary-button" type="button" disabled={working} onClick={() => void handleResume()}>
                <CreditCard size={18} />
                {working ? 'Working' : 'Keep Pro active'}
              </button>
            ) : shouldManageExistingSubscription || needsBillingPortal ? (
              <button className="primary-button" type="button" disabled={working || loadingData || !overview?.portalAvailable} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening billing' : 'Open Stripe billing'}
              </button>
            ) : (
              <button className="primary-button" type="button" disabled={working || loadingData} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening checkout' : 'Continue to secure checkout'}
              </button>
            )}
          </div>
        </section>

        <section className="subscription-detail-grid">
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Building2 size={21} />
            </div>
            <span>Businesses allowed</span>
            <strong>{capacity.max}</strong>
            <p>{capacity.additional ? `${capacity.additional} additional business slot${capacity.additional === 1 ? '' : 's'} attached.` : 'One business is included with the current plan.'}</p>
            <div className="subscription-addon-control">
              <label>
                Extra slots
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={additionalBusinessDraft}
                  onChange={(event) => setAdditionalBusinessDraft(event.target.value)}
                />
              </label>
              <button className="secondary-button compact-button" type="button" disabled={working || loadingData} onClick={() => void handleAdditionalBusinessUpdate()}>
                Save slots
              </button>
            </div>
          </article>
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Check size={21} />
            </div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
            <p>{buildStatusDetail(subscription)}</p>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Workspace capacity</h2>
              <p>Businesses attached to this subscription.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setModal('add-business')}>
              <Plus size={17} />
              Add business
            </button>
          </div>
          <div className="subscription-business-list">
            {businesses.length ? (
              businesses.map((business, index) => (
                <article className="subscription-business-row" key={business.name}>
                  <div>
                    <strong>{business.name}</strong>
                    <p>{business.role}</p>
                  </div>
                  <span className="status-pill status-income">{business.status}</span>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => {
                      setSelectedBusiness(businessRows[index] || null)
                      setModal('manage-business')
                    }}
                  >
                    Manage
                  </button>
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

        {isProActive ? (
          <section className="subscription-danger-panel">
            <div className="billing-card-icon danger-icon">
              <ShieldAlert size={20} />
            </div>
            <div>
              <strong>Cancel subscription</strong>
              <p>Cancellation keeps free-tier access available after paid access ends.</p>
            </div>
            <button className="secondary-button danger-button" type="button" disabled={working} onClick={() => void handleCancel()}>Cancel</button>
          </section>
        ) : null}

        {modal === 'add-business' ? (
          <AddBusinessModal
            onClose={() => setModal(null)}
            onSave={async (input) => {
              setWorking(true)
              setDataError('')
              try {
                const response = await createBusiness(input)
                setBusinessRows(response.businesses || [])
                setActiveBusinessId(response.active_business_id || response.active_business?.id || null)
                setModal(null)
                await refreshSubscription()
                await refreshUser()
              } catch (error) {
                if (isAdditionalBusinessPaymentRequired(error)) {
                  setDataError('Add at least one extra business slot before creating another business.')
                } else {
                  setDataError(error instanceof Error ? error.message : 'Unable to add business.')
                }
                throw error
              } finally {
                setWorking(false)
              }
            }}
            onBuySlots={async (neededSlots) => {
              const targetAdditionalBusinesses = Math.max(capacity.additional + neededSlots, 1)
              if (canResume) {
                await resumeSubscription(interval)
                setAdditionalBusinessDraft(String(targetAdditionalBusinesses))
                await updateAdditionalBusinesses(targetAdditionalBusinesses)
                await refreshSubscription()
                await refreshBusinesses()
                await refreshUser()
                return
              }
              if (isProActive && !canResume && !needsBillingPortal) {
                setAdditionalBusinessDraft(String(targetAdditionalBusinesses))
                await updateAdditionalBusinesses(targetAdditionalBusinesses)
                await refreshSubscription()
                await refreshBusinesses()
                await refreshUser()
                return
              }
              // Not yet Pro: extra business slots can only be purchased after a
              // plan-only Pro checkout completes, not bundled into it.
              throw new Error('Start a Pro subscription first, then add extra business slots from Subscription.')
            }}
            currentBusinessCount={capacity.active}
            maxBusinessesAllowed={capacity.max}
            saving={working}
          />
        ) : null}

        {modal === 'manage-business' ? (
          <ManageBusinessModal
            business={selectedBusiness}
            activeBusinessId={activeBusinessId}
            businessCount={businessRows.length || businesses.length}
            saving={working}
            onClose={() => {
              setModal(null)
              setSelectedBusiness(null)
            }}
            onActivate={async (businessId) => {
              setWorking(true)
              setDataError('')
              try {
                const response = await activateBusiness(businessId)
                setBusinessRows(response.businesses || [])
                setActiveBusinessId(response.active_business_id || response.active_business?.id || businessId)
                setModal(null)
                await refreshUser()
              } catch (error) {
                setDataError(error instanceof Error ? error.message : 'Unable to switch business.')
                throw error
              } finally {
                setWorking(false)
              }
            }}
            onDelete={async (businessId, password) => {
              setWorking(true)
              setDataError('')
              try {
                const response = await deleteBusiness(businessId, password)
                setBusinessRows(response.businesses || [])
                setActiveBusinessId(response.active_business_id || response.active_business?.id || null)
                setModal(null)
                await refreshSubscription()
                await refreshUser()
              } catch (error) {
                setDataError(error instanceof Error ? error.message : 'Unable to delete business.')
                throw error
              } finally {
                setWorking(false)
              }
            }}
          />
        ) : null}
      </main>
    </AppShell>
  )
}

function AddBusinessModal({
  onClose,
  onSave,
  onBuySlots,
  currentBusinessCount,
  maxBusinessesAllowed,
  saving,
}: {
  onClose: () => void
  onSave: (input: { name: string; region: 'US' | 'CA'; language: string }) => Promise<void>
  onBuySlots: (neededSlots: number) => Promise<void>
  currentBusinessCount: number
  maxBusinessesAllowed: number
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState<'US' | 'CA'>('US')
  const [error, setError] = useState('')
  const [needsSlotPayment, setNeedsSlotPayment] = useState(false)
  const [buyingSlots, setBuyingSlots] = useState(false)
  const neededSlots = Math.max(1, currentBusinessCount + 1 - maxBusinessesAllowed)

  async function submit() {
    if (!name.trim()) {
      setError('Business name is required.')
      return
    }
    setError('')
    setNeedsSlotPayment(false)
    try {
      await onSave({ name, region, language: 'en' })
    } catch (saveError) {
      if (isAdditionalBusinessPaymentRequired(saveError)) {
        setNeedsSlotPayment(true)
        setError(`You need ${neededSlots} extra business slot${neededSlots === 1 ? '' : 's'} before adding this business.`)
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Unable to add business.')
      }
    }
  }

  async function buySlots() {
    setBuyingSlots(true)
    setError('')
    try {
      await onBuySlots(neededSlots)
    } catch (slotError) {
      setError(slotError instanceof Error ? slotError.message : 'Unable to buy business slots.')
    } finally {
      setBuyingSlots(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="transaction-detail-modal subscription-action-modal" role="dialog" aria-modal="true" aria-labelledby="addBusinessTitle" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 id="addBusinessTitle">Add business</h2>
            <p>Create another business under this subscription. Extra slots are checked before saving.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close add business" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Business name
            <input value={name} placeholder="Business name" onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Region
            <select value={region} onChange={(event) => setRegion(event.target.value === 'CA' ? 'CA' : 'US')}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
          {needsSlotPayment ? (
            <button className="primary-button" type="button" disabled={saving || buyingSlots} onClick={() => void buySlots()}>
              <CreditCard size={18} />
              {buyingSlots ? 'Opening checkout...' : `Buy ${neededSlots} extra slot${neededSlots === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </form>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>{saving ? 'Saving...' : 'Add business'}</button>
        </div>
      </section>
    </div>
  )
}

function ManageBusinessModal({
  business,
  activeBusinessId,
  businessCount,
  saving,
  onClose,
  onActivate,
  onDelete,
}: {
  business: BusinessRecord | null
  activeBusinessId: string | null
  businessCount: number
  saving: boolean
  onClose: () => void
  onActivate: (businessId: string) => Promise<void>
  onDelete: (businessId: string, password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const canDelete = businessCount > 1
  const isActive = business?.id === activeBusinessId

  async function submitDelete() {
    if (!business?.id) return
    if (!canDelete) {
      setError('You cannot delete your only business. Delete the account from Settings instead.')
      return
    }
    if (!password) {
      setError('Enter your password to delete this business.')
      return
    }
    setError('')
    try {
      await onDelete(business.id, password)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete business.')
    }
  }

  async function submitActivate() {
    if (!business?.id) return
    setError('')
    try {
      await onActivate(business.id)
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : 'Unable to switch business.')
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="transaction-detail-modal subscription-action-modal" role="dialog" aria-modal="true" aria-labelledby="manageBusinessTitle" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 id="manageBusinessTitle">Manage business</h2>
            <p>{business?.name || 'Business'}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close manage business" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="transaction-detail-body">
          <button className="secondary-button" type="button" disabled={saving || !business?.id || isActive} onClick={() => void submitActivate()}>
            {isActive ? 'Current business' : 'Switch to this business'}
          </button>
          {!confirmingDelete ? (
            <button className="secondary-button danger-button" type="button" disabled={saving || !business?.id || !canDelete} onClick={() => setConfirmingDelete(true)}>
              Delete business
            </button>
          ) : (
            <div className="settings-danger-zone">
              <div>
                <strong>Delete business</strong>
                <p>{canDelete ? 'This deletes this business and its records. Enter your password to continue.' : 'You cannot delete your only business. Delete the account from Settings instead.'}</p>
              </div>
              <label className="field">
                Password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button className="secondary-button danger-button" type="button" disabled={saving || !canDelete} onClick={() => void submitDelete()}>
                {saving ? 'Deleting...' : 'Confirm delete'}
              </button>
            </div>
          )}
          {!canDelete ? <p className="drawer-error" role="note">Keep at least one business on this account. Delete the account from Settings if you want to remove the last one.</p> : null}
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}

function readPreferredBillingInterval(): BillingInterval {
  if (typeof window === 'undefined') return 'monthly'
  const saved = window.sessionStorage.getItem('inex-preferred-billing-interval')
  return saved === 'yearly' ? 'yearly' : 'monthly'
}

function isAdditionalBusinessPaymentRequired(error: unknown) {
  return error instanceof ApiRequestError && (
    error.status === 402 ||
    error.code === 'additional_business_payment_required'
  )
}

function formatIntervalPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

function getSubscriptionStatus(subscription?: BillingSubscription | null) {
  const status = subscription?.effectiveStatus || subscription?.status || 'free'
  if (subscription?.cancelAtPeriodEnd) return 'Canceling'
  if (subscription?.isTrialing) return 'Trial'
  if (status === 'active') return 'Active'
  if (status === 'free') return 'Free tier'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function buildPlanSummary(subscription?: BillingSubscription | null) {
  if (!subscription) return 'Start checkout when you are ready to unlock Pro workflows.'
  if (subscription.cancelAtPeriodEnd) {
    return `Pro access stays active until ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'the end of the paid period'}.`
  }
  if (subscription.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing)) {
    return 'Pro workflows are active for this workspace.'
  }
  return 'Free tier stays available. Start checkout when you are ready to unlock Pro workflows.'
}

function buildStatusDetail(subscription?: BillingSubscription | null) {
  if (!subscription) return 'No subscription details loaded yet.'
  if (subscription.cancelAtPeriodEnd) {
    return `Paid access ends ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'at period end'}, then the account returns to Basic.`
  }
  if (subscription.isTrialing) {
    return `Trial access ends ${formatSubscriptionDate(subscription.trialEndsAt) || 'at the trial end date'}.`
  }
  if (subscription.isPaid) {
    return `Renews ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'on the next billing date'}.`
  }
  return 'No paid renewal is currently attached to this workspace.'
}

export default Subscription
