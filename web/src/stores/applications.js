import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { randomPassword } from '../utils/password'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useMembersStore } from './members'
import { uploadDocumentPhoto, removeDocumentPhoto } from '../lib/documents'

/**
 * Applications store — live Supabase data (swapped from mocks).
 *
 * The queue is the member REGISTRATION queue and lives on `member`
 * itself (15_registration_queue.sql): an applicant is a member row
 * in a review status. It is NOT the `loan_application` table — that
 * one holds LOAN requests filed by existing members (Flutter app
 * flow 2) and belongs with the Loans module.
 *
 * Client rule: there is NO online registration. Two ways in:
 *   1. 🚶 Walk-in — an admin types the applicant's details here
 *   2. 📱 Flutter app — the app inserts the member row directly
 *      with status 'Pending' + app_source 'App' + the profile photo
 *      (13_app_documents.sql / docs/flutter_app_contract.md)
 *
 * Status lifecycle (member.status):
 *   Pending → Under Review → Active | Returned | Rejected
 *   Returned → Under Review (applicant resubmits, admin re-reviews)
 *   Active = approved — the row becomes a real member (KHS-####).
 *
 * Member/applicant split (both stores fetch `member`):
 *   - members store EXCLUDES review statuses — queue rows are not
 *     members yet and never appear in Members, Loans dropdowns, or
 *     the Dashboard member counts.
 *   - this store keeps review statuses + approved rows (Active WITH
 *     app_events), so approved applications stay on file with their
 *     checklist and timeline.
 *
 * approveApplication() runs the whole approval in one UPDATE:
 * status Active, member_no = KHS-#### derived from member_id (09's
 * backfill rule), date_joined = approval day, temp password +
 * forced first-login change — then refreshes the Members store so
 * the new member appears immediately.
 *
 * app_events is the persisted review timeline [{at, action, by}],
 * newest first — the review modal and Dashboard Recent Activity
 * read it. The "received" entry is synthesized from created_at for
 * Flutter-filed rows (the app only writes the row itself).
 *
 * Actions return { ok, message? } and ApplicationsView awaits them;
 * the dialogs stay open and show message on failure.
 */

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
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// APP-0001, APP-0002, ... — same pad-4 convention as KHS-/LDG-.
function appNoOf(memberId) {
  return `APP-${String(memberId).padStart(4, '0')}`
}

// Requirements checked before approval — 15's app_checklist default
// stores the same four items, so this is only a fallback.
function defaultChecklist() {
  return [
    { label: 'Signed application form', checked: false },
    { label: 'Photocopy of valid ID', checked: false },
    { label: '1x1 photo', checked: false },
    { label: 'Membership fee paid', checked: false },
  ]
}

// Review statuses = "not a member yet". Compared in lowercase so
// the filter survives any capitalization the database hands back.
const QUEUE_STATUSES = ['pending', 'under review', 'returned', 'rejected']

// Canonical labels for the UI — one place decides how each status
// is spelled, so chips, filters, and guards always agree.
const STATUS_LABELS = {
  pending: 'Pending',
  'under review': 'Under Review',
  active: 'Approved', // approved applicant = Active member row
  approved: 'Approved',
  returned: 'Returned',
  rejected: 'Rejected',
}

function rawStatus(row) {
  return String(row.status || '')
    .trim()
    .toLowerCase()
}

// Which member rows this queue shows: applicants under review, plus
// rows approved FROM this queue (they carry review events).
function isQueueRow(row) {
  const status = rawStatus(row)
  if (QUEUE_STATUSES.includes(status)) return true
  return status === 'active' && Array.isArray(row.app_events) && row.app_events.length > 0
}

// The UI speaks the application lifecycle: an approved applicant
// shows "Approved" — the same row is "Active" in the Members module.
function displayStatus(row) {
  return STATUS_LABELS[rawStatus(row)] || titleCase(row.status)
}

