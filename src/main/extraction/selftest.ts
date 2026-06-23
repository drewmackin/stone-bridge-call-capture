// =============================================================================
// Extraction validation self-test (`--selftest-extraction`). Exercises the Zod
// schema offline (no API) to prove the no-fabrication guards: required fields,
// E.164 well-formedness, and the "ambiguous phone must leave phone_e164 empty"
// rule. Pure validation — no network, no key needed.
// =============================================================================

import { ExtractedLeadSchema, type ExtractedLead } from './schema'

function base(): ExtractedLead {
  return {
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
    meeting_datetime: ''
  }
}

export function runExtractionValidationSelfTest(): string {
  const cases: { name: string; input: unknown; expectValid: boolean }[] = [
    { name: 'all-empty-allowed', input: base(), expectValid: true },
    {
      name: 'valid-full',
      input: { ...base(), name: 'Jane Doe', phone_raw: '617 555 1234', phone_e164: '+16175551234', summary: 'Discussed selling.' },
      expectValid: true
    },
    { name: 'bad-e164', input: { ...base(), phone_e164: '6175551234' }, expectValid: false },
    {
      name: 'ambiguous-must-be-empty',
      input: { ...base(), phone_ambiguous: true, phone_e164: '+16175551234' },
      expectValid: false
    },
    { name: 'missing-required-field', input: (() => { const b = base() as Record<string, unknown>; delete b.summary; return b })(), expectValid: false },
    { name: 'wrong-type-bool', input: { ...base(), phone_ambiguous: 'yes' }, expectValid: false },
    { name: 'valid-meeting-iso', input: { ...base(), meeting_datetime: '2026-07-02T15:00:00' }, expectValid: true },
    { name: 'bad-meeting-datetime', input: { ...base(), meeting_datetime: 'next Tuesday 3pm' }, expectValid: false }
  ]

  const results = cases.map((c) => {
    const valid = ExtractedLeadSchema.safeParse(c.input).success
    return { name: c.name, pass: valid === c.expectValid }
  })
  const allPass = results.every((r) => r.pass)
  return (
    results.map((r) => `${r.name}=${r.pass ? 'ok' : 'FAIL'}`).join(' ') +
    ` RESULT=${allPass ? 'PASS' : 'FAIL'}`
  )
}
