// =============================================================================
// Extraction validation self-test (`--selftest-extraction`). Exercises the
// validator offline (no API) to prove the no-fabrication guards (required
// fields, NANP E.164, "ambiguous phone must leave phone_e164 empty") AND that
// one bad field is blanked + flagged instead of discarding the good ones. Also
// checks the local call-time wording and the retryable-error classification.
// Pure — no network, no key needed.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { validateExtraction, type ExtractedLead } from './schema'
import { describeCallTime, isRetryableApiError } from './extractLead'

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

type Expect =
  | { valid: false }
  | { valid: true; blanked: string[]; check?: (f: ExtractedLead) => boolean }

export function runExtractionValidationSelfTest(): string {
  const TZ = 'America/New_York'
  const cases: { name: string; input: unknown; expect: Expect }[] = [
    { name: 'all-empty-allowed', input: base(), expect: { valid: true, blanked: [] } },
    {
      name: 'valid-full',
      input: { ...base(), name: 'Jane Doe', phone_raw: '617 555 1234', phone_e164: '+16175551234', summary: 'Discussed selling.' },
      expect: { valid: true, blanked: [], check: (f) => f.phone_e164 === '+16175551234' && !f.phone_ambiguous }
    },
    {
      // Salvage: the bad phone is blanked + flagged ambiguous; everything else survives.
      name: 'bad-e164-salvaged-keeps-name',
      input: { ...base(), name: 'Jane Doe', phone_raw: '617 555 1234', phone_e164: '6175551234', address: '1 Main St' },
      expect: {
        valid: true,
        blanked: ['phone_e164'],
        check: (f) => f.name === 'Jane Doe' && f.address === '1 Main St' && f.phone_raw === '617 555 1234' && f.phone_e164 === '' && f.phone_ambiguous
      }
    },
    { name: 'non-nanp-e164-blanked', input: { ...base(), phone_e164: '+442071234567' }, expect: { valid: true, blanked: ['phone_e164'] } },
    { name: 'nanp-bad-area-code-blanked', input: { ...base(), phone_e164: '+11235551234' }, expect: { valid: true, blanked: ['phone_e164'] } },
    {
      name: 'ambiguous-must-be-empty',
      input: { ...base(), phone_ambiguous: true, phone_e164: '+16175551234' },
      expect: { valid: true, blanked: ['phone_e164'], check: (f) => f.phone_e164 === '' && f.phone_ambiguous }
    },
    { name: 'missing-required-field', input: (() => { const b = base() as Record<string, unknown>; delete b.summary; return b })(), expect: { valid: false } },
    { name: 'wrong-type-bool', input: { ...base(), phone_ambiguous: 'yes' }, expect: { valid: false } },
    {
      name: 'valid-meeting-iso',
      input: { ...base(), meeting_datetime: '2026-07-02T15:00:00' },
      expect: { valid: true, blanked: [], check: (f) => f.meeting_datetime === '2026-07-02T15:00:00' }
    },
    {
      name: 'meeting-ms-and-z-accepted',
      input: { ...base(), meeting_datetime: '2026-07-02T15:00:00.000Z' },
      expect: { valid: true, blanked: [], check: (f) => f.meeting_datetime === '2026-07-02T15:00:00' }
    },
    {
      name: 'meeting-offset-stripped',
      input: { ...base(), meeting_datetime: '2026-07-02T15:00-04:00' },
      expect: { valid: true, blanked: [], check: (f) => f.meeting_datetime === '2026-07-02T15:00:00' }
    },
    {
      name: 'bad-meeting-salvaged',
      input: { ...base(), name: 'Jane Doe', meeting_datetime: 'next Tuesday 3pm' },
      expect: { valid: true, blanked: ['meeting_datetime'], check: (f) => f.meeting_datetime === '' && f.name === 'Jane Doe' }
    },
    { name: 'impossible-date-blanked', input: { ...base(), meeting_datetime: '2026-13-40T15:00:00' }, expect: { valid: true, blanked: ['meeting_datetime'] } },
    // 2:30am on spring-forward day does not exist in New York.
    { name: 'dst-gap-blanked', input: { ...base(), meeting_datetime: '2026-03-08T02:30:00' }, expect: { valid: true, blanked: ['meeting_datetime'] } },
    { name: 'dst-fallback-kept', input: { ...base(), meeting_datetime: '2026-11-01T01:30:00' }, expect: { valid: true, blanked: [] } }
  ]

  const results = cases.map((c) => {
    const out = validateExtraction(c.input, TZ)
    let pass: boolean
    if (!c.expect.valid) pass = !out.ok
    else
      pass =
        out.ok &&
        out.blanked.join(',') === c.expect.blanked.join(',') &&
        (!c.expect.check || c.expect.check(out.fields))
    return { name: c.name, pass }
  })

  // An 8:30pm ET call is already "tomorrow" in UTC — the model must see the local day.
  const evening = describeCallTime('2026-09-25T00:30:00.000Z', TZ)
  results.push({
    name: 'call-time-local-weekday',
    pass: evening.zone === TZ && evening.text.startsWith('Thursday, September 24, 2026') && evening.text.includes('8:30')
  })
  results.push({ name: 'call-time-bad-zone-falls-back', pass: describeCallTime('2026-09-25T00:30:00.000Z', 'Not/AZone').zone === 'UTC' })

  // Only 408/409/429/5xx + connection failures are retryable.
  const retry = (status: number): boolean => isRetryableApiError({ status })
  results.push({ name: 'retryable-codes', pass: [408, 409, 429, 500, 503].every(retry) })
  results.push({ name: 'non-retryable-codes', pass: [400, 401, 403, 404, 413].every((c) => !retry(c)) })
  results.push({ name: 'timeout-retryable', pass: isRetryableApiError(new Anthropic.APIConnectionTimeoutError()) })

  const allPass = results.every((r) => r.pass)
  return (
    results.map((r) => `${r.name}=${r.pass ? 'ok' : 'FAIL'}`).join(' ') +
    ` RESULT=${allPass ? 'PASS' : 'FAIL'}`
  )
}
