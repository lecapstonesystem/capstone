<template>
  <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
    <div class="flex items-center justify-between mb-5 flex-wrap gap-2">
      <div>
        <h2 class="font-semibold text-gray-800">Analytics Lab — prediction &amp; backtesting</h2>
        <p v-if="lab" class="text-xs text-gray-400">
          Analytics engine · based on {{ lab.backtest.n_months }} months of records · records up to
          {{ lab.cycles.summary.ledger_as_of }}
        </p>
        <p v-else class="text-xs text-gray-400">Forecasts, model checks, and member trends.</p>
      </div>
      <button
        v-if="error"
        @click="loadLab"
        :disabled="loading"
        class="text-xs text-green-700 hover:text-green-800 disabled:opacity-50"
      >
        {{ loading ? 'Retrying…' : 'Retry' }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-gray-500 py-6 text-center">
      Loading analytics from the backend…
    </p>
    <p v-else-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg p-3">
      Analytics Lab is unavailable: {{ error }}
    </p>

    <template v-else-if="lab">
      <p v-if="warnings.length" class="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 mb-4">
        Some analytics could not be loaded. The remaining results are shown.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <div
          v-for="insight in labInsights"
          :key="insight.text"
          class="bg-gray-50 rounded-lg p-3 flex items-start gap-2"
        >
          <span
            class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5"
            :class="tagClass(insight.tag)"
          >
            {{ insight.tag }}
          </span>
          <p class="text-sm text-gray-700 leading-snug">{{ insight.text }}</p>
        </div>
      </div>

      <div class="mb-8">
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          Accuracy test — methods guessed the last {{ lab.backtest.holdout }} months, then we
          checked which was closest
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-400 border-b border-gray-100">
                <th class="py-2 pr-4 font-medium">Method</th>
                <th class="py-2 pr-4 font-medium text-right">Average error</th>
                <th class="py-2 pr-4 font-medium text-right">Overall error</th>
                <th class="py-2 font-medium text-right">Within 25% of actual</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="model in lab.backtest.scorecard"
                :key="model.model"
                class="border-b border-gray-50"
                :class="model.model === lab.backtest.best_model ? 'bg-green-50' : ''"
              >
                <td class="py-2 pr-4 text-gray-700">
                  {{ modelNames[model.model] || model.model }}
                  <span
                    v-if="model.model === lab.backtest.best_model"
                    class="text-xs text-green-700 font-medium"
                  >
                    — most accurate
                  </span>
                </td>
                <td class="py-2 pr-4 text-right text-gray-600">{{ formatPeso(model.mae) }}</td>
                <td class="py-2 pr-4 text-right text-gray-600">
                  {{ (model.wape * 100).toFixed(1) }}%
                </td>
                <td class="py-2 text-right text-gray-600">
                  {{ (model.within_25pct * 100).toFixed(0) }}%
                </td>
              </tr>
              <tr v-if="!lab.backtest.scorecard.length">
                <td colspan="4" class="py-3 text-center text-gray-400">
                  Not enough history to compare forecast methods.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <div class="bg-blue-50 rounded-lg p-3">
          <p class="text-xs text-blue-700">
            Expected releases, next {{ lab.forecast.rows.length }} months
          </p>
          <p class="text-lg font-bold text-blue-700">
            {{ formatPesoApprox(lab.forecast.total_expected) }}
          </p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500">Typical monthly forecast range (±)</p>
          <p class="text-lg font-bold text-gray-800">
            ± {{ formatPesoApprox(lab.forecast.interval_band) }}
          </p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500">Loan-type shares (last 12 months)</p>
          <p class="text-sm font-medium text-gray-700 mt-1">
            <span v-for="(share, type) in lab.forecast.type_shares_12m" :key="type" class="mr-3">
              {{ type }} {{ (share * 100).toFixed(0) }}%
            </span>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div v-for="chart in charts" :key="chart.kind">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            {{ chart.title }}
          </p>
          <p v-if="chartErrors[chart.kind]" class="text-sm text-amber-700">
            This chart could not be loaded.
          </p>
          <p v-else-if="!chartUrls[chart.kind]" class="text-sm text-gray-400">Loading chart…</p>
          <img
            v-else
            :src="chartUrls[chart.kind]"
            :alt="chart.title"
            class="w-full rounded-lg border border-gray-100"
            @error="chartErrors[chart.kind] = true"
          />
        </div>
      </div>

      <div class="mb-8">
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Collections — scheduled vs expected receipts over the next
          {{ lab.collections.rows.length }} months
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-500">Scheduled</p>
            <p class="text-lg font-bold text-gray-800">
              {{ formatPesoApprox(lab.collections.total_scheduled) }}
            </p>
          </div>
          <div class="bg-green-50 rounded-lg p-3">
            <p class="text-xs text-green-700">Probability-weighted estimate</p>
            <p class="text-lg font-bold text-green-700">
              {{ formatPesoApprox(lab.collections.total_weighted) }}
            </p>
          </div>
          <div class="bg-red-50 rounded-lg p-3">
            <p class="text-xs text-red-600">Difference</p>
            <p class="text-lg font-bold text-red-600">
              {{
                formatPesoApprox(lab.collections.total_scheduled - lab.collections.total_weighted)
              }}
            </p>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">
          Completion by loan term:
          <span
            v-for="bucket in lab.collections.recovery_by_bucket"
            :key="bucket.bucket"
            class="mr-3"
          >
            {{ bucket.bucket }}
            <b class="text-gray-600">{{ (bucket.completion_rate * 100).toFixed(1) }}%</b>
            fully paid ({{ bucket.n_loans }} loans)
          </span>
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Repeat borrowing — {{ lab.cycles.summary.recurring_members }} repeat borrowers,
            returning about every {{ lab.cycles.summary.cohort_avg_cycle_months }} months
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th class="py-2 pr-3 font-medium">Member</th>
                  <th class="py-2 pr-3 font-medium text-right">Days between loans</th>
                  <th class="py-2 pr-3 font-medium">Usual month</th>
                  <th class="py-2 font-medium">Next application window</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in lab.cycles.recurring.slice(0, 6)"
                  :key="row.member"
                  class="border-b border-gray-50"
                >
                  <td class="py-2 pr-3 text-gray-700">{{ row.member }}</td>
                  <td class="py-2 pr-3 text-right text-gray-600">{{ row.avg_cycle_days }}d</td>
                  <td class="py-2 pr-3 text-gray-600">{{ row.busy_month || '—' }}</td>
                  <td
                    class="py-2 text-gray-600"
                    :class="row.days_until_next < 0 ? 'text-amber-700' : ''"
                  >
                    {{ row.next_window }}
                    <span v-if="row.days_until_next < 0" class="text-[10px] uppercase">
                      · due
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Members most likely to apply again — as of {{ lab.propensity.ledger_as_of }}
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th class="py-2 pr-3 font-medium">Member</th>
                  <th class="py-2 pr-3 font-medium text-right">Likelihood</th>
                  <th class="py-2 pr-3 font-medium text-right">Past loans</th>
                  <th class="py-2 font-medium text-right">Days since last loan</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in lab.propensity.ranking.slice(0, 6)"
                  :key="row.member"
                  class="border-b border-gray-50"
                >
                  <td class="py-2 pr-3 text-gray-700">{{ row.member }}</td>
                  <td
                    class="py-2 pr-3 text-right font-medium"
                    :class="row.score >= 60 ? 'text-green-700' : 'text-gray-600'"
                  >
                    {{ row.score }}
                  </td>
                  <td class="py-2 pr-3 text-right text-gray-600">{{ row.n_loans }}</td>
                  <td class="py-2 text-right text-gray-600">{{ row.days_since_last }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-400 mt-4">
        Busiest month for applications: <b class="text-gray-600">{{ lab.seasonality.peak_month }}</b
        >; slowest: <b class="text-gray-600">{{ lab.seasonality.trough_month }}</b
        >. Around paydays (15th and 30th), applications run at
        {{ Number(lab.seasonality.payday_lift || 0).toFixed(2) }}× the usual rate. Forecast methods
        are back-tested against months they have not seen.
      </p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { analyticsApi } from '../lib/api'

const modelNames = {
  ma3: 'Average of the last 3 months',
  ma6: 'Average of the last 6 months',
  trend: 'Steady up/down trend',
  seasonal_naive: 'Same month as last year',
}

const charts = [
  { kind: 'forecast', title: 'Monthly releases and forecast range' },
  { kind: 'heatmap', title: 'Loan applications by month' },
  { kind: 'backtest', title: 'Forecast accuracy check' },
  { kind: 'cycles', title: 'Days between repeat loans' },
]

const lab = ref(null)
const loading = ref(true)
const error = ref('')
const warnings = ref([])
const chartErrors = ref({})
const chartUrls = ref({})

function clearChartUrls() {
  Object.values(chartUrls.value).forEach((url) => URL.revokeObjectURL(url))
  chartUrls.value = {}
}

onBeforeUnmount(clearChartUrls)

const tagClass = (tag) =>
  ({
    unusual: 'bg-red-100 text-red-700',
    model: 'bg-blue-100 text-blue-700',
    trend: 'bg-green-100 text-green-700',
    behavior: 'bg-amber-100 text-amber-700',
    rhythm: 'bg-amber-100 text-amber-700',
    repayment: 'bg-gray-200 text-gray-600',
  })[tag] || 'bg-gray-200 text-gray-600'

const labInsights = computed(() => {
  const all = lab.value?.insights?.insights || []
  const unusual = all.find((insight) => insight.tag === 'unusual')
  const rest = all.filter((insight) => insight.tag !== 'unusual').slice(0, 3)
  return unusual ? [unusual, ...rest] : all.slice(0, 4)
})

const formatPeso = (value) =>
  `₱${(Number(value) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function formatPesoApprox(value) {
  const amount = Number(value)
  if (value == null || Number.isNaN(amount)) return '—'
  return `about ₱${(Math.round(amount / 1000) * 1000).toLocaleString('en-PH')}`
}

async function loadLab() {
  loading.value = true
  error.value = ''
  warnings.value = []
  chartErrors.value = {}
  clearChartUrls()
  try {
    const results = await Promise.allSettled([
      analyticsApi.insights(),
      analyticsApi.backtest(),
      analyticsApi.forecast(6),
      analyticsApi.memberCycles(),
      analyticsApi.propensity(6),
      analyticsApi.reliability(),
      analyticsApi.collections(6),
      analyticsApi.seasonality(),
      ...charts.map((chart) => analyticsApi.chart(chart.kind)),
    ])
    const [
      insights,
      backtest,
      forecast,
      cycles,
      propensity,
      reliability,
      collections,
      seasonality,
      ...chartResults
    ] = results

    if (insights.status !== 'fulfilled') {
      throw insights.reason
    }

    const value = (result) => (result.status === 'fulfilled' ? result.value : null)
    warnings.value = results.slice(1).filter((result) => result.status === 'rejected')
    charts.forEach((chart, index) => {
      const result = chartResults[index]
      if (result.status === 'fulfilled') {
        chartUrls.value[chart.kind] = URL.createObjectURL(result.value)
      } else {
        chartErrors.value[chart.kind] = true
      }
    })
    lab.value = {
      insights: insights.value,
      backtest: value(backtest) || { scorecard: [], best_model: null, holdout: 0, n_months: 0 },
      forecast: value(forecast) || {
        rows: [],
        total_expected: null,
        interval_band: null,
        type_shares_12m: {},
      },
      cycles: value(cycles) || {
        recurring: [],
        summary: { ledger_as_of: '—', recurring_members: 0, cohort_avg_cycle_months: '—' },
      },
      propensity: value(propensity) || { ranking: [], ledger_as_of: '—' },
      reliability: value(reliability),
      collections: value(collections) || {
        rows: [],
        total_scheduled: null,
        total_weighted: null,
        recovery_by_bucket: [],
      },
      seasonality: value(seasonality) || { peak_month: '—', trough_month: '—', payday_lift: 0 },
    }
  } catch (loadError) {
    error.value = loadError?.message || 'The analytics backend could not return a response.'
  } finally {
    loading.value = false
  }
}

onMounted(loadLab)
</script>
