import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { errorMessage } from '../utils/errorText'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useAuditStore } from './audit'

/**
 * Ledger store — live Supabase data (swapped from mocks).
 *
 * How the store maps to public.ledger (14_add_ledger_category.sql):
 *   - refNo has no column: derived from ledger_id (LDG-0001 style,
 *     the same convention as LOAN-0001 / KHS-0001).
 *   - type holds the Income/Expense flag; category (14's column)
 *     holds the coop's breakdown (Canteen Sales, Utilities, ...).
 *   - admin_id is NOT NULL on the table, so every write stamps the
 *     logged-in admin's profile.admin_id (06 "admin full access").
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

function rowToTransaction(row) {
  return {
    id: row.ledger_id,
    refNo: refNoOf(row.ledger_id),
    date: row.date,
    type: row.type,
    category: row.category || '',
    description: row.description || '',
    amount: Number(row.amount || 0),
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
        txn.category.toLowerCase().includes(query)
      return matchesType && matchesSearch
    })
    return sortRows(filtered, sortKey.value, sortDir.value, accessors)
  })

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
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
      transactions.value = (data || []).map(rowToTransaction)
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

  async function updateTransaction(id, data) {
    const before = transactions.value.find((txn) => txn.id === id)
    const { data: row, error } = await supabase
      .from('ledger')
      .update({
        date: data.date,
        type: data.type,
        category: data.category,
        description: data.description,
        amount: data.amount,
      })
      .eq('ledger_id', id)
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }
    const after = rowToTransaction(row)
    const index = transactions.value.findIndex((txn) => txn.id === id)
    if (index !== -1) transactions.value[index] = after
    // The trail spells out exactly what changed (old → new values).
    if (before) {
      const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`
      const changes = []
      if (before.date !== after.date) changes.push(`Date ${before.date} → ${after.date}`)
      if (before.type !== after.type) changes.push(`Type ${before.type} → ${after.type}`)
      if (before.category !== after.category) {
        changes.push(`Category "${before.category}" → "${after.category}"`)
      }
      if (before.description !== after.description) {
        changes.push(`Description "${before.description}" → "${after.description}"`)
      }
      if (before.amount !== after.amount) {
        changes.push(`Amount ${peso(before.amount)} → ${peso(after.amount)}`)
      }
      if (changes.length) {
        useAuditStore().record('ledger', id, `Edited ${after.refNo} — ${changes.join('; ')}`)
      }
    }
    return { ok: true }
  }

  // Ledger deletions are bookkeeping corrections: the row goes, but
  // the trail keeps who removed it, what it was, and why (the dialog
  // requires the reason before the button unlocks).
  async function deleteTransaction(id, reason) {
    const before = transactions.value.find((txn) => txn.id === id)
    const { error } = await supabase.from('ledger').delete().eq('ledger_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    transactions.value = transactions.value.filter((txn) => txn.id !== id)
    if (before) {
      useAuditStore().record(
        'ledger',
        id,
        `Deleted ${before.refNo} — ${before.type} ₱${before.amount.toLocaleString('en-PH')} (${before.category}: ${before.description}) (reason: ${reason})`,
      )
    }
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
    updateTransaction,
    deleteTransaction,
  }
})
