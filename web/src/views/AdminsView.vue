<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
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
        change it on first login. A forgotten password is reset by <strong>email link</strong>. Only
        a <strong>Super Admin</strong> can manage accounts.
      </div>

      <!-- Role guide — what each role can access and do -->
      <button
        @click="rolesHelpOpen = !rolesHelpOpen"
        class="text-sm font-medium text-green-700 hover:text-green-800 transition duration-200 -mt-4 mb-6"
      >
        {{ rolesHelpOpen ? 'Hide role guide' : 'How roles work' }}
      </button>

      <div
        v-if="rolesHelpOpen"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6 space-y-5"
      >
        <div v-for="entry in ROLE_GUIDE" :key="entry.name">
          <p class="text-sm font-semibold text-gray-800">{{ entry.name }}</p>
          <p class="text-sm text-gray-600 mt-0.5">{{ entry.summary }}</p>
          <ul class="mt-1.5 space-y-1">
            <li v-for="line in entry.can" :key="line" class="text-xs text-gray-500 flex gap-2">
              <span class="text-green-600 shrink-0">-</span>
              <span>{{ line }}</span>
            </li>
          </ul>
        </div>
        <p class="text-xs text-gray-400 border-t border-gray-100 pt-3">
          Role boundaries are enforced in the database itself, not only in the interface: test-data
          deletion is allowed for Developer sessions alone (row-level security), and the audit log
          has no delete path for any role — deletions are logged, never erased.
        </p>
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
          <option value="Developer">Developer</option>
        </select>

        <!-- Column visibility -->
        <div class="relative">
          <button
            @click="showColumnPicker = !showColumnPicker"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition duration-200 w-full sm:w-auto"
          >
            ▦ Columns
          </button>
          <div
            v-if="showColumnPicker"
            class="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 space-y-2"
          >
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.email" type="checkbox" class="accent-green-600" />
              Email
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.role" type="checkbox" class="accent-green-600" />
              Role
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.lastLogin" type="checkbox" class="accent-green-600" />
              Last Login
            </label>
          </div>
        </div>
      </div>
      <!-- Click outside to close the Columns dropdown -->
      <div
        v-if="showColumnPicker"
        class="fixed inset-0 z-10"
        @click="showColumnPicker = false"
      ></div>

      <!-- Admins Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="table-scroll overflow-x-auto">
          <table class="w-full table-fixed text-sm" :style="{ minWidth: tableMinWidth }">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3 w-[22%]" :store="adminsStore" sort-key="name">
                  Name
                </SortableTh>
                <SortableTh
                  v-if="columns.email"
                  class="px-6 py-3 w-[28%]"
                  :store="adminsStore"
                  sort-key="email"
                >
                  Email
                </SortableTh>
                <SortableTh
                  v-if="columns.role"
                  class="px-6 py-3 w-[14%]"
                  :store="adminsStore"
                  sort-key="role"
                >
                  Role
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[12%]" :store="adminsStore" sort-key="login">
                  Login
                </SortableTh>
                <SortableTh
                  v-if="columns.lastLogin"
                  class="px-6 py-3 w-[14%]"
                  :store="adminsStore"
                  sort-key="lastLogin"
                >
                  Last Login
                </SortableTh>
                <th class="px-6 py-3 w-[12%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="admin in adminsStore.paginatedAdmins"
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
                <td
                  v-if="columns.email"
                  class="px-6 py-4 text-gray-500 truncate"
                  :title="admin.email"
                >
                  {{ admin.email }}
                </td>
                <td v-if="columns.role" class="px-6 py-4">
                  <span
                    :class="
                      admin.role === 'Super Admin'
                        ? 'bg-green-100 text-green-700'
                        : admin.role === 'Developer'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                    "
                    class="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
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
                <td v-if="columns.lastLogin" class="px-6 py-4 text-gray-500">
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
                <td :colspan="visibleColumnCount" class="px-6 py-10 text-center text-gray-400">
                  No admins found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          class="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              :value="adminsStore.pageSize"
              @change="adminsStore.setPageSize(Number($event.target.value))"
              class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
            <span>per page · {{ paginationLabel }}</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="adminsStore.setPage(adminsStore.page - 1)"
              :disabled="adminsStore.page <= 1"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span class="text-sm text-gray-600 px-2 whitespace-nowrap">
              Page {{ adminsStore.page }} of {{ adminsStore.totalPages }}
            </span>
            <button
              @click="adminsStore.setPage(adminsStore.page + 1)"
              :disabled="adminsStore.page >= adminsStore.totalPages"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Details / Management Modal -->
    <div
      v-if="detailAdmin"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="detailAdmin = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">Manage Admin</h2>
          <button
            @click="detailAdmin = null"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
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
                  : detailAdmin.role === 'Developer'
                    ? 'bg-amber-100 text-amber-700'
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

          <!-- Confirmation notice (e.g. reset email sent) -->
          <div
            v-if="detailsNotice"
            class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm"
          >
            {{ detailsNotice }}
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
                <p class="text-xs text-amber-600 mt-1">
                  Shown once and never stored — copy it now. If it's lost, use Reset Password to
                  email a new sign-in link.
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
                <option value="Developer">Developer</option>
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

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
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
      <div class="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
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

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
              placeholder="e.g. juan.delacruz@gmail.com"
              :disabled="modalMode === 'edit'"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            <p v-if="modalMode === 'edit'" class="text-xs text-gray-400 mt-1">
              The email is the login and cannot be changed here.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              v-model="form.role"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="Admin">Admin</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Developer">Developer</option>
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

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
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
import { ref, reactive, computed } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import SortableTh from '../components/SortableTh.vue'
import { useAdminsStore } from '../stores/admins'

