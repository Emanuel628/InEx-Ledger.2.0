import { apiRequest } from './apiClient'

export type CategoryType = 'Income' | 'Expense'
export type CategoryStatus = 'Active' | 'Needs review' | 'Archived'

export type TaxCategory = {
  id: string
  name: string
  type: CategoryType
  taxLine: string
  taxMapUs: string
  taxMapCa: string
  businessRegion: 'US' | 'CA'
  transactions: number
  status: CategoryStatus
  tone: string
}

export type CategoryDraft = {
  name: string
  type: CategoryType | ''
  taxLine: string
}

type LegacyCategory = {
  id: string
  name: string
  kind: 'income' | 'expense'
  color?: string | null
  tax_map_us?: string | null
  tax_map_ca?: string | null
  is_active?: boolean
  transaction_count?: number
  business_region?: string | null
}

const usTaxLineOptions = [
  { value: '', label: 'No tax line yet' },
  { value: 'gross_receipts_sales', label: 'Schedule C - Gross receipts' },
  { value: 'office_expense', label: 'Schedule C - Office expense' },
  { value: 'software_subscriptions', label: 'Schedule C - Software subscriptions' },
  { value: 'meals', label: 'Schedule C - Meals' },
  { value: 'car_truck', label: 'Schedule C - Car and truck' },
  { value: 'supplies', label: 'Schedule C - Supplies' },
  { value: 'other_expense', label: 'Schedule C - Other expense' },
]

const caTaxLineOptions = [
  { value: '', label: 'No tax line yet' },
  { value: 'sales', label: 'T2125 - Sales' },
  { value: 'office_supplies', label: 'T2125 - Office supplies' },
  { value: 'motor_vehicle', label: 'T2125 - Motor vehicle' },
  { value: 'meals_entertainment', label: 'T2125 - Meals and entertainment' },
  { value: 'other_expense', label: 'T2125 - Other expense' },
]

export function getTaxLineOptions(region: string | null | undefined) {
  return normalizeRegion(region) === 'CA' ? caTaxLineOptions : usTaxLineOptions
}

export async function loadCategories() {
  const response = await apiRequest<{ data: LegacyCategory[] }>('/api/categories?limit=500&offset=0&include_inactive=true')
  return response.data.map(mapCategory)
}

export async function saveCategoryDraft(draft: CategoryDraft, category: TaxCategory | null, region: string | null | undefined) {
  if (!draft.name.trim()) {
    throw new Error('Category name is required.')
  }
  if (!draft.type) {
    throw new Error('Choose a category type.')
  }

  const kind = draft.type === 'Income' ? 'income' : 'expense'
  const businessRegion = category?.businessRegion || normalizeRegion(region)
  const body = JSON.stringify({
    name: draft.name.trim(),
    kind,
    color: colorForType(draft.type),
    ...(businessRegion === 'CA'
      ? { tax_map_ca: draft.taxLine || null }
      : { tax_map_us: draft.taxLine || null }),
  })

  const saved = category
    ? await apiRequest<LegacyCategory>(`/api/categories/${category.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyCategory>('/api/categories', { method: 'POST', body })

  return mapCategory(saved)
}

export async function archiveCategory(category: TaxCategory) {
  const saved = await apiRequest<LegacyCategory>(`/api/categories/${category.id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: false }),
  })
  return mapCategory(saved)
}

export async function restoreCategory(category: TaxCategory) {
  const saved = await apiRequest<LegacyCategory>(`/api/categories/${category.id}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: true }),
  })
  return mapCategory(saved)
}

export async function deleteCategory(categoryId: string) {
  await apiRequest(`/api/categories/${categoryId}`, { method: 'DELETE' })
}

function mapCategory(row: LegacyCategory): TaxCategory {
  const type = row.kind === 'income' ? 'Income' : 'Expense'
  const taxMap = row.tax_map_us || row.tax_map_ca || ''
  const isActive = row.is_active !== false
  const businessRegion = normalizeRegion(row.business_region)
  return {
    id: row.id,
    name: row.name,
    type,
    taxLine: getTaxLineOptions(businessRegion).find((option) => option.value === taxMap)?.label || taxMap || 'No tax line yet',
    taxMapUs: row.tax_map_us || '',
    taxMapCa: row.tax_map_ca || '',
    businessRegion,
    transactions: Number(row.transaction_count || 0),
    status: isActive ? taxMap ? 'Active' : 'Needs review' : 'Archived',
    tone: normalizeTone(row.color) || colorForType(type),
  }
}

function normalizeRegion(region: string | null | undefined): 'US' | 'CA' {
  return String(region || '').toUpperCase() === 'CA' ? 'CA' : 'US'
}

function colorForType(type: CategoryType) {
  return type === 'Income' ? 'green' : 'blue'
}

function normalizeTone(color?: string | null) {
  if (color === 'amber') return 'yellow'
  if (color === 'pink') return 'coral'
  if (['blue', 'green', 'red', 'slate'].includes(String(color))) {
    return color || ''
  }
  return ''
}
