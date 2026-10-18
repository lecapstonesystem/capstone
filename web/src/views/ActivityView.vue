<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Activity Log</h1>
        <p class="text-sm text-gray-500 mt-1">
          Every change made in the portal — who did what, when. Kept permanently; nothing here can
          be edited or deleted.
        </p>
      </div>

      <!-- Filters -->
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          v-model="search"
          type="search"
          placeholder="Search actions, admins, record numbers..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="kind"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option v-for="option in KIND_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select
          v-model="period"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option v-for="option in PERIOD_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <!-- Entries -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <ul v-if="entries.length > 0" class="divide-y divide-gray-100">
          <li v-for="(entry, index) in entries" :key="index" class="flex items-center gap-3 py-2.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="kindMeta(entry.kind).bg"></span>
            <div class="min-w-0 flex-1">
              <p class="text-sm truncate">
                <span class="font-medium text-gray-800">{{ entry.label }}</span>
                <span class="text-gray-500"> — {{ entry.action }}</span>
                <span v-if="entry.actor" class="text-gray-400"> · {{ entry.actor }}</span>
              </p>
            </div>
            <span class="text-xs text-gray-400 whitespace-nowrap shrink-0">
              {{ formatDateTime(entry.at) }}
            </span>
          </li>
        </ul>
        <p v-else-if="error" class="text-center text-sm text-red-600 py-8">{{ error }}</p>
        <p v-else-if="loading" class="text-center text-gray-400 text-sm py-8">Loading…</p>
        <p v-else class="text-center text-gray-400 text-sm py-8">
          No activity matches these filters.
        </p>

        <!-- Pagination — same control as the Members and Applications tables -->
        <div
          v-if="!error && total > 0"
          class="pt-4 mt-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              :value="pageSize"
              @change="setPageSize(Number($event.target.value))"
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
              :disabled="page <= 1 || loading"
              @click="setPage(page - 1)"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span class="text-sm text-gray-600 px-2 whitespace-nowrap">
              Page {{ page }} of {{ totalPages }}
            </span>
            <button
              :disabled="page >= totalPages || loading"
              @click="setPage(page + 1)"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { useAuditStore } from '../stores/audit'
import { KIND_META, kindMeta, auditLabel, formatDateTime } from '../utils/activity'

/**
 * Activity Log — the full durable audit trail (audit_log), newest
 * first, with module/period filters, text search and the portal's
 * standard Show-N-per-page pagination. The dashboard card is the
 * 8-line summary; this is the whole record.
 */
const auditStore = useAuditStore()

const KIND_OPTIONS = [
  { value: 'all', label: 'All modules' },
  { value: 'member', label: 'Members' },
  { value: 'loan', label: 'Loans' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'admin', label: 'Admin accounts' },
]
const PERIOD_OPTIONS = [
  { value: '0', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const search = ref('')
const kind = ref('all')
const period = ref('0')
const page = ref(1)
const pageSize = ref(10)
const rows = ref([])
const total = ref(0)
const loading = ref(false)
const error = ref('')

const entries = computed(() =>
  rows.value.map((row) => ({
    at: row.created_at,
    label: auditLabel(row),
    action: row.action,
    actor: row.actor,
    kind: KIND_META[row.entity_type] ? row.entity_type : 'ledger',
  })),
)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// "Showing 1–10 of 25 entries"
const paginationLabel = computed(() => {
  if (!total.value) return 'no entries'
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, total.value)
  return `Showing ${start}–${end} of ${total.value} entries`
})

async function fetchPage() {
  loading.value = true
  error.value = ''
  const result = await auditStore.queryActivity({
    kind: kind.value,
    search: search.value,
    days: Number(period.value),
    offset: (page.value - 1) * pageSize.value,
    limit: pageSize.value,
  })
  loading.value = false
  if (!result.ok) {
    rows.value = []
    total.value = 0
    error.value = 'Could not load the activity log. Please try again.'
    return
  }
  rows.value = result.rows
  total.value = result.total
}

function setPage(next) {
  if (loading.value) return
  const clamped = Math.min(Math.max(1, next), totalPages.value)
  if (clamped === page.value) return
  page.value = clamped
  fetchPage()
}

function setPageSize(size) {
  pageSize.value = size
  page.value = 1
  fetchPage()
}

function resetAndFetch() {
  page.value = 1
  fetchPage()
}

// Changing a dropdown or page size restarts at page 1; typing waits
// for a pause before restarting.
watch([kind, period], resetAndFetch)
let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(resetAndFetch, 300)
})

onMounted(fetchPage)
</script>
