// =============================================================================
// Google Sheets sync — the Sheet is a downstream MIRROR of the local database
// (the source of truth). Writes are IDEMPOTENT (keyed by the lead id, kept in a
// hidden bookkeeping column): re-pushing updates the existing row instead of
// duplicating.
//
// The operator's sheet uses THEIR column layout (A–F, below). The dedupe id and
// all bookkeeping the app needs are written to hidden columns to the RIGHT of
// their layout (G onward) so their view stays clean and readable. Never the full
// transcript. The target tab is resolved at runtime (a "Leads" tab if present,
// else the first tab) so the operator doesn't have to rename anything; once
// resolved it is remembered by its numeric sheetId, so renaming or reordering
// tabs later doesn't send rows somewhere else.
// =============================================================================

import { basename } from 'path'
import type { Lead, PushResult } from '@shared/types'
import { getConfig } from '../config'
import { getSetting, setSetting } from '../db/settings'
import { getLead, listLeads, markPushed, clearSheetLink } from '../db/leads'
import { getGoogleClients, withRetry } from './client'
import { VISIBLE_SHEET_HEADER, composeAction, formatSheetPhone } from '@shared/sheet-view'
import { errMsg } from '@shared/errors'

/** Preferred tab name (used for app-created sheets); existing sheets fall back to their first tab. */
const PREFERRED_TAB = 'Leads'

/** Hidden bookkeeping columns, G onward — the app's machinery, kept out of the way. */
export const HIDDEN_HEADER = [
  'lead_id', // G  (idempotency key)
  'created_at', // H
  'next_action', // I
  'meeting_datetime', // J
  'calendar_event', // K  (link)
  'consent_state', // L
  'consent_method', // M
  'consent_confirmed', // N
  'transcript_file', // O
  'audio_file', // P
  'phone_raw', // Q
  'needs_review', // R
  'status' // S
]

export const FULL_HEADER = [...VISIBLE_SHEET_HEADER, ...HIDDEN_HEADER]

/** 0-based index of the id column within a row (start of the hidden block). */
const ID_COL_INDEX = VISIBLE_SHEET_HEADER.length

