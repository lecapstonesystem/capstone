import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { useAuthStore } from './auth'
import { randomPassword } from '../utils/password'
import { toggleSort, sortRows } from '../utils/tableSort'

/**
 * Admins store — live Supabase (public.admin, linked to Supabase Auth
 * by auth_uid from 06_admin_access.sql).
 *
 * Roles:
 *   Super Admin — can manage admin accounts (07 seeded the first one)
 *   Admin       — runs the system, cannot manage accounts
 *
 * Rules enforced here:
 *   - No self-lockout: an admin cannot disable their own login
 *   - The last Super Admin cannot be demoted
 *   - Passwords are handed over face-to-face as a one-time temporary
 *     password; the recipient must change it on first login
 *
 * Why account actions look different from the old mock:
 *   - The frontend only holds the ANON key, never the service key, so
 *     supabase.auth.admin.* is off the table. Creating a login uses
 *     supabase.auth.signUp() instead — the one frontend path that can
 *     create an Auth user.
 *   - signUp() with auto-confirm ON returns a session for the NEW user
 *     and swaps it in, which would silently sign the acting Super Admin
 *     out. addAdmin() therefore saves the current session first and
 *     restores it right after, so every database write still runs as
 *     the Super Admin.
 *   - Resetting someone else's password cannot set a value directly
 *     (that needs the service key). Supabase emails a reset link to
 *     that admin's address instead; they choose the new password
 *     themselves on /reset-password.
 *   - Email is the login identity and is set at creation. It is not
 *     editable here because changing a Supabase Auth email needs the
 *     service key too.
 *   - Temporary passwords are never stored. One is generated at
 *     creation, shown once in the portal, and kept only in this
 *     browser session.
 *
 * must_change_password / login_enabled live as columns on admin
 * (migration 16). login_enabled is enforced inside is_admin(), so
 * disabling a login revokes database access immediately.
 */

const SELECT_COLUMNS =
  'admin_id, name, role, email, login_enabled, must_change_password, last_login'

