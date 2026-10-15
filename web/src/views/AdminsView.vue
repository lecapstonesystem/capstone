<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Admin Accounts</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ adminsStore.admins.length }} admins · {{ adminsStore.superAdminCount }} Super Admin{{
              adminsStore.superAdminCount === 1 ? '' : 's'
            }}
          </p>
        </div>
        <button
          @click="openAddModal"
          class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
        >
          + Add Admin
        </button>
      </div>

      <!-- Info banner -->
      <div
        class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm"
      >
        New admins receive a <strong>temporary password</strong> to hand over face-to-face and must
        change it on first login. Only a <strong>Super Admin</strong> can manage accounts.
      </div>

      <!-- Search + Role Filter -->
      <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          v-model="adminsStore.search"
          type="text"
          placeholder="Search by name or email..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="adminsStore.roleFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Roles</option>
          <option value="Super Admin">Super Admin</option>
          <option value="Admin">Admin</option>
        </select>
      </div>

      <!-- Admins Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="table-scroll overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3" :store="adminsStore" sort-key="name">
                  Name
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="adminsStore" sort-key="email">
                  Email
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="adminsStore" sort-key="role">
                  Role
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="adminsStore" sort-key="login">
                  Login
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="adminsStore" sort-key="lastLogin">
                  Last Login
                </SortableTh>
                <th class="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="admin in adminsStore.filteredAdmins"
                :key="admin.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      {{ admin.firstName.charAt(0) }}{{ admin.lastName.charAt(0) }}
                    </div>
                    <div>
                      <span class="font-medium text-gray-800">
                        {{ admin.firstName }} {{ admin.lastName }}
                      </span>
                      <span
                        v-if="admin.id === adminsStore.currentAdminId"
                        class="ml-2 text-xs text-green-600 font-medium"
                      >
                        (you)
                      </span>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 text-gray-500">{{ admin.email }}</td>
                <td class="px-6 py-4">
                  <span
                    :class="
                      admin.role === 'Super Admin'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    "
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                  >
                    {{ admin.role }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                    :class="
                      admin.account.loginEnabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    "
                  >
                    {{ admin.account.loginEnabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </td>
                <td class="px-6 py-4 text-gray-500">
                  {{ admin.lastLogin ? formatDateTime(admin.lastLogin) : 'Never' }}
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    @click="openDetails(admin)"
                    class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
                  >
                    Manage
                  </button>
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="adminsStore.filteredAdmins.length === 0">
                <td colspan="6" class="px-6 py-10 text-center text-gray-400">No admins found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Admin Details / Management Modal -->
    <div
      v-if="detailAdmin"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="detailAdmin = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800">Manage Admin</h2>
          <button
            @click="detailAdmin = null"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <!-- Identity -->
          <div class="flex items-center gap-4">
            <div
              class="w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            >
              {{ detailAdmin.firstName.charAt(0) }}{{ detailAdmin.lastName.charAt(0) }}
            </div>
            <div class="min-w-0">
              <p class="text-lg font-semibold text-gray-800 truncate">
                {{ detailAdmin.firstName }} {{ detailAdmin.lastName }}
              </p>
              <p class="text-sm text-gray-500 truncate">{{ detailAdmin.email }}</p>
            </div>
            <span
              class="ml-auto px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
              :class="
                detailAdmin.role === 'Super Admin'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              "
            >
              {{ detailAdmin.role }}
            </span>
          </div>

          <!-- Error message -->
          <div
            v-if="detailsError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ detailsError }}
          </div>

          <!-- Account Management -->
          <div class="border-t border-gray-100 pt-4 space-y-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Account</p>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span
                class="px-2.5 py-1 rounded-full text-xs font-medium"
                :class="
                  detailAdmin.account.loginEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                "
              >
                Login {{ detailAdmin.account.loginEnabled ? 'Enabled' : 'Disabled' }}
              </span>
              <span
                v-if="detailAdmin.account.mustChangePassword"
                class="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
              >
                Must change password on first login
              </span>
            </div>

            <!-- Temporary password -->
            <div
              v-if="detailAdmin.account.tempPassword"
              class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-xs text-gray-400">Temporary password</p>
                <p class="font-mono text-sm font-semibold text-gray-800 truncate">
                  {{ detailAdmin.account.tempPassword }}
                </p>
              </div>
              <button
                @click="copyTempPassword"
                class="text-xs font-medium text-green-700 hover:text-green-800 shrink-0"
              >
                {{ copied ? 'Copied!' : 'Copy' }}
              </button>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                @click="requestResetPassword(detailAdmin)"
                class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
              >
                Reset Password
              </button>
              <button
                v-if="detailAdmin.account.loginEnabled"
                @click="requestToggleLogin(detailAdmin, false)"
                :disabled="detailAdmin.id === adminsStore.currentAdminId"
                class="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                :title="
                  detailAdmin.id === adminsStore.currentAdminId
                    ? 'You cannot disable your own login'
                    : ''
                "
              >
                Disable Login
              </button>
              <button
                v-else
                @click="requestToggleLogin(detailAdmin, true)"
                class="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-100 transition duration-200"
              >
                Enable Login
              </button>
            </div>

            <!-- Role -->
            <div class="pt-1">
              <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Role
              </label>
              <select
                :key="roleSelectKey"
                :value="detailAdmin.role"
                @change="requestRoleChange(detailAdmin, $event.target.value)"
                :disabled="detailAdmin.id === adminsStore.currentAdminId"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="Super Admin">Super Admin</option>
                <option value="Admin">Admin</option>
              </select>
              <p class="text-xs text-gray-400 mt-1">
                {{
                  detailAdmin.id === adminsStore.currentAdminId
                    ? 'You cannot change your own role.'
                    : 'Changing the role takes effect after confirmation.'
                }}
              </p>
            </div>
          </div>

          <!-- Activity History -->
          <div class="border-t border-gray-100 pt-4 space-y-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Activity</p>
            <ul class="space-y-2 max-h-44 overflow-y-auto">
              <li
                v-for="(entry, index) in detailAdmin.history"
                :key="index"
                class="flex gap-3 text-sm"
              >
                <span class="text-gray-400 whitespace-nowrap text-xs self-center">{{
                  formatDateTime(entry.at)
                }}</span>
                <span class="text-gray-600">{{ entry.action }}</span>
              </li>
              <li v-if="!detailAdmin.history?.length" class="text-sm text-gray-400">
                No activity recorded yet.
              </li>
            </ul>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            @click="openEditModal(detailAdmin)"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Edit
          </button>
          <button
            @click="detailAdmin = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Add / Edit Admin Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800">
            {{ modalMode === 'add' ? 'Add Admin' : 'Edit Admin' }}
          </h2>
          <button
            @click="closeModal"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4">
          <!-- Error message -->
          <div
            v-if="formError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ formError }}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                v-model="form.firstName"
                type="text"
                placeholder="e.g. Juan"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                v-model="form.lastName"
                type="text"
                placeholder="e.g. Dela Cruz"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="admin@ucms.com"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              v-model="form.role"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="Admin">Admin</option>
              <option value="Super Admin">Super Admin</option>
            </select>
          </div>

          <div
            v-if="modalMode === 'add'"
            class="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm"
          >
            A <strong>temporary password</strong> will be generated after saving. Hand it to the new
            admin face-to-face — they must change it on first login.
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            @click="closeModal"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="saveAdmin"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            {{ modalMode === 'add' ? 'Add Admin' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div
      v-if="confirmAction"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="confirmAction = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-2">{{ confirmAction.title }}</h2>
        <p class="text-sm text-gray-500 mb-6">
          {{ confirmAction.message }}
        </p>
        <div class="flex justify-end gap-3">
          <button
            @click="cancelConfirm"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="runConfirm"
            class="px-4 py-2 rounded-lg text-sm font-medium text-white transition duration-200"
            :class="
              confirmAction.danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            "
          >
            {{ confirmAction.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, reactive } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import SortableTh from '../components/SortableTh.vue'
import { useAdminsStore } from '../stores/admins'

const adminsStore = useAdminsStore()

// Details modal state
const detailAdmin = ref(null)
const detailsError = ref('')
const copied = ref(false)
const roleSelectKey = ref(0) // bump to reset the role <select> after a rejected change

function openDetails(admin) {
  detailAdmin.value = admin
  detailsError.value = ''
}

// Generic confirmation state
const confirmAction = ref(null) // { title, message, confirmLabel, danger, run, revert }

function runConfirm() {
  if (!confirmAction.value) return
  const result = confirmAction.value.run()
  if (result && result.ok === false) {
    // Store rejected it (e.g. self-lockout or last Super Admin) — show the reason
    detailsError.value = result.message
    if (confirmAction.value.revert) confirmAction.value.revert()
  } else {
    detailsError.value = ''
  }
  confirmAction.value = null
}

function cancelConfirm() {
  if (confirmAction.value?.revert) confirmAction.value.revert()
  confirmAction.value = null
}

// Account actions
function requestResetPassword(admin) {
  const name = `${admin.firstName} ${admin.lastName}`
  confirmAction.value = {
    title: 'Reset Password?',
    message: `A new temporary password will be generated for ${name}. They must change it on their next login.`,
    confirmLabel: 'Reset Password',
    danger: false,
    run: () => {
      adminsStore.resetPassword(admin.id)
      copied.value = false
      return { ok: true }
    },
  }
}

function requestToggleLogin(admin, enabled) {
  const name = `${admin.firstName} ${admin.lastName}`
  confirmAction.value = {
    title: enabled ? 'Enable Login?' : 'Disable Login?',
    message: enabled
      ? `${name} will be able to log into the system again.`
      : `${name} will no longer be able to log into the system until re-enabled.`,
    confirmLabel: enabled ? 'Enable Login' : 'Disable Login',
    danger: !enabled,
    run: () => adminsStore.setLoginEnabled(admin.id, enabled),
  }
}

function requestRoleChange(admin, newRole) {
  if (newRole === admin.role) return
  const name = `${admin.firstName} ${admin.lastName}`
  confirmAction.value = {
    title: 'Change Role?',
    message: `${name} will become a ${newRole}. ${
      newRole === 'Super Admin'
        ? 'Super Admins can manage all admin accounts.'
        : 'Admins cannot manage admin accounts.'
    }`,
    confirmLabel: 'Change Role',
    danger: false,
    run: () =>
      adminsStore.updateAdmin(admin.id, {
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: newRole,
      }),
    revert: () => {
      // Force the <select> back to the stored role (bump key re-mounts it)
      roleSelectKey.value += 1
    },
  }
}

async function copyTempPassword() {
  try {
    await navigator.clipboard.writeText(detailAdmin.value.account.tempPassword)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked — user can highlight and copy manually
  }
}

// Add / Edit modal state
const showModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingId = ref(null)
const formError = ref('')

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'Admin',
}
const form = reactive({ ...emptyForm })

function openAddModal() {
  modalMode.value = 'add'
  editingId.value = null
  formError.value = ''
  Object.assign(form, emptyForm)
  showModal.value = true
}

function openEditModal(admin) {
  modalMode.value = 'edit'
  editingId.value = admin.id
  formError.value = ''
  Object.assign(form, {
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    role: admin.role,
  })
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = ''
}

function saveAdmin() {
  // Validation
  if (!form.firstName.trim() || !form.lastName.trim()) {
    formError.value = 'First name and last name are required.'
    return
  }
  if (!form.email.trim()) {
    formError.value = 'Email is required.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    formError.value = 'Please enter a valid email address.'
    return
  }

  const data = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    role: form.role,
  }

  const result =
    modalMode.value === 'add'
      ? adminsStore.addAdmin(data)
      : adminsStore.updateAdmin(editingId.value, data)

  if (!result.ok) {
    formError.value = result.message
    return
  }

  // After adding: open the new admin's details so the temp password can be
  // copied right away. After editing: refresh the open details modal.
  if (result.admin) detailAdmin.value = result.admin
  closeModal()
}

function formatDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>
