// =============================================================================
// Leads repository — all reads/writes to the leads table. Booleans are stored
// as 0/1 and mapped back to JS booleans here so the rest of the app sees clean
// Lead objects.
// =============================================================================

import { randomUUID } from 'crypto'
import type { Lead, LeadStatus } from '@shared/types'
import type { ListLeadsOptions } from '@shared/ipc'
import { getDb } from './connection'

type Row = Record<string, unknown>

function rowToLead(r: Row): Lead {
  return {
    id: r.id as string,
    created_at: r.created_at as string,
    name: r.name as string,
    phone_raw: r.phone_raw as string,
    phone_e164: r.phone_e164 as string,
    phone_ambiguous: !!(r.phone_ambiguous as number),
    address: r.address as string,
    beds: r.beds as string,
    baths: r.baths as string,
    sqft: r.sqft as string,
    year_built: r.year_built as string,
    condition_notes: r.condition_notes as string,
    asking_price: r.asking_price as string,
    motivation: r.motivation as string,
    timeline: r.timeline as string,
    summary: r.summary as string,
    next_action: r.next_action as string,
    meeting_datetime: r.meeting_datetime as string,
    consent_state: r.consent_state as string,
    consent_method: r.consent_method as string,
    consent_confirmed: !!(r.consent_confirmed as number),
    transcript_path: r.transcript_path as string,
    audio_path: r.audio_path as string,
    transcript_text: r.transcript_text as string,
    raw_extraction: r.raw_extraction as string,
    call_analysis: r.call_analysis as string,
    status: r.status as LeadStatus,
    needs_review: !!(r.needs_review as number),
    sheet_row: (r.sheet_row as number) ?? null,
    pushed_at: (r.pushed_at as string) ?? null,
    calendar_event_id: r.calendar_event_id as string,
    calendar_event_link: r.calendar_event_link as string,
    deleted_at: (r.deleted_at as string) ?? null
  }
}

/** Columns that may be written. Provenance/system columns are handled explicitly. */
const WRITABLE_COLUMNS = [
  'name',
  'phone_raw',
  'phone_e164',
  'phone_ambiguous',
  'address',
  'beds',
  'baths',
  'sqft',
  'year_built',
  'condition_notes',
  'asking_price',
  'motivation',
  'timeline',
  'summary',
  'next_action',
  'meeting_datetime',
  'consent_state',
  'consent_method',
  'consent_confirmed',
  'transcript_path',
  'audio_path',
  'transcript_text',
  'raw_extraction',
  'call_analysis',
  'status',
  'needs_review',
  'sheet_row',
  'pushed_at',
  'calendar_event_id',
  'calendar_event_link',
  'deleted_at'
] as const

const BOOLEAN_COLUMNS = new Set(['phone_ambiguous', 'consent_confirmed', 'needs_review'])

function toStorage(col: string, value: unknown): unknown {
  if (BOOLEAN_COLUMNS.has(col)) return value ? 1 : 0
  if (value === undefined) return null
  return value
}

/** Build a Lead row with safe defaults; unknown text fields default to "" — never invented. */
export function newLeadSkeleton(partial: Partial<Lead> = {}): Lead {
  return {
    id: partial.id ?? randomUUID(),
    created_at: partial.created_at ?? new Date().toISOString(),
    name: '',
    phone_raw: '',
    phone_e164: '',
    phone_ambiguous: false,
    address: '',
    beds: '',
    baths: '',
    sqft: '',
    year_built: '',
    condition_notes: '',
    asking_price: '',
    motivation: '',
    timeline: '',
    summary: '',
    next_action: '',
    meeting_datetime: '',
    consent_state: '',
    consent_method: '',
    consent_confirmed: false,
    transcript_path: '',
    audio_path: '',
    transcript_text: '',
    raw_extraction: '',
    call_analysis: '',
    status: 'new',
    needs_review: false,
    sheet_row: null,
    pushed_at: null,
    calendar_event_id: '',
    calendar_event_link: '',
    deleted_at: null,
    ...partial
  }
}

