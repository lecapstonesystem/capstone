import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import MembersView from '../views/MembersView.vue'
import LedgerView from '../views/LedgerView.vue'
import LoansView from '../views/LoansView.vue'
import ApplicationsView from '../views/ApplicationsView.vue'
import ReportsView from '../views/ReportsView.vue'
import AdminsView from '../views/AdminsView.vue'
import ChangePasswordView from '../views/ChangePasswordView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/members',
      name: 'members',
      component: MembersView,
      meta: { requiresAuth: true },
    },
    {
      path: '/ledger',
      name: 'ledger',
      component: LedgerView,
      meta: { requiresAuth: true },
    },
    {
      path: '/loans',
      name: 'loans',
      component: LoansView,
      meta: { requiresAuth: true },
    },
    {
      path: '/applications',
      name: 'applications',
      component: ApplicationsView,
      meta: { requiresAuth: true },
    },
    {
      // old URL still works — renamed from Verification Queue
      path: '/verification',
      redirect: '/applications',
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admins',
      name: 'admins',
      component: AdminsView,
      meta: { requiresAuth: true },
    },
    {
      // Forced first-login change — the router guard sends any admin
      // whose row still has must_change_password here and nowhere else.
      path: '/first-login',
      name: 'first-login',
      component: ChangePasswordView,
      meta: { requiresAuth: true, mode: 'first-login' },
    },
    {
      // Landing page of Supabase's emailed password-reset link.
      // Public: the recovery session arrives with the link itself.
      path: '/reset-password',
      name: 'reset-password',
      component: ChangePasswordView,
      meta: { mode: 'recovery' },
    },
  ],
})

// Redirect to login if the Supabase session is missing.
// ensureInit() resolves getSession() once, so the first navigation
// never races the auth state; stale localStorage flags are ignored.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureInit()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if (to.path === '/login' && auth.isAuthenticated) {
    return auth.mustChangePassword ? '/first-login' : '/dashboard'
  }
  // Hold every other page until a temporary password is replaced.
  if (auth.isAuthenticated && auth.mustChangePassword && to.name !== 'first-login') {
    return '/first-login'
  }
  return true
})

export default router
