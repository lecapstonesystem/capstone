import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { errorMessage } from '../utils/errorText'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useAuditStore } from './audit'

/**
 * Ledger store — immutable financial entries in live Supabase data.
 *
 * How the store maps to public.ledger (14_add_ledger_category.sql):
 *   - refNo has no column: derived from ledger_id (LDG-0001 style,
 *     the same convention as LOAN-0001 / KHS-0001).
 *   - type holds the Income/Expense flag; category (14's column)
 *     holds the coop's breakdown (Canteen Sales, Utilities, ...).
 *   - admin_id records the logged-in admin for every entry.
 *   - Corrections append one opposite-type reversal linked to the
 *     original; portal users cannot edit or delete ledger entries.
 *   - amount arrives numeric, dates as 'YYYY-MM-DD' strings — the
 *     exact shapes the form and Intl.NumberFormat expect.
 *
 * Starts EMPTY by decision (Oct 16): no seed — the table begins with
 * the first entry the admin records. Dashboards/reports read this
 * store too, so their cash-flow numbers are zero until then.
 *
 * Actions return { ok, message? } and LedgerView awaits them; the
 * dialogs keep themselves open and show message on failure.
 */

function refNoOf(ledgerId) {
  return `LDG-${String(ledgerId).padStart(4, '0')}`
}

function rowToTransaction(row, reversedBy = null) {
  return {
    id: row.ledger_id,
    refNo: refNoOf(row.ledger_id),
    date: row.date,
    type: row.type,
    category: row.category || '',
    description: row.description || '',
    amount: Number(row.amount || 0),
    adminId: row.admin_id,
    reversalOf: row.reversal_of || null,
    correctionReason: row.correction_reason || '',
    recordedAt: row.recorded_at || '',
    reversedBy: reversedBy
      ? {
          refNo: refNoOf(reversedBy.ledger_id),
          adminId: reversedBy.admin_id,
          recordedAt: reversedBy.recorded_at || '',
          correctionReason: reversedBy.correction_reason || '',
        }
      : null,
  }
}

