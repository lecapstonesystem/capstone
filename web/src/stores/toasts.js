import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Toasts — short-lived confirmations in the lower right ("Signed in",
 * "Payment recorded"). They exist for SUCCESS feedback only: every
 * failure already has a place to live (inline banners on forms,
 * `actionError` inside dialogs) where the admin can act on it, and a
 * message that disappears on its own is the wrong home for an error
 * that needs reading. Field validation stays inline too — a toast
 * cannot point at an input.
 *
 * Newest three only; each dismisses itself after `ms`, and clicking
 * one dismisses it early.
 */
export const useToastsStore = defineStore('toasts', () => {
  const items = ref([]) // { id, message, kind } — kind: success | error | warning
  let seq = 0

  function dismiss(id) {
    items.value = items.value.filter((toast) => toast.id !== id)
  }

  function push(message, kind = 'success', ms = 4000) {
    seq += 1
    const id = seq
    // Cap the stack so a burst of actions cannot bury the screen.
    items.value = [...items.value, { id, message, kind }].slice(-3)
    window.setTimeout(() => dismiss(id), ms)
  }

  return {
    items,
    dismiss,
    push,
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error', 6000),
    warning: (message) => push(message, 'warning', 5000),
  }
})
