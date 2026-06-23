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
import { ExtractedLeadSchema, LEAD_TOOL, type ExtractedLead } from './schema'

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
- meeting_datetime: ONLY if a specific follow-up date AND time was agreed, output local ISO 8601 with no timezone offset (e.g. 2026-07-02T15:00:00), resolving relative terms ("next Tuesday at 3") against the call date given below. If no specific time was agreed, leave it empty. Never guess a time.

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
  | { ok: true; fields: ExtractedLead; raw: string; model: string }
  | { ok: false; error: string; raw: string }

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
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

  const callDate = callDateIso || new Date().toISOString()
  const userContent = `The call took place on ${callDate} (use this to resolve any relative meeting dates). Extract the lead from this call transcript. Remember: only what is actually stated; empty strings for anything not stated.\n\n<transcript>\n${transcript}\n</transcript>`

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
      // Transient (network/5xx/timeout): remember it and try the stronger model.
      lastError = { message: `AI extraction request failed: ${msg(e)}`, retryable: true }
      continue
    }
    lastRaw = run.raw || lastRaw
    if (!run.input) continue // model didn't call the tool — try the stronger one

    const parsed = ExtractedLeadSchema.safeParse(run.input)
    if (parsed.success) {
      return { ok: true, fields: parsed.data, raw: run.raw, model }
    }
    // invalid shape — fall through to the next model
  }

  // Both models tried. A transient API failure is retryable; an invalid shape
  // is kept for manual review (transcript preserved, nothing invented).
  if (lastError) throw new ExtractionError(lastError.message, lastError.retryable)
  return {
    ok: false,
    error: 'AI extraction did not return valid structured data after retry. Transcript preserved for manual review.',
    raw: lastRaw
  }
}
