import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { randomPassword } from '../utils/password'

/**
 * Admins store — admin account management
 *
 * Roles:
 *   Super Admin — can manage admin accounts (the first one is seeded;
 *                 everyone after is granted by an existing Super Admin)
 *   Admin       — runs the system, cannot manage accounts
 *
 * Rules enforced here:
 *   - No self-lockout: an admin cannot disable their own login
 *   - The last Super Admin cannot be demoted (the coop can never be
 *     left without a top-level account)
 *   - Passwords are handed over face-to-face as a temporary password
 *     and must be changed on first login
 *
 * Credentials are MOCKED for now. When Supabase is connected, replace
 * addAdmin / resetPassword / setLoginEnabled with supabase.auth.admin
 * calls (createUser, resetPasswordForEmail, updateUser) and store
 * mustChangePassword in user metadata. The AdminsView component will
 * NOT need to change.
 */

// Temporary sample data — delete once Supabase is connected
const mockAdmins = [
  {
    id: 1,
    firstName: 'Alfredo',
    lastName: 'Reyes',
    email: 'admin@ucms.com', // matches the temporary hardcoded login
    role: 'Super Admin',
    account: {
      loginEnabled: true,
      mustChangePassword: false,
      tempPassword: 'Kx8mT4qr',
    },
    lastLogin: '2026-09-25T08:12:00',
    history: [
      {
        at: '2026-01-08T09:00:00',
        action: 'Admin account created (Super Admin) — seeded as first account',
        by: 'System',
      },
    ],
  },
  {
    id: 2,
    firstName: 'Grace',
    lastName: 'Villanueva',
    email: 'grace.villanueva@ucms.com',
    role: 'Admin',
    account: {
      loginEnabled: true,
      mustChangePassword: true, // freshly created, hasn't logged in yet
      tempPassword: 'Pn5wR8kt',
    },
    lastLogin: null,
    history: [
      {
        at: '2026-09-22T14:30:00',
        action: 'Admin account created (Admin) — temporary password issued',
        by: 'Alfredo Reyes',
      },
    ],
  },
  {
    id: 3,
    firstName: 'Mark',
    lastName: 'Santos',
    email: 'mark.santos@ucms.com',
    role: 'Admin',
    account: {
      loginEnabled: false,
      mustChangePassword: false,
      tempPassword: 'Jd3vN7cy',
    },
    lastLogin: '2026-08-30T17:05:00',
    history: [
      {
        at: '2026-09-01T10:15:00',
        action: 'Login disabled',
        by: 'Alfredo Reyes',
      },
      {
        at: '2026-03-15T11:00:00',
        action: 'Admin account created (Admin) — temporary password issued',
        by: 'Alfredo Reyes',
      },
    ],
  },
]

export const useAdminsStore = defineStore('admins', () => {
  const admins = ref([...mockAdmins])
  const search = ref('')
  const roleFilter = ref('All')

  // The logged-in admin (mock — Supabase Auth will provide this later)
  const currentAdminId = ref(1)

  const filteredAdmins = computed(() => {
    const query = search.value.trim().toLowerCase()
    return admins.value.filter((admin) => {
      const matchesRole = roleFilter.value === 'All' || admin.role === roleFilter.value
      const fullName = `${admin.firstName} ${admin.lastName}`.toLowerCase()
      const matchesSearch =
        !query || fullName.includes(query) || admin.email.toLowerCase().includes(query)
      return matchesRole && matchesSearch
    })
  })

  const currentAdmin = computed(
    () => admins.value.find((admin) => admin.id === currentAdminId.value) || null,
  )

  const superAdminCount = computed(
    () => admins.value.filter((admin) => admin.role === 'Super Admin').length,
  )

  // Newest entries first — history arrays are stored unshifted in logAction

  function actor() {
    const current = currentAdmin.value
    return current ? `${current.firstName} ${current.lastName}` : 'System'
  }

  function logAction(admin, action) {
    if (!admin.history) admin.history = []
    admin.history.unshift({ at: new Date().toISOString(), action, by: actor() })
  }

  function emailTaken(email, exceptId = null) {
    const normalized = email.trim().toLowerCase()
    return admins.value.some(
      (admin) => admin.id !== exceptId && admin.email.toLowerCase() === normalized,
    )
  }

  // Creation always issues a temp password — handed over face-to-face
  function addAdmin({ firstName, lastName, email, role }) {
    if (emailTaken(email)) {
      return { ok: false, message: 'An admin with that email already exists.' }
    }
    const now = new Date().toISOString()
    const admin = {
      id: Date.now(), // temporary id — Supabase will generate the real one
      firstName,
      lastName,
      email,
      role,
      account: {
        loginEnabled: true,
        mustChangePassword: true, // forced change on first login
        tempPassword: randomPassword(),
      },
      lastLogin: null,
      history: [
        {
          at: now,
          action: `Admin account created (${role}) — temporary password issued`,
          by: actor(),
        },
      ],
    }
    admins.value.push(admin)
    return { ok: true, admin }
  }

  function updateAdmin(id, { firstName, lastName, email, role }) {
    const admin = admins.value.find((item) => item.id === id)
    if (!admin) return { ok: false, message: 'Admin not found.' }
    if (emailTaken(email, id)) {
      return { ok: false, message: 'An admin with that email already exists.' }
    }
    // Never let the coop end up with zero Super Admins
    if (admin.role === 'Super Admin' && role !== 'Super Admin' && superAdminCount.value <= 1) {
      return {
        ok: false,
        message: 'Cannot demote the last Super Admin — promote someone else first.',
      }
    }

    const oldRole = admin.role
    const roleChanged = oldRole !== role
    Object.assign(admin, { firstName, lastName, email, role })
    logAction(
      admin,
      roleChanged ? `Role changed from ${oldRole} to ${role}` : 'Admin profile updated',
    )
    return { ok: true, admin }
  }

  function resetPassword(id) {
    const admin = admins.value.find((item) => item.id === id)
    if (!admin) return
    admin.account.tempPassword = randomPassword()
    admin.account.mustChangePassword = true
    logAction(admin, 'Password reset — new temporary password issued')
  }

  function setLoginEnabled(id, enabled) {
    const admin = admins.value.find((item) => item.id === id)
    if (!admin) return { ok: false, message: 'Admin not found.' }
    if (!enabled && admin.id === currentAdminId.value) {
      return { ok: false, message: 'You cannot disable your own login.' }
    }
    admin.account.loginEnabled = enabled
    logAction(admin, enabled ? 'Login re-enabled' : 'Login disabled')
    return { ok: true }
  }

  return {
    admins,
    search,
    roleFilter,
    filteredAdmins,
    currentAdmin,
    currentAdminId,
    superAdminCount,
    emailTaken,
    addAdmin,
    updateAdmin,
    resetPassword,
    setLoginEnabled,
  }
})
