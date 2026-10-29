<script setup>
// Interactive Analytics Lab charts (Chart.js) — the hover-anywhere view
// the panel asked for ("like binance/bingx"): moving the cursor over any
// point shows the exact numbers in a floating box. Data comes from the
// SAME API payloads the tables use (props), so chart and table can never
// disagree. The server-rendered PNG charts stay available at /charts/*.png
// for printing; these are the on-screen versions.
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  Chart, LineController, LineElement, PointElement, BarController,
  BarElement, CategoryScale, LinearScale, Tooltip, Filler, Legend,
} from 'chart.js'

Chart.register(
  LineController, LineElement, PointElement, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Filler, Legend,
)

const props = defineProps({
  fc: { type: Object, required: true },   // forecast: rows[{month,point,low,high}]
  bt: { type: Object, required: true },   // backtest: months_backtested, actuals, predictions
  se: { type: Object, required: true },   // seasonality: matrix[{year,loans[],disbursed[]}]
  cy: { type: Object, required: true },   // cycles: recurring[{member,avg_cycle_days,...}]
})

const peso = (v) => '₱' + Math.round(Number(v) || 0).toLocaleString('en-PH')

const forecastEl = ref(null)
const backtestEl = ref(null)
const cyclesEl = ref(null)
const heatmapHover = ref(null)   // hovered heatmap cell (plain CSS grid + JS tooltip)
let fcChart, btChart, cyChart

// Shared tooltip look (dark box, white text — the trading-chart feel,
// but words stay plain: "we expect to release", never "point estimate").
const tooltipStyle = {
  backgroundColor: 'rgba(17, 24, 39, 0.92)',
  padding: 10,
  cornerRadius: 8,
  titleFont: { size: 12, weight: '600' },
  bodyFont: { size: 12 },
  displayColors: true,
  boxWidth: 10,
  boxHeight: 10,
}

