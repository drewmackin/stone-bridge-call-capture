// =============================================================================
// Static compliance copy. Verified against primary/government sources during
// research (Mass. malegislature.gov; Colorado C.R.S.). This is reference
// information, NOT legal advice — see DISCLAIMER. No secrets here, so the
// renderer imports it directly.
// =============================================================================

/** The short notice the operator reads aloud before recording. */
export const CONSENT_SCRIPT =
  'This call is being recorded for quality and record-keeping — is that okay with you?'

/** Persistent not-legal-advice disclaimer (verified wording). */
export const DISCLAIMER =
  'This information is provided for general reference only and is not legal advice. ' +
  'Call-recording and wiretapping laws change, vary by jurisdiction, and turn on specific facts ' +
  '(such as where each party is located, whether a conversation is "private," and whether notice ' +
  'was given). Some states are mixed or unsettled, and statute interpretations evolve through ' +
  'court decisions. Do not rely on this summary for any actual recording decision. For interstate ' +
  'calls or any situation with legal exposure, default to obtaining clear, advance consent from ' +
  'all parties, and consult a licensed attorney in the relevant jurisdiction(s) before recording.'

/** Why we default to the stricter rule for unknown/interstate calls. */
export const INTERSTATE_GUIDANCE =
  'When a call crosses state lines, or you do not know which state the other party is physically ' +
  'in, default to the stricter ALL-PARTY (clear-notice) rule. Several all-party states apply their ' +
  'law based on where a party is located and protect their own residents on interstate calls, and ' +
  'courts have applied the more protective state’s law in disputes. Clear, audible notice that ' +
  '"this call is being recorded" satisfies every state, so it is the universally safe practice. Do ' +
  'not rely on your own state’s one-party rule for interstate calls.'

/** Operator's home jurisdiction, surfaced prominently. */
export const MASSACHUSETTS_DETAIL = {
  headline: 'Massachusetts is an ALL-PARTY (two-party) consent state.',
  statute: 'Mass. Gen. Laws ch. 272, § 99',
  body:
    'The statute prohibits "interception," defined as recording a wire or oral communication ' +
    'SECRETLY (§ 99(B)(4)). Because the offense turns on secrecy, giving every participant clear, ' +
    'actual notice that the call is being recorded cures it (Commonwealth v. Hyde). The safe ' +
    'practice is an unambiguous audible disclosure at the start of the call.',
  penalties:
    'Criminal (§ 99(C)(1)): a fine up to $10,000 and/or up to 5 years in state prison. ' +
    'Civil (§ 99(Q)): actual damages but not less than the greater of $100 per day of violation ' +
    'or $1,000, plus punitive damages and reasonable attorney’s fees.',
  source: 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter272/Section99'
} as const

export const COLORADO_DETAIL = {
  headline: 'Colorado is a ONE-PARTY consent state.',
  statute: 'C.R.S. 18-9-303 (telephone/electronic); 18-9-304 (in-person)',
  body:
    'For recording a telephone or electronic communication you are a party to, Colorado requires ' +
    'the consent of only one party (your own participation suffices). C.R.S. 18-9-303 governs phone ' +
    'recording; 18-9-304 (eavesdropping) covers in-person conversations and is also one-party.',
  source: 'https://colorado.public.law/statutes/crs_18-9-303'
} as const
