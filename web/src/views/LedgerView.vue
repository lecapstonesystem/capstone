<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Ledger</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ ledgerStore.totalCount }} transactions recorded
          </p>
        </div>
        <button
          @click="openAddModal"
          class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
        >
          + Add Transaction
        </button>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Total Income</p>
          <p class="text-3xl font-bold text-green-600 mt-1">
            {{ formatCurrency(ledgerStore.totalIncome) }}
          </p>
          <p class="text-xs text-green-500 mt-2">All income entries</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Total Expenses</p>
          <p class="text-3xl font-bold text-red-600 mt-1">
            {{ formatCurrency(ledgerStore.totalExpense) }}
          </p>
          <p class="text-xs text-red-400 mt-2">All expense entries</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Net Balance</p>
          <p
            class="text-3xl font-bold mt-1"
            :class="ledgerStore.netBalance >= 0 ? 'text-gray-800' : 'text-red-600'"
          >
            {{ formatCurrency(ledgerStore.netBalance) }}
          </p>
          <p class="text-xs text-green-500 mt-2">Income minus expenses</p>
        </div>
      </div>

      <!-- Search + Filter -->
      <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          v-model="ledgerStore.search"
          type="text"
          placeholder="Search by ref no., description, or category..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="ledgerStore.typeFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Types</option>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>

        <!-- Column visibility -->
        <div class="relative">
          <button
            @click="showColumnPicker = !showColumnPicker"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition duration-200 w-full sm:w-auto"
          >
            ▦ Columns
          </button>
          <div
            v-if="showColumnPicker"
            class="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 space-y-2"
          >
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.type" type="checkbox" class="accent-green-600" />
              Type
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.category" type="checkbox" class="accent-green-600" />
              Category
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.description" type="checkbox" class="accent-green-600" />
              Description
            </label>
          </div>
        </div>
      </div>
      <!-- Click outside to close the Columns dropdown -->
      <div
        v-if="showColumnPicker"
        class="fixed inset-0 z-10"
        @click="showColumnPicker = false"
      ></div>

      <!-- Transactions Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-sm">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3 w-[10%]" :store="ledgerStore" sort-key="refNo">
                  Ref No.
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[11%]" :store="ledgerStore" sort-key="date">
                  Date
                </SortableTh>
                <SortableTh
                  v-if="columns.type"
                  class="px-6 py-3 w-[10%]"
                  :store="ledgerStore"
                  sort-key="type"
                >
                  Type
                </SortableTh>
                <SortableTh
                  v-if="columns.category"
                  class="px-6 py-3 w-[16%]"
                  :store="ledgerStore"
                  sort-key="category"
                >
                  Category
                </SortableTh>
                <SortableTh
                  v-if="columns.description"
                  class="px-6 py-3 w-[29%]"
                  :store="ledgerStore"
                  sort-key="description"
                >
                  Description
                </SortableTh>
                <SortableTh
                  class="px-6 py-3 w-[12%] text-right"
                  :store="ledgerStore"
                  sort-key="amount"
                >
                  Amount
                </SortableTh>
                <th class="px-6 py-3 w-[12%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="txn in ledgerStore.paginatedTransactions"
                :key="txn.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4 font-medium text-gray-800">{{ txn.refNo }}</td>
                <td class="px-6 py-4 text-gray-500">{{ formatDate(txn.date) }}</td>
                <td v-if="columns.type" class="px-6 py-4">
                  <span
                    :class="
                      txn.type === 'Income'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    "
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                  >
                    {{ txn.type }}
                  </span>
                </td>
                <td v-if="columns.category" class="px-6 py-4 text-gray-600">
                  {{ txn.category }}
                </td>
                <td v-if="columns.description" class="px-6 py-4 text-gray-500 max-w-56 truncate">
                  {{ txn.description }}
                </td>
                <td
                  class="px-6 py-4 text-right font-semibold whitespace-nowrap"
                  :class="txn.type === 'Income' ? 'text-green-600' : 'text-red-600'"
                >
                  {{ txn.type === 'Income' ? '+' : '-' }}{{ formatCurrency(txn.amount) }}
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    @click="openEditModal(txn)"
                    class="text-green-600 hover:text-green-800 text-sm font-medium mr-3"
                  >
                    Edit
                  </button>
                  <button
                    @click="openDeleteModal(txn)"
                    class="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="ledgerStore.filteredTransactions.length === 0">
                <td :colspan="visibleColumnCount" class="px-6 py-10 text-center text-gray-400">
                  No transactions found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          class="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              :value="ledgerStore.pageSize"
              @change="ledgerStore.setPageSize(Number($event.target.value))"
              class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
            <span>per page · {{ paginationLabel }}</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="ledgerStore.setPage(ledgerStore.page - 1)"
              :disabled="ledgerStore.page <= 1"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span class="text-sm text-gray-600 px-2 whitespace-nowrap">
              Page {{ ledgerStore.page }} of {{ ledgerStore.totalPages }}
            </span>
            <button
              @click="ledgerStore.setPage(ledgerStore.page + 1)"
              :disabled="ledgerStore.page >= ledgerStore.totalPages"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">
            {{ modalMode === 'add' ? 'Add Transaction' : 'Edit Transaction' }}
          </h2>
          <button
            @click="closeModal"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <!-- Error message -->
          <div
            v-if="formError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ formError }}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                v-model="form.date"
                type="date"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                v-model="form.type"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              v-model="form.category"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <optgroup label="Income">
                <option value="Canteen Sales">Canteen Sales</option>
                <option value="Membership Fees">Membership Fees</option>
                <option value="Loan Payments">Loan Payments</option>
                <option value="Other Income">Other Income</option>
              </optgroup>
              <optgroup label="Expense">
                <option value="Supplies">Supplies</option>
                <option value="Utilities">Utilities</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              v-model="form.description"
              type="text"
              placeholder="e.g. Daily canteen sales — Monday"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
            <input
              v-model.number="form.amount"
              type="number"
              min="0"
              step="1"
              placeholder="0.00"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="saveTransaction"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            {{ modalMode === 'add' ? 'Add Transaction' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="txnToDelete"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="txnToDelete = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-2">Delete Transaction?</h2>
        <p class="text-sm text-gray-500 mb-4">
          Are you sure you want to delete
          <span class="font-medium text-gray-700">{{ txnToDelete.refNo }}</span>
          ({{ txnToDelete.description }})? The entry leaves the ledger, but the removal — including
          your reason — is kept in the activity trail.
        </p>
        <div class="mb-6">
          <label class="block text-xs font-medium text-gray-500 mb-1">Reason (required)</label>
          <textarea
            v-model="deleteReason"
            rows="2"
            placeholder="Why is this entry being removed? e.g. Recorded under the wrong category"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          ></textarea>
        </div>
        <p v-if="deleteError" class="text-sm text-red-600 mb-4">{{ deleteError }}</p>
        <div class="flex justify-end gap-3">
          <button
            @click="txnToDelete = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="confirmDelete"
            :disabled="!deleteReason.trim()"
            class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import SortableTh from '../components/SortableTh.vue'
import { useLedgerStore } from '../stores/ledger'

const ledgerStore = useLedgerStore()

// Column visibility — Ref No., Date, Amount and Actions always show
const columns = reactive({ type: true, category: true, description: true })
const showColumnPicker = ref(false)
const visibleColumnCount = computed(() => 4 + Object.values(columns).filter(Boolean).length)

// Modal state
// "Showing 1–10 of 25 entries"
const paginationLabel = computed(() => {
  const total = ledgerStore.filteredTransactions.length
  if (total === 0) return 'No transactions found'
  const start = (ledgerStore.page - 1) * ledgerStore.pageSize + 1
  const end = Math.min(ledgerStore.page * ledgerStore.pageSize, total)
  return `Showing ${start}–${end} of ${total} entries`
})

const showModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingId = ref(null)
const formError = ref('')
const txnToDelete = ref(null)
const deleteError = ref('')
const deleteReason = ref('')

// Form model
const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  type: 'Income',
  category: 'Canteen Sales',
  description: '',
  amount: null,
}
const form = reactive({ ...emptyForm })

function openAddModal() {
  modalMode.value = 'add'
  editingId.value = null
  formError.value = ''
  Object.assign(form, emptyForm, { date: new Date().toISOString().split('T')[0] })
  showModal.value = true
}

function openEditModal(txn) {
  modalMode.value = 'edit'
  editingId.value = txn.id
  formError.value = ''
  Object.assign(form, {
    date: txn.date,
    type: txn.type,
    category: txn.category,
    description: txn.description,
    amount: txn.amount,
  })
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = ''
}

async function saveTransaction() {
  // Validation
  if (!form.date) {
    formError.value = 'Date is required.'
    return
  }
  if (!form.description.trim()) {
    formError.value = 'Description is required.'
    return
  }
  if (!form.amount || form.amount <= 0) {
    formError.value = 'Please enter an amount greater than zero.'
    return
  }

  const data = {
    date: form.date,
    type: form.type,
    category: form.category,
    description: form.description.trim(),
    // Rounded to centavos: the money column stores 2 decimals, so
    // 2.999 typed by hand would be rejected by the database.
    amount: Math.round(Number(form.amount) * 100) / 100,
  }

  const result =
    modalMode.value === 'add'
      ? await ledgerStore.addTransaction(data)
      : await ledgerStore.updateTransaction(editingId.value, data)
  if (!result.ok) {
    // Keep the dialog open and show why (no toast layer in this view).
    formError.value = result.message || 'Could not save the transaction.'
    return
  }

  closeModal()
}

function openDeleteModal(txn) {
  txnToDelete.value = txn
  deleteError.value = ''
  deleteReason.value = ''
}

async function confirmDelete() {
  // The reason is required and travels with the deletion into the
  // audit trail (same rule as capital corrections in MembersView).
  if (!deleteReason.value.trim()) return
  const result = await ledgerStore.deleteTransaction(
    txnToDelete.value.id,
    deleteReason.value.trim(),
  )
  if (!result.ok) {
    // Keep the confirmation open and show why.
    deleteError.value = result.message || 'Could not delete the transaction.'
    return
  }
  txnToDelete.value = null
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

function formatDate(dateString) {
  if (!dateString) return '—'
  const date = new Date(`${dateString}T00:00:00`)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>
