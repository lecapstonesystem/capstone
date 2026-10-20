import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { uploadDocumentPhoto, removeDocumentPhoto } from '../lib/documents'
import { randomPassword } from '../utils/password'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useAuditStore } from './audit'
import { useAuthStore } from './auth'

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
 * Credentials: login_enabled gates the member app login; the real
 * credential lives in Supabase Auth, created by issueTempPassword()
 * (signUp + auth_uid link) or by the app's own registration —
 * temp_password / must_change_password are 04's legacy display
 * columns.
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
  const value = String(row.name || '').trim()
  // Legacy rows keep the whole name in `name`. Philippine records are
  // usually written surname-first — "Macayan, Nenita" — so the part
  // before the comma is the LAST name; splitting on spaces instead
  // would swap the two (visible on the Members' Data Sheet print).
  if (value.includes(',')) {
    const [last, ...rest] = value.split(',')
    return { first: rest.join(',').trim(), last: last.trim() }
  }
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] || '', last: '' }
  // "Juan Dela Cruz" -> first "Juan", last "Dela Cruz"
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function rowToMember(row, capitals = new Map(), entries = new Map()) {
  const names = splitName(row)
  return {
    id: row.member_id,
    memberNo: row.member_no || '',
    firstName: names.first,
    lastName: names.last,
    middleName: row.middle_name || '',
    memberType: titleCase(row.member_type) || 'Regular',
    gender: titleCase(row.gender),
    dateOfBirth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : '',
    civilStatus: row.civil_status || '',
    spouseName: row.spouse_name || '',
    landline: row.landline || '',
    govIdType: row.gov_id_type || '',
    govIdNumber: row.government_id || '',
    tinNumber: row.tin_number || '',
    gsisNumber: row.gsis_number || '',
    sssNumber: row.sss_number || '',
    pagibigNumber: row.pagibig_number || '',
    philhealthNumber: row.philhealth_number || '',
    email: row.email || '',
    // Work / office address from the paper sheet (e.g. DepEd) — a
    // record only. Login, resets and duplicate checks use `email`.
    workEmail: row.work_email || '',
    phone: row.contact_number || '',
    address: row.address || '',
    status: titleCase(row.status) || 'Active',
    dateJoined: (row.date_joined || '').slice(0, 10),
    capitalShare: capitals.get(row.member_id) || 0,
    capitalEntries: entries.get(row.member_id) || [],
    // Storage path of the member's profile photo (member-documents
    // bucket); PhotoPreview signs a URL to display it.
    idPhoto: row.id_photo_url || '',
    account: {
      loginEnabled: row.login_enabled !== false,
      mustChangePassword: row.must_change_password === true,
      tempPassword: row.temp_password || null,
      // A linked Auth account means the member can already sign in to
      // the app (created at app registration or by Issue Credentials).
      hasLogin: Boolean(row.auth_uid),
    },
    // Registration-queue timeline kept on the member row (15) —
    // merged with the audit_log trail in fetchMembers().
    appEvents: Array.isArray(row.app_events) ? row.app_events : [],
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
    gender: data.gender || null,
    date_of_birth: data.dateOfBirth || null,
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
    work_email: data.workEmail || null,
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

  // Search matches name, member number, or either email; status filter applies on top
  const filteredMembers = computed(() => {
    const query = search.value.trim().toLowerCase()
    const filtered = members.value.filter((member) => {
      const matchesStatus = statusFilter.value === 'All' || member.status === statusFilter.value
      const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        member.memberNo.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.workEmail.toLowerCase().includes(query)
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

  // Newest first — kept on the row for display and written to the
  // audit_log table in the background (see stores/audit.js).
  function logAction(member, action) {
    if (!member.history) member.history = []
    member.history.unshift(useAuditStore().record('member', member.id, action))
  }

  // detailMember holds a direct reference to the row object, so
  // update in place — replacing the object would freeze the drawer.
  function replaceLocal(updated) {
    const current = members.value.find((item) => item.id === updated.id)
    if (!current) return null
    updated.history = current.history || []
    // Capital entries are loaded with the list, not with the row that an
    // update returns — keep what the drawer already shows.
    if (!updated.capitalEntries?.length) {
      updated.capitalEntries = current.capitalEntries || []
    }
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
        supabase.from('share_capital').select('share_id, member_id, amount, date_recorded'),
      ])
      if (membersRes.error) throw membersRes.error
      const capitals = new Map()
      const entries = new Map()
      if (!capitalRes.error) {
        for (const row of capitalRes.data || []) {
          capitals.set(row.member_id, (capitals.get(row.member_id) || 0) + Number(row.amount || 0))
          const list = entries.get(row.member_id) || []
          list.push({
            shareId: row.share_id,
            amount: Number(row.amount || 0),
            date: row.date_recorded || '',
          })
          list.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.shareId - a.shareId)
          entries.set(row.member_id, list)
        }
      }
      members.value = (membersRes.data || []).map((row) => rowToMember(row, capitals, entries))
      // Fill each member's Activity list from the durable audit
      // trail, merged with the registration timeline kept on the
      // row itself — newest first.
      const histories = await useAuditStore().loadHistories(
        'member',
        members.value.map((member) => String(member.id)),
      )
      members.value.forEach((member) => {
        const fromAudit = histories.get(String(member.id)) || []
        member.history = [...fromAudit, ...member.appEvents].sort(
          (a, b) => new Date(b.at) - new Date(a.at),
        )
      })
    } catch (error) {
      lastError.value = errorMessage(error)
      members.value = []
    } finally {
      loading.value = false
    }
  }

  // Both save actions return an error message (or null) so the form
  // can stay open and show it — the view has no toast layer.
  // One-off load for printing a member's data sheet from the
  // Registrations module — the row plus its capital share, mapped
  // exactly like fetchMembers does.
  async function loadMemberForPrint(memberId) {
    const [{ data: row, error }, { data: shares }] = await Promise.all([
      supabase.from('member').select('*').eq('member_id', memberId).single(),
      supabase.from('share_capital').select('amount').eq('member_id', memberId),
    ])
    if (error) return { ok: false, message: errorMessage(error) }
    const total = (shares || []).reduce((sum, share) => sum + (Number(share.amount) || 0), 0)
    return { ok: true, member: rowToMember(row, new Map([[memberId, total]]), new Map()) }
  }

  // One email = one member: the app login is keyed by email, so a
  // duplicate would hand the wrong account to the wrong person.
  // Checked against the loaded list, case-insensitive.
  function emailClash(email, exceptId) {
    const target = String(email || '')
      .trim()
      .toLowerCase()
    if (!target) return false
    return members.value.some(
      (item) =>
        item.id !== exceptId &&
        String(item.email || '')
          .trim()
          .toLowerCase() === target,
    )
  }

  async function addMember(data) {
    if (emailClash(data.email)) {
      return 'Another member already uses this email address. Each member needs their own — the app login uses it as the username.'
    }
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
    if (emailClash(data.email, id)) {
      return 'Another member already uses this email address. Each member needs their own — the app login uses it as the username.'
    }
    // The login credential lives in Supabase Auth, where a browser
    // cannot touch it. Moving only member.email would leave the portal
    // and the login out of sync: the app would still accept the old
    // address, and reset links would target an address with no account
    // behind it. Refuse the edit and point at the reference script.
    const nextEmail = String(data.email ?? '')
      .trim()
      .toLowerCase()
    const wasEmail = String(current.email ?? '')
      .trim()
      .toLowerCase()
    if (current.account.hasLogin && nextEmail !== wasEmail) {
      return 'This member already has an app login — the app signs in with the email on that login, so changing it here would leave the portal and the login out of sync. Use the reference script database/reference_manual_member_email_change.sql to change it.'
    }
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

  /**
   * Create the member's APP login. The temp_password column is
   * display-only (04) — the real credential lives in Supabase Auth:
   *
   * - No auth account yet (walk-in member): signUp() the login with a
   *   one-time password, link auth_uid to the member row, then put the
   *   admin's session back — the same dance as addAdmin in admins.js.
   *   The password is returned in memory only and shown once.
   * - Login already exists (app-registered member): a browser cannot
   *   set another user's password (that needs the service key), so
   *   fall back to emailing a password-reset link — the member opens
   *   it and chooses their own password.
   */
  async function issueTempPassword(id) {
    const current = members.value.find((item) => item.id === id)
    if (!current) return { ok: false, message: 'Member not found.' }
    lastError.value = ''

    const email = String(current.email || '')
      .trim()
      .toLowerCase()
    if (!email || !email.includes('@') || !email.includes('.')) {
      return {
        ok: false,
        message:
          "Add the member's personal email first — the app login uses it as the username (not the DepEd address).",
      }
    }

    // Login already exists → only Supabase can reset its password:
    // email the member a sign-in link instead.
    if (current.account.hasLogin) {
      return sendMemberResetLink(email)
    }

    const tempPassword = randomPassword()

    // 1. Remember the acting admin's session so we can put it back.
    const { data: sessionData } = await supabase.auth.getSession()
    const previous = sessionData?.session

    // 2. Create the Supabase Auth login with the one-time password.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
    })

    if (signUpError) {
      const message = String(signUpError.message || '').toLowerCase()
      if (message.includes('already registered') || message.includes('already been registered')) {
        // Email exists in Auth but isn't linked to this member row.
        return sendMemberResetLink(email)
      }
      if (message.includes('rate limit')) {
        return { ok: false, message: 'Too many attempts. Wait a minute, then try again.' }
      }
      console.error('[UCMS] member login signup failed:', signUpError)
      lastError.value = errorMessage(signUpError)
      return {
        ok: false,
        message:
          'Could not create the login. Make sure "Confirm email" is switched off in the Supabase dashboard (Authentication → Providers → Email), then try again.',
      }
    }

    const newUser = signUpData?.user
    // Enumeration guard: an already-used email answers with a user that
    // has no identities instead of an error.
    if (!newUser || (Array.isArray(newUser.identities) && newUser.identities.length === 0)) {
      return sendMemberResetLink(email)
    }

    // 3. Put the admin's session back (auto-confirm swapped it for the
    //    new user's).
    if (previous && signUpData?.session) {
      try {
        await supabase.auth.setSession({
          access_token: previous.access_token,
          refresh_token: previous.refresh_token,
        })
      } catch (error) {
        console.error('[UCMS] could not restore admin session after member signup:', error)
        return {
          ok: false,
          message:
            'The login was created, but your session was interrupted. Sign out and back in, then use Reset Password on this member to email a sign-in link.',
        }
      }
    }

    // 4. Link the login to the member row (runs as the admin, so RLS
    //    passes).
    const { data: row, error: updateError } = await supabase
      .from('member')
      .update({
        auth_uid: newUser.id,
        login_enabled: true,
      })
      .eq('member_id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[UCMS] linking member login failed:', updateError)
      lastError.value = errorMessage(updateError)
      return {
        ok: false,
        message: `${errorMessage(updateError)} The login itself exists — use Reset Password on this member to email a sign-in link.`,
      }
    }

    const updated = replaceLocal(rowToMember(row, keepCapital(current)))
    if (updated) logAction(updated, 'App login created — temporary password issued')
    return { ok: true, tempPassword }
  }

  // Email a password-reset link to the member (used when the email
  // already belongs to an Auth account, so the password can't be set
  // from here). Same path as the admin reset emails.
  async function sendMemberResetLink(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      lastError.value = errorMessage(error)
      return { ok: false, message: errorMessage(error) }
    }
    const current = members.value.find((item) => String(item.email || '').toLowerCase() === email)
    if (current) logAction(current, 'Password reset — sign-in link emailed to the member')
    return {
      ok: true,
      notice: `A sign-in link was emailed to ${email}. Have the member open it and choose a new password.`,
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
    const { data: row, error } = await supabase
      .from('share_capital')
      .insert({
        member_id: id,
        amount,
        date_recorded: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()
    if (error) {
      lastError.value = errorMessage(error)
      return false
    }
    current.capitalShare = (current.capitalShare || 0) + amount
    current.capitalEntries = [
      { shareId: row.share_id, amount: Number(amount), date: row.date_recorded || '' },
      ...(current.capitalEntries || []),
    ]
    logAction(current, `Capital contribution — ₱${amount.toLocaleString('en-PH')}`)
    return true
  }

  // Capital corrections are bookkeeping, not member-record deletion:
  // the mistaken contribution row is removed, but the removal itself
  // is written to the audit trail with the typed reason, so the
  // coop's who-did-what history stays intact (RA 9520 / AMLA).
  async function removeCapital(id, entry, reason) {
    const current = members.value.find((item) => item.id === id)
    if (!current || !entry) {
      return { ok: false, message: 'Contribution not found. Close and reopen the member details.' }
    }
    const { error } = await supabase.from('share_capital').delete().eq('share_id', entry.shareId)
    if (error) {
      lastError.value = errorMessage(error)
      return { ok: false, message: errorMessage(error) }
    }
    current.capitalEntries = (current.capitalEntries || []).filter(
      (item) => item.shareId !== entry.shareId,
    )
    current.capitalShare = Number(((current.capitalShare || 0) - entry.amount).toFixed(2))
    logAction(
      current,
      `Capital contribution removed — ₱${entry.amount.toLocaleString('en-PH')} (reason: ${reason})`,
    )
    return { ok: true }
  }

  // ---------- Profile photo (staff upload from the portal) ----------
  // Walk-in members never go through the app, so their picture is
  // taken at the desk and uploaded here — counter staff match the
  // face to the record. Both actions leave an audit note;
  // replacing/removing also deletes the old file from storage
  // (best-effort — the row is the truth).
  async function uploadIdPhoto(id, file) {
    const current = members.value.find((item) => item.id === id)
    if (!current) {
      return { ok: false, message: 'Member not found. Refresh the page and try again.' }
    }
    const uploaded = await uploadDocumentPhoto(file)
    if (!uploaded.ok) return uploaded
    const { error } = await supabase
      .from('member')
      .update({ id_photo_url: uploaded.path })
      .eq('member_id', id)
    if (error) {
      removeDocumentPhoto(uploaded.path) // no orphan files
      return { ok: false, message: errorMessage(error) }
    }
    const previous = current.idPhoto
    current.idPhoto = uploaded.path
    logAction(current, previous ? 'Profile photo replaced' : 'Profile photo uploaded')
    if (previous) removeDocumentPhoto(previous)
    return { ok: true }
  }

  async function removeIdPhoto(id) {
    const current = members.value.find((item) => item.id === id)
    if (!current || !current.idPhoto) return { ok: true }
    const previous = current.idPhoto
    const { error } = await supabase
      .from('member')
      .update({ id_photo_url: null })
      .eq('member_id', id)
    if (error) return { ok: false, message: errorMessage(error) }
    current.idPhoto = ''
    logAction(current, 'Profile photo removed')
    removeDocumentPhoto(previous)
    return { ok: true }
  }

  // Cooperatives must keep member records (RA 9520, AMLA), so the
  // portal offers Suspend/Drop only for real members. The one
  // exception is the developer-only TEST-data cleanup below: triple-
  // gated by the Developer role (RLS — 22_developer_role.sql), a
  // typed member number in the portal, and a line in the audit log.
  // It mirrors database/reference_manual_member_delete.sql (no FK
  // cascades — children first). audit_log is never touched: the
  // trail stays even after the test rows are gone.

  // Depth-first listing of a storage prefix — a member's folder can
  // nest (loan-apps/2/...). item.id is set on files, absent on folders.
  async function collectStorageFolder(bucket, prefix, out) {
    const { data } = await supabase.storage.from(bucket).list(prefix)
    for (const item of data || []) {
      const path = `${prefix}/${item.name}`
      if (item.id) out.push(path)
      else await collectStorageFolder(bucket, path, out)
    }
  }

  async function deleteTestMember(member) {
    const auth = useAuthStore()
    if (!auth.isDeveloper) {
      return { ok: false, message: 'Only the Developer role can delete test data.' }
    }

    // Storage paths must be collected while the rows still exist.
    const { data: loanRows, error: loanError } = await supabase
      .from('loan')
      .select('loan_id')
      .eq('member_id', member.id)
    if (loanError) return { ok: false, message: errorMessage(loanError) }
    const loanIds = (loanRows || []).map((row) => row.loan_id)
    const loanFilter = loanIds.length ? `,loan_id.in.(${loanIds.join(',')})` : ''

    const paths = new Set()
    const [atts, pays, fresh] = await Promise.all([
      supabase.from('attachment').select('file_path').or(`member_id.eq.${member.id}${loanFilter}`),
      supabase
        .from('payment')
        .select('receipt_image_url')
        .or(`member_id.eq.${member.id}${loanFilter}`),
      supabase.from('member').select('auth_uid, id_photo_url').eq('member_id', member.id).single(),
    ])
    for (const row of atts.data || []) if (row.file_path) paths.add(row.file_path)
    for (const row of pays.data || []) if (row.receipt_image_url) paths.add(row.receipt_image_url)
    if (fresh.data?.id_photo_url) paths.add(fresh.data.id_photo_url)

    // Rows, child-first — the reference script's order.
    const steps = [
      [
        'attachment',
        supabase.from('attachment').delete().or(`member_id.eq.${member.id}${loanFilter}`),
      ],
      ['co_maker', supabase.from('co_maker').delete().or(`member_id.eq.${member.id}${loanFilter}`)],
      ['payment', supabase.from('payment').delete().or(`member_id.eq.${member.id}${loanFilter}`)],
      ['loan_application', supabase.from('loan_application').delete().eq('member_id', member.id)],
      ['share_capital', supabase.from('share_capital').delete().eq('member_id', member.id)],
      // Notifications cascade with the member, but deleting their loans
      // first would null notification.loan_id — and the content-freeze
      // trigger rejects that system change. Clear the inbox first.
      ['notification', supabase.from('notification').delete().eq('member_id', member.id)],
      ['loan', supabase.from('loan').delete().eq('member_id', member.id)],
      ['member', supabase.from('member').delete().eq('member_id', member.id)],
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

    // The member's whole storage folder, plus every collected path —
    // best-effort: leftover files are inert, so hiccups are warnings.
    let storageFailed = false
    const folderPaths = []
    if (fresh.data?.auth_uid) {
      await collectStorageFolder('member-documents', fresh.data.auth_uid, folderPaths)
      for (const path of folderPaths) paths.add(path)
    }
    if (paths.size) {
      const { error } = await supabase.storage.from('member-documents').remove([...paths])
      storageFailed = Boolean(error)
    }

    useAuditStore().record(
      'member',
      member.id,
      `Test member deleted (developer) — ${member.memberNo} ${member.name}`,
    )
    members.value = members.value.filter((item) => item.id !== member.id)
    return { ok: true, storageFailed }
  }

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
    loadMemberForPrint,
    setStatus,
    issueTempPassword,
    setLoginEnabled,
    addCapital,
    removeCapital,
    uploadIdPhoto,
    removeIdPhoto,
    // Suspend/Drop stays the normal path for real members;
    // deleteTestMember is the developer-only escape hatch for TEST
    // data (typed confirmation in the view, role gated by 22).
    deleteTestMember,
  }
})