export const useLedgerStore = defineStore('ledger', () => {
  const transactions = ref([])
  const search = ref('')
  const typeFilter = ref('All')
  const loading = ref(false)
  const lastError = ref('')

  // Column sorting — header click toggles ascending/descending (SortableTh).
  // Default keeps the old order: newest date first.
  const sortKey = ref('date')
  const sortDir = ref('desc')
  const accessors = {
    refNo: (txn) => txn.refNo,
    date: (txn) => txn.date,
    type: (txn) => txn.type,
    category: (txn) => txn.category,
    description: (txn) => txn.description,
    amount: (txn) => txn.amount,
  }

  // Search matches ref no., description, or category; type filter applies on top
  const filteredTransactions = computed(() => {
    const query = search.value.trim().toLowerCase()
    const filtered = transactions.value.filter((txn) => {
      const matchesType = typeFilter.value === 'All' || txn.type === typeFilter.value
      const matchesSearch =
        !query ||
        txn.refNo.toLowerCase().includes(query) ||
        txn.description.toLowerCase().includes(query) ||
            txn.category.toLowerCase().includes(query) ||
            txn.correctionReason.toLowerCase().includes(query) ||
            (txn.reversedBy?.correctionReason || '').toLowerCase().includes(query)
      return matchesType && matchesSearch
    })
    return sortRows(filtered, sortKey.value, sortDir.value, accessors)
  })

  // Pagination
  const page = ref(1)
  const pageSize = ref(10)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(filteredTransactions.value.length / pageSize.value)),
  )

  const paginatedTransactions = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return filteredTransactions.value.slice(start, start + pageSize.value)
  })

  function setPage(newPage) {
    page.value = Math.min(Math.max(1, newPage), totalPages.value)
  }

  function setPageSize(size) {
    pageSize.value = size
    page.value = 1
  }

  // New search/filter results always start from page 1
  watch(search, () => {
    page.value = 1
  })

  // If the current page no longer exists, step back
  watch(totalPages, (count) => {
    if (page.value > count) page.value = count
  })

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
    page.value = 1 // sorting restarts from the first page
  }

  function sortState(key) {
    return sortKey.value === key ? sortDir.value : null
  }

  const totalIncome = computed(() =>
    transactions.value
      .filter((txn) => txn.type === 'Income')
      .reduce((sum, txn) => sum + txn.amount, 0),
  )

  const totalExpense = computed(() =>
    transactions.value
      .filter((txn) => txn.type === 'Expense')
      .reduce((sum, txn) => sum + txn.amount, 0),
  )

  const netBalance = computed(() => totalIncome.value - totalExpense.value)

  const totalCount = computed(() => transactions.value.length)

  // ---------- loading ----------
  async function fetchLedger() {
    loading.value = true
    lastError.value = ''
    try {
      const { data, error } = await supabase
        .from('ledger')
        .select('*')
        .order('date', { ascending: false })
        .order('ledger_id', { ascending: false })
      if (error) throw error
      const reversals = new Map(
        (data || [])
          .filter((row) => row.reversal_of !== null)
          .map((row) => [row.reversal_of, row]),
      )
      transactions.value = (data || []).map((row) =>
        rowToTransaction(row, reversals.get(row.ledger_id)),
      )
    } catch (error) {
      lastError.value = errorMessage(error)
      transactions.value = []
    } finally {
      loading.value = false
    }
  }

  // ---------- actions ----------
  // Validation failures and database errors come back as
  // { ok: false, message } so the dialogs can show them.
  async function addTransaction(data) {
    const auth = useAuthStore()
    const adminId = auth.profile?.admin_id ?? null
    if (!adminId) {
      return {
        ok: false,
        message: 'This session is not linked to an admin record — sign out and back in.',
      }
    }
    const { data: row, error } = await supabase
      .from('ledger')
      .insert({
        date: data.date,
        type: data.type,
        category: data.category,
        description: data.description,
        amount: data.amount,
        admin_id: adminId,
      })
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }
    const txn = rowToTransaction(row)
    transactions.value.push(txn)
    useAuditStore().record(
      'ledger',
      txn.id,
      `Recorded ${txn.type} — ₱${txn.amount.toLocaleString('en-PH')} (${txn.category})`,
    )
    return { ok: true }
  }

  async function reverseTransaction(id, { date, reason }) {
    const original = transactions.value.find((txn) => txn.id === id)
    if (!original) return { ok: false, message: 'Transaction not found.' }
    if (original.reversalOf || original.reversedBy) {
      return { ok: false, message: 'This transaction has already been corrected.' }
    }

    const auth = useAuthStore()
    const adminId = auth.profile?.admin_id ?? null
    if (!adminId) {
      return {
        ok: false,
        message: 'This session is not linked to an admin record — sign out and back in.',
      }
    }

    const correctionReason = String(reason || '').trim()
    if (!correctionReason) return { ok: false, message: 'A correction reason is required.' }

    const { data: row, error } = await supabase
      .from('ledger')
      .insert({
        date,
        type: original.type === 'Income' ? 'Expense' : 'Income',
        category: original.category,
        description: `Reversal of ${original.refNo}`,
        amount: original.amount,
        admin_id: adminId,
        reversal_of: original.id,
        correction_reason: correctionReason,
      })
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }

    const reversal = rowToTransaction(row)
    original.reversedBy = {
      refNo: reversal.refNo,
      recordedAt: reversal.recordedAt,
      correctionReason,
    }
    transactions.value.push(reversal)
    useAuditStore().record(
      'ledger',
      reversal.id,
      `Reversed ${original.refNo} with ${reversal.refNo} — ${correctionReason}`,
    )
    return { ok: true }
  }

  fetchLedger()

  return {
    transactions,
    search,
    typeFilter,
    loading,
    lastError,
    filteredTransactions,
    paginatedTransactions,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    sortKey,
    sortDir,
    setSort,
    sortState,
    totalIncome,
    totalExpense,
    netBalance,
    totalCount,
    fetchLedger,
    addTransaction,
    reverseTransaction,
  }
})
