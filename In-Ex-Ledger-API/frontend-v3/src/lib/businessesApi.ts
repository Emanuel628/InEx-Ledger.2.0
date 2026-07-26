import { apiRequest } from './apiClient'

export type BusinessRecord = {
  id: string
  name: string
  region?: 'US' | 'CA' | string | null
  language?: string | null
}

export type BusinessListResponse = {
  active_business_id?: string | null
  active_business?: BusinessRecord | null
  businesses: BusinessRecord[]
}

export async function loadBusinesses() {
  return apiRequest<BusinessListResponse>('/api/businesses')
}

export async function createBusiness(input: { name: string; region: 'US' | 'CA'; language?: string }) {
  return apiRequest<BusinessListResponse>('/api/businesses', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      region: input.region,
      language: input.language || 'en',
    }),
  })
}

export async function activateBusiness(businessId: string) {
  return apiRequest<BusinessListResponse>(`/api/businesses/${businessId}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function deleteBusiness(businessId: string, password: string) {
  return apiRequest<BusinessListResponse>(`/api/businesses/${businessId}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}
