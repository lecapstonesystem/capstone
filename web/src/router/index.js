import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import MembersView from '../views/MembersView.vue'
import LedgerView from '../views/LedgerView.vue'
import LoansView from '../views/LoansView.vue'
// HIDDEN for v1.0 — the Registrations module (see the routes below).
// import ApplicationsView from '../views/ApplicationsView.vue'
import NotificationsView from '../views/NotificationsView.vue'
import ReportsView from '../views/ReportsView.vue'
import AnalyticsLabView from '../views/AnalyticsLabView.vue'
import ActivityView from '../views/ActivityView.vue'
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
    // ── Registrations module — HIDDEN for v1.0 ─────────────────────────
    // The coop registers members face-to-face at the office, so the
    // portal ships without the registration queue. The view
    // (views/ApplicationsView.vue) and its store stay in the codebase.
    // To restore the module: uncomment the import above and the route
    // block below, remove the /registrations redirect, and flip
    // SHOW_REGISTRATIONS to true in AppLayout.vue, DashboardView.vue
    // and ReportsView.vue (plus the fetch in App.vue).
    // {
    //   path: '/registrations',
    //   name: 'registrations',
    //   component: ApplicationsView,
    //   meta: { requiresAuth: true },
    // },
    {
      // Old bookmarks land safely on the dashboard.
      path: '/verification',
      redirect: '/dashboard',
    },
    {
      path: '/applications',
      redirect: '/dashboard',
    },
    {
      // Typing /registrations directly also lands on the dashboard while
      // the module is hidden (drop this entry when restoring).
      path: '/registrations',
      redirect: '/dashboard',
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/analytics-lab',
      name: 'analytics-lab',
      component: AnalyticsLabView,
      meta: { requiresAuth: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: NotificationsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/activity',
      name: 'activity',
      component: ActivityView,
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
