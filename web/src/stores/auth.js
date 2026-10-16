import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

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
 *     across tabs/components via onAuthStateChange.
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
  const mustChangePassword = computed(() => !!profile.value?.must_change_password)

  let initPromise = null

  /** Idempotent: first router navigation awaits it once. */
  function ensureInit() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      // Drop the pre-Supabase flag if it's still sitting in storage.
      localStorage.removeItem('ucms-auth')
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session) await loadProfile()
      // Inside this callback only assign refs — awaiting supabase.auth
      // calls here can deadlock the client. Profile fetch is fire-and-forget.
      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
        if (!next) {
          profile.value = null
        } else if (!profile.value) {
          loadProfile()
        }
      })
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

  async function signIn(email, password) {
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
    // Stamp the last-login time. Fire-and-forget — a failed write here
    // must never block signing in.
    supabase
      .from('admin')
      .update({ last_login: new Date().toISOString() })
      .eq('admin_id', profile.value.admin_id)
      .then(({ error: stampError }) => {
        if (stampError) console.error('[UCMS] could not record last login:', stampError)
      })
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
    mustChangePassword,
    ensureInit,
    signIn,
    signOut,
    changeOwnPassword,
  }
})