function buildForecast() {
  if (!forecastEl.value || !props.fc.rows?.length) return
  // One continuous story: last 6 months that actually happened (from the
  // backtest payload) + the next 6 we forecast. Actual = solid, forecast
  // = dashed, the trusted range = shaded band.
  const past = (props.bt.months_backtested || []).map((m, i) => ({
    month: m, value: props.bt.actuals?.[i] ?? null,
  }))
  const future = props.fc.rows.map((r) => ({
    month: r.month, value: r.point, low: r.low, high: r.high,
  }))
  const labels = [...past, ...future].map((p) => p.month)
  const actualData = [...past.map((p) => p.value), ...future.map(() => null)]
  const forecastData = [
    ...past.slice(0, -1).map(() => null),
    past.length ? past[past.length - 1].value : null,   // bridge point
    ...future.map((p) => p.value),
  ]
  const highData = [...past.map(() => null), null, ...future.map((p) => p.high)]
  const lowData = [...past.map(() => null), null, ...future.map((p) => p.low)]
  fcChart = new Chart(forecastEl.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Trusted range (high)', data: highData, borderWidth: 0,
          pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Trusted range', data: lowData, borderWidth: 0,
          pointRadius: 0, fill: '-1', backgroundColor: 'rgba(37, 99, 235, 0.10)',
          tension: 0.3 },
        { label: 'What actually happened', data: actualData,
          borderColor: '#6b7280', backgroundColor: '#6b7280',
          borderWidth: 2, pointRadius: 3, tension: 0.3 },
        { label: 'What we expect', data: forecastData,
          borderColor: '#2563eb', backgroundColor: '#2563eb',
          borderWidth: 2, borderDash: [6, 4], pointRadius: 3, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },   // crosshair-follow
      plugins: {
        legend: { display: true, position: 'bottom', labels: {
          filter: (item) => !item.text.startsWith('Trusted range'),
          usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
        tooltip: { ...tooltipStyle, callbacks: {
          label: (c) => {
            if (c.dataset.label === 'Trusted range (high)') return null
            if (c.dataset.label === 'Trusted range')
              return ` range: ${peso(c.parsed.y)} – ${peso(
                props.fc.rows.find((r) => r.month === c.label)?.high)}`
            return ` ${c.dataset.label}: ${peso(c.parsed.y)}`
          },
        } },
      },
      scales: {
        y: { ticks: { callback: (v) => peso(v), font: { size: 11 } },
             grid: { color: '#f3f4f6' } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  })
}

function buildBacktest() {
  if (!backtestEl.value || !props.bt.months_backtested?.length) return
  btChart = new Chart(backtestEl.value, {
    type: 'line',
    data: {
      labels: props.bt.months_backtested,
      datasets: [
        { label: 'What actually happened', data: props.bt.actuals,
          borderColor: '#6b7280', backgroundColor: '#6b7280',
          borderWidth: 2, pointRadius: 3, tension: 0.3 },
        { label: 'What the winning model guessed', data: props.bt.predictions,
          borderColor: '#2563eb', backgroundColor: '#2563eb',
          borderWidth: 2, borderDash: [6, 4], pointRadius: 3, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: {
          usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
        tooltip: { ...tooltipStyle, callbacks: {
          afterBody: (items) => {
            const i = items[0]?.dataIndex
            if (i == null) return ''
            const a = props.bt.actuals?.[i], p = props.bt.predictions?.[i]
            if (a == null || p == null) return ''
            const off = Math.round(Math.abs(a - p))
            return ` difference: ${peso(off)}`
          },
          label: (c) => ` ${c.dataset.label}: ${peso(c.parsed.y)}`,
        } },
      },
      scales: {
        y: { ticks: { callback: (v) => peso(v), font: { size: 11 } },
             grid: { color: '#f3f4f6' } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  })
}

function buildCycles() {
  const rows = (props.cy.recurring || []).slice(0, 8)
  if (!cyclesEl.value || !rows.length) return
  cyChart = new Chart(cyclesEl.value, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.member),
      datasets: [{
        label: 'Days between loans',
        data: rows.map((r) => r.avg_cycle_days),
        backgroundColor: rows.map((r) =>
          r.confidence === 'high' ? '#2563eb'
          : r.confidence === 'medium' ? '#93c5fd' : '#dbeafe'),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipStyle, callbacks: {
          label: (c) => {
            const r = rows[c.dataIndex]
            return [
              ` about ${r.avg_cycle_days} days between loans`,
              ` ${r.n_loans} loans · usually ${r.busy_month || 'no fixed month'}`,
              ` next window: ${r.next_window}`,
            ]
          },
        } },
      },
      scales: {
        x: { ticks: { font: { size: 11 } }, grid: { color: '#f3f4f6' } },
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  })
}

// Heatmap: pure CSS grid (years x months) with a hover readout — same
// information as the PNG heatmap, now interactive. Intensity = loans.
const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const heatLevels = [0, 1, 2, 3, 4, 5]   // mapped to blue shades
const heatShade = (n) => ({
  0: 'bg-gray-100', 1: 'bg-blue-100', 2: 'bg-blue-200',
  3: 'bg-blue-300', 4: 'bg-blue-400', 5: 'bg-blue-500',
}[Math.min(n, 5)])
function heatOn(year, mi, count, disbursed) {
  heatmapHover.value = {
    text: `${monthShort[mi]} ${year}: ${count} loan${count === 1 ? '' : 's'}, ${peso(disbursed)} released`,
  }
}
function heatOff() { heatmapHover.value = null }

let ro   // ResizeObserver so charts track their container on any layout change
onMounted(async () => {
  await nextTick()
  buildForecast(); buildBacktest(); buildCycles()
  ro = new ResizeObserver(() => {
    fcChart?.resize(); btChart?.resize(); cyChart?.resize()
  })
  ;[forecastEl, backtestEl, cyclesEl].forEach((el) => {
    if (el.value) ro.observe(el.value.parentElement)
  })
})
onBeforeUnmount(() => {
  fcChart?.destroy(); btChart?.destroy(); cyChart?.destroy(); ro?.disconnect()
})
// If the payloads refresh (e.g. re-login refetch), rebuild cleanly.
watch(() => [props.fc, props.bt, props.cy], async () => {
  await nextTick()
  fcChart?.destroy(); btChart?.destroy(); cyChart?.destroy()
  fcChart = btChart = cyChart = undefined
  buildForecast(); buildBacktest(); buildCycles()
})
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <!-- Forecast: history + expectation + trusted range -->
    <div>
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        How much we release each month (with the range we can trust) — hover for exact amounts
      </p>
      <div class="relative h-64 rounded-lg border border-gray-100 p-2">
        <canvas ref="forecastEl"></canvas>
      </div>
    </div>

    <!-- Backtest: guess vs reality -->
    <div>
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        Accuracy check — guessed months vs what actually happened — hover to compare
      </p>
      <div class="relative h-64 rounded-lg border border-gray-100 p-2">
        <canvas ref="backtestEl"></canvas>
      </div>
    </div>

    <!-- Heatmap: busy vs slow months -->
    <div>
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        Loan applications per month (busy vs slow months) — hover or tap a box
      </p>
      <div class="rounded-lg border border-gray-100 p-3">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr>
                <th class="text-left text-gray-400 font-medium pr-2">Year</th>
                <th v-for="m in monthShort" :key="m"
                    class="text-gray-400 font-medium px-1">{{ m }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in se.matrix" :key="row.year">
                <td class="text-gray-500 pr-2 font-medium">{{ row.year }}</td>
                <td v-for="(count, mi) in row.loans" :key="mi" class="p-0.5">
                  <div
                    class="h-7 rounded cursor-pointer transition-all"
                    :class="heatShade(count)"
                    @mouseenter="heatOn(row.year, mi, count, row.disbursed[mi])"
                    @mouseleave="heatOff"
                    @touchstart.prevent="heatOn(row.year, mi, count, row.disbursed[mi])"
                  ></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-600 mt-2 h-5" :class="heatmapHover ? 'text-gray-800' : 'text-gray-400'">
          {{ heatmapHover ? heatmapHover.text : 'Darker = more loans that month' }}
        </p>
      </div>
    </div>

    <!-- Cycles: who comes back, how fast -->
    <div>
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        Days between loans for members who borrow again — hover for their next window
      </p>
      <div class="relative h-64 rounded-lg border border-gray-100 p-2">
        <canvas ref="cyclesEl"></canvas>
      </div>
    </div>
  </div>
</template>
