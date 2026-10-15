import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { toggleSort, sortRows } from '../utils/tableSort'
import { useMembersStore } from './members'

/**
 * Applications store — the old "Verification Queue", renamed to Applications
 *
 * Client rule: there is NO online registration. Every member registers
 * face-to-face. Two equivalent ways an application reaches this queue:
 *
 *   1. 📱 Mobile App — the Flutter app pre-fills the coop's official paper
 *      form and generates an exact-copy PDF, which the applicant hands in
 *      face-to-face (the app only ADDS a new option — it does not replace
 *      the paper process)
 *   2. 🚶 Walk-in — an admin types the applicant's details directly, same
 *      as the coop has always done
 *
 * Status lifecycle:
 *   Pending → Under Review → Approved | Returned | Rejected
 *   Returned → Under Review (applicant resubmits, admin re-reviews)
 *
 * Approving an application AUTO-CREATES the member in the Members module
 * (status Active + temp password issued to hand over in person), so the
 * admin never retypes applicant details.
 *
 * Mocked for now. Supabase swap points:
 *   - `applications` table (one row per application)
 *   - Storage bucket for the Flutter-generated PDF (web only views/downloads)
 *   - approveApplication() should run member-insert + application-update as
 *     one transaction (or an rpc) so a crash can't half-create a member
 * ApplicationsView will NOT need to change.
 */

// Requirements checked before approval — adjust to the coop's real list
function defaultChecklist() {
  return [
    { label: 'Signed application form', checked: false },
    { label: 'Photocopy of valid ID', checked: false },
    { label: '1x1 ID photo', checked: false },
    { label: 'Membership fee paid', checked: false },
  ]
}

// Temporary sample data — delete once Supabase is connected
const mockApplications = [
  {
    id: 1,
    appNo: 'APP-0001',
    firstName: 'Rosario',
    lastName: 'Aquino',
    email: 'rosario.aquino@example.com',
    phone: '09171112222',
    address: '12 Sampaguita St., Caloocan City',
    source: 'App', // pre-filled PDF from the Flutter app
    submittedAt: '2026-09-24T10:30:00',
    status: 'Pending',
    checklist: defaultChecklist(),
    remarks: '',
    memberId: null,
    history: [
      {
        at: '2026-09-24T10:30:00',
        action: 'Application received (via mobile app PDF)',
        by: 'Admin',
      },
    ],
  },
  {
    id: 2,
    appNo: 'APP-0002',
    firstName: 'Danilo',
    lastName: 'Reyes',
    email: 'danilo.reyes@example.com',
    phone: '09181112222',
    address: '45 Mabini St., Caloocan City',
    source: 'App',
    submittedAt: '2026-09-23T14:15:00',
    status: 'Under Review',
    checklist: [
      { label: 'Signed application form', checked: true },
      { label: 'Photocopy of valid ID', checked: true },
      { label: '1x1 ID photo', checked: false },
      { label: 'Membership fee paid', checked: false },
    ],
    remarks: '',
    memberId: null,
    history: [
      {
        at: '2026-09-24T08:00:00',
        action: 'Review started',
        by: 'Admin',
      },
      {
        at: '2026-09-23T14:15:00',
        action: 'Application received (via mobile app PDF)',
        by: 'Admin',
      },
    ],
  },
  {
    id: 3,
    appNo: 'APP-0003',
    firstName: 'Lorna',
    lastName: 'Bautista',
    email: 'lorna.bautista@example.com',
    phone: '09191112222',
    address: '78 Bonifacio St., Caloocan City',
    source: 'Walk-in', // typed by an admin, the traditional process
    submittedAt: '2026-09-20T09:45:00',
    status: 'Returned',
    checklist: [
      { label: 'Signed application form', checked: true },
      { label: 'Photocopy of valid ID', checked: false },
      { label: '1x1 ID photo', checked: false },
      { label: 'Membership fee paid', checked: true },
    ],
    remarks: 'Please submit a photocopy of your valid ID and one 1x1 ID photo.',
    memberId: null,
    history: [
      {
        at: '2026-09-21T11:20:00',
        action:
          'Returned to applicant — Please submit a photocopy of your valid ID and one 1x1 ID photo.',
        by: 'Admin',
      },
      {
        at: '2026-09-20T10:00:00',
        action: 'Review started',
        by: 'Admin',
      },
      {
        at: '2026-09-20T09:45:00',
        action: 'Application received (walk-in entry)',
        by: 'Admin',
      },
    ],
  },
  {
    id: 4,
    appNo: 'APP-0004',
    firstName: 'Edgardo',
    lastName: 'Cruz',
    email: 'edgardo.cruz@example.com',
    phone: '09201112222',
    address: '90 Rizal Blvd., Caloocan City',
    source: 'App',
    submittedAt: '2026-09-18T16:00:00',
    status: 'Rejected',
    checklist: [
      { label: 'Signed application form', checked: true },
      { label: 'Photocopy of valid ID', checked: true },
      { label: '1x1 ID photo', checked: true },
      { label: 'Membership fee paid', checked: true },
    ],
    remarks: 'Duplicate application — the applicant is already a member (KHS-0003).',
    memberId: null,
    history: [
      {
        at: '2026-09-19T09:10:00',
        action: 'Rejected — Duplicate application — the applicant is already a member (KHS-0003).',
        by: 'Admin',
      },
      {
        at: '2026-09-18T16:30:00',
        action: 'Review started',
        by: 'Admin',
      },
      {
        at: '2026-09-18T16:00:00',
        action: 'Application received (via mobile app PDF)',
        by: 'Admin',
      },
    ],
  },
]

