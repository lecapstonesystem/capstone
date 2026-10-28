/**
 * Storage adapter for Supabase Auth with a "keep me signed in" switch.
 *
 * Default (session mode): the session lives in sessionStorage, which
 * the browser throws away when the tab or window closes — a shared
 * office computer gets signed out automatically, which is what you
 * want when the portal is left open in a tab.
 *
 * Keep-me-signed-in: the login page calls setPersistMode(true), which
 * flips a flag in localStorage and the session is kept there instead,
 * surviving browser restarts until the admin signs out.
 *
 * Sign-out clears BOTH stores, and writing to one store removes the
 * stale copy from the other, so an old session can never come back
 * from the dead.
 */

const MODE_KEY = 'ucms:stay-signed-in'

function primary() {
  // Only an explicit opt-in gets the permanent store.
  return localStorage.getItem(MODE_KEY) ? localStorage : sessionStorage
}

function secondary() {
  return primary() === localStorage ? sessionStorage : localStorage
}

export const authStorage = {
  getItem(key) {
    return primary().getItem(key)
  },
  setItem(key, value) {
    secondary().removeItem(key)
    primary().setItem(key, value)
  },
  removeItem(key) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

/** Record the login page's "keep me signed in" choice (before signing in). */
export function setPersistMode(staySignedIn) {
  if (staySignedIn) localStorage.setItem(MODE_KEY, '1')
  else localStorage.removeItem(MODE_KEY)
}

/** The saved choice — used to pre-check the login checkbox. */
export function getPersistMode() {
  return Boolean(localStorage.getItem(MODE_KEY))
}
