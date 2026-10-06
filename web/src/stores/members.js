import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { randomPassword } from '../utils/password'

/**
 * Members store
 *
 * Account management model:
 *   Active    — full member, can log into the mobile app
 *   Suspended — temporarily blocked (login disabled), reversible
 *   Dropped   — member left / archived, record is kept forever
 *
 * Cooperatives must keep member records, so permanent deletion is a
 * last resort — the UI pushes suspend/drop instead.
 *
 * Credentials are MOCKED for now. When Supabase is connected, replace
 * issueTempPassword / setLoginEnabled with supabase.auth.admin calls
 * and store mustChangePassword in the user's metadata. The
 * MembersView component will NOT need to change.
 *
 * Data-sheet fields (added to match the coop's Members' Data Sheet,
 * see database/03_add_form_columns.sql):
 *   middleName, memberType, civilStatus, spouseName, landline,
 *   govIdType, govIdNumber, gsisNumber, sssNumber, pagibigNumber,
 *   philhealthNumber
 * They are all optional — paper form stays the master record.
 */

// Temporary sample data — delete once Supabase is connected
const mockMembers = [
  {
    id: 1,
    memberNo: 'KHS-0001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    middleName: 'Lim',
    memberType: 'Regular', // Regular / Associate / Extension — coop classification
    civilStatus: 'Married',
    spouseName: 'Teresa Cruz',
    landline: '0281234567',
    govIdType: "Driver's License",
    govIdNumber: 'D12-34-567890',
    gsisNumber: '012345678',
    sssNumber: '34-1234567-8',
    pagibigNumber: '1234-5678-9012',
    philhealthNumber: '12-345678901-2',
    email: 'juan.delacruz@example.com',
    phone: '09171234567',
    address: '123 P. Del Rosario St., Caloocan City',
    status: 'Active',
    dateJoined: '2025-01-15',
    capitalShare: 100000,
    account: {
      loginEnabled: true,
      mustChangePassword: true,
      tempPassword: 'Khs7mQ2x',
    },
    history: [
      {
        at: '2025-01-15T09:00:00',
        action: 'Member registered face-to-face',
        by: 'Admin',
      },
      {
        at: '2025-01-15T09:20:00',
        action: 'Credentials issued — temporary password set',
        by: 'Admin',
      },
    ],
  },
  {
    id: 2,
    memberNo: 'KHS-0002',
    firstName: 'Maria',
    lastName: 'Santos',
    middleName: 'Reyes',
    memberType: 'Regular',
    civilStatus: 'Single',
    spouseName: '',
    landline: '',
    govIdType: 'UMID',
    govIdNumber: 'UM-987654321',
    gsisNumber: '',
    sssNumber: '35-7654321-0',
    pagibigNumber: '2345-6789-0123',
    philhealthNumber: '13-456789012-3',
    email: 'maria.santos@example.com',
    phone: '09181234567',
    address: '456 Aquino Ave., Caloocan City',
    status: 'Active',
    dateJoined: '2025-02-03',
    capitalShare: 14000, // below the ₱15k minimum — not loan-eligible yet
    account: {
      loginEnabled: true,
      mustChangePassword: false,
      tempPassword: null, // credentials not handed over yet
    },
    history: [
      {
        at: '2025-02-03T10:15:00',
        action: 'Member registered face-to-face',
        by: 'Admin',
      },
    ],
  },
  {
    id: 3,
    memberNo: 'KHS-0003',
    firstName: 'Pedro',
    lastName: 'Reyes',
    middleName: '',
    memberType: 'Associate',
    civilStatus: 'Widowed',
    spouseName: '',
    landline: '0287654321',
    govIdType: 'National ID',
    govIdNumber: 'PH-1234-5678-90',
    gsisNumber: '',
    sssNumber: '',
    pagibigNumber: '',
    philhealthNumber: '',
    email: 'pedro.reyes@example.com',
    phone: '09191234567',
    address: '789 Bonifacio St., Caloocan City',
    status: 'Suspended',
    dateJoined: '2025-06-21',
    capitalShare: 80000,
    account: {
      loginEnabled: false,
      mustChangePassword: false,
      tempPassword: null,
    },
    history: [
      {
        at: '2026-02-10T14:30:00',
        action: 'Status changed to Suspended',
        by: 'Admin',
      },
      {
        at: '2025-06-21T11:00:00',
        action: 'Member registered face-to-face',
        by: 'Admin',
      },
    ],
  },
  {
    id: 4,
    memberNo: 'KHS-0004',
    firstName: 'Ana',
    lastName: 'Garcia',
    middleName: 'Cruz',
    memberType: 'Regular',
    civilStatus: 'Married',
    spouseName: 'Ramon Garcia',
    landline: '',
    govIdType: '',
    govIdNumber: '',
    gsisNumber: '',
    sssNumber: '',
    pagibigNumber: '',
    philhealthNumber: '',
    email: 'ana.garcia@example.com',
    phone: '09201234567',
    address: '101 Rizal Blvd., Caloocan City',
    status: 'Dropped',
    dateJoined: '2024-11-30',
    capitalShare: 25000,
    account: {
      loginEnabled: false,
      mustChangePassword: false,
      tempPassword: null,
    },
    history: [
      {
        at: '2025-10-05T16:45:00',
        action: 'Status changed to Dropped',
        by: 'Admin',
      },
      {
        at: '2024-11-30T09:00:00',
        action: 'Member registered face-to-face',
        by: 'Admin',
      },
    ],
  },
  {
    id: 5,
    memberNo: 'KHS-0005',
    firstName: 'Jose',
    lastName: 'Mendoza',
    middleName: 'Diaz',
    memberType: 'Extension',
    civilStatus: 'Single',
    spouseName: '',
    landline: '0285551234',
    govIdType: 'Passport',
    govIdNumber: 'P1234567A',
    gsisNumber: '',
    sssNumber: '36-1111222-3',
    pagibigNumber: '',
    philhealthNumber: '',
    email: 'jose.mendoza@example.com',
    phone: '09211234567',
    address: '202 Mabini St., Caloocan City',
    status: 'Active',
    dateJoined: '2025-08-12',
    capitalShare: 32000,
    account: {
      loginEnabled: true,
      mustChangePassword: false,
      tempPassword: 'Pn4wR8kt',
    },
    history: [
      {
        at: '2025-08-12T13:00:00',
        action: 'Member registered face-to-face',
        by: 'Admin',
      },
      {
        at: '2025-08-12T13:25:00',
        action: 'Credentials issued — temporary password set',
        by: 'Admin',
      },
    ],
  },
]

