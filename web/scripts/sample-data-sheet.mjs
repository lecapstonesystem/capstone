// Renders a Members' Data Sheet with test data through the exact
// production code path (scripts run from web/: node scripts/sample-data-sheet.mjs).
// Output: public/forms/_sample.pdf — open it and check every stamp
// against the printed blank. Do not commit the generated file.
import { readFile, writeFile } from 'node:fs/promises'
import { stampDataSheet } from '../src/lib/memberDataSheetPdf.js'

const forms = new URL('../public/forms/', import.meta.url)
const template = JSON.parse(await readFile(new URL('data-sheet-template.json', forms), 'utf8'))
const imageBytes = await readFile(new URL('members-data-sheet.jpg', forms))

const member = {
  memberNo: 'KHS-0149',
  lastName: 'Dela Cruz',
  firstName: 'Juan Paolo',
  middleName: 'Santos',
  dateOfBirth: '1990-10-19',
  civilStatus: 'Married',
  spouseName: 'Maria Clara R. Dela Cruz',
  address: '123 Sampaguita Street, West Grace Park, Caloocan City',
  landline: '02-8756-1234',
  phone: '09171234567',
  email: 'juan.delacruz@example.com',
  tinNumber: '123-456-789-000',
  gsisNumber: '01-1234567-8',
  sssNumber: '34-1234567-8',
  pagibigNumber: '1234-5678-9012',
  philhealthNumber: '12-345678901-2',
  dateJoined: '2023-05-03',
  capitalShare: 20000,
  memberType: 'Regular',
}

const bytes = await stampDataSheet({ imageBytes, template, member })
await writeFile(new URL('_sample.pdf', forms), bytes)
console.log(`sample written — ${bytes.length} bytes`)
