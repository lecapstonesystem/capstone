import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../utils/errorText'
import { uploadAttachment, removeStorageFile } from '../lib/documents'
import { useAuditStore } from './audit'
import { useAuthStore } from './auth'
import { useMembersStore } from './members'
import { useLoansStore } from './loans'

/**
 * Attachments store — admin-uploaded document files (scans, photos
 * of receipts and checks) for members and loans.
 *
 * One table (19_attachments.sql) serves both targets: a row points
 * at exactly one member OR one loan. Files live in the private
 * member-documents bucket under admin/<kind>/<id>/, so the member
 * app never sees them. The bucket accepts images and PDF up to
 * 10 MB; images over the cap are compressed in the browser.
 *
 * Every upload and removal writes an audit line (who did what,
 * durable in audit_log) and appears right away in the open drawer's
 * Activity list. Deleting an attachment removes the row and the
 * file — the audit line remains as the permanent record, matching
 * the coop's no-lost-history rule (RA 9520 / AMLA).
 *
 * Only one detail drawer is open at a time, so a single items list
 * serves both panels.
 */

const COLUMN_FOR = { member: 'member_id', loan: 'loan_id' }

function mapRow(row) {
  return {
    id: row.attachment_id,
    name: row.file_name,
    path: row.file_path,
    type: row.file_type,
    size: row.file_size,
    note: row.note || '',
    by: row.admin?.name || '',
    at: row.created_at,
  }
}

export const useAttachmentsStore = defineStore('attachments', () => {
  const items = ref([])
  const loading = ref(false)
  const lastError = ref('')

  // The parent record's Activity list, so audit lines show up in the
  // drawer without a reload.
  function findEntity(kind, id) {
    const store = kind === 'member' ? useMembersStore() : useLoansStore()
    const list = kind === 'member' ? store.members : store.loans
    return list.find((item) => item.id === id)
  }

  function logAction(kind, id, action) {
    const entry = useAuditStore().record(kind, id, action)
    const entity = findEntity(kind, id)
    if (entity) {
      if (!entity.history) entity.history = []
      entity.history.unshift(entry)
    }
  }

  async function fetchAttachments(kind, id) {
    const column = COLUMN_FOR[kind]
    if (!column || !id) {
      items.value = []
      return
    }
    loading.value = true
    lastError.value = ''
    items.value = []
    const { data, error } = await supabase
      .from('attachment')
      .select('*, admin:uploaded_by(name)')
      .eq(column, id)
      .order('created_at', { ascending: false })
    loading.value = false
    if (error) {
      lastError.value = errorMessage(error)
      return
    }
    items.value = (data || []).map(mapRow)
  }

  async function addAttachment(kind, id, file, note) {
    const column = COLUMN_FOR[kind]
    if (!column || !id) return { ok: false, message: 'Unknown attachment target.' }
    lastError.value = ''

    const folder = `admin/${kind}/${id}`
    const uploaded = await uploadAttachment(file, folder)
    if (!uploaded.ok) {
      lastError.value = uploaded.message
      return uploaded
    }

    const { data, error } = await supabase
      .from('attachment')
      .insert({
        [column]: id,
        file_path: uploaded.path,
        file_name: file.name,
        file_type: uploaded.contentType,
        file_size: uploaded.size,
        note: note || null,
        uploaded_by: useAuthStore().profile?.admin_id ?? null,
      })
      .select('*, admin:uploaded_by(name)')
      .single()

    if (error) {
      // No row references the file — clean it up so the bucket
      // doesn't collect orphans.
      removeStorageFile(uploaded.path)
      lastError.value = errorMessage(error)
      return { ok: false, message: errorMessage(error) }
    }

    logAction(kind, id, `Attachment uploaded — ${file.name}`)
    items.value.unshift(mapRow(data))
    return { ok: true }
  }

  async function removeAttachment(item, kind, id) {
    lastError.value = ''
    const { error } = await supabase.from('attachment').delete().eq('attachment_id', item.id)
    if (error) {
      lastError.value = errorMessage(error)
      return { ok: false, message: errorMessage(error) }
    }
    removeStorageFile(item.path)
    logAction(kind, id, `Attachment removed — ${item.name}`)
    items.value = items.value.filter((file) => file.id !== item.id)
    return { ok: true }
  }

  /** Short-lived signed URL — the bucket is private. */
  async function viewUrl(path) {
    const { data, error } = await supabase.storage
      .from('member-documents')
      .createSignedUrl(path, 3600)
    return error ? null : data.signedUrl
  }

  return { items, loading, lastError, fetchAttachments, addAttachment, removeAttachment, viewUrl }
})