export const useMembersStore = defineStore('members', () => {
  const members = ref([...mockMembers])
  const search = ref('')
  const statusFilter = ref('All')

  // Search matches name, member number, or email; status filter applies on top
  const filteredMembers = computed(() => {
    const query = search.value.trim().toLowerCase()
    return members.value.filter((member) => {
      const matchesStatus = statusFilter.value === 'All' || member.status === statusFilter.value
      const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        member.memberNo.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
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

  // New search/filter results always start from page 1
  watch([search, statusFilter], () => {
    page.value = 1
  })

  // If the current page no longer exists (e.g. after a delete), step back
  watch(totalPages, (count) => {
    if (page.value > count) page.value = count
  })

  // KHS-0001, KHS-0002, ... based on the highest number already used
  function generateMemberNo() {
    const numbers = members.value.map((member) =>
      Number.parseInt(member.memberNo.split('-')[1], 10),
    )
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return `KHS-${String(next).padStart(4, '0')}`
  }

  // Newest first
  function logAction(member, action) {
    if (!member.history) member.history = []
    member.history.unshift({ at: new Date().toISOString(), action, by: 'Admin' })
  }

  function addMember(data) {
    const now = new Date().toISOString()
    members.value.push({
      id: Date.now(), // temporary id — Supabase will generate the real one
      memberNo: generateMemberNo(),
      status: 'Active',
      capitalShare: 0, // capital paid in staggered amounts via addCapital
      account: {
        loginEnabled: true,
        mustChangePassword: false,
        tempPassword: null,
      },
      history: [{ at: now, action: 'Member registered face-to-face', by: 'Admin' }],
      ...data,
    })
  }

  function updateMember(id, data) {
    const index = members.value.findIndex((member) => member.id === id)
    if (index !== -1) {
      members.value[index] = { ...members.value[index], ...data }
    }
  }

  // Lifecycle: every change is logged and keeps the record
  function setStatus(id, status) {
    const member = members.value.find((item) => item.id === id)
    if (!member || member.status === status) return
    member.status = status
    member.account.loginEnabled = status === 'Active'
    if (status !== 'Active') {
      member.account.mustChangePassword = false
    }
    logAction(member, `Status changed to ${status}`)
  }

  // Generates a temp password (first issue) or replaces it (reset)
  function issueTempPassword(id) {
    const member = members.value.find((item) => item.id === id)
    if (!member) return
    const alreadyIssued = Boolean(member.account.tempPassword)
    member.account.tempPassword = randomPassword()
    member.account.mustChangePassword = true
    member.account.loginEnabled = true
    logAction(
      member,
      alreadyIssued
        ? 'Password reset — new temporary password issued'
        : 'Credentials issued — temporary password set',
    )
  }

  function setLoginEnabled(id, enabled) {
    const member = members.value.find((item) => item.id === id)
    if (!member) return
    member.account.loginEnabled = enabled
    logAction(member, enabled ? 'Login re-enabled' : 'Login disabled')
  }

  // 💰 Capital contribution — the client's "capital share" (15k new / 20k old
  // minimum, paid in staggered amounts). The Loans module uses 2× capital
  // share as the loan ceiling. A payment here can later also create a Ledger
  // income entry (see the Ledger swap comment).
  function addCapital(id, amount) {
    const member = members.value.find((item) => item.id === id)
    if (!member || !(amount > 0)) return false
    member.capitalShare = (member.capitalShare || 0) + amount
    logAction(member, `Capital contribution — ₱${amount.toLocaleString('en-PH')}`)
    return true
  }

  function deleteMember(id) {
    members.value = members.value.filter((member) => member.id !== id)
  }

  return {
    members,
    search,
    statusFilter,
    filteredMembers,
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
    deleteMember,
  }
})
