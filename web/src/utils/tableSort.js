/**
 * Shared column-sorting helpers for the portal's data tables.
 *
 * Click a column header once → ascending (A→Z, small→large, oldest→newest),
 * click it again → descending. Each store owns its sortKey/sortDir and a
 * per-column accessor map; SortableTh.vue handles the header UI (▲▼).
 */

// A new column starts ascending; clicking the active column flips it.
export function toggleSort(currentKey, currentDir, key) {
  if (currentKey !== key) return { key, dir: 'asc' }
  return { key, dir: currentDir === 'desc' ? 'asc' : 'desc' }
}

/**
 * Returns a NEW array sorted by `key` through the store's accessor map:
 *   - numbers compare numerically (principal, balance, amounts)
 *   - everything else uses localeCompare with numeric + case-insensitive
 *     matching, so names, KHS/LDG/APP numbers and ISO dates all sort the
 *     way a person expects
 *   - empty values (no last login yet, no address) sink to the bottom in
 *     both directions
 */
export function sortRows(rows, key, dir, accessors) {
  const get = accessors[key]
  if (!get) return rows
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    const emptyA = va === null || va === undefined || va === ''
    const emptyB = vb === null || vb === undefined || vb === ''
    if (emptyA && emptyB) return 0
    if (emptyA) return 1
    if (emptyB) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb), 'en', { numeric: true, sensitivity: 'base' }) * sign
  })
}
