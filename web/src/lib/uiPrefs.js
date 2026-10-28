import { reactive, watch } from 'vue'

/**
 * UI preferences that survive navigation and reloads — column
 * visibility per page, remembered in localStorage on that browser.
 *
 * Layout choices are not sensitive (never member data), so
 * localStorage is fine and the copy stays on the workstation; there
 * is no server copy. Storage failures (private windows, blocked
 * cookies) degrade silently to session-only defaults.
 */

const PREFIX = 'ucms:pref:'

function load(key) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? {} : JSON.parse(raw)
  } catch {
    return {}
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // storage unavailable — the preference simply won't persist
  }
}

/**
 * A reactive column-visibility object: loads the saved layout over
 * the page defaults (a column added to the code later defaults to
 * visible; a removed one is dropped) and writes every change back
 * immediately.
 */
export function persistentColumns(key, defaults) {
  const stored = load(key)
  const merged = { ...defaults }
  for (const column of Object.keys(defaults)) {
    if (column in stored) merged[column] = Boolean(stored[column])
  }
  const columns = reactive(merged)
  watch(columns, () => save(key, { ...columns }), { deep: true })
  return columns
}
