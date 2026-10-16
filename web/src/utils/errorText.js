/**
 * errorText.js — turns database errors into sentences a coop staff
 * member can understand.
 *
 * Every store funnels failures through errorMessage(); the raw error
 * is always logged to the browser console (F12 → Console) so the
 * developer keeps the full technical detail. Unknown errors fall
 * back to a generic sentence — raw database text never reaches the
 * screen.
 *
 * Signatures covered (Postgres / PostgREST codes + message checks):
 *   network failure           — offline / server unreachable
 *   PGRST204, 42P01, 42883    — missing table/column = setup step
 *                               not run (migration window)
 *   42501, PGRST301, RLS      — not allowed / session expired
 *   23505                     — duplicate record
 *   23503                     — record linked to other data
 *   23502                     — required field missing
 *   23514                     — value rejected by a rule
 *   PGRST116                  — record not found (changed elsewhere)
 */

// Message-only checks (these errors arrive without a useful code)
const NETWORK_MARKERS = [
  'Failed to fetch',
  'fetch failed',
  'NetworkError',
  'Load failed',
  'ERR_NETWORK',
  'ERR_INTERNET',
]

function includesAny(text, snippets) {
  return snippets.some((snippet) => text.includes(snippet))
}

export function errorMessage(error) {
  // Full technical detail stays available for the developer
  console.error('[UCMS] database error:', error)

  const code = String(error?.code || '')
  const message = String(error?.message || error || '')

  if (includesAny(message, NETWORK_MARKERS)) {
    return 'Cannot reach the server. Check the internet connection and try again.'
  }
  if (
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42883' ||
    message.includes('schema cache')
  ) {
    return 'This feature is not fully set up yet — the system database is missing an update. Contact your system administrator.'
  }
  if (code === '42501' || code === 'PGRST301' || message.includes('row-level security')) {
    return 'Your account is not allowed to do this. Sign out and sign in again, or contact your system administrator.'
  }
  if (code === '23505' || message.includes('duplicate key')) {
    return 'This record already exists in the system — check for a duplicate before adding it again.'
  }
  if (code === '23503' || message.includes('foreign key')) {
    return 'This record is linked to other data (loans, payments, or members) and cannot be removed.'
  }
  if (code === '23502' || message.includes('violates not-null constraint')) {
    return 'A required field was missing. Fill in all the required fields and try again.'
  }
  if (code === '23514') {
    return 'Some information entered is not accepted by the system. Review the values and try again.'
  }
  if (code === 'PGRST116') {
    return 'The record could not be found — it may have been changed on another screen. Refresh the page and try again.'
  }
  return 'Something went wrong and the action was not completed. Please try again.'
}
