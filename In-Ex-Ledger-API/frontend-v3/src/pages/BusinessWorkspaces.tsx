import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CreditCard, Plus, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { usePlan } from '../context/PlanContext'
import {
  formatSubscriptionMoney,
  loadBillingOverview,
  loadBillingPricing,
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

type WorkspaceModal = 'add-business' | 'manage-business' | null
type WorkspaceRow = { name: string; role: string; status: string }

function BusinessWorkspaces(props: PageProps) {
  const { isPro, refreshPlanContext } = usePlan()
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)
  const [businessRows, setBusinessRows] = useState<BusinessRecord[]>([])
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(props.authUser?.currentBusinessId || null)
  const [modal, setModal] = useState<WorkspaceModal>(null)
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRecord | null>(null)
  const interval: BillingInterval = readPreferredBillingInterval()

  const businesses: WorkspaceRow[] = businessRows.length
    ? businessRows.map((business) => ({
      name: business.name,
      role: business.id === activeBusinessId ? 'Active workspace' : 'Workspace',
      status: business.id === activeBusinessId ? 'Active' : 'Available',
    }))
    : props.authUser?.business?.name
      ? [{ name: props.authUser.business.name, role: 'Active workspace', status: 'Active' }]
      : []

  async function refreshOverview() {
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
      setDataError(error instanceof Error ? error.message : 'Unable to load workspace data.')
      setOverview(null)
    } finally {
      setLoadingData(false)
    }
  }

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
      // Workspace actions can still update the local page even if /api/me refresh fails.
    }
  }

  useEffect(() => {
    void refreshOverview()
    void refreshBusinesses()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', Boolean(modal))
    return () => document.body.classList.remove('modal-is-open')
  }, [modal])

  const subscription = overview?.subscription
  const isProActive = Boolean(isPro && (subscription?.isPaid || subscription?.isTrialing))
  const isCancellationPending = Boolean(
    subscription?.cancelAtPeriodEnd ||
      subscription?.isCanceledWithRemainingAccess ||
      subscription?.isTrialDowngradedToFree
  )
  const hasStripeSubscription = Boolean(subscription?.stripeSubscriptionId)
  const needsBillingPortal = ['past_due', 'unpaid'].includes(String(subscription?.effectiveStatus || subscription?.status || '').toLowerCase())

  const capacity = useMemo(() => {
    const max = Number(subscription?.maxBusinessesAllowed || 1)
    const active = Number(subscription?.activeBusinessCount || businesses.length || 0)
    const additional = Number(subscription?.additionalBusinesses || 0)
    return { max, active, additional }
  }, [businesses.length, subscription])

  const activeBillingInterval: BillingInterval = subscription?.billingInterval === 'yearly' ? 'yearly' : interval
  const activePricing = pricing?.pricing?.[activeBillingInterval] || null
  const currentAdditionalBusinesses = Math.max(Number(subscription?.additionalBusinesses || 0), 0)
  const nextAdditionalBusinesses = currentAdditionalBusinesses + 1
  const nextSubscriptionTotal = activePricing ? activePricing.base + activePricing.addon * nextAdditionalBusinesses : null
  const additionalBusinessPrice = activePricing?.addon ?? null
  const hasAvailableBusinessSlot = capacity.active < capacity.max
  const canPurchaseAdditionalBusiness = Boolean(isProActive && hasStripeSubscription && !isCancellationPending && !needsBillingPortal)

  async function startProCheckout() {
    setWorking(true)
    setDataError('')
    try {
      await startCheckout(interval)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to start checkout.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <AppShell {...props}>
      <main className="transactions-page subscription-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Business workspaces</p>
            <h1>Business workspaces</h1>
            <p>Switch between businesses, add another workspace, or remove one you no longer need.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Subscription')}>Back to plan</button>
          </div>
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Review the current plan state and try again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Workspace capacity</h2>
              <p>Businesses attached to this subscription.</p>
            </div>
            <button className="secondary-button" type="button" disabled={working || loadingData} onClick={() => setModal('add-business')}>
              <Plus size={17} />Add business
            </button>
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
                <span>Create a business before adding workspace capacity.</span>
              </div>
            )}
          </div>
        </section>

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
                await refreshOverview()
                await refreshUser()
                await refreshPlanContext()
              } catch (error) {
                setDataError(error instanceof Error ? error.message : 'Unable to add business.')
                throw error
              } finally {
                setWorking(false)
              }
            }}
            onStartAdditionalBusinessCheckout={async () => {
              setWorking(true)
              setDataError('')
              try {
                await startAdditionalBusinessCheckout(nextAdditionalBusinesses)
              } catch (error) {
                setDataError(error instanceof Error ? error.message : 'Unable to open additional business checkout.')
                throw error
              } finally {
                setWorking(false)
              }
            }}
            onStartProCheckout={startProCheckout}
            currentBusinessCount={capacity.active}
            maxBusinessesAllowed={capacity.max}
            hasAvailableBusinessSlot={hasAvailableBusinessSlot}
            isProActive={isProActive}
            hasStripeSubscription={hasStripeSubscription}
            canPurchaseAdditionalBusiness={canPurchaseAdditionalBusiness}
            isCancellationPending={isCancellationPending}
            billingInterval={activeBillingInterval}
            currency={pricing?.currency || subscription?.currency || 'usd'}
            additionalBusinessPrice={additionalBusinessPrice}
            nextSubscriptionTotal={nextSubscriptionTotal}
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
                await refreshOverview()
                await refreshUser()
                await refreshPlanContext()
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
  nextSubscriptionTotal,
  saving,
}: {
  onClose: () => void
  onSave: (input: { name: string; region: 'US' | 'CA'; language: string }) => Promise<void>
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
  nextSubscriptionTotal: number | null
  saving: boolean
}) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState<'US' | 'CA'>('US')
  const [error, setError] = useState('')
  const [openingCheckout, setOpeningCheckout] = useState(false)

  const billingSuffix = billingInterval === 'monthly' ? '/mo' : '/yr'

  async function submit() {
    if (!name.trim()) {
      setError('Business name is required.')
      return
    }
    if (!hasAvailableBusinessSlot) {
      setError('Purchase another business slot before creating this business.')
      return
    }
    setError('')
    try {
      await onSave({ name: name.trim(), region, language: 'en' })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add business.')
    }
  }

  async function startSlotCheckout() {
    setOpeningCheckout(true)
    setError('')
    try {
      await onStartAdditionalBusinessCheckout()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open additional business checkout.')
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
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open Pro checkout.')
    } finally {
      setOpeningCheckout(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
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
            <p>Create and manage another business under your subscription.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close add business" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="transaction-detail-body">
          <div className="subscription-simple-card">
            <span>Business capacity</span>
            <strong>{currentBusinessCount} of {maxBusinessesAllowed} used</strong>
          </div>

          {!isProActive ? (
            <div className="workspace-upsell-card">
              <div>
                <strong>Pro is required</strong>
                <p>Upgrade to Pro before adding another business.</p>
              </div>
              <button className="primary-button" type="button" disabled={saving || openingCheckout} onClick={() => void startProCheckout()}>
                <CreditCard size={18} />
                {openingCheckout ? 'Opening checkout...' : 'Upgrade to Pro'}
              </button>
            </div>
          ) : !hasAvailableBusinessSlot ? (
            <div className="workspace-upsell-card">
              <div>
                <strong>Add another business slot</strong>
                {additionalBusinessPrice !== null ? (
                  <p>
                    Adds 1 slot for {formatSubscriptionMoney(additionalBusinessPrice, currency)}{billingSuffix}
                    {nextSubscriptionTotal !== null ? <> — new total {formatSubscriptionMoney(nextSubscriptionTotal, currency)}{billingSuffix}</> : null}.
                  </p>
                ) : (
                  <p>Purchase another slot before creating this business.</p>
                )}
              </div>

              {isCancellationPending ? (
                <p className="drawer-error" role="note">
                  Your subscription is scheduled to end. Keep Pro active before purchasing another business slot.
                </p>
              ) : !hasStripeSubscription ? (
                <button className="primary-button" type="button" disabled={saving || openingCheckout} onClick={() => void startProCheckout()}>
                  <CreditCard size={18} />
                  {openingCheckout ? 'Opening checkout...' : 'Upgrade to Pro'}
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || openingCheckout || !canPurchaseAdditionalBusiness}
                  onClick={() => void startSlotCheckout()}
                >
                  <CreditCard size={18} />
                  {openingCheckout ? 'Opening checkout...' : 'Buy another business slot'}
                </button>
              )}
            </div>
          ) : (
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
            </form>
          )}

          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </div>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          {hasAvailableBusinessSlot && isProActive ? (
            <button className="primary-button" type="button" disabled={saving || openingCheckout} onClick={() => void submit()}>
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
  const { isPro } = usePlan()
  const [password, setPassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const canDelete = businessCount > 1
  const isActive = business?.id === activeBusinessId
  const hasBilling = Boolean(isPro && (subscription?.isPaid || subscription?.isTrialing))
  const nextAdditionalBusinesses = Math.max(businessCount - 2, 0)
  const priceForInterval = pricing?.pricing?.[interval]
  const newTotal = priceForInterval ? priceForInterval.base + priceForInterval.addon * nextAdditionalBusinesses : null

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
                  <p>After deleting, your plan will bill {formatSubscriptionMoney(newTotal, pricing?.currency)}/{interval === 'monthly' ? 'mo' : 'yr'} going forward.</p>
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

export default BusinessWorkspaces
