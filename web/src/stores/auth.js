import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { setPersistMode } from '../lib/authStorage'

/**
 * Auth store — real Supabase Auth for the admin portal.
 *
 * Replaces the old localStorage 'ucms-auth' flag, which anyone could
 * forge from devtools:
 *   - signIn() authenticates, then loads the linked public.admin row.
 *     That read goes through 06's is_admin() RLS policy, so an account
 *     that is disabled or not yet linked by 07_seed_admin.sql sees zero
 *     rows — login is refused with a clear message instead of opening
 *     empty screens.
 *   - The session survives refreshes (getSession) and stays in sync
 *     across tabs/components via onAuthStateChange. It lives in
 *     tab-only storage by default — closing the browser signs out —
 *     and moves to permanent storage when the login page's "keep me
 *     signed in" box is checked (lib/authStorage.js).
 *   - profile: the admin row (name, role) shown in the layout header.
 *
 * mustChangePassword comes from the admin row itself (migration 16):
 * accounts created or reset must replace the temporary/recovery
 * password on first login. The router holds every other page hostage
 * until changeOwnPassword() clears the flag.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const profile = ref(null)

  const isAuthenticated = computed(() => !!session.value)
  const displayName = computed(() => profile.value?.name || session.value?.user?.email || 'Admin')
  const role = computed(() => profile.value?.role || '')
  const isDeveloper = computed(() => role.value === 'Developer')
  const mustChangePassword = computed(() => !!profile.value?.must_change_password)

  let initPromise = null

  /** Idempotent: first router navigation awaits it once. */
  function ensureInit() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      // Drop the pre-Supabase flag if it's still sitting in storage.
      localStorage.removeItem('ucms-auth')
      // Subscribe BEFORE touching the session: opening an emailed
      // reset link exchanges the recovery token while the client
      // finishes booting, and that notification fires during the
      // first getSession() — a listener attached afterwards would
      // never see PASSWORD_RECOVERY, leaving last_login un-stamped
      // on exactly the reset-link login path it exists to cover.
      // Inside this callback only assign refs — awaiting supabase.auth
      // calls here can deadlock the client. Profile fetch is fire-and-forget.
      supabase.auth.onAuthStateChange((event, next) => {
        session.value = next
        if (!next) {
          profile.value = null
        } else if (!profile.value) {
          loadProfile()
        }
        // Real sign-ins only: SIGNED_IN = password form,
        // PASSWORD_RECOVERY = emailed reset link. Refreshes arrive
        // as INITIAL_SESSION / TOKEN_REFRESHED and must not
        // rewrite the timestamp.
        if (next && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')) {
          stampLastLogin()
        }
      })
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session) await loadProfile()
    })()
    return initPromise
  }

  async function loadProfile() {
    const userId = session.value?.user?.id
    if (!userId) return false
    const { data, error } = await supabase
      .from('admin')
      .select('admin_id, name, role, email, must_change_password, login_enabled')
      .eq('auth_uid', userId)
      .maybeSingle()
    // An RLS error looks identical to "not linked": both mean no access.
    profile.value = error ? null : data
    return !error && !!data
  }

  /**
   * Stamp the admin row's last_login. Called from the auth listener
   * on every real sign-in — password form and emailed reset link
   * alike (the recovery path establishes its session directly and
   * never passes through signIn()). Waits for the profile when it
   * isn't loaded yet; fire-and-forget — a failed write here must
   * never block signing in.
   */
  function stampLastLogin() {
    const write = () => {
      if (!profile.value) return
      supabase
        .from('admin')
        .update({ last_login: new Date().toISOString() })
        .eq('admin_id', profile.value.admin_id)
        .then(({ error }) => {
          if (error) console.error('[UCMS] could not record last login:', error)
        })
    }
    if (profile.value) write()
    else loadProfile().then(write)
  }

  async function signIn(email, password, staySignedIn = false) {
    // Record where the session should be kept BEFORE Supabase writes
    // it: tab-only storage by default, permanent when requested.
    setPersistMode(staySignedIn)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return { ok: false, message: mapAuthError(error) }

    session.value = data.session
    const provisioned = await loadProfile()
    if (!provisioned) {
      // Authenticated but no admin row (disabled or not linked):
      // sign straight back out.
      await supabase.auth.signOut()
      session.value = null
      profile.value = null
      return {
        ok: false,
        message:
          'This login cannot open the portal. It may be disabled, or it is not set up as an admin account yet. Ask your system administrator.',
      }
    }
    // The last-login stamp happens in onAuthStateChange (SIGNED_IN)
    // so both this path and the emailed reset link are covered.
    return { ok: true }
  }

  /**
   * Change the signed-in admin's own password. updateUser() edits the
   * current session's user, so this needs no service key. Called by
   * the forced first-login change and the emailed reset link.
   */
  async function changeOwnPassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      const message = String(error?.message || '')
      const lowered = message.toLowerCase()
      // updateUser() with no usable session happens when an emailed
      // reset link is invalid or expired.
      if (lowered.includes('session') || lowered.includes('not authenticated')) {
        return { ok: false, invalidLink: true }
      }
      if (lowered.includes('different from the old')) {
        return { ok: false, message: 'Choose a password different from your old one.' }
      }
      if (lowered.includes('password')) {
        return { ok: false, message: 'That password was not accepted. Choose a different one.' }
      }
      return { ok: false, message: 'Could not update the password. Please try again.' }
    }

    // Clear the must-change flag on the admin row. Matches by auth_uid
    // so it works both for a signed-in first login and for the recovery
    // session created by the reset link.
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData?.session?.user?.id
    if (uid) {
      const { error: flagError } = await supabase
        .from('admin')
        .update({ must_change_password: false })
        .eq('auth_uid', uid)
      if (flagError) console.error('[UCMS] could not clear must-change-password flag:', flagError)
    }
    if (profile.value) profile.value.must_change_password = false
    return { ok: true }
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
  }

  function mapAuthError(error) {
    const msg = String(error?.message || '')
    if (msg.includes('Invalid login credentials')) {
      return 'Invalid email or password. Please try again.'
    }
    if (msg.includes('Email not confirmed')) {
      return 'This account still needs email confirmation.'
    }
    if (msg.toLowerCase().includes('rate limit') || msg.includes('too many')) {
      return 'Too many attempts. Wait a moment and try again.'
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return 'Cannot reach the server. Check your internet connection.'
    }
    return 'Could not log in. Please try again.'
  }

  return {
    session,
    profile,
    isAuthenticated,
    displayName,
    role,
    isDeveloper,
    mustChangePassword,
    ensureInit,
    signIn,
    signOut,
    changeOwnPassword,
  }
})