/** 0-based column index -> A1 letter (0->A, 8->I, 25->Z, 26->AA). */
function colLetter(index0: number): string {
  let n = index0
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

const ID_COL = colLetter(ID_COL_INDEX) // "G"
const LAST_COL = colLetter(FULL_HEADER.length - 1) // "S"

/** Build a sheet-qualified A1 range, quoting the tab name when it needs it. */
function a1(tab: string, cells: string): string {
  const q = /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`
  return `${q}!${cells}`
}

/** Map a lead to a Sheet row, in header order (visible A–F, then hidden G–S). Pure. */
export function leadToRow(lead: Lead): string[] {
  return [
    lead.address, // A Address
    lead.name, // B Name
    formatSheetPhone(lead), // C Number
    composeAction(lead), // D ACTION (next step + meeting)
    lead.asking_price, // E Offers (seller's asking price)
    lead.condition_notes, // F Property concerns
    // --- hidden bookkeeping (G onward) ---
    lead.id, // G lead_id
    lead.created_at, // H created_at
    lead.next_action, // I next_action
    lead.meeting_datetime, // J meeting_datetime
    lead.calendar_event_link, // K calendar_event
    lead.consent_state, // L consent_state
    lead.consent_method, // M consent_method
    lead.consent_confirmed ? 'yes' : 'no', // N consent_confirmed
    lead.transcript_path ? basename(lead.transcript_path) : '', // O transcript_file
    lead.audio_path ? basename(lead.audio_path) : '', // P audio_file
    lead.phone_raw, // Q phone_raw
    lead.needs_review ? 'yes' : 'no', // R needs_review
    lead.status // S status
  ]
}

/**
 * Find the 1-based Sheet row for an id, given the id column below the header
 * (i.e. the I2:I values). Returns -1 if absent. Pure — unit-testable.
 */
export function findRowNumber(idColumnBelowHeader: string[], id: string): number {
  const idx = idColumnBelowHeader.findIndex((v) => String(v) === String(id))
  return idx === -1 ? -1 : idx + 2 // +2: header is row 1, data starts at row 2
}

/**
 * Extract the 1-based row number from an A1 range like "Leads!A7:T9" or
 * "'My Sheet'!A7". Returns -1 if unparseable. Pure — unit-testable.
 */
export function rowFromA1Range(range: string | null | undefined): number {
  if (!range) return -1
  const afterBang = range.includes('!') ? range.slice(range.lastIndexOf('!') + 1) : range
  const m = afterBang.match(/[A-Za-z]+(\d+)/) // first cell ref's row
  return m ? parseInt(m[1], 10) : -1
}

/** Settings key holding the id of the spreadsheet the app created (see createSpreadsheet). */
export const SETTING_SHEET_ID = 'google_sheet_id'

function configuredSheetId(): string {
  const cfg = getConfig()
  return cfg.googleSheetId || getSetting(SETTING_SHEET_ID) || ''
}

async function createSpreadsheet(): Promise<string> {
  const { sheets, drive } = getGoogleClients()
  const cfg = getConfig()
  // Not idempotent: a retried create after a timeout could make a second Sheet.
  const res = await withRetry(
    () =>
      sheets.spreadsheets.create({
        requestBody: {
          properties: { title: 'Stone Bridge — Captured Leads' },
          sheets: [{ properties: { title: PREFERRED_TAB } }]
        },
        fields: 'spreadsheetId,spreadsheetUrl'
      }),
    { idempotent: false }
  )
  const id = res.data.spreadsheetId
  if (!id) throw new Error('Sheets create: the API returned no spreadsheetId.')
  const url = res.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}`

  // Share it back to the operator so it appears in their Drive.
  if (cfg.operatorShareEmail) {
    try {
      // Re-sharing with the same user is harmless, so this POST may retry.
      await withRetry(
        () =>
          drive.permissions.create({
            fileId: id,
            requestBody: { type: 'user', role: 'writer', emailAddress: cfg.operatorShareEmail },
            sendNotificationEmail: false
          }),
        { service: 'drive' }
      )
    } catch {
      // Non-fatal: the operator can still open it by URL / share manually.
    }
  }

  setSetting(SETTING_SHEET_ID, id)
  // eslint-disable-next-line no-console
  console.log(`[sheets] Created spreadsheet. ID=${id} URL=${url}`)
  return id
}

interface TabRef {
  title: string
  sheetId: number
}

/** Settings key remembering the resolved tab's numeric sheetId, per spreadsheet. */
function tabSettingKey(spreadsheetId: string): string {
  return `google_sheet_tab_id:${spreadsheetId}`
}

/**
 * Resolve the tab to write to: the tab remembered from an earlier push (by
 * numeric sheetId, so a rename/reorder can't redirect rows); else a "Leads" tab
 * if present (the app's convention), otherwise the FIRST tab — so an
 * operator's own sheet works without renaming.
 */
async function resolveTab(spreadsheetId: string): Promise<TabRef> {
  const { sheets } = getGoogleClients()
  const meta = await withRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  )
  const tabs = (meta.data.sheets || [])
    .map((s) => s.properties)
    .filter((p): p is NonNullable<typeof p> => p != null && p.title != null && p.sheetId != null)
  if (tabs.length === 0) {
    throw new Error(`Spreadsheet ${spreadsheetId} has no tabs.`)
  }
  const remembered = Number(getSetting(tabSettingKey(spreadsheetId)) ?? NaN)
  const chosen =
    tabs.find((t) => t.sheetId === remembered) || // vanished id → fall back below
    tabs.find((t) => t.title === PREFERRED_TAB) ||
    tabs[0]
  return { title: chosen.title as string, sheetId: chosen.sheetId as number }
}

/**
 * Ensure headers exist. Never clobbers an operator's own visible headers (A–F):
 * on a sheet they brought, we only LABEL the hidden bookkeeping columns (G–S) if
 * they're blank, and hide those columns so their view stays clean. On a fresh
 * (app-created) sheet with an empty row 1, we write the whole header.
 */
