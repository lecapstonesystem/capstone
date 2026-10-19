<template>
  <AppLayout>
    <div>
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Notifications</h1>
        <p class="text-sm text-gray-500 mt-1">
          Automated payment reminders and loan updates for members using the mobile app
        </p>
      </div>

      <p
        v-if="pageNotice"
        class="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl mb-6"
      >
        {{ pageNotice }}
      </p>

      <!-- Payment reminders — generated from every released loan's schedule -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 class="font-semibold text-gray-800">Payment reminders</h2>
        <p class="text-sm text-gray-500 mt-1">
          The system checks every released loan and lists payments that fall inside the window you
          choose — review the list, uncheck anyone to skip, then send. Members see the message the
          next time they open the app.
        </p>

        <div class="flex flex-wrap items-center gap-3 mt-4">
          <select
            v-model="windowDays"
            class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="overdue">Overdue only</option>
            <option value="7">Due in the next 7 days</option>
            <option value="14">Due in the next 14 days</option>
            <option value="30">Due in the next 30 days</option>
            <option value="60">Due in the next 60 days</option>
          </select>
          <button
            @click="findCandidates"
            :disabled="searching"
            class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50"
          >
            {{ searching ? 'Checking…' : 'Find payments due' }}
          </button>
          <p v-if="candidatesError" class="text-sm text-red-600">{{ candidatesError }}</p>
        </div>

        <div v-if="candidates !== null" class="mt-4">
          <p v-if="!candidates.length" class="text-sm text-gray-400">
            No payments due in this window — nothing to remind. (Members without an app login and
            loans already carrying an unread reminder are left out automatically.)
          </p>
          <template v-else>
            <div class="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <p class="text-sm text-gray-600">
                {{ selectedCount }} of {{ candidates.length }} selected
              </p>
              <button
                class="text-xs font-medium text-green-700 hover:text-green-800"
                @click="toggleAll"
              >
                {{ selectedCount === candidates.length ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <ul class="border border-gray-100 rounded-lg divide-y divide-gray-100">
              <li
                v-for="row in candidates"
                :key="row.loanId"
                class="flex items-center gap-3 px-3 py-2.5"
              >
                <input
                  v-model="row.selected"
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-gray-800 truncate">
                    {{ row.memberName }}
                    <span v-if="row.memberNo" class="text-gray-400 font-normal"
                      >· {{ row.memberNo }}</span
                    >
                  </p>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {{ row.loanNo }} · due {{ formatLongDate(row.dueDate)
                    }}<span v-if="row.overdue" class="text-red-600 font-medium"> · overdue</span>
                  </p>
                </div>
                <p class="text-sm font-medium text-gray-800 shrink-0">
                  {{ formatPeso(row.amount) }}
                </p>
              </li>
            </ul>
            <div class="flex justify-end mt-3">
              <button
                :disabled="selectedCount === 0"
                @click="confirmSend = true"
                class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50"
              >
                Send {{ selectedCount }} reminder{{ selectedCount === 1 ? '' : 's' }}
              </button>
            </div>
          </template>
        </div>
      </section>

      <!-- What went out, and whether it was opened -->
      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 class="font-semibold text-gray-800">Recently sent</h2>
          <button
            @click="notificationsStore.fetchRecent()"
            :disabled="notificationsStore.loading"
            class="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition duration-200 disabled:opacity-50"
          >
            {{ notificationsStore.loading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <p v-if="notificationsStore.lastError" class="text-sm text-red-600 mb-3">
          {{ notificationsStore.lastError }}
        </p>
        <div v-if="notificationsStore.loading" class="text-sm text-gray-400">Loading…</div>
        <p v-else-if="!notificationsStore.recent.length" class="text-sm text-gray-400">
          Nothing sent yet.
        </p>
        <ul v-else class="border border-gray-100 rounded-lg divide-y divide-gray-100">
          <li
            v-for="note in notificationsStore.recent"
            :key="note.id"
            class="px-3 py-2.5 flex flex-wrap items-start justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm text-gray-800">
                <span
                  class="inline-block text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded mr-1.5 align-middle"
                  :class="badgeClass(note.type)"
                  >{{ notificationsStore.typeLabel(note.type) }}</span
                >
                {{ note.title }} — {{ note.memberName
                }}<span v-if="note.memberNo"> ({{ note.memberNo }})</span>
              </p>
              <p class="text-xs text-gray-500 mt-1">{{ note.body }}</p>
              <p class="text-xs text-gray-400 mt-1">Sent by {{ note.sentBy }}</p>
            </div>
            <div class="text-right shrink-0 text-xs space-y-1">
              <p class="text-gray-500">{{ formatDateTime(note.createdAt) }}</p>
              <p v-if="note.readAt" class="text-green-700">
                Read {{ formatDateTime(note.readAt) }}
              </p>
              <p v-else class="text-amber-600 font-medium">Not yet opened</p>
            </div>
          </li>
        </ul>
        <p class="text-xs text-gray-400 mt-3">Newest 50 messages.</p>
      </section>

      <!-- Two-step confirm — sending is final (history keeps the trail) -->
      <div
        v-if="confirmSend"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        @click.self="confirmSend = false"
      >
        <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">
            Send {{ selectedCount }} reminder{{ selectedCount === 1 ? '' : 's' }}?
          </h2>
          <p class="text-sm text-gray-500 mb-6">
            Each selected member receives one message in their app inbox about the payment shown
            above. Reminders do not stack — while one is still unread, that loan will not be listed
            again.
          </p>
          <div class="flex justify-end gap-3">
            <button
              @click="confirmSend = false"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition duration-200"
            >
              Cancel
            </button>
            <button
              @click="doSend"
              :disabled="sending"
              class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition duration-200 disabled:opacity-50"
            >
              {{ sending ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useLoansStore } from '../stores/loans'
import { useMembersStore } from '../stores/members'

/**
 * Bulk Notification Center — reminders are drafted by walking every
 * released loan's schedule (buildSchedule + nextDue in the store);
 * this view is the review-and-send step. The lower section shows
 * what went out and whether the member opened it.
 */
const notificationsStore = useNotificationsStore()
const loansStore = useLoansStore()
const membersStore = useMembersStore()

const windowDays = ref('7')
const searching = ref(false)
const candidates = ref(null) // null = not searched yet
const candidatesError = ref('')
const pageNotice = ref('')
const confirmSend = ref(false)
const sending = ref(false)

const selectedCount = computed(() => (candidates.value || []).filter((row) => row.selected).length)

onMounted(async () => {
  const jobs = [notificationsStore.fetchRecent()]
  if (!loansStore.loans.length) jobs.push(loansStore.fetchLoans())
  if (!membersStore.members.length) jobs.push(membersStore.fetchMembers())
  await Promise.all(jobs)
})

async function findCandidates() {
  searching.value = true
  candidatesError.value = ''
  candidates.value = null
  const result = await notificationsStore.findReminderCandidates(windowDays.value)
  searching.value = false
  if (!result.ok) {
    candidatesError.value = result.message
    return
  }
  candidates.value = result.rows.map((row) => ({ ...row, selected: true }))
}

function toggleAll() {
  const all = selectedCount.value === candidates.value.length
  candidates.value.forEach((row) => {
    row.selected = !all
  })
}

async function doSend() {
  sending.value = true
  const selected = candidates.value.filter((row) => row.selected)
  const result = await notificationsStore.sendReminders(selected)
  sending.value = false
  confirmSend.value = false
  if (!result.ok) {
    candidatesError.value = result.message
    return
  }
  pageNotice.value = `${result.count} reminder${result.count === 1 ? '' : 's'} sent — members will see them the next time they open the app.`
  candidates.value = null // sent — run Find again to see what is left
  notificationsStore.fetchRecent()
}

function badgeClass(type) {
  if (type === 'payment_overdue') return 'bg-red-100 text-red-700'
  if (type === 'payment_due') return 'bg-amber-100 text-amber-700'
  if (type === 'loan_approved') return 'bg-green-100 text-green-700'
  if (type === 'loan_returned') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600' // loan_rejected
}

function formatPeso(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatLongDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>
