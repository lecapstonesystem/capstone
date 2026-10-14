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
 *     not yet linked by 07_seed_admin.sql sees zero rows — login is
 *     refused with a clear message instead of opening empty screens.
 *   - The session survives refreshes (getSession) and stays in sync
 *     across tabs/components via onAuthStateChange.
 *   - profile: the admin row (name, role) shown in the layout header.
 *
 * Forced password change on first login (mustChangePassword) arrives
 * with the Admins module swap — stored in user metadata per admins.js.
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const profile = ref(null)

  const isAuthenticated = computed(() => !!session.value)
  const displayName = computed(() => profile.value?.name || session.value?.user?.email || 'Admin')
  const role = computed(() => profile.value?.role || '')

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
      .select('admin_id, name, role, email')
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
      // Authenticated but no admin row: sign straight back out.
      await supabase.auth.signOut()
      session.value = null
      profile.value = null
      return {
        ok: false,
        message:
          'This account is not linked to a portal admin yet (see database/07_seed_admin.sql).',
      }
    }
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
    ensureInit,
    signIn,
    signOut,
  }
})
