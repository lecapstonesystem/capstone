import { supabase } from './supabase'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function call(path, { asBlob = false } = {}) {
  if (!base) {
    throw new Error('Analytics API not configured. Set VITE_API_URL in web/.env and restart Vite.')
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error('Could not read your sign-in session. Please sign in again.')
  }
  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new Error('Your sign-in session is missing. Please sign in again.')
  }

  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your sign-in session expired. Please sign in again.')
    }
    if (response.status === 403) {
      throw new Error('This account is not enabled for the admin portal.')
    }
    throw new Error(`Analytics API request failed (${response.status}) for ${path}.`)
  }

  return asBlob ? response.blob() : response.json()
}

export const analyticsApi = {
  backtest: (holdout = 6) => call(`/analytics/backtest?holdout=${holdout}`),
  forecast: (months = 6, holdout = 6) =>
    call(`/analytics/forecast?months=${months}&holdout=${holdout}`),
  seasonality: () => call('/analytics/seasonality'),
  memberCycles: (minLoans = 2) => call(`/analytics/members/cycles?min_loans=${minLoans}`),
  propensity: (top = 20, horizonDays = 90) =>
    call(`/analytics/members/propensity?top=${top}&horizon_days=${horizonDays}`),
  reliability: () => call('/analytics/reliability'),
  collections: (months = 6) => call(`/analytics/collections?months=${months}`),
  insights: (holdout = 6) => call(`/analytics/insights?holdout=${holdout}`),
  chart: (kind) => call(`/charts/${kind}.png`, { asBlob: true }),
}
