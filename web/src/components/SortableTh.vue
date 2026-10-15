<script setup>
import { computed } from 'vue'

const props = defineProps({
  // The view's Pinia store — must expose sortState(key) and setSort(key)
  store: { type: Object, required: true },
  // Accessor key this column sorts by (see the store's accessors map)
  sortKey: { type: String, required: true },
})

// 'asc' when this column is the active ascending sort, 'desc' when
// descending, null when another column (or the default) is active.
const state = computed(() => props.store.sortState(props.sortKey))

function onClick() {
  props.store.setSort(props.sortKey)
}
</script>

<template>
  <th
    class="cursor-pointer select-none transition duration-150 hover:text-gray-700"
    :aria-sort="state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : 'none'"
    @click="onClick"
  >
    <span class="inline-flex items-center gap-1.5">
      <slot />
      <!-- ▲▼ both always shown: the active direction lights up green -->
      <span class="text-[9px] leading-none" aria-hidden="true">
        <span :class="state === 'asc' ? 'text-green-600' : 'text-gray-400'">▲</span>
        <span :class="state === 'desc' ? 'text-green-600' : 'text-gray-400'">▼</span>
      </span>
    </span>
  </th>
</template>
