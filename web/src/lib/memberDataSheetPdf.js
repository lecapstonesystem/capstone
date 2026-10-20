/**
 * Members' Data Sheet PDF — stamps a member's details onto a scan of
 * the coop's own printed form (web/docs/feature-data-sheet-pdf.md).
 *
 * The output IS the coop's real form — logo, letterhead, ruled lines,
 * the "Bspb/8-8-18" footer — with typed values filled in, the way the
 * office would have typed them. Blanks the system does not collect
 * (1x1 photo, signature, dependents, employment, education) stay
 * empty for wet ink — the same philosophy as the Loan Note's blanks.
 *
 * Coordinates live in /forms/data-sheet-template.json as fractions of
 * the page, so any re-scan at another resolution keeps the same
 * template, and the mobile app can reuse the same JSON. The scan and
 * the template are static files fetched only when an admin prints,
 * and pdf-lib itself loads lazily — the login bundle stays lean.
 *
 * stampDataSheet() is a pure function (bytes in, PDF bytes out) so
 * scripts/sample-data-sheet.mjs can render a test sheet through the
 * exact production code path.
 */

const MM_TO_PT = 72 / 25.4
// Vite injects import.meta.env at build time; the guard keeps this
// module importable from Node (the sample script), where it is
// undefined.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
const IMAGE_URL = `${BASE}forms/members-data-sheet.jpg`
const TEMPLATE_URL = `${BASE}forms/data-sheet-template.json`

// ---------------------------------------------------------------------------
// Value shaping
// ---------------------------------------------------------------------------

/** WinAnsi-safe single-line text — base fonts have no ₱ or fancy quotes. */
function clean(value) {
  return String(value ?? '')
    .replace(/₱/g, 'PHP ')
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')
    .trim()
}

/** "October 19, 1990" from a YYYY-MM-DD column value ('' when absent). */
function longDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!parts) return ''
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** Whole years elapsed since a YYYY-MM-DD value — age, years in coop. */
function yearsSince(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!parts) return ''
  const start = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  const before =
    now.getMonth() < start.getMonth() ||
    (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())
  if (before) years -= 1
  return years >= 0 ? String(years) : ''
}

/** The form's box words differ slightly from the stored labels. */
function civilMark(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase()
  if (value === 'single') return 'Single'
  if (value === 'married') return 'Married'
  if (value === 'widow' || value === 'widowed' || value === 'widower') return 'Widow'
  if (value === 'separated') return 'Separated'
  return ''
}

function memberMark(type) {
  const value = String(type || '')
    .trim()
    .toLowerCase()
  if (value === 'regular') return 'Regular'
  if (value === 'associate') return 'Associate'
  return ''
}

/** Member record -> the template's field keys (missing keys print blank). */
function sheetValues(member) {
  const capital = Number(member.capitalShare) || 0
  return {
    lastName: member.lastName,
    firstName: member.firstName,
    middleName: member.middleName,
    dateOfBirth: longDate(member.dateOfBirth),
    age: yearsSince(member.dateOfBirth),
    spouseName: member.spouseName,
    // The system holds one address — the member's current one, which
    // is the form's "Present Address". Permanent stays for the pen.
    presentAddress: member.address,
    landline: member.landline,
    mobile: member.phone,
    // The coop's paper form carries the official (DepEd) address, so
    // print that when we have it; otherwise the personal login email.
    email: member.workEmail || member.email,
    tinNumber: member.tinNumber,
    gsisNumber: member.gsisNumber,
    sssNumber: member.sssNumber,
    pagibigNumber: member.pagibigNumber,
    philhealthNumber: member.philhealthNumber,
    membershipDate: longDate(member.dateJoined),
    yearsInCooperative: yearsSince(member.dateJoined),
    capitalShare:
      capital > 0
        ? `PHP ${capital.toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : '',
  }
}

/** Truncate to the blank's width with an ellipsis (base fonts, no wrap). */
function fit(text, font, size, maxPt) {
  if (font.widthOfTextAtSize(text, size) <= maxPt) return text
  let out = text
  while (out.length && font.widthOfTextAtSize(`${out}\u2026`, size) > maxPt) out = out.slice(0, -1)
  return out ? `${out}\u2026` : ''
}

/** Hand-drawn check mark — base fonts have no ✓ glyph. */
function drawCheck(page, cx, cy, color) {
  const stroke = { thickness: 1.3, color }
  page.drawLine({ start: { x: cx - 4.5, y: cy + 0.4 }, end: { x: cx - 1.5, y: cy - 3 }, ...stroke })
  page.drawLine({ start: { x: cx - 1.5, y: cy - 3 }, end: { x: cx + 6.5, y: cy + 5.5 }, ...stroke })
}

// ---------------------------------------------------------------------------
// Stamping
// ---------------------------------------------------------------------------

/**
 * Build the data-sheet PDF for one member.
 *
 * @param {object} input
 * @param {ArrayBuffer|Uint8Array} input.imageBytes  the scanned form (JPG)
 * @param {object} input.template  parsed data-sheet-template.json
 * @param {object} input.member    member row from the store (rowToMember)
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function stampDataSheet({ imageBytes, template, member }) {
  const mod = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb } = mod.PDFDocument ? mod : mod.default
  const black = rgb(0, 0, 0)

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.TimesRoman)
  const width = template.page.width * MM_TO_PT
  const height = template.page.height * MM_TO_PT
  const page = pdf.addPage([width, height])

  const scan = await pdf.embedJpg(imageBytes)
  page.drawImage(scan, { x: 0, y: 0, width, height })

  const values = sheetValues(member)
  for (const field of template.fields) {
    const raw = values[field.key]
    if (raw === undefined || raw === null || raw === '') continue
    const maxPt = field.w ? field.w * width : Infinity
    const text = fit(clean(raw), font, field.size, maxPt)
    if (!text) continue
    const textWidth = font.widthOfTextAtSize(text, field.size)
    const x = field.align === 'center' ? field.x * width - textWidth / 2 : field.x * width
    page.drawText(text, {
      x,
      y: height * (1 - field.y),
      size: field.size,
      font,
      color: black,
    })
  }

  const marks = {
    civilStatus: civilMark(member.civilStatus),
    memberType: memberMark(member.memberType),
  }
  for (const check of template.checks) {
    if (marks[check.group] !== check.value) continue
    drawCheck(page, check.x * width, height * (1 - check.y), black)
  }

  return pdf.save()
}

/**
 * Fetch the scan + template, stamp the member, download the PDF
 * as data-sheet-KHS-0149.pdf. Throws on load failure — callers show
 * a fixed plain-language message, never the raw error.
 */
export async function generateDataSheet(member) {
  const [imageRes, templateRes] = await Promise.all([fetch(IMAGE_URL), fetch(TEMPLATE_URL)])
  if (!imageRes.ok || !templateRes.ok) throw new Error('data-sheet form not available')
  const [imageBytes, template] = await Promise.all([imageRes.arrayBuffer(), templateRes.json()])

  const bytes = await stampDataSheet({ imageBytes, template, member })
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `data-sheet-${String(member.memberNo || 'member').trim()}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
