import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import MembersView from '../views/MembersView.vue'
import LedgerView from '../views/LedgerView.vue'
import LoansView from '../views/LoansView.vue'
import ApplicationsView from '../views/ApplicationsView.vue'
import ReportsView from '../views/ReportsView.vue'
import AdminsView from '../views/AdminsView.vue'

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
  ],
})

// Redirect to login if not authenticated
router.beforeEach((to, from, next) => {
  const isLoggedIn = localStorage.getItem('ucms-auth')
  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login')
  } else {
    next()
  }
})

export default router
