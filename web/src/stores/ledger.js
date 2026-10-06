import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * Ledger store
 *
 * Tracks income and expense transactions (canteen sales, fees,
 * utilities, etc.) using temporary mock data in memory.
 *
 * When the Supabase table is ready, replace the bodies of
 * addTransaction / updateTransaction / deleteTransaction with
 * supabase calls, e.g.:
 *
 *   const { error } = await supabase.from('ledger').insert(data)
 *
 * The LedgerView component will NOT need to change.
 */

// Temporary sample data — delete once Supabase is connected
const mockTransactions = [
  {
    id: 1,
    refNo: 'LDG-0001',
    date: '2026-09-01',
    type: 'Income',
    category: 'Canteen Sales',
    description: 'Daily canteen sales — Monday',
    amount: 4500,
  },
  {
    id: 2,
    refNo: 'LDG-0002',
    date: '2026-09-01',
    type: 'Expense',
    category: 'Supplies',
    description: 'Canteen food supplies from supplier',
    amount: 2100,
  },
  {
    id: 3,
    refNo: 'LDG-0003',
    date: '2026-09-02',
    type: 'Income',
    category: 'Membership Fees',
    description: 'New member registration fee — KHS-0005',
    amount: 300, // ₱300 membership fee per client interview
  },
  {
    id: 4,
    refNo: 'LDG-0004',
    date: '2026-09-03',
    type: 'Expense',
    category: 'Utilities',
    description: 'Electricity bill — September',
    amount: 3200,
  },
  {
    id: 5,
    refNo: 'LDG-0005',
    date: '2026-09-05',
    type: 'Income',
    category: 'Canteen Sales',
    description: 'Daily canteen sales — Friday',
    amount: 5200,
  },
  {
    id: 6,
    refNo: 'LDG-0006',
    date: '2026-09-08',
    type: 'Expense',
    category: 'Miscellaneous',
    description: 'Canteen equipment repair (freezer)',
    amount: 1500,
  },
  // Earlier months — gives the Reports cash-flow trend something to draw
  {
    id: 7,
    refNo: 'LDG-0007',
    date: '2026-06-04',
    type: 'Income',
    category: 'Canteen Sales',
    description: 'Daily canteen sales — Wednesday',
    amount: 4800,
  },
  {
    id: 8,
    refNo: 'LDG-0008',
    date: '2026-06-15',
    type: 'Expense',
    category: 'Supplies',
    description: 'Canteen food supplies from supplier',
    amount: 2400,
  },
  {
    id: 9,
    refNo: 'LDG-0009',
    date: '2026-07-08',
    type: 'Income',
    category: 'Canteen Sales',
    description: 'Daily canteen sales — Wednesday',
    amount: 5100,
  },
  {
    id: 10,
    refNo: 'LDG-0010',
    date: '2026-07-22',
    type: 'Expense',
    category: 'Utilities',
    description: 'Electricity bill — July',
    amount: 3050,
  },
  {
    id: 11,
    refNo: 'LDG-0011',
    date: '2026-08-06',
    type: 'Income',
    category: 'Canteen Sales',
    description: 'Daily canteen sales — Thursday',
    amount: 4900,
  },
  {
    id: 12,
    refNo: 'LDG-0012',
    date: '2026-08-19',
    type: 'Expense',
    category: 'Miscellaneous',
    description: 'Canteen equipment repair (freezer part)',
    amount: 900,
  },
]

export const useLedgerStore = defineStore('ledger', () => {
  const transactions = ref([...mockTransactions])
  const search = ref('')
  const typeFilter = ref('All')

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
    // Newest entries first
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  })

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

  // LDG-0001, LDG-0002, ... based on the highest number already used
  function generateRefNo() {
    const numbers = transactions.value.map((txn) => Number.parseInt(txn.refNo.split('-')[1], 10))
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return `LDG-${String(next).padStart(4, '0')}`
  }

  function addTransaction(data) {
    transactions.value.push({
      id: Date.now(), // temporary id — Supabase will generate the real one
      refNo: generateRefNo(),
      ...data,
    })
  }

  function updateTransaction(id, data) {
    const index = transactions.value.findIndex((txn) => txn.id === id)
    if (index !== -1) {
      transactions.value[index] = { ...transactions.value[index], ...data }
    }
  }

  function deleteTransaction(id) {
    transactions.value = transactions.value.filter((txn) => txn.id !== id)
  }

  return {
    transactions,
    search,
    typeFilter,
    filteredTransactions,
    totalIncome,
    totalExpense,
    netBalance,
    totalCount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  }
})