const adminsStore = useAdminsStore()

// Column visibility — Name, Login status and Actions always show
const columns = reactive({ email: true, role: true, lastLogin: true })
const showColumnPicker = ref(false)

// "How roles work" guide — kept next to the account list so the
// powers behind each badge are one glance away.
const rolesHelpOpen = ref(false)
const ROLE_GUIDE = [
  {
    name: 'Super Admin',
    summary:
      'The cooperative’s top account — everything an Admin can do, plus control of who is signed up.',
    can: [
      'Add admin accounts, change roles, enable or disable logins, reset passwords',
      'Everything listed under Admin',
      'At least one Super Admin must always remain — the system blocks removing the last one',
    ],
  },
  {
    name: 'Admin',
    summary: 'Day-to-day cooperative work — the normal role for coop staff.',
    can: [
      'Members: register, edit, suspend or drop; issue app credentials',
      'Loans: create, review and release; verify payments; print Loan Notes',
      'Registrations, Ledger, Reports, Notifications and the Activity Log',
      'View this account list — management stays with Super Admins',
    ],
  },
  {
    name: 'Developer',
    summary:
      'Everything an Admin can do, plus cleanup of TEST data during development and testing.',
    can: [
      'Delete test members and test loans — requires typing the record number and is written to the audit log',
      'Deletion is blocked for every other role inside the database itself (row-level security)',
      'Not a coop duty: real member records are never deleted through the portal (RA 9520)',
    ],
  },
]
const visibleColumnCount = computed(() => 3 + Object.values(columns).filter(Boolean).length)
// Only force horizontal scroll when the wide columns are visible
const tableMinWidth = computed(() => (columns.email || columns.lastLogin ? '820px' : '660px'))

// Details modal state
const detailAdmin = ref(null)
const detailsError = ref('')
const detailsNotice = ref('') // green confirmation (e.g. reset email sent)
const copied = ref(false)
const roleSelectKey = ref(0) // bump to reset the role <select> after a rejected change

function openDetails(admin) {
  detailAdmin.value = admin
  detailsError.value = ''
  detailsNotice.value = ''
}

// Generic confirmation state
const confirmAction = ref(null) // { title, message, confirmLabel, danger, run, revert }

async function runConfirm() {
  if (!confirmAction.value) return
  const result = await confirmAction.value.run()
  if (result && result.ok === false) {
    // Store rejected it (e.g. self-lockout or last Super Admin) — show the reason
    detailsError.value = result.message
    if (confirmAction.value?.revert) confirmAction.value.revert()
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
    message: `Send ${name} an email with a link to set a new password? The link goes to ${admin.email}.`,
    confirmLabel: 'Send Reset Email',
    danger: false,
    run: async () => {
      const result = await adminsStore.resetPassword(admin.email)
      if (result.ok) {
        detailsNotice.value = `Reset email sent to ${admin.email}. ${name} opens the link and chooses a new password.`
      }
      return result
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
// "Showing 1–10 of 25 admins"
const paginationLabel = computed(() => {
  const total = adminsStore.filteredAdmins.length
  if (total === 0) return 'No admins found'
  const start = (adminsStore.page - 1) * adminsStore.pageSize + 1
  const end = Math.min(adminsStore.page * adminsStore.pageSize, total)
  return `Showing ${start}–${end} of ${total} admins`
})

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

async function saveAdmin() {
  // Validation
  if (!form.firstName.trim() || !form.lastName.trim()) {
    formError.value = 'First name and last name are required.'
    return
  }
  if (modalMode.value === 'add' && !form.email.trim()) {
    formError.value = 'Email is required.'
    return
  }
  if (modalMode.value === 'add' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    formError.value = 'Please enter a valid email address.'
    return
  }

  // Email is the login identity — it can only be set when the account
  // is created (changing it later needs access we do not ship).
  const data = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    role: form.role,
  }

  const result =
    modalMode.value === 'add'
      ? await adminsStore.addAdmin({ ...data, email: form.email.trim() })
      : await adminsStore.updateAdmin(editingId.value, data)

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
