import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, CreditCard, Plus, ShieldAlert, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import {
  cancelSubscription,
  formatSubscriptionDate,
  formatSubscriptionMoney,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startAdditionalBusinessCheckout,
  startCheckout,
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
  const renewalLabel = buildRenewalLabel(subscription)
  const isProActive = Boolean(subscription?.effectiveTier === 'v1' && (subscription?.isPaid || subscription?.isTrialing))
  const canResume = Boolean(subscription?.cancelAtPeriodEnd || subscription?.isCanceledWithRemainingAccess || subscription?.isTrialDowngradedToFree)
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

  const activeBillingInterval: BillingInterval =
    subscription?.billingInterval === 'yearly'
      ? 'yearly'
      : interval

  const activePricing =
    pricing?.pricing?.[activeBillingInterval] || null

  const currentAdditionalBusinesses = Math.max(
    Number(subscription?.additionalBusinesses || 0),
    0
  )

  const nextAdditionalBusinesses =
    currentAdditionalBusinesses + 1

  const currentSubscriptionTotal = activePricing
    ? activePricing.base +
      activePricing.addon * currentAdditionalBusinesses
    : null

  const nextSubscriptionTotal = activePricing
    ? activePricing.base +
      activePricing.addon * nextAdditionalBusinesses
    : null

  const additionalBusinessPrice =
    activePricing?.addon ?? null

  const hasAvailableBusinessSlot =
    capacity.active < capacity.max

  const isCancellationPending = Boolean(
    subscription?.cancelAtPeriodEnd ||
      subscription?.isCanceledWithRemainingAccess ||
      subscription?.isTrialDowngradedToFree
  )

  const hasStripeSubscription = Boolean(
    subscription?.stripeSubscriptionId
  )

  const canPurchaseAdditionalBusiness = Boolean(
    isProActive &&
      hasStripeSubscription &&
      !isCancellationPending &&
      !needsBillingPortal
  )

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
              <Check size={21} />
            </div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
            <p>{buildStatusDetail(subscription)}</p>
          </article>
          <article className="subscription-simple-card subscription-renewal-card">
            <div className="billing-card-icon">
              <CalendarClock size={21} />
            </div>
            <span>{renewalLabel.caption}</span>
            <strong>{renewalLabel.value}</strong>
            <p>{planName} plan</p>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Workspace capacity</h2>
              <p>Businesses attached to this subscription.</p>
            </div>
            <button className="secondary-button" type="button" disabled={working || loadingData} onClick={() => setModal('add-business')}>
              <Plus size={17} />Add business</button>
          </div>
          <div className="subscription-capacity-bar" role="img" aria-label={`${capacity.active} of ${capacity.max} business slots used`}>
            <div className="subscription-capacity-bar-track">
              <div
                key={`${capacity.active}-${capacity.max}`}
                className="subscription-capacity-bar-fill"
                style={{ width: `${capacity.max > 0 ? Math.min(100, Math.round((capacity.active / capacity.max) * 100)) : 0}%` }}
              />
            </div>
            <span key={`${capacity.active}-of-${capacity.max}-label`} className="subscription-capacity-bar-label">{capacity.active} of {capacity.max} slots used</span>
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
            {canResume ? (
              <div>
                <strong>Cancellation confirmed</strong>
                <p>{buildStatusDetail(subscription)} Use "Keep Pro active" above to undo.</p>
              </div>
            ) : (
              <>
                <div>
                  <strong>Cancel subscription</strong>
                  <p>Cancellation keeps free-tier access available after paid access ends.</p>
                </div>
                <button className="secondary-button danger-button" type="button" disabled={working} onClick={() => void handleCancel()}>Cancel</button>
              </>
            )}
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
                setActiveBusinessId(
                  response.active_business_id ||
                    response.active_business?.id ||
                    null
                )

                setModal(null)

                await refreshSubscription()
                await refreshUser()
              } catch (error) {
                setDataError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to add business.'
                )

                throw error
              } finally {
                setWorking(false)
              }
            }}
            onStartAdditionalBusinessCheckout={async () => {
              setWorking(true)
              setDataError('')

              try {
                await startAdditionalBusinessCheckout(
                  nextAdditionalBusinesses
                )
              } catch (error) {
                setDataError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to open additional business checkout.'
                )

                throw error
              } finally {
                setWorking(false)
              }
            }}
            onStartProCheckout={async () => {
              await handleCheckout()
            }}
            currentBusinessCount={capacity.active}
            maxBusinessesAllowed={capacity.max}
            hasAvailableBusinessSlot={hasAvailableBusinessSlot}
            isProActive={isProActive}
            hasStripeSubscription={hasStripeSubscription}
            canPurchaseAdditionalBusiness={
              canPurchaseAdditionalBusiness
            }
            isCancellationPending={isCancellationPending}
            billingInterval={activeBillingInterval}
            currency={
              pricing?.currency ||
              subscription?.currency ||
              'usd'
            }
            additionalBusinessPrice={additionalBusinessPrice}
            currentSubscriptionTotal={currentSubscriptionTotal}
            nextSubscriptionTotal={nextSubscriptionTotal}
            nextAdditionalBusinesses={nextAdditionalBusinesses}
            saving={working}
          />
        ) : null}

        {modal === 'manage-business' ? (
          <ManageBusinessModal
            business={selectedBusiness}
            activeBusinessId={activeBusinessId}
            businessCount={businessRows.length || businesses.length}
            saving={working}
            subscription={subscription}
            pricing={pricing}
            interval={interval}
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
  onStartAdditionalBusinessCheckout,
  onStartProCheckout,
  currentBusinessCount,
  maxBusinessesAllowed,
  hasAvailableBusinessSlot,
  isProActive,
  hasStripeSubscription,
  canPurchaseAdditionalBusiness,
  isCancellationPending,
  billingInterval,
  currency,
  additionalBusinessPrice,
  currentSubscriptionTotal,
  nextSubscriptionTotal,
  nextAdditionalBusinesses,
  saving,
}: {
  onClose: () => void
  onSave: (input: {
    name: string
    region: 'US' | 'CA'
    language: string
  }) => Promise<void>
  onStartAdditionalBusinessCheckout: () => Promise<void>
  onStartProCheckout: () => Promise<void>
  currentBusinessCount: number
  maxBusinessesAllowed: number
  hasAvailableBusinessSlot: boolean
  isProActive: boolean
  hasStripeSubscription: boolean
  canPurchaseAdditionalBusiness: boolean
  isCancellationPending: boolean
  billingInterval: BillingInterval
  currency: string
  additionalBusinessPrice: number | null
  currentSubscriptionTotal: number | null
  nextSubscriptionTotal: number | null
  nextAdditionalBusinesses: number
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState<'US' | 'CA'>('US')
  const [error, setError] = useState('')
  const [openingCheckout, setOpeningCheckout] = useState(false)

  const billingSuffix =
    billingInterval === 'monthly' ? '/mo' : '/yr'

  async function submit() {
    if (!name.trim()) {
      setError('Business name is required.')
      return
    }

    if (!hasAvailableBusinessSlot) {
      setError(
        'Purchase another business slot before creating this business.'
      )
      return
    }

    setError('')

    try {
      await onSave({
        name: name.trim(),
        region,
        language: 'en',
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to add business.'
      )
    }
  }

  async function startSlotCheckout() {
    setOpeningCheckout(true)
    setError('')

    try {
      await onStartAdditionalBusinessCheckout()
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Unable to open additional business checkout.'
      )
    } finally {
      setOpeningCheckout(false)
    }
  }

  async function startProCheckout() {
    setOpeningCheckout(true)
    setError('')

    try {
      await onStartProCheckout()
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Unable to open Pro checkout.'
      )
    } finally {
      setOpeningCheckout(false)
    }
  }

  return (
    <div
      className="transaction-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="transaction-detail-modal subscription-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addBusinessTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="addBusinessTitle">Add business</h2>
            <p>
              Create and manage another business under your
              subscription.
            </p>
          </div>

          <button
            className="icon-button"
            type="button"
            aria-label="Close add business"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="transaction-detail-body">
          <div className="subscription-simple-card">
            <span>Business capacity</span>
            <strong>
              {currentBusinessCount} of {maxBusinessesAllowed} used
            </strong>
          </div>

          {!isProActive ? (
            <div className="settings-danger-zone">
              <div>
                <strong>Pro is required</strong>
                <p>
                  Upgrade to Pro before adding another business.
                </p>
              </div>

              <button
                className="primary-button"
                type="button"
                disabled={saving || openingCheckout}
                onClick={() => void startProCheckout()}
              >
                <CreditCard size={18} />
                {openingCheckout
                  ? 'Opening checkout...'
                  : 'Upgrade to Pro'}
              </button>
            </div>
          ) : !hasAvailableBusinessSlot ? (
            <div className="settings-danger-zone">
              <div>
                <strong>Add another business slot</strong>

                {additionalBusinessPrice !== null ? (
                  <p>
                    One additional business costs{' '}
                    {formatSubscriptionMoney(
                      additionalBusinessPrice,
                      currency
                    )}
                    {billingSuffix}.
                  </p>
                ) : (
                  <p>
                    Purchase another slot before creating this
                    business.
                  </p>
                )}

                {currentSubscriptionTotal !== null &&
                nextSubscriptionTotal !== null ? (
                  <div className="subscription-price-summary">
                    <div className="subscription-price-summary-row">
                      <span>Current subscription</span>
                      <strong>{formatSubscriptionMoney(currentSubscriptionTotal, currency)}{billingSuffix}</strong>
                    </div>
                    <div className="subscription-price-summary-row">
                      <span>New subscription</span>
                      <strong>{formatSubscriptionMoney(nextSubscriptionTotal, currency)}{billingSuffix}</strong>
                    </div>
                    <p className="subscription-price-summary-totals">
                      Your subscription will change from{' '}
                      {formatSubscriptionMoney(
                        currentSubscriptionTotal,
                        currency
                      )}
                      {billingSuffix}
                      <span className="subscription-price-arrow"> {'->'} </span>
                      {formatSubscriptionMoney(
                        nextSubscriptionTotal,
                        currency
                      )}
                      {billingSuffix}.
                    </p>
                  </div>
                ) : null}

                <p>
                  Your plan will include{' '}
                  {nextAdditionalBusinesses} additional business{' '}
                  {nextAdditionalBusinesses === 1
                    ? 'slot'
                    : 'slots'}.
                </p>
              </div>

              {isCancellationPending ? (
                <p className="drawer-error" role="note">
                  Your subscription is scheduled to end. Keep Pro
                  active before purchasing another business slot.
                </p>
              ) : !hasStripeSubscription ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || openingCheckout}
                  onClick={() => void startProCheckout()}
                >
                  <CreditCard size={18} />
                  {openingCheckout
                    ? 'Opening checkout...'
                    : 'Start Pro billing'}
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={
                    saving ||
                    openingCheckout ||
                    !canPurchaseAdditionalBusiness
                  }
                  onClick={() => void startSlotCheckout()}
                >
                  <CreditCard size={18} />
                  {openingCheckout
                    ? 'Opening checkout...'
                    : 'Buy another business slot'}
                </button>
              )}
            </div>
          ) : (
            <form
              className="drawer-form"
              onSubmit={(event) => event.preventDefault()}
            >
              <label>
                Business name
                <input
                  value={name}
                  placeholder="Business name"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <label>
                Region
                <select
                  value={region}
                  onChange={(event) =>
                    setRegion(
                      event.target.value === 'CA' ? 'CA' : 'US'
                    )
                  }
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </label>
            </form>
          )}

          {error ? (
            <p className="drawer-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="drawer-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>

          {hasAvailableBusinessSlot && isProActive ? (
            <button
              className="primary-button"
              type="button"
              disabled={saving || openingCheckout}
              onClick={() => void submit()}
            >
              {saving ? 'Saving...' : 'Add business'}
            </button>
          ) : null}
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
  subscription,
  pricing,
  interval,
  onClose,
  onActivate,
  onDelete,
}: {
  business: BusinessRecord | null
  activeBusinessId: string | null
  businessCount: number
  saving: boolean
  subscription?: BillingSubscription | null
  pricing?: BillingPricing | null
  interval: BillingInterval
  onClose: () => void
  onActivate: (businessId: string) => Promise<void>
  onDelete: (businessId: string, password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const canDelete = businessCount > 1
  const isActive = business?.id === activeBusinessId
  const hasBilling = Boolean(subscription?.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing))
  const nextAdditionalBusinesses = Math.max(businessCount - 2, 0)
  const priceForInterval = pricing?.pricing?.[interval]
  const newTotal = priceForInterval
    ? priceForInterval.base + priceForInterval.addon * nextAdditionalBusinesses
    : null

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
            <div className="settings-danger-zone settings-danger-form">
              <div>
                <strong>Delete business</strong>
                <p>{canDelete ? 'This deletes this business and its records. Enter your password to continue.' : 'You cannot delete your only business. Delete the account from Settings instead.'}</p>
                {canDelete && hasBilling && newTotal !== null ? (
                  <p>
                    After deleting, your plan will bill {formatSubscriptionMoney(newTotal, pricing?.currency)}/{interval === 'monthly' ? 'mo' : 'yr'} going forward.
                  </p>
                ) : null}
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

function formatIntervalPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

function getSubscriptionStatus(subscription?: BillingSubscription | null) {
  const status = subscription?.effectiveStatus || subscription?.status || 'free'
  if (subscription?.cancelAtPeriodEnd || subscription?.isTrialDowngradedToFree) return 'Canceling'
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
  if (subscription.isTrialDowngradedToFree) {
    return `Canceling confirmed. Pro access stays active until ${formatSubscriptionDate(subscription.trialEndsAt) || 'the trial ends'}, then the account moves to Basic.`
  }
  if (subscription.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing)) {
    return 'Pro workflows are active for this workspace.'
  }
  return 'Free tier stays available. Start checkout when you are ready to unlock Pro workflows.'
}

function buildRenewalLabel(subscription?: BillingSubscription | null) {
  if (!subscription) return { caption: 'Next renewal', value: 'Not started' }
  if (subscription.cancelAtPeriodEnd) {
    return { caption: 'Access ends', value: formatSubscriptionDate(subscription.currentPeriodEnd) || 'Unknown' }
  }
  if (subscription.isTrialDowngradedToFree || subscription.isTrialing) {
    return { caption: 'Trial ends', value: formatSubscriptionDate(subscription.trialEndsAt) || 'Unknown' }
  }
  if (subscription.isPaid) {
    return { caption: 'Renews', value: formatSubscriptionDate(subscription.currentPeriodEnd) || 'Unknown' }
  }
  return { caption: 'Next renewal', value: 'Not started' }
}

function buildStatusDetail(subscription?: BillingSubscription | null) {
  if (!subscription) return 'No subscription details loaded yet.'
  if (subscription.cancelAtPeriodEnd) {
    return `Paid access ends ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'at period end'}, then the account returns to Basic.`
  }
  if (subscription.isTrialDowngradedToFree) {
    return `Canceling confirmed. Access ends ${formatSubscriptionDate(subscription.trialEndsAt) || 'at the trial end date'}, then the account returns to Basic.`
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