// created_at is a naive UTC timestamp column — mark it UTC so the
// browser shows the real local time instead of reading it 8 hours
// off (Manila). Fallback: noon of date_joined, which can't shift
// the displayed date a day either way.
function receivedAtOf(row) {
  if (row.created_at) return `${String(row.created_at).replace(/Z$/, '')}Z`
  if (row.date_joined) return `${row.date_joined}T12:00:00`
  return ''
}

// Newest first; the "received" entry is synthesized from created_at
// so Flutter-filed rows have a timeline before the admin acts.
function historyOf(row) {
  const events = [...(Array.isArray(row.app_events) ? row.app_events : [])].sort(
    (a, b) => new Date(b.at) - new Date(a.at),
  )
  const hasReceived = events.some((entry) =>
    String(entry.action || '').startsWith('Application received'),
  )
  if (!hasReceived) {
    events.push({
      at: receivedAtOf(row),
      action:
        row.app_source === 'App'
          ? 'Application received (via mobile app PDF)'
          : 'Application received (walk-in entry)',
      by: 'Admin',
    })
    events.sort((a, b) => new Date(b.at) - new Date(a.at))
  }
  return events
}

function rowToApplication(row) {
  const names = splitName(row)
  return {
    id: row.member_id,
    appNo: appNoOf(row.member_id),
    firstName: names.first,
    lastName: names.last,
    email: row.email || '',
    phone: row.contact_number || '',
    address: row.address || '',
    source: row.app_source === 'App' ? 'App' : 'Walk-in',
    // Storage path of the profile photo (app upload or staff
    // upload during review)
    idPhoto: row.id_photo_url || '',
    submittedAt: receivedAtOf(row),
    status: displayStatus(row),
    checklist: Array.isArray(row.app_checklist) ? row.app_checklist : defaultChecklist(),
    remarks: row.app_remarks || '',
    memberId: rawStatus(row) === 'active' ? row.member_id : null,
    memberNo: row.member_no || '',
    history: historyOf(row),
    // Raw newest-first timeline as stored — the base of the next
    // app_events update (the synthesized "received" entry is added
    // back by historyOf on every read).
    dbEvents: [...(Array.isArray(row.app_events) ? row.app_events : [])],
  }
}

