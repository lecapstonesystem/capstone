<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Members</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ membersStore.totalCount }} total · {{ membersStore.activeCount }} active
          </p>
        </div>
        <button
          @click="openAddModal"
          class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
        >
          + Add Member
        </button>
      </div>

      <!-- Search + Filter -->
      <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          v-model="membersStore.search"
          type="text"
          placeholder="Search by name, member no., or email..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="membersStore.statusFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Dropped">Dropped</option>
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
              <input v-model="columns.contact" type="checkbox" class="accent-green-600" />
              Contact
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.address" type="checkbox" class="accent-green-600" />
              Address
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.status" type="checkbox" class="accent-green-600" />
              Status
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.dateJoined" type="checkbox" class="accent-green-600" />
              Date Joined
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

      <!-- Members Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="table-scroll overflow-x-auto">
          <table class="w-full table-fixed text-sm" :style="{ minWidth: tableMinWidth }">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3 w-[13%]" :store="membersStore" sort-key="memberNo">
                  Member No.
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[27%]" :store="membersStore" sort-key="name">
                  Name
                </SortableTh>
                <SortableTh
                  v-if="columns.contact"
                  class="px-6 py-3 w-[16%]"
                  :store="membersStore"
                  sort-key="contact"
                >
                  Contact
                </SortableTh>
                <SortableTh
                  v-if="columns.address"
                  class="px-6 py-3 w-[16%]"
                  :store="membersStore"
                  sort-key="address"
                >
                  Address
                </SortableTh>
                <SortableTh
                  v-if="columns.status"
                  class="px-6 py-3 w-[10%]"
                  :store="membersStore"
                  sort-key="status"
                >
                  Status
                </SortableTh>
                <SortableTh
                  v-if="columns.dateJoined"
                  class="px-6 py-3 w-[13%]"
                  :store="membersStore"
                  sort-key="dateJoined"
                >
                  Date Joined
                </SortableTh>
                <th class="px-6 py-3 w-[13%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="member in membersStore.paginatedMembers"
                :key="member.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4 font-medium text-gray-800">{{ member.memberNo }}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      {{ member.firstName.charAt(0) }}{{ member.lastName.charAt(0) }}
                    </div>
                    <span class="font-medium text-gray-800">
                      {{ member.firstName }} {{ member.lastName }}
                    </span>
                  </div>
                </td>
                <td v-if="columns.contact" class="px-6 py-4 text-gray-500">
                  <div>{{ member.email }}</div>
                  <div class="text-xs text-gray-400">{{ member.phone }}</div>
                </td>
                <td v-if="columns.address" class="px-6 py-4 text-gray-500 max-w-48 truncate">
                  {{ member.address }}
                </td>
                <td v-if="columns.status" class="px-6 py-4">
                  <span
                    :class="statusBadgeClass(member.status)"
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                  >
                    {{ member.status }}
                  </span>
                </td>
                <td v-if="columns.dateJoined" class="px-6 py-4 text-gray-500">
                  {{ formatDate(member.dateJoined) }}
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    @click="openDetails(member)"
                    class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
                  >
                    Show
                  </button>
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="membersStore.filteredMembers.length === 0">
                <td :colspan="visibleColumnCount" class="px-6 py-10 text-center text-gray-400">
                  No members found.
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
              :value="membersStore.pageSize"
              @change="membersStore.setPageSize(Number($event.target.value))"
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
              @click="membersStore.setPage(membersStore.page - 1)"
              :disabled="membersStore.page <= 1"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span class="text-sm text-gray-600 px-2 whitespace-nowrap">
              Page {{ membersStore.page }} of {{ membersStore.totalPages }}
            </span>
            <button
              @click="membersStore.setPage(membersStore.page + 1)"
              :disabled="membersStore.page >= membersStore.totalPages"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Member Details Modal -->
    <div
      v-if="detailMember"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="detailMember = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">Member Details</h2>
          <button
            @click="detailMember = null"
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
              {{ detailMember.firstName.charAt(0) }}{{ detailMember.lastName.charAt(0) }}
            </div>
            <div class="min-w-0">
              <p class="text-lg font-semibold text-gray-800 truncate">
                {{
                  [detailMember.firstName, detailMember.middleName, detailMember.lastName]
                    .filter(Boolean)
                    .join(' ')
                }}
              </p>
              <p class="text-sm text-gray-500">{{ detailMember.memberNo }}</p>
            </div>
            <span
              :class="statusBadgeClass(detailMember.status)"
              class="ml-auto px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
            >
              {{ detailMember.status }}
            </span>
          </div>

          <!-- Fields -->
          <div class="grid grid-cols-1 gap-4 text-sm">
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Profile Photo
              </p>
              <div class="flex items-start gap-3">
                <PhotoPreview v-if="detailMember.idPhoto" :path="detailMember.idPhoto" />
                <span v-else class="text-xs text-gray-400 py-2">No photo on file</span>
                <div class="flex flex-col gap-1.5">
                  <button
                    @click="pickIdPhoto"
                    class="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-100 transition duration-200"
                  >
                    {{ detailMember.idPhoto ? 'Replace' : 'Upload' }}
                  </button>
                  <button
                    v-if="detailMember.idPhoto"
                    @click="requestRemovePhoto"
                    class="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <input
                ref="idPhotoInput"
                type="file"
                :accept="PHOTO_ACCEPT"
                class="hidden"
                @change="onIdPhotoPicked"
              />
              <p class="text-xs text-gray-400 mt-1">
                JPEG, PNG or WebP — large photos are resized automatically.
              </p>
              <p v-if="photoError" class="text-xs text-red-600 mt-1">{{ photoError }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
              <p class="text-gray-700 break-all">{{ detailMember.email || '—' }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Phone</p>
              <p class="text-gray-700">{{ detailMember.phone || '—' }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Address</p>
              <p class="text-gray-700">{{ detailMember.address || '—' }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Member Type
              </p>
              <p class="text-gray-700">{{ detailMember.memberType || '—' }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Civil Status
              </p>
              <p class="text-gray-700">
                {{ detailMember.civilStatus || '—'
                }}<span v-if="detailMember.spouseName">
                  — spouse: {{ detailMember.spouseName }}</span
                >
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Landline
              </p>
              <p class="text-gray-700">{{ detailMember.landline || '—' }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Government IDs
              </p>
              <ul class="text-gray-700 space-y-0.5">
                <li v-for="line in detailGovIds" :key="line">{{ line }}</li>
                <li v-if="detailGovIds.length === 0">—</li>
              </ul>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Date Joined
              </p>
              <p class="text-gray-700">{{ formatDate(detailMember.dateJoined) }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Capital Share
              </p>
              <div class="flex items-center gap-3">
                <p class="text-gray-700 font-semibold">
                  {{ formatPeso(detailMember.capitalShare || 0) }}
                </p>
                <button
                  @click="showCapitalInput = !showCapitalInput"
                  class="text-xs font-medium text-green-700 hover:text-green-800"
                >
                  + Add Capital
                </button>
              </div>
              <div v-if="showCapitalInput" class="flex items-center gap-2 mt-2">
                <input
                  v-model="capitalDraft"
                  type="number"
                  min="1"
                  placeholder="Amount (₱)"
                  class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <button
                  @click="submitCapital"
                  class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
                >
                  Save
                </button>
                <button
                  @click="showCapitalInput = false"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition duration-200"
                >
                  Cancel
                </button>
              </div>
              <ul
                v-if="detailMember.capitalEntries?.length"
                class="mt-2 space-y-1 max-h-32 overflow-y-auto"
              >
                <li
                  v-for="entry in detailMember.capitalEntries"
                  :key="entry.shareId"
                  class="flex items-center justify-between text-xs text-gray-500"
                >
                  <span
                    >{{ entry.date ? formatDate(entry.date) : '—' }} ·
                    {{ formatPeso(entry.amount) }}</span
                  >
                  <button
                    class="text-red-600 hover:text-red-700 font-medium"
                    @click="requestRemoveCapital(detailMember, entry)"
                  >
                    Remove
                  </button>
                </li>
              </ul>
              <p v-if="capitalError" class="text-xs text-red-600 mt-1">{{ capitalError }}</p>
            </div>
          </div>

          <!-- Loans -->
          <div class="border-t border-gray-100 pt-4 space-y-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Loans ({{ memberLoans.length }})
            </p>
            <p v-if="memberLoans.length === 0" class="text-sm text-gray-500">
              No loans recorded for this member yet.
            </p>
            <div
              v-for="loan in memberLoans"
              :key="loan.id"
              class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1.5"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-gray-700">
                  {{ loan.loanNo }} · {{ loanTypeLabel(loan.type) }}
                </span>
                <span
                  class="px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
                  :class="loanStatusBadgeClass(loan.status)"
                >
                  {{ loan.status }}
                </span>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  {{ formatPeso(loan.principal) }} · {{ loan.termMonths }} mo ·
                  {{ loan.ratePercent }}/mo
                </span>
                <span>Balance {{ formatPeso(loansStore.balanceOf(loan)) }}</span>
                <span v-if="loan.payments.length > 0">
                  {{ loan.payments.length }} payment{{ loan.payments.length > 1 ? 's' : '' }}
                </span>
                <span v-if="loansStore.isDelinquent(loan)" class="text-red-600 font-medium">
                  Delinquent
                </span>
              </div>
            </div>
          </div>

          <!-- Account Management -->
          <div class="border-t border-gray-100 pt-4 space-y-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Account</p>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span
                class="px-2.5 py-1 rounded-full text-xs font-medium"
                :class="
                  detailMember.account.loginEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                "
              >
                Login {{ detailMember.account.loginEnabled ? 'Enabled' : 'Disabled' }}
              </span>
              <span
                v-if="detailMember.account.mustChangePassword"
                class="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
              >
                Must change password on first login
              </span>
            </div>

            <!-- Temporary password (shown only when one is issued) -->
            <div
              v-if="detailMember.account.tempPassword"
              class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-xs text-gray-400">Temporary password</p>
                <p class="font-mono text-sm font-semibold text-gray-800 truncate">
                  {{ detailMember.account.tempPassword }}
                </p>
              </div>
              <button
                @click="copyTempPassword"
                class="text-xs font-medium text-green-700 hover:text-green-800 shrink-0"
              >
                {{ copied ? 'Copied!' : 'Copy' }}
              </button>
            </div>

            <p v-else class="text-xs text-gray-400">
              No credentials issued yet — generate a temporary password to hand to the member.
            </p>

            <div class="flex flex-wrap gap-2">
              <button
                @click="issueCredentials"
                class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
              >
                {{ detailMember.account.tempPassword ? 'Reset Password' : 'Issue Credentials' }}
              </button>
              <button
                v-if="detailMember.account.loginEnabled"
                @click="toggleLogin(false)"
                class="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition duration-200"
              >
                Disable Login
              </button>
              <button
                v-else
                @click="toggleLogin(true)"
                :disabled="detailMember.status !== 'Active'"
                class="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enable Login
              </button>
            </div>

            <!-- Membership status actions -->
            <div class="flex flex-wrap gap-2 pt-1">
              <button
                v-if="detailMember.status !== 'Active'"
                @click="requestStatusChange(detailMember, 'Active')"
                class="border border-green-300 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-50 transition duration-200"
              >
                {{ detailMember.status === 'Dropped' ? 'Restore Member' : 'Reactivate' }}
              </button>
              <button
                v-if="detailMember.status === 'Active'"
                @click="requestStatusChange(detailMember, 'Suspended')"
                class="border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-50 transition duration-200"
              >
                Suspend
              </button>
              <button
                v-if="detailMember.status === 'Active'"
                @click="requestStatusChange(detailMember, 'Dropped')"
                class="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition duration-200"
              >
                Drop Member
              </button>
            </div>
          </div>

          <!-- Activity History -->
          <div class="border-t border-gray-100 pt-4 space-y-3">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Activity</p>
            <ul class="space-y-2 max-h-44 overflow-y-auto">
              <li
                v-for="(entry, index) in detailMember.history"
                :key="index"
                class="flex gap-3 text-sm"
              >
                <span class="text-gray-400 whitespace-nowrap text-xs self-center">{{
                  formatDateTime(entry.at)
                }}</span>
                <span class="text-gray-600">{{ entry.action }}</span>
              </li>
              <li v-if="!detailMember.history?.length" class="text-sm text-gray-400">
                No activity recorded yet.
              </li>
            </ul>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            @click="detailMember = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
          <button
            @click="editFromDetails"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Edit
          </button>
        </div>
      </div>
    </div>

    <!-- Add / Edit Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">
            {{ modalMode === 'add' ? 'Add Member' : 'Edit Member' }}
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

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <label class="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
              <input
                v-model="form.middleName"
                type="text"
                placeholder="e.g. Lim"
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

          <!-- Membership classification + civil status (Members' Data Sheet) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Member Type</label>
              <select
                v-model="form.memberType"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="Regular">Regular</option>
                <option value="Associate">Associate</option>
                <option value="Extension">Extension</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Civil Status</label>
              <select
                v-model="form.civilStatus"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
            </div>
          </div>

          <div v-if="form.civilStatus === 'Married'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Spouse Name</label>
            <input
              v-model="form.spouseName"
              type="text"
              placeholder="Spouse full name"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="member@example.com"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone (11 digits)</label>
              <input
                v-model="form.phone"
                type="tel"
                maxlength="11"
                placeholder="09XXXXXXXXX"
                @input="sanitizePhone"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Landline (optional)</label
              >
              <input
                v-model="form.landline"
                type="tel"
                maxlength="20"
                placeholder="02XXXXXXXXX"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              v-model="form.address"
              rows="2"
              placeholder="Street, barangay, city..."
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                v-model="form.status"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Dropped">Dropped</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date Joined</label>
              <input
                v-model="form.dateJoined"
                type="date"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <!-- Government IDs — Members' Data Sheet (all optional) -->
          <div class="border-t border-gray-100 pt-4 space-y-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Government IDs — optional
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
                <select
                  v-model="form.govIdType"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select ID type</option>
                  <option value="National ID">National ID</option>
                  <option value="Driver's License">Driver's License</option>
                  <option value="Passport">Passport</option>
                  <option value="UMID">UMID</option>
                  <option value="Voter's ID">Voter's ID</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                <input
                  v-model="form.govIdNumber"
                  type="text"
                  maxlength="30"
                  placeholder="e.g. D12-34-567890"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">GSIS No.</label>
                <input
                  v-model="form.gsisNumber"
                  type="text"
                  maxlength="20"
                  placeholder="Optional"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">SSS No.</label>
                <input
                  v-model="form.sssNumber"
                  type="text"
                  maxlength="20"
                  placeholder="Optional"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Pag-IBIG No.</label>
                <input
                  v-model="form.pagibigNumber"
                  type="text"
                  maxlength="20"
                  placeholder="Optional"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">PhilHealth No.</label>
                <input
                  v-model="form.philhealthNumber"
                  type="text"
                  maxlength="20"
                  placeholder="Optional"
                  class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
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
            @click="saveMember"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            {{ modalMode === 'add' ? 'Add Member' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal (status changes) -->
    <div
      v-if="confirmAction"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="confirmAction = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-2">{{ confirmAction.title }}</h2>
        <p class="text-sm text-gray-500 mb-6" :class="confirmAction.reason ? 'mb-4' : ''">
          {{ confirmAction.message }}
        </p>
        <div v-if="confirmAction.reason" class="mb-6">
          <label class="block text-xs font-medium text-gray-500 mb-1">Reason (required)</label>
          <textarea
            v-model="confirmReason"
            rows="2"
            placeholder="Why is this being corrected? e.g. Entered twice by mistake"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          ></textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button
            @click="confirmAction = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="runConfirm"
            :disabled="confirmAction.reason && !confirmReason.trim()"
            class="px-4 py-2 rounded-lg text-sm font-medium text-white transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
import PhotoPreview from '../components/PhotoPreview.vue'
import { PHOTO_ACCEPT } from '../lib/documents'
import { useMembersStore } from '../stores/members'
import { useLoansStore, LOAN_TYPES } from '../stores/loans'

const membersStore = useMembersStore()
const loansStore = useLoansStore()

// "Showing 1–10 of 25 members"
const paginationLabel = computed(() => {
  const total = membersStore.filteredMembers.length
  if (total === 0) return 'No members found'
  const start = (membersStore.page - 1) * membersStore.pageSize + 1
  const end = Math.min(membersStore.page * membersStore.pageSize, total)
  return `Showing ${start}–${end} of ${total} members`
})

// Modal state
const showModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const editingId = ref(null)
const formError = ref('')
const copied = ref(false)

// Generic confirmation state (status changes & corrections)
const confirmAction = ref(null) // { title, message, confirmLabel, danger, reason, run }
const confirmReason = ref('')

function runConfirm() {
  if (!confirmAction.value) return
  // Corrections must say why — the reason goes into the audit trail.
  if (confirmAction.value.reason && !confirmReason.value.trim()) return
  confirmAction.value.run(confirmReason.value.trim())
  confirmAction.value = null
  confirmReason.value = ''
}

// Lifecycle actions and confirmations
function requestStatusChange(member, newStatus) {
  const name = `${member.firstName} ${member.lastName}`
  const presets = {
    Suspended: {
      title: 'Suspend Member?',
      message: `${name} will be suspended and their app login will be disabled. You can reactivate anytime.`,
      confirmLabel: 'Suspend',
      danger: false,
    },
    Active: {
      title: member.status === 'Dropped' ? 'Restore Member?' : 'Reactivate Member?',
      message:
        member.status === 'Dropped'
          ? `${name}'s record will be restored as an Active member.`
          : `${name} will be reactivated and their login re-enabled.`,
      confirmLabel: 'Reactivate',
      danger: false,
    },
    Dropped: {
      title: 'Drop Member?',
      message: `${name} will be marked as dropped (left the coop). The record is kept, login is disabled.`,
      confirmLabel: 'Drop Member',
      danger: true,
    },
  }
  confirmAction.value = {
    ...presets[newStatus],
    run: () => membersStore.setStatus(member.id, newStatus),
  }
}

// Capital corrections — the mistaken contribution is removed and the
// typed reason is recorded in the member's activity history.
function requestRemoveCapital(member, entry) {
  const name = `${member.firstName} ${member.lastName}`
  confirmReason.value = ''
  capitalError.value = ''
  confirmAction.value = {
    title: 'Remove Contribution?',
    message: `Remove the ${formatPeso(entry.amount)} capital contribution from ${name}? The member keeps their record and their remaining capital. The reason is added to the activity history.`,
    confirmLabel: 'Remove',
    danger: true,
    reason: true,
    run: async (reason) => {
      const result = await membersStore.removeCapital(member.id, entry, reason)
      capitalError.value = result.ok ? '' : result.message
    },
  }
}

// Profile photo — staff photograph the member at the desk (walk-ins)
// so counter staff can match the face to the record; replace/remove
// both land in the activity trail.
const idPhotoInput = ref(null)
const photoError = ref('')

function pickIdPhoto() {
  photoError.value = ''
  idPhotoInput.value?.click()
}

async function onIdPhotoPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // the same file can be re-chosen
  if (!file) return
  const result = await membersStore.uploadIdPhoto(detailMember.value.id, file)
  photoError.value = result.ok ? '' : result.message
}

function requestRemovePhoto() {
  confirmReason.value = ''
  confirmAction.value = {
    title: 'Remove Profile Photo?',
    message: `${detailMember.value.firstName} ${detailMember.value.lastName}'s profile photo will be removed from the record. You can upload a new one anytime.`,
    confirmLabel: 'Remove',
    danger: true,
    run: async () => {
      const result = await membersStore.removeIdPhoto(detailMember.value.id)
      photoError.value = result.ok ? '' : result.message
    },
  }
}

// Account actions
function issueCredentials() {
  membersStore.issueTempPassword(detailMember.value.id)
  copied.value = false
}

function toggleLogin(enabled) {
  membersStore.setLoginEnabled(detailMember.value.id, enabled)
}

async function copyTempPassword() {
  try {
    await navigator.clipboard.writeText(detailMember.value.account.tempPassword)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked — user can highlight and copy manually
  }
}

// Capital share — staggered payments (client rule: 15k new / 20k old)
const showCapitalInput = ref(false)
const capitalDraft = ref('')
const capitalError = ref('')

function submitCapital() {
  const amount = Number(capitalDraft.value)
  if (!(amount > 0)) {
    capitalError.value = 'Enter an amount greater than zero.'
    return
  }
  membersStore.addCapital(detailMember.value.id, amount)
  capitalDraft.value = ''
  capitalError.value = ''
  showCapitalInput.value = false
}

// Details modal
const detailMember = ref(null)

// One readable line per government ID, only for the ones actually filled in
const detailGovIds = computed(() => {
  const member = detailMember.value
  if (!member) return []
  const lines = []
  const primaryId = [member.govIdType, member.govIdNumber].filter(Boolean).join(' ')
  if (primaryId) lines.push(primaryId)
  if (member.gsisNumber) lines.push(`GSIS ${member.gsisNumber}`)
  if (member.sssNumber) lines.push(`SSS ${member.sssNumber}`)
  if (member.pagibigNumber) lines.push(`Pag-IBIG ${member.pagibigNumber}`)
  if (member.philhealthNumber) lines.push(`PhilHealth ${member.philhealthNumber}`)
  return lines
})

// This member's loans, oldest first (live from the loans store)
const memberLoans = computed(() =>
  loansStore.loans.filter((loan) => loan.memberId === detailMember.value?.id),
)

const loanTypeLabel = (value) => LOAN_TYPES.find((item) => item.value === value)?.label || value

function loanStatusBadgeClass(status) {
  if (status === 'Paid') return 'bg-green-100 text-green-700'
  if (status === 'Released') return 'bg-blue-100 text-blue-700'
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700'
  if (status === 'For Approval') return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

function openDetails(member) {
  detailMember.value = member
  showCapitalInput.value = false
  capitalError.value = ''
  photoError.value = ''
  capitalDraft.value = ''
  capitalError.value = ''
}

function editFromDetails() {
  const member = detailMember.value
  detailMember.value = null
  openEditModal(member)
}

// Column visibility — Contact & Address live in details by default
const columns = reactive({
  contact: false,
  address: false,
  status: true,
  dateJoined: true,
})
const showColumnPicker = ref(false)

// Member No. + Name + Actions are always shown
const visibleColumnCount = computed(() => 3 + Object.values(columns).filter(Boolean).length)

// Only force horizontal scroll when wide columns are visible
const tableMinWidth = computed(() => (columns.contact || columns.address ? '1000px' : '720px'))

// Form model — mirrors the Members' Data Sheet (essentials only)
const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  memberType: 'Regular',
  civilStatus: 'Single',
  spouseName: '',
  email: '',
  phone: '',
  landline: '',
  address: '',
  govIdType: '',
  govIdNumber: '',
  gsisNumber: '',
  sssNumber: '',
  pagibigNumber: '',
  philhealthNumber: '',
  status: 'Active',
  dateJoined: new Date().toISOString().split('T')[0],
}
const form = reactive({ ...emptyForm })

function openAddModal() {
  modalMode.value = 'add'
  editingId.value = null
  formError.value = ''
  Object.assign(form, emptyForm, { dateJoined: new Date().toISOString().split('T')[0] })
  showModal.value = true
}

function openEditModal(member) {
  modalMode.value = 'edit'
  editingId.value = member.id
  formError.value = ''
  Object.assign(form, {
    firstName: member.firstName,
    middleName: member.middleName || '',
    lastName: member.lastName,
    memberType: member.memberType || 'Regular',
    civilStatus: member.civilStatus || 'Single',
    spouseName: member.spouseName || '',
    email: member.email,
    phone: member.phone,
    landline: member.landline || '',
    address: member.address,
    govIdType: member.govIdType || '',
    govIdNumber: member.govIdNumber || '',
    gsisNumber: member.gsisNumber || '',
    sssNumber: member.sssNumber || '',
    pagibigNumber: member.pagibigNumber || '',
    philhealthNumber: member.philhealthNumber || '',
    status: member.status,
    dateJoined: member.dateJoined,
  })
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = ''
}

// Digits only, hard-capped at 11 characters
function sanitizePhone() {
  form.phone = form.phone.replace(/\D/g, '').slice(0, 11)
}

async function saveMember() {
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
  if (form.phone && form.phone.length !== 11) {
    formError.value = 'Phone number must be exactly 11 digits.'
    return
  }
  if (form.civilStatus === 'Married' && !form.spouseName.trim()) {
    formError.value = 'Spouse name is required for married members.'
    return
  }

  const data = {
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim(),
    lastName: form.lastName.trim(),
    memberType: form.memberType,
    civilStatus: form.civilStatus,
    spouseName: form.civilStatus === 'Married' ? form.spouseName.trim() : '',
    email: form.email.trim(),
    phone: form.phone.trim(),
    landline: form.landline.trim(),
    address: form.address.trim(),
    govIdType: form.govIdType,
    govIdNumber: form.govIdNumber.trim(),
    gsisNumber: form.gsisNumber.trim(),
    sssNumber: form.sssNumber.trim(),
    pagibigNumber: form.pagibigNumber.trim(),
    philhealthNumber: form.philhealthNumber.trim(),
    status: form.status,
    dateJoined: form.dateJoined,
  }

  const saveError =
    modalMode.value === 'add'
      ? await membersStore.addMember(data)
      : await membersStore.updateMember(editingId.value, data)
  if (saveError) {
    // Keep the modal open and show what the database said
    formError.value = saveError
    return
  }

  closeModal()
}

function statusBadgeClass(status) {
  if (status === 'Active') return 'bg-green-100 text-green-700'
  if (status === 'Suspended') return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500' // Dropped
}

function formatDate(dateString) {
  if (!dateString) return '—'
  const date = new Date(`${dateString}T00:00:00`)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function formatPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
</script>