export function insertLead(lead: Lead): Lead {
  const db = getDb()
  try {
    db.prepare(
    `INSERT INTO leads (
      id, created_at, name, phone_raw, phone_e164, phone_ambiguous,
      address, beds, baths, sqft, year_built, condition_notes,
      asking_price, motivation, timeline, summary, next_action, meeting_datetime,
      consent_state, consent_method, consent_confirmed,
      transcript_path, audio_path, transcript_text, raw_extraction, call_analysis,
      status, needs_review, sheet_row, pushed_at,
      calendar_event_id, calendar_event_link, deleted_at
    ) VALUES (
      @id, @created_at, @name, @phone_raw, @phone_e164, @phone_ambiguous,
      @address, @beds, @baths, @sqft, @year_built, @condition_notes,
      @asking_price, @motivation, @timeline, @summary, @next_action, @meeting_datetime,
      @consent_state, @consent_method, @consent_confirmed,
      @transcript_path, @audio_path, @transcript_text, @raw_extraction, @call_analysis,
      @status, @needs_review, @sheet_row, @pushed_at,
      @calendar_event_id, @calendar_event_link, @deleted_at
    )`
    ).run({
      ...lead,
      phone_ambiguous: lead.phone_ambiguous ? 1 : 0,
      consent_confirmed: lead.consent_confirmed ? 1 : 0,
      needs_review: lead.needs_review ? 1 : 0
    })
  } catch (e) {
    throw new Error(
      `Failed to insert lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`
    )
  }
  return lead
}

export function getLead(id: string): Lead | null {
  const row = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id) as Row | undefined
  return row ? rowToLead(row) : null
}

export function updateLead(id: string, patch: Partial<Lead>): Lead {
  const db = getDb()
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  for (const col of WRITABLE_COLUMNS) {
    if (col in patch) {
      sets.push(`${col} = @${col}`)
      params[col] = toStorage(col, (patch as Record<string, unknown>)[col])
    }
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = @id`).run(params)
  }
  const updated = getLead(id)
  if (!updated) throw new Error(`Lead ${id} not found after update`)
  return updated
}

export function listLeads(opts: ListLeadsOptions = {}): Lead[] {
  const {
    includeDeleted = false,
    onlyDeleted = false,
    search = '',
    status = 'all',
    sortBy = 'created_at',
    sortDir = 'desc'
  } = opts

  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (onlyDeleted) where.push('deleted_at IS NOT NULL')
  else if (!includeDeleted) where.push('deleted_at IS NULL')

  if (status !== 'all') {
    where.push('status = @status')
    params.status = status
  }
  if (search.trim()) {
    // Escape LIKE wildcards so a typed "%" or "_" matches literally.
    where.push(
      "(name LIKE @q ESCAPE '\\' OR phone_raw LIKE @q ESCAPE '\\' OR phone_e164 LIKE @q ESCAPE '\\' OR address LIKE @q ESCAPE '\\')"
    )
    params.q = `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  }

  // Whitelist sort column to avoid SQL injection through the column name.
  const sortable = new Set(['created_at', 'name', 'status', 'pushed_at'])
  const col = sortable.has(String(sortBy)) ? String(sortBy) : 'created_at'
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'

  const sql =
    'SELECT * FROM leads' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${col} ${dir}`
  const rows = getDb().prepare(sql).all(params) as Row[]
  return rows.map(rowToLead)
}

export function softDeleteLead(id: string): void {
  getDb().prepare('UPDATE leads SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

export function restoreLead(id: string): void {
  getDb().prepare('UPDATE leads SET deleted_at = NULL WHERE id = ?').run(id)
}

export function permanentDeleteLead(id: string): void {
  getDb().prepare('DELETE FROM leads WHERE id = ?').run(id)
}

/** Mark a lead as pushed to the Sheet (called by the sheets sync layer). */
export function markPushed(id: string, row: number): void {
  getDb()
    .prepare(`UPDATE leads SET status = 'pushed', sheet_row = ?, pushed_at = ? WHERE id = ?`)
    .run(row, new Date().toISOString(), id)
}

/** Clear the Sheet linkage after a Sheet row is removed. */
export function clearSheetLink(id: string): void {
  getDb().prepare('UPDATE leads SET sheet_row = NULL, pushed_at = NULL WHERE id = ?').run(id)
}

/** Record the synced Google Calendar event for a lead. */
export function setCalendarEvent(id: string, eventId: string, link: string): void {
  getDb()
    .prepare('UPDATE leads SET calendar_event_id = ?, calendar_event_link = ? WHERE id = ?')
    .run(eventId, link, id)
}
