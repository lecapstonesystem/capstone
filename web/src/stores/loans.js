import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useMembersStore } from './members'
import { useAuthStore } from './auth'
import { loanTotals } from '../utils/amortization'
import { errorMessage } from '../utils/errorText'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useAuditStore } from './audit'
import { uploadDocumentPhoto, removeDocumentPhoto } from '../lib/documents'

/**
 * Loans store — live Supabase data (swapped from mocks).
 *
 * Rules implemented (client interview docs/client-interview-1.md):
 *   - 6 types: Salary/Regular, Education, Transportation, Gadget, Business,
 *     Emergency
 *   - Interest: 1.5% all types, 2.0% business ⚠️ assumed MONTHLY, on a
 *     diminishing balance (client: "kame diminishing")
 *   - Ceiling: 2× capital share, capped at ₱200,000 ⚠️ (client said 150k–200k)
 *   - Emergency: max ₱20k, on top of regular loans (does NOT count toward
 *     the 2-loan limit ⚠️), 2–6 months only
 *   - Max 2 concurrent loans, co-makers: 1 if < ₱100k, 2 if ≥ ₱100k
 *   - New members: wait 2 months + financial literacy seminar (onsite);
 *     first loan capped at 80% until one loan is fully paid ⚠️ (80% of what
 *     exactly — ceiling or capital share — confirm with client)
 *   - Full capital (₱15k new / ₱20k old) required before loaning ⚠__
 *   - Committee approval → release (cash/cheque, claimed in person)
 *   - Delinquent = 6 months with no payment → letter + text reminders
 *   - Penalties for late payment exist but the formula was NOT given ⚠__
 *
 * How the store maps to public.member/public.loan:
 *   - loanNo has no column: derived from loan_id (LOAN-0001 style, the
 *     same convention as KHS member numbers).
 *   - interest_rate is stored as a FRACTION (0.015 — seed/CSV
 *     convention, what the backend analytics compute with) and shown
 *     as percent (1.5) in the UI; inserts write rate / 100.
 *   - totalDue is recomputed by loanTotals() — the formula is
 *     deterministic, nothing to store.
 *   - Seeded loan_type is only Regular/Emergency (the old records
 *     never had finer types); new loans use all six.
 *   - date_issued is a placeholder at submission and moves to the
 *     release date when cash/cheque is handed over (due_date =
 *     issue + term, matching the seed); created_at keeps the true
 *     submission time.
 *   - payments come from public.payment (channel/note are 03 columns,
 *     NULL on seeded rows); balances are summed client-side.
 *   - co-makers live in public.co_maker by member_id: typed names are
 *     matched against live members; names that match nobody stay on
 *     the row until the page reloads (same session-only class as
 *     history and the requirements checklist).
 *
 * Approve/release/payment are separate writes — a true transaction
 * (rpc) so balance and status can never drift, is a later phase.
 * LoansView only needed its three result handlers awaited.
 */

export const LOAN_TYPES = [
  { value: 'Regular', label: 'Salary / Regular', rate: 1.5 },
  { value: 'Education', label: 'Education', rate: 1.5 },
  { value: 'Transportation', label: 'Transportation / Vehicle', rate: 1.5 },
  { value: 'Gadget', label: 'Gadget', rate: 1.5 },
  { value: 'Business', label: 'Business', rate: 2.0 },
  { value: 'Emergency', label: 'Emergency', rate: 1.5 },
]

export const PAYMENT_CHANNELS = ['Cash', 'GCash', 'Cheque', 'ATM Deduction']
export const RELEASE_CHANNELS = ['Cash', 'Cheque']

export const CEILING_CAP = 200000 // ⚠️ client said ₱150k–200k — using 200k
export const MIN_CAPITAL = 15000 // ⚠️ full capital first (client: 15k new / 20k old)
export const COMAKER_THRESHOLD = 100000 // < 100k → 1 co-maker, ≥ 100k → 2
export const EMERGENCY_MAX = 20000
export const MAX_CONCURRENT = 2 // "hanggang dalawang loan lang"
export const WAIT_MONTHS = 2 // new members wait before first loan
export const FIRST_LOAN_FACTOR = 0.8 // first loan = 80% of the ceiling ⚠️
export const DELINQUENT_MONTHS = 6

const round2 = (value) => Math.round(value * 100) / 100

const pad2 = (value) => String(value).padStart(2, '0')

