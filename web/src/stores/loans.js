import { ref, computed, watch } from 'vue'
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

export const PAYMENT_CHANNELS = ['Cash', 'Cheque', 'ATM Deduction']
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

// Plain-text peso for messages (the view has its own display copy).
function formatPesoText(value) {
  return `₱${(Number(value) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

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
    memberPhoto: row.member?.id_photo_url || '',
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
    // Archive (29_loan_archive.sql) — a visibility flag, NOT a status:
    // the loan stays 'Paid', keeps its payments and stays in reports.
    // NULL = active in the working list.
    archivedAt: row.archived_at || null,
  }
}

export const useLoansStore = defineStore('loans', () => {
  const loans = ref([])
  const loading = ref(false)
  const lastError = ref('')
  const search = ref('')
  const statusFilter = ref('All')
  const typeFilter = ref('All')
  // Archived loans are hidden from the working list until asked for.
  // Reports and the member app are unaffected — they read the tables.
  const showArchived = ref(false)

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
      if (loan.archivedAt && !showArchived.value) return false
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

  // Pagination
  const page = ref(1)
  const pageSize = ref(10)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(filteredLoans.value.length / pageSize.value)),
  )

  const paginatedLoans = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return filteredLoans.value.slice(start, start + pageSize.value)
  })

  function setPage(newPage) {
    page.value = Math.min(Math.max(1, newPage), totalPages.value)
  }

  function setPageSize(size) {
    pageSize.value = size
    page.value = 1
  }

  // New search/filter results always start from page 1
  watch([search, statusFilter, showArchived], () => {
    page.value = 1
  })

  // If the current page no longer exists (e.g. after a delete), step back
  watch(totalPages, (count) => {
    if (page.value > count) page.value = count
  })

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
    page.value = 1 // sorting restarts from the first page
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
        .select(
          '*,member(name,member_no,id_photo_url),payment(*),co_maker(co_maker_id,member(name))',
        )
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

  // Co-makers must be members (public.co_maker references member_id).
  // The portal's co-maker fields are member pickers, so they send the
  // picked member's id straight into the row. A typed name (the names
  // the member entered in the app) is matched against live members;
  // no match stays on the row only, until the page reloads. Shared by
  // portal-filed loans and approvals of app-filed requests.
  async function linkCoMakers(loanId, entries, today) {
    const membersStore = useMembersStore()
    const coMakerRows = []
    const displayNames = []
    for (const entry of entries) {
      if (typeof entry === 'number') {
        const picked = membersStore.members.find((cand) => cand.id === entry)
        coMakerRows.push({ loan_id: loanId, member_id: entry, signed_at: today })
        displayNames.push(picked ? `${picked.firstName} ${picked.lastName}` : `Member #${entry}`)
        continue
      }
      const norm = String(entry || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
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
        coMakerRows.push({ loan_id: loanId, member_id: member.id, signed_at: today })
        displayNames.push(`${member.firstName} ${member.lastName}`)
      } else {
        displayNames.push(String(entry).trim())
      }
    }
    if (coMakerRows.length) {
      const { error: coMakerError } = await supabase.from('co_maker').insert(coMakerRows)
      if (coMakerError) lastError.value = errorMessage(coMakerError) // loan itself is safe
    }
    return displayNames
  }

  // Guard for picked co-makers (adviser UAT fix): no member may
  // co-make their own loan, and the same member may not fill both
  // slots. Only id picks are checked — typed names from the app are
  // matched in linkCoMakers and stay display-only when unmatched.
  function validateCoMakerIds(entries, memberId) {
    const ids = entries.filter((entry) => typeof entry === 'number')
    if (ids.includes(memberId)) {
      return 'The borrower cannot be their own co-maker. Pick a different member.'
    }
    if (new Set(ids).size !== ids.length) {
      return 'The same member is picked twice as co-maker. Pick a different member for each slot.'
    }
    return ''
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
    // Entries are picked member ids (portal) or typed names (app).
    const filledCoMakers = coMakers.filter((entry) =>
      typeof entry === 'number' ? entry : Boolean(entry && entry.trim()),
    )
    if (filledCoMakers.length < requiredCoMakers) {
      return {
        ok: false,
        message: `${requiredCoMakers} co-maker${requiredCoMakers > 1 ? 's' : ''} required for this amount (₱100,000 and above need 2).`,
      }
    }

    const coMakerProblem = validateCoMakerIds(filledCoMakers, memberId)
    if (coMakerProblem) return { ok: false, message: coMakerProblem }

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

    const displayNames = await linkCoMakers(row.loan_id, filledCoMakers, today)

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

  // ✅ Verify an app-submitted payment (Flow 3): the receipt appears in
  // the history right away, but paidOf() above counts only 'Recorded'
  // money — this is the step that moves the balance. Stamps who and when.
  async function verifyPayment(id, paymentId) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    const payment = loan.payments.find((item) => item.id === paymentId)
    if (!payment) return { ok: false, message: 'Payment not found.' }
    if (payment.status === 'Recorded') {
      return { ok: false, message: 'This payment is already verified.' }
    }
    const value = Number(payment.amount) || 0
    if (!(value > 0)) return { ok: false, message: 'This payment has no valid amount.' }
    // The member typed the amount in the app — a typo must not be able
    // to overpay the ledger into the green.
    const balance = balanceOf(loan)
    if (value > balance + 0.01) {
      return {
        ok: false,
        message: `The receipt is ₱${round2(value).toLocaleString('en-PH')} but the remaining balance is only ₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — it cannot be verified as submitted.`,
      }
    }

    const auth = useAuthStore()
    const { error } = await supabase
      .from('payment')
      .update({
        status: 'Recorded',
        verified_by: auth.profile?.admin_id ?? null,
        date_verified: todayLocal(),
      })
      .eq('payment_id', paymentId)
    if (error) return { ok: false, message: errorMessage(error) }
    payment.status = 'Recorded'

    const receiptNote = payment.receiptPath ? ' — receipt on file' : ''
    const viaChannel = payment.channel ? ` via ${payment.channel}` : ''
    if (balanceOf(loan) <= 0.01 && loan.status !== 'Paid') {
      const { error: statusError } = await supabase
        .from('loan')
        .update({ status: 'Paid' })
        .eq('loan_id', id)
      if (statusError) {
        lastError.value = errorMessage(statusError)
        return { ok: false, message: errorMessage(statusError) }
      }
      loan.status = 'Paid'
      logAction(
        loan,
        `Payment verified — ₱${round2(value).toLocaleString('en-PH')}${viaChannel} — loan fully paid${receiptNote}`,
      )
    } else {
      logAction(
        loan,
        `Payment verified — ₱${round2(value).toLocaleString('en-PH')}${viaChannel}${receiptNote}`,
      )
    }
    return { ok: true }
  }

  // ---------- receipt photo on an existing payment ----------
  // Receipts are attachments like everything else in the portal:
  // attach or replace from the payment history, remove with a
  // confirm. Each change lands in the audit trail and replaced or
  // removed files are cleaned from storage.
  async function attachReceipt(id, payment, file) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    const uploaded = await uploadDocumentPhoto(file)
    if (!uploaded.ok) return uploaded
    const { error } = await supabase
      .from('payment')
      .update({ receipt_image_url: uploaded.path })
      .eq('payment_id', payment.id)
    if (error) {
      removeDocumentPhoto(uploaded.path) // no orphan files
      return { ok: false, message: errorMessage(error) }
    }
    const previous = payment.receiptPath
    payment.receiptPath = uploaded.path
    logAction(
      loan,
      `${previous ? 'Receipt replaced' : 'Receipt attached'} — ₱${round2(payment.amount).toLocaleString('en-PH')} payment`,
    )
    if (previous) removeDocumentPhoto(previous)
    return { ok: true }
  }

  async function removeReceipt(id, payment) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (!payment.receiptPath) return { ok: true }
    const previous = payment.receiptPath
    const { error } = await supabase
      .from('payment')
      .update({ receipt_image_url: null })
      .eq('payment_id', payment.id)
    if (error) return { ok: false, message: errorMessage(error) }
    payment.receiptPath = ''
    logAction(loan, `Receipt removed — ₱${round2(payment.amount).toLocaleString('en-PH')} payment`)
    removeDocumentPhoto(previous)
    return { ok: true }
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

  // ---------- developer-only test-data cleanup ----------
  // Removes a test loan the way database/reference_manual_member_delete
  // .sql does (no FK cascades — children first). The audit trail is
  // kept: the deletion is itself logged, never erased. RLS gates the
  // role (22_developer_role.sql) — this guard mirrors it client-side.
  async function deleteTestLoan(loan) {
    const auth = useAuthStore()
    if (!auth.isDeveloper) {
      return { ok: false, message: 'Only the Developer role can delete test data.' }
    }

    // Storage files outlive their rows — collect the paths first.
    const [atts, pays] = await Promise.all([
      supabase.from('attachment').select('file_path').eq('loan_id', loan.id),
      supabase.from('payment').select('receipt_image_url').eq('loan_id', loan.id),
    ])
    const paths = new Set()
    for (const row of atts.data || []) if (row.file_path) paths.add(row.file_path)
    for (const row of pays.data || []) if (row.receipt_image_url) paths.add(row.receipt_image_url)

    const steps = [
      // Notifications point at the loan with ON DELETE SET NULL, and the
      // content-freeze trigger rejects that system nulling — clearing
      // them first keeps the loan delete (and the inbox) clean.
      ['notification', supabase.from('notification').delete().eq('loan_id', loan.id)],
      ['attachment', supabase.from('attachment').delete().eq('loan_id', loan.id)],
      ['co_maker', supabase.from('co_maker').delete().eq('loan_id', loan.id)],
      ['payment', supabase.from('payment').delete().eq('loan_id', loan.id)],
      ['loan', supabase.from('loan').delete().eq('loan_id', loan.id)],
    ]
    for (const [label, query] of steps) {
      const { error } = await query
      if (error) {
        return {
          ok: false,
          message: `${label} could not be cleared (${errorMessage(error)}). Deletion stopped — finish with the reference SQL script (database/reference_manual_member_delete.sql).`,
        }
      }
    }

    // Best-effort: leftover files are inert, so a storage hiccup is a
    // warning, not a failure.
    let storageFailed = false
    if (paths.size) {
      const { error } = await supabase.storage.from('member-documents').remove([...paths])
      storageFailed = Boolean(error)
    }

    useAuditStore().record('loan', loan.id, `Test loan deleted (developer) — ${loan.loanNo}`)
    loans.value = loans.value.filter((item) => item.id !== loan.id)
    return { ok: true, storageFailed }
  }

  // ---------- archival — hide, never delete (panel revision request) ----------
  // Cooperatives must keep financial records (RA 9520 / AMLA), so
  // archive only takes a fully-paid loan out of the working list:
  // the row, its payments, its audit trail and its share of every
  // report all stay. Restore brings it back. Same reversible shape
  // as everything else that touches a member's record.
  async function archiveLoan(id) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.archivedAt) return { ok: false, message: 'This loan is already archived.' }
    if (loan.status !== 'Paid') {
      return { ok: false, message: 'Only fully paid loans can be archived.' }
    }
    const at = new Date().toISOString()
    const adminId = useAuthStore().profile?.admin_id ?? null
    const { error } = await supabase
      .from('loan')
      .update({ archived_at: at, archived_by: adminId })
      .eq('loan_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    loan.archivedAt = at
    logAction(loan, 'Loan archived (kept in the database and in reports, hidden from the list)')
    return { ok: true }
  }

  async function restoreLoan(id) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (!loan.archivedAt) return { ok: false, message: 'This loan is not archived.' }
    const { error } = await supabase
      .from('loan')
      .update({ archived_at: null, archived_by: null })
      .eq('loan_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    loan.archivedAt = null
    logAction(loan, 'Loan restored to the working list')
    return { ok: true }
  }

  // ---------- historical loans — paper records brought into UCMS ----------
  // These loans were approved and released BEFORE the system, so they
  // skip the application row, the eligibility rules and the approval
  // queue (the committee already decided, on paper). They insert
  // straight into `loan` with the real issue date and go to Released,
  // or Paid once their past payments cover the diminishing total.
  // Every entry writes to the audit trail like any other loan.
  const HISTORICAL_MAX_TERM = 360 // sanity cap — 30 years, no real loan is longer

  function isDateInput(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  }

  // Shared validation for one historical loan spec:
  // { memberId, type, ratePercent, principal, termMonths, dateIssued, payments }
  function validateHistoricalSpec(spec) {
    if (!spec.memberId) return 'Select a member first.'
    const member = useMembersStore().members.find((item) => item.id === spec.memberId)
    if (!member) return 'Selected member not found.'

    const typeInfo = LOAN_TYPES.find((item) => item.value === spec.type)
    if (!typeInfo) return 'Choose a loan type.'

    const amount = Number(spec.principal)
    if (!(amount > 0)) return 'Enter the loan amount.'

    const rate = Number(spec.ratePercent)
    if (!(rate >= 0 && rate <= 100)) {
      return 'Enter the interest rate as a percent (for example 1.5).'
    }

    const term = Number(spec.termMonths)
    if (!(term >= 1 && term <= HISTORICAL_MAX_TERM)) {
      return `Term must be 1–${HISTORICAL_MAX_TERM} months.`
    }

    if (!isDateInput(spec.dateIssued) || spec.dateIssued > todayLocal()) {
      return 'Enter the date the loan was issued — not in the future.'
    }

    const payments = Array.isArray(spec.payments) ? spec.payments : []
    const seen = []
    for (const payment of payments) {
      const value = Number(payment.amount)
      if (!isDateInput(payment.date)) return 'Each past payment needs a date.'
      if (payment.date < spec.dateIssued) {
        return `A past payment is dated before the loan was issued (${spec.dateIssued}).`
      }
      if (payment.date > todayLocal()) return 'Past payment dates cannot be in the future.'
      if (!(value > 0)) return 'Each past payment needs an amount greater than zero.'
      if (payment.channel && !PAYMENT_CHANNELS.includes(payment.channel)) {
        return `Payment channel must be one of: ${PAYMENT_CHANNELS.join(', ')}.`
      }
      seen.push(payment)
    }
    if (seen.length > 240) return 'A single loan cannot carry more than 240 past payments.'
    return ''
  }

  // A loan with the same member, issue date and amount already in the
  // system is almost always the same paper record imported twice —
  // blocking it protects the money history from double entries.
  function findDuplicateHistorical(memberId, dateIssued, principal) {
    return loans.value.find(
      (loan) =>
        loan.memberId === memberId &&
        String(loan.createdAt || '').slice(0, 10) === dateIssued &&
        Math.abs(loan.principal - Number(principal)) < 0.01,
    )
  }

  async function insertHistoricalLoan(spec) {
    const problem = validateHistoricalSpec(spec)
    if (problem) return { ok: false, message: problem }

    const duplicate = findDuplicateHistorical(spec.memberId, spec.dateIssued, spec.principal)
    if (duplicate) {
      return {
        ok: false,
        message: `This looks like a double entry — ${duplicate.loanNo} already records a ${formatPesoText(spec.principal)} loan for this member issued on ${spec.dateIssued}.`,
      }
    }

    const member = useMembersStore().members.find((item) => item.id === spec.memberId)
    const typeInfo = LOAN_TYPES.find((item) => item.value === spec.type)
    const payments = [...spec.payments].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const paidSum = round2(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
    const totals = loanTotals(Number(spec.principal), Number(spec.ratePercent), spec.termMonths)

    // Insert as Released first, then flip to Paid only after its past
    // payments are safely in — a failed payment insert can never leave
    // a Paid loan with an empty history behind.
    const { data: row, error } = await supabase
      .from('loan')
      .insert({
        member_id: spec.memberId,
        application_id: null, // no app ever filed it — paper record
        approved_by: null, // committee approved it before UCMS existed
        amount: round2(Number(spec.principal)),
        interest_rate: Number(spec.ratePercent) / 100, // fraction — seed/CSV convention
        date_issued: spec.dateIssued,
        due_date: plusMonths(spec.dateIssued, Number(spec.termMonths)),
        status: 'Released',
        created_at: spec.dateIssued, // the real loan date (seed convention: dates drive the list)
        term_months: Number(spec.termMonths),
        loan_type: spec.type,
      })
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }

    if (payments.length) {
      const { error: payError } = await supabase.from('payment').insert(
        payments.map((payment) => ({
          loan_id: row.loan_id,
          member_id: spec.memberId,
          amount: round2(Number(payment.amount)),
          date: payment.date,
          channel: payment.channel || 'Cash',
          note: payment.note || '',
          status: 'Recorded',
        })),
      )
      if (payError) {
        // The loan exists but its past payments do not — say so
        // plainly so the admin can finish by hand (or retry).
        return {
          ok: false,
          partial: true,
          message: `${loanNoOf(row.loan_id)} was created, but its ${payments.length} past payment(s) could not be saved (${errorMessage(payError)}). The loan shows the full balance — record the payments from its Record Payment screen.`,
        }
      }

      if (paidSum >= totals.totalDue - 0.01) {
        const { error: statusError } = await supabase
          .from('loan')
          .update({ status: 'Paid' })
          .eq('loan_id', row.loan_id)
        if (statusError) {
          lastError.value = errorMessage(statusError)
          return { ok: false, message: errorMessage(statusError) }
        }
      }
    }

    // Everything is in the database now — mirror the row locally.
    const status = paidSum >= totals.totalDue - 0.01 ? 'Paid' : 'Released'
    const loan = {
      id: row.loan_id,
      loanNo: loanNoOf(row.loan_id),
      memberId: member.id,
      memberNo: member.memberNo,
      memberName: `${member.firstName} ${member.lastName}`,
      memberPhoto: member.idPhoto || '',
      type: spec.type,
      principal: round2(Number(spec.principal)),
      ratePercent: round2(Number(spec.ratePercent)),
      termMonths: Number(spec.termMonths),
      totalDue: totals.totalDue, // frozen here — diminishing total
      coMakers: [],
      requirements: [],
      status,
      createdAt: spec.dateIssued,
      releasedAt: spec.dateIssued,
      releaseChannel: null,
      payments: payments.map((payment, index) => ({
        id: (row.loan_id + 1) * 100000 + index, // session-only placeholder id — real ids come from the DB on reload
        at: payment.date,
        amount: round2(Number(payment.amount)),
        channel: payment.channel || 'Cash',
        note: payment.note || '',
        status: 'Recorded',
        receiptPath: '',
      })),
      remarks: '',
      history: [],
      archivedAt: null,
    }
    loans.value.push(loan)
    logAction(
      loan,
      `Historical loan recorded from paper records — ${typeInfo.label} ${formatPesoText(spec.principal)}, issued ${spec.dateIssued}${payments.length ? `, ${payments.length} past payment(s) entered` : ''}`,
    )
    return { ok: true, loan }
  }

  // One-at-a-time form path (LoansView's "Add historical loan").
  async function addHistoricalLoan(spec) {
    return insertHistoricalLoan(spec)
  }

  // Bulk CSV path — rows are grouped into loans first (one loan key:
  // member + issue date + amount; each row may carry one past
  // payment), then inserted in order. Progress is reported through
  // onProgress so the dialog can show "Importing 12 of 80".
  async function importHistoricalLoans(specs, onProgress) {
    if (!specs.length) return { ok: false, message: 'There is nothing to import.' }
    let imported = 0
    for (let index = 0; index < specs.length; index += 1) {
      if (onProgress) onProgress(index + 1, specs.length)
      const result = await insertHistoricalLoan(specs[index])
      if (!result.ok) {
        return {
          ok: false,
          imported,
          message: `Stopped at loan ${index + 1} of ${specs.length} — ${result.message} Loans already imported are kept; fix the file and import again (entries already in the system are skipped).`,
        }
      }
      imported += 1
    }
    return { ok: true, imported, message: '' }
  }

  // Preview for the CSV import: group raw rows into loan specs and
  // collect every problem with its line number, without writing.
  function previewHistoricalImport(rows) {
    const membersStore = useMembersStore()
    const errors = []
    const warnings = []
    const groups = new Map()

    const keyOf = (memberId, dateIssued, principal) =>
      `${memberId}|${dateIssued}|${Math.round(Number(principal) * 100)}`

    rows.forEach((row) => {
      const line = row._line || '?'
      const memberNo = String(row.member_no || '').trim()
      if (!memberNo) {
        errors.push(`Line ${line}: member number is missing.`)
        return
      }
      const member = membersStore.members.find(
        (item) =>
          String(item.memberNo || '')
            .trim()
            .toLowerCase() === memberNo.toLowerCase(),
      )
      if (!member) {
        errors.push(`Line ${line}: no member has the number ${memberNo}.`)
        return
      }

      const typeRaw = String(row.loan_type || '').trim()
      let typeInfo = LOAN_TYPES.find(
        (item) =>
          item.value.toLowerCase() === typeRaw.toLowerCase() ||
          item.label.toLowerCase() === typeRaw.toLowerCase(),
      )
      if (!typeRaw) typeInfo = LOAN_TYPES[0]
      if (!typeInfo) {
        errors.push(`Line ${line}: unknown loan type "${typeRaw}".`)
        return
      }

      const moneyText = (raw) => String(raw ?? '').replace(/[₱,\s]/g, '')
      const principal = Number(moneyText(row.principal))
      if (!(principal > 0)) {
        errors.push(`Line ${line}: principal must be a number greater than zero.`)
        return
      }

      const rateRaw = moneyText(row.interest_rate).replace(/%$/, '')
      const ratePercent = rateRaw === '' ? typeInfo.rate : Number(rateRaw)
      if (!(ratePercent >= 0 && ratePercent <= 100)) {
        errors.push(`Line ${line}: interest rate must be a percent like 1.5.`)
        return
      }

      const term = Number(row.term_months)
      if (!(term >= 1 && term <= HISTORICAL_MAX_TERM)) {
        errors.push(`Line ${line}: term must be 1–${HISTORICAL_MAX_TERM} months.`)
        return
      }

      const dateIssued = String(row.date_issued || '').trim()
      if (!isDateInput(dateIssued) || dateIssued > todayLocal()) {
        errors.push(`Line ${line}: issue date must be written as YYYY-MM-DD and not in the future.`)
        return
      }

      const payAmountRaw = String(row.payment_amount ?? '').replace(/[₱,\s]/g, '')
      const payDate = String(row.payment_date || '').trim()
      if (payAmountRaw === '' && payDate === '') {
        // A loan row with no payment columns — still a valid loan.
      } else {
        const payAmount = Number(payAmountRaw)
        if (!(payAmount > 0)) {
          errors.push(`Line ${line}: payment amount must be a number greater than zero.`)
          return
        }
        if (!isDateInput(payDate)) {
          errors.push(`Line ${line}: payment date must be written as YYYY-MM-DD.`)
          return
        }
        if (payDate < dateIssued) {
          errors.push(`Line ${line}: payment date is before the loan was issued (${dateIssued}).`)
          return
        }
        if (payDate > todayLocal()) {
          errors.push(`Line ${line}: payment date cannot be in the future.`)
          return
        }
      }

      const key = keyOf(member.id, dateIssued, principal)
      if (!groups.has(key)) {
        groups.set(key, {
          memberId: member.id,
          memberNo: member.memberNo,
          memberName: `${member.firstName} ${member.lastName}`,
          type: typeInfo.value,
          ratePercent,
          principal,
          termMonths: term,
          dateIssued,
          payments: [],
          lines: [line],
        })
      } else {
        const existing = groups.get(key)
        existing.lines.push(line)
        // Same loan key but different terms — refuse to guess which is right.
        if (
          existing.type !== typeInfo.value ||
          existing.termMonths !== term ||
          Math.abs(existing.ratePercent - ratePercent) > 0.001
        ) {
          errors.push(
            `Line ${line}: repeats loan of ${memberNo} issued ${dateIssued} with different type, rate or term — make them match.`,
          )
        }
      }

      if (payAmountRaw !== '') {
        const group = groups.get(key)
        group.payments.push({
          date: payDate,
          amount: round2(Number(payAmountRaw)),
          channel: String(row.payment_channel || 'Cash').trim() || 'Cash',
          note: String(row.payment_note || '').trim(),
        })
        if (!PAYMENT_CHANNELS.includes(group.payments[group.payments.length - 1].channel)) {
          errors.push(
            `Line ${line}: payment channel must be one of: ${PAYMENT_CHANNELS.join(', ')}.`,
          )
        }
      }
    })

    // Rows whose loan already exists in the system are skipped with a
    // note — re-importing the same file cannot double the money.
    const specs = []
    for (const group of groups.values()) {
      const duplicate = findDuplicateHistorical(group.memberId, group.dateIssued, group.principal)
      if (duplicate) {
        warnings.push(
          `${group.memberNo} — ${formatPesoText(group.principal)} issued ${group.dateIssued}: already in the system as ${duplicate.loanNo}, skipped.`,
        )
        continue
      }
      specs.push(group)
    }

    return { errors, warnings, specs }
  }

  // ---------- app-filed loan requests (loan_application) ----------
  // Requests come in from the mobile app (Flow 2 of the app contract)
  // with status 'Pending'; this queue is the portal's review side.
  // Decide → stamps status/reviewed_by/date_remed/remarks on the row;
  // the app re-reads its own rows to track
  // Pending → Approved / Rejected / Returned.
  const requests = ref([])
  const requestsLoading = ref(false)
  const requestsError = ref('')

  const pendingRequests = computed(() =>
    requests.value.filter((request) => request.status === 'Pending'),
  )

  function rowToRequest(row) {
    return {
      id: row.application_id,
      memberId: row.member_id,
      memberName: row.member?.name || '',
      memberNo: row.member?.member_no || '',
      memberAuthUid: row.member?.auth_uid || '',
      amount: Number(row.amount || 0),
      purpose: row.purpose || '',
      type: row.loan_type || '',
      termMonths: Number(row.term_months || 0),
      status: row.status || 'Pending',
      dateSubmitted: row.date_submitted || '',
      remarks: row.remarks || '',
      dateReviewed: row.date_reviewed || null,
      // Names the member typed in the app (24). Suggestions only — the
      // admin confirms each one is a member before approving.
      requestedCoMakers: Array.isArray(row.requested_co_makers)
        ? row.requested_co_makers.map((name) => String(name || '').trim()).filter(Boolean)
        : [],
      // Exact member ids the updated app looked up (28). Tried first
      // in the review prefill; empty for rows filed before that build.
      coMakerIds: Array.isArray(row.co_maker_ids)
        ? row.co_maker_ids.map(Number).filter(Boolean)
        : [],
    }
  }

  async function fetchRequests() {
    requestsLoading.value = true
    try {
      const { data, error } = await supabase
        .from('loan_application')
        .select('*, member(name, member_no, auth_uid)')
        .order('application_id', { ascending: false })
      if (error) throw error
      requests.value = (data || []).map(rowToRequest)
      requestsError.value = ''
    } catch (error) {
      requestsError.value = errorMessage(error)
      requests.value = []
    } finally {
      requestsLoading.value = false
    }
  }

  // ---------- documents the member attached when filing (Flow 2b) ----------
  // The app uploads them to {auth-uid}/loan-apps/{application_id}/ in the
  // member-documents bucket. They stay storage-only while pending — listing
  // them here is what lets the admin review them before approving.
  async function fetchRequestDocuments(request) {
    if (!request?.memberAuthUid || !request?.id) return { ok: true, docs: [] }
    const prefix = `${request.memberAuthUid}/loan-apps/${request.id}`
    const { data, error } = await supabase.storage.from('member-documents').list(prefix)
    if (error) {
      return { ok: false, message: 'The documents for this request could not be loaded.' }
    }
    const docs = (data || [])
      .filter((file) => file && file.name)
      .map((file) => {
        const size = Number(file.metadata?.size)
        return {
          name: file.name,
          path: `${prefix}/${file.name}`,
          size: Number.isFinite(size) ? size : null,
          type: file.metadata?.mimetype || file.metadata?.contentType || '',
        }
      })
    return { ok: true, docs }
  }

  /** Short-lived signed URL — the bucket is private. */
  async function requestDocumentUrl(path) {
    const { data, error } = await supabase.storage
      .from('member-documents')
      .createSignedUrl(path, 3600)
    return error ? null : data.signedUrl
  }

  // Friendly label for the three required documents — the contract pins
  // these filenames so the reviewer sees requirement names, not raw files.
  function documentLabel(fileName) {
    const base = String(fileName)
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
    if (base.includes('valid-id') || base.includes('valid id')) return 'Valid ID'
    if (base.includes('proof-of-salary') || base.includes('proof of salary'))
      return 'Proof of salary'
    if (base.includes('checking-account') || base.includes('checking account'))
      return 'Checking account'
    return ''
  }

  // On approval the documents become attachment rows on the new loan, so the
  // paperwork follows the money (Files panel, same replace/remove rules as
  // any other attachment). The files are NOT moved — admins can read anywhere
  // in the bucket, and removing an attachment deletes the object wherever it
  // lives. Failure here never undoes a completed approval; the caller reports
  // it instead.
  async function registerRequestDocuments(request, loanId, adminId) {
    if (!request.memberAuthUid) return { ok: true, count: 0 }
    const prefix = `${request.memberAuthUid}/loan-apps/${request.id}`
    try {
      const { data, error } = await supabase.storage.from('member-documents').list(prefix)
      if (error) throw error
      const files = (data || []).filter((file) => file && file.name)
      if (!files.length) return { ok: true, count: 0 }
      const rows = files.map((file) => {
        const size = Number(file.metadata?.size)
        const label = documentLabel(file.name)
        return {
          loan_id: loanId,
          file_path: `${prefix}/${file.name}`,
          file_name: file.name,
          file_type: file.metadata?.mimetype || file.metadata?.contentType || null,
          file_size: Number.isFinite(size) ? size : null,
          note: label ? `${label} (app submission)` : 'App submission',
          uploaded_by: adminId,
        }
      })
      const { error: insertError } = await supabase.from('attachment').insert(rows)
      if (insertError) throw insertError
      return { ok: true, count: rows.length }
    } catch {
      return { ok: false, count: 0 }
    }
  }

  // In-app notice for the member (app contract §12) — best-effort by
  // design: the decision is already committed, so a failed notice is
  // reported to the admin instead of reverting anything. Members
  // without an app login have no inbox — skip them silently.
  async function notifyRequestMember(request, adminId, { type, title, body, loanId = null }) {
    if (!request.memberAuthUid) return { ok: true }
    const { error } = await supabase.from('notification').insert({
      member_id: request.memberId,
      loan_id: loanId,
      type,
      title,
      body,
      created_by: adminId,
    })
    return error ? { ok: false } : { ok: true }
  }

  // ✅ Approve an app request → creates the loan ready for release.
  // The request is stamped FIRST; if the loan insert then fails the
  // stamp is reverted, so a request can never sit Approved without
  // its loan row (the reverse order could produce duplicate loans).
  async function approveRequest(id, { coMakers = [], note = '' } = {}) {
    const request = requests.value.find((item) => item.id === id)
    if (!request) return { ok: false, message: 'Request not found.' }
    if (request.status !== 'Pending') {
      return { ok: false, message: 'This request has already been reviewed.' }
    }

    const typeInfo = LOAN_TYPES.find((item) => item.value === request.type)
    if (!typeInfo) {
      return {
        ok: false,
        message:
          'This request has no recognized loan type — return or reject it so the member can file again.',
      }
    }

    const amount = Number(request.amount) || 0
    if (!(amount > 0)) return { ok: false, message: 'This request has no valid amount.' }

    const term = Number(request.termMonths) || 0
    if (term < 1 || term > 36) {
      return { ok: false, message: 'The requested term is missing or outside 1–36 months.' }
    }

    // Same gate a portal-filed loan gets — capital share, 2-month wait,
    // concurrent-loan limits and ceiling all re-checked at approval.
    const elig = eligibility(request.memberId, request.type)
    if (!elig.ok) return { ok: false, message: elig.reasons.join(' ') }

    if (request.type === 'Emergency') {
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
    // Entries are picked member ids (portal) or typed names (app).
    const filledCoMakers = coMakers.filter((entry) =>
      typeof entry === 'number' ? entry : Boolean(entry && entry.trim()),
    )
    if (filledCoMakers.length < requiredCoMakers) {
      return {
        ok: false,
        message: `${requiredCoMakers} co-maker${requiredCoMakers > 1 ? 's' : ''} required for this amount (₱100,000 and above need 2).`,
      }
    }

    const coMakerProblem = validateCoMakerIds(filledCoMakers, request.memberId)
    if (coMakerProblem) return { ok: false, message: coMakerProblem }

    const now = new Date().toISOString()
    const today = todayLocal()
    const auth = useAuthStore()
    const adminId = auth.profile?.admin_id ?? null
    const trimmedNote = String(note || '').trim()

    const { error: stampError } = await supabase
      .from('loan_application')
      .update({
        status: 'Approved',
        reviewed_by: adminId,
        date_reviewed: today,
        remarks: trimmedNote || null,
      })
      .eq('application_id', id)
    if (stampError) return { ok: false, message: errorMessage(stampError) }

    const totals = loanTotals(amount, typeInfo.rate, term)
    const { data: row, error } = await supabase
      .from('loan')
      .insert({
        member_id: request.memberId,
        amount: round2(amount),
        interest_rate: typeInfo.rate / 100, // fraction — seed/CSV convention
        date_issued: today, // moves to the release date on release
        due_date: plusMonths(today, term),
        status: 'Approved',
        approved_by: adminId,
        created_at: now,
        term_months: term,
        loan_type: request.type,
      })
      .select()
      .single()
    if (error) {
      // Best-effort revert — back to Pending so the queue stays honest.
      await supabase
        .from('loan_application')
        .update({ status: 'Pending', reviewed_by: null, date_reviewed: null, remarks: null })
        .eq('application_id', id)
      return { ok: false, message: errorMessage(error) }
    }

    const displayNames = await linkCoMakers(row.loan_id, filledCoMakers, today)

    const loan = {
      id: row.loan_id,
      loanNo: loanNoOf(row.loan_id),
      memberId: request.memberId,
      memberNo: elig.member.memberNo,
      memberName: request.memberName,
      type: request.type,
      principal: round2(amount),
      ratePercent: typeInfo.rate,
      termMonths: term,
      totalDue: totals.totalDue, // frozen here — diminishing total
      coMakers: displayNames,
      requirements: [], // checklist is session-only; the review happened here
      status: 'Approved',
      createdAt: now,
      releasedAt: null,
      releaseChannel: null,
      payments: [],
      remarks: trimmedNote,
      history: [],
    }
    loans.value.push(loan)
    logAction(
      loan,
      `App loan request approved — ${typeInfo.label} ₱${round2(amount).toLocaleString('en-PH')} (request #${id})`,
    )

    // Carry the app-submitted documents over to the new loan.
    const docs = await registerRequestDocuments(request, row.loan_id, adminId)
    if (docs.ok && docs.count > 0) {
      logAction(
        loan,
        `App documents linked — ${docs.count} file${docs.count > 1 ? 's' : ''} from the loan request`,
      )
    } else if (!docs.ok) {
      logAction(loan, 'App documents could not be linked — attach them from the Files panel')
    }

    // Tell the member in the app — claim in person, same words the portal uses.
    const notify = await notifyRequestMember(request, adminId, {
      type: 'loan_approved',
      title: 'Loan request approved',
      body: `Your ${typeInfo.label} loan request of ₱${round2(amount).toLocaleString('en-PH')} for ${term} months has been approved. Claim the proceeds in person at the cooperative (cash or Landbank cheque).`,
      loanId: row.loan_id,
    })

    const local = requests.value.find((item) => item.id === id)
    if (local) {
      local.status = 'Approved'
      local.remarks = trimmedNote
      local.dateReviewed = today
    }
    return { ok: true, loan, docs, notify }
  }

  // ↩️ Return / ❌ Reject — both require remarks (same rule as the
  // registration queue), and both stamp the row for the app to read.
  async function returnRequest(id, remarks) {
    return decideRequest(id, 'Returned', remarks, 'returned')
  }

  async function rejectRequest(id, remarks) {
    return decideRequest(id, 'Rejected', remarks, 'rejected')
  }

  async function decideRequest(id, status, remarks, label) {
    const request = requests.value.find((item) => item.id === id)
    if (!request) return { ok: false, message: 'Request not found.' }
    if (request.status !== 'Pending') {
      return { ok: false, message: 'This request has already been reviewed.' }
    }
    const trimmed = String(remarks || '').trim()
    if (!trimmed) {
      return { ok: false, message: `Remarks are required when ${label} a loan request.` }
    }
    const auth = useAuthStore()
    const today = todayLocal()
    const { error } = await supabase
      .from('loan_application')
      .update({
        status,
        reviewed_by: auth.profile?.admin_id ?? null,
        date_reviewed: today,
        remarks: trimmed,
      })
      .eq('application_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    request.status = status
    request.remarks = trimmed
    request.dateReviewed = today
    useAuditStore().record('loan_application', id, `Loan request ${label} — ${trimmed}`)

    // The member reads the outcome (with these exact remarks) in the app.
    const notify = await notifyRequestMember(
      request,
      auth.profile?.admin_id ?? null,
      status === 'Returned'
        ? {
            type: 'loan_returned',
            title: 'Loan request returned',
            body: `Your loan request was returned for completion: ${trimmed}`,
          }
        : {
            type: 'loan_rejected',
            title: 'Loan request rejected',
            body: `Your loan request was rejected. Remarks: ${trimmed}`,
          },
    )
    return { ok: true, notify }
  }

  // Load once, when the store is first used (LoansView mounts).
  fetchLoans()
  fetchRequests()

  return {
    loans,
    loading,
    lastError,
    fetchLoans,
    search,
    statusFilter,
    typeFilter,
    showArchived,
    filteredLoans,
    paginatedLoans,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
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
    verifyPayment,
    attachReceipt,
    removeReceipt,
    sendReminder,
    deleteTestLoan,
    archiveLoan,
    restoreLoan,
    addHistoricalLoan,
    importHistoricalLoans,
    previewHistoricalImport,
    requests,
    requestsLoading,
    requestsError,
    pendingRequests,
    fetchRequests,
    fetchRequestDocuments,
    requestDocumentUrl,
    approveRequest,
    returnRequest,
    rejectRequest,
  }
})
