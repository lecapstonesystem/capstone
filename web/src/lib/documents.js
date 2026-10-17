import { supabase } from './supabase'
import { errorMessage } from '../utils/errorText'

/**
 * Shared photo helpers for the private member-documents bucket
 * (13_app_documents.sql: 5 MB max, jpeg/png/webp only — the bucket
 * enforces both server-side; these checks just fail faster and in
 * plain language).
 *
 * Admin uploads live under "admin/" — outside the {auth-uid}/
 * folders the member app writes to, so the two sources can never
 * collide. Admins may write anywhere in the bucket ("admin manage
 * documents" policy), so no extra permissions are needed.
 */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export async function uploadDocumentPhoto(file, folder = 'admin') {
  if (!file) return { ok: false, message: 'No photo chosen.' }
  const ext = PHOTO_TYPES[file.type]
  if (!ext) return { ok: false, message: 'Photos must be JPEG, PNG or WebP.' }
  if (file.size > PHOTO_MAX_BYTES) {
    return { ok: false, message: 'Photo must be 5 MB or smaller.' }
  }
  // Timestamp + short random tail: readable in the bucket, unique
  // enough that two counter staff uploading in the same second
  // cannot overwrite each other.
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const path = `${folder}/${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`
  const { error } = await supabase.storage
    .from('member-documents')
    .upload(path, file, { contentType: file.type })
  if (error) return { ok: false, message: errorMessage(error) }
  return { ok: true, path }
}

/** Best-effort cleanup of a replaced or removed photo file. */
export function removeDocumentPhoto(path) {
  if (!path) return
  // The database row is the source of truth; a leftover file is
  // harmless, so a failure here is only worth a console note.
  supabase.storage
    .from('member-documents')
    .remove([path])
    .then(({ error }) => {
      if (error) console.warn('[UCMS] photo cleanup failed:', error)
    })
}
