<template>
  <RouterView />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useMembersStore } from './stores/members'
import { useLoansStore } from './stores/loans'
import { useLedgerStore } from './stores/ledger'
import { useApplicationsStore } from './stores/applications'
import { useAdminsStore } from './stores/admins'
import { useAuditStore } from './stores/audit'

/**
 * Fresh-data layer. Every store fetches once on first use and then
 * caches for the rest of the session, so writes made outside this tab
 * (SQL editor, the teammate's Flutter app) stayed invisible until F5.
 *
 * Refresh all data stores whenever the tab regains focus (switching
 * back from the Supabase dashboard — including side-by-side windows,
 * which is why both `focus` and `visibilitychange` are wired) or the
 * route changes. The refresh is deliberately quiet:
 *   - no view renders a store's `loading`, so tables update in place
 *     without spinners
 *   - search / filters / sort / page are separate refs the fetch
 *     never touches, so you stay exactly where you were
 * Guarded to signed-in data pages so it never instantiates a data
 * store without a session (login and reset screens are skipped).
 */
const router = useRouter()
const auth = useAuthStore()

let timer = null

function refresh() {
  if (!auth.isAuthenticated) return
  if (!router.currentRoute.value.meta.requiresAuth) return

  // Each useStore() call is a no-op once the store exists; the first
  // refresh of a session may double-fetch with the store's own
  // load-once call — idempotent reads, harmless.
  useMembersStore().fetchMembers()
  useLoansStore().fetchLoans()
  useLedgerStore().fetchLedger()
  useApplicationsStore().fetchApplications()
  useAdminsStore().fetchAdmins()
  useAuditStore().fetchRecent()
}

function scheduleRefresh() {
  clearTimeout(timer)
  timer = setTimeout(refresh, 300)
}

function onTabVisible() {
  if (document.visibilityState === 'visible') scheduleRefresh()
}

let firstNavigation = true
router.afterEach(() => {
  // The boot navigation skips: every store self-fetches on first use.
  if (firstNavigation) {
    firstNavigation = false
    return
  }
  scheduleRefresh()
})

onMounted(() => {
  document.addEventListener('visibilitychange', onTabVisible)
  window.addEventListener('focus', scheduleRefresh)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onTabVisible)
  window.removeEventListener('focus', scheduleRefresh)
  clearTimeout(timer)
})
</script>
