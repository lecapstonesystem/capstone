<template>
  <div class="flex h-screen bg-gray-100 overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-64 bg-green-800 text-white flex flex-col fixed h-full z-10">
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

        <RouterLink
          to="/applications"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200"
          :class="
            $route.path === '/applications'
              ? 'bg-green-600 text-white'
              : 'text-green-200 hover:bg-green-700 hover:text-white'
          "
        >
          Applications
        </RouterLink>

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
          @click="handleLogout"
          class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-green-200 hover:bg-green-700 hover:text-white transition duration-200 w-full"
        >
          Logout
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col ml-64">
      <!-- Top Navbar -->
      <header
        class="bg-white shadow-sm px-6 py-4 flex items-center justify-between sticky top-0 z-10"
      >
        <h2 class="text-lg font-semibold text-gray-700 capitalize">
          {{ currentPageTitle }}
        </h2>
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-bold"
          >
            A
          </div>
          <span class="text-sm text-gray-600 font-medium">Admin</span>
        </div>
      </header>

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const currentPageTitle = computed(() => {
  const titles = {
    '/dashboard': 'Dashboard',
    '/members': 'Members',
    '/ledger': 'Ledger',
    '/loans': 'Loans',
    '/applications': 'Applications',
    '/reports': 'Reports',
    '/admins': 'Admin Accounts',
  }
  return titles[route.path] || 'Dashboard'
})

const handleLogout = () => {
  localStorage.removeItem('ucms-auth')
  router.push('/login')
}
</script>
