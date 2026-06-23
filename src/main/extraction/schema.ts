// =============================================================================
// Extraction schema — the strict shape the model must return, expressed both as
// the Anthropic tool input_schema (forces schema-conformant JSON) and a Zod
// schema (defensive post-validation). "Unknown" is always the empty string, so
// a missing field is representable WITHOUT inventing a value.
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
      phone_e164: str('The phone number normalized to E.164 (e.g. +16175551234). Empty string if not confidently normalizable.'),
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
        'If a specific follow-up/meeting date AND time was agreed, output it as local ISO 8601 with no timezone offset (e.g. 2026-07-02T15:00:00), resolving relative terms ("next Tuesday at 3") against the provided call date. If no specific time was agreed, output an empty string. Never guess a time.'
      )
    },
    required: [...EXTRACTION_FIELDS]
  }
}

const E164 = /^\+[1-9]\d{6,14}$/
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Defensive validation of whatever the model returns. */
export const ExtractedLeadSchema = z
  .object({
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
  .superRefine((v, ctx) => {
    // E.164 must be well-formed when present.
    if (v.phone_e164 && !E164.test(v.phone_e164)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'phone_e164 is not valid E.164', path: ['phone_e164'] })
    }
    // An ambiguous number must NOT also claim a normalized value.
    if (v.phone_ambiguous && v.phone_e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ambiguous phone must leave phone_e164 empty', path: ['phone_e164'] })
    }
    // A meeting time, when present, must be a REAL local ISO 8601 calendar
    // date/time (no timezone offset) — reject impossible values like 2026-13-40.
    if (v.meeting_datetime) {
      const m = ISO_LOCAL.exec(v.meeting_datetime)
      if (!m) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'meeting_datetime must be ISO local (YYYY-MM-DDTHH:MM[:SS])', path: ['meeting_datetime'] })
      } else {
        const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = m[6] ? +m[6] : 0
        const dt = new Date(y, mo - 1, d, h, mi, s)
        const valid =
          dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d &&
          dt.getHours() === h && dt.getMinutes() === mi && dt.getSeconds() === s
        if (!valid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'meeting_datetime is not a valid calendar date/time', path: ['meeting_datetime'] })
        }
      }
    }
  })
