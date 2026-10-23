<template>
  <!-- Lower-right confirmation layer. Mount once in App.vue so it also
       shows on login and reset screens, where there is no AppLayout.
       aria-live=polite announces each toast to screen readers without
       stealing focus. -->
  <div
    class="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts.items"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-2.5 max-w-xs bg-white rounded-lg shadow-lg ring-1 ring-black/5 border-l-4 px-4 py-3 cursor-pointer"
        :class="kindClass(toast.kind)"
        role="status"
        @click="toasts.dismiss(toast.id)"
      >
        <!-- Icons are inline SVG (no image request, no emoji — UI rule) -->
        <svg
          v-if="toast.kind === 'success'"
          class="w-4 h-4 mt-0.5 shrink-0 text-green-600"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
            clip-rule="evenodd"
          />
        </svg>
        <svg
          v-else-if="toast.kind === 'error'"
          class="w-4 h-4 mt-0.5 shrink-0 text-red-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
            clip-rule="evenodd"
          />
        </svg>
        <svg
          v-else
          class="w-4 h-4 mt-0.5 shrink-0 text-amber-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M8.4 3.5a2 2 0 013.2 0l5.5 8a2 2 0 01-1.6 3H4.5a2 2 0 01-1.6-3l5.5-8zM9 8a1 1 0 012 0v2a1 1 0 11-2 0V8zm1 5.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5z"
            clip-rule="evenodd"
          />
        </svg>
        <p class="text-sm text-gray-700 leading-snug">{{ toast.message }}</p>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToastsStore } from '../stores/toasts'

const toasts = useToastsStore()

function kindClass(kind) {
  if (kind === 'error') return 'border-red-500'
  if (kind === 'warning') return 'border-amber-400'
  return 'border-green-600'
}
</script>
