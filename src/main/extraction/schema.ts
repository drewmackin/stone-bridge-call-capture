// =============================================================================
// Extraction schema — the strict shape the model must return, expressed both as
// the Anthropic tool input_schema (forces schema-conformant JSON) and a Zod
// schema (defensive post-validation). "Unknown" is always the empty string, so
// a missing field is representable WITHOUT inventing a value. One bad value
// (e.g. a malformed phone) blanks THAT field and flags review — it no longer
// throws away every other correctly extracted field.
// =============================================================================

import { z } from 'zod'

/** The fields the model extracts. Order documents the tool schema. */
export const EXTRACTION_FIELDS = [
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
  'meeting_datetime'
] as const

export type ExtractedLead = {
  name: string
  phone_raw: string
  phone_e164: string
  phone_ambiguous: boolean
  address: string
  beds: string
  baths: string
  sqft: string
  year_built: string
  condition_notes: string
  asking_price: string
  motivation: string
  timeline: string
  summary: string
  next_action: string
  meeting_datetime: string
}

const str = (desc: string): { type: 'string'; description: string } => ({ type: 'string', description: desc })

/** JSON Schema for the Anthropic tool. additionalProperties:false + all required. */
export const LEAD_TOOL = {
  name: 'record_lead',
  description:
    'Record the structured real-estate seller lead extracted from a call transcript. Use empty strings for anything not actually stated in the transcript.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      name: str("The seller's full name as stated. Empty string if not stated."),
      phone_raw: str('The phone number exactly as spoken/heard. Empty string if none.'),
      phone_e164: str('The US phone number normalized to E.164 (e.g. +16175551234). Empty string if not confidently normalizable.'),
      phone_ambiguous: { type: 'boolean' as const, description: 'true if a number was mentioned but could not be confidently normalized.' },
      address: str('The property street address as stated. Empty string if not stated.'),
      beds: str('Number of bedrooms as stated (string). Empty if not stated.'),
      baths: str('Number of bathrooms as stated (string). Empty if not stated.'),
      sqft: str('Square footage as stated. Empty if not stated.'),
      year_built: str('Year the property was built. Empty if not stated.'),
      condition_notes: str('Notes on repairs, occupancy, and overall condition, only as discussed.'),
      asking_price: str('The asking or expected price as stated. Empty if not stated.'),
      motivation: str("The seller's motivation for selling, concisely. Empty if not discussed."),
      timeline: str('The seller’s timeline to sell. Empty if not discussed.'),
      summary: str('A neutral 3–5 sentence summary of the call. No speculation.'),
      next_action: str('The next action to take, only if stated/implied by the operator. Else empty.'),
      meeting_datetime: str(
        'If a specific follow-up/meeting date AND time was agreed, output it as local wall-clock time in the call\'s time zone, formatted YYYY-MM-DDTHH:MM:SS with no offset (e.g. 2026-07-02T15:00:00), resolving relative terms ("next Tuesday at 3") against the provided local call date. If no specific time was agreed, output an empty string. Never guess a time.'
      )
    },
    required: [...EXTRACTION_FIELDS]
  }
}

/** US/Canada (NANP) only: +1, then an area code and exchange that can't start with 0/1. */
const E164_NANP = /^\+1[2-9]\d{2}[2-9]\d{6}$/
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Structural validation of whatever the model returns: every field present
 * with the right type. A structural failure rejects the output (the caller
 * escalates to the stronger model); per-field VALUE problems are salvaged by
 * validateExtraction below instead of throwing the whole extraction away.
 */
export const ExtractedLeadSchema = z.object({
  name: z.string(),
  phone_raw: z.string(),
  phone_e164: z.string(),
  phone_ambiguous: z.boolean(),
  address: z.string(),
  beds: z.string(),
  baths: z.string(),
  sqft: z.string(),
  year_built: z.string(),
  condition_notes: z.string(),
  asking_price: z.string(),
  motivation: z.string(),
  timeline: z.string(),
  summary: z.string(),
  next_action: z.string(),
  meeting_datetime: z.string()
})

