/**
 * Diminishing balance amortization — the client's method ("kame diminishing").
 *
 * The principal portion is equal every month; interest is computed only on
 * the remaining balance.
 *
 * ratePercent is the MONTHLY rate (client assumption: 1.5%/month for all
 * loans, 2.0%/month for business — still to be confirmed, see
 * docs/client-interview-1.md open question #1).
 *
 * Example: ₱100,000 @ 1.5% for 12 months
 *   month 1:  ₱1,500.00 interest on ₱100,000 → payment ₱9,833.33
 *   month 12:   ₱125.00 interest on  ₱8,333 → payment ₱8,458.33
 */

const round2 = (value) => Math.round(value * 100) / 100

// Totals without dates — used for the application-time computation preview
// and to freeze totalDue when a loan is created
export function loanTotals(principal, ratePercent, termMonths) {
  const p = Number(principal) || 0
  const n = Number(termMonths) || 0
  if (p <= 0 || n <= 0) {
    return { principalPart: 0, firstPayment: 0, lastPayment: 0, interestTotal: 0, totalDue: 0 }
  }
  const rate = (Number(ratePercent) || 0) / 100
  const principalPart = p / n
  // Sum of remaining balances across all months = p × (n + 1) / 2
  const interestTotal = (rate * (p * (n + 1))) / 2
  return {
    principalPart: round2(principalPart),
    firstPayment: round2(principalPart + p * rate),
    lastPayment: round2(principalPart + principalPart * rate),
    interestTotal: round2(interestTotal),
    totalDue: round2(p + interestTotal),
  }
}

// Full month-by-month schedule. Due dates count from startDate
// (release date for live loans, application date for pending ones).
export function buildSchedule({ principal, ratePercent, termMonths, startDate }) {
  const p = Number(principal) || 0
  const n = Number(termMonths) || 0
  if (p <= 0 || n <= 0) return []
  const rate = (Number(ratePercent) || 0) / 100
  const principalPart = p / n
  const start = startDate ? new Date(startDate) : new Date()
  const rows = []
  let balance = p
  for (let month = 1; month <= n; month += 1) {
    const interest = balance * rate
    const dueDate = new Date(start)
    dueDate.setMonth(dueDate.getMonth() + month)
    rows.push({
      month,
      dueDate: dueDate.toISOString(),
      principal: month === n ? round2(balance) : round2(principalPart),
      interest: round2(interest),
      payment: round2(principalPart + interest),
      balance: round2(Math.max(0, balance - principalPart)),
    })
    balance -= principalPart
  }
  return rows
}

// First schedule row not yet covered by total payments (null when fully paid)
export function nextDue(rows, paidSum) {
  let cumulative = 0
  for (const row of rows) {
    cumulative += row.payment
    if (paidSum < cumulative - 0.01) return row
  }
  return null
}