export const useApplicationsStore = defineStore('applications', () => {
  const applications = ref([])
  const search = ref('')
  const statusFilter = ref('All')
  const loading = ref(false)
  const lastError = ref('')

  // Column sorting — header click toggles ascending/descending (SortableTh).
  // Default keeps the old order: newest application first.
  const sortKey = ref('submitted')
  const sortDir = ref('desc')
  const accessors = {
    appNo: (application) => application.appNo,
    applicant: (application) => `${application.firstName} ${application.lastName}`,
    source: (application) => application.source,
    submitted: (application) => application.submittedAt,
    status: (application) => application.status,
  }

  // Search matches applicant name or application number; status filter on top.
  const filteredApplications = computed(() => {
    const query = search.value.trim().toLowerCase()
    const filtered = applications.value.filter((application) => {
      const matchesStatus =
        statusFilter.value === 'All' || application.status === statusFilter.value
      const fullName = `${application.firstName} ${application.lastName}`.toLowerCase()
      const matchesSearch =
        !query || fullName.includes(query) || application.appNo.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
    return sortRows(filtered, sortKey.value, sortDir.value, accessors)
  })

  // Pagination
  const page = ref(1)
  const pageSize = ref(10)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(filteredApplications.value.length / pageSize.value)),
  )

  const paginatedApplications = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return filteredApplications.value.slice(start, start + pageSize.value)
  })

  function setPage(newPage) {
    page.value = Math.min(Math.max(1, newPage), totalPages.value)
  }

  function setPageSize(size) {
    pageSize.value = size
    page.value = 1
  }

  // New search/filter results always start from page 1
  watch([search, statusFilter], () => {
    page.value = 1
  })

  // If the current page no longer exists (e.g. after a delete), step back
  watch(totalPages, (count) => {
    if (page.value > count) page.value = count
  })

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
    page.value = 1 // sorting restarts from the first page
  }

  function sortState(key) {
    return sortKey.value === key ? sortDir.value : null
  }

  const pendingCount = computed(
    () => applications.value.filter((application) => application.status === 'Pending').length,
  )

  const underReviewCount = computed(
    () => applications.value.filter((application) => application.status === 'Under Review').length,
  )

  const approvedCount = computed(
    () => applications.value.filter((application) => application.status === 'Approved').length,
  )

  const returnedCount = computed(
    () => applications.value.filter((application) => application.status === 'Returned').length,
  )

  const rejectedCount = computed(
    () => applications.value.filter((application) => application.status === 'Rejected').length,
  )

  // ---------- loading ----------
  async function fetchApplications() {
    loading.value = true
    lastError.value = ''
    try {
      const { data, error } = await supabase
        .from('member')
        .select('*')
        .order('member_id', { ascending: true })
      if (error) throw error
      applications.value = (data || []).filter(isQueueRow).map(rowToApplication)
    } catch (error) {
      lastError.value = errorMessage(error)
      applications.value = []
    } finally {
      loading.value = false
    }
  }

  function findApplication(id) {
    return applications.value.find((item) => item.id === id)
  }

  // Apply a returned member row onto the local object in place —
  // the review modal holds a direct reference to it.
  function syncFromRow(application, row) {
    Object.assign(application, rowToApplication(row))
  }

  // One UPDATE: the status/field change plus an event appended to
  // app_events (newest first), then sync the local object.
  async function applyUpdate(application, patch, action) {
    const event = { at: new Date().toISOString(), action, by: 'Admin' }
    const { data: row, error } = await supabase
      .from('member')
      .update({ ...patch, app_events: [event, ...application.dbEvents] })
      .eq('member_id', application.id)
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }
    syncFromRow(application, row)
    return { ok: true }
  }

  // ---------- actions ----------

  // 🚶 Walk-in entry — admin types the applicant's details. The
  // applicant becomes a member row in 'Pending' review status; the
  // Members module won't show it until approval.
  async function addApplication(data) {
    const now = new Date().toISOString()
    const { data: row, error } = await supabase
      .from('member')
      .insert({
        name: `${data.firstName} ${data.lastName}`,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email || null,
        contact_number: data.phone,
        address: data.address,
        member_type: 'Regular',
        status: 'Pending',
        date_joined: now.slice(0, 10),
        created_at: now,
        app_source: 'Walk-in',
      })
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }
    const application = rowToApplication(row)
    applications.value.push(application)
    return { ok: true, application }
  }

  // Opening a Pending/Returned application moves it into Under Review.
  // Approved/Rejected stay read-only.
  async function startReview(id) {
    const application = findApplication(id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (application.status !== 'Pending' && application.status !== 'Returned') {
      return { ok: true }
    }
    const isResubmission = application.status === 'Returned'
    return applyUpdate(
      application,
      { status: 'Under Review' },
      isResubmission ? 'Re-review started after resubmission' : 'Review started',
    )
  }

  // ✅ Approve — one UPDATE turns the applicant into a member:
  // status Active, member_no from member_id (09's rule), approval
  // day as date_joined, temp password + forced first-login change,
  // checklist and optional approval note persisted. Then the
  // Members store refetches so the new member is listed at once.
  async function approveApplication(id, remarks) {
    const application = findApplication(id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (application.status === 'Approved') {
      return { ok: false, message: 'This application was already approved.' }
    }
    const remaining = application.checklist.filter((item) => !item.checked)
    if (remaining.length > 0) {
      return {
        ok: false,
        message: `Verify all requirements first — ${remaining.length} still unchecked.`,
      }
    }

    const now = new Date().toISOString()
    const memberNo = `KHS-${String(application.id).padStart(4, '0')}`
    const note = String(remarks || '').trim()
    const event = { at: now, action: `Approved — member ${memberNo} created`, by: 'Admin' }
    const { data: row, error } = await supabase
      .from('member')
      .update({
        status: 'Active',
        member_no: memberNo,
        date_joined: now.slice(0, 10),
        login_enabled: true,
        must_change_password: true,
        temp_password: randomPassword(),
        app_checklist: application.checklist,
        app_remarks: note || application.remarks || null,
        app_events: [event, ...application.dbEvents],
      })
      .eq('member_id', application.id)
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }

    syncFromRow(application, row)

    // The row is a member now — refresh the Members module list so
    // the record (and its KHS number) is there right away.
    const membersStore = useMembersStore()
    await membersStore.fetchMembers()

    return {
      ok: true,
      member: { memberNo, firstName: application.firstName, lastName: application.lastName },
      tempPassword: row.temp_password,
    }
  }

  // ↩️ Return — incomplete requirements, back to the applicant
  async function returnApplication(id, remarks) {
    const application = findApplication(id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when returning an application.' }
    }
    return applyUpdate(
      application,
      { status: 'Returned', app_remarks: remarks.trim() },
      `Returned to applicant — ${remarks.trim()}`,
    )
  }

  // ❌ Reject — with reason
  async function rejectApplication(id, remarks) {
    const application = findApplication(id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when rejecting an application.' }
    }
    return applyUpdate(
      application,
      { status: 'Rejected', app_remarks: remarks.trim() },
      `Rejected — ${remarks.trim()}`,
    )
  }

  // ---------- Profile photo (during review) ----------
  // App-filed applicants arrive with one already; walk-in applicants
  // get photographed at the desk while the review is open. Each
  // change is appended to the review timeline (app_events), and
  // replacing/removing also cleans up the old storage file.
  async function uploadAppPhoto(id, file) {
    const application = findApplication(id)
    if (!application) return { ok: false, message: 'Application not found.' }
    const uploaded = await uploadDocumentPhoto(file)
    if (!uploaded.ok) return uploaded
    const event = {
      at: new Date().toISOString(),
      action: application.idPhoto ? 'Profile photo replaced' : 'Profile photo uploaded',
      by: 'Admin',
    }
    const { data: row, error } = await supabase
      .from('member')
      .update({ id_photo_url: uploaded.path, app_events: [event, ...application.dbEvents] })
      .eq('member_id', application.id)
      .select()
      .single()
    if (error) {
      removeDocumentPhoto(uploaded.path) // no orphan files
      return { ok: false, message: errorMessage(error) }
    }
    const previous = application.idPhoto
    syncFromRow(application, row)
    if (previous) removeDocumentPhoto(previous)
    return { ok: true }
  }

  async function removeAppPhoto(id) {
    const application = findApplication(id)
    if (!application || !application.idPhoto) return { ok: true }
    const previous = application.idPhoto
    const event = {
      at: new Date().toISOString(),
      action: 'Profile photo removed',
      by: 'Admin',
    }
    const { data: row, error } = await supabase
      .from('member')
      .update({ id_photo_url: null, app_events: [event, ...application.dbEvents] })
      .eq('member_id', application.id)
      .select()
      .single()
    if (error) return { ok: false, message: errorMessage(error) }
    syncFromRow(application, row)
    removeDocumentPhoto(previous)
    return { ok: true }
  }

  // Load once, when the store is first used (ApplicationsView mounts).
  fetchApplications()

  return {
    applications,
    search,
    statusFilter,
    loading,
    lastError,
    filteredApplications,
    sortKey,
    sortDir,
    setSort,
    sortState,
    pendingCount,
    underReviewCount,
    approvedCount,
    returnedCount,
    rejectedCount,
    fetchApplications,
    addApplication,
    startReview,
    approveApplication,
    returnApplication,
    rejectApplication,
    uploadAppPhoto,
    removeAppPhoto,
    paginatedApplications,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
  }
})
