import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { buildSchedule, nextDue } from '../utils/amortization'
import { useLoansStore } from './loans'
import { useMembersStore } from './members'
import { useAuthStore } from './auth'

/**
 * Notifications store — the Bulk Notification Center behind the
 * portal's Notifications page.
 *
 * One table (21_notifications.sql) holds every message sent to a
 * member's app inbox: automated payment reminders drafted from each
 * released loan's schedule, and the outcome notices written when an
 * admin approves / returns / rejects an app-filed loan request
 * (those inserts live in the loans store — this store is never
 * imported from there, so there is no circular dependency).
 *
 * Delivery is in-app: the member app reads its own rows under RLS
 * and marks them read; only read_at can ever change (a trigger
 * freezes message content).
 */

const TYPE_LABELS = {
  payment_due: 'Payment due',
  payment_overdue: 'Payment overdue',
  loan_approved: 'Loan approved',
  loan_returned: 'Loan returned',
  loan_rejected: 'Loan rejected',
}

const money = (value) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })

export const useNotificationsStore = defineStore('notifications', () => {
  const recent = ref([])
  const loading = ref(false)
  const lastError = ref('')

  function typeLabel(type) {
    return TYPE_LABELS[type] || type
  }

  // Newest 50 messages — who got what, sent by whom, opened or not.
  async function fetchRecent() {
    loading.value = true
    lastError.value = ''
    const { data, error } = await supabase
      .from('notification')
      .select('*, member:member_id(name, member_no), admin:created_by(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    loading.value = false
    if (error) {
      lastError.value = errorMessage(error)
      recent.value = []
      return
    }
    recent.value = (data || []).map((row) => ({
      id: row.notification_id,
      memberName: row.member?.name || '—',
      memberNo: row.member?.member_no || '',
      type: row.type,
      title: row.title,
      body: row.body,
      sentBy: row.admin?.name || 'System',
      createdAt: row.created_at,
      readAt: row.read_at,
    }))
  }

  // ---------- automated payment reminders ----------
  // Walk every released loan, find its first uncovered installment
  // (buildSchedule + nextDue — the same math the loan drawer and the
  // Loan Note print), and keep the ones inside the chosen window.
  // Members without an app login are skipped: there is no channel to
  // reach them yet. Loans still carrying an UNREAD reminder are
  // skipped too, so reminders never stack in one inbox.
  //
  // window: 'overdue' | '7' | '14' | '30' | '60'
  async function findReminderCandidates(windowDays) {
    lastError.value = ''
    try {
      const loansStore = useLoansStore()
      const membersStore = useMembersStore()
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const endOfWindow = new Date(startOfToday)
      if (windowDays !== 'overdue') endOfWindow.setDate(endOfWindow.getDate() + Number(windowDays))

      const rows = []
      for (const loan of loansStore.loans) {
        if (loan.status !== 'Released') continue
        const schedule = buildSchedule({
          principal: loan.principal,
          ratePercent: loan.ratePercent,
          termMonths: loan.termMonths,
          startDate: loan.releasedAt,
        })
        const due = nextDue(schedule, loansStore.paidOf(loan))
        if (!due) continue // fully paid
        const dueDate = new Date(due.dueDate)
        const overdue = dueDate < startOfToday
        const inWindow = windowDays === 'overdue' ? false : dueDate <= endOfWindow
        if (!overdue && !inWindow) continue
        const member = membersStore.members.find((item) => item.id === loan.memberId)
        if (!member || !member.account?.hasLogin) continue
        rows.push({
          loanId: loan.id,
          loanNo: loan.loanNo,
          memberId: member.id,
          memberName: member.name,
          memberNo: member.memberNo,
          dueDate: due.dueDate,
          amount: due.payment,
          overdue,
        })
      }

      // Don't stack reminders the member hasn't opened yet.
      const loanIds = [...new Set(rows.map((row) => row.loanId))]
      let filtered = rows
      if (loanIds.length) {
        const { data } = await supabase
          .from('notification')
          .select('loan_id')
          .in('loan_id', loanIds)
          .in('type', ['payment_due', 'payment_overdue'])
          .is('read_at', null)
        const blocked = new Set((data || []).map((row) => row.loan_id))
        filtered = rows.filter((row) => !blocked.has(row.loanId))
      }

      filtered.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      return { ok: true, rows: filtered }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  }

  // One message per selected row, written in plain language so the
  // portal's recent list and the app speak with one voice.
  async function sendReminders(selected) {
    if (!selected.length) return { ok: false, message: 'Select at least one payment due.' }
    const auth = useAuthStore()
    const rows = selected.map((row) => ({
      member_id: row.memberId,
      loan_id: row.loanId,
      type: row.overdue ? 'payment_overdue' : 'payment_due',
      title: row.overdue ? 'Payment overdue' : 'Payment due soon',
      body: row.overdue
        ? `Your ${row.loanNo} payment of ${money(row.amount)} was due on ${longDate(row.dueDate)}. Please settle it at the cooperative office.`
        : `Your ${row.loanNo} payment of ${money(row.amount)} is due on ${longDate(row.dueDate)}. Please settle it at the cooperative office.`,
      created_by: auth.profile?.admin_id ?? null,
    }))
    const { error } = await supabase.from('notification').insert(rows)
    if (error) return { ok: false, message: errorMessage(error) }
    return { ok: true, count: rows.length }
  }

  return {
    recent,
    loading,
    lastError,
    typeLabel,
    fetchRecent,
    findReminderCandidates,
    sendReminders,
  }
})
