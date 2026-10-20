<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Loans</h1>
          <p class="text-sm text-gray-500 mt-1">{{ loansStore.loans.length }} loans</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            @click="showSimulator = true"
            class="border border-green-600 text-green-700 bg-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition duration-200"
          >
            Loan Simulator
          </button>
          <button
            @click="openNewLoan"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            + New Loan Application
          </button>
        </div>
      </div>

      <!-- Info banner — the client's rules -->
      <div
        class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 text-sm"
      >
        Coop rules: <strong>committee approval</strong> · ceiling is
        <strong>2× capital share</strong> · <strong>diminishing</strong> interest (1.5%, business
        2%) · max <strong>2 loans</strong> · delinquent after <strong>6 months</strong> without
        payment.
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-green-500"></span> Outstanding
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">
            {{ formatPeso(loansStore.outstandingBalance) }}
          </p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-blue-400"></span> Active
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">{{ loansStore.activeCount }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span> For Approval
          </div>
          <p class="text-2xl font-bold text-gray-800 mt-2">
            {{ loansStore.forApprovalCount }}
          </p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div class="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase">
            <span class="w-2 h-2 rounded-full bg-red-500"></span> Delinquent
          </div>
          <p
            class="text-2xl font-bold mt-2"
            :class="loansStore.delinquentCount > 0 ? 'text-red-600' : 'text-gray-800'"
          >
            {{ loansStore.delinquentCount }}
          </p>
        </div>
      </div>

      <!-- Non-blocking warning from the last approval (documents not linked) -->
      <p
        v-if="approvalNotice"
        class="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl mb-6"
      >
        {{ approvalNotice }}
      </p>

      <!-- App-filed loan requests — the mobile app's review queue -->
      <div
        v-if="loansStore.pendingRequests.length > 0 || loansStore.requestsError"
        class="bg-amber-50 border border-amber-200 rounded-xl mb-6"
      >
        <div class="px-4 py-3 border-b border-amber-200 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-amber-800">Loan requests from the mobile app</p>
            <p class="text-xs text-amber-700 mt-0.5">
              {{ loansStore.pendingRequests.length }} awaiting review
            </p>
          </div>
          <button
            @click="loansStore.fetchRequests()"
            :disabled="loansStore.requestsLoading"
            class="border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition duration-200 disabled:opacity-50"
          >
            {{ loansStore.requestsLoading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
        <p v-if="loansStore.requestsError" class="px-4 py-2 text-sm text-red-600">
          {{ loansStore.requestsError }}
        </p>
        <ul v-if="loansStore.pendingRequests.length" class="divide-y divide-amber-200">
          <li
            v-for="request in loansStore.pendingRequests"
            :key="request.id"
            class="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-800">
                {{ request.memberName }}
                <span v-if="request.memberNo" class="text-gray-400 font-normal"
                  >· {{ request.memberNo }}</span
                >
              </p>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ typeLabel(request.type) }} · {{ formatPeso(request.amount) }} ·
                {{ request.termMonths }} month(s) · filed
                {{ formatDate(request.dateSubmitted) }}
              </p>
            </div>
            <button
              @click="openRequest(request)"
              class="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-700 transition duration-200"
            >
              Review
            </button>
          </li>
        </ul>
      </div>

      <!-- Search + Filters -->
      <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          v-model="loansStore.search"
          type="text"
          placeholder="Search by loan no, member name or member no..."
          class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          v-model="loansStore.statusFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Statuses</option>
          <option value="For Approval">For Approval</option>
          <option value="Approved">Approved</option>
          <option value="Released">Released</option>
          <option value="Paid">Paid</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select
          v-model="loansStore.typeFilter"
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="All">All Types</option>
          <option v-for="type in LOAN_TYPES" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
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
              <input v-model="columns.type" type="checkbox" class="accent-green-600" />
              Type
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.principal" type="checkbox" class="accent-green-600" />
              Principal
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.balance" type="checkbox" class="accent-green-600" />
              Balance
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.status" type="checkbox" class="accent-green-600" />
              Status
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="columns.date" type="checkbox" class="accent-green-600" />
              Date
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

      <!-- Loans Table -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="table-scroll overflow-x-auto">
          <table class="w-full table-fixed text-sm" :style="{ minWidth: tableMinWidth }">
            <thead>
              <tr
                class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <SortableTh class="px-6 py-3 w-[11%]" :store="loansStore" sort-key="loanNo">
                  Loan No
                </SortableTh>
                <SortableTh class="px-6 py-3 w-[22%]" :store="loansStore" sort-key="memberName">
                  Member
                </SortableTh>
                <SortableTh
                  v-if="columns.type"
                  class="px-6 py-3 w-[15%]"
                  :store="loansStore"
                  sort-key="type"
                >
                  Type
                </SortableTh>
                <SortableTh
                  v-if="columns.principal"
                  class="px-6 py-3 w-[14%]"
                  :store="loansStore"
                  sort-key="principal"
                >
                  Principal
                </SortableTh>
                <SortableTh
                  v-if="columns.balance"
                  class="px-6 py-3 w-[12%]"
                  :store="loansStore"
                  sort-key="balance"
                >
                  Balance
                </SortableTh>
                <SortableTh
                  v-if="columns.status"
                  class="px-6 py-3 w-[11%]"
                  :store="loansStore"
                  sort-key="status"
                >
                  Status
                </SortableTh>
                <SortableTh
                  v-if="columns.date"
                  class="px-6 py-3 w-[10%]"
                  :store="loansStore"
                  sort-key="date"
                >
                  Date
                </SortableTh>
                <th class="px-6 py-3 w-[13%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="loan in loansStore.paginatedLoans"
                :key="loan.id"
                class="hover:bg-gray-50 transition duration-150"
              >
                <td class="px-6 py-4 font-mono text-xs text-gray-500">{{ loan.loanNo }}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <PhotoPreview
                      v-if="loan.memberPhoto"
                      :path="loan.memberPhoto"
                      variant="avatar-sm"
                    />
                    <div
                      v-else
                      class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      {{ initials(loan.memberName) }}
                    </div>
                    <div>
                      <span class="font-medium text-gray-800">{{ loan.memberName }}</span>
                      <p class="text-xs text-gray-400">{{ loan.memberNo }}</p>
                    </div>
                  </div>
                </td>
                <td v-if="columns.type" class="px-6 py-4">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                  >
                    {{ typeMeta(loan.type).label }}
                  </span>
                </td>
                <td v-if="columns.principal" class="px-6 py-4 font-medium text-gray-800">
                  {{ formatPeso(loan.principal) }}
                </td>
                <td
                  v-if="columns.balance"
                  class="px-6 py-4"
                  :class="isDelinquent(loan) ? 'text-red-600 font-semibold' : 'text-gray-500'"
                >
                  {{ formatPeso(balanceOf(loan)) }}
                </td>
                <td v-if="columns.status" class="px-6 py-4">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-medium"
                    :class="statusClass(loan.status)"
                  >
                    {{ loan.status }}
                  </span>
                  <span
                    v-if="isDelinquent(loan)"
                    class="ml-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600"
                  >
                    Delinquent
                  </span>
                </td>
                <td v-if="columns.date" class="px-6 py-4 text-gray-500">
                  {{ formatDate(loan.createdAt) }}
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    @click="openDetails(loan)"
                    class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
                  >
                    Manage
                  </button>
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="loansStore.filteredLoans.length === 0">
                <td :colspan="visibleColumnCount" class="px-6 py-10 text-center text-gray-400">
                  No loans found.
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
              :value="loansStore.pageSize"
              @change="loansStore.setPageSize(Number($event.target.value))"
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
              @click="loansStore.setPage(loansStore.page - 1)"
              :disabled="loansStore.page <= 1"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span class="text-sm text-gray-600 px-2 whitespace-nowrap">
              Page {{ loansStore.page }} of {{ loansStore.totalPages }}
            </span>
            <button
              @click="loansStore.setPage(loansStore.page + 1)"
              :disabled="loansStore.page >= loansStore.totalPages"
              class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loan Details Modal -->
    <div
      v-if="detailLoan"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="detailLoan = null"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3 flex-wrap">
            <h2 class="text-lg font-semibold text-gray-800">{{ detailLoan.loanNo }}</h2>
            <span
              class="px-2.5 py-1 rounded-full text-xs font-medium"
              :class="statusClass(detailLoan.status)"
            >
              {{ detailLoan.status }}
            </span>
            <span
              v-if="isDelinquent(detailLoan)"
              class="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600"
            >
              Delinquent
            </span>
          </div>
          <button
            @click="detailLoan = null"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          <!-- Error message -->
          <div
            v-if="actionError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ actionError }}
          </div>

          <!-- Delinquent warning -->
          <div
            v-if="isDelinquent(detailLoan)"
            class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            No payment for 6+ months — delinquent per coop rules. Send a letter/text reminder.
          </div>

          <!-- Member + type — photo on record takes the avatar spot -->
          <div class="flex items-center gap-4">
            <PhotoPreview
              v-if="detailLoan.memberPhoto"
              :path="detailLoan.memberPhoto"
              variant="avatar-md"
              class="shrink-0"
            />
            <div
              v-else
              class="w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            >
              {{ initials(detailLoan.memberName) }}
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-gray-800">{{ detailLoan.memberName }}</p>
              <p class="text-sm text-gray-500">{{ detailLoan.memberNo }}</p>
            </div>
            <span
              class="ml-auto px-2.5 py-1 rounded-full text-xs font-medium shrink-0 bg-gray-100 text-gray-600"
            >
              {{ typeMeta(detailLoan.type).label }}
            </span>
          </div>

          <!-- Loan details -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Principal
              </p>
              <p class="text-gray-800 font-semibold">{{ formatPeso(detailLoan.principal) }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Interest
              </p>
              <p class="text-gray-800 font-semibold">
                {{ detailLoan.ratePercent }}%/mo · diminishing
              </p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Term</p>
              <p class="text-gray-800 font-semibold">{{ detailLoan.termMonths }} months</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Total Due
              </p>
              <p class="text-gray-800 font-semibold">{{ formatPeso(detailLoan.totalDue) }}</p>
            </div>
            <div class="col-span-2 sm:col-span-2">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Co-maker{{ detailLoan.coMakers.length > 1 ? 's' : '' }}
              </p>
              <p class="text-gray-700">{{ detailLoan.coMakers.join(', ') || '—' }}</p>
            </div>
            <div class="col-span-2 sm:col-span-2">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Released
              </p>
              <p class="text-gray-700">
                {{
                  detailLoan.releasedAt
                    ? [formatDate(detailLoan.releasedAt), detailLoan.releaseChannel]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Not yet released'
                }}
              </p>
            </div>
          </div>

          <!-- Payment progress -->
          <div v-if="detailLoan.releasedAt" class="border-t border-gray-100 pt-4 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Payments</p>
              <p class="text-gray-500">
                {{ formatPeso(paidSum) }} paid of {{ formatPeso(detailLoan.totalDue) }}
              </p>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2.5">
              <div
                class="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                :style="{ width: progressPct + '%' }"
              ></div>
            </div>
            <p v-if="dueRow" class="text-sm text-gray-600">
              Next due: <strong>{{ formatDate(dueRow.dueDate) }}</strong> —
              {{ formatPeso(dueRow.payment) }}
            </p>
            <p v-else class="text-sm text-green-700 font-medium">Fully paid</p>
          </div>

          <!-- Requirements -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Requirements
            </p>
            <ul class="space-y-1.5 text-sm text-gray-700">
              <li
                v-for="(item, index) in detailLoan.requirements"
                :key="index"
                class="flex items-center gap-2"
              >
                <span :class="item.checked ? 'text-green-600' : 'text-red-500'">
                  {{ item.checked ? '✓' : '✗' }}
                </span>
                {{ item.label }}
              </li>
            </ul>
          </div>

          <!-- Files — scans of receipts, checks and loan paperwork -->
          <AttachmentPanel kind="loan" :id="detailLoan.id" class="border-t border-gray-100 pt-4" />

          <!-- Payment history -->
          <div v-if="detailLoan.payments.length > 0" class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Payment History
            </p>
            <div class="table-scroll overflow-x-auto max-h-40 overflow-y-auto">
              <table class="w-full min-w-[580px] text-sm">
                <thead>
                  <tr class="text-left text-xs font-medium text-gray-400 uppercase">
                    <th class="py-2 pr-4">Date</th>
                    <th class="py-2 pr-4">Amount</th>
                    <th class="py-2 pr-4">Channel</th>
                    <th class="py-2 pr-4">Note</th>
                    <th class="py-2 pr-4">Status</th>
                    <th class="py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="payment in detailLoan.payments" :key="payment.id">
                    <td class="py-2 pr-4 text-gray-500 whitespace-nowrap">
                      {{ formatDate(payment.at) }}
                    </td>
                    <td class="py-2 pr-4 font-medium text-gray-800">
                      {{ formatPeso(payment.amount) }}
                    </td>
                    <td class="py-2 pr-4 text-gray-600">{{ payment.channel }}</td>
                    <td class="py-2 pr-4 text-gray-400 text-xs">{{ payment.note || '—' }}</td>
                    <td class="py-2 pr-4">
                      <div class="flex items-center gap-2">
                        <span
                          class="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                          :class="
                            payment.status === 'Recorded'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          "
                        >
                          {{ payment.status === 'Recorded' ? 'Verified' : 'Pending' }}
                        </span>
                        <button
                          v-if="payment.status !== 'Recorded'"
                          @click="requestVerify(payment)"
                          class="text-green-700 hover:text-green-800 font-medium text-xs"
                        >
                          Verify
                        </button>
                      </div>
                    </td>
                    <td class="py-2">
                      <div class="flex items-start gap-2">
                        <PhotoPreview v-if="payment.receiptPath" :path="payment.receiptPath" />
                        <span v-else class="text-gray-300 self-center">—</span>
                        <div class="flex flex-col gap-1 text-xs">
                          <button
                            @click="pickReceiptFor(payment)"
                            class="text-green-700 hover:text-green-800 font-medium"
                          >
                            {{ payment.receiptPath ? 'Replace' : 'Attach' }}
                          </button>
                          <button
                            v-if="payment.receiptPath"
                            @click="requestRemoveReceipt(payment)"
                            class="text-red-500 hover:text-red-700 font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Amortization schedule (diminishing) -->
          <div class="border-t border-gray-100 pt-4">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Amortization Schedule
              </p>
              <p v-if="!detailLoan.releasedAt" class="text-xs text-gray-400">preview</p>
            </div>
            <div class="table-scroll overflow-x-auto max-h-52 overflow-y-auto">
              <table class="w-full min-w-[520px] text-xs">
                <thead>
                  <tr
                    class="text-left text-xs font-medium text-gray-400 uppercase sticky top-0 bg-white"
                  >
                    <th class="py-2 pr-3">#</th>
                    <th class="py-2 pr-3">Due Date</th>
                    <th class="py-2 pr-3">Principal</th>
                    <th class="py-2 pr-3">Interest</th>
                    <th class="py-2 pr-3">Payment</th>
                    <th class="py-2">Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="row in schedule" :key="row.month">
                    <td class="py-2 pr-3 text-gray-400">{{ row.month }}</td>
                    <td class="py-2 pr-3 text-gray-500 whitespace-nowrap">
                      {{ formatDate(row.dueDate) }}
                    </td>
                    <td class="py-2 pr-3 text-gray-600">{{ formatPeso(row.principal) }}</td>
                    <td class="py-2 pr-3 text-gray-600">{{ formatPeso(row.interest) }}</td>
                    <td class="py-2 pr-3 font-medium text-gray-800">
                      {{ formatPeso(row.payment) }}
                    </td>
                    <td class="py-2 text-gray-500">{{ formatPeso(row.balance) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Remarks -->
          <div class="border-t border-gray-100 pt-4">
            <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              {{ detailLoan.status === 'For Approval' ? 'Committee Remarks' : 'Remarks' }}
            </label>
            <textarea
              v-model="remarksDraft"
              :readonly="detailLoan.status !== 'For Approval'"
              rows="2"
              placeholder="Required when rejecting... optional notes when approving"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent read-only:bg-gray-50"
            ></textarea>
          </div>

          <!-- Release panel (Approved — member claims in person) -->
          <div
            v-if="detailLoan.status === 'Approved'"
            class="border border-green-200 bg-green-50 rounded-lg px-4 py-3 space-y-3"
          >
            <p class="text-sm font-medium text-green-800">
              Ready for release — the member must claim it in person (cash or Landbank cheque).
            </p>
            <div class="flex items-center gap-3">
              <select
                v-model="releaseChannel"
                class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option v-for="channel in RELEASE_CHANNELS" :key="channel" :value="channel">
                  {{ channel }}
                </option>
              </select>
              <button
                @click="requestRelease"
                class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition duration-200"
              >
                Release Loan
              </button>
            </div>
          </div>

          <!-- Activity History -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Activity</p>
            <ul class="space-y-2 max-h-36 overflow-y-auto">
              <li
                v-for="(entry, index) in detailLoan.history"
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
        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-wrap shrink-0">
          <button
            v-if="noteEligible"
            @click="printLoanNote"
            class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition duration-200"
            title="Print the coop's Loan Note form, pre-filled from this loan"
          >
            Print Loan Note
          </button>

          <button
            v-if="auth.isDeveloper"
            @click="openDeleteLoanTest"
            class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition duration-200"
          >
            Delete Test Loan
          </button>

          <template v-if="detailLoan.status === 'For Approval'">
            <button
              @click="detailLoan = null"
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
              @click="requestApprove"
              class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
            >
              Approve (Committee)
            </button>
          </template>

          <template v-else-if="detailLoan.status === 'Released'">
            <button
              v-if="isDelinquent(detailLoan)"
              @click="requestReminder"
              class="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 transition duration-200"
            >
              Send Reminder
            </button>
            <button
              @click="detailLoan = null"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
            >
              Close
            </button>
            <button
              @click="openPayment"
              class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
            >
              Record Payment
            </button>
          </template>

          <button
            v-else
            @click="detailLoan = null"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- New Loan Application Modal -->
    <div
      v-if="showNew"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeNew"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">New Loan Application</h2>
          <button @click="closeNew" class="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <!-- Error message -->
          <div
            v-if="newFormError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ newFormError }}
          </div>

          <!-- Member — searchable picker; 150+ members overflow a native select -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <MemberPicker v-model="newForm.memberId" :options="memberOptions" />
          </div>

          <!-- Eligibility panel -->
          <div
            v-if="!newForm.memberId"
            class="bg-gray-50 border border-gray-200 text-gray-500 px-4 py-3 rounded-lg text-sm"
          >
            Select a member to check loan eligibility.
          </div>
          <div
            v-else-if="eligibility.ok"
            class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm space-y-1"
          >
            <p class="font-semibold">Eligible to loan</p>
            <p>
              Ceiling: <strong>{{ formatPeso(eligibility.ceiling) }}</strong> (2× capital share{{
                eligibility.ceiling >= CEILING_CAP ? `, capped at ${formatPeso(CEILING_CAP)}` : ''
              }})
            </p>
            <p v-if="eligibility.firstLoan">
              First loan — capped at <strong>80% = {{ formatPeso(eligibility.limit) }}</strong>
            </p>
            <p v-else>
              Maximum this member can borrow: <strong>{{ formatPeso(eligibility.limit) }}</strong>
            </p>
            <p>
              Concurrent loans: {{ eligibility.activeCount }}/2
              <span v-if="eligibility.hasEmergency"> · active emergency loan</span>
            </p>
          </div>
          <div
            v-else
            class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm space-y-1"
          >
            <p class="font-semibold">Not eligible yet</p>
            <ul class="list-disc list-inside space-y-0.5">
              <li v-for="(reason, index) in eligibility.reasons" :key="index">{{ reason }}</li>
            </ul>
          </div>

          <!-- Type + Amount -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
              <select
                v-model="newForm.type"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option v-for="type in LOAN_TYPES" :key="type.value" :value="type.value">
                  {{ type.label }} ({{ type.rate }}%)
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
              <input
                v-model="newForm.principal"
                type="number"
                min="1"
                :max="amountMax"
                placeholder="e.g. 50000"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p class="text-xs text-gray-400 mt-1">
                {{
                  newForm.type === 'Emergency'
                    ? `Emergency loans: max ${formatPeso(EMERGENCY_MAX)} (2–6 months)`
                    : eligibility.ok
                      ? `Maximum: ${formatPeso(eligibility.limit)}`
                      : ''
                }}
              </p>
            </div>
          </div>

          <!-- Term + Rate -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
              <select
                v-model.number="newForm.termMonths"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option v-for="months in termOptions" :key="months" :value="months">
                  {{ months }} months
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Interest Rate</label>
              <!-- Plain display, not an input — the rate comes from the loan
                   type, so there is nothing to focus or edit here. -->
              <div
                class="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-lg px-4 py-2 text-sm"
              >
                {{ typeInfo.rate }}% per month — diminishing (auto)
              </div>
            </div>
          </div>

          <!-- Co-makers -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Co-maker{{ requiredCoMakers > 1 ? 's' : '' }}
              <span class="text-gray-400 font-normal">
                ({{ requiredCoMakers }} required — ₱100,000+ needs two)
              </span>
            </label>
            <div class="space-y-2">
              <input
                v-model="newForm.coMakers[0]"
                type="text"
                placeholder="Co-maker full name"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <input
                v-if="requiredCoMakers > 1"
                v-model="newForm.coMakers[1]"
                type="text"
                placeholder="Second co-maker full name"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <!-- Requirements -->
          <div>
            <p class="text-sm font-medium text-gray-700 mb-2">Requirements</p>
            <ul class="space-y-2">
              <li v-for="item in visibleReqs" :key="item.key">
                <label class="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                  <input
                    v-model="reqs[item.key]"
                    type="checkbox"
                    class="accent-green-600 w-4 h-4"
                  />
                  {{ item.label }}
                </label>
              </li>
            </ul>
          </div>

          <!-- Computation preview -->
          <div
            v-if="Number(newForm.principal) > 0"
            class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"
          >
            <div>
              <p class="text-xs text-gray-400">1st month</p>
              <p class="font-semibold text-gray-800">{{ formatPeso(computation.firstPayment) }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Last month</p>
              <p class="font-semibold text-gray-800">{{ formatPeso(computation.lastPayment) }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Total interest</p>
              <p class="font-semibold text-gray-800">{{ formatPeso(computation.interestTotal) }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Total to pay</p>
              <p class="font-semibold text-green-700">{{ formatPeso(computation.totalDue) }}</p>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            @click="closeNew"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="submitLoan"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Submit for Approval
          </button>
        </div>
      </div>
    </div>

    <!-- Record Payment Modal -->
    <div
      v-if="showPayment"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closePayment"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">Record Payment</h2>
          <button
            @click="closePayment"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div
            v-if="payError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ payError }}
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
            <div class="flex gap-2">
              <input
                v-model="payForm.amount"
                type="number"
                min="1"
                placeholder="0.00"
                class="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                @click="payForm.amount = String(pendingBalance)"
                class="border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-100 transition duration-200"
              >
                Full balance
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              Remaining balance: {{ formatPeso(pendingBalance) }}
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              v-model="payForm.at"
              type="date"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Channel</label>
            <select
              v-model="payForm.channel"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option v-for="channel in PAYMENT_CHANNELS" :key="channel" :value="channel">
                {{ channel }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Note <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              v-model="payForm.note"
              type="text"
              placeholder="e.g. paid at coop counter"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Receipt photo <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              ref="payReceiptInput"
              type="file"
              :accept="PHOTO_ACCEPT"
              class="hidden"
              @change="onPayReceiptPicked"
            />
            <div class="flex items-center gap-2">
              <button
                @click="payReceiptInput?.click()"
                class="border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-100 transition duration-200 max-w-[220px] truncate"
              >
                {{ payReceiptName || '+ Choose photo' }}
              </button>
              <button
                v-if="payReceiptName"
                @click="clearPayReceipt"
                class="text-red-500 hover:text-red-700 text-xs font-medium"
              >
                Remove
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              JPEG, PNG or WebP — large photos are resized automatically. Shows in the payment
              history.
            </p>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            @click="closePayment"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="savePayment"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Save Payment
          </button>
        </div>
      </div>
    </div>

    <!-- Shared file picker for attaching or replacing a payment receipt -->
    <input
      ref="receiptInput"
      type="file"
      :accept="PHOTO_ACCEPT"
      class="hidden"
      @change="onReceiptPicked"
    />

    <!-- Review an app-filed loan request -->
    <div
      v-if="reviewRequest"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeRequest"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 class="text-lg font-semibold text-gray-800">Review Loan Request</h2>
          <button
            @click="closeRequest"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div
            v-if="requestError"
            class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm"
          >
            {{ requestError }}
          </div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div class="col-span-2">
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Member</dt>
              <dd class="text-gray-800">
                {{ reviewRequest.memberName }}
                <span v-if="reviewRequest.memberNo" class="text-gray-500"
                  >({{ reviewRequest.memberNo }})</span
                >
              </dd>
            </div>
            <div>
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Type</dt>
              <dd class="text-gray-800">{{ typeLabel(reviewRequest.type) }}</dd>
            </div>
            <div>
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Amount</dt>
              <dd class="text-gray-800">{{ formatPeso(reviewRequest.amount) }}</dd>
            </div>
            <div>
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Term</dt>
              <dd class="text-gray-800">{{ reviewRequest.termMonths }} month(s)</dd>
            </div>
            <div>
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Filed</dt>
              <dd class="text-gray-800">{{ formatDate(reviewRequest.dateSubmitted) }}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-gray-400 text-xs uppercase tracking-wider">Purpose</dt>
              <dd class="text-gray-800">{{ reviewRequest.purpose || '—' }}</dd>
            </div>
          </dl>

          <!-- Documents the member attached when filing from the app -->
          <div class="rounded-lg border border-gray-200 px-4 py-3">
            <p class="text-sm font-medium text-gray-700 mb-2">Documents from the mobile app</p>
            <p v-if="docsLoading" class="text-xs text-gray-400">Loading documents…</p>
            <p v-else-if="docsError" class="text-xs text-red-600">{{ docsError }}</p>
            <ul v-else-if="requestDocs.length" class="space-y-2">
              <li
                v-for="doc in requestDocs"
                :key="doc.path"
                class="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <p class="text-sm text-gray-800 truncate">{{ doc.name }}</p>
                  <p class="text-xs text-gray-400 truncate">
                    {{ doc.type === 'application/pdf' ? 'PDF' : 'Image'
                    }}{{ docSizeLabel(doc.size) }}
                  </p>
                </div>
                <button
                  class="text-xs font-medium text-green-700 hover:text-green-800 shrink-0"
                  @click="viewRequestDoc(doc)"
                >
                  View
                </button>
              </li>
            </ul>
            <p v-else class="text-xs text-gray-400">No documents attached to this request.</p>
          </div>

          <!-- Live eligibility check against the coop's rules -->
          <div
            v-if="reviewEligibility"
            class="rounded-lg px-4 py-3 text-sm border"
            :class="
              reviewEligibility.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            "
          >
            <p v-if="reviewEligibility.ok" class="font-medium">
              Eligible — ceiling {{ formatPeso(reviewEligibility.limit)
              }}<span v-if="reviewEligibility.firstLoan"> (first loan: 80%)</span>
            </p>
            <ul v-else class="space-y-1">
              <li v-for="(reason, index) in reviewEligibility.reasons" :key="index">
                • {{ reason }}
              </li>
            </ul>
          </div>

          <div>
            <p class="text-sm font-medium text-gray-700 mb-2">
              Co-maker<span v-if="requiredCoMakerCount > 1">s</span> —
              {{ requiredCoMakerCount }} required for this amount
            </p>
            <p v-if="reviewRequest?.requestedCoMakers?.length" class="text-xs text-gray-500 mb-2">
              Entered in the app: {{ reviewRequest.requestedCoMakers.join(', ') }} — confirm each
              person is a member before approving.
            </p>
            <div class="space-y-2">
              <input
                v-for="(_, index) in coMakerDrafts"
                :key="index"
                v-model="coMakerDrafts[index]"
                type="text"
                :placeholder="`Co-maker ${index + 1} — member name or KHS number`"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Approval note (optional)</label
            >
            <textarea
              v-model="approvalNote"
              rows="2"
              placeholder="e.g. Co-maker verified, certificate of seminar on file"
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Remarks — required to return or reject</label
            >
            <textarea
              v-model="requestRemarks"
              rows="2"
              placeholder="e.g. Missing co-maker — ask the member to re-file with one."
              class="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            ></textarea>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-wrap shrink-0">
          <button
            @click="closeRequest"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
          <button
            @click="submitRequestDecision('Returned')"
            class="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 transition duration-200"
          >
            Return
          </button>
          <button
            @click="submitRequestDecision('Rejected')"
            class="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition duration-200"
          >
            Reject
          </button>
          <button
            @click="approveRequest"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200"
          >
            Approve
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
    <!-- Loan Simulator — quote a loan before any record exists -->
    <div
      v-if="showSimulator"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="showSimulator = false"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Loan Simulator</h2>
            <p class="text-xs text-gray-400 mt-0.5">Preview only — nothing is saved.</p>
          </div>
          <button
            @click="showSimulator = false"
            class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <!-- Inputs -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Loan type</label>
              <select
                v-model="simForm.type"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option v-for="type in LOAN_TYPES" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
              <input
                v-model.number="simForm.amount"
                type="number"
                min="1"
                step="any"
                placeholder="0.00"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
              <input
                v-model.number="simForm.termMonths"
                type="number"
                min="1"
                max="36"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Release date</label>
              <input
                v-model="simForm.start"
                type="date"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <p class="text-xs text-gray-400">
            {{ simRate }}% per month · diminishing balance — the payment shrinks every month as the
            interest is charged only on the remaining balance.
          </p>

          <!-- Results -->
          <div v-if="simValid" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-green-50 border border-green-100 rounded-lg p-3">
              <p class="text-xs font-medium text-green-700 uppercase tracking-wider">
                First payment
              </p>
              <p class="text-lg font-bold text-gray-800 mt-1">
                {{ formatPeso(simTotals.firstPayment) }}
              </p>
              <p class="text-xs text-gray-400">month 1</p>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-lg p-3">
              <p class="text-xs font-medium text-green-700 uppercase tracking-wider">
                Last payment
              </p>
              <p class="text-lg font-bold text-gray-800 mt-1">
                {{ formatPeso(simTotals.lastPayment) }}
              </p>
              <p class="text-xs text-gray-400">month {{ simForm.termMonths }}</p>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-lg p-3">
              <p class="text-xs font-medium text-green-700 uppercase tracking-wider">
                Total interest
              </p>
              <p class="text-lg font-bold text-gray-800 mt-1">
                {{ formatPeso(simTotals.interestTotal) }}
              </p>
              <p class="text-xs text-gray-400">over the whole term</p>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-lg p-3">
              <p class="text-xs font-medium text-green-700 uppercase tracking-wider">
                Total to pay
              </p>
              <p class="text-lg font-bold text-gray-800 mt-1">
                {{ formatPeso(simTotals.totalDue) }}
              </p>
              <p class="text-xs text-gray-400">principal + interest</p>
            </div>
          </div>

          <div
            v-else
            class="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm"
          >
            Enter an amount above zero and a term between 1 and 36 months.
          </div>

          <!-- Coop rule reminders — the caps the real application enforces -->
          <div v-if="simNotes.length" class="space-y-2">
            <p
              v-for="note in simNotes"
              :key="note"
              class="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm"
            >
              {{ note }}
            </p>
          </div>

          <p class="text-xs text-gray-400">
            Actual ceiling: 2× the member's capital share (max ₱200,000). Emergency loans max at
            ₱20,000. Amounts of ₱100,000 and above need 2 co-makers.
          </p>

          <!-- Schedule -->
          <div v-if="simValid" class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Amortization Schedule
            </p>
            <div class="table-scroll overflow-x-auto max-h-64 overflow-y-auto">
              <table class="w-full min-w-[520px] text-xs">
                <thead>
                  <tr
                    class="text-left text-xs font-medium text-gray-400 uppercase sticky top-0 bg-white"
                  >
                    <th class="py-2 pr-3">#</th>
                    <th class="py-2 pr-3">Due Date</th>
                    <th class="py-2 pr-3">Principal</th>
                    <th class="py-2 pr-3">Interest</th>
                    <th class="py-2 pr-3">Payment</th>
                    <th class="py-2">Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="row in simSchedule" :key="row.month">
                    <td class="py-2 pr-3 text-gray-400">{{ row.month }}</td>
                    <td class="py-2 pr-3 text-gray-500 whitespace-nowrap">
                      {{ formatDate(row.dueDate) }}
                    </td>
                    <td class="py-2 pr-3 text-gray-600">{{ formatPeso(row.principal) }}</td>
                    <td class="py-2 pr-3 text-gray-600">{{ formatPeso(row.interest) }}</td>
                    <td class="py-2 pr-3 font-medium text-gray-800">
                      {{ formatPeso(row.payment) }}
                    </td>
                    <td class="py-2 text-gray-500">{{ formatPeso(row.balance) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex justify-end shrink-0">
          <button
            @click="showSimulator = false"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    <!-- Developer-only: delete a TEST loan (typed confirmation) -->
    <div
      v-if="deleteLoanTestOpen && detailLoan"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="deleteLoanTestOpen = false"
    >
      <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-2">Delete test loan?</h2>
        <p class="text-sm text-gray-500 mb-4">
          This permanently removes <strong>{{ detailLoan.loanNo }}</strong> together with its
          payments, co-maker rows and attached files. The audit log keeps its trail — deletions are
          logged, never erased. Only ever do this for test loans; a real member's loan history is
          the record the coop is required to keep.
        </p>
        <p class="text-sm text-gray-700 mb-2">
          Type the loan number <strong>{{ detailLoan.loanNo }}</strong> to confirm.
        </p>
        <input
          v-model="deleteLoanTestConfirm"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          :placeholder="detailLoan.loanNo"
        />
        <p v-if="deleteLoanTestError" class="text-sm text-red-600 mb-2">
          {{ deleteLoanTestError }}
        </p>
        <div class="flex justify-end gap-3 mt-4">
          <button
            @click="deleteLoanTestOpen = false"
            class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
          >
            Cancel
          </button>
          <button
            @click="runDeleteLoanTest"
            :disabled="
              deleteLoanTestBusy ||
              deleteLoanTestConfirm.trim().toUpperCase() !== String(detailLoan.loanNo).toUpperCase()
            "
            class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition duration-200 disabled:opacity-50"
          >
            {{ deleteLoanTestBusy ? 'Deleting…' : 'Delete permanently' }}
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { persistentColumns } from '../lib/uiPrefs'
import AppLayout from '../components/AppLayout.vue'
import MemberPicker from '../components/MemberPicker.vue'
import SortableTh from '../components/SortableTh.vue'
import PhotoPreview from '../components/PhotoPreview.vue'
import AttachmentPanel from '../components/AttachmentPanel.vue'
import { PHOTO_ACCEPT } from '../lib/documents'
import {
  useLoansStore,
  LOAN_TYPES,
  PAYMENT_CHANNELS,
  RELEASE_CHANNELS,
  COMAKER_THRESHOLD,
  EMERGENCY_MAX,
  CEILING_CAP,
} from '../stores/loans'
import { useMembersStore } from '../stores/members'
import { useAuthStore } from '../stores/auth'
import { generateLoanNote } from '../lib/loanNotePdf'
import { loanTotals, buildSchedule, nextDue } from '../utils/amortization'

const loansStore = useLoansStore()
const auth = useAuthStore()
const membersStore = useMembersStore()

// Column visibility — Loan No, Member and Actions always show
const columns = persistentColumns('loans', {
  type: true,
  principal: true,
  balance: true,
  status: true,
  date: true,
})
const showColumnPicker = ref(false)

// Counts the empty-state colspan; only force horizontal scroll when
// enough columns are visible.
const visibleColumnCount = computed(() => 3 + Object.values(columns).filter(Boolean).length)
const tableMinWidth = computed(() =>
  Object.values(columns).filter(Boolean).length >= 3 ? '960px' : '760px',
)

// ---------- helpers ----------
function typeMeta(type) {
  return LOAN_TYPES.find((item) => item.value === type) || LOAN_TYPES[0]
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function statusClass(status) {
  const classes = {
    'For Approval': 'bg-amber-100 text-amber-700',
    Approved: 'bg-blue-100 text-blue-700',
    Released: 'bg-green-100 text-green-700',
    Paid: 'bg-gray-100 text-gray-600',
    Rejected: 'bg-red-100 text-red-600',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function formatPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Local date as yyyy-mm-dd for date inputs (toISOString shifts the day
// west of UTC).
function todayInput() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

const { paidOf, balanceOf, isDelinquent } = loansStore

// ---------- details modal ----------
const detailLoan = ref(null)
const actionError = ref('')
const remarksDraft = ref('')
const releaseChannel = ref('Cash')

// Developer-only test-data cleanup (22_developer_role.sql) — typed
// loan number, RLS-gated role, audit-logged removal.
const deleteLoanTestOpen = ref(false)
const deleteLoanTestConfirm = ref('')
const deleteLoanTestBusy = ref(false)
const deleteLoanTestError = ref('')

function openDeleteLoanTest() {
  deleteLoanTestConfirm.value = ''
  deleteLoanTestError.value = ''
  deleteLoanTestOpen.value = true
}

async function runDeleteLoanTest() {
  const loan = detailLoan.value
  if (
    !loan ||
    deleteLoanTestConfirm.value.trim().toUpperCase() !== String(loan.loanNo).toUpperCase()
  ) {
    return
  }
  deleteLoanTestBusy.value = true
  const result = await loansStore.deleteTestLoan(loan)
  deleteLoanTestBusy.value = false
  if (!result.ok) {
    deleteLoanTestError.value = result.message
    return
  }
  deleteLoanTestOpen.value = false
  detailLoan.value = null
}

const schedule = computed(() =>
  detailLoan.value
    ? buildSchedule({
        principal: detailLoan.value.principal,
        ratePercent: detailLoan.value.ratePercent,
        termMonths: detailLoan.value.termMonths,
        startDate: detailLoan.value.releasedAt || detailLoan.value.createdAt,
      })
    : [],
)

const paidSum = computed(() => (detailLoan.value ? paidOf(detailLoan.value) : 0))
const loanBalance = computed(() => (detailLoan.value ? balanceOf(detailLoan.value) : 0))
const dueRow = computed(() =>
  detailLoan.value && detailLoan.value.status === 'Released'
    ? nextDue(schedule.value, paidSum.value)
    : null,
)
const progressPct = computed(() => {
  if (!detailLoan.value || !detailLoan.value.totalDue) return 0
  return Math.min(100, Math.round((paidSum.value / detailLoan.value.totalDue) * 100))
})

function openDetails(loan) {
  detailLoan.value = loan
  actionError.value = ''
  remarksDraft.value = loan.remarks || ''
  releaseChannel.value = 'Cash'
}

// ---------- confirmation ----------
const confirmAction = ref(null) // { title, message, confirmLabel, danger, run }

async function runConfirm() {
  const action = confirmAction.value
  confirmAction.value = null
  if (!action) return
  const result = await action.run()
  if (result && result.ok === false) actionError.value = result.message
}

// ---------- loan workflow actions ----------
function requestApprove() {
  const loan = detailLoan.value
  confirmAction.value = {
    title: 'Approve Loan?',
    message: `${loan.loanNo} (${loan.memberName}) — ${formatPeso(loan.principal)} will be approved by the committee and prepared for release.`,
    confirmLabel: 'Approve',
    danger: false,
    run: () => loansStore.approveLoan(loan.id),
  }
}

function requestReject() {
  const loan = detailLoan.value
  confirmAction.value = {
    title: 'Reject Loan?',
    message: `${loan.loanNo} will be rejected. The remarks will be saved to the record.`,
    confirmLabel: 'Reject',
    danger: true,
    run: () => loansStore.rejectLoan(loan.id, remarksDraft.value),
  }
}

function requestRelease() {
  const loan = detailLoan.value
  confirmAction.value = {
    title: 'Release Loan?',
    message: `${loan.loanNo} — ${formatPeso(loan.principal)} will be released via ${releaseChannel.value}. The member must claim it in person.`,
    confirmLabel: 'Release',
    danger: false,
    run: () => loansStore.releaseLoan(loan.id, releaseChannel.value),
  }
}

function requestReminder() {
  const loan = detailLoan.value
  confirmAction.value = {
    title: 'Send Delinquency Reminder?',
    message: `${loan.memberName} has not paid for 6+ months. Log a letter/text reminder?`,
    confirmLabel: 'Send Reminder',
    danger: false,
    run: () => loansStore.sendReminder(loan.id),
  }
}

// ---------- Loan Note PDF (Form No. KB Cr.13) ----------
// Printed once the loan is approved — the member signs it at release.
const noteEligible = computed(() =>
  ['Approved', 'Released', 'Paid'].includes(detailLoan.value?.status),
)

async function printLoanNote() {
  const loan = detailLoan.value
  if (!loan) return
  const member = membersStore.members.find((m) => m.id === loan.memberId) || null
  await generateLoanNote(loan, member)
}

// ---------- payment verification (app-submitted receipts) ----------
function requestVerify(payment) {
  const loan = detailLoan.value
  confirmAction.value = {
    title: 'Verify Payment?',
    message: `${formatPeso(payment.amount)} from ${loan.memberName}${
      payment.channel ? ` via ${payment.channel}` : ''
    } — verifying counts it toward the balance and updates the loan's remaining dues.`,
    confirmLabel: 'Verify',
    danger: false,
    run: () => loansStore.verifyPayment(loan.id, payment.id),
  }
}

// ---------- app-filed loan requests ----------
const reviewRequest = ref(null)
const requestError = ref('')
const approvalNotice = ref('')
const requestDocs = ref([])
const docsLoading = ref(false)
const docsError = ref('')
const coMakerDrafts = ref([])
const approvalNote = ref('')
const requestRemarks = ref('')

function typeLabel(value) {
  const found = LOAN_TYPES.find((item) => item.value === value)
  return found ? found.label : value || '—'
}

function openRequest(request) {
  reviewRequest.value = request
  requestError.value = ''
  approvalNotice.value = ''
  requestDocs.value = []
  docsError.value = ''
  // Start from the names the member typed in the app (if the app sent
  // them) — the admin still verifies each is a member.
  const required = Number(request.amount) >= COMAKER_THRESHOLD ? 2 : 1
  const suggested = (request.requestedCoMakers || []).slice(0, required)
  coMakerDrafts.value = Array.from({ length: required }, (_, index) => suggested[index] || '')
  approvalNote.value = ''
  requestRemarks.value = ''
  loadRequestDocuments(request)
}

function closeRequest() {
  reviewRequest.value = null
  requestError.value = ''
  requestDocs.value = []
  docsError.value = ''
}

async function loadRequestDocuments(request) {
  docsLoading.value = true
  docsError.value = ''
  const result = await loansStore.fetchRequestDocuments(request)
  if (reviewRequest.value !== request) return // modal moved on — drop the stale result
  docsLoading.value = false
  if (!result.ok) {
    docsError.value = result.message
    return
  }
  requestDocs.value = result.docs
}

async function viewRequestDoc(doc) {
  // Open the tab synchronously — popup blockers allow a tab opened
  // inside the click itself — then point it at the signed URL.
  const tab = window.open('about:blank', '_blank')
  const url = await loansStore.requestDocumentUrl(doc.path)
  if (!url) {
    if (tab) tab.close()
    docsError.value = 'This file could not be opened. Please try again.'
    return
  }
  if (tab) tab.location.href = url
  else window.location.href = url // popup blocked — navigate in this tab
}

function docSizeLabel(size) {
  if (!size) return ''
  if (size < 1024 * 1024) return ` · ${Math.max(1, Math.round(size / 1024))} KB`
  return ` · ${(size / (1024 * 1024)).toFixed(1)} MB`
}

const requiredCoMakerCount = computed(() =>
  reviewRequest.value && reviewRequest.value.amount >= COMAKER_THRESHOLD ? 2 : 1,
)

// Live rules check — capital share, 2-month wait, ceilings, limits.
const reviewEligibility = computed(() =>
  reviewRequest.value
    ? loansStore.eligibility(reviewRequest.value.memberId, reviewRequest.value.type)
    : null,
)

async function approveRequest() {
  const request = reviewRequest.value
  if (!request) return
  requestError.value = ''
  const result = await loansStore.approveRequest(request.id, {
    coMakers: coMakerDrafts.value,
    note: approvalNote.value,
  })
  if (!result.ok) {
    requestError.value = result.message
    return
  }
  reviewRequest.value = null
  requestDocs.value = []
  docsError.value = ''
  const warnings = []
  if (result.docs && !result.docs.ok) {
    warnings.push('its documents could not be linked to the loan (the files remain stored)')
  }
  if (result.notify && !result.notify.ok) {
    warnings.push('the member could not be notified in the app')
  }
  if (warnings.length) {
    approvalNotice.value = `The request was approved — but ${warnings.join(' and ')}.`
  }
}

async function submitRequestDecision(status) {
  const request = reviewRequest.value
  if (!request) return
  requestError.value = ''
  if (!requestRemarks.value.trim()) {
    requestError.value = `Remarks are required when ${
      status === 'Returned' ? 'returning' : 'rejecting'
    } a loan request.`
    return
  }
  const result =
    status === 'Returned'
      ? await loansStore.returnRequest(request.id, requestRemarks.value)
      : await loansStore.rejectRequest(request.id, requestRemarks.value)
  if (!result.ok) {
    requestError.value = result.message
    return
  }
  reviewRequest.value = null
  requestDocs.value = []
  docsError.value = ''
  if (result.notify && !result.notify.ok) {
    approvalNotice.value = `The request was ${
      status === 'Returned' ? 'returned' : 'rejected'
    } — but the member could not be notified in the app.`
  }
}

// "Showing 1–10 of 25 loans"
const paginationLabel = computed(() => {
  const total = loansStore.filteredLoans.length
  if (total === 0) return 'No loans found'
  const start = (loansStore.page - 1) * loansStore.pageSize + 1
  const end = Math.min(loansStore.page * loansStore.pageSize, total)
  return `Showing ${start}–${end} of ${total} loans`
})

// ---------- record payment ----------
const showPayment = ref(false)
const payError = ref('')
const payForm = reactive({
  amount: '',
  at: new Date().toISOString().split('T')[0],
  channel: 'Cash',
  note: '',
})

// Optional receipt photo on the payment being recorded.
const payReceiptInput = ref(null)
const payReceiptFile = ref(null)
const payReceiptName = ref('')

function onPayReceiptPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // the same file can be re-chosen
  if (!file) return
  payReceiptFile.value = file
  payReceiptName.value = file.name
}

function clearPayReceipt() {
  payReceiptFile.value = null
  payReceiptName.value = ''
}

// ---------- receipt attach / remove on an existing payment ----------
const receiptInput = ref(null)
const receiptTarget = ref(null) // payment whose receipt is being edited

function pickReceiptFor(payment) {
  receiptTarget.value = payment
  receiptInput.value?.click()
}

async function onReceiptPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const payment = receiptTarget.value
  receiptTarget.value = null
  if (!file || !payment) return
  actionError.value = ''
  const result = await loansStore.attachReceipt(detailLoan.value.id, payment, file)
  if (!result.ok) actionError.value = result.message
}

function requestRemoveReceipt(payment) {
  confirmAction.value = {
    title: 'Remove Receipt Photo?',
    message: `The receipt photo for the ₱${payment.amount.toLocaleString('en-PH')} payment will be removed. You can attach a new one anytime.`,
    confirmLabel: 'Remove',
    danger: true,
    run: () => loansStore.removeReceipt(detailLoan.value.id, payment),
  }
}

const pendingBalance = computed(() => loanBalance.value)

function openPayment() {
  payError.value = ''
  payForm.amount = ''
  payForm.at = new Date().toISOString().split('T')[0]
  payForm.channel = 'Cash'
  payForm.note = ''
  clearPayReceipt()
  showPayment.value = true
}

function closePayment() {
  showPayment.value = false
  payError.value = ''
}

async function savePayment() {
  const result = await loansStore.recordPayment(detailLoan.value.id, {
    amount: Number(payForm.amount),
    at: new Date(`${payForm.at}T12:00:00`).toISOString(),
    channel: payForm.channel,
    note: payForm.note.trim(),
    receiptFile: payReceiptFile.value,
  })
  if (!result.ok) {
    payError.value = result.message
    return
  }
  closePayment()
}

// ---------- new loan application ----------
const showNew = ref(false)
const newFormError = ref('')

const newForm = reactive({
  memberId: null,
  type: 'Regular',
  principal: '',
  termMonths: 12,
  coMakers: ['', ''],
})

const reqs = reactive({
  id: false,
  financialLiteracy: false,
  salaryProof: false,
  checkingAccount: false,
})

const memberOptions = computed(() =>
  membersStore.members
    .filter((member) => member.status === 'Active')
    .map((member) => ({
      id: member.id,
      memberNo: member.memberNo,
      firstName: member.firstName,
      lastName: member.lastName,
    })),
)

const eligibility = computed(() => loansStore.eligibility(newForm.memberId, newForm.type))

const typeInfo = computed(() => typeMeta(newForm.type))

const termOptions = computed(() =>
  newForm.type === 'Emergency' ? [2, 3, 4, 5, 6] : [6, 12, 18, 24, 36],
)

// Emergency loans default to a short term; others to 12 months
watch(
  () => newForm.type,
  (type) => {
    newForm.termMonths = type === 'Emergency' ? 3 : 12
  },
)

const amountNumber = computed(() => Number(newForm.principal) || 0)

const requiredCoMakers = computed(() => (amountNumber.value >= COMAKER_THRESHOLD ? 2 : 1))

const amountMax = computed(() =>
  newForm.type === 'Emergency'
    ? EMERGENCY_MAX
    : eligibility.value.ok
      ? eligibility.value.limit
      : null,
)

// Requirements vary by loan type and amount (client interview)
const visibleReqs = computed(() => {
  const items = [{ key: 'id', label: 'Valid ID presented' }]
  if (eligibility.value.firstLoan && newForm.type !== 'Emergency') {
    items.push({
      key: 'financialLiteracy',
      label: 'Financial literacy seminar completed (onsite)',
    })
  }
  if (newForm.type === 'Business' || amountNumber.value >= COMAKER_THRESHOLD) {
    items.push({ key: 'salaryProof', label: 'Proof of salary submitted' })
  }
  if (newForm.type === 'Business') {
    items.push({ key: 'checkingAccount', label: 'Checking account submitted' })
  }
  return items
})

const computation = computed(() =>
  loanTotals(amountNumber.value, typeInfo.value.rate, newForm.termMonths),
)

function openNewLoan() {
  newFormError.value = ''
  newForm.memberId = null
  newForm.type = 'Regular'
  newForm.principal = ''
  newForm.termMonths = 12
  newForm.coMakers = ['', '']
  reqs.id = false
  reqs.financialLiteracy = false
  reqs.salaryProof = false
  reqs.checkingAccount = false
  showNew.value = true
}

function closeNew() {
  showNew.value = false
  newFormError.value = ''
}

async function submitLoan() {
  if (!newForm.memberId) {
    newFormError.value = 'Select a member first.'
    return
  }
  if (!eligibility.value.ok) {
    newFormError.value = eligibility.value.reasons.join(' ')
    return
  }
  if (!(amountNumber.value > 0)) {
    newFormError.value = 'Enter a loan amount.'
    return
  }
  const unchecked = visibleReqs.value.filter((item) => !reqs[item.key])
  if (unchecked.length > 0) {
    newFormError.value = 'Verify all requirements before submitting.'
    return
  }

  const result = await loansStore.addLoan({
    memberId: newForm.memberId,
    type: newForm.type,
    principal: amountNumber.value,
    termMonths: newForm.termMonths,
    coMakers: [...newForm.coMakers],
    requirements: visibleReqs.value.map((item) => ({ label: item.label, checked: reqs[item.key] })),
  })
  if (!result.ok) {
    newFormError.value = result.message
    return
  }

  closeNew()
  // Jump straight into the application the admin just created
  openDetails(result.loan)
}

// ---------- loan simulator ----------
// Quote a loan before any record exists — same engine as real loans,
// so the counter quote can never disagree with the actual schedule.
const showSimulator = ref(false)
const simForm = reactive({
  type: 'Regular',
  amount: 20000,
  termMonths: 12,
  start: todayInput(),
})

const simRate = computed(() => typeMeta(simForm.type).rate)
const simValid = computed(
  () =>
    Number(simForm.amount) > 0 &&
    Number(simForm.termMonths) >= 1 &&
    Number(simForm.termMonths) <= 36,
)
const simTotals = computed(() =>
  loanTotals(Number(simForm.amount), simRate.value, Number(simForm.termMonths)),
)
const simSchedule = computed(() =>
  buildSchedule({
    principal: Number(simForm.amount),
    ratePercent: simRate.value,
    termMonths: Number(simForm.termMonths),
    startDate: simForm.start,
  }),
)

// The caps addLoan enforces — shown before staff promise a figure.
const simNotes = computed(() => {
  const amount = Number(simForm.amount) || 0
  const notes = []
  if (simForm.type === 'Emergency' && amount > EMERGENCY_MAX) {
    notes.push(
      `Emergency loans are capped at ${formatPeso(EMERGENCY_MAX)} — pick another loan type for larger amounts.`,
    )
  }
  if (amount > CEILING_CAP) {
    notes.push(
      `Above the coop maximum of ${formatPeso(CEILING_CAP)} — the ceiling is also 2× the member's capital share.`,
    )
  }
  if (amount >= COMAKER_THRESHOLD && amount <= CEILING_CAP) {
    notes.push(`${formatPeso(COMAKER_THRESHOLD)} and above need 2 co-makers.`)
  }
  return notes
})
</script>
