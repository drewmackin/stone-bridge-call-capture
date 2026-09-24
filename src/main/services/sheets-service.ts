// =============================================================================
// Sheets service — IPC wiring for pushing leads to Google Sheets and removing a
// Sheet row. A failed push never loses the local record (it remains the source
// of truth); the error is returned for the UI to surface with a retry.
//
// Every Google write runs through ONE promise-chain lock: two overlapping IPC
// calls (double-click Push, Push + Push all) would otherwise both read the id
// column, both miss the lead, and both append — a duplicate row.
// =============================================================================

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getConfig } from '../config'
import { getDb } from '../db/connection'
import { getSetting } from '../db/settings'
import { insertLead, newLeadSkeleton } from '../db/leads'
import type { CalendarResult } from '@shared/types'
import { errMsg } from '@shared/errors'
import { pushAllApproved, pushLead, deleteSheetRow, SETTING_SHEET_ID } from '../sheets/sync'
import { syncEventForLead } from '../calendar/sync'

let googleWrites: Promise<unknown> = Promise.resolve()

/** Run `fn` after every previously queued Google write has settled. */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = googleWrites.then(fn, fn)
  googleWrites = run.catch(() => {}) // one failure must not jam the queue
  return run
}

/** Calendar sync that can never throw — its failure must not block the Sheet push. */
async function safeCalendarSync(id: string): Promise<CalendarResult> {
  try {
    return await syncEventForLead(id)
  } catch (e) {
    return { ok: false, skipped: false, eventLink: null, created: false, error: errMsg(e) }
  }
}

export function registerSheetsIpc(): void {
  // Committing a lead = mirror to the Sheet AND file a calendar follow-up (if a
  // meeting time exists). Calendar goes FIRST so the Sheet row's hidden event
  // link (column M) is filled on the very first push; each is reported
  // independently.
  ipcMain.handle(IPC.PUSH_LEAD, (_e, id: string) =>
    serialized(async () => {
      const calendar = await safeCalendarSync(id)
      const res = await pushLead(id)
      res.calendar = calendar
      return res
    })
  )
  ipcMain.handle(IPC.PUSH_ALL_APPROVED, () =>
    serialized(async () => {
      const results = await pushAllApproved()
      // Calendar syncs are independent per lead — run them concurrently.
      await Promise.all(results.map(async (r) => { r.calendar = await safeCalendarSync(r.leadId) }))
      return results
    })
  )
  ipcMain.handle(IPC.DELETE_SHEET_ROW, (_e, id: string) => serialized(() => deleteSheetRow(id)))
}

/**
 * Dev-only (`--push-test-lead`): create a clearly-labeled TEST lead from the
 * verified sample transcript and push it, to confirm the Google Sheets
 * connection end to end (creates the Sheet on first run, shares it, writes the
 * row). Values are the literal contents of the synthesized test clip — not
 * fabricated seller data — and the row is marked as a test.
 */
export async function runSheetTransferDemo(): Promise<string> {
  // Idempotent: clear any prior demo rows so re-runs don't accumulate.
  getDb().prepare("DELETE FROM leads WHERE consent_method = 'test/demo'").run()

  const transcript =
    "Hello, this is a test call. My name is John Carter and my phone number is 617-555-1234. " +
    "I'm thinking about selling my house at 42 Maple Street."
  const lead = newLeadSkeleton({
    name: 'John Carter',
    phone_raw: '617-555-1234',
    phone_e164: '+16175551234',
    address: '42 Maple Street',
    summary: 'TEST transfer — synthesized sample call used to verify the Google connections.',
    transcript_text: transcript,
    meeting_datetime: '2026-07-01T15:00:00', // fixed demo time to also exercise the calendar
    consent_state: 'MA',
    consent_method: 'test/demo',
    consent_confirmed: true,
    status: 'reviewed'
  })
  insertLead(lead)

  const { push, calendar } = await serialized(async () => {
    const calendar = await safeCalendarSync(lead.id)
    return { push: await pushLead(lead.id), calendar }
  })
  const sheetId = getSetting(SETTING_SHEET_ID) || getConfig().googleSheetId
  const url = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : ''
  return JSON.stringify({ push, calendar, sheetId, url }, null, 2)
}
