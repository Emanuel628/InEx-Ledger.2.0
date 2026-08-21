import { useCallback, useEffect, useState } from 'react'
import { loadTaxSetAside } from '../lib/analyticsApi'
import { loadAccountingLock, type AccountingLock } from '../lib/settingsApi'
import {
  loadTransactionPageData,
  loadTransactionUndoStatus,
  type AccountOption,
  type BusinessTaxProfile,
  type CategoryOption,
  type RecurringTemplate,
  type ReviewQueueResponse,
  type Transaction,
} from '../lib/transactionsApi'

const TRANSACTION_PAGE_SIZE_KEY = 'inex-v3-transactions-page-size'

type TransactionSummary = {
  incomeTotal: number
  expenseTotal: number
  transactionCount: number
}

const emptySummary: TransactionSummary = {
  incomeTotal: 0,
  expenseTotal: 0,
  transactionCount: 0,
}

export default function useTransactionsPageData() {
  const [transactionRows, setTransactionRows] = useState<Transaction[]>([])
  const [transactionTotal, setTransactionTotal] = useState(0)
  const [transactionSummary, setTransactionSummary] = useState<TransactionSummary>(emptySummary)
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])
  const [taxProfile, setTaxProfile] = useState<BusinessTaxProfile | null>(null)
  const [taxSetAside, setTaxSetAside] = useState<number | null>(null)
  const [accountingLock, setAccountingLock] = useState<AccountingLock | null>(null)
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueResponse>({ queue: [] })
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTemplate[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [accountFilter, setAccountFilter] = useState('All')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [pageSize, setPageSize] = useState(readSavedPageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [undoCount, setUndoCount] = useState(0)
  const [undoMessage, setUndoMessage] = useState('')

  const refreshPageData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    try {
      const [pageData, lockState, taxSetAsideValue] = await Promise.all([
        loadTransactionPageData({
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
          search: searchTerm,
          categoryId: categoryFilter,
          accountId: accountFilter,
          status: statusFilter,
          startDate: startDateFilter,
          endDate: endDateFilter,
        }),
        loadAccountingLock().catch(() => null),
        loadTaxSetAside().catch(() => null),
      ])
      setTransactionRows(pageData.transactions)
      setTransactionTotal(pageData.total)
      setTransactionSummary(pageData.summary)
      setAccountOptions(pageData.accounts)
      setCategoryOptions(pageData.categories)
      setTaxProfile(pageData.taxProfile)
      setTaxSetAside(taxSetAsideValue)
      setAccountingLock(lockState)
      setReviewQueue(pageData.reviewQueue)
      setRecurringTemplates(pageData.recurringTemplates)
      void loadTransactionUndoStatus().then(setUndoCount).catch(() => setUndoCount(0))
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load transactions.')
      setTransactionRows([])
      setTransactionTotal(0)
      setTransactionSummary(emptySummary)
      setAccountOptions([])
      setCategoryOptions([])
      setReviewQueue({ queue: [] })
      setRecurringTemplates([])
    } finally {
      setLoadingData(false)
    }
  }, [accountFilter, categoryFilter, currentPage, endDateFilter, pageSize, searchTerm, startDateFilter, statusFilter])

  useEffect(() => {
    void refreshPageData()
  }, [refreshPageData])

  function updatePageSize(value: number) {
    const normalized = [10, 20, 50].includes(value) ? value : 20
    setCurrentPage(1)
    setPageSize(normalized)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TRANSACTION_PAGE_SIZE_KEY, String(normalized))
    }
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setCurrentPage(1)
    setter(value)
  }

  return {
    transactionRows,
    setTransactionRows,
    transactionTotal,
    transactionSummary,
    accountOptions,
    categoryOptions,
    taxProfile,
    taxSetAside,
    accountingLock,
    reviewQueue,
    recurringTemplates,
    setRecurringTemplates,
    loadingData,
    dataError,
    setDataError,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    accountFilter,
    setAccountFilter,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    pageSize,
    currentPage,
    setCurrentPage,
    undoCount,
    setUndoCount,
    undoMessage,
    setUndoMessage,
    refreshPageData,
    updatePageSize,
    updateFilter,
  }
}

function readSavedPageSize() {
  if (typeof window === 'undefined') return 20
  const saved = Number(window.localStorage.getItem(TRANSACTION_PAGE_SIZE_KEY))
  return [10, 20, 50].includes(saved) ? saved : 20
}
