// =============================================================================
// AI extraction — turn a transcript into strict structured lead data using the
// Anthropic API with FORCED TOOL USE (the model must call record_lead, so the
// output is schema-shaped). Rules forbid inventing anything: unknown fields are
// empty. Cheap/fast Haiku 4.5 runs first; on invalid output it escalates once to
// Sonnet 4.6; if both fail validation the lead is kept and flagged for review —
// never dropped, never fabricated. The API key lives only in the main process.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { getConfig, hasSecret } from '../config'
import { LEAD_TOOL, validateExtraction, type ExtractedLead } from './schema'

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const SYSTEM = `You extract structured real-estate seller lead data from a call transcript for a wholesaling operator.

Hard rules:
- Extract ONLY what is actually stated in the transcript. Never infer or invent a name, phone number, address, price, or any detail.
- If something is not stated, return an EMPTY STRING for that field. Do not guess. Do not use placeholders.
- Normalize a clearly-stated US phone number to E.164 in phone_e164 (e.g. +16175551234). If a number is mentioned but you are not confident how to normalize it (partial, unclear digits), set phone_ambiguous=true, leave phone_e164 empty, and keep what you heard in phone_raw.
- summary must be a NEUTRAL 3–5 sentence recap of what was discussed — no speculation, no sales spin.
- motivation and timeline should be concise and only reflect what the seller actually said.
- next_action only if the operator stated or clearly implied a next step; otherwise empty.
- meeting_datetime: ONLY if a specific follow-up date AND time was agreed, output it as LOCAL wall-clock time in the time zone named below, formatted YYYY-MM-DDTHH:MM:SS with no offset and no "Z" (e.g. 2026-07-02T15:00:00). Resolve relative terms ("tomorrow at 3", "next Tuesday") against the LOCAL call date and weekday given below. If no specific time was agreed, leave it empty. Never guess a time.

Call the record_lead tool exactly once with your result.`

export class ExtractionError extends Error {
  retryable: boolean
  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'ExtractionError'
    this.retryable = retryable
  }
}

export type ExtractionOutcome =
  // `blanked` lists fields whose model value failed validation and was cleared.
  | { ok: true; fields: ExtractedLead; raw: string; model: string; blanked: string[] }
  | { ok: false; error: string; raw: string }

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Worth offering a retry? Only rate limits / timeouts / conflicts / server
 * errors (408, 409, 429, 5xx) and connection failures. Other 4xx (bad request,
 * auth, not found, payload too large) will fail the same way again.
 */
export function isRetryableApiError(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionError) return true // incl. timeouts (no HTTP status)
  const status = (e as { status?: unknown })?.status
  if (typeof status === 'number') return status === 408 || status === 409 || status === 429 || status >= 500
  const code = (e as { code?: unknown })?.code
  return typeof code === 'string' && /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(code)
}

/**
 * The call's moment as the operator experienced it — weekday + local date/time
 * in the calendar time zone — so "tomorrow at 3" on an evening call resolves to
 * the right day (a bare UTC ISO string is already "tomorrow" after ~8pm ET).
 */
export function describeCallTime(callDateIso: string, timeZone: string): { text: string; zone: string } {
  const d = new Date(callDateIso)
  const when = Number.isNaN(d.getTime()) ? new Date() : d
  const fmt = (zone: string): string =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(when)
  try {
    return { text: fmt(timeZone), zone: timeZone }
  } catch {
    return { text: fmt('UTC'), zone: 'UTC' } // misconfigured CALENDAR_TIMEZONE
  }
}

interface ModelRun {
  input: unknown | null
  raw: string
  stop: string
}

export async function extractLead(
  transcript: string,
  callDateIso?: string
): Promise<ExtractionOutcome> {
  const cfg = getConfig()
  if (!hasSecret(cfg.anthropicApiKey)) {
    throw new ExtractionError('Missing ANTHROPIC_API_KEY in .env — cannot run AI extraction.', true)
  }
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey, maxRetries: 2, timeout: 60_000 })

  const call = describeCallTime(callDateIso || new Date().toISOString(), cfg.calendarTimezone)
  const userContent = `The call took place on ${call.text} local time (time zone: ${call.zone}). Use this local date and weekday to resolve any relative meeting dates. meeting_datetime must be local time in ${call.zone}, formatted YYYY-MM-DDTHH:MM:SS. Extract the lead from this call transcript. Remember: only what is actually stated; empty strings for anything not stated.\n\n<transcript>\n${transcript}\n</transcript>`

  const runModel = async (model: string): Promise<ModelRun> => {
    const resp = await client.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [LEAD_TOOL],
      tool_choice: { type: 'tool', name: 'record_lead' },
      messages: [{ role: 'user', content: userContent }]
    })
    const block = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_lead'
    )
    return {
      input: block ? block.input : null,
      raw: block ? JSON.stringify(block.input) : '',
      stop: resp.stop_reason ?? ''
    }
  }

  let lastRaw = ''
  let sawInvalidOutput = false
  let lastError: { message: string; retryable: boolean } | null = null
  for (const model of [HAIKU, SONNET]) {
    let run: ModelRun
    try {
      run = await runModel(model)
    } catch (e) {
      const status = (e as { status?: number })?.status
      // Auth failures won't be helped by escalating (same key) — fail fast.
      if (status === 401 || status === 403) {
        throw new ExtractionError(`AI extraction auth failed: ${msg(e)}`, false)
      }
      // Remember it and still try the stronger model (a 404/400 can be model-specific).
      lastError = { message: `AI extraction request failed: ${msg(e)}`, retryable: isRetryableApiError(e) }
      continue
    }
    lastRaw = run.raw || lastRaw
    if (!run.input) continue // model didn't call the tool — try the stronger one

    const checked = validateExtraction(run.input, cfg.calendarTimezone)
    if (checked.ok) {
      return { ok: true, fields: checked.fields, raw: run.raw, model, blanked: checked.blanked }
    }
    sawInvalidOutput = true // structurally invalid — fall through to the next model
  }

  // Both models tried. Real model output that failed validation wins over a
  // later network error: keep that raw output for manual review (transcript
  // preserved, nothing invented). Otherwise surface the API failure.
  if (lastError && !sawInvalidOutput) throw new ExtractionError(lastError.message, lastError.retryable)
  return {
    ok: false,
    error: 'AI extraction did not return valid structured data after retry. Transcript preserved for manual review.',
    raw: lastRaw
  }
}
