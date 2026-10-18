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
  return row.entity_type
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
