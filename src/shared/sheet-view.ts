// =============================================================================
// Sheet view — the SINGLE SOURCE OF TRUTH for how a lead maps to the operator's
// visible Sheet columns (A–F, the "Stone bridge 2027" layout). Imported by BOTH
// the Sheet writer (main process, src/main/sheets/sync.ts) and the lead-page
// preview (renderer), so what the operator approves on screen is exactly what
// gets written. Pure functions, no side effects. Empty pieces are dropped —
// never invented.
// =============================================================================

import type { Lead } from './types'

/** The operator's visible columns, A–F, in order. Do not reorder. */
export const VISIBLE_SHEET_HEADER = [
  'Address', // A
  'Name', // B
  'Number', // C  (phone, dialable format)
  'ACTION', // D  (next step + agreed meeting time)
  'Offers', // E  (seller's asking price)
  'Property concerns' // F  (condition notes)
] as const

/** US numbers as (617) 555-0142 so they're easy to read and dial; anything else as heard. */
export function formatSheetPhone(lead: Lead): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(lead.phone_e164 || '')
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`
  return lead.phone_e164 || lead.phone_raw
}

/** Local meeting time ("2026-10-02T15:00:00", no zone) → "Thu, Oct 2 · 3:00 PM". */
function formatMeeting(local: string): string {
  const d = new Date(local.length === 16 ? `${local}:00` : local)
  if (Number.isNaN(d.getTime())) return local
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** Column D — what happens next: the next step, plus the meeting time if one was agreed. */
export function composeAction(lead: Lead): string {
  return [lead.next_action, lead.meeting_datetime ? `Meeting ${formatMeeting(lead.meeting_datetime)}` : '']
    .filter(Boolean)
    .join(' · ')
}

export interface SheetColumnView {
  header: string
  value: string
}

/** The 6 visible cells a lead will occupy in the operator's sheet, in order. */
export function visibleSheetColumns(lead: Lead): SheetColumnView[] {
  const values = [
    lead.address,
    lead.name,
    formatSheetPhone(lead),
    composeAction(lead),
    lead.asking_price,
    lead.condition_notes
  ]
  return VISIBLE_SHEET_HEADER.map((header, i) => ({ header, value: values[i] }))
}
