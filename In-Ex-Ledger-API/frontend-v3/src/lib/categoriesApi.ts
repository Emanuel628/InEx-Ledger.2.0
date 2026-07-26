import { apiRequest } from './apiClient'

export type CategoryType = 'Income' | 'Expense'
export type CategoryStatus = 'Active' | 'Needs review' | 'Inactive' | 'Archived'

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
  { value: 'gross_receipts_sales', label: 'Gross receipts or sales - Schedule C Line 1' },
  { value: 'returns_allowances', label: 'Returns and allowances - Schedule C Line 2' },
  { value: 'interest_income', label: 'Interest income - Schedule C Line 6' },
  { value: 'other_income', label: 'Other income - Schedule C Line 6' },
  { value: 'nonemployee_compensation', label: 'Nonemployee compensation - 1099-NEC' },
  { value: 'payment_card_income', label: 'Payment card / third-party network income - 1099-K' },
  { value: 'misc_income', label: 'Other miscellaneous income - 1099-MISC' },
  { value: 'cash_unreported_income', label: 'Cash / unreported income - Cash' },
  { value: 'advertising', label: 'Advertising - Schedule C Line 8' },
  { value: 'car_truck', label: 'Car and truck expenses - Schedule C Line 9' },
  { value: 'commissions_fees', label: 'Commissions and fees - Schedule C Line 10' },
  { value: 'contract_labor', label: 'Contract labor - Schedule C Line 11' },
  { value: 'depletion', label: 'Depletion - Schedule C Line 12' },
  { value: 'depreciation_section179', label: 'Depreciation and section 179 - Schedule C Line 13' },
  { value: 'employee_benefit_programs', label: 'Employee benefit programs - Schedule C Line 14' },
  { value: 'insurance_other_than_health', label: 'Insurance (other than health) - Schedule C Line 15' },
  { value: 'interest_mortgage', label: 'Interest: mortgage - Schedule C Line 16a' },
  { value: 'interest_other', label: 'Interest: other - Schedule C Line 16b' },
  { value: 'legal_professional', label: 'Legal and professional services - Schedule C Line 17' },
  { value: 'office_expense', label: 'Office expense - Schedule C Line 18' },
  { value: 'pension_profit_sharing', label: 'Pension and profit-sharing plans - Schedule C Line 19' },
  { value: 'rent_lease_vehicles', label: 'Rent or lease: vehicles, machinery, equipment - Schedule C Line 20a' },
  { value: 'rent_lease_other', label: 'Rent or lease: other business property - Schedule C Line 20b' },
  { value: 'repairs_maintenance', label: 'Repairs and maintenance - Schedule C Line 21' },
  { value: 'supplies', label: 'Supplies - Schedule C Line 22' },
  { value: 'taxes_licenses', label: 'Taxes and licenses - Schedule C Line 23' },
  { value: 'travel', label: 'Travel - Schedule C Line 24a' },
  { value: 'meals', label: 'Meals - Schedule C Line 24b' },
  { value: 'entertainment', label: 'Entertainment - Schedule C Line 24b' },
  { value: 'utilities', label: 'Utilities - Schedule C Line 25' },
  { value: 'wages', label: 'Wages - Schedule C Line 26' },
  { value: 'home_office', label: 'Home office - Form 8829 / Line 30' },
  { value: 'bank_fees', label: 'Bank service charges - Schedule C Line 27a / Part V' },
  { value: 'software_subscriptions', label: 'Software and subscriptions - Schedule C Line 27a / Part V' },
  { value: 'other_expense', label: 'Other business expenses - Schedule C Line 27a / Part V' },
]

