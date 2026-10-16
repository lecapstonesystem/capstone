<template>
  <AppLayout>
    <div>
      <!-- Print-only report header -->
      <div class="hidden print:block mb-4 text-sm">
        <p class="font-bold text-gray-900">
          UCMS Reports — KHS Mentor's Multi-Purpose Cooperative, Inc.
        </p>
        <p class="text-gray-600">{{ rangeLabel }} · generated {{ todayLabel }}</p>
      </div>

      <!-- Header + toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 no-print">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Reports</h1>
          <p class="text-sm text-gray-500 mt-1">{{ rangeLabel }} · generated {{ todayLabel }}</p>
        </div>
        <div class="flex gap-2">
          <select
            v-model="range"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option v-for="option in RANGES" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button
            @click="printReports"
            class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition duration-200"
          >
            Print
          </button>
        </div>
      </div>

      <!-- 1. Membership Growth -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Membership Growth</h2>
          <button
            @click="exportGrowth"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Bar chart: new members per month -->
          <div class="lg:col-span-2">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              New members per month
            </p>
            <div
              v-if="growthSeries.length > 0"
              class="flex items-end gap-1 h-44 border-b border-gray-100 pb-1"
            >
              <div
                v-for="point in growthSeries"
                :key="point.label"
                class="flex-1 flex flex-col items-center gap-1 min-w-0"
                :title="point.label"
              >
                <span class="text-xs font-medium text-gray-600">{{ point.count }}</span>
                <div
                  class="w-full bg-green-500 rounded-t"
                  :style="{ height: growthBarPx(point.count) + 'px' }"
                ></div>
                <!-- Month over 2-digit year — one line per month can't
                     fit side by side at this many bars -->
                <div class="w-full text-center leading-tight overflow-hidden">
                  <span class="block text-[10px] text-gray-500">{{ point.mon }}</span>
                  <span class="block text-[10px] text-gray-400">{{ point.yr }}</span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 py-8 text-center">
              No new members in this period.
            </p>
            <p class="text-xs text-gray-400 mt-2">
              {{ rangeMembers.length }} joined · {{ memberTotal }} total in the system
            </p>
          </div>

          <!-- Donut: status breakdown (current) -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Member Status (current)
            </p>
            <div class="flex items-center gap-5">
              <div
                class="relative w-32 h-32 rounded-full shrink-0"
                :style="{ background: donutStyle }"
              >
                <div
                  class="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center"
                >
                  <span class="text-2xl font-bold text-gray-800">{{ memberTotal }}</span>
                  <span class="text-xs text-gray-400">members</span>
                </div>
              </div>
              <ul class="space-y-2 text-sm">
                <li class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-green-500"></span>
                  Active — {{ statusCounts.Active }}
                </li>
                <li class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                  Suspended — {{ statusCounts.Suspended }}
                </li>
                <li class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-gray-400"></span>
                  Dropped — {{ statusCounts.Dropped }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Applications Summary -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Applications Summary</h2>
          <button
            @click="exportApplications"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Received</p>
            <p class="text-xl font-bold text-gray-800">{{ appStats.received }}</p>
          </div>
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Approved</p>
            <p class="text-xl font-bold text-green-700">{{ appStats.approved }}</p>
          </div>
          <div class="bg-purple-50 rounded-lg p-3">
            <p class="text-xs text-purple-700">Returned</p>
            <p class="text-xl font-bold text-purple-700">{{ appStats.returned }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Rejected</p>
            <p class="text-xl font-bold text-red-600">{{ appStats.rejected }}</p>
          </div>
          <div class="bg-blue-50 rounded-lg p-3">
            <p class="text-xs text-blue-700">Approval rate</p>
            <p class="text-xl font-bold text-blue-700">{{ appStats.approvalRate }}%</p>
          </div>
        </div>

        <!-- Stacked bar -->
        <div v-if="appStats.received > 0" class="mb-4">
          <div class="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-2">
            <div
              v-for="seg in appStack"
              :key="seg.label"
              :class="seg.color"
              :style="{ width: seg.pct + '%' }"
              :title="`${seg.label}: ${seg.count}`"
            ></div>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span v-for="seg in appStack" :key="seg.label" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" :class="seg.dot"></span>
              {{ seg.label }} ({{ seg.count }})
            </span>
            <span v-if="appStats.inProgress > 0" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              In progress ({{ appStats.inProgress }})
            </span>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 mb-4">No applications in this period.</p>

        <!-- Recent applications -->
        <div v-if="recentApps.length > 0" class="table-scroll overflow-x-auto">
          <table class="w-full min-w-[520px] text-sm">
            <thead>
              <tr class="text-left text-xs font-medium text-gray-400 uppercase">
                <th class="py-2 pr-4">App No</th>
                <th class="py-2 pr-4">Applicant</th>
                <th class="py-2 pr-4">Status</th>
                <th class="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="app in recentApps" :key="app.id">
                <td class="py-2 pr-4 font-mono text-xs text-gray-500">{{ app.appNo }}</td>
                <td class="py-2 pr-4 text-gray-700">{{ app.firstName }} {{ app.lastName }}</td>
                <td class="py-2 pr-4">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="appStatusClass(app.status)"
                  >
                    {{ app.status }}
                  </span>
                </td>
                <td class="py-2 text-gray-500 text-xs">{{ formatDate(app.submittedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 3. Loan Portfolio -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-gray-800">Loan Portfolio</h2>
            <p class="text-xs text-gray-400">
              Balance figures are current snapshots · collection figures follow the selected period
            </p>
          </div>
          <button
            @click="exportLoans"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Outstanding</p>
            <p class="text-lg font-bold text-green-700">
              {{ formatPeso(loansStore.outstandingBalance) }}
            </p>
          </div>
          <div class="bg-blue-50 rounded-lg p-3">
            <p class="text-xs text-blue-700">Active loans</p>
            <p class="text-lg font-bold text-blue-700">{{ loansStore.activeCount }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Delinquent (6+ mo)</p>
            <p class="text-lg font-bold text-red-600">
              {{ delinquentLoans.length }} · {{ formatPeso(delinquentAmount) }}
            </p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Collected</p>
            <p class="text-lg font-bold text-gray-800">{{ formatPeso(collectedInRange) }}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Released</p>
            <p class="text-lg font-bold text-gray-800">
              {{ releasedInRange.length }} loan<span v-if="releasedInRange.length !== 1">s</span>
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Loans issued by type -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Loans issued by type (principal)
            </p>
            <div v-if="loansByType.length > 0" class="space-y-3">
              <div v-for="row in loansByType" :key="row.value">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-gray-600"> {{ row.label }} ({{ row.count }}) </span>
                  <span class="font-medium text-gray-800">{{ formatPeso(row.total) }}</span>
                </div>
                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-2 bg-green-500 rounded-full"
                    :style="{ width: typeBarPct(row.total) + '%' }"
                  ></div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400">No issued loans yet.</p>
          </div>

          <!-- Delinquent accounts -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Delinquent accounts
            </p>
            <div v-if="delinquentLoans.length > 0" class="table-scroll overflow-x-auto">
              <table class="w-full min-w-[380px] text-sm">
                <thead>
                  <tr class="text-left text-xs font-medium text-gray-400 uppercase">
                    <th class="py-2 pr-3">Loan No</th>
                    <th class="py-2 pr-3">Member</th>
                    <th class="py-2 pr-3">Balance</th>
                    <th class="py-2">Last activity</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="loan in delinquentLoans" :key="loan.id">
                    <td class="py-2 pr-3 font-mono text-xs text-gray-500">{{ loan.loanNo }}</td>
                    <td class="py-2 pr-3 text-gray-700">{{ loan.memberName }}</td>
                    <td class="py-2 pr-3 font-semibold text-red-600">
                      {{ formatPeso(loansStore.balanceOf(loan)) }}
                    </td>
                    <td class="py-2 text-gray-500 text-xs">
                      {{ formatDate(lastActivity(loan)) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-green-700">None — no delinquent accounts</p>
          </div>
        </div>
      </section>

      <!-- 4. Cash Flow -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Cash Flow</h2>
          <button
            @click="exportCashFlow"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Income</p>
            <p class="text-xl font-bold text-green-700">{{ formatPeso(flow.income) }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Expenses</p>
            <p class="text-xl font-bold text-red-600">{{ formatPeso(flow.expense) }}</p>
          </div>
          <div class="rounded-lg p-3" :class="flow.net >= 0 ? 'bg-gray-50' : 'bg-red-50'">
            <p class="text-xs text-gray-500">Net</p>
            <p class="text-xl font-bold" :class="flow.net >= 0 ? 'text-gray-800' : 'text-red-600'">
              {{ formatPeso(flow.net) }}
            </p>
          </div>
        </div>

        <!-- Grouped bar chart -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Income vs expenses per month
            </p>
            <div
              v-if="flowSeries.length > 0"
              class="flex items-end gap-1 h-44 border-b border-gray-100 pb-1"
            >
              <div
                v-for="point in flowSeries"
                :key="point.label"
                class="flex-1 flex flex-col items-center gap-1 min-w-0"
                :title="point.label"
              >
                <div class="w-full flex items-end justify-center gap-1 h-32">
                  <div
                    class="w-1/3 bg-green-500 rounded-t"
                    :style="{ height: flowBarPx(point.income) + 'px' }"
                    :title="`Income ${formatPeso(point.income)}`"
                  ></div>
                  <div
                    class="w-1/3 bg-red-400 rounded-t"
                    :style="{ height: flowBarPx(point.expense) + 'px' }"
                    :title="`Expenses ${formatPeso(point.expense)}`"
                  ></div>
                </div>
                <!-- Month over 2-digit year, same as the growth chart -->
                <div class="w-full text-center leading-tight overflow-hidden">
                  <span class="block text-[10px] text-gray-500">{{ point.mon }}</span>
                  <span class="block text-[10px] text-gray-400">{{ point.yr }}</span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 py-8 text-center">
              No transactions in this period.
            </p>
            <div class="flex gap-4 text-xs text-gray-500 mt-2">
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span> Income
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-red-400"></span> Expenses
              </span>
            </div>
          </div>

          <!-- Top categories -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Top categories
            </p>
            <div v-if="topCategories.length > 0">
              <table class="w-full text-sm">
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="row in topCategories" :key="row.key">
                    <td class="py-2">
                      <span
                        class="px-1.5 py-0.5 rounded text-xs font-medium mr-2"
                        :class="
                          row.type === 'Income'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        "
                      >
                        {{ row.type === 'Income' ? 'IN' : 'OUT' }}
                      </span>
                      {{ row.category }}
                    </td>
                    <td class="py-2 text-right font-medium text-gray-800">
                      {{ formatPeso(row.total) }}
                    </td>
                    <td class="py-2 text-right text-xs text-gray-400 w-12">{{ row.pct }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-400">No data in this period.</p>
          </div>
        </div>
      </section>

      <!-- 5. Financial Summary -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-gray-800">Financial Summary</h2>
            <p class="text-xs text-gray-400">One-pager for the BOD/board meetings</p>
          </div>
          <button
            @click="exportSummary"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <table class="w-full text-sm">
          <tbody class="divide-y divide-gray-100">
            <tr v-for="row in summaryRows" :key="row[0]">
              <td class="py-2.5 text-gray-600">{{ row[0] }}</td>
              <td class="py-2.5 text-right font-semibold" :class="row[2] || 'text-gray-800'">
                {{ row[1] }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { useMembersStore } from '../stores/members'
import { useApplicationsStore } from '../stores/applications'
import { useLoansStore, LOAN_TYPES } from '../stores/loans'
import { useLedgerStore } from '../stores/ledger'

const membersStore = useMembersStore()
const appsStore = useApplicationsStore()
const loansStore = useLoansStore()
const ledgerStore = useLedgerStore()

const todayLabel = new Date().toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

// ---------- date range ----------
const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'last12', label: 'Last 12 months' },
]
const range = ref('all')

const rangeLabel = computed(
  () => RANGES.find((option) => option.value === range.value)?.label || 'All time',
)

// Accepts 'YYYY-MM-DD' or full ISO strings
function inRange(dateStr) {
  if (!dateStr) return false
  if (range.value === 'all') return true
  const date = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr)
  const now = new Date()
  if (range.value === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  if (range.value === 'lastMonth') {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return date.getFullYear() === previous.getFullYear() && date.getMonth() === previous.getMonth()
  }
  if (range.value === 'ytd') return date.getFullYear() === now.getFullYear()
  if (range.value === 'last12') {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
    return date.getTime() >= cutoff.getTime()
  }
  return true
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: '2-digit',
  })
}

// The same month split into two lines (name over 2-digit year) for
// the bar charts: a flat "Jan 19" is wider than one bar column, so
// at ~34 months the labels collide. CSV exports keep the flat label.
function monthParts(year, monthIndex) {
  const date = new Date(year, monthIndex, 1)
  return {
    mon: date.toLocaleDateString('en-PH', { month: 'short' }),
    yr: date.toLocaleDateString('en-PH', { year: '2-digit' }),
  }
}

// ---------- shared formatters ----------
function formatPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString.length === 10 ? `${isoString}T00:00:00` : isoString)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function appStatusClass(status) {
  const classes = {
    Pending: 'bg-amber-100 text-amber-700',
    'Under Review': 'bg-blue-100 text-blue-700',
    Approved: 'bg-green-100 text-green-700',
    Returned: 'bg-purple-100 text-purple-700',
    Rejected: 'bg-red-100 text-red-600',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function printReports() {
  window.print()
}

// ---------- 1. Membership ----------
const memberTotal = computed(() => membersStore.members.length)

const rangeMembers = computed(() =>
  membersStore.members.filter((member) => inRange(member.dateJoined)),
)

const statusCounts = computed(() => ({
  Active: membersStore.members.filter((member) => member.status === 'Active').length,
  Suspended: membersStore.members.filter((member) => member.status === 'Suspended').length,
  Dropped: membersStore.members.filter((member) => member.status === 'Dropped').length,
}))

// New members grouped by month (only months that have joins)
const growthSeries = computed(() => {
  const counts = new Map()
  rangeMembers.value.forEach((member) => {
    const date = new Date(`${member.dateJoined}T00:00:00`)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split('-').map(Number)
      return { label: monthLabel(year, month), count, ...monthParts(year, month) }
    })
})

const growthMax = computed(() => Math.max(1, ...growthSeries.value.map((point) => point.count)))

function growthBarPx(count) {
  return Math.max(6, Math.round((count / growthMax.value) * 110))
}

// Donut of current member statuses
const donutStyle = computed(() => {
  const total = memberTotal.value
  if (!total) return '#e5e7eb'
  const active = (statusCounts.value.Active / total) * 100
  const suspended = (statusCounts.value.Suspended / total) * 100
  const activeEnd = active
  const suspendedEnd = active + suspended
  return `conic-gradient(#22c55e 0 ${activeEnd}%, #f59e0b ${activeEnd}% ${suspendedEnd}%, #9ca3af ${suspendedEnd}% 100%)`
})

// ---------- 2. Applications ----------
const rangeApps = computed(() =>
  appsStore.applications.filter((application) => inRange(application.submittedAt)),
)

const appStats = computed(() => {
  const list = rangeApps.value
  const approved = list.filter((application) => application.status === 'Approved').length
  const returned = list.filter((application) => application.status === 'Returned').length
  const rejected = list.filter((application) => application.status === 'Rejected').length
  const inProgress = list.filter(
    (application) => application.status === 'Pending' || application.status === 'Under Review',
  ).length
  return {
    received: list.length,
    approved,
    returned,
    rejected,
    inProgress,
    approvalRate: list.length > 0 ? Math.round((approved / list.length) * 100) : 0,
  }
})

const appStack = computed(() => {
  const total = appStats.value.received
  if (!total) return []
  const segments = [
    {
      label: 'Approved',
      count: appStats.value.approved,
      color: 'bg-green-500',
      dot: 'bg-green-500',
    },
    {
      label: 'Returned',
      count: appStats.value.returned,
      color: 'bg-purple-500',
      dot: 'bg-purple-500',
    },
    { label: 'Rejected', count: appStats.value.rejected, color: 'bg-red-500', dot: 'bg-red-500' },
  ]
  return segments
    .filter((segment) => segment.count > 0)
    .map((segment) => ({ ...segment, pct: (segment.count / total) * 100 }))
})

const recentApps = computed(() =>
  [...rangeApps.value]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 5),
)

// ---------- 3. Loans ----------
function lastActivity(loan) {
  if (loan.payments.length > 0) return loan.payments[loan.payments.length - 1].at
  return loan.releasedAt || loan.createdAt
}

const delinquentLoans = computed(() =>
  loansStore.loans.filter((loan) => loansStore.isDelinquent(loan)),
)

const delinquentAmount = computed(() =>
  delinquentLoans.value.reduce((sum, loan) => sum + loansStore.balanceOf(loan), 0),
)

// Counted exactly like the loans store's paidOf: only Recorded
// payments are money the coop has verified — Pending app receipts
// must not inflate the collections figure.
const collectedInRange = computed(() => {
  let total = 0
  loansStore.loans.forEach((loan) => {
    loan.payments.forEach((payment) => {
      if (payment.status === 'Recorded' && inRange(payment.at)) total += payment.amount
    })
  })
  return Math.round(total * 100) / 100
})

const releasedInRange = computed(() =>
  loansStore.loans.filter((loan) => loan.releasedAt && inRange(loan.releasedAt)),
)

// Issued loans (Released + Paid) grouped by type
const loansByType = computed(() => {
  const issued = loansStore.loans.filter(
    (loan) => loan.status === 'Released' || loan.status === 'Paid',
  )
  return LOAN_TYPES.map((type) => {
    const matching = issued.filter((loan) => loan.type === type.value)
    return {
      value: type.value,
      label: type.label,
      count: matching.length,
      total: matching.reduce((sum, loan) => sum + loan.principal, 0),
    }
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total)
})

const loansByTypeMax = computed(() => Math.max(1, ...loansByType.value.map((row) => row.total)))

function typeBarPct(total) {
  return Math.max(2, Math.round((total / loansByTypeMax.value) * 100))
}

// ---------- 4. Cash flow ----------
const rangeTxns = computed(() => ledgerStore.transactions.filter((txn) => inRange(txn.date)))

const flow = computed(() => {
  let income = 0
  let expense = 0
  rangeTxns.value.forEach((txn) => {
    if (txn.type === 'Income') income += txn.amount
    else expense += txn.amount
  })
  return { income, expense, net: income - expense }
})

// Income vs expenses grouped by month
const flowSeries = computed(() => {
  const months = new Map()
  rangeTxns.value.forEach((txn) => {
    const date = new Date(`${txn.date}T00:00:00`)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    if (!months.has(key))
      months.set(key, { year: date.getFullYear(), month: date.getMonth(), income: 0, expense: 0 })
    const bucket = months.get(key)
    if (txn.type === 'Income') bucket.income += txn.amount
    else bucket.expense += txn.amount
  })
  return [...months.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({
      label: monthLabel(bucket.year, bucket.month),
      ...monthParts(bucket.year, bucket.month),
      income: bucket.income,
      expense: bucket.expense,
    }))
})

const flowMax = computed(() =>
  Math.max(1, ...flowSeries.value.map((point) => Math.max(point.income, point.expense))),
)

function flowBarPx(value) {
  if (!value) return 2
  return Math.max(4, Math.round((value / flowMax.value) * 120))
}

// Top categories by total amount in period
const topCategories = computed(() => {
  const groups = new Map()
  const totalAmount = rangeTxns.value.reduce((sum, txn) => sum + txn.amount, 0)
  rangeTxns.value.forEach((txn) => {
    const key = `${txn.type}|${txn.category}`
    groups.set(key, (groups.get(key) || 0) + txn.amount)
  })
  return [...groups.entries()]
    .map(([key, total]) => {
      const [type, category] = key.split('|')
      return {
        key,
        type,
        category,
        total,
        pct: totalAmount > 0 ? Math.round((total / totalAmount) * 100) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
})

// ---------- 5. Financial summary ----------
const capitalTotal = computed(() =>
  membersStore.members.reduce((sum, member) => sum + (member.capitalShare || 0), 0),
)

const membershipFees = computed(() =>
  ledgerStore.transactions
    .filter(
      (txn) => txn.type === 'Income' && txn.category === 'Membership Fees' && inRange(txn.date),
    )
    .reduce((sum, txn) => sum + txn.amount, 0),
)

const summaryRows = computed(() => [
  ['Total members (Active)', `${statusCounts.value.Active} of ${memberTotal.value}`],
  ['Capital shares — all members', formatPeso(capitalTotal.value)],
  ['Membership fees collected', formatPeso(membershipFees.value)],
  ['Income', formatPeso(flow.value.income), 'text-green-700'],
  ['Expenses', formatPeso(flow.value.expense), 'text-red-600'],
  [
    'Net cash flow',
    formatPeso(flow.value.net),
    flow.value.net >= 0 ? 'text-green-700' : 'text-red-600',
  ],
  ['Loans outstanding (current)', formatPeso(loansStore.outstandingBalance)],
  ['Loan collections', formatPeso(collectedInRange.value)],
  [
    'Delinquent amount',
    formatPeso(delinquentAmount.value),
    delinquentAmount.value > 0 ? 'text-red-600' : 'text-gray-800',
  ],
  ['Applications received', String(appStats.value.received)],
  ['Applications approved', String(appStats.value.approved)],
])

// ---------- CSV export ----------
function download(filename, headers, rows) {
  const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportGrowth() {
  download(
    'ucms-membership-growth.csv',
    ['Month', 'New members'],
    growthSeries.value.map((point) => [point.label, point.count]),
  )
}

function exportApplications() {
  download(
    'ucms-applications.csv',
    ['App No', 'Applicant', 'Status', 'Source', 'Submitted'],
    rangeApps.value.map((app) => [
      app.appNo,
      `${app.firstName} ${app.lastName}`,
      app.status,
      app.source,
      formatDate(app.submittedAt),
    ]),
  )
}

function exportLoans() {
  download(
    'ucms-loans.csv',
    ['Loan No', 'Member', 'Type', 'Principal', 'Balance', 'Status', 'Delinquent'],
    loansStore.loans.map((loan) => [
      loan.loanNo,
      loan.memberName,
      loan.type,
      loan.principal,
      loansStore.balanceOf(loan),
      loan.status,
      loansStore.isDelinquent(loan) ? 'Yes' : 'No',
    ]),
  )
}

function exportCashFlow() {
  download(
    'ucms-cash-flow.csv',
    ['Month', 'Income', 'Expenses', 'Net'],
    flowSeries.value.map((point) => [
      point.label,
      point.income,
      point.expense,
      point.income - point.expense,
    ]),
  )
}

function exportSummary() {
  download(
    'ucms-financial-summary.csv',
    ['Metric', 'Value'],
    summaryRows.value.map((row) => [row[0], row[1]]),
  )
}
</script>