export const useApplicationsStore = defineStore('applications', () => {
  const applications = ref([...mockApplications])
  const search = ref('')
  const statusFilter = ref('All')

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

  function setSort(key) {
    const next = toggleSort(sortKey.value, sortDir.value, key)
    sortKey.value = next.key
    sortDir.value = next.dir
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

  // APP-0001, APP-0002, ... based on the highest number already used
  function generateAppNo() {
    const numbers = applications.value.map((application) =>
      Number.parseInt(application.appNo.split('-')[1], 10),
    )
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return `APP-${String(next).padStart(4, '0')}`
  }

  // Newest first
  function logAction(application, action) {
    if (!application.history) application.history = []
    application.history.unshift({ at: new Date().toISOString(), action, by: 'Admin' })
  }

  // 🚶 Walk-in entry — admin types the applicant's details
  function addApplication(data) {
    const now = new Date().toISOString()
    const application = {
      id: Date.now(), // temporary id — Supabase will generate the real one
      appNo: generateAppNo(),
      ...data, // firstName, lastName, email, phone, address
      source: 'Walk-in',
      submittedAt: now,
      status: 'Pending',
      checklist: defaultChecklist(),
      remarks: '',
      memberId: null,
      history: [{ at: now, action: 'Application received (walk-in entry)', by: 'Admin' }],
    }
    applications.value.push(application)
    return { ok: true, application }
  }

  // Opening a Pending/Returned application moves it into Under Review.
  // Approved/Rejected stay read-only.
  function startReview(id) {
    const application = applications.value.find((item) => item.id === id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (application.status !== 'Pending' && application.status !== 'Returned') {
      return { ok: true }
    }
    const isResubmission = application.status === 'Returned'
    application.status = 'Under Review'
    logAction(
      application,
      isResubmission ? 'Re-review started after resubmission' : 'Review started',
    )
    return { ok: true }
  }

  // ✅ Approve → auto-create the member record (with temp password ready to
  // hand over face-to-face). Runs member-insert + application-update together.
  function approveApplication(id) {
    const application = applications.value.find((item) => item.id === id)
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

    const membersStore = useMembersStore()
    const now = new Date().toISOString()
    membersStore.addMember({
      firstName: application.firstName,
      lastName: application.lastName,
      email: application.email || '',
      phone: application.phone,
      address: application.address,
      dateJoined: now.split('T')[0],
      history: [
        { at: now, action: `Member created from application ${application.appNo}`, by: 'Admin' },
      ],
    })
    // addMember appends — the new member is the last entry
    const member = membersStore.members[membersStore.members.length - 1]
    // Temp password + forced change on first login — handed over in person
    membersStore.issueTempPassword(member.id)

    application.status = 'Approved'
    application.memberId = member.id
    logAction(application, `Approved — member ${member.memberNo} created`)
    return { ok: true, member, tempPassword: member.account.tempPassword }
  }

  // ↩️ Return — incomplete requirements, goes back to the applicant
  function returnApplication(id, remarks) {
    const application = applications.value.find((item) => item.id === id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when returning an application.' }
    }
    application.status = 'Returned'
    application.remarks = remarks.trim()
    logAction(application, `Returned to applicant — ${remarks.trim()}`)
    return { ok: true }
  }

  // ❌ Reject — with reason
  function rejectApplication(id, remarks) {
    const application = applications.value.find((item) => item.id === id)
    if (!application) return { ok: false, message: 'Application not found.' }
    if (!remarks || !remarks.trim()) {
      return { ok: false, message: 'Remarks are required when rejecting an application.' }
    }
    application.status = 'Rejected'
    application.remarks = remarks.trim()
    logAction(application, `Rejected — ${remarks.trim()}`)
    return { ok: true }
  }

  return {
    applications,
    search,
    statusFilter,
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
    addApplication,
    startReview,
    approveApplication,
    returnApplication,
    rejectApplication,
  }
})
