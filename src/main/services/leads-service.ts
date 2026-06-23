// =============================================================================
// Leads service — thin orchestration layer over the leads repository. Keeps the
// IPC handlers tiny and gives one place to enforce invariants (e.g. manual
// leads are flagged so the operator knows they were not captured by the app).
// =============================================================================

import type { Lead } from '@shared/types'
import { EDITABLE_LEAD_FIELDS } from '@shared/types'
import type { ListLeadsOptions } from '@shared/ipc'
import {
  getLead,
  insertLead,
  listLeads,
  newLeadSkeleton,
  permanentDeleteLead,
  restoreLead,
  softDeleteLead,
  updateLead
} from '../db/leads'

const EDITABLE = new Set<string>(EDITABLE_LEAD_FIELDS)

export function listLeadsRepo(opts?: ListLeadsOptions): Lead[] {
  return listLeads(opts ?? {})
}

export function getLeadById(id: string): Lead | null {
  return getLead(id)
}

export function updateLeadFields(id: string, patch: Partial<Lead>): Lead {
  // Only allow renderer-originated edits to genuinely editable fields; ignore
  // any provenance/consent/sync columns a caller might try to forge.
  const safe: Partial<Lead> = {}
  for (const key of Object.keys(patch) as (keyof Lead)[]) {
    if (EDITABLE.has(key)) (safe as Record<string, unknown>)[key] = patch[key]
  }
  return updateLead(id, safe)
}

/** Add a record by hand for a call captured outside the app. */
export function addManualLead(patch: Partial<Lead>): Lead {
  const lead = newLeadSkeleton({
    ...patch,
    consent_method: patch.consent_method || 'manual entry — not captured by app',
    status: 'new'
  })
  return insertLead(lead)
}

export function softDelete(id: string): void {
  softDeleteLead(id)
}

export function restore(id: string): void {
  restoreLead(id)
}

export function permanentDelete(id: string): void {
  permanentDeleteLead(id)
}

/**
 * Backend CRUD self-test (`--selftest-backend`): manual add -> edit -> search ->
 * soft delete -> restore -> permanent delete. Cleans up after itself.
 */
export function runBackendSelfTest(): string {
  const checks: string[] = []
  const token = 'ZZ_selftest_' + Math.floor(performance.now())

  const lead = addManualLead({ name: token })
  checks.push(`added=${!!getLead(lead.id) && lead.status === 'new'}`)
  checks.push(`manual_flagged=${lead.consent_method.includes('manual')}`)

  updateLead(lead.id, { address: '1 Test St', phone_e164: '+16175551234' })
  const edited = getLead(lead.id)
  checks.push(`edit_persisted=${edited?.address === '1 Test St'}`)

  const found = listLeads({ search: token })
  checks.push(`search_found=${found.some((l) => l.id === lead.id)}`)

  softDelete(lead.id)
  const liveList = listLeads({ search: token })
  const archivedList = listLeads({ search: token, onlyDeleted: true })
  checks.push(`soft_deleted_hidden=${!liveList.some((l) => l.id === lead.id)}`)
  checks.push(`soft_deleted_recoverable=${archivedList.some((l) => l.id === lead.id)}`)

  restore(lead.id)
  checks.push(`restored=${listLeads({ search: token }).some((l) => l.id === lead.id)}`)

  permanentDelete(lead.id)
  checks.push(`permanently_deleted=${getLead(lead.id) === null}`)

  const ok = checks.every((c) => c.endsWith('true'))
  return checks.join(' ') + ` RESULT=${ok ? 'PASS' : 'FAIL'}`
}
