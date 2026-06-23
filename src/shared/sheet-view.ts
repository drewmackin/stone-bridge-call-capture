// =============================================================================
// Sheet view — the SINGLE SOURCE OF TRUTH for how a lead maps to the operator's
// visible Sheet columns (A–H). Imported by BOTH the Sheet writer (main process,
// src/main/sheets/sync.ts) and the Backend review preview (renderer), so what
// the operator approves on screen is exactly what gets written. Pure functions,
// no side effects. Empty pieces are dropped — never invented.
// =============================================================================

import type { Lead } from './types'

/** The operator's visible columns, A–H, in order. Do not reorder. */
export const VISIBLE_SHEET_HEADER = [
  'Address', // A
  'Phone Number', // B
  'Name', // C
  'Status', // D
  'Offer', // E  (seller's asking price)
  'Story Of Property/Person', // F  (summary + motivation + timeline)
  'Concerns of property', // G  (condition notes)
  'Bath, square footage, land' // H  (beds · baths · sqft · year)
] as const

/** Column F — the narrative of the person + property. */
export function composeStory(lead: Lead): string {
  return [
    lead.summary,
    lead.motivation ? `Motivation: ${lead.motivation}` : '',
    lead.timeline ? `Timeline: ${lead.timeline}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Column H — the physical specs we actually captured (land is operator-entered). */
export function composeSpecs(lead: Lead): string {
  return [
    lead.beds ? `${lead.beds} bd` : '',
    lead.baths ? `${lead.baths} ba` : '',
    lead.sqft ? `${lead.sqft} sqft` : '',
    lead.year_built ? `built ${lead.year_built}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface SheetColumnView {
  header: string
  value: string
}

/** The 8 visible cells a lead will occupy in the operator's sheet, in order. */
export function visibleSheetColumns(lead: Lead): SheetColumnView[] {
  return [
    { header: VISIBLE_SHEET_HEADER[0], value: lead.address },
    { header: VISIBLE_SHEET_HEADER[1], value: lead.phone_e164 || lead.phone_raw },
    { header: VISIBLE_SHEET_HEADER[2], value: lead.name },
    { header: VISIBLE_SHEET_HEADER[3], value: lead.status },
    { header: VISIBLE_SHEET_HEADER[4], value: lead.asking_price },
    { header: VISIBLE_SHEET_HEADER[5], value: composeStory(lead) },
    { header: VISIBLE_SHEET_HEADER[6], value: lead.condition_notes },
    { header: VISIBLE_SHEET_HEADER[7], value: composeSpecs(lead) }
  ]
}
