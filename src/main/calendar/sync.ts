// =============================================================================
// Google Calendar sync — when a lead has a parsed next-meeting time
// (meeting_datetime), create (or update) a follow-up event carrying the lead's
// details on the operator's calendar. Uses the SAME service account as Sheets;
// the operator must share their calendar with the service-account email
// ("Make changes to events") and enable the Google Calendar API. Idempotent:
// re-syncing updates the existing event instead of creating duplicates.
// =============================================================================

import type { calendar_v3 } from 'googleapis'
import type { CalendarResult, Lead } from '@shared/types'
import { getConfig } from '../config'
import { getLead, setCalendarEvent } from '../db/leads'
import { getGoogleClients, withRetry } from '../sheets/client'
import { errMsg } from '@shared/errors'

/** Normalize a local ISO string to include seconds (YYYY-MM-DDTHH:MM:SS). */
function withSeconds(iso: string): string {
  return /T\d{2}:\d{2}$/.test(iso) ? `${iso}:00` : iso
}

/** Add minutes to a local ISO datetime (wall-clock arithmetic), returning local ISO. */
function addMinutesLocal(iso: string, minutes: number): string {
  // Treat the naive local time as UTC purely for arithmetic, then drop the 'Z'.
  const d = new Date(`${withSeconds(iso)}Z`)
  if (Number.isNaN(d.getTime())) return withSeconds(iso)
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 19)
}

/** Build the Calendar event body from a lead. Pure — unit-testable. */
export function buildEvent(
  lead: Pick<
    Lead,
    'name' | 'phone_e164' | 'phone_raw' | 'address' | 'motivation' | 'next_action' | 'summary' | 'meeting_datetime'
  >,
  timeZone: string,
  minutes: number
): calendar_v3.Schema$Event {
  const start = withSeconds(lead.meeting_datetime)
  const end = addMinutesLocal(lead.meeting_datetime, minutes)
  const phone = lead.phone_e164 || lead.phone_raw
  const descLines = [
    'Stone Bridge follow-up (created by Call Capture).',
    phone ? `Phone: ${phone}` : '',
    lead.address ? `Property: ${lead.address}` : '',
    lead.motivation ? `Motivation: ${lead.motivation}` : '',
    lead.next_action ? `Next action: ${lead.next_action}` : '',
    lead.summary ? `\n${lead.summary}` : ''
  ].filter(Boolean)
  return {
    summary: `Stone Bridge follow-up: ${lead.name || 'Seller lead'}`,
    description: descLines.join('\n'),
    location: lead.address || undefined,
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone }
  }
}

const SKIP: CalendarResult = { ok: true, skipped: true, eventLink: null, created: false, error: null }

/** Create or update the calendar event for a lead's next-meeting time. */
export async function syncEventForLead(leadId: string): Promise<CalendarResult> {
  const lead = getLead(leadId)
  if (!lead) return { ok: false, skipped: false, eventLink: null, created: false, error: 'Lead not found' }
  if (!lead.meeting_datetime) return { ...SKIP, eventLink: lead.calendar_event_link || null }

  const cfg = getConfig()
  if (!cfg.calendarId) {
    return { ok: false, skipped: false, eventLink: null, created: false, error: 'No calendar configured (set CALENDAR_ID or OPERATOR_SHARE_EMAIL).' }
  }

  try {
    const { calendar } = getGoogleClients()
    const event = buildEvent(lead, cfg.calendarTimezone, cfg.calendarEventMinutes)

    let data: calendar_v3.Schema$Event
    let created: boolean
    if (lead.calendar_event_id) {
      data = (
        await withRetry(() =>
          calendar.events.update({
            calendarId: cfg.calendarId,
            eventId: lead.calendar_event_id,
            requestBody: event
          })
        )
      ).data
      created = false
    } else {
      data = (
        await withRetry(() =>
          calendar.events.insert({ calendarId: cfg.calendarId, requestBody: event })
        )
      ).data
      created = true
    }
    setCalendarEvent(leadId, data.id || '', data.htmlLink || '')
    return { ok: true, skipped: false, eventLink: data.htmlLink || null, created, error: null }
  } catch (e) {
    return { ok: false, skipped: false, eventLink: null, created: false, error: errMsg(e) }
  }
}

/** Offline self-test of the pure event-building logic (no network). */
export function runCalendarMappingSelfTest(): string {
  const checks: string[] = []
  const ev = buildEvent(
    {
      name: 'John Carter',
      phone_e164: '+16175551234',
      phone_raw: '617-555-1234',
      address: '42 Maple Street',
      motivation: 'relocating',
      next_action: 'call back',
      summary: 'A neutral summary.',
      meeting_datetime: '2026-07-02T15:00'
    },
    'America/New_York',
    30
  )
  checks.push(`summary_has_name=${(ev.summary || '').includes('John Carter')}`)
  checks.push(`start_has_seconds=${ev.start?.dateTime === '2026-07-02T15:00:00'}`)
  checks.push(`end_plus_30=${ev.end?.dateTime === '2026-07-02T15:30:00'}`)
  checks.push(`timezone=${ev.start?.timeZone === 'America/New_York'}`)
  checks.push(`location_set=${ev.location === '42 Maple Street'}`)
  checks.push(`desc_has_phone=${(ev.description || '').includes('+16175551234')}`)

  // Crossing the hour boundary.
  const ev2 = buildEvent(
    { name: '', phone_e164: '', phone_raw: '', address: '', motivation: '', next_action: '', summary: '', meeting_datetime: '2026-07-02T15:45:00' },
    'America/New_York',
    30
  )
  checks.push(`end_rolls_hour=${ev2.end?.dateTime === '2026-07-02T16:15:00'}`)

  const ok = checks.every((c) => c.endsWith('true'))
  return checks.join(' ') + ` RESULT=${ok ? 'PASS' : 'FAIL'}`
}
