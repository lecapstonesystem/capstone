<template>
  <div class="flex h-screen bg-gray-100 overflow-hidden">
    <!-- Sidebar -->
    <aside
      class="w-64 bg-green-800 text-white flex flex-col fixed h-full z-40 transition-transform duration-200 md:translate-x-0"
      :class="navOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Logo -->
      <div class="px-6 py-5 border-b border-green-700">
        <h1 class="text-xl font-bold">UCMS</h1>
        <p class="text-green-300 text-xs mt-0.5">Admin Portal</p>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <RouterLink
          to="/dashboard"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/dashboard'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Dashboard
        </RouterLink>

        <RouterLink
          to="/members"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/members'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Members
        </RouterLink>

        <RouterLink
          to="/ledger"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/ledger'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Ledger
        </RouterLink>

        <RouterLink
          to="/loans"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/loans'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Loans
        </RouterLink>

        <!-- Registrations — HIDDEN for v1.0 (face-to-face only; no
             online/app registration). Remove these comment markers to
             restore the module entry. -->
        <!-- <RouterLink
          to="/registrations"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/registrations'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Registrations
        </RouterLink> -->

        <RouterLink
          to="/reports"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/reports'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Reports
        </RouterLink>

        <RouterLink
          to="/notifications"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/notifications'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Notifications
        </RouterLink>

        <RouterLink
          to="/activity"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/activity'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Activity Log
        </RouterLink>

        <RouterLink
          to="/admins"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/admins'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Admin Accounts
        </RouterLink>
      </nav>

      <!-- Logout -->
      <div class="px-4 py-4 border-t border-green-700">
        <button
          @click="logoutOpen = true"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-green-200 hover:bg-green-700 hover:text-white transition duration-200 w-full"
        >
          Logout
        </button>
      </div>
    </aside>

    <!-- Backdrop behind the slide-in sidebar (phones/tablets only) -->
    <Transition name="fade">
      <div
        v-if="navOpen"
        class="fixed inset-0 bg-black/50 z-30 md:hidden"
        @click="navOpen = false"
      ></div>
    </Transition>

    <!-- Main Content — min-w-0 lets this column shrink below the
    data tables' min-width, so overflow-x-auto scrolls the table
    sideways instead of widening the whole page (mobile). -->
    <div class="flex-1 min-w-0 flex flex-col md:ml-64">
      <!-- Top Navbar -->
      <header
        class="bg-white shadow-sm px-4 md:px-6 py-4 flex items-center gap-3 sticky top-0 z-20"
      >
        <button
          class="md:hidden text-gray-600 hover:text-gray-800 shrink-0"
          aria-label="Open menu"
          @click="navOpen = true"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 class="text-lg font-semibold text-gray-700 capitalize flex-1 min-w-0 truncate">
          {{ currentPageTitle }}
        </h2>
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          >
            {{ avatarInitials }}
          </div>
          <span class="hidden sm:inline text-sm text-gray-600 font-medium">
            {{ auth.displayName }}
          </span>
          <span
            v-if="auth.isDeveloper"
            class="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 px-2 py-0.5 rounded-full"
          >
            Developer
          </span>
        </div>
      </header>

      <!-- Page Content -->
      <main class="flex-1 min-w-0 overflow-y-auto p-4 md:p-6">
        <slot />
      </main>
    </div>

    <!-- Logout confirmation — nothing ends a session by a single click -->
    <Transition name="dialog">
      <div
        v-if="logoutOpen"
        class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        @click.self="logoutOpen = false"
      >
        <div class="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
          <h2 class="text-lg font-semibold text-gray-800">Log out?</h2>
          <p class="text-sm text-gray-500 mt-1">
            You will be returned to the login screen, and any unsaved changes in this window will be
            discarded.
          </p>
          <div class="flex justify-end gap-3 mt-5">
            <button
              @click="logoutOpen = false"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
            >
              Cancel
            </button>
            <button
              @click="handleLogout"
              :disabled="loggingOut"
              class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ loggingOut ? 'Logging out...' : 'Log out' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useToastsStore } from '../stores/toasts'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const toasts = useToastsStore()

// Phone/tablet: the sidebar slides in over the page instead of
// taking permanent width. Any navigation closes it.
const navOpen = ref(false)
watch(
  () => route.path,
  () => {
    navOpen.value = false
  },
)

const currentPageTitle = computed(() => {
  const titles = {
    '/dashboard': 'Dashboard',
    '/members': 'Members',
    '/ledger': 'Ledger',
    '/loans': 'Loans',
    // '/registrations' title entry — HIDDEN with the module for v1.0.
    // '/registrations': 'Registrations',
    '/reports': 'Reports',
    '/notifications': 'Notifications',
    '/admins': 'Admin Accounts',
  }
  return titles[route.path] || 'Dashboard'
})

// First + last initial of the logged-in admin (from their admin row)
const avatarInitials = computed(() => {
  const parts = auth.displayName.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) || 'A'
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
})

// Confirm-first logout — the modal opens from the sidebar button.
const logoutOpen = ref(false)
const loggingOut = ref(false)

const handleLogout = async () => {
  if (loggingOut.value) return
  loggingOut.value = true
  await auth.signOut()
  logoutOpen.value = false
  loggingOut.value = false
  router.push('/login')
  toasts.success('Signed out.')
}
</script>
