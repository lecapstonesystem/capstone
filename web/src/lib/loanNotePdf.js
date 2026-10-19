/**
 * Loan Note PDF — Form No. KB Cr.13.
 *
 * Recreates the cooperative's paper form (Loan Note, Pledge of Deposits,
 * Authority) as a printable PDF, filling every blank from the loan and
 * member records. The form text is transcribed verbatim from the client's
 * printed form — including the "one percent per month" interest line,
 * which the client asked to keep exactly as printed.
 *
 * Signatures, the collateral line, and the fields the database does not
 * collect stay blank on purpose: they are filled and signed by hand at
 * the coop office, same as the paper form.
 *
 * jsPDF is imported dynamically so the library only loads when an admin
 * actually prints a note — the login bundle stays lean.
 */
import { loanTotals, buildSchedule } from '../utils/amortization'

export const COOP_NAME = 'KHS Mentors Multipurpose Cooperative'
export const COOP_ADDRESS = 'Caloocan High School, 10th Ave. West Grace Park, Caloocan City'

// ---------------------------------------------------------------------------
// Amount in words — "FIFTY THOUSAND and 00/100", the way the form wants it.
// ---------------------------------------------------------------------------

const ONES = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
]

const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

function wordsUnder1000(n) {
  let out = ''
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} HUNDRED`
    n %= 100
    if (n) out += ' '
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)]
    if (n % 10) out += `-${ONES[n % 10]}`
  } else if (n > 0 || out === '') {
    out += ONES[n]
  }
  return out.trim()
}

/** → { pesos: 'FIFTY THOUSAND', centavos: '00/100' } */
export function amountInWords(amount) {
  let pesos = Math.floor(Number(amount) || 0)
  let centavos = Math.round(((Number(amount) || 0) - pesos) * 100)
  if (centavos >= 100) {
    pesos += 1
    centavos -= 100
  }
  const scales = [
    [1_000_000_000, 'BILLION'],
    [1_000_000, 'MILLION'],
    [1_000, 'THOUSAND'],
  ]
  let words = ''
  for (const [value, name] of scales) {
    if (pesos >= value) {
      words += `${wordsUnder1000(Math.floor(pesos / value))} ${name} `
      pesos %= value
    }
  }
  // Append the remainder — but only when something remains; a round
  // ₱170,000 must read "ONE HUNDRED SEVENTY THOUSAND", not "... ZERO".
  if (pesos > 0 || words === '') words += wordsUnder1000(pesos)
  return {
    pesos: words.replace(/\s+/g, ' ').trim(),
    centavos: `${String(centavos).padStart(2, '0')}/100`,
  }
}

function longDate(iso) {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Page builder
// ---------------------------------------------------------------------------

const PAGE_LEFT = 25
const PAGE_RIGHT = 190.9
const WIDTH = PAGE_RIGHT - PAGE_LEFT

function makeHelpers(doc) {
  const centerX = PAGE_LEFT + WIDTH / 2

  function paragraph(text, y, { size = 9.5, indent = 0, gap = 4, bold = false } = {}) {
    doc.setFont('times', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, WIDTH - indent)
    doc.text(lines, PAGE_LEFT + indent, y, { maxWidth: WIDTH - indent })
    return y + lines.length * (size * 0.42) + gap
  }

  function centered(text, y, { size = 10, bold = false, underline = false } = {}) {
    doc.setFont('times', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(text, centerX, y, { align: 'center' })
    if (underline) {
      const w = doc.getTextWidth(text)
      doc.line(centerX - w / 2, y + 1.3, centerX + w / 2, y + 1.3)
    }
    return y + size * 0.5
  }

  /** A ruled line with an optional printed value sitting on it. */
  function rule(x1, x2, y, value = '', { size = 9, align = 'left' } = {}) {
    if (value) {
      doc.setFont('times', 'normal')
      doc.setFontSize(size)
      if (align === 'center') {
        const w = doc.getTextWidth(value)
        doc.text(value, x1 + (x2 - x1) / 2 - w / 2, y - 0.8)
      } else {
        doc.text(value, x1 + 1, y - 0.8)
      }
    }
    doc.line(x1, y, x2, y)
  }

  function signatureRow(y, { captionLeft, nameLeft, captionRight, valueRight }) {
    const half = WIDTH / 2 - 5
    rule(PAGE_LEFT, PAGE_LEFT + half, y)
    rule(PAGE_LEFT + WIDTH - half, PAGE_RIGHT, y)
    doc.setFont('times', 'normal')
    doc.setFontSize(8)
    doc.text(captionLeft, PAGE_LEFT + half / 2, y + 4, { align: 'center' })
    doc.text(captionRight, PAGE_LEFT + WIDTH - half / 2, y + 4, { align: 'center' })
    if (nameLeft) {
      doc.setFontSize(7.5)
      doc.text(nameLeft, PAGE_LEFT + half / 2, y + 8, { align: 'center' })
    }
    if (valueRight) {
      doc.setFontSize(8)
      doc.text(valueRight, PAGE_LEFT + WIDTH - half + 1, y - 1.5)
    }
  }

  return { paragraph, centered, rule, signatureRow, centerX }
}

/**
 * Build and download the Loan Note for one loan.
 *
 * @param {object} loan  loan row from the loans store (loanNo, memberName,
 *                       principal, ratePercent, termMonths, coMakers, …)
 * @param {object|null} member  member row (for the address line), optional
 */
export async function generateLoanNote(loan, member = null) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const { paragraph, centered, rule, signatureRow } = makeHelpers(doc)

  // --- Values from the records ---------------------------------------------
  const principal = Number(loan.principal) || 0
  const term = Number(loan.termMonths) || 0
  const startDate = loan.releasedAt || loan.createdAt || new Date().toISOString()
  const totals = loanTotals(principal, loan.ratePercent, term)
  const schedule = buildSchedule({
    principal,
    ratePercent: loan.ratePercent,
    termMonths: term,
    startDate,
  })
  const amount = amountInWords(principal)
  const installment = amountInWords(totals.firstPayment)
  const noteDate = longDate(startDate)
  const firstDue = longDate(schedule[0]?.dueDate || startDate)
  const maker = loan.memberName || ''
  const address = (member && member.address) || ''
  const coMakers = (loan.coMakers || []).filter(Boolean)

  // =========================================================================
  // Page 1 — LOAN NOTE
  // =========================================================================
  let y = 18

  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  doc.text('Form No. KB Cr.13', PAGE_LEFT, y)
  y += 10

  centered(COOP_NAME, y, { size: 15, bold: true })
  y += 4
  rule(PAGE_LEFT, PAGE_RIGHT, y)
  centered('(Name of Credit Cooperative)', y + 4, { size: 8 })
  y += 9
  rule(PAGE_LEFT, PAGE_RIGHT, y, COOP_ADDRESS, { size: 9, align: 'center' })
  centered('(Address)', y + 4, { size: 8 })
  y += 13

  centered('L O A N   N O T E', y, { size: 12, bold: true })
  y += 9

  // No. ____ at the right, filled with the loan number
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.text('NO.', PAGE_RIGHT - 58, y)
  rule(PAGE_RIGHT - 48, PAGE_RIGHT, y + 1, loan.loanNo || '', { size: 10 })
  y += 7

  // Date line, filled with the note date
  rule(PAGE_LEFT, PAGE_LEFT + 95, y + 1, noteDate, { size: 10 })
  y += 9

  y = paragraph(
    `For value received, I/We, jointly and severally, promise to pay to the ${COOP_NAME} Credit cooperative, or order, the sum of ${amount.pesos} and ${amount.centavos} PESOS, with interest on unpaid balances at the rate of one percent per month, payable in ${term} installments of ${installment.pesos} and ${installment.centavos} PESOS, the first payment to be made on ${firstDue} and a like amount, every MONTH thereafter until the full amount has been paid.`,
    y,
    { size: 10.5, gap: 7 },
  )

  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.text('Collateral:', PAGE_LEFT, y)
  y += 7
  rule(PAGE_LEFT, PAGE_RIGHT, y)
  y += 6
  rule(PAGE_LEFT, PAGE_RIGHT, y)
  y += 9

  y = paragraph(
    'In case of any default in payments as herein agreed, the entire balance of this note shall become immediately due and payable, at the option of the holder. Each party to this note whether as maker, co-maker, endorser, or guarantor, severally waives presentation of payment, demand, protest and notice of protest and dishonor of the same.',
    y,
    { size: 9.5, gap: 5 },
  )

  y = paragraph(
    "It is further agreed by party hereto, that in case payment shall not be made at maturity, he shall pay the cost of collection, and attorney's fees in an amount equal to twenty percent of the principal and interest due on this note, but such charge in no event to be not less than TEN PESOS.",
    y,
    { size: 9.5, gap: 5 },
  )

  y = paragraph(
    'In case of judicial execution of this obligation or any part of it the debtor waives all his rights under the provisions of Rule 3, Section 13 and Rule 39, Section 12 of the Rules of Court.',
    y,
    { size: 9.5, gap: 10 },
  )

  signatureRow(y, {
    captionLeft: 'Signature of Maker',
    nameLeft: maker,
    captionRight: 'Address',
    valueRight: address,
  })
  y += 16
  signatureRow(y, {
    captionLeft: 'Signature of Co-Maker',
    nameLeft: coMakers[0] || '',
    captionRight: 'Address',
    valueRight: '',
  })
  y += 16
  signatureRow(y, {
    captionLeft: 'Signature of Co-Maker',
    nameLeft: coMakers[1] || '',
    captionRight: 'Address',
    valueRight: '',
  })
  y += 12

  centered('TEACH YOUR PESO TO EARN MORE CENTAVOS', y, { size: 9, bold: true })

  // =========================================================================
  // Page 2 — PLEDGE OF DEPOSITS + AUTHORITY
  // =========================================================================
  doc.addPage()
  y = 30

  centered('PLEDGE OF DEPOSITS', y, { size: 11, bold: true, underline: true })
  y += 10

  y = paragraph(
    `I/We, the undersigned, hereby pledge all deposits and payments on deposits which I/We now have or hereafter may have in this Credit Cooperative as security for the loan as evidenced by a note dated ${noteDate}, in the amount of ${amount.pesos} and ${amount.centavos} PESOS, executed by me/us, payable to the ${COOP_NAME} Credit Cooperative. This pledge is given to secure the payment of the above-described loan and interest, fines, costs, or expenses that may accrue thereon, and I/We hereby authorize this Credit Cooperative to apply any or all such deposits and payments on deposits to the payment of said loan and interest, fines, costs, or expenses.`,
    y,
    { size: 10, gap: 6 },
  )

  y = paragraph(
    'IT IS FURTHER AGREED THAT if I/We shall full fail to pay any installments on the loan when due, I/We promise to pay a fine in accordance with the terms of the By-Laws of this Credit Cooperative.',
    y,
    { size: 10, gap: 14 },
  )

  // Maker (centered) then the two co-makers side by side
  const makerHalf = 60
  const makerX = PAGE_LEFT + WIDTH / 2
  rule(makerX - makerHalf / 2, makerX + makerHalf / 2, y)
  centered('Maker', y + 4, { size: 8 })
  if (maker) {
    doc.setFont('times', 'normal')
    doc.setFontSize(7.5)
    doc.text(maker, makerX, y - 1.5, { align: 'center' })
  }
  y += 16

  const coHalf = 65
  rule(PAGE_LEFT, PAGE_LEFT + coHalf, y)
  rule(PAGE_RIGHT - coHalf, PAGE_RIGHT, y)
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  doc.text('Co-Maker', PAGE_LEFT + coHalf / 2, y + 4, { align: 'center' })
  doc.text('Co-Maker', PAGE_RIGHT - coHalf / 2, y + 4, { align: 'center' })
  if (coMakers[0]) {
    doc.setFontSize(7.5)
    doc.text(coMakers[0], PAGE_LEFT + coHalf / 2, y - 1.5, { align: 'center' })
  }
  if (coMakers[1]) {
    doc.setFontSize(7.5)
    doc.text(coMakers[1], PAGE_RIGHT - coHalf / 2, y - 1.5, { align: 'center' })
  }
  y += 20

  centered('A U T H O R I T Y', y, { size: 11, bold: true, underline: true })
  y += 10

  y = paragraph(
    `I hereby authorize the Treasurer/Cashier/Disbursing Officer/ Paymaster of ${COOP_NAME} to collect from my salary every (payday/month) the sum of ${installment.pesos} and ${installment.centavos} PESOS until this loan plus interest/fines/costs are fully paid in addition to my regular savings.`,
    y,
    { size: 10, gap: 20 },
  )

  rule(PAGE_RIGHT - 85, PAGE_RIGHT, y)
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  doc.text('Signature', PAGE_RIGHT - 42.5, y + 4, { align: 'center' })
  if (maker) {
    doc.setFontSize(7.5)
    doc.text(maker, PAGE_RIGHT - 84, y - 1.5)
  }

  doc.save(`LoanNote-${loan.loanNo || 'loan'}.pdf`)
}
