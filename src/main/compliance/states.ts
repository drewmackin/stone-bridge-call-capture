// =============================================================================
// US call-recording consent map — 50 states + DC. Classifications and statute
// citations were gathered from primary/government sources during research, with
// Massachusetts (§ 99) and Colorado (C.R.S. 18-9-303) independently verified.
// For non-verified entries the source link points to the Reporters Committee
// state-by-state recording guide (a real, authoritative reference); statute
// citations are the specific governing sections. Nothing here is invented —
// genuinely unsettled states are tagged "mixed/unclear".
// =============================================================================

import type { ConsentRule, JurisdictionRule } from '@shared/types'

const RCFP = 'https://www.rcfp.org/reporters-recording-guide/'
const MA_SRC = 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter272/Section99'
const CO_SRC = 'https://colorado.public.law/statutes/crs_18-9-303'

type Entry = [name: string, code: string, rule: ConsentRule, statute: string, src?: string]

const ENTRIES: Entry[] = [
  ['Alabama', 'AL', 'one-party', 'Ala. Code § 13A-11-30, 13A-11-31'],
  ['Alaska', 'AK', 'one-party', 'Alaska Stat. § 42.20.310; 42.20.300'],
  ['Arizona', 'AZ', 'one-party', 'Ariz. Rev. Stat. § 13-3005; 13-3012'],
  ['Arkansas', 'AR', 'one-party', 'Ark. Code § 5-60-120'],
  ['California', 'CA', 'all-party', 'Cal. Penal Code § 632 (also § 631)'],
  ['Colorado', 'CO', 'one-party', 'C.R.S. 18-9-303 (telephone); 18-9-304 (in-person)', CO_SRC],
  ['Connecticut', 'CT', 'mixed/unclear', 'Conn. Gen. Stat. § 53a-187/53a-189 (criminal, one-party); § 52-570d (civil, all-party for telephone)'],
  ['Delaware', 'DE', 'mixed/unclear', '11 Del. C. § 2402 (wiretap, one-party) vs. § 1335 (privacy, all-party) — treated as all-party in practice'],
  ['Florida', 'FL', 'all-party', 'Fla. Stat. § 934.03'],
  ['Georgia', 'GA', 'one-party', 'Ga. Code § 16-11-62; 16-11-66'],
  ['Hawaii', 'HI', 'one-party', 'Haw. Rev. Stat. § 803-42 (all-party when recording in a private place)'],
  ['Idaho', 'ID', 'one-party', 'Idaho Code § 18-6702'],
  ['Illinois', 'IL', 'all-party', '720 ILCS 5/14-2 (eavesdropping)'],
  ['Indiana', 'IN', 'one-party', 'Ind. Code § 35-33.5-1-5; 35-31.5-2-176'],
  ['Iowa', 'IA', 'one-party', 'Iowa Code § 808B.2'],
  ['Kansas', 'KS', 'one-party', 'Kan. Stat. § 21-6101'],
  ['Kentucky', 'KY', 'one-party', 'Ky. Rev. Stat. § 526.010; 526.020'],
  ['Louisiana', 'LA', 'one-party', 'La. Rev. Stat. § 15:1303'],
  ['Maine', 'ME', 'one-party', 'Me. Rev. Stat. tit. 15, § 709–712'],
  ['Maryland', 'MD', 'all-party', 'Md. Code, Cts. & Jud. Proc. § 10-402'],
  ['Massachusetts', 'MA', 'all-party', 'Mass. Gen. Laws ch. 272, § 99', MA_SRC],
  ['Michigan', 'MI', 'mixed/unclear', 'Mich. Comp. Laws § 750.539c (reads all-party; courts/AG construe to allow a participant to record — disputed)'],
  ['Minnesota', 'MN', 'one-party', 'Minn. Stat. § 626A.02'],
  ['Mississippi', 'MS', 'one-party', 'Miss. Code § 41-29-531'],
  ['Missouri', 'MO', 'one-party', 'Mo. Rev. Stat. § 542.402'],
  ['Montana', 'MT', 'all-party', 'Mont. Code Ann. § 45-8-213 (requires notice to all parties)'],
  ['Nebraska', 'NE', 'one-party', 'Neb. Rev. Stat. § 86-290'],
  ['Nevada', 'NV', 'mixed/unclear', 'Nev. Rev. Stat. § 200.620 / 200.650 — NV Supreme Court (Lane v. Allstate) construes telephone recording as all-party'],
  ['New Hampshire', 'NH', 'all-party', 'N.H. Rev. Stat. § 570-A:2'],
  ['New Jersey', 'NJ', 'one-party', 'N.J. Stat. § 2A:156A-4'],
  ['New Mexico', 'NM', 'one-party', 'N.M. Stat. § 30-12-1'],
  ['New York', 'NY', 'one-party', 'N.Y. Penal Law § 250.00; 250.05'],
  ['North Carolina', 'NC', 'one-party', 'N.C. Gen. Stat. § 15A-287'],
  ['North Dakota', 'ND', 'one-party', 'N.D. Cent. Code § 12.1-15-02'],
  ['Ohio', 'OH', 'one-party', 'Ohio Rev. Code § 2933.52'],
  ['Oklahoma', 'OK', 'one-party', 'Okla. Stat. tit. 13, § 176.4'],
  ['Oregon', 'OR', 'mixed/unclear', 'Or. Rev. Stat. § 165.540 (telephone one-party; in-person requires all participants be specifically informed)'],
  ['Pennsylvania', 'PA', 'all-party', '18 Pa. Cons. Stat. § 5703, 5704'],
  ['Rhode Island', 'RI', 'one-party', 'R.I. Gen. Laws § 11-35-21'],
  ['South Carolina', 'SC', 'one-party', 'S.C. Code § 17-30-30'],
  ['South Dakota', 'SD', 'one-party', 'S.D. Codified Laws § 23A-35A-20'],
  ['Tennessee', 'TN', 'one-party', 'Tenn. Code § 39-13-601'],
  ['Texas', 'TX', 'one-party', 'Tex. Penal Code § 16.02'],
  ['Utah', 'UT', 'one-party', 'Utah Code § 77-23a-4'],
  ['Vermont', 'VT', 'mixed/unclear', 'No general statute; Vt. Supreme Court (State v. Geraw) treats surreptitious in-home recording as protected — uncertain'],
  ['Virginia', 'VA', 'one-party', 'Va. Code § 19.2-62'],
  ['Washington', 'WA', 'all-party', 'Wash. Rev. Code § 9.73.030'],
  ['West Virginia', 'WV', 'one-party', 'W. Va. Code § 62-1D-3'],
  ['Wisconsin', 'WI', 'one-party', 'Wis. Stat. § 968.31'],
  ['Wyoming', 'WY', 'one-party', 'Wyo. Stat. § 7-3-702'],
  ['District of Columbia', 'DC', 'one-party', 'D.C. Code § 23-542']
]

