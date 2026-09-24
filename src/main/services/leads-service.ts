// =============================================================================
// Leads service — thin orchestration layer over the leads repository. Keeps the
// IPC handlers tiny and gives one place to enforce invariants (e.g. manual
// leads are flagged so the operator knows they were not captured by the app).
// =============================================================================

import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve, sep } from 'path'
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
import { getPaths } from '../paths'

const EDITABLE = new Set<string>(EDITABLE_LEAD_FIELDS)

/** Provenance for hand-entered leads — always set here, never by the renderer. */
export const MANUAL_CONSENT_METHOD = 'manual entry — not captured by app'

/** Keep only genuinely editable fields from a renderer-supplied patch. */
function editableOnly(patch: Partial<Lead>): Partial<Lead> {
  const safe: Partial<Lead> = {}
  for (const key of Object.keys(patch ?? {}) as (keyof Lead)[]) {
    if (EDITABLE.has(key)) (safe as Record<string, unknown>)[key] = patch[key]
  }
  return safe
}

export function listLeadsRepo(opts?: ListLeadsOptions): Lead[] {
  return listLeads(opts ?? {})
}

export function getLeadById(id: string): Lead | null {
  return getLead(id)
}

export function updateLeadFields(id: string, patch: Partial<Lead>): Lead {
  // Only allow renderer-originated edits to genuinely editable fields; ignore
  // any provenance/consent/sync columns a caller might try to forge.
  return updateLead(id, editableOnly(patch))
}

/**
 * Add a record by hand for a call captured outside the app. Same allow-list as
 * edits: the renderer can't forge an id, consent record, audio path or sync
 * state, and the manual-entry provenance is stamped server-side.
 */
export function addManualLead(patch: Partial<Lead>): Lead {
  const lead = newLeadSkeleton({
    ...editableOnly(patch),
    consent_method: MANUAL_CONSENT_METHOD,
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

/** The lead's local files: WAV, transcript .txt/.json. Only paths inside our own data dirs. */
function localFilesFor(lead: Lead): string[] {
  const { recordingsDir, transcriptsDir } = getPaths()
  const inside = (p: string, dir: string): boolean => resolve(p).startsWith(resolve(dir) + sep)
  const candidates = [
    lead.audio_path,
    lead.transcript_path,
    join(transcriptsDir, `${lead.id}.txt`),
    join(transcriptsDir, `${lead.id}.json`)
  ]
  return [...new Set(candidates.filter((p) => p && (inside(p, recordingsDir) || inside(p, transcriptsDir))))]
}

/**
 * Permanently delete = the DB row AND the recording/transcript files on disk
 * (a "deleted" lead must not leave its audio behind). Files go only after the
 * row delete succeeds, best-effort: a missing/locked file never blocks it. The
 * Google Calendar event and Sheet row are left alone (separate, explicit steps).
 */
export function permanentDelete(id: string): void {
  const lead = getLead(id)
  permanentDeleteLead(id)
  if (!lead) return
  for (const p of localFilesFor(lead)) {
    try {
      if (existsSync(p)) unlinkSync(p)
    } catch {
      /* best-effort: the record is already gone */
    }
  }
}

/**
 * Backend CRUD self-test (`--selftest-backend`): manual add -> edit -> search ->
 * soft delete -> restore -> permanent delete. Cleans up after itself.
 */
export function runBackendSelfTest(): string {
  const checks: string[] = []
  const token = 'ZZ_selftest_' + Math.floor(performance.now())

  // A forged provenance/sync patch must be ignored (allow-list + server-side stamp).
  const forged = { name: token, consent_method: 'verbal', consent_confirmed: true, audio_path: '/etc/hosts', sheet_row: 9 }
  const lead = addManualLead(forged as Partial<Lead>)
  checks.push(`added=${!!getLead(lead.id) && lead.status === 'new'}`)
  checks.push(`manual_flagged=${lead.consent_method === MANUAL_CONSENT_METHOD}`)
  checks.push(`forged_fields_ignored=${!lead.consent_confirmed && lead.audio_path === '' && lead.sheet_row === null}`)

  updateLead(lead.id, { address: '1 Test St', phone_e164: '+16175551234' })
  const edited = getLead(lead.id)
  checks.push(`edit_persisted=${edited?.address === '1 Test St'}`)

  const found = listLeads({ search: token })
  checks.push(`search_found=${found.some((l) => l.id === lead.id)}`)
  // LIKE wildcards match literally: "_" must not match every character.
  checks.push(`search_wildcards_literal=${!listLeads({ search: token.replace('selftest', 'self_est') }).some((l) => l.id === lead.id)}`)

  softDelete(lead.id)
  const liveList = listLeads({ search: token })
  const archivedList = listLeads({ search: token, onlyDeleted: true })
  checks.push(`soft_deleted_hidden=${!liveList.some((l) => l.id === lead.id)}`)
  checks.push(`soft_deleted_recoverable=${archivedList.some((l) => l.id === lead.id)}`)

  restore(lead.id)
  checks.push(`restored=${listLeads({ search: token }).some((l) => l.id === lead.id)}`)

  // Permanent delete also removes the lead's local files (throwaway profile).
  const { recordingsDir, transcriptsDir } = getPaths()
  const files = [join(recordingsDir, `${lead.id}.wav`), join(transcriptsDir, `${lead.id}.txt`), join(transcriptsDir, `${lead.id}.json`)]
  for (const f of files) writeFileSync(f, 'selftest')
  updateLead(lead.id, { audio_path: files[0], transcript_path: files[1] })
  permanentDelete(lead.id)
  checks.push(`permanently_deleted=${getLead(lead.id) === null}`)
  checks.push(`files_removed=${files.every((f) => !existsSync(f))}`)

  const ok = checks.every((c) => c.endsWith('true'))
  return checks.join(' ') + ` RESULT=${ok ? 'PASS' : 'FAIL'}`
}
