<template>
  <AppLayout>
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Welcome back, Admin</h1>
        <p class="text-sm text-gray-500 mt-1">{{ todayLong }}</p>
        <p v-if="apiSource" class="text-xs text-green-700 mt-1">
          KPIs served live by the UCMS Analytics API (Python FastAPI)
        </p>
      </div>

      <!-- Summary Cards (live from the stores) -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Total Members</p>
          <p class="text-3xl font-bold text-gray-800 mt-1">{{ totalMembers }}</p>
          <p class="text-xs text-green-600 mt-2">
            {{ activeMembers }} active · {{ inactiveCount }} inactive
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Active Loans</p>
          <p class="text-3xl font-bold text-gray-800 mt-1">{{ activeLoansCard }}</p>
          <p class="text-xs text-blue-500 mt-2">
            {{ formatPeso(outstandingBalance) }} outstanding
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Daily Income</p>
          <p class="text-3xl font-bold text-gray-800 mt-1">{{ formatPeso(dailyIncome) }}</p>
          <p class="text-xs text-amber-500 mt-2">
            Today · {{ formatPeso(monthIncome) }} this month
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p class="text-sm text-gray-500 font-medium">Delinquent Accounts</p>
          <p
            class="text-3xl font-bold mt-1"
            :class="delinquentCount > 0 ? 'text-red-500' : 'text-gray-800'"
          >
            {{ delinquentCount }}
          </p>
          <p
            class="text-xs mt-2"
            :class="delinquentCount > 0 ? 'text-red-400' : 'text-green-500'"
          >
            {{
              delinquentCount > 0
                ? `${formatPeso(delinquentAtRisk)} at risk`
                : 'no overdue loans'
            }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Needs attention -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Needs your attention</h3>

          <ul v-if="attentionItems.length > 0" class="space-y-3">
            <li v-for="item in attentionItems" :key="item.to + item.text">
              <RouterLink
                :to="item.to"
                class="flex items-center justify-between gap-3 bg-gray-50 hover:bg-green-50 rounded-lg px-4 py-3 transition duration-200 group"
              >
                <span class="text-sm" :class="item.tone">{{ item.text }}</span>
                <span class="text-gray-300 group-hover:text-green-600">→</span>
              </RouterLink>
            </li>
          </ul>
          <div v-else class="text-center text-sm py-6">
            <p class="text-gray-400">All caught up — nothing needs review.</p>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-md font-semibold text-gray-700">Recent Activity</h3>
            <RouterLink
              to="/activity"
              class="text-xs font-medium text-green-700 hover:text-green-800"
            >
              View all activity
            </RouterLink>
          </div>

          <ul v-if="recentActivity.length > 0" class="divide-y divide-gray-100">
            <li
              v-for="(entry, index) in recentActivity"
              :key="index"
              class="flex items-center gap-3 py-2.5"
            >
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :class="kindMeta(entry.kind).bg"
              ></span>
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
          <div v-else class="text-center text-gray-400 text-sm py-8">No recent activity yet.</div>
        </div>
      </div>

      <!-- Members with an active loan (adviser UAT: show WHO has one,
           not just the count on the Active Loans card) -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-md font-semibold text-gray-700">
            Members with an active loan
            <span class="text-sm font-normal text-gray-400">({{ activeLoanMembers.length }})</span>
          </h3>
          <RouterLink to="/loans" class="text-xs font-medium text-green-700 hover:text-green-800">
            View all loans
          </RouterLink>
        </div>

        <ul
          v-if="activeLoanMembers.length > 0"
          class="divide-y divide-gray-100 max-h-72 overflow-y-auto"
        >
          <li
            v-for="entry in activeLoanMembers"
            :key="entry.memberId"
            class="flex items-center justify-between gap-3 py-2.5"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate">{{ entry.memberName }}</p>
              <p class="text-xs text-gray-400">
                {{ entry.memberNo }} · {{ entry.loanCount }} active loan{{
                  entry.loanCount > 1 ? 's' : ''
                }}
              </p>
            </div>
            <span class="text-sm font-semibold text-gray-800 whitespace-nowrap">
              {{ formatPeso(entry.balance) }}
            </span>
          </li>
        </ul>
        <div v-else class="text-center text-sm py-6">
          <p class="text-gray-400">No active loans right now.</p>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { useMembersStore } from '../stores/members'
// HIDDEN for v1.0 — Registrations module (face-to-face registration only).
// import { useApplicationsStore } from '../stores/applications'
import { useLoansStore } from '../stores/loans'
import { useLedgerStore } from '../stores/ledger'
import { useAuditStore } from '../stores/audit'
import { KIND_META, kindMeta, auditLabel, formatDateTime } from '../utils/activity'
import { analyticsApi } from '../lib/api.js'

const membersStore = useMembersStore()
// const appsStore = useApplicationsStore() // HIDDEN with the Registrations module (v1.0)
const loansStore = useLoansStore()
const ledgerStore = useLedgerStore()
const auditStore = useAuditStore()

// ---- Analytics API overlay (Python FastAPI backend) ------------------
// Paper architecture: Vue displays, Python computes, Supabase stores.
// When the analytics backend is reachable, the KPI cards + attention list
// + recent activity are served by /portal/dashboard (the Python engine).
// ANY failure (offline, key, CORS) falls back silently to the store-derived
// values below — the dashboard can never break because of this block.
const apiCards = ref(null)
const apiAttention = ref(null)
const apiActivity = ref(null)
const apiSource = ref(false)

onMounted(async () => {
  try {
    const data = await analyticsApi.portalDashboard()
    if (data && data.cards) {
      apiCards.value = data.cards
      if (Array.isArray(data.attention) && data.attention.length) {
        apiAttention.value = data.attention
      }
      if (Array.isArray(data.recentActivity) && data.recentActivity.length) {
        apiActivity.value = data.recentActivity
      }
      apiSource.value = true
    }
  } catch (err) {
    // Backend not reachable — store-computed values remain in effect.
    console.info('[analytics] backend unreachable, using store values:', err?.message || err)
  }
})

const totalMembers = computed(
  () => apiCards.value?.totalMembers ?? membersStore.totalCount,
)
const activeMembers = computed(
  () => apiCards.value?.activeMembers ?? membersStore.activeCount,
)
const activeLoansCard = computed(
  () => apiCards.value?.activeLoans ?? loansStore.activeCount,
)
const outstandingBalance = computed(
  () => apiCards.value?.outstandingBalance ?? loansStore.outstandingBalance,
)
const delinquentCount = computed(
  () => apiCards.value?.delinquentCount ?? loansStore.delinquentCount,
)
const delinquentAtRisk = computed(() =>
  apiCards.value
    ? Number(apiCards.value.delinquentAmount) || 0
    : delinquentAmount.value,
)

const todayLong = new Date().toLocaleDateString('en-PH', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

// Local (not UTC) date string — matches how ledger dates are stored
const now = new Date()
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const thisMonthPrefix = todayStr.slice(0, 7) // 'YYYY-MM'

const dailyIncome = computed(() =>
  ledgerStore.transactions
    .filter((txn) => txn.type === 'Income' && txn.date === todayStr)
    .reduce((sum, txn) => sum + txn.amount, 0),
)

const monthIncome = computed(() =>
  ledgerStore.transactions
    .filter((txn) => txn.type === 'Income' && txn.date.startsWith(thisMonthPrefix))
    .reduce((sum, txn) => sum + txn.amount, 0),
)

const inactiveCount = computed(() => totalMembers.value - activeMembers.value)

const delinquentAmount = computed(() =>
  loansStore.loans
    .filter((loan) => loansStore.isDelinquent(loan))
    .reduce((sum, loan) => sum + loansStore.balanceOf(loan), 0),
)

// Who currently has an active loan — one row per member, largest
// balance first. The Active Loans card counts them; this lists them
// (adviser UAT: "show when member has an active loan").
const activeLoanMembers = computed(() => {
  const byMember = new Map()
  for (const loan of loansStore.loans) {
    if (loan.status !== 'Released') continue
    const key = loan.memberId
    const entry = byMember.get(key) || {
      memberId: loan.memberId,
      memberNo: loan.memberNo,
      memberName: loan.memberName,
      loanCount: 0,
      balance: 0,
    }
    entry.loanCount += 1
    entry.balance += loansStore.balanceOf(loan)
    byMember.set(key, entry)
  }
  return [...byMember.values()].sort((a, b) => b.balance - a.balance)
})

// ⚠️ Items waiting for the admin (from each module's counts)
const attentionItems = computed(() => {
  // Served by the analytics backend when reachable (same {to,text,tone} shape).
  if (apiAttention.value) return apiAttention.value
  const items = []
  // Registrations attention item — HIDDEN for v1.0 (module disabled).
  // const appCount = appsStore.pendingCount + appsStore.underReviewCount
  // if (appCount > 0) {
  //   items.push({
  //     to: '/registrations',
  //     text: `${appCount} registration${appCount > 1 ? 's' : ''} waiting for review`,
  //     tone: 'text-gray-700',
  //   })
  // }
  if (loansStore.forApprovalCount > 0) {
    items.push({
      to: '/loans',
      text: `${loansStore.forApprovalCount} loan${loansStore.forApprovalCount > 1 ? 's' : ''} awaiting committee approval`,
      tone: 'text-gray-700',
    })
  }
  if (loansStore.delinquentCount > 0) {
    items.push({
      to: '/loans',
      text: `${loansStore.delinquentCount} delinquent loan${loansStore.delinquentCount > 1 ? 's' : ''} — ${formatPeso(delinquentAmount.value)}`,
      tone: 'text-red-600 font-medium',
    })
  }
  return items
})

// Recent activity: the durable audit trail (members, loans, admins,
// ledger postings and corrections — every line names who did it)
// — newest first.
const recentActivity = computed(() => {
  // Backend-computed activity feed first ({at,label,action,kind} — same shape).
  if (apiActivity.value) return apiActivity.value
  const entries = auditStore.recent.map((row) => ({
    at: row.created_at,
    label: auditLabel(row),
    action: row.action,
    actor: row.actor,
    kind: KIND_META[row.entity_type] ? row.entity_type : 'ledger',
  }))

  // Application review timelines — HIDDEN for v1.0 (Registrations
  // module disabled; no online/app registration exists).
  // appsStore.applications.forEach((application) => {
  //   application.history?.forEach((entry) => {
  //     entries.push({
  //       at: entry.at,
  //       label: `${application.appNo} · ${application.firstName} ${application.lastName}`,
  //       action: entry.action,
  //       actor: entry.by,
  //       kind: 'application',
  //     })
  //   })
  // })

  return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)
})

// Row labels, dot colors and the timestamp format are shared with the
// Activity Log module — see utils/activity.js.

function formatPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
</script>