async function ensureHeader(spreadsheetId: string, tab: TabRef): Promise<void> {
  const { sheets } = getGoogleClients()
  const cur = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: a1(tab.title, `A1:${LAST_COL}1`) })
  )
  const row1 = cur.data.values?.[0] || []

  // Column I onward is the app's machinery. If the operator already uses I for
  // something else, stop — never write lead ids over their data.
  const idHeader = String(row1[ID_COL_INDEX] ?? '').trim()
  if (idHeader && idHeader !== HIDDEN_HEADER[0]) {
    throw new Error(
      `Column ${ID_COL} of the "${tab.title}" tab already has its own header ("${idHeader.slice(0, 40)}"). ` +
        `The app keeps its bookkeeping in columns ${ID_COL}–${LAST_COL}. Move that data, or add a tab named "${PREFERRED_TAB}" for the app.`
    )
  }

  if (row1.every((c) => !String(c ?? '').trim())) {
    // Fresh sheet — write the whole header (visible + hidden).
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: a1(tab.title, 'A1'),
        valueInputOption: 'RAW',
        requestBody: { values: [FULL_HEADER] }
      })
    )
    await hideBookkeepingColumns(spreadsheetId, tab.sheetId)
    return
  }

  // Operator brought their own visible headers — leave A–H alone; label the
  // hidden bookkeeping columns once if they aren't labeled yet, then hide them.
  if (!row1[ID_COL_INDEX]) {
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: a1(tab.title, `${ID_COL}1`),
        valueInputOption: 'RAW',
        requestBody: { values: [HIDDEN_HEADER] }
      })
    )
    await hideBookkeepingColumns(spreadsheetId, tab.sheetId)
  }
}

/** Hide the bookkeeping columns (I–T). Best-effort — purely cosmetic. */
async function hideBookkeepingColumns(spreadsheetId: string, sheetId: number): Promise<void> {
  try {
    const { sheets } = getGoogleClients()
    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: 'COLUMNS',
                  startIndex: ID_COL_INDEX,
                  endIndex: FULL_HEADER.length
                },
                properties: { hiddenByUser: true },
                fields: 'hiddenByUser'
              }
            }
          ]
        }
      })
    )
  } catch {
    /* cosmetic only — never block a push on this */
  }
}

/** Ensure a target spreadsheet exists, with headers, and return its id + tab. */
export async function ensureSpreadsheet(): Promise<{ id: string; tab: TabRef }> {
  let id = configuredSheetId()
  if (!id) id = await createSpreadsheet()
  const tab = await resolveTab(id)
  await ensureHeader(id, tab)
  // Remember the tab only once it's known-good (header check passed).
  setSetting(tabSettingKey(id), String(tab.sheetId))
  return { id, tab }
}

/** One read of the id column (I2:I), no retry — for use INSIDE a withRetry. */
async function fetchIdColumn(spreadsheetId: string, tab: string): Promise<string[]> {
  const { sheets } = getGoogleClients()
  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1(tab, `${ID_COL}2:${ID_COL}`),
    majorDimension: 'COLUMNS'
  })
  return ((idRes.data.values && idRes.data.values[0]) || []) as string[]
}

async function readIdColumn(spreadsheetId: string, tab: string): Promise<string[]> {
  return withRetry(() => fetchIdColumn(spreadsheetId, tab))
}

/** Idempotent upsert of ONE lead: update its existing row, or append a new one. */
async function upsert(
  spreadsheetId: string,
  tab: string,
  lead: Lead
): Promise<{ row: number; created: boolean }> {
  const { sheets } = getGoogleClients()
  const ids = await readIdColumn(spreadsheetId, tab)
  const existingRow = findRowNumber(ids, lead.id)
  // Column D shows the status the lead has once this push lands.
  const row = leadToRow({ ...lead, status: 'pushed' })

  if (existingRow === -1) {
    return withRetry(async (attempt) => {
      // A timed-out append may still have landed: re-check the id column before
      // repeating it, or the retry would write a duplicate row.
      if (attempt > 0) {
        const landed = findRowNumber(await fetchIdColumn(spreadsheetId, tab), lead.id)
        if (landed !== -1) return { row: landed, created: true }
      }
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: a1(tab, 'A1'),
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      })
      const parsed = rowFromA1Range(appendRes.data.updates?.updatedRange)
      if (parsed === -1) {
        throw new Error(
          'Sheets append: could not determine the written row from the API response; refusing to guess (a wrong row would corrupt idempotency).'
        )
      }
      return { row: parsed, created: true }
    })
  }
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: a1(tab, `A${existingRow}:${LAST_COL}${existingRow}`),
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    })
  )
  return { row: existingRow, created: false }
}

/**
 * Bulk upsert with a CONSTANT number of API calls (1 read + 1 batch update +
 * 1 batch append). Returns each lead's authoritative row.
 */
