// =============================================================================
// Consent repository — append-only audit of recording consent. There is no
// update or delete path: a consent record, once written, is immutable.
// =============================================================================

import { randomUUID } from 'crypto'
import type { ConsentLogEntry } from '@shared/types'
import { getDb } from './connection'

export function logConsent(entry: Omit<ConsentLogEntry, 'id' | 'timestamp'>): ConsentLogEntry {
  const full: ConsentLogEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString()
  }
  getDb()
    .prepare(
      `INSERT INTO consent_log
        (id, lead_id, state, rule_applied, method, script_acknowledged, audible_played, timestamp)
       VALUES
        (@id, @lead_id, @state, @rule_applied, @method, @script_acknowledged, @audible_played, @timestamp)`
    )
    .run({
      ...full,
      script_acknowledged: full.script_acknowledged ? 1 : 0,
      audible_played: full.audible_played ? 1 : 0
    })
  return full
}

export function getConsentForLead(leadId: string): ConsentLogEntry | null {
  const row = getDb()
    .prepare('SELECT * FROM consent_log WHERE lead_id = ? ORDER BY timestamp ASC LIMIT 1')
    .get(leadId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    lead_id: row.lead_id as string,
    state: row.state as string,
    rule_applied: row.rule_applied as ConsentLogEntry['rule_applied'],
    method: row.method as string,
    script_acknowledged: !!(row.script_acknowledged as number),
    audible_played: !!(row.audible_played as number),
    timestamp: row.timestamp as string
  }
}