export const JURISDICTIONS: JurisdictionRule[] = ENTRIES.map(([state, code, rule, statute, src]) => ({
  state,
  code,
  rule,
  statute,
  source_url: src ?? RCFP
}))

const BY_CODE = new Map(JURISDICTIONS.map((j) => [j.code, j]))

export function getJurisdictions(): JurisdictionRule[] {
  return JURISDICTIONS
}

export function getRule(code: string): JurisdictionRule | undefined {
  return BY_CODE.get((code || '').toUpperCase())
}

export interface EffectiveRule {
  effective: ConsentRule
  leadRule: ConsentRule | 'unknown'
  interstate: boolean
  reason: string
}

/**
 * Decide the rule the gate should apply. We default to the STRICTER all-party
 * rule whenever the lead's state is unknown, classified mixed/unclear, or
 * differs from the operator's state (interstate). Only a same-state, clearly
 * one-party call relaxes to one-party — and even then notice is encouraged.
 */
export function applicableRule(leadStateCode: string, operatorStateCode: string): EffectiveRule {
  const lead = getRule(leadStateCode)
  const op = (operatorStateCode || '').toUpperCase()
  if (!lead) {
    return {
      effective: 'all-party',
      leadRule: 'unknown',
      interstate: true,
      reason: 'Lead state unknown — defaulting to the stricter all-party rule.'
    }
  }
  if (lead.rule === 'mixed/unclear') {
    return {
      effective: 'all-party',
      leadRule: 'mixed/unclear',
      interstate: lead.code !== op,
      reason: `${lead.state} law is mixed/unsettled — defaulting to the stricter all-party rule.`
    }
  }
  if (lead.code !== op) {
    return {
      effective: 'all-party',
      leadRule: lead.rule,
      interstate: true,
      reason: `Interstate call (lead in ${lead.state}, you in ${op || 'unknown'}) — apply the stricter all-party rule.`
    }
  }
  return {
    effective: lead.rule,
    leadRule: lead.rule,
    interstate: false,
    reason:
      lead.rule === 'all-party'
        ? `${lead.state} is an all-party consent state.`
        : `${lead.state} is a one-party consent state; clear notice is still the safe practice.`
  }
}
