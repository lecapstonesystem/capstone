<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Applications</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ appsStore.applications.length }} total · {{ appsStore.rejectedCount }} rejected
          </p>
        </div>
        <button
          @click="openAddModal"
          class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
        >
          + New Application
        </button>
      </div>

      <!-- Info banner — the client's registration rule -->
      <div
        class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm"
      >
        Registration is <strong>face-to-face only</strong> — there is no online registration.
        Applications arrive two ways: a pre-filled PDF from the Flutter app, or a walk-in entry
        typed by an admin.
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span> Pending
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">{{ appsStore.pendingCount }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-blue-400"></span> Under Review
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">{{ appsStore.underReviewCount }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-green-500"></span> Approved
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">{{ appsStore.approvedCount }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-purple-400"></span> Returned
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">{{ appsStore.returnedCount }}</p>
        </div>
      </div>

      <!-- Search + Status Filter -->
      <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          v-model="appsStore.search"
          type="text"
          placeholder="Search by applicant name or application no..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="appsStore.statusFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Under Review">Under Review</option>
          <option value="Approved">Approved</option>
          <option value="Returned">Returned</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <!-- Applications Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="table-scroll overflow-x-auto">
          <table class="w-full min-w-[880px] text-sm">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3" :store="appsStore" sort-key="appNo">
                  App No
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="appsStore" sort-key="applicant">
                  Applicant
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="appsStore" sort-key="source">
                  Source
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="appsStore" sort-key="submitted">
                  Submitted
                </SortableTh>
                <SortableTh class="px-6 py-3" :store="appsStore" sort-key="status">
                  Status
                </SortableTh>
                <th class="px-6 py-3">Form</th>
                <th class="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="application in appsStore.filteredApplications"
                :key="application.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4 font-mono text-xs text-gray-500">{{ application.appNo }}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      {{ application.firstName.charAt(0) }}{{ application.lastName.charAt(0) }}
                    </div>
                    <span class="font-medium text-gray-800">
                      {{ application.firstName }} {{ application.lastName }}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                    :class="
                      application.source === 'App'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    "
                  >
                    {{ application.source === 'App' ? 'Mobile App' : 'Walk-in' }}
                  </span>
                </td>
                <td class="px-6 py-4 text-gray-500">{{ formatDate(application.submittedAt) }}</td>
                <td class="px-6 py-4">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                    :class="statusClass(application.status)"
                  >
                    {{ application.status }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <button
                    v-if="application.source === 'App'"
                    @click="viewForm(application)"
                    class="text-green-700 hover:text-green-800 hover:underline text-xs font-medium"
                  >
                    View PDF
                  </button>
                  <span v-else class="text-gray-300">—</span>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    @click="openReview(application)"
                    class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
                  >
                    {{
                      application.status === 'Approved' || application.status === 'Rejected'
                        ? 'View'
                        : 'Review'
                    }}
                  </button>
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="appsStore.filteredApplications.length === 0">
                <td colspan="7" class="px-6 py-10 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Review Modal -->
    <div
      v-if="detailApp"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="detailApp = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-gray-800">Review — {{ detailApp.appNo }}</h2>
            <span
              class="px-2.5 py-1 rounded-full text-xs font-medium"
              :class="statusClass(detailApp.status)"
            >
              {{ detailApp.status }}
            </span>
          </div>
          <button
            @click="detailApp = null"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <!-- Error message -->
          <div
            v-if="reviewError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ reviewError }}
          </div>

          <!-- Applicant info -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Applicant</p>
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              >
                {{ detailApp.firstName.charAt(0) }}{{ detailApp.lastName.charAt(0) }}
              </div>
              <div class="min-w-0">
                <p class="font-semibold text-gray-800">
                  {{ detailApp.firstName }} {{ detailApp.lastName }}
                </p>
                <p class="text-sm text-gray-500">{{ detailApp.phone }} · {{ detailApp.address }}</p>
                <p v-if="detailApp.email" class="text-sm text-gray-500">{{ detailApp.email }}</p>
              </div>
              <span
                class="ml-auto px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
                :class="
                  detailApp.source === 'App'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                "
              >
                {{ detailApp.source === 'App' ? 'Mobile App' : 'Walk-in' }}
              </span>
            </div>
          </div>

          <!-- Application form PDF -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Application Form
            </p>
            <div
              class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
            >
              <p class="text-sm text-gray-600">
                {{
                  detailApp.source === 'App'
                    ? 'Pre-filled PDF generated by the Flutter app (exact copy of the paper form).'
                    : 'Walk-in entry — the signed paper form is kept on file at the coop office.'
                }}
              </p>
              <button
                v-if="detailApp.source === 'App'"
                @click="viewForm(detailApp)"
                class="text-xs font-medium text-green-700 hover:text-green-800 shrink-0"
              >
                View form
              </button>
            </div>
          </div>

          <!-- Requirements checklist -->
          <div class="border-t border-gray-100 pt-4">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Requirements</p>
              <p class="text-xs text-gray-500">
                {{ verifiedCount }} of {{ detailApp.checklist.length }} verified
              </p>
            </div>
            <ul class="space-y-2">
              <li v-for="(item, index) in detailApp.checklist" :key="index">
                <label
                  class="flex items-center gap-3 text-sm text-gray-700"
                  :class="isReadOnly ? 'opacity-60' : 'cursor-pointer'"
                >
                  <input
                    v-model="item.checked"
                    type="checkbox"
                    class="accent-green-600 w-4 h-4"
                    :disabled="isReadOnly"
                  />
                  {{ item.label }}
                </label>
              </li>
            </ul>
          </div>

          <!-- Remarks -->
          <div class="border-t border-gray-100 pt-4">
            <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Admin Remarks
            </label>
            <textarea
              v-model="remarksDraft"
              :disabled="isReadOnly"
              rows="2"
              placeholder="Reason when returning or rejecting (required)... leave a note when approving (optional)"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-50"
            ></textarea>
            <p v-if="detailApp.status === 'Approved'" class="text-xs text-green-700 mt-1">
              Member record created automatically — see activity below.
            </p>
          </div>

          <!-- Activity History -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Activity</p>
            <ul class="space-y-2 max-h-36 overflow-y-auto">
              <li
                v-for="(entry, index) in detailApp.history"
                :key="index"
                class="flex gap-3 text-sm"
              >
                <span class="text-gray-400 whitespace-nowrap text-xs self-center">{{
                  formatDateTime(entry.at)
                }}</span>
                <span class="text-gray-600">{{ entry.action }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <template v-if="detailApp.status === 'Approved' || detailApp.status === 'Rejected'">
            <button
              @click="detailApp = null"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
            >
              Close
            </button>
          </template>
          <template v-else>
            <button
              @click="detailApp = null"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
            >
              Cancel
            </button>
            <button
              @click="requestReject"
              :disabled="!remarksDraft.trim()"
              class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              :title="!remarksDraft.trim() ? 'Remarks are required to reject' : ''"
            >
              Reject
            </button>
            <button
              @click="requestReturn"
              :disabled="!remarksDraft.trim()"
              class="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              :title="!remarksDraft.trim() ? 'Remarks are required to return' : ''"
            >
              Return
            </button>
            <button
              @click="requestApprove"
              :disabled="verifiedCount < detailApp.checklist.length"
              class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              :title="
                verifiedCount < detailApp.checklist.length ? 'Verify all requirements first' : ''
              "
            >
              Approve & Create Member
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- New Application (Walk-in) Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800">New Walk-in Application</h2>
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
                placeholder="e.g. Rosario"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                v-model="form.lastName"
                type="text"
                placeholder="e.g. Aquino"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
            <input
              v-model="form.phone"
              @input="sanitizePhone"
              type="tel"
              maxlength="11"
              placeholder="09XXXXXXXXX (11 digits)"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              v-model="form.address"
              type="text"
              placeholder="House no., street, city"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Email <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              v-model="form.email"
              type="email"
              placeholder="applicant@example.com"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div
            class="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm"
          >
            Walk-in entry — type the details exactly as written on the applicant's paper form, then
            keep the signed form on file at the coop office.
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
            @click="saveApplication"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Add Application
          </button>
        </div>
      </div>
    </div>

    <!-- Application Form Preview Modal (mock paper form) -->
    <div
      v-if="previewApp"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="previewApp = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800">
            Application Form — {{ previewApp.appNo }}
          </h2>
          <button
            @click="previewApp = null"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="p-6">
          <!-- Mock paper form -->
          <div class="border border-gray-300 rounded-lg p-6 text-sm bg-white">
            <div class="text-center border-b border-gray-300 pb-4 mb-4">
              <p class="font-bold text-gray-800 uppercase tracking-wide">
                KHS Mentor's Multi-Purpose Cooperative, Inc.
              </p>
              <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">
                Membership Application Form
              </p>
            </div>

            <div class="space-y-3">
              <div class="flex gap-4">
                <span class="text-gray-500 w-32 shrink-0">Name:</span>
                <span class="font-medium border-b border-gray-300 flex-1 pb-1">
                  {{ previewApp.firstName }} {{ previewApp.lastName }}
                </span>
              </div>
              <div class="flex gap-4">
                <span class="text-gray-500 w-32 shrink-0">Address:</span>
                <span class="border-b border-gray-300 flex-1 pb-1">
                  {{ previewApp.address }}
                </span>
              </div>
              <div class="flex gap-4">
                <span class="text-gray-500 w-32 shrink-0">Mobile:</span>
                <span class="border-b border-gray-300 flex-1 pb-1">{{ previewApp.phone }}</span>
              </div>
              <div class="flex gap-4">
                <span class="text-gray-500 w-32 shrink-0">Email:</span>
                <span class="border-b border-gray-300 flex-1 pb-1">
                  {{ previewApp.email || '—' }}
                </span>
              </div>
              <div class="flex gap-4">
                <span class="text-gray-500 w-32 shrink-0">Date Submitted:</span>
                <span class="border-b border-gray-300 flex-1 pb-1">
                  {{ formatDate(previewApp.submittedAt) }}
                </span>
              </div>
            </div>

            <div class="flex justify-between mt-10 text-xs text-gray-500">
              <div>
                <div class="w-48 border-t border-gray-400 pt-1">Signature over printed name</div>
              </div>
              <div>
                <div class="w-48 border-t border-gray-400 pt-1 text-right">
                  Received by (Coop Admin)
                </div>
              </div>
            </div>
          </div>

          <p class="text-xs text-gray-400 mt-4 text-center">
            Mock preview — once Supabase Storage is connected, this opens the exact PDF generated by
            the Flutter app (the real copy of the paper form).
          </p>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            @click="previewApp = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Member Created (Approval Success) Modal -->
    <div
      v-if="credentials"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6 text-center">
        <div
          class="w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-3"
        >
          ✓
        </div>
        <h2 class="text-lg font-semibold text-gray-800">Application Approved</h2>
        <p class="text-sm text-gray-500 mt-1">
          {{ credentials.memberNo }} · {{ credentials.name }} was created in the Members module.
        </p>

        <div
          class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-4 flex items-center justify-between gap-3"
        >
          <div class="min-w-0 text-left">
            <p class="text-xs text-gray-400">Temporary password</p>
            <p class="font-mono text-sm font-semibold text-gray-800 truncate">
              {{ credentials.tempPassword }}
            </p>
          </div>
          <button
            @click="copyTempPassword"
            class="text-xs font-medium text-green-700 hover:text-green-800 shrink-0"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>

        <p class="text-xs text-gray-500 mt-3">
          Hand this over face-to-face — the member must change it on first login.
        </p>

        <div class="flex justify-center gap-3 mt-5">
          <RouterLink
            to="/members"
            @click="credentials = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Go to Members
          </RouterLink>
          <button
            @click="credentials = null"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Done
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
            @click="confirmAction = null"
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
import { useApplicationsStore } from '../stores/applications'

const appsStore = useApplicationsStore()

// Review modal state
const detailApp = ref(null)
const reviewError = ref('')
const remarksDraft = ref('')

const isReadOnly = computed(
  () =>
    detailApp.value &&
    (detailApp.value.status === 'Approved' || detailApp.value.status === 'Rejected'),
)

const verifiedCount = computed(() =>
  detailApp.value ? detailApp.value.checklist.filter((item) => item.checked).length : 0,
)

function openReview(application) {
  detailApp.value = application
  reviewError.value = ''
  remarksDraft.value = application.remarks || ''
  // Pending / Returned move into Under Review as soon as the admin opens them
  appsStore.startReview(application.id)
}

// Form preview (mock paper form; real PDF comes from Supabase Storage later)
const previewApp = ref(null)

function viewForm(application) {
  previewApp.value = application
}

// Generic confirmation state
const confirmAction = ref(null) // { title, message, confirmLabel, danger, run }

function runConfirm() {
  const action = confirmAction.value
  confirmAction.value = null
  if (!action) return
  const result = action.run()
  // Store rejected it (e.g. unverified requirements) — show the reason in the review modal
  if (result && result.ok === false) reviewError.value = result.message
}

// Approval → auto-creates the member, then shows the credentials to hand over
const credentials = ref(null) // { memberNo, name, tempPassword }
const copied = ref(false)

function requestApprove() {
  const application = detailApp.value
  confirmAction.value = {
    title: 'Approve Application?',
    message: `${application.appNo} will be approved and a member record will be created automatically (status Active, temporary password issued to hand over in person).`,
    confirmLabel: 'Approve & Create Member',
    danger: false,
    run: () => {
      const result = appsStore.approveApplication(application.id)
      if (!result.ok) return result
      credentials.value = {
        memberNo: result.member.memberNo,
        name: `${result.member.firstName} ${result.member.lastName}`,
        tempPassword: result.tempPassword,
      }
      copied.value = false
      detailApp.value = null
      return { ok: true }
    },
  }
}

function requestReturn() {
  const application = detailApp.value
  confirmAction.value = {
    title: 'Return Application?',
    message: `${application.appNo} will be returned to the applicant to complete the requirements.`,
    confirmLabel: 'Return',
    danger: false,
    run: () => {
      const result = appsStore.returnApplication(application.id, remarksDraft.value)
      if (result.ok) detailApp.value = null
      return result
    },
  }
}

function requestReject() {
  const application = detailApp.value
  confirmAction.value = {
    title: 'Reject Application?',
    message: `${application.appNo} will be rejected. The applicant can file a new application later.`,
    confirmLabel: 'Reject',
    danger: true,
    run: () => {
      const result = appsStore.rejectApplication(application.id, remarksDraft.value)
      if (result.ok) detailApp.value = null
      return result
    },
  }
}

async function copyTempPassword() {
  try {
    await navigator.clipboard.writeText(credentials.value.tempPassword)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked — user can highlight and copy manually
  }
}

// New Application (Walk-in) modal state
const showModal = ref(false)
const formError = ref('')

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  email: '',
}
const form = reactive({ ...emptyForm })

function openAddModal() {
  formError.value = ''
  Object.assign(form, emptyForm)
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = ''
}

// 11 digits only, no letters/symbols (same rule as the Members module)
function sanitizePhone() {
  form.phone = form.phone.replace(/\D/g, '').slice(0, 11)
}

function saveApplication() {
  if (!form.firstName.trim() || !form.lastName.trim()) {
    formError.value = 'First name and last name are required.'
    return
  }
  if (!/^\d{11}$/.test(form.phone)) {
    formError.value = 'Mobile number must be exactly 11 digits (e.g. 09171234567).'
    return
  }
  if (!form.address.trim()) {
    formError.value = 'Address is required.'
    return
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    formError.value = 'Please enter a valid email address, or leave it blank.'
    return
  }

  const result = appsStore.addApplication({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phone: form.phone,
    address: form.address.trim(),
    email: form.email.trim(),
  })

  closeModal()
  // Jump straight into reviewing the application the admin just created
  openReview(result.application)
}

function statusClass(status) {
  const classes = {
    Pending: 'bg-amber-100 text-amber-700',
    'Under Review': 'bg-blue-100 text-blue-700',
    Approved: 'bg-green-100 text-green-700',
    Returned: 'bg-purple-100 text-purple-700',
    Rejected: 'bg-red-100 text-red-600',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
