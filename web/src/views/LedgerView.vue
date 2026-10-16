<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
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
      </div>

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
                <SortableTh class="px-6 py-3 w-[10%]" :store="ledgerStore" sort-key="type">
                  Type
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[16%]" :store="ledgerStore" sort-key="category">
                  Category
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[29%]" :store="ledgerStore" sort-key="description">
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
                v-for="txn in ledgerStore.filteredTransactions"
                :key="txn.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4 font-medium text-gray-800">{{ txn.refNo }}</td>
                <td class="px-6 py-4 text-gray-500">{{ formatDate(txn.date) }}</td>
                <td class="px-6 py-4">
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
                <td class="px-6 py-4 text-gray-600">{{ txn.category }}</td>
                <td class="px-6 py-4 text-gray-500 max-w-56 truncate">{{ txn.description }}</td>
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
                <td colspan="7" class="px-6 py-10 text-center text-gray-400">
                  No transactions found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
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

        <div class="px-6 py-4 space-y-4">
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
              step="0.01"
              placeholder="0.00"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
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
        <p class="text-sm text-gray-500 mb-6">
          Are you sure you want to delete
          <span class="font-medium text-gray-700">{{ txnToDelete.refNo }}</span>
          ({{ txnToDelete.description }})? This action cannot be undone.
        </p>
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
            class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition duration-200"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, reactive } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import SortableTh from '../components/SortableTh.vue'
import { useLedgerStore } from '../stores/ledger'

const ledgerStore = useLedgerStore()

// Modal state
const showModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingId = ref(null)
const formError = ref('')
const txnToDelete = ref(null)
const deleteError = ref('')

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
    amount: Number(form.amount),
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
}

async function confirmDelete() {
  const result = await ledgerStore.deleteTransaction(txnToDelete.value.id)
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
