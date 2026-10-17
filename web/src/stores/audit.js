/**
 * Audit trail — the durable "who did what, when" record.
 *
 * Every meaningful action (approve, release, payment, suspend,
 * login enable/disable, admin changes...) is written to the
 * audit_log table. The table is append-only through the portal: RLS
 * lets admins read and insert, never update or delete — cooperatives
 * must keep their records (RA 9520 / AMLA), so history is corrected
 * only through SQL by a system administrator.
 *
 * Writes are fire-and-forget: a failed insert is reported in the
 * console but never blocks or breaks the action itself, and the
 * entry still shows locally for the rest of the session — the same
 * graceful behaviour the old memory-only log had.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

export const useAuditStore = defineStore('audit', () => {
  /** Newest first — feeds the Dashboard's Recent Activity card. */
  const recent = ref([])

  function actor() {
    return useAuthStore().profile?.name || 'Signed-in admin'
  }

  /**
   * Record an action. Returns the local entry immediately (so the
   * caller can show it right away) and writes the row to the
   * database in the background.
   */
  function record(entityType, entityId, action) {
    const entry = { at: new Date().toISOString(), action, by: actor() }
    supabase
      .from('audit_log')
      .insert({
        actor: entry.by,
        entity_type: entityType,
        entity_id: String(entityId),
        action,
      })
      .then(({ error }) => {
        if (error) console.error('[UCMS] audit write failed:', error)
      })
    return entry
  }

  /**
   * Histories for a set of entities, newest first.
   * Returns Map(String(id) -> [{ at, action, by }]).
   */
  async function loadHistories(entityType, ids) {
    const map = new Map()
    if (!ids.length) return map
    const { data, error } = await supabase
      .from('audit_log')
      .select('entity_id, created_at, action, actor')
      .eq('entity_type', entityType)
      .in('entity_id', ids)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('[UCMS] audit history could not be loaded:', error)
      return map
    }
    for (const row of data || []) {
      const list = map.get(row.entity_id) || []
      list.push({ at: row.created_at, action: row.action, by: row.actor })
      map.set(row.entity_id, list)
    }
    return map
  }

  /** Newest entries across all entity types — the dashboard feed. */
  async function fetchRecent(limit = 30) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('entity_type, entity_id, created_at, action, actor')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[UCMS] audit feed could not be loaded:', error)
      return
    }
    recent.value = data || []
  }

  // Load the feed when the store is first used (Dashboard mounts).
  fetchRecent()

  return { recent, record, loadHistories, fetchRecent }
})