async function upsertMany(
  spreadsheetId: string,
  tab: string,
  leads: Lead[]
): Promise<Map<string, { row: number; created: boolean }>> {
  const { sheets } = getGoogleClients()
  const out = new Map<string, { row: number; created: boolean }>()
  if (leads.length === 0) return out

  const ids = await readIdColumn(spreadsheetId, tab)

  const updates: { range: string; values: string[][] }[] = []
  const toAppend: Lead[] = []
  for (const lead of leads) {
    const existingRow = findRowNumber(ids, lead.id)
    if (existingRow === -1) {
      toAppend.push(lead)
    } else {
      updates.push({
        range: a1(tab, `A${existingRow}:${LAST_COL}${existingRow}`),
        values: [leadToRow({ ...lead, status: 'pushed' })]
      })
      out.set(lead.id, { row: existingRow, created: false })
    }
  }

  if (updates.length > 0) {
    await withRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data: updates }
      })
    )
  }

  if (toAppend.length > 0) {
    const rows = await withRetry(async (attempt) => {
      // Same duplicate guard as upsert: one append call lands all rows or none.
      if (attempt > 0) {
        const now = await fetchIdColumn(spreadsheetId, tab)
        const landed = toAppend.map((l) => findRowNumber(now, l.id))
        if (landed.every((r) => r !== -1)) return landed
        if (landed.some((r) => r !== -1)) {
          throw new Error('Sheets bulk append: an earlier attempt partly shows in the Sheet; push again to reconcile.')
        }
      }
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: a1(tab, 'A1'),
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: toAppend.map((l) => leadToRow({ ...l, status: 'pushed' })) }
      })
      const start = rowFromA1Range(appendRes.data.updates?.updatedRange)
      if (start === -1) {
        throw new Error('Sheets bulk append: could not determine the written start row from the API response.')
      }
      return toAppend.map((_, i) => start + i)
    })
    toAppend.forEach((lead, i) => out.set(lead.id, { row: rows[i], created: true }))
  }

  return out
}

export async function pushLead(id: string): Promise<PushResult> {
  const lead = getLead(id)
  if (!lead) return { leadId: id, ok: false, row: null, created: false, error: 'Lead not found' }
  try {
    // A single push costs one metadata read (tab resolve) + one id-column read +
    // one write — fine at this scale (<1000 rows). Bulk pushes use upsertMany.
    const { id: spreadsheetId, tab } = await ensureSpreadsheet()
    const { row, created } = await upsert(spreadsheetId, tab.title, lead)
    markPushed(id, row)
    return { leadId: id, ok: true, row, created, error: null }
  } catch (e) {
    return { leadId: id, ok: false, row: null, created: false, error: errMsg(e) }
  }
}

export async function pushAllApproved(): Promise<PushResult[]> {
  // "Approved" = reviewed. One batched round-trip for the whole set.
  const approved = listLeads({ status: 'reviewed' })
  if (approved.length === 0) return []
  try {
    const { id: spreadsheetId, tab } = await ensureSpreadsheet()
    const rows = await upsertMany(spreadsheetId, tab.title, approved)
    return approved.map((lead) => {
      const r = rows.get(lead.id)
      if (!r) return { leadId: lead.id, ok: false, row: null, created: false, error: 'Not written' }
      markPushed(lead.id, r.row)
      return { leadId: lead.id, ok: true, row: r.row, created: r.created, error: null }
    })
  } catch (e) {
    const error = errMsg(e)
    return approved.map((lead) => ({
      leadId: lead.id,
      ok: false,
      row: null,
      created: false,
      error
    }))
  }
}

