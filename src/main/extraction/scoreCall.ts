// =============================================================================
// AI call scorecard — grades the OPERATOR's performance on a seller call against
// real wholesaling best practices (Jerry Norton's four pillars, Brent Daniels'
// TTP, Pace Morby, etc.). Forced tool use → strict { score, strengths,
// improvements }, Zod-validated. Grades ONLY from the transcript — never invents.
// Haiku 4.5 first, escalate once to Sonnet 4.6 on invalid output. Same API key,
// main process only. Best-effort: the pipeline never fails on a missing grade.
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { CallAnalysis, Lead } from '@shared/types'
import { getConfig, hasSecret } from '../config'
import { getLead, updateLead } from '../db/leads'
import { errMsg } from '@shared/errors'

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const SYSTEM = `You are a real-estate WHOLESALING call coach. Grade the OPERATOR's performance on a recorded seller call, based ONLY on what the transcript actually shows. Never invent or assume anything that isn't in the transcript.

Score 0–100 using this weighted rubric (weights in parentheses):
1. Rapport & tone — warm, conversational, uses the seller's name, not scripted or pushy (12)
2. Motivation — uncovers the seller's REAL reason/problem behind selling, past the surface answer (18)
3. Timeline / urgency — how soon they must sell and whether the decision is truly made (14)
4. Property condition — repairs, major systems (roof/HVAC/foundation), occupancy (12)
5. Price / anchoring — gets the SELLER's number first without volunteering one (14)
6. Discovery & listen ratio — open-ended questions, seller does most of the talking, uses silence (12)
7. Decision-makers — confirms this person can actually sell (spouse/heirs/co-owners/liens) (6)
8. Objection handling — calm, reframes without arguing or hard-selling (6)
9. Locking the next step — ends with a specific, scheduled commitment (walkthrough/callback/offer) (8)
10. Confirming key details — reflects back address, name, numbers, timeline (4)

Dimensions 2–5 (motivation, timeline, condition, price = the "four pillars," 58% of the weight) are the core: a friendly call that skips them still scores low.

Scoring discipline — be strict:
- Award points on a dimension ONLY when the transcript shows it was genuinely covered. Absence = 0 for that dimension. No benefit of the doubt.
- No real discovery on any pillar → cap total at 20. Empty/near-silent/voicemail/wrong-number/immediate "not interested" → 0–10. Only pleasantries with no seller info → ≤15.
- 70+ requires meaningfully covering all four pillars AND locking a concrete next step. 85+ also requires strong rapport and listen-dominant discovery.

Then produce:
- strengths: 2–4 specific things the operator did well, each tied to what actually happened (empty array if the call was too thin to praise).
- improvements: 2–4 specific, actionable fixes for THIS call (e.g. "Ask the seller's price before giving your own", "Pin down how soon they need to close"), grounded in the rubric and transcript.

Reference what was (or wasn't) said. Call the record_call_score tool exactly once.`

const SCORE_TOOL = {
  name: 'record_call_score',
  description: "Record the wholesaling call-quality grade for the operator's performance on this seller call.",
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      score: {
        type: 'integer' as const,
        minimum: 0,
        maximum: 100,
        description: 'Overall 0–100 score per the weighted rubric and the low-call caps.'
      },
      strengths: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: '2–4 specific things the operator did well, grounded in the transcript. Empty array if too thin to praise.'
      },
      improvements: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: '2–4 specific, actionable ways to improve this call, grounded in the rubric + transcript.'
      }
    },
    required: ['score', 'strengths', 'improvements']
  }
}

export const CallAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string())
})

export class ScoreError extends Error {
  retryable: boolean
  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'ScoreError'
    this.retryable = retryable
  }
}

/** Grade a transcript. Throws ScoreError on failure. */
export async function scoreCall(transcript: string): Promise<CallAnalysis> {
  const cfg = getConfig()
  if (!hasSecret(cfg.anthropicApiKey)) {
    throw new ScoreError('Missing ANTHROPIC_API_KEY in .env — cannot grade the call.', true)
  }
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey, maxRetries: 2, timeout: 60_000 })
  const userContent = `Grade the operator on this seller call. Base everything ONLY on the transcript.\n\n<transcript>\n${transcript || '(no transcript — empty or silent call)'}\n</transcript>`

  const runModel = async (model: string): Promise<unknown | null> => {
    const resp = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [SCORE_TOOL],
      tool_choice: { type: 'tool', name: 'record_call_score' },
      messages: [{ role: 'user', content: userContent }]
    })
    const block = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_call_score'
    )
    return block ? block.input : null
  }

  let lastErr: { message: string; retryable: boolean } | null = null
  for (const model of [HAIKU, SONNET]) {
    let input: unknown | null
    try {
      input = await runModel(model)
    } catch (e) {
      const status = (e as { status?: number })?.status
      if (status === 401 || status === 403) throw new ScoreError(`Call grading auth failed: ${errMsg(e)}`, false)
      lastErr = { message: `Call grading request failed: ${errMsg(e)}`, retryable: true }
      continue
    }
    if (!input) continue
    const parsed = CallAnalysisSchema.safeParse(input)
    if (parsed.success) return parsed.data
  }
  if (lastErr) throw new ScoreError(lastErr.message, lastErr.retryable)
  throw new ScoreError('Call grading did not return valid output after retry.', true)
}

/** IPC entry: grade a saved lead's call and persist the scorecard. */
export async function analyzeCallCore(leadId: string): Promise<Lead> {
  const lead = getLead(leadId)
  if (!lead) throw new Error(`Lead ${leadId} not found`)
  const analysis = await scoreCall(lead.transcript_text)
  return updateLead(leadId, { call_analysis: JSON.stringify(analysis) })
}
