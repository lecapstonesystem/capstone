import { useMembersStore } from '../stores/members'
import { useLoansStore } from '../stores/loans'
import { useAdminsStore } from '../stores/admins'
import { useLedgerStore } from '../stores/ledger'

/**
 * Shared activity-row mapping for the Dashboard's Recent Activity
 * card and the Activity Log module: dot colors per entity type, and
 * a human label for an audit row looked up in the live stores
 * ("KHS-0012 · Juan Dela Cruz" instead of a bare record id).
 */

export const KIND_META = {
  member: { bg: 'bg-green-500' },
  loan: { bg: 'bg-blue-500' },
  // App-filed loan requests are their own entity in audit_log but
  // belong to the Loans module — same blue dot as loans.
  loan_application: { bg: 'bg-blue-500' },
  application: { bg: 'bg-amber-500' },
  admin: { bg: 'bg-purple-500' },
  ledger: { bg: 'bg-gray-400' },
}

export function kindMeta(kind) {
  return KIND_META[kind] || KIND_META.ledger
}

/** Human label for an audit row, looked up in the live stores. */
export function auditLabel(row) {
  const id = String(row.entity_id)
  if (row.entity_type === 'member') {
    const member = useMembersStore().members.find((item) => String(item.id) === id)
    return member ? `${member.memberNo} · ${member.firstName} ${member.lastName}` : `Member #${id}`
  }
  if (row.entity_type === 'loan') {
    const loan = useLoansStore().loans.find((item) => String(item.id) === id)
    return loan ? `${loan.loanNo} · ${loan.memberName}` : `Loan #${id}`
  }
  if (row.entity_type === 'admin') {
    const admin = useAdminsStore().admins.find((item) => String(item.id) === id)
    return admin ? `${admin.firstName} ${admin.lastName}` : 'Admin account'
  }
  if (row.entity_type === 'ledger') {
    const txn = useLedgerStore().transactions.find((item) => String(item.id) === id)
    return txn ? `${txn.refNo} · ${txn.description}` : `Ledger entry #${id}`
  }
  if (row.entity_type === 'loan_application') {
    // A decision on an app-filed request — name the member who filed it,
    // in the same "record no · name" style as the other rows. Without a
    // branch here the raw audit_log value printed as the bold label,
    // which read like a database string instead of plain language.
    const request = useLoansStore().requests.find((item) => String(item.id) === id)
    if (request?.memberNo) return `${request.memberNo} · ${request.memberName || 'Member'}`
    if (request?.memberName) return request.memberName
    return 'Loan request'
  }
  if (row.entity_type === 'application') return 'Registration application'
  // Unknown future type — at worst read as words, never as a table name.
  const words = String(row.entity_type || 'record').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "Oct 18, 10:42 AM" — the activity feed's timestamp format. */
export function formatDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