/** Wall-clock parts of an instant in an IANA zone (h23, so midnight is 00). */
function partsIn(ms: number, timeZone: string): number[] {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const get = (t: string): number => +(fmt.formatToParts(ms).find((p) => p.type === t)?.value ?? NaN)
  return [get('year'), get('month'), get('day'), get('hour'), get('minute'), get('second')]
}

/**
 * True if the local wall-clock time exists in `timeZone` — false for the hour
 * skipped by a spring-forward DST change (e.g. 2026-03-08T02:30 in New York),
 * which Google Calendar would silently shift. An unknown zone skips this check.
 */
function wallTimeExists(v: number[], timeZone: string): boolean {
  try {
    const asUtc = Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], v[5])
    let t = asUtc
    for (let i = 0; i < 2; i++) {
      const p = partsIn(t, timeZone)
      t = asUtc - (Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]) - t)
    }
    return partsIn(t, timeZone).every((n, i) => n === v[i])
  } catch {
    return true // RangeError: not a valid IANA zone — calendar check below still applies
  }
}

/**
 * Normalize a model meeting time to YYYY-MM-DDTHH:MM:SS local, or '' if it is
 * not a REAL local date/time. Tolerates the common near-misses (milliseconds, a
 * trailing Z/offset — the prompt asks for local time, so the offset is noise).
 */
export function normalizeMeetingDatetime(value: string, timeZone = ''): string {
  const cleaned = value
    .trim()
    .replace(/\.\d+(?=(Z|[+-]\d{2}:?\d{2})?$)/i, '')
    .replace(/(Z|[+-]\d{2}:?\d{2})$/i, '')
  const m = ISO_LOCAL.exec(cleaned)
  if (!m) return ''
  const v = [+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0]
  // Reject impossible values like 2026-13-40 or 25:00 (UTC math has no DST).
  const dt = new Date(Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], v[5]))
  const real =
    dt.getUTCFullYear() === v[0] && dt.getUTCMonth() === v[1] - 1 && dt.getUTCDate() === v[2] &&
    dt.getUTCHours() === v[3] && dt.getUTCMinutes() === v[4] && dt.getUTCSeconds() === v[5]
  if (!real) return ''
  if (timeZone && !wallTimeExists(v, timeZone)) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${v[0]}-${pad(v[1])}-${pad(v[2])}T${pad(v[3])}:${pad(v[4])}:${pad(v[5])}`
}

export type ValidationOutcome =
  | { ok: true; fields: ExtractedLead; blanked: (keyof ExtractedLead)[] }
  | { ok: false; error: string }

/**
 * Field-level validation with salvage. Never invents: a value that fails its
 * check is BLANKED (and reported in `blanked` so the lead is flagged for
 * review) while every other valid field is kept.
 *   - meeting_datetime: normalized; '' if still not a real local time.
 *   - phone_e164: must be a NANP E.164 number; otherwise '' + phone_ambiguous.
 *   - an "ambiguous" phone must not also claim a normalized value.
 */
export function validateExtraction(input: unknown, timeZone = ''): ValidationOutcome {
  const parsed = ExtractedLeadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  const fields: ExtractedLead = { ...parsed.data }
  const blanked: (keyof ExtractedLead)[] = []

  if (fields.meeting_datetime) {
    const normalized = normalizeMeetingDatetime(fields.meeting_datetime, timeZone)
    if (!normalized) blanked.push('meeting_datetime')
    fields.meeting_datetime = normalized
  }

  fields.phone_e164 = fields.phone_e164.trim()
  if (fields.phone_e164 && (fields.phone_ambiguous || !E164_NANP.test(fields.phone_e164))) {
    fields.phone_e164 = ''
    fields.phone_ambiguous = true
    blanked.push('phone_e164')
  }

  return { ok: true, fields, blanked }
}