export async function deleteSheetRow(id: string): Promise<{ ok: boolean; error: string | null }> {
  const lead = getLead(id)
  if (!lead || lead.sheet_row == null) return { ok: true, error: null }
  try {
    const { id: spreadsheetId, tab } = await ensureSpreadsheet()
    const { sheets } = getGoogleClients()
    // Re-resolve the physical row by id on EVERY attempt — the stored sheet_row
    // may be stale after prior deletes shifted rows, and deleteDimension is not
    // idempotent: repeating it after a timed-out-but-successful attempt would
    // delete the NEXT lead's row. Never delete a row we can't positively identify.
    await withRetry(async () => {
      const row = findRowNumber(await fetchIdColumn(spreadsheetId, tab.title), id)
      if (row === -1) return // already gone from the Sheet (or an earlier attempt landed)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row }
              }
            }
          ]
        }
      })
    })
    clearSheetLink(id)
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** Offline self-test of the pure mapping + row-finding logic (no network). */
export function runSheetsMappingSelfTest(): string {
  const checks: string[] = []

  const lead: Lead = {
    id: 'abc-123',
    created_at: '2026-06-22T00:00:00.000Z',
    name: 'Jane',
    phone_raw: '617',
    phone_e164: '+16175551234',
    phone_ambiguous: false,
    address: '1 Main St',
    beds: '3',
    baths: '2',
    sqft: '1500',
    year_built: '1990',
    condition_notes: 'roof',
    asking_price: '300000',
    motivation: 'relocating',
    timeline: '60 days',
    summary: 'A neutral summary.',
    next_action: 'follow up',
    meeting_datetime: '2026-07-02T15:00:00',
    consent_state: 'MA',
    consent_method: 'verbal',
    consent_confirmed: true,
    transcript_path: '/x/transcripts/abc.txt',
    audio_path: '/x/recordings/abc.wav',
    transcript_text: 'long transcript not sent to sheet',
    raw_extraction: '{}',
    call_analysis: '',
    status: 'reviewed',
    needs_review: false,
    sheet_row: null,
    pushed_at: null,
    calendar_event_id: 'evt-1',
    calendar_event_link: 'https://calendar.google.com/event?eid=evt-1',
    deleted_at: null
  }
  const row = leadToRow(lead)

  // Layout: 6 visible (A–F) + 13 hidden (G–S) = 19 columns.
  checks.push(`header_len=${FULL_HEADER.length === 19}`)
  checks.push(`row_len=${row.length === FULL_HEADER.length}`)
  checks.push(`id_col_letter=${ID_COL === 'G'}`)
  checks.push(`last_col_letter=${LAST_COL === 'S'}`)

  // Visible columns = the operator's "Stone bridge 2027" layout.
  checks.push(`A_address=${row[0] === '1 Main St'}`)
  checks.push(`B_name=${row[1] === 'Jane'}`)
  checks.push(`C_number_dialable=${row[2] === '(617) 555-1234'}`)
  checks.push(`C_number_raw_fallback=${leadToRow({ ...lead, phone_e164: '', phone_raw: 'six one seven' })[2] === 'six one seven'}`)
  checks.push(`D_action_has_next_step=${row[3].startsWith('follow up')}`)
  checks.push(`D_action_has_meeting=${row[3].includes('Meeting Thu, Jul 2') && row[3].includes('3:00')}`)
  checks.push(`D_action_empty_ok=${leadToRow({ ...lead, next_action: '', meeting_datetime: '' })[3] === ''}`)
  checks.push(`E_offers_is_asking=${row[4] === '300000'}`)
  checks.push(`F_concerns_is_condition=${row[5] === 'roof'}`)

  // Hidden bookkeeping.
  checks.push(`G_id=${row[ID_COL_INDEX] === 'abc-123'}`)
  checks.push(`J_meeting=${row[9] === '2026-07-02T15:00:00'}`)
  checks.push(`K_calendar=${row[10] === 'https://calendar.google.com/event?eid=evt-1'}`)
  checks.push(`N_confirmed_yes=${row[13] === 'yes'}`)
  checks.push(`O_transcript_basename=${row[14] === 'abc.txt'}`)
  checks.push(`P_audio_basename=${row[15] === 'abc.wav'}`)
  checks.push(`S_status_pushed_on_push=${leadToRow({ ...lead, status: 'pushed' })[18] === 'pushed'}`)
  checks.push(`no_full_transcript=${!row.includes('long transcript not sent to sheet')}`)

  // Idempotency: id lookup in the (hidden) id column.
  const idCol = ['id-1', 'abc-123', 'id-3']
  checks.push(`found_existing_row=${findRowNumber(idCol, 'abc-123') === 3}`)
  checks.push(`absent_returns_-1=${findRowNumber(idCol, 'nope') === -1}`)

  // Authoritative append-row parsing.
  checks.push(`a1_range_simple=${rowFromA1Range('Leads!A7:T7') === 7}`)
  checks.push(`a1_range_multi=${rowFromA1Range('Leads!A7:T9') === 7}`)
  checks.push(`a1_range_quoted=${rowFromA1Range("'My Sheet'!A12") === 12}`)
  checks.push(`a1_range_bad=${rowFromA1Range('') === -1}`)

  // colLetter correctness across the boundary.
  checks.push(`colLetter_0_A=${colLetter(0) === 'A'}`)
  checks.push(`colLetter_25_Z=${colLetter(25) === 'Z'}`)
  checks.push(`colLetter_26_AA=${colLetter(26) === 'AA'}`)

  const ok = checks.every((c) => c.endsWith('true'))
  return checks.join(' ') + ` RESULT=${ok ? 'PASS' : 'FAIL'}`
}
