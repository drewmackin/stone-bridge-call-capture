import type { ConsentRule, JurisdictionRule } from '@shared/types'

export interface EffectiveRule {
  effective: ConsentRule
  interstate: boolean
  reason: string
  jurisdiction: JurisdictionRule | null
}

/**
 * Renderer-side mirror of the main process applicableRule() (src/main/compliance/
 * states.ts). DISPLAY-ONLY — the main process recomputes the authoritative
 * rule_applied (effective/interstate) when consent is logged, so only the
 * human-readable reason strings live here. Keep the effective/interstate logic
 * in lockstep with the main version. Defaults to the stricter all-party rule for
 * unknown, mixed/unclear, or interstate calls.
 */
export function effectiveRule(
  jurisdictions: JurisdictionRule[],
  leadCode: string,
  operatorState: string
): EffectiveRule {
  const j = jurisdictions.find((x) => x.code === (leadCode || '').toUpperCase()) || null
  const op = (operatorState || '').toUpperCase()
  if (!j) {
    return {
      effective: 'all-party',
      interstate: true,
      reason: 'Lead state not selected — defaulting to the stricter all-party rule.',
      jurisdiction: null
    }
  }
  if (j.rule === 'mixed/unclear') {
    return {
      effective: 'all-party',
      interstate: j.code !== op,
      reason: `${j.state} law is mixed/unsettled — defaulting to the stricter all-party rule.`,
      jurisdiction: j
    }
  }
  if (j.code !== op) {
    return {
      effective: 'all-party',
      interstate: true,
      reason: `Interstate call (lead in ${j.state}, you in ${op || 'unknown'}) — apply the stricter all-party rule.`,
      jurisdiction: j
    }
  }
  return {
    effective: j.rule,
    interstate: false,
    reason:
      j.rule === 'all-party'
        ? `${j.state} is an all-party consent state.`
        : `${j.state} is a one-party consent state; clear notice is still the safe practice.`,
    jurisdiction: j
  }
}