const caTaxLineOptions = [
  { value: '', label: 'No tax line yet' },
  { value: 'sales', label: 'Gross sales / professional fees - T2125 Line 8000' },
  { value: 'gst_hst_collected', label: 'GST/HST collected - GST/HST' },
  { value: 'subsidies_grants', label: 'Subsidies, grants and rebates - T2125 Line 8230' },
  { value: 'other_income', label: 'Other income - T2125 Line 8230' },
  { value: 't4a_20', label: 'Self-employment commissions - T4A Box 20' },
  { value: 't4a_28', label: 'Other income - T4A Box 28' },
  { value: 'cash_income', label: 'Cash income - T2125 Line 8000' },
  { value: 'advertising', label: 'Advertising - T2125 Line 8520' },
  { value: 'meals_entertainment', label: 'Meals and entertainment (50%) - T2125 Line 8523' },
  { value: 'delivery_freight', label: 'Delivery, freight and express - T2125 Line 9275' },
  { value: 'insurance', label: 'Insurance - T2125 Line 8690' },
  { value: 'interest_bank_charges', label: 'Interest and bank charges - T2125 Line 8710' },
  { value: 'legal_accounting', label: 'Legal, accounting and professional fees - T2125 Line 8860' },
  { value: 'office_expense', label: 'Office expenses - T2125 Line 8810' },
  { value: 'office_supplies', label: 'Office stationery and supplies - T2125 Line 8811' },
  { value: 'business_tax_fees_licenses_memberships', label: 'Business taxes, licences and memberships - T2125 Line 8760' },
  { value: 'property_taxes', label: 'Property taxes - T2125 Line 9180' },
  { value: 'salaries_wages_benefits', label: 'Salaries, wages and benefits - T2125 Line 9060' },
  { value: 'rent', label: 'Rent - T2125 Line 8910' },
  { value: 'maintenance_repairs', label: 'Repairs and maintenance - T2125 Line 8960' },
  { value: 'utilities', label: 'Telephone and utilities - T2125 Line 9220' },
  { value: 'travel', label: 'Travel expenses - T2125 Line 9200' },
  { value: 'motor_vehicle', label: 'Motor vehicle expenses - T2125 Line 9281' },
  { value: 'home_office', label: 'Business-use-of-home expenses - T2125 Line 9945' },
  { value: 'gst_hst_paid', label: 'GST/HST paid - GST/HST ITC' },
  { value: 't2125_8000', label: 'Gross professional fees - T2125 Line 8000' },
  { value: 't2125_8290', label: 'Other income - T2125 Line 8290' },
  { value: 'ca_8810', label: 'Office expenses - T2125 Line 8810' },
  { value: 'ca_8820', label: 'Meals and entertainment (50%) - T2125 Line 8523' },
  { value: 'ca_8860', label: 'Professional fees - T2125 Line 8860' },
  { value: 'ca_8871', label: 'Management and administration fees - T2125 Line 8871' },
  { value: 'ca_8910', label: 'Rent - T2125 Line 8910' },
  { value: 'ca_8960', label: 'Repairs and maintenance - T2125 Line 8960' },
  { value: 'ca_9060', label: 'Salaries, wages and benefits - T2125 Line 9060' },
  { value: 'ca_9180', label: 'Property taxes - T2125 Line 9180' },
  { value: 'ca_9200', label: 'Travel - T2125 Line 9200' },
  { value: 'ca_9220', label: 'Utilities - T2125 Line 9220' },
  { value: 'ca_9270', label: 'Other expenses - T2125 Line 9270' },
  { value: 'ca_9281', label: 'Motor vehicle expenses - T2125 Line 9281' },
  { value: 'ca_9936', label: 'Capital cost allowance - T2125 Line 9936' },
  { value: 'ca_9943', label: 'Business-use-of-home expenses - T2125 Line 9945' },
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
    body: JSON.stringify({
      is_active: false,
      tax_map_us: null,
      tax_map_ca: null,
    }),
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
    taxLine: isActive ? getTaxLineOptions(businessRegion).find((option) => option.value === taxMap)?.label || taxMap || 'No tax line yet' : 'Disconnected',
    taxMapUs: row.tax_map_us || '',
    taxMapCa: row.tax_map_ca || '',
    businessRegion,
    transactions: Number(row.transaction_count || 0),
    status: isActive ? taxMap ? Number(row.transaction_count || 0) > 0 ? 'Active' : 'Inactive' : 'Needs review' : 'Archived',
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
