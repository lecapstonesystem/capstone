/**
 * db-probe.mjs — what can this key actually see and do?
 *
 * Runs read/write probes against every UCMS table using only the public
 * publishable key, exactly like the browser bundle would. Nothing is left
 * behind: inserted probe rows are deleted again.
 *
 *   node scripts/db-probe.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env'), 'utf8')
const get = (name) =>
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith(name))
    ?.slice(name.length + 1)
    .trim()

const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'))

const results = []
async function probe(label, fn) {
  try {
    const { data, error } = await fn()
    if (error) {
      results.push([label, 'BLOCKED', `${error.code ?? ''} ${error.message}`])
    } else {
      results.push([label, 'OPEN', JSON.stringify(data)])
    }
  } catch (e) {
    results.push([label, 'THREW', e.message])
  }
}

// --- reads: does the key get rows, an empty set, or a permission error? ---
const tables = [
  'member',
  'loan',
  'loan_application',
  'payment',
  'share_capital',
  'co_maker',
  'dividend',
  'admin',
  'ledger',
  'audit_log',
  'report',
]
for (const t of tables) await probe(`READ  ${t}`, () => db.from(t).select('*').limit(3))

// --- writes: can an anonymous visitor create rows? (RLS/grant check) ---
await probe('WRITE admin   (probe row)', () =>
  db.from('admin').insert({ name: 'PROBE', role: 'probe', email: 'probe@localhost' }).select(),
)
await probe('WRITE member  (probe row)', () =>
  db
    .from('member')
    .insert({
      name: 'PROBE MEMBER',
      member_no: 'PROBE-000',
      date_joined: '2026-01-01',
      status: 'Dropped',
    })
    .select(),
)

// --- the four tables 02_rls_policies.sql never mentions: are they open? ---
await probe('WRITE ledger    (probe row)', () =>
  db
    .from('ledger')
    .insert({ date: '2026-01-01', type: 'PROBE', description: 'probe', amount: 0, admin_id: 1 })
    .select(),
)
await probe('WRITE audit_log (probe row)', () =>
  db
    .from('audit_log')
    .insert({ admin_id: 1, action: 'PROBE', module: 'probe', timestamp: '2026-01-01T00:00:00' })
    .select(),
)
await probe('WRITE report    (probe row)', () =>
  db.from('report').insert({ type: 'PROBE', date_generated: '2026-01-01', admin_id: 1 }).select(),
)

// --- clean up anything the probes managed to write ---
await db.from('admin').delete().eq('name', 'PROBE')
await db.from('member').delete().eq('member_no', 'PROBE-000')
await db.from('ledger').delete().eq('type', 'PROBE')
await db.from('audit_log').delete().eq('action', 'PROBE')
await db.from('report').delete().eq('type', 'PROBE')
const counts = await Promise.all([
  db.from('admin').select('admin_id', { count: 'exact', head: true }),
  db.from('member').select('member_id', { count: 'exact', head: true }),
  db.from('ledger').select('ledger_id', { count: 'exact', head: true }),
  db.from('audit_log').select('log_id', { count: 'exact', head: true }),
  db.from('report').select('report_id', { count: 'exact', head: true }),
])
const leftover = counts.map((c) => c.count ?? '?').join('/')

const pad = (s, n) => s.padEnd(n)
console.log(`\n${pad('PROBE', 30)}${pad('RESULT', 10)}DETAIL`)
console.log('-'.repeat(110))
for (const [label, status, detail] of results)
  console.log(`${pad(label, 30)}${pad(status, 10)}${detail}`)
console.log('-'.repeat(110))
console.log(`cleanup: admin/member/ledger/audit_log/report counts = ${leftover} (all 0 = clean)\n`)
