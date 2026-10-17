<template>
  <div>
    <!-- Thumbnail — signs a short-lived URL once, then shows the photo.
         avatar variant: round and header-sized, for identity blocks. -->
    <button
      type="button"
      :class="
        avatar
          ? 'block w-14 h-14 rounded-full overflow-hidden bg-gray-50 hover:ring-2 hover:ring-green-400 transition duration-200'
          : 'block w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:ring-2 hover:ring-green-400 transition duration-200'
      "
      title="Click to enlarge"
      @click="open = true"
    >
      <img v-if="url" :src="url" alt="Attachment preview" class="w-full h-full object-cover" />
      <span
        v-else
        class="w-full h-full flex items-center justify-center text-[10px] text-gray-400 px-1 text-center"
      >
        {{ loading ? 'Loading…' : 'Unavailable' }}
      </span>
    </button>

    <!-- Full-size preview — backdrop click, × or Esc closes -->
    <div
      v-if="open && url"
      class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
      @click.self="open = false"
    >
      <button
        type="button"
        class="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
        aria-label="Close preview"
        @click="open = false"
      >
        &times;
      </button>
      <img :src="url" alt="Attachment" class="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '../lib/supabase'

/**
 * Attachment preview for the private member-documents bucket
 * (13_app_documents.sql). Rows store the storage PATH (member
 * .id_photo_url, payment.receipt_image_url); the bucket is private,
 * so a short-lived signed URL is created and kept for the session.
 * Click the thumbnail for the full-size view. The path is watched,
 * so swapping a photo (Upload/Replace) re-signs the new file.
 */
const props = defineProps({
  path: { type: String, default: '' },
  // Avatar variant: round and header-sized, used in identity blocks.
  avatar: { type: Boolean, default: false },
})

const url = ref('')
const loading = ref(true)
const open = ref(false)

function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}

async function load() {
  url.value = ''
  loading.value = true
  if (!props.path) {
    loading.value = false
    return
  }
  const { data, error } = await supabase.storage
    .from('member-documents')
    .createSignedUrl(props.path, 3600)
  url.value = error ? '' : data.signedUrl
  loading.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  load()
})

watch(
  () => props.path,
  () => {
    open.value = false
    load()
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>
