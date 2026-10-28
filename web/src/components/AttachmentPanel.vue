<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider">Files</p>
      <label
        class="cursor-pointer text-xs font-medium text-green-700 hover:text-green-800"
        :class="{ 'opacity-50 pointer-events-none': busy }"
      >
        Upload file
        <input
          type="file"
          :accept="ATTACH_ACCEPT"
          class="hidden"
          :disabled="busy"
          @change="onPick"
        />
      </label>
    </div>

    <p class="text-xs text-gray-400">
      Scans and photos of the paper records — signed forms, IDs, receipts, checks. Images or PDF, up
      to 10 MB.
    </p>

    <input
      v-model="note"
      type="text"
      placeholder="Label for the next upload (optional) — e.g. Signed membership form"
      class="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
    />

    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <p v-else-if="busy" class="text-xs text-gray-400">Uploading…</p>

    <ul v-if="store.items.length" class="space-y-2">
      <li
        v-for="file in store.items"
        :key="file.id"
        class="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="text-sm text-gray-800 truncate">{{ file.note || file.name }}</p>
          <p class="text-xs text-gray-400 truncate">
            {{ file.note ? `${file.name} · ` : '' }}{{ kindLabel(file.type)
            }}{{ sizeLabel(file.size) }} · {{ formatDate(file.at)
            }}<span v-if="file.by"> · {{ file.by }}</span>
          </p>
        </div>
        <div
          v-if="removing !== file.id"
          class="flex items-center gap-3 shrink-0 text-xs font-medium"
        >
          <button class="text-green-700 hover:text-green-800" @click="view(file)">View</button>
          <button class="text-red-500 hover:text-red-700" @click="removing = file.id">
            Remove
          </button>
        </div>
        <!-- Two-step confirm: removing a file also deletes it from storage -->
        <div v-else class="flex items-center gap-2 shrink-0 text-xs">
          <span class="text-gray-500">Remove?</span>
          <button
            class="text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
            @click="confirmRemove(file)"
          >
            Yes
          </button>
          <button class="text-gray-500 hover:text-gray-700" @click="removing = null">No</button>
        </div>
      </li>
    </ul>
    <p v-else-if="!store.loading" class="text-xs text-gray-400">No files uploaded yet.</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useAttachmentsStore } from '../stores/attachments'
import { ATTACH_ACCEPT } from '../lib/documents'

/**
 * Files panel for the member drawer and the loan detail: upload a
 * scan/photo (optionally labeled), list, view via a temporary link,
 * remove. Backed by the attachments store — one shared list is
 * enough because only one detail drawer is open at a time.
 */
const props = defineProps({
  kind: { type: String, required: true }, // 'member' | 'loan'
  id: { type: Number, required: true },
})

const store = useAttachmentsStore()
const note = ref('')
const error = ref('')
const busy = ref(false)
const removing = ref(null)

watch(
  () => props.id,
  () => {
    note.value = ''
    error.value = ''
    removing.value = null
    store.fetchAttachments(props.kind, props.id)
  },
  { immediate: true },
)

async function onPick(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = '' // allow choosing the same file again later
  if (!file) return
  busy.value = true
  error.value = ''
  const result = await store.addAttachment(props.kind, props.id, file, note.value.trim())
  busy.value = false
  if (!result.ok) error.value = result.message
  else note.value = ''
}

async function view(file) {
  // Open the tab synchronously — popup blockers allow a tab opened
  // inside the click itself — then point it at the signed URL.
  const tab = window.open('about:blank', '_blank')
  const url = await store.viewUrl(file.path)
  if (!url) {
    if (tab) tab.close()
    error.value = 'This file could not be opened. Please try again.'
    return
  }
  if (tab) tab.location.href = url
  else window.location.href = url // popup blocked — navigate in this tab
}

async function confirmRemove(file) {
  removing.value = null
  const result = await store.removeAttachment(file, props.kind, props.id)
  error.value = result.ok ? '' : result.message
}

function kindLabel(type) {
  return type === 'application/pdf' ? 'PDF' : 'Image'
}

function sizeLabel(size) {
  if (!size) return ''
  if (size < 1024 * 1024) return ` · ${Math.max(1, Math.round(size / 1024))} KB`
  return ` · ${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(at) {
  if (!at) return ''
  return new Date(at).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>
