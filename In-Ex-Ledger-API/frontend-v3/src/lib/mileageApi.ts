import { apiRequest } from './apiClient'

export type MileageKind = 'Trip' | 'Expense' | 'Maintenance'

export type MileageEntry = {
  id: string
  kind: MileageKind
  dateIso: string
  date: string
  title: string
  subtitle: string
  distance?: number
  amount?: number
  notes?: string
  tone: string
}

export type MileageDraft = {
  kind: MileageKind
  date: string
  title: string
  destination: string
  vendor: string
  distance: string
  amount: string
  notes: string
}

export type MileageSummary = {
  tripCount: number
  totalMiles: number
  vehicleExpenseTotal: number
  maintenanceTotal: number
}

type LegacyTrip = {
  id: string
  trip_date?: string | null
  date?: string | null
  purpose?: string | null
  destination?: string | null
  miles?: number | string | null
  km?: number | string | null
}

type LegacyCost = {
  id: string
  entry_type: 'expense' | 'maintenance'
  entry_date?: string | null
  title?: string | null
  vendor?: string | null
  amount?: number | string | null
  notes?: string | null
}

type LegacySummary = {
  trip_count?: number | string
  total_miles?: number | string
  vehicle_expense_total?: number | string
  maintenance_total?: number | string
}

export async function loadMileagePageData() {
  const [trips, costs, summary] = await Promise.all([
    apiRequest<{ data: LegacyTrip[] }>('/api/mileage?limit=500&offset=0'),
    apiRequest<{ data: LegacyCost[] }>('/api/mileage/costs?limit=500&offset=0'),
    apiRequest<LegacySummary>('/api/mileage/summary'),
  ])

  const entries = [
    ...trips.data.map(mapTrip),
    ...costs.data.map(mapCost),
  ].sort((first, second) => second.dateIso.localeCompare(first.dateIso))

  return {
    entries,
    summary: {
      tripCount: Number(summary.trip_count || 0),
      totalMiles: Number(summary.total_miles || 0),
      vehicleExpenseTotal: Number(summary.vehicle_expense_total || 0),
      maintenanceTotal: Number(summary.maintenance_total || 0),
    },
  }
}

export async function saveMileageDraft(draft: MileageDraft, entry: MileageEntry | null) {
  if (!draft.date) {
    throw new Error('Date is required.')
  }
  if (!draft.title.trim()) {
    throw new Error(draft.kind === 'Trip' ? 'Purpose is required.' : 'Title is required.')
  }

  if (draft.kind === 'Trip') {
    const distance = Number(draft.distance)
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new Error('Miles must be greater than 0.')
    }
    const body = JSON.stringify({
      trip_date: draft.date,
      purpose: draft.title.trim(),
      destination: draft.destination.trim(),
      miles: distance,
    })
    const saved = entry
      ? await apiRequest<LegacyTrip>(`/api/mileage/${entry.id}`, { method: 'PUT', body })
      : await apiRequest<LegacyTrip>('/api/mileage', { method: 'POST', body })
    return mapTrip(saved)
  }

  const amount = Number(draft.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0.')
  }

  const body = JSON.stringify({
    entry_type: draft.kind.toLowerCase(),
    entry_date: draft.date,
    title: draft.title.trim(),
    vendor: draft.vendor.trim(),
    amount,
    notes: draft.notes.trim(),
  })
  const saved = entry
    ? await apiRequest<LegacyCost>(`/api/mileage/costs/${entry.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyCost>('/api/mileage/costs', { method: 'POST', body })
  return mapCost(saved)
}

export async function deleteMileageEntry(entry: MileageEntry) {
  const url = entry.kind === 'Trip' ? `/api/mileage/${entry.id}` : `/api/mileage/costs/${entry.id}`
  await apiRequest(url, { method: 'DELETE' })
}

export function draftFromEntry(entry: MileageEntry): MileageDraft {
  return {
    kind: entry.kind,
    date: entry.dateIso,
    title: entry.title,
    destination: entry.kind === 'Trip' ? entry.subtitle : '',
    vendor: entry.kind === 'Trip' ? '' : entry.subtitle,
    distance: entry.distance ? String(entry.distance) : '',
    amount: entry.amount ? String(entry.amount) : '',
    notes: entry.notes || '',
  }
}

export function blankMileageDraft(kind: MileageKind): MileageDraft {
  return {
    kind,
    date: new Date().toISOString().slice(0, 10),
    title: '',
    destination: '',
    vendor: '',
    distance: '',
    amount: '',
    notes: '',
  }
}

function mapTrip(row: LegacyTrip): MileageEntry {
  const dateIso = normalizeDate(row.trip_date || row.date)
  return {
    id: row.id,
    kind: 'Trip',
    dateIso,
    date: formatShortDate(dateIso),
    title: row.purpose || 'Business trip',
    subtitle: row.destination || 'No destination',
    distance: Number(row.miles || 0),
    tone: 'blue',
  }
}

function mapCost(row: LegacyCost): MileageEntry {
  const dateIso = normalizeDate(row.entry_date)
  const kind = row.entry_type === 'maintenance' ? 'Maintenance' : 'Expense'
  return {
    id: row.id,
    kind,
    dateIso,
    date: formatShortDate(dateIso),
    title: row.title || (kind === 'Maintenance' ? 'Maintenance' : 'Vehicle expense'),
    subtitle: row.vendor || 'No vendor',
    amount: Number(row.amount || 0),
    notes: row.notes || '',
    tone: kind === 'Maintenance' ? 'green' : 'yellow',
  }
}

function normalizeDate(value?: string | null) {
  if (!value) {
    return ''
  }
  return String(value).slice(0, 10)
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
