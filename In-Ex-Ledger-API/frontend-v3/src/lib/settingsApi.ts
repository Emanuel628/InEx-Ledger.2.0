import { apiBlobRequest, apiRequest } from './apiClient'
import { getCurrentUser } from './authApi'
import { downloadBlob } from './browserDownload'

export type BusinessProfile = {
  id: string
  name: string
  region: 'US' | 'CA'
  language: string
  fiscal_year_start?: string | null
  province?: string | null
  business_type?: string | null
  address?: string | null
  contact_full_name?: string | null
  operating_name?: string | null
  business_activity_code?: string | null
  accounting_method?: string | null
  material_participation?: boolean | null
  gst_hst_registered?: boolean
  gst_hst_method?: string | null
  locked_through_date?: string | null
  locked_period_note?: string | null
}

export type PrivacySettings = {
  dataSharingOptOut: boolean
  consentGiven: boolean
  analyticsOptIn: boolean
  marketingEmailOptIn: boolean
  dataResidency: string
}

export type AccountingLock = {
  isLocked?: boolean
  lockedThroughDate?: string | null
  note?: string | null
}

export type OnboardingDraft = {
  businessName: string
  region: 'US' | 'CA'
  province: string
  language: string
  starterAccountType: string
  starterAccountName: string
  startFocus: string
  businessActivityCode: string
  accountingMethod: string
  materialParticipation: string
}

export async function saveProfile(fullName: string) {
  await apiRequest('/api/me', {
    method: 'PUT',
    body: JSON.stringify({
      full_name: fullName,
      display_name: fullName,
    }),
  })
  return getCurrentUser()
}

export async function refreshCurrentUser() {
  return getCurrentUser()
}

export async function loadBusinessProfile(businessId: string) {
  return apiRequest<BusinessProfile>(`/api/businesses/${businessId}/profile`)
}

export async function saveBusinessProfile(businessId: string, profile: BusinessProfile) {
  const body: Record<string, unknown> = {
    name: profile.name,
    region: profile.region,
    language: profile.language || 'en',
    fiscal_year_start: profile.fiscal_year_start || null,
    province: profile.region === 'CA' ? profile.province || null : null,
    business_type: profile.business_type || null,
    address: profile.address || null,
    contact_full_name: profile.contact_full_name || '',
    operating_name: profile.operating_name || null,
    business_activity_code: profile.business_activity_code || null,
    accounting_method: profile.accounting_method || null,
    gst_hst_registered: profile.region === 'CA' ? Boolean(profile.gst_hst_registered) : false,
    gst_hst_method: profile.gst_hst_method || null,
  }

  if (profile.region === 'US') {
    body.material_participation = Boolean(profile.material_participation)
  }

  return apiRequest<BusinessProfile>(`/api/businesses/${businessId}/profile`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function loadAccountingLock() {
  const response = await apiRequest<{ lock: AccountingLock | null }>('/api/business/accounting-lock')
  return response.lock || null
}

export async function saveAccountingLock(input: { lockedThroughDate: string | null; note: string }) {
  const response = await apiRequest<{ lock: AccountingLock | null }>('/api/business/accounting-lock', {
    method: 'PUT',
    body: JSON.stringify({
      locked_through_date: input.lockedThroughDate,
      note: input.lockedThroughDate ? input.note.trim() : '',
    }),
  })
  return response.lock || null
}

export async function loadPrivacySettings() {
  return apiRequest<PrivacySettings>('/api/privacy/settings')
}

export async function savePrivacySettings(settings: PrivacySettings) {
  await apiRequest('/api/privacy/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function exportAccountData(format: 'json' | 'csv') {
  const blob = await apiBlobRequest(`/api/privacy/export?format=${format}`, { method: 'POST' })
  downloadBlob(blob, `inex-ledger-account-data.${format}`)
}

export async function completeOnboarding(draft: OnboardingDraft) {
  const response = await apiRequest<{ redirect_to?: string }>('/api/me/onboarding', {
    method: 'PUT',
    body: JSON.stringify({
      business_name: draft.businessName,
      region: draft.region,
      province: draft.region === 'CA' ? draft.province : '',
      language: draft.language,
      starter_account_type: draft.starterAccountType,
      starter_account_name: draft.starterAccountName,
      start_focus: draft.startFocus,
      business_activity_code: draft.businessActivityCode,
      accounting_method: draft.accountingMethod,
      material_participation: draft.materialParticipation,
    }),
  })
  const { user } = await getCurrentUser()
  return { user, redirectTo: response.redirect_to || '/transactions' }
}
