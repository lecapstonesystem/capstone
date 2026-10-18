import { supabase } from './supabase'
import { errorMessage } from '../utils/errorText'

/**
 * Shared photo helpers for the private member-documents bucket
 * (13_app_documents.sql: 5 MB max, jpeg/png/webp only — the bucket
 * enforces both server-side; these checks just fail faster and in
 * plain language).
 *
 * Photos over the cap are compressed in the browser (downscale to
 * 1600 px + JPEG re-encode) instead of being refused — phone
 * cameras routinely shoot 8–12 MB files.
 *
 * Admin uploads live under "admin/" — outside the {auth-uid}/
 * folders the member app writes to, so the two sources can never
 * collide. Admins may write anywhere in the bucket ("admin manage
 * documents" policy), so no extra permissions are needed.
 */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Attachments (Files panels): photos AND document scans (PDF). */
export const ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const ATTACH_TYPES = { ...PHOTO_TYPES, 'application/pdf': 'pdf' }
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

// Longest side of a compressed photo — far more than a profile
// picture or receipt needs, while shrinking even the biggest phone
// photos well under the cap.
const COMPRESS_MAX_DIMENSION = 1600
// Quality ladder: first pass keeps photos crisp; later passes only
// run if the first somehow still exceeds 5 MB.
const COMPRESS_QUALITIES = [0.85, 0.75, 0.6, 0.5]

/**
 * Shrink an over-limit photo until it fits the bucket cap.
 * Always outputs JPEG — fine for photos, and transparency is
 * flattened onto white first so PNG screenshots don't turn black.
 */
async function compressToFit(file, maxBytes = PHOTO_MAX_BYTES) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return {
      ok: false,
      message:
        "This photo couldn't be read. Try opening it in a photo app, saving it as JPEG, and uploading again.",
    }
  }
  const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const quality of COMPRESS_QUALITIES) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= maxBytes) {
      return { ok: true, blob }
    }
  }
  return {
    ok: false,
    message: 'This photo is still too large even after compressing. Please try a smaller photo.',
  }
}

// Timestamp + short random tail: readable in the bucket, unique
// enough that two counter staff uploading in the same second
// cannot overwrite each other.
function timestampedName(ext) {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}.${ext}`
}

export async function uploadDocumentPhoto(file, folder = 'admin') {
  if (!file) return { ok: false, message: 'No photo chosen.' }
  if (!PHOTO_TYPES[file.type]) {
    return { ok: false, message: 'Photos must be JPEG, PNG or WebP.' }
  }

  // Over the cap? Shrink it in the browser instead of refusing.
  // Photos that already fit are uploaded untouched.
  let payload = file
  let contentType = file.type
  if (file.size > PHOTO_MAX_BYTES) {
    const compressed = await compressToFit(file)
    if (!compressed.ok) return compressed
    payload = compressed.blob
    contentType = 'image/jpeg'
  }
  const ext = PHOTO_TYPES[contentType] || 'jpg'
  const path = `${folder}/${timestampedName(ext)}`
  const { error } = await supabase.storage
    .from('member-documents')
    .upload(path, payload, { contentType })
  if (error) return { ok: false, message: errorMessage(error) }
  return { ok: true, path }
}

/**
 * Generic attachment upload for the Files panels (member drawer and
 * loan detail): same bucket, but PDFs are allowed and the cap is the
 * bucket's 10 MB. Images over the cap are compressed in the browser
 * like photos; PDFs can't be shrunk, so they are refused with a
 * plain-language message instead.
 */
export async function uploadAttachment(file, folder) {
  if (!file) return { ok: false, message: 'No file chosen.' }
  if (!ATTACH_TYPES[file.type]) {
    return { ok: false, message: 'Files must be JPEG, PNG, WebP or PDF.' }
  }

  let payload = file
  let contentType = file.type
  if (file.size > ATTACH_MAX_BYTES) {
    if (contentType === 'application/pdf') {
      return {
        ok: false,
        message:
          'This PDF is over the 10 MB limit. Try exporting a smaller copy, then upload again.',
      }
    }
    const compressed = await compressToFit(file, ATTACH_MAX_BYTES)
    if (!compressed.ok) return compressed
    payload = compressed.blob
    contentType = 'image/jpeg'
  }

  const ext = ATTACH_TYPES[contentType] || 'jpg'
  const path = `${folder}/${timestampedName(ext)}`
  const { error } = await supabase.storage
    .from('member-documents')
    .upload(path, payload, { contentType })
  if (error) return { ok: false, message: errorMessage(error) }
  return { ok: true, path, contentType, size: payload.size }
}

/** Best-effort cleanup of a replaced or removed photo file. */
export function removeStorageFile(path) {
  if (!path) return
  // The database row is the source of truth; a leftover file is
  // harmless, so a failure here is only worth a console note.
  supabase.storage
    .from('member-documents')
    .remove([path])
    .then(({ error }) => {
      if (error) console.warn('[UCMS] file cleanup failed:', error)
    })
}

export const removeDocumentPhoto = removeStorageFile
