import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useMembersStore } from './members'
import { loanTotals } from '../utils/amortization'

/**
 * Loans store — built from the client interview (docs/client-interview-1.md)
 *
 * Rules implemented (UCMS assumptions marked ⚠️):
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
 *   - Full capital (₱15k new / ₱20k old) required before loaning ⚠️ —
 *     using ₱15k as the bar for everyone until confirmed
 *   - Committee approval → release (cash/cheque, claimed in person)
 *   - Delinquent = 6 months with no payment → letter + text reminders
 *   - Penalties for late payment exist but the formula was NOT given by the
 *     client — not modeled yet (open question #3 in the interview doc)
 *
 * Mocked for now. Supabase swap points:
 *   - `loans` + `loan_payments` tables (payments should be append-only)
 *   - approve/release/payment actions → rpc/transaction so the member's
 *     balance and the loan can never drift apart
 *   - eligibility() runs against members.capital_share in SQL later
 * LoansView will NOT need to change.
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

// Relative dates keep the demo realistic no matter when it is opened
const daysAgo = (n) => {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString()
}

const monthsAgo = (n) => {
  const date = new Date()
  date.setMonth(date.getMonth() - n)
  return date.toISOString()
}

function monthsSince(isoString) {
  const from = new Date(isoString)
  const now = new Date()
  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
}

const req = (label, checked = true) => ({ label, checked })

// Temporary sample data — delete once Supabase is connected.
// Interest totals use the closed form: rate × principal × (months + 1) / 2
const mockLoans = [
  {
    id: 1,
    loanNo: 'LOAN-0001',
    memberId: 1,
    memberNo: 'KHS-0001',
    memberName: 'Juan Dela Cruz',
    type: 'Regular',
    principal: 100000,
    ratePercent: 1.5,
    termMonths: 12,
    totalDue: 109750, // 100,000 + 1.5% × 100,000 × 6.5
    coMakers: ['Roberto Cruz', 'Teresa Lim'],
    requirements: [req('Valid ID presented'), req('Proof of salary submitted')],
    status: 'Released',
    createdAt: monthsAgo(4),
    releasedAt: monthsAgo(4),
    releaseChannel: 'Cash',
    payments: [
      { id: 11, at: monthsAgo(3), amount: 9833.33, channel: 'ATM Deduction', note: '' },
      { id: 12, at: monthsAgo(2), amount: 9708.33, channel: 'ATM Deduction', note: '' },
      { id: 13, at: monthsAgo(1), amount: 9583.33, channel: 'GCash', note: 'paid via gcash' },
    ],
    remarks: '',
    history: [
      { at: monthsAgo(1), action: 'Payment recorded — ₱9,583.33 via GCash', by: 'Admin' },
      { at: monthsAgo(2), action: 'Payment recorded — ₱9,708.33 via ATM Deduction', by: 'Admin' },
      { at: monthsAgo(3), action: 'Payment recorded — ₱9,833.33 via ATM Deduction', by: 'Admin' },
      { at: monthsAgo(4), action: 'Loan released via Cash — claimed in person', by: 'Admin' },
      { at: monthsAgo(4), action: 'Approved by committee', by: 'Admin' },
      {
        at: monthsAgo(4),
        action: 'Loan application submitted — Salary / Regular ₱100,000',
        by: 'Admin',
      },
    ],
  },
  {
    id: 2,
    loanNo: 'LOAN-0002',
    memberId: 5,
    memberNo: 'KHS-0005',
    memberName: 'Jose Mendoza',
    type: 'Education',
    principal: 40000,
    ratePercent: 1.5,
    termMonths: 12,
    totalDue: 43900, // 40,000 + 1.5% × 40,000 × 6.5
    coMakers: ['Juan Dela Cruz'],
    requirements: [req('Valid ID presented')],
    status: 'Released',
    createdAt: monthsAgo(9),
    releasedAt: monthsAgo(9),
    releaseChannel: 'Cheque',
    payments: [
      { id: 21, at: monthsAgo(8), amount: 3933.33, channel: 'Cash', note: '' },
      // last payment 7 months ago — no payment since = delinquent (6+ months)
      { id: 22, at: monthsAgo(7), amount: 3883.33, channel: 'Cash', note: '' },
    ],
    remarks: '',
    history: [
      { at: monthsAgo(7), action: 'Payment recorded — ₱3,883.33 via Cash', by: 'Admin' },
      { at: monthsAgo(8), action: 'Payment recorded — ₱3,933.33 via Cash', by: 'Admin' },
      { at: monthsAgo(9), action: 'Loan released via Cheque — claimed in person', by: 'Admin' },
      { at: monthsAgo(9), action: 'Approved by committee', by: 'Admin' },
      { at: monthsAgo(9), action: 'Loan application submitted — Education ₱40,000', by: 'Admin' },
    ],
  },
  {
    id: 3,
    loanNo: 'LOAN-0003',
    memberId: 5,
    memberNo: 'KHS-0005',
    memberName: 'Jose Mendoza',
    type: 'Emergency',
    principal: 15000,
    ratePercent: 1.5,
    termMonths: 3,
    totalDue: 15450, // 15,000 + 1.5% × 15,000 × 2
    coMakers: ['Juan Dela Cruz'],
    requirements: [req('Valid ID presented')],
    status: 'Released',
    createdAt: daysAgo(26),
    releasedAt: daysAgo(25),
    releaseChannel: 'Cash',
    payments: [],
    remarks: '',
    history: [
      { at: daysAgo(25), action: 'Loan released via Cash — claimed in person', by: 'Admin' },
      { at: daysAgo(25), action: 'Approved by committee', by: 'Admin' },
      { at: daysAgo(26), action: 'Loan application submitted — Emergency ₱15,000', by: 'Admin' },
    ],
  },
  {
    id: 4,
    loanNo: 'LOAN-0004',
    memberId: 1,
    memberNo: 'KHS-0001',
    memberName: 'Juan Dela Cruz',
    type: 'Business',
    principal: 120000,
    ratePercent: 2.0,
    termMonths: 18,
    totalDue: 142800, // 120,000 + 2% × 120,000 × 9.5
    coMakers: ['Elena Santos', 'Miguel Torres'],
    requirements: [
      req('Valid ID presented'),
      req('Proof of salary submitted'),
      req('Checking account submitted'),
    ],
    status: 'For Approval',
    createdAt: daysAgo(3),
    releasedAt: null,
    releaseChannel: null,
    payments: [],
    remarks: '',
    history: [
      { at: daysAgo(3), action: 'Loan application submitted — Business ₱120,000', by: 'Admin' },
    ],
  },
  {
    id: 5,
    loanNo: 'LOAN-0005',
    memberId: 4,
    memberNo: 'KHS-0004',
    memberName: 'Ana Garcia',
    type: 'Gadget',
    principal: 12000,
    ratePercent: 1.5,
    termMonths: 6,
    totalDue: 12630, // 12,000 + 1.5% × 12,000 × 3.5
    coMakers: ['Maria Santos'],
    requirements: [req('Valid ID presented')],
    status: 'Paid',
    createdAt: monthsAgo(14),
    releasedAt: monthsAgo(14),
    releaseChannel: 'Cash',
    payments: [
      { id: 51, at: monthsAgo(13), amount: 2180, channel: 'ATM Deduction', note: '' },
      { id: 52, at: monthsAgo(12), amount: 2150, channel: 'ATM Deduction', note: '' },
      { id: 53, at: monthsAgo(11), amount: 2120, channel: 'ATM Deduction', note: '' },
      { id: 54, at: monthsAgo(10), amount: 2090, channel: 'ATM Deduction', note: '' },
      { id: 55, at: monthsAgo(9), amount: 2060, channel: 'GCash', note: '' },
      { id: 56, at: monthsAgo(8), amount: 2030, channel: 'GCash', note: 'final payment' },
    ],
    remarks: '',
    history: [
      { at: monthsAgo(8), action: 'Loan fully paid', by: 'Admin' },
      { at: monthsAgo(8), action: 'Payment recorded — ₱2,030.00 via GCash', by: 'Admin' },
      { at: monthsAgo(14), action: 'Loan released via Cash — claimed in person', by: 'Admin' },
      { at: monthsAgo(14), action: 'Approved by committee', by: 'Admin' },
      { at: monthsAgo(14), action: 'Loan application submitted — Gadget ₱12,000', by: 'Admin' },
    ],
  },
  {
    id: 6,
    loanNo: 'LOAN-0006',
    memberId: 1,
    memberNo: 'KHS-0001',
    memberName: 'Juan Dela Cruz',
    type: 'Transportation',
    principal: 150000,
    ratePercent: 1.5,
    termMonths: 24,
    totalDue: 166500, // 150,000 + 1.5% × 150,000 × 11
    coMakers: ['Roberto Cruz', 'Teresa Lim'],
    requirements: [req('Valid ID presented'), req('Proof of salary submitted')],
    status: 'Rejected',
    createdAt: daysAgo(12),
    releasedAt: null,
    releaseChannel: null,
    payments: [],
    remarks:
      'Salary proof insufficient — the member\u2019s payslip can only support up to ₱100,000.',
    history: [
      {
        at: daysAgo(11),
        action:
          'Rejected — Salary proof insufficient — the member\u2019s payslip can only support up to ₱100,000.',
        by: 'Admin',
      },
      {
        at: daysAgo(12),
        action: 'Loan application submitted — Transportation / Vehicle ₱150,000',
        by: 'Admin',
      },
    ],
  },
]

export const useLoansStore = defineStore('loans', () => {
  const loans = ref([...mockLoans])
  const search = ref('')
  const statusFilter = ref('All')
  const typeFilter = ref('All')

  const filteredLoans = computed(() => {
    const query = search.value.trim().toLowerCase()
    return loans.value
      .filter((loan) => {
        const matchesStatus = statusFilter.value === 'All' || loan.status === statusFilter.value
        const matchesType = typeFilter.value === 'All' || loan.type === typeFilter.value
        const haystack = `${loan.loanNo} ${loan.memberName} ${loan.memberNo}`.toLowerCase()
        const matchesSearch = !query || haystack.includes(query)
        return matchesStatus && matchesType && matchesSearch
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  })

  // ---------- money helpers (used by the view for each row) ----------
  function paidOf(loan) {
    return round2(loan.payments.reduce((sum, payment) => sum + payment.amount, 0))
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

  // ---------- actions ----------
  function generateLoanNo() {
    const numbers = loans.value.map((loan) => Number.parseInt(loan.loanNo.split('-')[1], 10))
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return `LOAN-${String(next).padStart(4, '0')}`
  }

  function logAction(loan, action) {
    if (!loan.history) loan.history = []
    loan.history.unshift({ at: new Date().toISOString(), action, by: 'Admin' })
  }

  function addLoan({ memberId, type, principal, termMonths, coMakers, requirements }) {
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
    const totals = loanTotals(amount, typeInfo.rate, termMonths)
    const loan = {
      id: Date.now(), // temporary id — Supabase will generate the real one
      loanNo: generateLoanNo(),
      memberId,
      memberNo: elig.member.memberNo,
      memberName: `${elig.member.firstName} ${elig.member.lastName}`,
      type,
      principal: round2(amount),
      ratePercent: typeInfo.rate,
      termMonths: Number(termMonths),
      totalDue: totals.totalDue, // frozen here — diminishing total
      coMakers: filledCoMakers,
      requirements: [...requirements],
      status: 'For Approval',
      createdAt: now,
      releasedAt: null,
      releaseChannel: null,
      payments: [],
      remarks: '',
      history: [
        {
          at: now,
          action: `Loan application submitted — ${typeInfo.label} ₱${round2(amount).toLocaleString('en-PH')}`,
          by: 'Admin',
        },
      ],
    }
    loans.value.push(loan)
    return { ok: true, loan }
  }

  function approveLoan(id) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'For Approval') {
      return { ok: false, message: 'Only loans under review can be approved.' }
    }
    loan.status = 'Approved'
    logAction(loan, 'Approved by committee')
    return { ok: true }
  }

  function rejectLoan(id, remarks) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'For Approval') {
      return { ok: false, message: 'Only loans under review can be rejected.' }
    }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when rejecting a loan.' }
    }
    loan.status = 'Rejected'
    loan.remarks = remarks.trim()
    logAction(loan, `Rejected — ${remarks.trim()}`)
    return { ok: true }
  }

  // Release = member comes in person, cash or cheque (Landbank) — client rule
  function releaseLoan(id, channel) {
    const loan = loans.value.find((item) => item.id === id)
    if (!loan) return { ok: false, message: 'Loan not found.' }
    if (loan.status !== 'Approved') {
      return { ok: false, message: 'Only approved loans can be released.' }
    }
    if (!RELEASE_CHANNELS.includes(channel)) {
      return { ok: false, message: 'Choose how the loan will be released (Cash or Cheque).' }
    }
    loan.status = 'Released'
    loan.releasedAt = new Date().toISOString()
    loan.releaseChannel = channel
    logAction(loan, `Loan released via ${channel} — claimed in person`)
    return { ok: true }
  }

  function recordPayment(id, { amount, at, channel, note }) {
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
    loan.payments.push({
      id: Date.now(),
      at: at || new Date().toISOString(),
      amount: round2(value),
      channel,
      note: note || '',
    })
    if (balanceOf(loan) <= 0.01) {
      loan.status = 'Paid'
      logAction(loan, 'Loan fully paid')
    } else {
      logAction(loan, `Payment recorded — ₱${round2(value).toLocaleString('en-PH')} via ${channel}`)
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

  return {
    loans,
    search,
    statusFilter,
    typeFilter,
    filteredLoans,
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
