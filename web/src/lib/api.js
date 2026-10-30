/**
 * Tiny client for the Python analytics backend (FastAPI).
 *
 * Everything Supabase-direct stays in the Pinia stores. Anything that is
 * *compute* (forecasts, risk scoring, summary one-pager, report files)
 * goes through here, so components never embed analytics math.
 *
 * Configure via `.env` (see `.env.example`):
 *   VITE_API_URL  e.g. http://localhost:8000  (dev) or the deployed URL
 *
 * Throws a plain-English Error when unconfigured or when the backend
 * answers non-2xx — views can catch it and fall back to store data.
 */
import { useAuthStore } from '../stores/auth' // 1. IMPORTANT: Adjust this path to match where your Pinia auth store lives!

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function call(path, options = {}) {
  if (!base) {
    throw new Error(
      'Analytics API not configured. Set VITE_API_URL in web/.env, then restart npm run dev.',
    )
  }

  // 2. Dynamically extract the active Supabase JWT access token from Pinia
  const authStore = useAuthStore()
  const sessionToken = authStore.session?.access_token || authStore.token || ''

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      // 3. Inject token into standard Authorization Bearer header
          ...(sessionToken ? { 'Authorization': 'Bearer ' + sessionToken } : {}),

      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Analytics API ${res.status} on ${path}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return res.blob() // report downloads (Excel)
}

async function post(path, body) {
  return call(path, { method: 'POST', body: JSON.stringify(body || {}) })
}

export const analyticsApi = {
  // Dashboard KPIs (mirrors the Python dashboard_metrics block)
  dashboard: () => call('/dashboard'),
  // Delinquent Accounts card + Reports delinquent table
  delinquent: (limit = 20) => call(`/risk/delinquent?limit=${limit}`),
  // Reports Financial Summary one-pager
  summary: () => call('/reports/summary'),
  // Term charts (forecast section)
  byTerm: () => call('/analytics/by-term'),
  // Forecast series (existing endpoints)
  disbursements: (months = 6) => call(`/forecast/disbursements?months=${months}`),
  collections: (months = 6) => call(`/forecast/collections?months=${months}`),
  // Single-member risk badge (LoansView / MembersView)
  risk: (member) => call(`/risk/${encodeURIComponent(member)}`),
  // Portal resources — frontend-shaped rows (mirror the Pinia stores)
  portalMembers: () => call('/portal/members'),
  portalLoans: (status = 'All', loanType = 'All') =>
    call(`/portal/loans?status=${encodeURIComponent(status)}&loan_type=${encodeURIComponent(loanType)}`),
  portalDashboard: () => call('/portal/dashboard'),
  portalApplications: () => call('/portal/applications'),
  // Risk + eligibility + applications (Loan Management module)
  eligibility: (payload) => post('/eligibility', payload),
  apply: (payload) => post('/applications', payload),
  review: (appId, payload) => post(`/applications/${encodeURIComponent(appId)}/review`, payload),
  // Excel report download + receipt OCR check
  report: () => call('/report'),
  receiptVerify: (payload) => post('/receipt/verify', payload),
  // ---- Analytics Pack v2 — prediction, backtesting, member behaviour ----
  backtest: (holdout = 6) => call(`/analytics/backtest?holdout=${holdout}`),
  forecastV2: (months = 6, holdout = 6) =>
    call(`/analytics/forecast?months=${months}&holdout=${holdout}`),
  seasonality: () => call('/analytics/seasonality'),
  memberCycles: (minLoans = 2) => call(`/analytics/members/cycles?min_loans=${minLoans}`),
  propensity: (top = 20, horizonDays = 90) =>
    call(`/analytics/members/propensity?top=${top}&horizon_days=${horizonDays}`),
  reliability: () => call('/analytics/reliability'),
  collectionsV2: (months = 6) => call(`/analytics/collections?months=${months}`),
  insights: (holdout = 6) => call(`/analytics/insights?holdout=${holdout}`),
  
  // 4. FIXING CHART URL LEAKS: 
  // We completely strip the static "?key=" string parameter. Your UI components must 
  // now query this URL using a safe fetch wrapper instead of raw HTML <img src="..."> tags.
  chartUrl: (kind) => `${base}/charts/${kind}.png`,
}
