<!--
  Searchable member dropdown.

  Replaces the native <select>, which drops its option list past the
  window edge once the coop passes 100+ members. Type a member number
  or any part of the name; the list filters as you type and scrolls
  inside its own box, so it always stays on screen. Label format is the
  same as the old options: "KHS-0001 — First Last".
-->
<template>
  <div ref="rootEl" class="relative">
    <input
      ref="inputEl"
      :value="displayValue"
      :placeholder="open ? 'Type to search name or member no...' : 'Select a member...'"
      type="text"
      autocomplete="off"
      class="w-full border border-gray-300 rounded-lg px-4 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      @focus="openList"
      @click="openList"
      @input="query = $event.target.value"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="closeList"
    />
    <button
      v-if="modelValue"
      type="button"
      aria-label="Clear member"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
      @mousedown.prevent
      @click="clear"
    >
      &times;
    </button>
    <ul
      v-if="open"
      class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1 z-30"
    >
      <li
        v-if="modelValue && !query"
        class="px-3 py-2 text-sm cursor-pointer text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        @mousedown.prevent
        @click="clear"
      >
        None
      </li>
      <li v-if="!filtered.length" class="px-3 py-2 text-sm text-gray-400">
        No member matches "{{ query }}".
      </li>
      <li
        v-for="option in filtered"
        :key="option.id"
        class="px-3 py-2 text-sm cursor-pointer"
        :class="
          option.id === modelValue
            ? 'bg-green-50 text-green-700 font-medium'
            : 'text-gray-700 hover:bg-green-50'
        "
        @mousedown.prevent
        @click="choose(option)"
      >
        {{ labelFor(option) }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
const inputEl = ref(null)
const query = ref('')
const open = ref(false)

function labelFor(option) {
  return `${option.memberNo} — ${option.firstName} ${option.lastName}`
}

// While the list is open the box shows the search text; when closed it
// shows the picked member, so staff can verify who they selected.
const displayValue = computed(() => {
  if (open.value) return query.value
  const selected = props.options.find((option) => option.id === props.modelValue)
  return selected ? labelFor(selected) : ''
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((option) => labelFor(option).toLowerCase().includes(q))
})

function openList() {
  if (open.value) return // already browsing — don't wipe what they typed
  query.value = ''
  open.value = true
}

function closeList() {
  open.value = false
  query.value = ''
}

function onEnter() {
  if (open.value && filtered.value.length) choose(filtered.value[0])
}

function choose(option) {
  if (!option) return
  emit('update:modelValue', option.id)
  closeList()
}

function clear() {
  emit('update:modelValue', null)
  closeList()
  inputEl.value?.focus()
}

// Clicking anywhere outside the picker closes the list — no blur
// handling, so dragging the list's scrollbar never closes it mid-drag.
function onDocMouseDown(event) {
  if (open.value && rootEl.value && !rootEl.value.contains(event.target)) closeList()
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>