export const useAdminsStore = defineStore('admins', () => {
  const admins = ref([])
  const search = ref('')
  const roleFilter = ref('All')
  const loading = ref(false)
  const lastError = ref('')

  const auth = useAuthStore()

  const sortKey = ref('name')
  const sortDir = ref('asc')

  /** True for the currently signed-in admin — the portal blocks
   *  self-lockout (can't disable your own login). */
  const currentAdminId = computed(() => auth.profile?.admin_id ?? null)

  const superAdminCount = computed(
    () => admins.value.filter((admin) => admin.role === 'Super Admin').length,
  )

  const currentAdmin = computed(
    () => admins.value.find((admin) => admin.id === currentAdminId.value) || null,
  )

  function emailTaken(email, exceptId = null) {
    const normalized = String(email || '')
      .trim()
      .toLowerCase()
    return admins.value.some(
      (admin) => admin.id !== exceptId && admin.email.toLowerCase() === normalized,
    )
  }

  const ROLE_RANK = { 'Super Admin': 0, Admin: 1 }

  const filteredAdmins = computed(() => {
    const query = search.value.toLowerCase().trim()

    let rows = admins.value.filter((admin) => {
      const matchesSearch =
        !query ||
        `${admin.firstName} ${admin.lastName}`.toLowerCase().includes(query) ||
        admin.email.toLowerCase().includes(query)
      const matchesRole = roleFilter.value === 'All' || admin.role === roleFilter.value
      return matchesSearch && matchesRole
    })

    const accessors = {
      name: (admin) => `${admin.firstName} ${admin.lastName}`.toLowerCase(),
      email: (admin) => admin.email.toLowerCase(),
      role: (admin) => ROLE_RANK[admin.role] ?? 99,
      login: (admin) => (admin.account.loginEnabled ? 1 : 0),
      lastLogin: (admin) => admin.lastLogin || '',
    }

    return sortRows(rows, sortKey.value, sortDir.value, accessors)
  })

  function setSort(key) {
    const result = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = result.key
    sortDir.value = result.dir
  }

  function sortState(key) {
    return sortKey.value === key ? sortDir.value : null
  }

  /**
   * Split the single `name` column into first/last for the form.
   * Everything after the first word is the last name (handles
   * two-word surnames like "De Vera").
   */
  function splitName(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (parts.length <= 1) return { first: parts[0] || '', last: '' }
    return { first: parts[0], last: parts.slice(1).join(' ') }
  }

  function rowToAdmin(row) {
    const { first, last } = splitName(row.name)
    return {
      id: row.admin_id,
      firstName: first,
      lastName: last,
      email: row.email || '',
      role: row.role || 'Admin',
      account: {
        loginEnabled: row.login_enabled !== false,
        mustChangePassword: !!row.must_change_password,
        // Never persisted — set once in memory right after creation.
        tempPassword: null,
      },
      lastLogin: row.last_login ? ensureUtc(row.last_login) : null,
      // Session-only trail. Wiring audit_log (durable who-did-what) is
      // a separate module — same state the Members page is in.
      history: [],
    }
  }

  /** `timestamp without time zone` comes back as naive UTC — mark it. */
  function ensureUtc(value) {
    if (!value || typeof value !== 'string') return value
    return /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`
  }

  function actor() {
    return auth.profile?.name || 'Signed-in admin'
  }

  function logAction(admin, action) {
    admin.history.unshift({
      at: new Date().toISOString(),
      action,
      by: actor(),
    })
  }

  async function fetchAdmins() {
    loading.value = true
    lastError.value = ''
    try {
      const { data, error } = await supabase
        .from('admin')
        .select(SELECT_COLUMNS)
        .order('admin_id', { ascending: true })
      if (error) throw error
      admins.value = (data || []).map(rowToAdmin)
    } catch (error) {
      lastError.value = errorMessage(error)
      admins.value = []
    } finally {
      loading.value = false
    }
  }

  fetchAdmins()

  /**
   * Create a new admin account.
   *
   * 1. Save the acting Super Admin's session.
   * 2. signUp() the new login with a one-time temporary password.
   * 3. Restore the saved session (auto-confirm swapped it for the
   *    new user's).
   * 4. Insert the admin row linked to the new Auth user — the insert
   *    runs as the Super Admin, so RLS passes.
   *
   * The returned admin carries the temporary password in memory only;
   * it is never written to the database.
   */
  async function addAdmin({ firstName, lastName, email, role }) {
    lastError.value = ''
    const normalized = String(email || '')
      .trim()
      .toLowerCase()

    if (!firstName.trim() || !lastName.trim()) {
      return { ok: false, message: 'Enter both the first and last name.' }
    }
    if (!normalized.includes('@') || !normalized.includes('.')) {
      return { ok: false, message: 'Enter a valid email address.' }
    }
    if (emailTaken(normalized)) {
      return { ok: false, message: 'An admin with that email already exists.' }
    }

    const tempPassword = randomPassword()

    // 1. Remember the acting admin's session so we can put it back.
    const { data: sessionData } = await supabase.auth.getSession()
    const previous = sessionData?.session

    // 2. Create the Supabase Auth login.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalized,
      password: tempPassword,
    })

    if (signUpError) {
      const message = String(signUpError.message || '').toLowerCase()
      if (message.includes('already registered') || message.includes('already been registered')) {
        return { ok: false, message: 'An account with that email already exists.' }
      }
      if (message.includes('rate limit')) {
        return {
          ok: false,
          message: 'Too many attempts. Wait a minute, then try again.',
        }
      }
      return {
        ok: false,
        message:
          'Could not create the login. Make sure "Confirm email" is turned off in the Supabase dashboard (Authentication → Providers → Email), then try again.',
      }
    }

    const newUser = signUpData?.user
    // Enumeration guard: Supabase answers an existing email with a
    // user object that has no identities instead of an error.
    if (!newUser || (Array.isArray(newUser.identities) && newUser.identities.length === 0)) {
      return { ok: false, message: 'An account with that email already exists.' }
    }

    // 3. Put the Super Admin's session back. signUp() only swaps the
    //    session when auto-confirm is on; restoring unconditionally is
    //    harmless and covers both settings.
    if (previous && signUpData?.session) {
      try {
        await supabase.auth.setSession({
          access_token: previous.access_token,
          refresh_token: previous.refresh_token,
        })
      } catch (error) {
        console.error('[UCMS] could not restore the admin session after signup:', error)
        return {
          ok: false,
          message:
            'The login was created but your session could not be restored. Sign out, sign back in, then add the admin row again.',
        }
      }
    }

    // 4. Link the new Auth user to an admin row. must_change_password
    //    forces the temporary password to be replaced on first login.
    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const { data: row, error: insertError } = await supabase
      .from('admin')
      .insert({
        name: fullName,
        role,
        email: normalized,
        created_at: new Date().toISOString(),
        auth_uid: newUser.id,
        login_enabled: true,
        must_change_password: true,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (insertError) {
      return {
        ok: false,
        message: `${errorMessage(insertError)} The login itself was created — ask your system administrator to link it to an admin row.`,
      }
    }

    const admin = rowToAdmin(row)
    admin.account.tempPassword = tempPassword
    logAction(admin, `Admin account created (${role}) — temporary password issued`)
    admins.value.push(admin)
    return { ok: true, admin }
  }

  /**
   * Update an admin's name and role. Email is intentionally absent:
   * changing the login identity needs the service key, so it is set
   * at creation only.
   */
  async function updateAdmin(id, { firstName, lastName, role }) {
    lastError.value = ''
    const admin = admins.value.find((entry) => entry.id === id)
    if (!admin) {
      return { ok: false, message: 'That admin account no longer exists.' }
    }
    if (!firstName.trim() || !lastName.trim()) {
      return { ok: false, message: 'Enter both the first and last name.' }
    }
    if (admin.role === 'Super Admin' && role !== 'Super Admin' && superAdminCount.value <= 1) {
      return {
        ok: false,
        message: 'Cannot demote the last Super Admin. Promote another admin to Super Admin first.',
      }
    }

    const previousRole = admin.role
    const roleChanged = previousRole !== role
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    const { data, error } = await supabase
      .from('admin')
      .update({ name: fullName, role })
      .eq('admin_id', id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      return { ok: false, message: errorMessage(error) }
    }

    const updated = rowToAdmin(data)
    updated.account.tempPassword = admin.account.tempPassword
    updated.history = admin.history
    logAction(
      updated,
      roleChanged ? `Role changed from ${previousRole} to ${role}` : 'Profile updated',
    )
    const index = admins.value.findIndex((entry) => entry.id === id)
    if (index >= 0) admins.value[index] = updated
    return { ok: true, admin: updated }
  }

  /**
   * Send Supabase's password reset email. Cannot show a temporary
   * password on screen — setting another user's password needs the
   * service key, which must never ship in the frontend.
   */
  async function resetPassword(email) {
    lastError.value = ''
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      return { ok: true }
    } catch (error) {
      console.error('[UCMS] reset email failed:', error)
      const message = String(error?.message || '').toLowerCase()
      if (
        message.includes('rate limit') ||
        message.includes('security purposes') ||
        message.includes('too many')
      ) {
        return {
          ok: false,
          message: 'Too many reset emails requested. Wait a few minutes, then try again.',
        }
      }
      if (message.includes('not confirmed')) {
        return {
          ok: false,
          message:
            'That account still needs its email confirmed. Confirm it in the Supabase dashboard (Authentication → Users), then try again.',
        }
      }
      if (message.includes('redirect')) {
        return {
          ok: false,
          message:
            'The reset link address is not allowed yet. Add http://localhost:5173/reset-password to Redirect URLs in the Supabase dashboard (Authentication → URL Configuration).',
        }
      }
      if (message.includes('is invalid') && message.includes('email')) {
        return {
          ok: false,
          message:
            'That email address cannot receive mail. Supabase refuses to send reset emails to fake or test addresses — the account must use a real, working email. Create a new admin with a real email address, then remove this account.',
        }
      }
      if (
        message.includes('smtp') ||
        message.includes('error sending') ||
        message.includes('fail')
      ) {
        return {
          ok: false,
          message: 'The reset email could not be sent. Wait a few minutes and try again.',
        }
      }
      if (message.includes('not found')) {
        return {
          ok: false,
          message: 'No login was found for that email address. Check the address.',
        }
      }
      return { ok: false, message: errorMessage(error) }
    }
  }

  async function setLoginEnabled(id, enabled) {
    lastError.value = ''
    const admin = admins.value.find((entry) => entry.id === id)
    if (!admin) {
      return { ok: false, message: 'That admin account no longer exists.' }
    }
    if (!enabled && id === currentAdminId.value) {
      return { ok: false, message: 'You cannot disable your own login.' }
    }

    const { error } = await supabase
      .from('admin')
      .update({ login_enabled: enabled })
      .eq('admin_id', id)
    if (error) {
      return { ok: false, message: errorMessage(error) }
    }

    admin.account.loginEnabled = enabled
    logAction(admin, enabled ? 'Login re-enabled' : 'Login disabled')
    return { ok: true }
  }

  return {
    admins,
    search,
    roleFilter,
    loading,
    lastError,
    fetchAdmins,
    addAdmin,
    updateAdmin,
    resetPassword,
    setLoginEnabled,
    emailTaken,
    currentAdminId,
    currentAdmin,
    superAdminCount,
    filteredAdmins,
    setSort,
    sortState,
  }
})