// Local-date formatting — toISOString() would shift across timezones
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toLocalDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return todayLocal()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function plusMonths(isoDate, months) {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setMonth(d.getMonth() + Number(months || 0))
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function monthsSince(isoString) {
  const from = new Date(isoString)
  const now = new Date()
  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
}

// Seeded rows always carry date_issued + due_date, so a NULL
// term_months can still be recovered from them.
function monthsBetween(fromIso, toIso) {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(1, months || 1)
}

function loanNoOf(loanId) {
  return `LOAN-${String(loanId).padStart(4, '0')}`
}

function rowToLoan(row) {
  const term =
    row.term_months ??
    (row.date_issued && row.due_date ? monthsBetween(row.date_issued, row.due_date) : 12)
  const ratePercent = round2(Number(row.interest_rate || 0) * 100)
  const principal = Number(row.amount || 0)
  const payments = (row.payment || [])
    .map((payment) => ({
      id: payment.payment_id,
      at: payment.date,
      amount: Number(payment.amount || 0),
      channel: payment.channel || '',
      note: payment.note || '',
      status: payment.status || '',
      // Storage path of the receipt photo uploaded by the member app
      // (NULL for payments recorded in the portal).
      receiptPath: payment.receipt_image_url || '',
    }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id - b.id)
  return {
    id: row.loan_id,
    loanNo: loanNoOf(row.loan_id),
    memberId: row.member_id,
    memberNo: row.member?.member_no || '',
    memberName: row.member?.name || '',
    type: row.loan_type || 'Regular',
    principal,
    ratePercent,
    termMonths: term,
    totalDue: loanTotals(principal, ratePercent, term).totalDue,
    coMakers: (row.co_maker || []).map((cm) => cm.member?.name).filter(Boolean),
    requirements: [], // no column — the checklist is tracked in-session
    status: row.status,
    createdAt: row.created_at || row.date_issued || '',
    releasedAt: row.status === 'Released' || row.status === 'Paid' ? row.date_issued : null,
    releaseChannel: row.release_channel || null,
    payments,
    remarks: row.remarks || '',
    history: [],
  }
}

export const useLoansStore = defineStore('loans', () => {
  const loans = ref([])
  const loading = ref(false)
  const lastError = ref('')
  const search = ref('')
  const statusFilter = ref('All')
  const typeFilter = ref('All')

  // Column sorting — header click toggles ascending/descending (SortableTh).
  // Default keeps the old order: newest applied first (the Date column's
  // header lights up). balanceOf runs in the getter, after the store has
  // finished setting up.
  const sortKey = ref('date')
  const sortDir = ref('desc')
  const accessors = {
    loanNo: (loan) => loan.loanNo,
    memberName: (loan) => loan.memberName,
    type: (loan) => loan.type,
    principal: (loan) => loan.principal,
    balance: (loan) => balanceOf(loan),
    status: (loan) => loan.status,
    date: (loan) => loan.createdAt,
  }

  const filteredLoans = computed(() => {
    const query = search.value.trim().toLowerCase()
    const filtered = loans.value.filter((loan) => {
      const matchesStatus = statusFilter.value === 'All' || loan.status === statusFilter.value
      const matchesType = typeFilter.value === 'All' || loan.type === typeFilter.value
      const haystack = `${loan.loanNo} ${loan.memberName} ${loan.memberNo}`.toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      return matchesStatus && matchesType && matchesSearch
    })
    return sortRows(filtered, sortKey.value, sortDir.value, accessors)
  })

  // ---------- money helpers (used by the view for each row) ----------
  function paidOf(loan) {
    // Only ADMIN-VERIFIED money counts toward the balance.
    // App-submitted receipts land as status 'Pending' (13_app_documents.sql)
    // and are excluded until an admin records them.
    const verified = loan.payments.filter((payment) => payment.status === 'Recorded')
    return round2(verified.reduce((sum, payment) => sum + payment.amount, 0))
  }

  function balanceOf(loan) {
    return round2(Math.max(0, loan.totalDue - paidOf(loan)))
  }

  // Delinquent = Released and no payment in 6+ months (client's definition)
  function isDelinquent(loan) {
    if (loan.status !== 'Released') return false
    const lastActivity =
      loan.payments.length > 0 ? loan.payments[loan.payments.length - 1].at : loan.releasedAt
    if (!lastActivity) return false
    return monthsSince(lastActivity) >= DELINQUENT_MONTHS
  }

  const forApprovalCount = computed(
    () => loans.value.filter((loan) => loan.status === 'For Approval').length,
  )

  const activeCount = computed(
    () => loans.value.filter((loan) => loan.status === 'Released').length,
  )

  const delinquentCount = computed(() => loans.value.filter((loan) => isDelinquent(loan)).length)

  const outstandingBalance = computed(() =>
    round2(
      loans.value
        .filter((loan) => loan.status === 'Released')
        .reduce((sum, loan) => sum + balanceOf(loan), 0),
    ),
  )

  // ---------- eligibility — all interview rules in one place ----------
  // type is passed so the emergency loan can bypass the 2-loan limit
  function eligibility(memberId, type = null) {
    const base = {
      ok: false,
      reasons: [],
      note: 'Select a member to check eligibility.',
      ceiling: 0,
      limit: 0,
      firstLoan: false,
      activeCount: 0,
      hasEmergency: false,
      member: null,
    }
    if (!memberId) return base

    const membersStore = useMembersStore()
    const member = membersStore.members.find((item) => item.id === memberId)
    if (!member) return { ...base, reasons: ['Member not found.'] }

    const reasons = []
    if (member.status !== 'Active') {
      reasons.push(`Member status is ${member.status} — only Active members can loan.`)
    }

    const capital = member.capitalShare || 0
    if (capital < MIN_CAPITAL) {
      reasons.push(
        `Capital share is ₱${capital.toLocaleString('en-PH')} — at least ₱${MIN_CAPITAL.toLocaleString('en-PH')} required before loaning.`,
      )
    }

    // New members wait 2 months (financial literacy seminar is onsite)
    const eligibleDate = new Date(member.dateJoined)
    eligibleDate.setMonth(eligibleDate.getMonth() + WAIT_MONTHS)
    if (Date.now() < eligibleDate.getTime()) {
      reasons.push(
        `New member — must wait 2 months first (available on ${eligibleDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}).`,
      )
    }

    const memberLoans = loans.value.filter((loan) => loan.memberId === memberId)
    const activeCount = memberLoans.filter(
      (loan) => loan.status === 'Released' && loan.type !== 'Emergency',
    ).length
    const hasEmergency = memberLoans.some(
      (loan) => loan.status === 'Released' && loan.type === 'Emergency',
    )
    const hasPaidLoan = memberLoans.some((loan) => loan.status === 'Paid')

    if (type !== 'Emergency' && activeCount >= MAX_CONCURRENT) {
      reasons.push(`Already has the maximum of ${MAX_CONCURRENT} concurrent loans.`)
    }
    if (type === 'Emergency' && hasEmergency) {
      reasons.push('Already has an active emergency loan.')
    }

    const ceiling = Math.min(capital * 2, CEILING_CAP)
    const limit = hasPaidLoan ? ceiling : Math.floor(ceiling * FIRST_LOAN_FACTOR)

    return {
      ok: reasons.length === 0,
      reasons,
      note: '',
      ceiling,
      limit,
      firstLoan: !hasPaidLoan,
      activeCount,
      hasEmergency,
      member,
    }
  }

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
  }

  function sortState(key) {
    return sortKey.value === key ? sortDir.value : null
  }

  // ---------- loading ----------
  async function fetchLoans() {
    loading.value = true
    lastError.value = ''
    try {
      const { data, error } = await supabase
        .from('loan')
        .select('*,member(name,member_no),payment(*),co_maker(co_maker_id,member(name))')
        .order('loan_id', { ascending: true })
      if (error) throw error
      loans.value = (data || []).map(rowToLoan)
      // Fill each loan's Activity list from the durable audit trail.
      const histories = await useAuditStore().loadHistories(
        'loan',
        loans.value.map((loan) => String(loan.id)),
      )
      loans.value.forEach((loan) => {
        loan.history = histories.get(String(loan.id)) || []
      })
    } catch (error) {
      lastError.value = errorMessage(error)
      loans.value = []
    } finally {
      loading.value = false
    }
  }

  // Kept on the row for display; written to the audit_log table in
  // the background (see stores/audit.js).
  function logAction(loan, action) {
    if (!loan.history) loan.history = []
    loan.history.unshift(useAuditStore().record('loan', loan.id, action))
  }

  // ---------- actions ----------
  // Validation failures and database errors come back as
  // { ok: false, message } so the dialogs can show them.
  async function addLoan({ memberId, type, principal, termMonths, coMakers, requirements }) {
    if (!memberId) return { ok: false, message: 'Select a member first.' }
    const elig = eligibility(memberId, type)
    if (!elig.ok) return { ok: false, message: elig.reasons.join(' ') }

    const typeInfo = LOAN_TYPES.find((item) => item.value === type)
    if (!typeInfo) return { ok: false, message: 'Choose a loan type.' }

    const amount = Number(principal)
    if (!(amount > 0)) return { ok: false, message: 'Enter a loan amount.' }

    if (type === 'Emergency') {
      if (amount > EMERGENCY_MAX) {
        return { ok: false, message: 'Emergency loans are capped at ₱20,000.' }
      }
    } else if (amount > elig.limit) {
      return {
        ok: false,
        message: elig.firstLoan
          ? `First loan is capped at 80% of the ceiling — maximum ₱${elig.limit.toLocaleString('en-PH')}.`
          : `Amount exceeds the ceiling of ₱${elig.limit.toLocaleString('en-PH')} (2× capital share).`,
      }
    }

    const requiredCoMakers = amount >= COMAKER_THRESHOLD ? 2 : 1
    const filledCoMakers = coMakers.filter((name) => name && name.trim())
    if (filledCoMakers.length < requiredCoMakers) {
      return {
        ok: false,
        message: `${requiredCoMakers} co-maker${requiredCoMakers > 1 ? 's' : ''} required for this amount (₱100,000 and above need 2).`,
      }
    }

    const unchecked = requirements.filter((item) => !item.checked)
    if (unchecked.length > 0) {
      return { ok: false, message: 'Verify all requirements before submitting.' }
    }

    const now = new Date().toISOString()
    const today = todayLocal()
    const totals = loanTotals(amount, typeInfo.rate, termMonths)

    const { data: row, error } = await supabase
      .from('loan')
      .insert({
        member_id: memberId,
        amount: round2(amount),
        interest_rate: typeInfo.rate / 100, // fraction — seed/CSV convention
        date_issued: today, // moves to the release date below
        due_date: plusMonths(today, termMonths),
        status: 'For Approval',
        created_at: now,
        term_months: Number(termMonths),
        loan_type: type,
      })
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }

    // Co-makers must be members (public.co_maker references member_id):
    // typed names are matched against live members; no match stays
    // on the row only, until the page reloads.
    const membersStore = useMembersStore()
    const coMakerRows = []
    const displayNames = []
    for (const raw of filledCoMakers) {
      const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ')
      const member = membersStore.members.find((cand) => {
        const full = `${cand.firstName} ${cand.middleName} ${cand.lastName}`
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
        const short = `${cand.firstName} ${cand.lastName}`.toLowerCase().replace(/\s+/g, ' ')
        const memberNo = String(cand.memberNo || '').toLowerCase()
        return full === norm || short === norm || (memberNo && memberNo === norm)
      })
      if (member) {
        coMakerRows.push({ loan_id: row.loan_id, member_id: member.id, signed_at: today })
        displayNames.push(`${member.firstName} ${member.lastName}`)
      } else {
        displayNames.push(raw.trim())
      }
    }
    if (coMakerRows.length) {
      const { error: coMakerError } = await supabase.from('co_maker').insert(coMakerRows)
      if (coMakerError) lastError.value = errorMessage(coMakerError) // loan itself is safe
    }

    const loan = {
      id: row.loan_id,
      loanNo: loanNoOf(row.loan_id),
      memberId,
      memberNo: elig.member.memberNo,
      memberName: `${elig.member.firstName} ${elig.member.lastName}`,
      type,
      principal: round2(amount),
      ratePercent: typeInfo.rate,
      termMonths: Number(termMonths),
      totalDue: totals.totalDue, // frozen here — diminishing total
      coMakers: displayNames,
      requirements: [...requirements],
      status: 'For Approval',
      createdAt: now,
      releasedAt: null,
      releaseChannel: null,
      payments: [],
      remarks: '',
      history: [],
    }
    loans.value.push(loan)
    logAction(
      loan,
      `Loan application submitted — ${typeInfo.label} ₱${round2(amount).toLocaleString('en-PH')}`,
    )
    return { ok: true, loan }
  }

  async function approveLoan(id) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'For Approval') {
      return { ok: false, message: 'Only loans under review can be approved.' }
    }
    const auth = useAuthStore()
    const { error } = await supabase
      .from('loan')
      .update({ status: 'Approved', approved_by: auth.profile?.admin_id ?? null })
      .eq('loan_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    loan.status = 'Approved'
    logAction(loan, 'Approved by committee')
    return { ok: true }
  }

  async function rejectLoan(id, remarks) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'For Approval') {
      return { ok: false, message: 'Only loans under review can be rejected.' }
    }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when rejecting a loan.' }
    }
    const trimmed = remarks.trim()
    const { error } = await supabase
      .from('loan')
      .update({ status: 'Rejected', remarks: trimmed })
      .eq('loan_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    loan.status = 'Rejected'
    loan.remarks = trimmed
    logAction(loan, `Rejected — ${trimmed}`)
    return { ok: true }
  }

  // Release = member comes in person, cash or cheque (Landbank) — client rule
  async function releaseLoan(id, channel) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'Approved') {
      return { ok: false, message: 'Only approved loans can be released.' }
    }
    if (!RELEASE_CHANNELS.includes(channel)) {
      return { ok: false, message: 'Choose how the loan will be released (Cash or Cheque).' }
    }
    const today = todayLocal()
    const { error } = await supabase
      .from('loan')
      .update({
        status: 'Released',
        date_issued: today,
        due_date: plusMonths(today, loan.termMonths),
        release_channel: channel,
      })
      .eq('loan_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    loan.status = 'Released'
    loan.releasedAt = today
    loan.releaseChannel = channel
    logAction(loan, `Loan released via ${channel} — claimed in person`)
    return { ok: true }
  }

  async function recordPayment(id, { amount, at, channel, note, receiptFile }) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'Released') {
      return { ok: false, message: 'Payments can only be recorded on released (active) loans.' }
    }
    const value = Number(amount)
    if (!(value > 0)) return { ok: false, message: 'Payment must be greater than zero.' }
    const balance = balanceOf(loan)
    if (value > balance + 0.01) {
      return {
        ok: false,
        message: `Payment exceeds the remaining balance of ₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`,
      }
    }

    // Optional receipt photo (counter payments keep a paper trail
    // too) — same private bucket the member app uploads into.
    let receiptPath = ''
    if (receiptFile) {
      const uploaded = await uploadDocumentPhoto(receiptFile)
      if (!uploaded.ok) return { ok: false, message: uploaded.message }
      receiptPath = uploaded.path
    }

    const date = toLocalDate(at)
    const { data: row, error } = await supabase
      .from('payment')
      .insert({
        loan_id: loan.id,
        member_id: loan.memberId,
        amount: round2(value),
        date,
        channel,
        note: note || '',
        status: 'Recorded',
        receipt_image_url: receiptPath || null,
      })
      .select()
      .single()
    if (error) {
      if (receiptPath) removeDocumentPhoto(receiptPath) // no orphan files
      return { ok: false, message: errorMessage(error) }
    }

    loan.payments.push({
      id: row.payment_id,
      at: date,
      amount: round2(value),
      channel,
      note: note || '',
      status: 'Recorded',
      receiptPath,
    })
    loan.payments.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id - b.id)

    const receiptNote = receiptPath ? ' — receipt attached' : ''
    if (balanceOf(loan) <= 0.01) {
      const { error: statusError } = await supabase
        .from('loan')
        .update({ status: 'Paid' })
        .eq('loan_id', id)
      if (statusError) {
        lastError.value = errorMessage(statusError)
        return { ok: false, message: errorMessage(statusError) }
      }
      loan.status = 'Paid'
      logAction(loan, `Loan fully paid${receiptNote}`)
    } else {
      logAction(
        loan,
        `Payment recorded — ₱${round2(value).toLocaleString('en-PH')} via ${channel}${receiptNote}`,
      )
    }
    return { ok: true, loan }
  }

  // Delinquent reminder — the client sends letter + text (6 months unpaid)
  function sendReminder(id) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (!isDelinquent(loan)) {
      return { ok: false, message: 'This loan is not delinquent — no reminder needed.' }
    }
    logAction(loan, 'Delinquency reminder sent (letter + text)')
    return { ok: true }
  }

  // Load once, when the store is first used (LoansView mounts).
  fetchLoans()

  return {
    loans,
    loading,
    lastError,
    fetchLoans,
    search,
    statusFilter,
    typeFilter,
    filteredLoans,
    sortKey,
    sortDir,
    setSort,
    sortState,
    forApprovalCount,
    activeCount,
    delinquentCount,
    outstandingBalance,
    paidOf,
    balanceOf,
    isDelinquent,
    eligibility,
    addLoan,
    approveLoan,
    rejectLoan,
    releaseLoan,
    recordPayment,
    sendReminder,
  }
})
