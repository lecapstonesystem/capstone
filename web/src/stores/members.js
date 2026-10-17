import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { randomPassword } from '../utils/password'
import { toggleSort, sortRows } from '../utils/tableSort'

/**
 * Members store — live Supabase data (swapped from mocks).
 *
 * Account management model (unchanged):
 *   Active    — full member, can log into the mobile app
 *   Suspended — temporarily blocked (login disabled), reversible
 *   Dropped   — member left / archived, record is kept forever
 *
 * Cooperatives must keep member records, so permanent deletion is a
 * last resort — the UI pushes suspend/drop instead.
 *
 * Mapping to public.member (database/03 + 04):
 *   phone -> contact_number, govIdNumber -> government_id.
 *   The seed wrote only member_id/name/date_joined, so first/middle/
 *   last fall back to splitting `name` until a form edit writes all
 *   four name columns together (03's contract). member_no is NULL on
 *   seeded rows — database/09_backfill_member_no.sql fills them, and
 *   generateMemberNo floors at max(member_id) either way.
 *   status/member_type are stored lowercase by DEFAULT but matched
 *   Title Case in the UI — normalized on read, written Title Case.
 *   Registration-queue applicants (member rows in Pending / Under
 *   Review / Returned / Rejected — 15_registration_queue.sql) are
 *   excluded from this store: they are not members until the
 *   Applications module approves them (status Active).
 *
 * capitalShare lives in share_capital (sum of amount), read in a
 * second query and summed client-side.
 *
 * Credentials (login_enabled / must_change_password / temp_password)
 * are 04's TRANSITIONAL columns: persisted now, dropped when member
 * logins move to Supabase Auth through the backend.
 *
 * history has no table yet — logAction appends client-side, so the
 * activity list lives until the page reloads.
 */

// --- row <-> store mapping ------------------------------------

