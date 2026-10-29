<template>
  <AppLayout>
    <div>
      <!-- Print-only report header -->
      <div class="hidden print:block mb-4 text-sm">
        <p class="font-bold text-gray-900">
          UCMS {{ reportModeLabel }} — KHS Mentor's Multi-Purpose Cooperative, Inc.
        </p>
        <p class="text-gray-600">{{ rangeLabel }} · generated {{ todayLabel }}</p>
      </div>

      <!-- Header + toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 no-print">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">Reports</h1>
          <p class="text-sm text-gray-500 mt-1">{{ rangeLabel }} · generated {{ todayLabel }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="range"
            aria-label="Report period"
            class="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <optgroup v-for="group in rangeGroups" :key="group.label" :label="group.label">
              <option v-for="option in group.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </optgroup>
          </select>
          <!-- Custom range: pick the exact days the report should cover -->
          <template v-if="range === 'custom'">
            <input
              v-model="customStart"
              type="date"
              aria-label="From date"
              class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <span class="text-sm text-gray-500">to</span>
            <input
              v-model="customEnd"
              type="date"
              aria-label="To date"
              class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </template>
          <div
            class="flex rounded-lg border border-gray-300 p-0.5"
            role="group"
            aria-label="Report mode"
          >
            <button
              type="button"
              :aria-pressed="reportMode === 'visualizations'"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition"
              :class="
                reportMode === 'visualizations'
                  ? 'bg-green-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              "
              @click="reportMode = 'visualizations'"
            >
              Visualizations
            </button>
            <button
              type="button"
              :aria-pressed="reportMode === 'statistics'"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition"
              :class="
                reportMode === 'statistics'
                  ? 'bg-green-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              "
              @click="reportMode = 'statistics'"
            >
              Statistics only
            </button>
          </div>
          <label
            class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
            title="Include archived members in membership counts, growth, and capital-share totals. Linked loan and payment history remains in financial reports."
          >
            <input v-model="includeArchivedMembers" type="checkbox" class="accent-green-600" />
            Include archived members
          </label>
          <button
            @click="printReports"
            class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition duration-200"
          >
            Print
          </button>
        </div>
      </div>

      <!-- 1. Membership Growth -->
      <section
        v-if="reportMode === 'visualizations'"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Membership Growth</h2>
          <button
            @click="exportGrowth"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Bar chart: new members per month -->
          <div class="lg:col-span-2">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              New members per month
            </p>
            <!-- Each bar keeps a legible width; narrow screens (and
                 long all-time ranges) scroll sideways instead of
                 crushing the bars into unreadable slivers. Print
                 falls back to the old squeezed-but-complete layout. -->
            <div v-if="growthSeries.length > 0" class="overflow-x-auto">
              <div
                class="flex items-end gap-1 h-44 border-b border-gray-100 pb-1 print:min-w-0"
                :style="{ minWidth: growthSeries.length * 22 + 'px' }"
              >
                <div
                  v-for="point in growthSeries"
                  :key="point.label"
                  class="flex-1 flex flex-col items-center gap-1 min-w-0"
                  :title="point.label"
                >
                  <span class="text-xs font-medium text-gray-600">{{ point.count }}</span>
                  <div
                    class="w-full bg-green-500 rounded-t"
                    :style="{ height: growthBarPx(point.count) + 'px' }"
                  ></div>
                  <!-- Month over 2-digit year — one line per month can't
                       fit side by side at this many bars -->
                  <div class="w-full text-center leading-tight overflow-hidden">
                    <span class="block text-[10px] text-gray-500">{{ point.mon }}</span>
                    <span class="block text-[10px] text-gray-400">{{ point.yr }}</span>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 py-8 text-center">
              No new members in this period.
            </p>
            <p class="text-xs text-gray-400 mt-2">
              {{ rangeMembers.length }} joined · {{ memberTotal }} total in the system
            </p>
          </div>

          <!-- Donut: status breakdown (current) -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Member Status (current)
            </p>
            <div class="flex items-center gap-5">
              <div
                class="relative w-32 h-32 rounded-full shrink-0"
                :style="{ background: donutStyle }"
              >
                <div
                  class="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center"
                >
                  <span class="text-2xl font-bold text-gray-800">{{ memberTotal }}</span>
                  <span class="text-xs text-gray-400">members</span>
                </div>
              </div>
              <ul class="space-y-2 text-sm">
                <li class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-green-500"></span>
                  Active — {{ statusCounts.Active }}
                </li>
                <li class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-gray-400"></span>
                  Inactive — {{ statusCounts.Inactive }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Applications Summary — HIDDEN for v1.0. The coop has no
           online/app registration (face-to-face only), so the portal
           ships without the Registrations module. Flip
           SHOW_REGISTRATIONS to true to bring this section back. -->
      <section
        v-if="reportMode === 'visualizations' && SHOW_REGISTRATIONS"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Registrations Summary</h2>
          <button
            @click="exportApplications"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Received</p>
            <p class="text-xl font-bold text-gray-800">{{ appStats.received }}</p>
          </div>
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Approved</p>
            <p class="text-xl font-bold text-green-700">{{ appStats.approved }}</p>
          </div>
          <div class="bg-purple-50 rounded-lg p-3">
            <p class="text-xs text-purple-700">Returned</p>
            <p class="text-xl font-bold text-purple-700">{{ appStats.returned }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Rejected</p>
            <p class="text-xl font-bold text-red-600">{{ appStats.rejected }}</p>
          </div>
          <div class="bg-blue-50 rounded-lg p-3">
            <p class="text-xs text-blue-700">Approval rate</p>
            <p class="text-xl font-bold text-blue-700">{{ appStats.approvalRate }}%</p>
          </div>
        </div>

        <!-- Stacked bar -->
        <div v-if="appStats.received > 0" class="mb-4">
          <div class="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-2">
            <div
              v-for="seg in appStack"
              :key="seg.label"
              :class="seg.color"
              :style="{ width: seg.pct + '%' }"
              :title="`${seg.label}: ${seg.count}`"
            ></div>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span v-for="seg in appStack" :key="seg.label" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" :class="seg.dot"></span>
              {{ seg.label }} ({{ seg.count }})
            </span>
            <span v-if="appStats.inProgress > 0" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              In progress ({{ appStats.inProgress }})
            </span>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 mb-4">No registrations in this period.</p>

        <!-- Recent applications -->
        <div v-if="recentApps.length > 0" class="table-scroll overflow-x-auto">
          <table class="w-full min-w-[520px] text-sm">
            <thead>
              <tr class="text-left text-xs font-medium text-gray-400 uppercase">
                <th class="py-2 pr-4">App No</th>
                <th class="py-2 pr-4">Applicant</th>
                <th class="py-2 pr-4">Status</th>
                <th class="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="app in recentApps" :key="app.id">
                <td class="py-2 pr-4 font-mono text-xs text-gray-500">{{ app.appNo }}</td>
                <td class="py-2 pr-4 text-gray-700">{{ app.firstName }} {{ app.lastName }}</td>
                <td class="py-2 pr-4">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="appStatusClass(app.status)"
                  >
                    {{ app.status }}
                  </span>
                </td>
                <td class="py-2 text-gray-500 text-xs">{{ formatDate(app.submittedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 3. Loan Portfolio -->
      <section
        v-if="reportMode === 'visualizations'"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-gray-800">Loan Portfolio</h2>
            <p class="text-xs text-gray-400">
              Balance figures are current snapshots · collection figures follow the selected period
            </p>
          </div>
          <button
            @click="exportLoans"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Outstanding</p>
            <p class="text-lg font-bold text-green-700">
              {{ formatPeso(loansStore.outstandingBalance) }}
            </p>
          </div>
          <div class="bg-blue-50 rounded-lg p-3">
            <p class="text-xs text-blue-700">Active loans</p>
            <p class="text-lg font-bold text-blue-700">{{ loansStore.activeCount }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Delinquent (6+ mo)</p>
            <p class="text-lg font-bold text-red-600">
              {{ delinquentLoans.length }} · {{ formatPeso(delinquentAmount) }}
            </p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Collected</p>
            <p class="text-lg font-bold text-gray-800">{{ formatPeso(collectedInRange) }}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Released</p>
            <p class="text-lg font-bold text-gray-800">
              {{ releasedInRange.length }} loan<span v-if="releasedInRange.length !== 1">s</span>
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Loans issued by type -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Loans issued by type (principal)
            </p>
            <div v-if="loansByType.length > 0" class="space-y-3">
              <div v-for="row in loansByType" :key="row.value">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-gray-600"> {{ row.label }} ({{ row.count }}) </span>
                  <span class="font-medium text-gray-800">{{ formatPeso(row.total) }}</span>
                </div>
                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class="h-2 bg-green-500 rounded-full"
                    :style="{ width: typeBarPct(row.total) + '%' }"
                  ></div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400">No issued loans yet.</p>
          </div>

          <!-- Delinquent accounts -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Delinquent accounts
            </p>
            <div v-if="delinquentLoans.length > 0" class="table-scroll overflow-x-auto">
              <table class="w-full min-w-[380px] text-sm">
                <thead>
                  <tr class="text-left text-xs font-medium text-gray-400 uppercase">
                    <th class="py-2 pr-3">Loan No</th>
                    <th class="py-2 pr-3">Member</th>
                    <th class="py-2 pr-3">Balance</th>
                    <th class="py-2">Last activity</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="loan in delinquentLoans" :key="loan.id">
                    <td class="py-2 pr-3 font-mono text-xs text-gray-500">{{ loan.loanNo }}</td>
                    <td class="py-2 pr-3 text-gray-700">{{ loan.memberName }}</td>
                    <td class="py-2 pr-3 font-semibold text-red-600">
                      {{ formatPeso(loansStore.balanceOf(loan)) }}
                    </td>
                    <td class="py-2 text-gray-500 text-xs">
                      {{ formatDate(lastActivity(loan)) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-green-700">None — no delinquent accounts</p>
          </div>
        </div>
      </section>

      <!-- 4. Expected loan collections -->
      <section
        v-if="reportMode === 'visualizations'"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-gray-800">Expected Loan Collections</h2>
            <p class="text-xs text-gray-400">Based on active loans' repayment schedules</p>
          </div>
          <button
            @click="exportForecast"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Collection windows -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Already overdue</p>
            <p class="text-lg font-bold text-red-600">{{ formatPeso(forecastTotals.overdue) }}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Due in 30 days</p>
            <p class="text-lg font-bold text-gray-800">{{ formatPeso(forecastTotals.due30) }}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Due in 60 days</p>
            <p class="text-lg font-bold text-gray-800">{{ formatPeso(forecastTotals.due60) }}</p>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Due in 90 days</p>
            <p class="text-lg font-bold text-gray-800">{{ formatPeso(forecastTotals.due90) }}</p>
          </div>
          <div class="bg-blue-50 rounded-lg p-3">
            <p class="text-xs text-blue-700">Beyond 12 months</p>
            <p class="text-lg font-bold text-blue-700">{{ formatPeso(forecastTotals.beyond) }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6">
          <!-- Expected collections per month -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Scheduled collections — next 12 months
            </p>
            <div v-if="forecastMonths.length > 0" class="overflow-x-auto">
              <div
                class="flex items-end gap-1 h-44 border-b border-gray-100 pb-1"
                :style="{ minWidth: forecastMonths.length * 22 + 'px' }"
              >
                <div
                  v-for="point in forecastMonths"
                  :key="point.key"
                  class="flex-1 flex flex-col items-center gap-1 min-w-0"
                  :title="`${point.label}: ${formatPeso(point.amount)}`"
                >
                  <span class="text-xs font-medium text-gray-600">
                    {{ point.amount > 0 ? shortPeso(point.amount) : '0' }}
                  </span>
                  <div
                    class="w-full bg-green-500 rounded-t"
                    :style="{ height: forecastBarPx(point.amount) + 'px' }"
                  ></div>
                  <div class="w-full text-center leading-tight overflow-hidden">
                    <span class="block text-[10px] text-gray-500">{{ point.mon }}</span>
                    <span class="block text-[10px] text-gray-400">{{ point.yr }}</span>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 py-8 text-center">
              No active loans with scheduled collections.
            </p>
            <p class="text-xs text-gray-400 mt-2">
              {{ activeLoanCount }} active loan<span v-if="activeLoanCount !== 1">s</span> ·
              {{ formatPeso(forecastTwelve) }} expected within 12 months
            </p>
          </div>
        </div>

        <p class="text-xs text-gray-400 mt-4">
          Calculation: remaining collections are based on each active loan's diminishing-balance
          schedule, release date, principal, rate and term. Instalments covered by verified payments
          are excluded; app-submitted receipts count only after administrator verification.
        </p>
      </section>

      <!-- 5. Cash Flow -->
      <section
        v-if="reportMode === 'visualizations'"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-gray-800">Cash Flow</h2>
          <button
            @click="exportCashFlow"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <!-- Stat tiles -->
        <div class="grid grid-cols-3 gap-3 mb-5">
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Income</p>
            <p class="text-xl font-bold text-green-700">{{ formatPeso(flow.income) }}</p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Expenses</p>
            <p class="text-xl font-bold text-red-600">{{ formatPeso(flow.expense) }}</p>
          </div>
          <div class="rounded-lg p-3" :class="flow.net >= 0 ? 'bg-gray-50' : 'bg-red-50'">
            <p class="text-xs text-gray-500">Net</p>
            <p class="text-xl font-bold" :class="flow.net >= 0 ? 'text-gray-800' : 'text-red-600'">
              {{ formatPeso(flow.net) }}
            </p>
          </div>
        </div>

        <!-- Grouped bar chart -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Income vs expenses per month
            </p>
            <!-- Same sideways-scroll treatment as the growth chart -->
            <div v-if="flowSeries.length > 0" class="overflow-x-auto">
              <div
                class="flex items-end gap-1 h-44 border-b border-gray-100 pb-1 print:min-w-0"
                :style="{ minWidth: flowSeries.length * 22 + 'px' }"
              >
                <div
                  v-for="point in flowSeries"
                  :key="point.label"
                  class="flex-1 flex flex-col items-center gap-1 min-w-0"
                  :title="point.label"
                >
                  <div class="w-full flex items-end justify-center gap-1 h-32">
                    <div
                      class="w-1/3 bg-green-500 rounded-t"
                      :style="{ height: flowBarPx(point.income) + 'px' }"
                      :title="`Income ${formatPeso(point.income)}`"
                    ></div>
                    <div
                      class="w-1/3 bg-red-400 rounded-t"
                      :style="{ height: flowBarPx(point.expense) + 'px' }"
                      :title="`Expenses ${formatPeso(point.expense)}`"
                    ></div>
                  </div>
                  <!-- Month over 2-digit year, same as the growth chart -->
                  <div class="w-full text-center leading-tight overflow-hidden">
                    <span class="block text-[10px] text-gray-500">{{ point.mon }}</span>
                    <span class="block text-[10px] text-gray-400">{{ point.yr }}</span>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 py-8 text-center">
              No transactions in this period.
            </p>
            <div class="flex gap-4 text-xs text-gray-500 mt-2">
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span> Income
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-red-400"></span> Expenses
              </span>
            </div>
          </div>

          <!-- Top categories -->
          <div>
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Top categories
            </p>
            <div v-if="topCategories.length > 0">
              <table class="w-full text-sm">
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="row in topCategories" :key="row.key">
                    <td class="py-2">
                      <span
                        class="px-1.5 py-0.5 rounded text-xs font-medium mr-2"
                        :class="
                          row.type === 'Income'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        "
                      >
                        {{ row.type === 'Income' ? 'IN' : 'OUT' }}
                      </span>
                      {{ row.category }}
                    </td>
                    <td class="py-2 text-right font-medium text-gray-800">
                      {{ formatPeso(row.total) }}
                    </td>
                    <td class="py-2 text-right text-xs text-gray-400 w-12">{{ row.pct }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-gray-400">No data in this period.</p>
          </div>
        </div>
      </section>

      <!-- 6. Financial Summary -->
      <section
        v-if="reportMode === 'visualizations'"
        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6"
      >
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-semibold text-gray-800">Financial Summary</h2>
            <p class="text-xs text-gray-400">One-pager for the BOD/board meetings</p>
          </div>
          <button
            @click="exportSummary"
            class="text-xs font-medium text-green-700 hover:text-green-800 no-print"
          >
            CSV
          </button>
        </div>

        <table class="w-full text-sm">
          <tbody class="divide-y divide-gray-100">
            <tr v-for="row in summaryRows" :key="row[0]">
              <td class="py-2.5 text-gray-600">{{ row[0] }}</td>
              <td class="py-2.5 text-right font-semibold" :class="row[2] || 'text-gray-800'">
                {{ row[1] }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section v-if="reportMode === 'statistics'" class="space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800">Statistics-only report</h2>
          <p class="text-sm text-gray-600 mt-2">
            For {{ rangeLabel.toLowerCase() }}, {{ rangeMembers.length }} new
            {{ rangeMembers.length === 1 ? 'member joined' : 'members joined' }},
            {{ releasedInRange.length }}
            {{ releasedInRange.length === 1 ? 'loan was' : 'loans were' }} released, and
            {{ formatPeso(collectedInRange) }} in verified loan payments was recorded. Cash flow was
            {{ flow.net >= 0 ? 'positive' : 'negative' }} by {{ formatPeso(Math.abs(flow.net)) }}.
          </p>
          <p class="text-xs text-gray-500 mt-2">
            Member and loan balances are current snapshots. Joining, payment, and cash-flow totals
            follow the selected date range. Forecast amounts are projections from active loan
            schedules, not guaranteed receipts.
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800 mb-3">Financial summary</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-gray-100">
                <tr v-for="row in summaryRows" :key="row[0]">
                  <th scope="row" class="py-2.5 text-left font-normal text-gray-600">
                    {{ row[0] }}
                  </th>
                  <td class="py-2.5 text-right font-semibold" :class="row[2] || 'text-gray-800'">
                    {{ row[1] }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800">Membership</h2>
          <p class="text-sm text-gray-600 mt-1">
            {{ memberTotal }} members are recorded: {{ statusCounts.Active }} active and
            {{ statusCounts.Inactive }} inactive. {{ rangeMembers.length }} joined during
            {{ rangeLabel.toLowerCase() }}.
          </p>
          <div v-if="growthYearGroups.length" class="space-y-2 mt-4">
            <details
              v-for="(group, index) in growthYearGroups"
              :key="group.year"
              :open="index === 0"
              class="rounded-lg border border-gray-200"
            >
              <summary
                class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm hover:bg-gray-100"
              >
                <span class="font-semibold text-gray-800">{{ group.year }}</span>
                <span class="font-medium text-gray-700">
                  {{ group.total.count }} new
                  {{ group.total.count === 1 ? 'member' : 'members' }}
                </span>
              </summary>
              <div class="overflow-x-auto px-4 pb-3">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500 border-b">
                      <th class="py-2 pr-4">Month joined</th>
                      <th class="py-2 text-right">New members</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="point in group.rows" :key="point.label">
                      <td class="py-2 pr-4 text-gray-700">{{ point.mon }} {{ group.year }}</td>
                      <td class="py-2 text-right text-gray-700">{{ point.count }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">No members joined in this period.</p>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800">Loan portfolio</h2>
          <p class="text-sm text-gray-600 mt-1">
            There are {{ loansStore.activeCount }} active loans with
            {{ formatPeso(loansStore.outstandingBalance) }} outstanding. The portfolio has
            {{ delinquentLoans.length }} delinquent
            {{ delinquentLoans.length === 1 ? 'account' : 'accounts' }} totaling
            {{ formatPeso(delinquentAmount) }}.
          </p>
          <div class="overflow-x-auto mt-3">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase text-gray-500 border-b">
                  <th class="py-2 pr-4">Loan type (all time)</th>
                  <th class="py-2 pr-4 text-right">Loans issued</th>
                  <th class="py-2 text-right">Principal released</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="row in loansByType" :key="row.value">
                  <td class="py-2 pr-4 text-gray-700">{{ row.label }}</td>
                  <td class="py-2 pr-4 text-right text-gray-700">{{ row.count }}</td>
                  <td class="py-2 text-right text-gray-700">{{ formatPeso(row.total) }}</td>
                </tr>
                <tr v-if="!loansByType.length">
                  <td colspan="3" class="py-2 text-gray-500">No issued loans are recorded.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="overflow-x-auto mt-5">
            <h3 class="text-sm font-medium text-gray-700 mb-2">Delinquent accounts</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase text-gray-500 border-b">
                  <th class="py-2 pr-4">Loan number</th>
                  <th class="py-2 pr-4">Member</th>
                  <th class="py-2 pr-4 text-right">Balance</th>
                  <th class="py-2 text-right">Last activity</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="loan in delinquentLoans" :key="loan.id">
                  <td class="py-2 pr-4 font-mono text-xs text-gray-600">{{ loan.loanNo }}</td>
                  <td class="py-2 pr-4 text-gray-700">{{ loan.memberName }}</td>
                  <td class="py-2 pr-4 text-right text-gray-700">
                    {{ formatPeso(loansStore.balanceOf(loan)) }}
                  </td>
                  <td class="py-2 text-right text-gray-600">
                    {{ formatDate(lastActivity(loan)) }}
                  </td>
                </tr>
                <tr v-if="!delinquentLoans.length">
                  <td colspan="4" class="py-2 text-gray-500">No delinquent accounts.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800">Expected collections from active loans</h2>
          <p class="text-sm text-gray-600 mt-1">
            {{ activeLoanCount }} active {{ activeLoanCount === 1 ? 'loan has' : 'loans have' }}
            {{ formatPeso(forecastTwelve) }} in scheduled instalments over the next 12 months.
          </p>
          <dl class="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4 text-sm">
            <div>
              <dt class="text-gray-500">Overdue</dt>
              <dd class="font-semibold">{{ formatPeso(forecastTotals.overdue) }}</dd>
            </div>
            <div>
              <dt class="text-gray-500">Due in 30 days</dt>
              <dd class="font-semibold">{{ formatPeso(forecastTotals.due30) }}</dd>
            </div>
            <div>
              <dt class="text-gray-500">Due in 60 days</dt>
              <dd class="font-semibold">{{ formatPeso(forecastTotals.due60) }}</dd>
            </div>
            <div>
              <dt class="text-gray-500">Due in 90 days</dt>
              <dd class="font-semibold">{{ formatPeso(forecastTotals.due90) }}</dd>
            </div>
            <div>
              <dt class="text-gray-500">Beyond 12 months</dt>
              <dd class="font-semibold">{{ formatPeso(forecastTotals.beyond) }}</dd>
            </div>
          </dl>
          <div class="space-y-2 mt-4">
            <details
              v-for="(group, index) in forecastYearGroups"
              :key="group.year"
              :open="index === 0"
              class="rounded-lg border border-gray-200"
            >
              <summary
                class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm hover:bg-gray-100"
              >
                <span class="font-semibold text-gray-800">{{ group.year }}</span>
                <span class="font-medium text-gray-700">{{ formatPeso(group.total.amount) }}</span>
              </summary>
              <div class="overflow-x-auto px-4 pb-3">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500 border-b">
                      <th class="py-2 pr-4">Month due</th>
                      <th class="py-2 text-right">Expected instalments</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="point in group.rows" :key="point.key">
                      <td class="py-2 pr-4 text-gray-700">{{ point.mon }} {{ group.year }}</td>
                      <td class="py-2 text-right text-gray-700">{{ formatPeso(point.amount) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 class="font-semibold text-gray-800">Cash flow</h2>
          <p class="text-sm text-gray-600 mt-1">
            During {{ rangeLabel.toLowerCase() }}, recorded income was
            {{ formatPeso(flow.income) }}, expenses were {{ formatPeso(flow.expense) }}, and net
            cash flow was {{ formatPeso(flow.net) }}.
          </p>
          <div v-if="flowYearGroups.length" class="space-y-2 mt-4">
            <details
              v-for="(group, index) in flowYearGroups"
              :key="group.year"
              :open="index === 0"
              class="rounded-lg border border-gray-200"
            >
              <summary
                class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm hover:bg-gray-100"
              >
                <span class="font-semibold text-gray-800">{{ group.year }}</span>
                <span class="flex flex-wrap justify-end gap-x-4 gap-y-1 text-right">
                  <span class="text-green-700">Income {{ formatPeso(group.total.income) }}</span>
                  <span class="text-red-700"> Expenses {{ formatPeso(group.total.expense) }} </span>
                  <span class="font-semibold text-gray-800">
                    Net {{ formatPeso(group.total.income - group.total.expense) }}
                  </span>
                </span>
              </summary>
              <div class="overflow-x-auto px-4 pb-3">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500 border-b">
                      <th class="py-2 pr-4">Month</th>
                      <th class="py-2 pr-4 text-right">Income</th>
                      <th class="py-2 pr-4 text-right">Expenses</th>
                      <th class="py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="point in group.rows" :key="point.label">
                      <td class="py-2 pr-4 text-gray-700">{{ point.mon }} {{ group.year }}</td>
                      <td class="py-2 pr-4 text-right text-gray-700">
                        {{ formatPeso(point.income) }}
                      </td>
                      <td class="py-2 pr-4 text-right text-gray-700">
                        {{ formatPeso(point.expense) }}
                      </td>
                      <td class="py-2 text-right text-gray-700">
                        {{ formatPeso(point.income - point.expense) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">
            No ledger transactions were recorded in this period.
          </p>
          <div class="overflow-x-auto mt-5">
            <h3 class="text-sm font-medium text-gray-700 mb-2">Top categories in this period</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase text-gray-500 border-b">
                  <th class="py-2 pr-4">Type</th>
                  <th class="py-2 pr-4">Category</th>
                  <th class="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="row in topCategories" :key="row.key">
                  <td class="py-2 pr-4 text-gray-700">{{ row.type }}</td>
                  <td class="py-2 pr-4 text-gray-700">{{ row.category }}</td>
                  <td class="py-2 text-right text-gray-700">{{ formatPeso(row.total) }}</td>
                </tr>
                <tr v-if="!topCategories.length">
                  <td colspan="3" class="py-2 text-gray-500">
                    No category totals for this period.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { useMembersStore } from '../stores/members'
import { useApplicationsStore } from '../stores/applications'
import { useLoansStore, LOAN_TYPES } from '../stores/loans'
import { useLedgerStore } from '../stores/ledger'
import { buildSchedule } from '../utils/amortization'

const reportMode = ref('visualizations')
const includeArchivedMembers = ref(false)
const membersStore = useMembersStore()
const appsStore = useApplicationsStore()
const loansStore = useLoansStore()
const ledgerStore = useLedgerStore()

// HIDDEN for v1.0 — the Registrations module. The coop registers
// members face-to-face at the office, so the portal ships without the
// registration queue (view + sidebar entry also hidden). Flipping this
// flag restores the "Registrations Summary" panel in this view.
const SHOW_REGISTRATIONS = false

const todayLabel = new Date().toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})
const reportModeLabel = computed(() =>
  reportMode.value === 'statistics' ? 'Statistics-only report' : 'Reports',
)

// ---------- date range ----------
// Grouped short-to-long in the dropdown (days, months, years, then
// custom/all). Labels stay plain — "This year so far" instead of the
// jargon "Year to date"; the exact dates covered appear in the page
// header and the printed header via rangeLabel.
const RANGES = [
  { value: 'today', label: 'Today', group: 'Days' },
  { value: 'yesterday', label: 'Yesterday', group: 'Days' },
  { value: 'last7', label: 'Last 7 days', group: 'Days' },
  { value: 'last30', label: 'Last 30 days', group: 'Days' },
  { value: 'month', label: 'This month', group: 'Months' },
  { value: 'lastMonth', label: 'Last month', group: 'Months' },
  { value: 'ytd', label: 'This year so far', group: 'Years' },
  { value: 'lastYear', label: 'Last year', group: 'Years' },
  { value: 'last12', label: 'Last 12 months', group: 'Years' },
  { value: 'custom', label: 'Custom range', group: 'Other' },
  { value: 'all', label: 'All time', group: 'Other' },
]
const range = ref('all')

const rangeGroups = computed(() => {
  const groups = []
  for (const option of RANGES) {
    let group = groups.find((item) => item.label === option.group)
    if (!group) {
      group = { label: option.group, options: [] }
      groups.push(group)
    }
    group.options.push(option)
  }
  return groups
})

function isoDay(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Custom range inputs — default to this month when first chosen, so
// the report is never silently filtered by an empty range.
const customStart = ref('')
const customEnd = ref('')
watch(range, (value) => {
  if (value !== 'custom' || customStart.value || customEnd.value) return
  const now = new Date()
  customStart.value = isoDay(new Date(now.getFullYear(), now.getMonth(), 1))
  customEnd.value = isoDay(now)
})

// The exact dates the selected range covers, shown next to its name
// so nobody has to guess what "Last 12 months" includes.
const rangeSpan = computed(() => {
  const today = startOfDay(new Date())
  const offsetDay = (days) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  const fmt = (date) =>
    date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const span = (from, to) => {
    if (!from || !to) return ''
    if (from.getTime() === to.getTime()) return fmt(from)
    const left = from.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: from.getFullYear() === to.getFullYear() ? undefined : 'numeric',
    })
    return `${left} – ${fmt(to)}`
  }
  switch (range.value) {
    case 'today':
      return fmt(today)
    case 'yesterday':
      return fmt(offsetDay(-1))
    case 'last7':
      return span(offsetDay(-6), today)
    case 'last30':
      return span(offsetDay(-29), today)
    case 'month':
      return span(
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 0),
      )
    case 'lastMonth':
      return span(
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
        new Date(today.getFullYear(), today.getMonth(), 0),
      )
    case 'ytd':
      return span(new Date(today.getFullYear(), 0, 1), today)
    case 'lastYear':
      return span(
        new Date(today.getFullYear() - 1, 0, 1),
        new Date(today.getFullYear() - 1, 11, 31),
      )
    case 'last12':
      return span(new Date(today.getFullYear(), today.getMonth() - 12, today.getDate()), today)
    case 'custom': {
      if (!customStart.value && !customEnd.value) return ''
      const from = customStart.value ? new Date(`${customStart.value}T00:00:00`) : null
      const to = customEnd.value ? new Date(`${customEnd.value}T00:00:00`) : null
      if (from && to) return span(from, to)
      if (from) return `from ${fmt(from)}`
      return `up to ${fmt(to)}`
    }
    default:
      return '' // All time — the whole record, no dates to quote
  }
})

const rangeLabel = computed(() => {
  const label = RANGES.find((option) => option.value === range.value)?.label || 'All time'
  return rangeSpan.value ? `${label} (${rangeSpan.value})` : label
})

// Accepts 'YYYY-MM-DD' or full ISO strings
function inRange(dateStr) {
  if (!dateStr) return false
  if (range.value === 'all') return true
  const date = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr)
  const now = new Date()
  // Day-level ranges compare normalized local days, so a timestamp
  // late on a boundary day still counts as that day.
  const day = startOfDay(date)
  const midnight = startOfDay(now)
  if (range.value === 'today') return day.getTime() === midnight.getTime()
  if (range.value === 'yesterday') {
    const yesterday = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - 1)
    return day.getTime() === yesterday.getTime()
  }
  if (range.value === 'last7' || range.value === 'last30') {
    const days = range.value === 'last7' ? 7 : 30
    const cutoff = new Date(
      midnight.getFullYear(),
      midnight.getMonth(),
      midnight.getDate() - (days - 1),
    )
    return day.getTime() >= cutoff.getTime()
  }
  if (range.value === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  if (range.value === 'lastMonth') {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return date.getFullYear() === previous.getFullYear() && date.getMonth() === previous.getMonth()
  }
  if (range.value === 'ytd') return date.getFullYear() === now.getFullYear()
  if (range.value === 'lastYear') return date.getFullYear() === now.getFullYear() - 1
  if (range.value === 'last12') {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
    return day.getTime() >= startOfDay(cutoff).getTime()
  }
  if (range.value === 'custom') {
    if (customStart.value && day < new Date(`${customStart.value}T00:00:00`)) return false
    if (customEnd.value && day > new Date(`${customEnd.value}T00:00:00`)) return false
    return true
  }
  return true
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: '2-digit',
  })
}

// The same month split into two lines (name over 2-digit year) for
// the bar charts: a flat "Jan 19" is wider than one bar column, so
// at ~34 months the labels collide. CSV exports keep the flat label.
function monthParts(year, monthIndex) {
  const date = new Date(year, monthIndex, 1)
  return {
    mon: date.toLocaleDateString('en-PH', { month: 'short' }),
    yr: date.toLocaleDateString('en-PH', { year: '2-digit' }),
  }
}

function groupByYear(points, totalFields, newestFirst = true) {
  const groups = new Map()
  points.forEach((point) => {
    let group = groups.get(point.year)
    if (!group) {
      group = {
        year: point.year,
        rows: [],
        total: Object.fromEntries(totalFields.map((field) => [field, 0])),
      }
      groups.set(point.year, group)
    }
    group.rows.push(point)
    totalFields.forEach((field) => {
      group.total[field] += Number(point[field]) || 0
    })
  })

  return [...groups.values()]
    .sort((a, b) => (newestFirst ? b.year - a.year : a.year - b.year))
    .map((group) => ({
      ...group,
      total: Object.fromEntries(
        Object.entries(group.total).map(([field, value]) => [field, round2(value)]),
      ),
    }))
}

// ---------- shared formatters ----------
function formatPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString.length === 10 ? `${isoString}T00:00:00` : isoString)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function appStatusClass(status) {
  const classes = {
    Pending: 'bg-amber-100 text-amber-700',
    'Under Review': 'bg-blue-100 text-blue-700',
    Approved: 'bg-green-100 text-green-700',
    Returned: 'bg-purple-100 text-purple-700',
    Rejected: 'bg-red-100 text-red-600',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function printReports() {
  window.print()
}

// ---------- 1. Membership ----------
const reportMembers = computed(() =>
  includeArchivedMembers.value
    ? membersStore.members
    : membersStore.members.filter((member) => !member.archivedAt),
)

const memberTotal = computed(() => reportMembers.value.length)

const rangeMembers = computed(() =>
  reportMembers.value.filter((member) => inRange(member.dateJoined)),
)

const statusCounts = computed(() => ({
  Active: reportMembers.value.filter((member) => member.status === 'Active').length,
  Inactive: reportMembers.value.filter((member) => member.status === 'Inactive').length,
}))

// New members grouped by month (only months that have joins)
const growthSeries = computed(() => {
  const counts = new Map()
  rangeMembers.value.forEach((member) => {
    const date = new Date(`${member.dateJoined}T00:00:00`)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year, month] = key.split('-').map(Number)
      return { label: monthLabel(year, month), year, count, ...monthParts(year, month) }
    })
})

const growthYearGroups = computed(() => groupByYear(growthSeries.value, ['count']))

const growthMax = computed(() => Math.max(1, ...growthSeries.value.map((point) => point.count)))

function growthBarPx(count) {
  return Math.max(6, Math.round((count / growthMax.value) * 110))
}

// Donut of current member statuses
const donutStyle = computed(() => {
  const total = memberTotal.value
  if (!total) return '#e5e7eb'
  const active = (statusCounts.value.Active / total) * 100
  return `conic-gradient(#22c55e 0 ${active}%, #9ca3af ${active}% 100%)`
})

// ---------- 2. Applications ----------
const rangeApps = computed(() =>
  appsStore.applications.filter((application) => inRange(application.submittedAt)),
)

const appStats = computed(() => {
  const list = rangeApps.value
  const approved = list.filter((application) => application.status === 'Approved').length
  const returned = list.filter((application) => application.status === 'Returned').length
  const rejected = list.filter((application) => application.status === 'Rejected').length
  const inProgress = list.filter(
    (application) => application.status === 'Pending' || application.status === 'Under Review',
  ).length
  return {
    received: list.length,
    approved,
    returned,
    rejected,
    inProgress,
    approvalRate: list.length > 0 ? Math.round((approved / list.length) * 100) : 0,
  }
})

const appStack = computed(() => {
  const total = appStats.value.received
  if (!total) return []
  const segments = [
    {
      label: 'Approved',
      count: appStats.value.approved,
      color: 'bg-green-500',
      dot: 'bg-green-500',
    },
    {
      label: 'Returned',
      count: appStats.value.returned,
      color: 'bg-purple-500',
      dot: 'bg-purple-500',
    },
    { label: 'Rejected', count: appStats.value.rejected, color: 'bg-red-500', dot: 'bg-red-500' },
  ]
  return segments
    .filter((segment) => segment.count > 0)
    .map((segment) => ({ ...segment, pct: (segment.count / total) * 100 }))
})

const recentApps = computed(() =>
  [...rangeApps.value]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 5),
)

// ---------- 3. Loans ----------
function lastActivity(loan) {
  if (loan.payments.length > 0) return loan.payments[loan.payments.length - 1].at
  return loan.releasedAt || loan.createdAt
}

const delinquentLoans = computed(() =>
  loansStore.loans.filter((loan) => loansStore.isDelinquent(loan)),
)

const delinquentAmount = computed(() =>
  delinquentLoans.value.reduce((sum, loan) => sum + loansStore.balanceOf(loan), 0),
)

// Counted exactly like the loans store's paidOf: only Recorded
// payments are money the coop has verified — Pending app receipts
// must not inflate the collections figure.
const collectedInRange = computed(() => {
  let total = 0
  loansStore.loans.forEach((loan) => {
    loan.payments.forEach((payment) => {
      if (payment.status === 'Recorded' && inRange(payment.at)) total += payment.amount
    })
  })
  return Math.round(total * 100) / 100
})

const releasedInRange = computed(() =>
  loansStore.loans.filter((loan) => loan.releasedAt && inRange(loan.releasedAt)),
)

// Issued loans (Released + Paid) grouped by type
const loansByType = computed(() => {
  const issued = loansStore.loans.filter(
    (loan) => loan.status === 'Released' || loan.status === 'Paid',
  )
  return LOAN_TYPES.map((type) => {
    const matching = issued.filter((loan) => loan.type === type.value)
    return {
      value: type.value,
      label: type.label,
      count: matching.length,
      total: matching.reduce((sum, loan) => sum + loan.principal, 0),
    }
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total)
})

const loansByTypeMax = computed(() => Math.max(1, ...loansByType.value.map((row) => row.total)))

function typeBarPct(total) {
  return Math.max(2, Math.round((total / loansByTypeMax.value) * 100))
}

// ---------- 4. Expected loan collections ----------
const FORECAST_MONTHS = 12

const round2 = (value) => Math.round(value * 100) / 100

// Remaining instalments of one active loan: rebuild the loan's own
// amortization schedule from its terms and cross off what verified
// payments have already covered — the same rule as paidOf: a Pending
// receipt is not money the coop has accepted yet.
function remainingInstalments(loan) {
  if (loan.status !== 'Released') return []
  const paidSum = loansStore.paidOf(loan)
  const rows = buildSchedule({
    principal: loan.principal,
    ratePercent: loan.ratePercent,
    termMonths: loan.termMonths,
    startDate: loan.releasedAt,
  })
  let cumulative = 0
  const remaining = []
  for (const row of rows) {
    cumulative += row.payment
    if (paidSum < cumulative - 0.01) remaining.push(row)
  }
  return remaining
}

const activeLoans = computed(() => loansStore.loans.filter((loan) => loan.status === 'Released'))

const activeLoanCount = computed(() => activeLoans.value.length)

// Windows a treasurer actually asks about: already late, and what
// falls due inside the next 30 / 60 / 90 days. Anything past the
// 12-month chart is reported separately so no money is hidden.
const forecastTotals = computed(() => {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = 24 * 60 * 60 * 1000
  const in30 = new Date(startOfToday.getTime() + 30 * day)
  const in60 = new Date(startOfToday.getTime() + 60 * day)
  const in90 = new Date(startOfToday.getTime() + 90 * day)
  const lastBucket = new Date(now.getFullYear(), now.getMonth() + FORECAST_MONTHS, 0)
  const totals = { overdue: 0, due30: 0, due60: 0, due90: 0, beyond: 0 }
  activeLoans.value.forEach((loan) => {
    remainingInstalments(loan).forEach((row) => {
      const due = new Date(row.dueDate)
      if (due < startOfToday) totals.overdue += row.payment
      else if (due <= in30) totals.due30 += row.payment
      else if (due <= in60) totals.due60 += row.payment
      else if (due <= in90) totals.due90 += row.payment
      if (due > lastBucket) totals.beyond += row.payment
    })
  })
  return {
    overdue: round2(totals.overdue),
    due30: round2(totals.due30),
    due60: round2(totals.due60),
    due90: round2(totals.due90),
    beyond: round2(totals.beyond),
  }
})

const forecastMonths = computed(() => {
  const now = new Date()
  const buckets = []
  for (let i = 0; i < FORECAST_MONTHS; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: monthLabel(date.getFullYear(), date.getMonth()),
      year: date.getFullYear(),
      amount: 0,
      ...monthParts(date.getFullYear(), date.getMonth()),
    })
  }
  activeLoans.value.forEach((loan) => {
    remainingInstalments(loan).forEach((row) => {
      const due = new Date(row.dueDate)
      const key = `${due.getFullYear()}-${due.getMonth()}`
      const bucket = buckets.find((item) => item.key === key)
      if (bucket) bucket.amount += row.payment
    })
  })
  return buckets.map((bucket) => ({ ...bucket, amount: round2(bucket.amount) }))
})

const forecastYearGroups = computed(() => groupByYear(forecastMonths.value, ['amount'], false))

const forecastMax = computed(() =>
  Math.max(1, ...forecastMonths.value.map((point) => point.amount)),
)

const forecastTwelve = computed(() =>
  round2(forecastMonths.value.reduce((sum, point) => sum + point.amount, 0)),
)

function forecastBarPx(amount) {
  return Math.max(amount > 0 ? 6 : 2, Math.round((amount / forecastMax.value) * 110))
}

function shortPeso(amount) {
  const value = Number(amount) || 0
  return `₱${value.toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })}`
}

// ---------- 5. Cash flow ----------
const rangeTxns = computed(() => ledgerStore.transactions.filter((txn) => inRange(txn.date)))

const flow = computed(() => {
  let income = 0
  let expense = 0
  rangeTxns.value.forEach((txn) => {
    if (txn.type === 'Income') income += txn.amount
    else expense += txn.amount
  })
  return { income, expense, net: income - expense }
})

// Income vs expenses grouped by month
const flowSeries = computed(() => {
  const months = new Map()
  rangeTxns.value.forEach((txn) => {
    const date = new Date(`${txn.date}T00:00:00`)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    if (!months.has(key))
      months.set(key, { year: date.getFullYear(), month: date.getMonth(), income: 0, expense: 0 })
    const bucket = months.get(key)
    if (txn.type === 'Income') bucket.income += txn.amount
    else bucket.expense += txn.amount
  })
  return [...months.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({
      label: monthLabel(bucket.year, bucket.month),
      year: bucket.year,
      ...monthParts(bucket.year, bucket.month),
      income: bucket.income,
      expense: bucket.expense,
    }))
})

const flowYearGroups = computed(() => groupByYear(flowSeries.value, ['income', 'expense']))

const flowMax = computed(() =>
  Math.max(1, ...flowSeries.value.map((point) => Math.max(point.income, point.expense))),
)

function flowBarPx(value) {
  if (!value) return 2
  return Math.max(4, Math.round((value / flowMax.value) * 120))
}

// Top categories by total amount in period
const topCategories = computed(() => {
  const groups = new Map()
  const totalAmount = rangeTxns.value.reduce((sum, txn) => sum + txn.amount, 0)
  rangeTxns.value.forEach((txn) => {
    const key = `${txn.type}|${txn.category}`
    groups.set(key, (groups.get(key) || 0) + txn.amount)
  })
  return [...groups.entries()]
    .map(([key, total]) => {
      const [type, category] = key.split('|')
      return {
        key,
        type,
        category,
        total,
        pct: totalAmount > 0 ? Math.round((total / totalAmount) * 100) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
})

// ---------- 6. Financial summary ----------
const capitalTotal = computed(() =>
  reportMembers.value.reduce((sum, member) => sum + (member.capitalShare || 0), 0),
)

const membershipFees = computed(() =>
  ledgerStore.transactions
    .filter(
      (txn) => txn.type === 'Income' && txn.category === 'Membership Fees' && inRange(txn.date),
    )
    .reduce((sum, txn) => sum + txn.amount, 0),
)

const summaryRows = computed(() => [
  ['Total members (Active)', `${statusCounts.value.Active} of ${memberTotal.value}`],
  ['Capital shares — all members', formatPeso(capitalTotal.value)],
  ['Membership fees collected', formatPeso(membershipFees.value)],
  ['Income', formatPeso(flow.value.income), 'text-green-700'],
  ['Expenses', formatPeso(flow.value.expense), 'text-red-600'],
  [
    'Net cash flow',
    formatPeso(flow.value.net),
    flow.value.net >= 0 ? 'text-green-700' : 'text-red-600',
  ],
  ['Loans outstanding (current)', formatPeso(loansStore.outstandingBalance)],
  ['Loan collections', formatPeso(collectedInRange.value)],
  [
    'Delinquent amount',
    formatPeso(delinquentAmount.value),
    delinquentAmount.value > 0 ? 'text-red-600' : 'text-gray-800',
  ],
  // Registrations rows — HIDDEN for v1.0 (module disabled; face-to-face
  // registration only). Restore together with SHOW_REGISTRATIONS.
  // ['Registrations received', String(appStats.value.received)],
  // ['Registrations approved', String(appStats.value.approved)],
])

// ---------- CSV export ----------
function download(filename, headers, rows) {
  const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportGrowth() {
  download(
    'ucms-membership-growth.csv',
    ['Month', 'New members'],
    growthSeries.value.map((point) => [point.label, point.count]),
  )
}

function exportApplications() {
  download(
    'ucms-registrations.csv',
    ['App No', 'Applicant', 'Status', 'Source', 'Submitted'],
    rangeApps.value.map((app) => [
      app.appNo,
      `${app.firstName} ${app.lastName}`,
      app.status,
      app.source,
      formatDate(app.submittedAt),
    ]),
  )
}

function exportLoans() {
  download(
    'ucms-loans.csv',
    ['Loan No', 'Member', 'Type', 'Principal', 'Balance', 'Status', 'Delinquent'],
    loansStore.loans.map((loan) => [
      loan.loanNo,
      loan.memberName,
      loan.type,
      loan.principal,
      loansStore.balanceOf(loan),
      loan.status,
      loansStore.isDelinquent(loan) ? 'Yes' : 'No',
    ]),
  )
}

function exportForecast() {
  download(
    'ucms-expected-loan-collections.csv',
    ['Line', 'Value'],
    [
      ...forecastMonths.value.map((point) => [
        `Scheduled collections — ${point.label}`,
        point.amount.toFixed(2),
      ]),
      ['Already overdue', forecastTotals.value.overdue.toFixed(2)],
      ['Due in 30 days', forecastTotals.value.due30.toFixed(2)],
      ['Due in 60 days', forecastTotals.value.due60.toFixed(2)],
      ['Due in 90 days', forecastTotals.value.due90.toFixed(2)],
      ['Beyond 12 months', forecastTotals.value.beyond.toFixed(2)],
    ],
  )
}

function exportCashFlow() {
  download(
    'ucms-cash-flow.csv',
    ['Month', 'Income', 'Expenses', 'Net'],
    flowSeries.value.map((point) => [
      point.label,
      point.income,
      point.expense,
      point.income - point.expense,
    ]),
  )
}

function exportSummary() {
  download(
    'ucms-financial-summary.csv',
    ['Metric', 'Value'],
    summaryRows.value.map((row) => [row[0], row[1]]),
  )
}
</script>
