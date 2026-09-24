// =============================================================================
// Google Calendar sync — when a lead has a parsed next-meeting time
// (meeting_datetime), create (or update) a follow-up event carrying the lead's
// details on the operator's calendar. Uses the SAME service account as Sheets;
// the operator must share their calendar with the service-account email
// ("Make changes to events") and enable the Google Calendar API. Idempotent:
// re-syncing updates the existing event instead of creating duplicates — the
// event id is derived from the lead id, so even a retried/timed-out insert
// can't file a second event. A stored event that was deleted on Google's side
// is re-created; clearing the meeting time removes the event.
// =============================================================================

import type { calendar_v3 } from 'googleapis'
import type { CalendarResult, Lead } from '@shared/types'
import { getConfig } from '../config'
import { getLead, setCalendarEvent } from '../db/leads'
import { getGoogleClients, googleStatus, withRetry } from '../sheets/client'
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

/**
 * Deterministic Calendar event id for a lead: the UUID without dashes. Lowercase
 * hex is valid base32hex (a–v, 0–9, 5–1024 chars). '' if the id doesn't fit.
 */
export function eventIdForLead(leadId: string): string {
  const id = leadId.replace(/-/g, '').toLowerCase()
  return /^[a-v0-9]{5,1024}$/.test(id) ? id : ''
}

const gone = (e: unknown): boolean => {
  const status = googleStatus(e)
  return status === 404 || status === 410
}

/** Create or update the calendar event for a lead's next-meeting time. */
export async function syncEventForLead(leadId: string): Promise<CalendarResult> {
  const lead = getLead(leadId)
  if (!lead) return { ok: false, skipped: false, eventLink: null, created: false, error: 'Lead not found' }

  const cfg = getConfig()
  if (!lead.meeting_datetime) {
    if (!lead.calendar_event_id) return { ...SKIP, eventLink: lead.calendar_event_link || null }
    // The meeting time was cleared after an event was filed — remove the stale
    // event (reported as skipped: nothing to schedule, eventLink now null).
    if (!cfg.calendarId) return { ...SKIP, eventLink: lead.calendar_event_link || null }
    try {
      const { calendar } = getGoogleClients()
      await withRetry(
        () => calendar.events.delete({ calendarId: cfg.calendarId, eventId: lead.calendar_event_id }),
        { service: 'calendar' }
      )
    } catch (e) {
      if (!gone(e)) {
        return { ok: false, skipped: false, eventLink: lead.calendar_event_link || null, created: false, error: `Could not remove the old follow-up event: ${errMsg(e)}` }
      }
    }
    setCalendarEvent(leadId, '', '')
    return SKIP
  }

  if (!cfg.calendarId) {
    return { ok: false, skipped: false, eventLink: null, created: false, error: 'No calendar configured (set CALENDAR_ID or OPERATOR_SHARE_EMAIL).' }
  }

  try {
    const { calendar } = getGoogleClients()
    const event = buildEvent(lead, cfg.calendarTimezone, cfg.calendarEventMinutes)
    const update = async (eventId: string): Promise<calendar_v3.Schema$Event> =>
      (
        await withRetry(
          () =>
            calendar.events.update({
              calendarId: cfg.calendarId,
              eventId,
              // 'confirmed' also restores an event that was deleted (cancelled).
              requestBody: { ...event, status: 'confirmed' }
            }),
          { service: 'calendar' }
        )
      ).data

    let data: calendar_v3.Schema$Event | null = null
    let created = false
    if (lead.calendar_event_id) {
      try {
        data = await update(lead.calendar_event_id)
      } catch (e) {
        if (!gone(e)) throw e
        // Deleted on Google's side — forget it and file a fresh one below.
        setCalendarEvent(leadId, '', '')
      }
    }
    if (!data) {
      const fixedId = eventIdForLead(lead.id)
      try {
        data = (
          await withRetry(
            () =>
              calendar.events.insert({
                calendarId: cfg.calendarId,
                requestBody: fixedId ? { ...event, id: fixedId } : event
              }),
            // With a fixed id a repeated insert just 409s (handled below).
            { service: 'calendar', idempotent: !!fixedId }
          )
        ).data
        created = true
      } catch (e) {
        // 409: this lead's event already exists (an earlier insert landed, or
        // it was deleted — ids can't be reused) — update/restore it instead.
        if (!fixedId || googleStatus(e) !== 409) throw e
        data = await update(fixedId)
      }
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

  // Deterministic, Calendar-valid event id from a lead UUID (idempotent inserts).
  const evId = eventIdForLead('FC469A09-B5C4-4DCB-8C43-9811CA3D6452')
  checks.push(`event_id_from_uuid=${evId === 'fc469a09b5c44dcb8c439811ca3d6452'}`)
  checks.push(`event_id_rejects_invalid=${eventIdForLead('abc-123-xyz') === ''}`)

  const ok = checks.every((c) => c.endsWith('true'))
  return checks.join(' ') + ` RESULT=${ok ? 'PASS' : 'FAIL'}`
}