function titleCase(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function splitName(row) {
  if (row.first_name || row.last_name) {
    return { first: row.first_name || '', last: row.last_name || '' }
  }
  const parts = String(row.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] || '', last: '' }
  // "Juan Dela Cruz" -> first "Juan", last "Dela Cruz"
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function rowToMember(row, capitals) {
  const names = splitName(row)
  return {
    id: row.member_id,
    memberNo: row.member_no || '',
    firstName: names.first,
    lastName: names.last,
    middleName: row.middle_name || '',
    memberType: titleCase(row.member_type) || 'Regular',
    civilStatus: row.civil_status || '',
    spouseName: row.spouse_name || '',
    landline: row.landline || '',
    govIdType: row.gov_id_type || '',
    govIdNumber: row.government_id || '',
    gsisNumber: row.gsis_number || '',
    sssNumber: row.sss_number || '',
    pagibigNumber: row.pagibig_number || '',
    philhealthNumber: row.philhealth_number || '',
    email: row.email || '',
    phone: row.contact_number || '',
    address: row.address || '',
    status: titleCase(row.status) || 'Active',
    dateJoined: (row.date_joined || '').slice(0, 10),
    capitalShare: capitals.get(row.member_id) || 0,
    account: {
      loginEnabled: row.login_enabled !== false,
      mustChangePassword: row.must_change_password === true,
      tempPassword: row.temp_password || null,
    },
    history: [],
  }
}

// The app writes all four name columns together; `name` keeps the
// composed full name that reports and the backend read.
function toRow(data) {
  const fullName = [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ')
  const row = {
    name: fullName || 'Member',
    first_name: data.firstName || null,
    middle_name: data.middleName || null,
    last_name: data.lastName || null,
    member_type: data.memberType || 'Regular',
    civil_status: data.civilStatus || null,
    spouse_name: data.spouseName || null,
    landline: data.landline || null,
    gov_id_type: data.govIdType || null,
    government_id: data.govIdNumber || null,
    gsis_number: data.gsisNumber || null,
    sss_number: data.sssNumber || null,
    pagibig_number: data.pagibigNumber || null,
    philhealth_number: data.philhealthNumber || null,
    email: data.email || null,
    contact_number: data.phone || null,
    address: data.address || null,
    status: data.status || 'Active',
    date_joined: data.dateJoined || new Date().toISOString().slice(0, 10),
  }
  if (data.memberNo) row.member_no = data.memberNo
  return row
}

export const useMembersStore = defineStore('members', () => {
  const members = ref([])
  const loading = ref(false)
  const lastError = ref('')
  const search = ref('')
  const statusFilter = ref('All')

  // Column sorting — header click toggles ascending/descending (SortableTh)
  const sortKey = ref('memberNo')
  const sortDir = ref('asc')
  const accessors = {
    memberNo: (member) => member.memberNo,
    name: (member) => `${member.firstName} ${member.lastName}`,
    contact: (member) => member.phone,
    address: (member) => member.address,
    status: (member) => member.status,
    dateJoined: (member) => member.dateJoined,
  }

  // Search matches name, member number, or email; status filter applies on top
  const filteredMembers = computed(() => {
    const query = search.value.trim().toLowerCase()
    const filtered = members.value.filter((member) => {
      const matchesStatus = statusFilter.value === 'All' || member.status === statusFilter.value
      const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        member.memberNo.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
    return sortRows(filtered, sortKey.value, sortDir.value, accessors)
  })

  const totalCount = computed(() => members.value.length)

  const activeCount = computed(
    () => members.value.filter((member) => member.status === 'Active').length,
  )

  // Pagination
  const page = ref(1)
  const pageSize = ref(10)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(filteredMembers.value.length / pageSize.value)),
  )

  const paginatedMembers = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return filteredMembers.value.slice(start, start + pageSize.value)
  })

  function setPage(newPage) {
    page.value = Math.min(Math.max(1, newPage), totalPages.value)
  }

  function setPageSize(size) {
    pageSize.value = size
    page.value = 1
  }

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
    page.value = 1 // sorting restarts from the first page
  }

  function sortState(key) {
    return sortKey.value === key ? sortDir.value : null
  }

  // New search/filter results always start from page 1
  watch([search, statusFilter], () => {
    page.value = 1
  })

  // If the current page no longer exists (e.g. after a delete), step back
  watch(totalPages, (count) => {
    if (page.value > count) page.value = count
  })

  // KHS-0001, KHS-0002, ... — highest printed number, floored at the
  // highest member_id so NULL member_no rows can't collide.
  function generateMemberNo() {
    let max = 0
    for (const member of members.value) {
      const fromNo = Number.parseInt(String(member.memberNo || '').split('-')[1], 10)
      if (Number.isFinite(fromNo)) max = Math.max(max, fromNo)
      max = Math.max(max, Number(member.id) || 0)
    }
    return `KHS-${String(max + 1).padStart(4, '0')}`
  }

  // Newest first — client-side only until audit history gets a table
  function logAction(member, action) {
    if (!member.history) member.history = []
    member.history.unshift({ at: new Date().toISOString(), action, by: 'Admin' })
  }

  // detailMember holds a direct reference to the row object, so
  // update in place — replacing the object would freeze the drawer.
  function replaceLocal(updated) {
    const current = members.value.find((item) => item.id === updated.id)
    if (!current) return null
    updated.history = current.history || []
    Object.assign(current, updated)
    return current
  }

  function keepCapital(member) {
    return new Map([[member.id, member.capitalShare || 0]])
  }

  async function fetchMembers() {
    loading.value = true
    lastError.value = ''
    try {
      const [membersRes, capitalRes] = await Promise.all([
        supabase
          .from('member')
          .select('*')
          // Registration-queue rows (15) are applicants, not members —
          // the Applications module owns them until approval flips
          // them to Active. Seeds store lowercase statuses; queue
          // rows are always written Title Case.
          .not('status', 'in', '("Pending","Under Review","Returned","Rejected")')
          .order('member_id', { ascending: true }),
        supabase.from('share_capital').select('member_id, amount'),
      ])
      if (membersRes.error) throw membersRes.error
      const capitals = new Map()
      if (!capitalRes.error) {
        for (const row of capitalRes.data || []) {
          capitals.set(row.member_id, (capitals.get(row.member_id) || 0) + Number(row.amount || 0))
        }
      }
      members.value = (membersRes.data || []).map((row) => rowToMember(row, capitals))
    } catch (error) {
      lastError.value = errorMessage(error)
      members.value = []
    } finally {
      loading.value = false
    }
  }

  // Both save actions return an error message (or null) so the form
  // can stay open and show it — the view has no toast layer.
  async function addMember(data) {
    const { data: row, error } = await supabase
      .from('member')
      .insert({
        ...toRow({ ...data, memberNo: generateMemberNo() }),
        login_enabled: true,
        must_change_password: false,
      })
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return lastError.value
    }
    const member = rowToMember(row, new Map())
    members.value.push(member)
    logAction(member, 'Member registered face-to-face')
    return null
  }

  async function updateMember(id, data) {
    const current = members.value.find((item) => item.id === id)
    if (!current) return 'Member not found.'
    const { data: row, error } = await supabase
      .from('member')
      .update(toRow(data))
      .eq('member_id', id)
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return lastError.value
    }
    replaceLocal(rowToMember(row, keepCapital(current)))
    return null
  }

  // Lifecycle: every change is logged and keeps the record
  async function setStatus(id, status) {
    const current = members.value.find((item) => item.id === id)
    if (!current || current.status === status) return
    const patch = { status, login_enabled: status === 'Active' }
    if (status !== 'Active') patch.must_change_password = false
    const { data: row, error } = await supabase
      .from('member')
      .update(patch)
      .eq('member_id', id)
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return
    }
    const updated = replaceLocal(rowToMember(row, keepCapital(current)))
    if (updated) logAction(updated, `Status changed to ${status}`)
  }

  // Generates a temp password (first issue) or replaces it (reset)
  async function issueTempPassword(id) {
    const current = members.value.find((item) => item.id === id)
    if (!current) return
    const alreadyIssued = Boolean(current.account.tempPassword)
    const { data: row, error } = await supabase
      .from('member')
      .update({
        temp_password: randomPassword(),
        must_change_password: true,
        login_enabled: true,
      })
      .eq('member_id', id)
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return
    }
    const updated = replaceLocal(rowToMember(row, keepCapital(current)))
    if (updated) {
      logAction(
        updated,
        alreadyIssued
          ? 'Password reset — new temporary password issued'
          : 'Credentials issued — temporary password set',
      )
    }
  }

  async function setLoginEnabled(id, enabled) {
    const current = members.value.find((item) => item.id === id)
    if (!current) return
    const { data: row, error } = await supabase
      .from('member')
      .update({ login_enabled: enabled })
      .eq('member_id', id)
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return
    }
    const updated = replaceLocal(rowToMember(row, keepCapital(current)))
    if (updated) logAction(updated, enabled ? 'Login re-enabled' : 'Login disabled')
  }

  // Capital contribution — the client's "capital share" (15k new / 20k old
  // minimum, paid in staggered amounts). The Loans module uses 2× capital
  // share as the loan ceiling. Each payment is one share_capital row; the
  // member's capital is their sum. (Future: also a Ledger income entry.)
  async function addCapital(id, amount) {
    const current = members.value.find((item) => item.id === id)
    if (!current || !(amount > 0)) return false
    const { error } = await supabase.from('share_capital').insert({
      member_id: id,
      amount,
      date_recorded: new Date().toISOString().slice(0, 10),
    })
    if (error) {
      lastError.value = errorMessage(error)
      return false
    }
    current.capitalShare = (current.capitalShare || 0) + amount
    logAction(current, `Capital contribution — ₱${amount.toLocaleString('en-PH')}`)
    return true
  }

  // No deleteMember: cooperatives must keep member records (RA 9520,
  // AMLA), so the portal offers Suspend/Drop only — both keep the
  // row. Permanent deletion is a deliberate backend action (service_role
  // / SQL), never a click here.

  // Load once, when the store is first used (MembersView mounts).
  fetchMembers()

  return {
    members,
    loading,
    lastError,
    fetchMembers,
    search,
    statusFilter,
    filteredMembers,
    sortKey,
    sortDir,
    setSort,
    sortState,
    totalCount,
    activeCount,
    page,
    pageSize,
    totalPages,
    paginatedMembers,
    setPage,
    setPageSize,
    addMember,
    updateMember,
    setStatus,
    issueTempPassword,
    setLoginEnabled,
    addCapital,
    // deleteMember intentionally absent — see note above
  }
})
