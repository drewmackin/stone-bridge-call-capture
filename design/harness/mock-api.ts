// =============================================================================
// Mock window.stoneBridge + synthetic microphone for the UI harness. In-memory
// only; every lead below is FICTIONAL. Pick a scenario with ?s=<name>:
//   default  — seeded leads, all services ready, a talking "phone" on speaker
//   empty    — first run: no leads yet
//   setup    — services not configured (fresh install)
//   nomic    — microphone permission denied
//   fail     — pipeline and pushes fail (error states)
// =============================================================================

import type { StoneBridgeAPI, ListLeadsOptions, SaveRecordingPayload } from '@shared/ipc'
import type { AppReadiness, CallAnalysis, Lead, PipelineProgress, PushResult } from '@shared/types'
import { EDITABLE_LEAD_FIELDS } from '@shared/types'
import { JURISDICTIONS } from '../../src/main/compliance/states'

const scenario = new URLSearchParams(location.search).get('s') || 'default'
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const iso = (daysAgo: number, h = 10, m = 0): string => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function blank(over: Partial<Lead>): Lead {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
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
    meeting_datetime: '',
    consent_state: 'MA',
    consent_method: 'verbal notice given on the call',
    consent_confirmed: false,
    transcript_path: '',
    audio_path: '',
    transcript_text: '',
    raw_extraction: '',
    call_analysis: '',
    status: 'new',
    needs_review: false,
    sheet_row: null,
    pushed_at: null,
    calendar_event_id: '',
    calendar_event_link: '',
    deleted_at: null,
    ...over
  }
}

const TRANSCRIPT = `Operator: Hi, is this Margaret? This is Drew with Stone Bridge — I'm calling about the house on Linden Street. Just so you know, I record my calls so I don't miss any details. Is that okay?
Seller: Sure, that's fine.
Operator: Great. Tell me a little about the property.
Seller: It's a three-bed, one-and-a-half bath colonial. About 1,450 square feet. Built in 1962.
Operator: And how's the condition?
Seller: The roof is maybe twenty years old and the kitchen hasn't been touched since the eighties. The basement gets some water in the spring.
Operator: Understood. What has you thinking about selling?
Seller: My mother passed last year and none of us live nearby. We'd like it handled before winter.
Operator: I'm sorry to hear that. Do you have a number in mind?
Seller: We were hoping for around 310.
Operator: That helps. Could we walk through it Thursday at 3?
Seller: Thursday at 3 works.`

const ANALYSIS: CallAnalysis = {
  score: 74,
  strengths: [
    'Asked for permission to record before the conversation started.',
    'Uncovered the real motivation (estate, out-of-area heirs) with an open question.',
    'Booked a specific walkthrough time before hanging up.'
  ],
  improvements: [
    'Anchor on condition before asking for a price — the number came before the repair list was complete.',
    'Confirm the decision-makers: other heirs were mentioned but not named.'
  ]
}

const meeting = (() => {
  const d = new Date()
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7))
  d.setHours(15, 0, 0, 0)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T15:00:00`
})()

let leads: Lead[] =
  scenario === 'empty' || scenario === 'setup'
    ? []
    : [
        blank({
          created_at: iso(0, 9, 42),
          name: 'Margaret Doyle',
          phone_raw: 'six one seven, five five five, zero one four two',
          phone_e164: '+16175550142',
          address: '14 Linden St, Worcester, MA 01609',
          beds: '3',
          baths: '1.5',
          sqft: '1450',
          year_built: '1962',
          condition_notes: 'Roof ~20 yrs; original 1980s kitchen; spring water in basement.',
          asking_price: '$310,000',
          motivation: 'Inherited from mother; heirs live out of state; want it handled before winter.',
          timeline: 'Before winter',
          summary:
            'Margaret inherited a 3-bed colonial in Worcester. Dated kitchen, older roof and some basement water. Family wants a quick, simple sale before winter and is hoping for about $310k.',
          next_action: 'Walkthrough Thursday 3pm; bring comps for Linden St.',
          meeting_datetime: meeting,
          transcript_text: TRANSCRIPT,
          call_analysis: JSON.stringify(ANALYSIS),
          status: 'new',
          audio_path: '/recordings/20260924-094200.wav'
        }),
        blank({
          created_at: iso(1, 16, 5),
          name: 'Luis Ortega',
          phone_e164: '+15085550188',
          phone_raw: '508 555 0188',
          address: '72 Pleasant Ave, Fall River, MA 02720',
          beds: '4',
          baths: '2',
          asking_price: '$265,000',
          motivation: 'Tired landlord; two units, one vacant.',
          timeline: '60 days',
          summary: 'Two-family with one vacant unit. Owner is done managing tenants.',
          next_action: 'Send offer range by Friday.',
          transcript_text: 'Operator: Thanks for calling back, Luis…\nSeller: Yeah, I have the two-family on Pleasant…',
          status: 'reviewed'
        }),
        blank({
          created_at: iso(1, 11, 30),
          name: '',
          phone_raw: 'nine seven eight… five five five… one…',
          phone_ambiguous: true,
          address: '',
          transcript_text: 'Seller: …the place on, uh, Maple — I can\'t really talk long…',
          needs_review: true,
          status: 'new'
        }),
        blank({
          created_at: iso(3, 14, 12),
          name: 'Dorothy & Frank Weiss',
          phone_e164: '+17815550117',
          phone_raw: '781-555-0117',
          address: '9 Harbor View Rd, Quincy, MA 02169',
          beds: '2',
          baths: '1',
          sqft: '980',
          asking_price: '$390,000',
          motivation: 'Downsizing to assisted living.',
          timeline: '90 days',
          summary: 'Long-time owners moving to assisted living; house needs cosmetic work.',
          status: 'pushed',
          sheet_row: 14,
          pushed_at: iso(2, 9, 0),
          calendar_event_id: 'evt1',
          calendar_event_link: 'https://calendar.google.com/',
          transcript_text: 'Operator: Good afternoon, is this Dorothy?…'
        }),
        blank({
          created_at: iso(6, 10, 0),
          name: 'Kevin Tran',
          phone_e164: '+14135550163',
          address: '301 Chestnut St, Springfield, MA 01104',
          summary: 'Wanted retail price; not motivated.',
          status: 'archived',
          transcript_text: 'Seller: I already have an agent, honestly…'
        }),
        blank({
          created_at: iso(8, 13, 20),
          name: 'Test entry',
          status: 'new',
          consent_method: 'manual entry (no recording)',
          deleted_at: iso(7)
        })
      ]

function readiness(): AppReadiness {
  if (scenario === 'setup') {
    const off = (detail: string): AppReadiness['anthropic'] => ({ configured: false, ok: false, detail })
    return {
      anthropic: off('ANTHROPIC_API_KEY is not set in .env — leads will be saved for manual review.'),
      transcription: off('Transcription engine not built — run ./scripts/build-sidecar.sh.'),
      diarization: off('Optional: add HUGGINGFACE_TOKEN for speaker labels.'),
      sheets: off('No Google service-account key configured.'),
      calendar: off('Calendar needs the Google service account too.'),
      operatorState: 'MA',
      audioMode: 'speakerphone',
      recordingsDir: '/recordings'
    }
  }
  const on = (detail: string): AppReadiness['anthropic'] => ({ configured: true, ok: true, detail })
  return {
    anthropic: on('Claude Haiku 4.5 with Sonnet fallback.'),
    transcription: on('Local Whisper (small) — audio never leaves this Mac.'),
    diarization: { configured: false, ok: false, detail: 'Optional: add HUGGINGFACE_TOKEN for speaker labels.' },
    sheets: on('Connected to “Stone Bridge Leads”.'),
    calendar: on('Follow-ups go to your primary calendar.'),
    operatorState: 'MA',
    audioMode: 'speakerphone',
    recordingsDir: '/recordings'
  }
}

const listeners = new Set<(p: PipelineProgress) => void>()
const emit = (p: PipelineProgress): void => listeners.forEach((cb) => cb(p))
const find = (id: string): Lead => {
  const l = leads.find((x) => x.id === id)
  if (!l) throw new Error(`Lead ${id} not found`)
  return l
}
let nextRow = 15

async function runPipeline(leadId: string, forceOk = false): Promise<Lead> {
  const safe = `/recordings/${leadId}.wav`
  emit({ leadId, stage: 'saving', message: 'Saving recording…', retryable: false, audioPathSafe: null })
  await sleep(500)
  emit({ leadId, stage: 'transcribing', message: 'Transcribing…', retryable: false, audioPathSafe: safe })
  await sleep(1600)
  if (scenario === 'fail' && !forceOk) {
    emit({
      leadId,
      stage: 'error',
      message: 'Transcription engine exited unexpectedly (code 1).',
      retryable: true,
      audioPathSafe: safe
    })
    throw new Error('Transcription engine exited unexpectedly (code 1).')
  }
  emit({ leadId, stage: 'extracting', message: 'Extracting lead details…', retryable: false, audioPathSafe: safe })
  await sleep(1600)
  const l = find(leadId)
  Object.assign(l, {
    name: 'Ray Castillo',
    phone_e164: '+16175550199',
    phone_raw: '617 555 0199',
    address: '5 Orchard Ln, Lowell, MA 01852',
    beds: '3',
    baths: '2',
    asking_price: '$289,000',
    motivation: 'Job relocation to Texas.',
    timeline: '30–45 days',
    summary: 'Relocating for work; house is in good shape; wants a fast close.',
    transcript_text: 'Operator: Hi Ray, thanks for taking the call…\nSeller: Sure — the house on Orchard Lane…',
    call_analysis: JSON.stringify({ ...ANALYSIS, score: 81 })
  })
  emit({ leadId, stage: 'done', message: 'Lead captured.', retryable: false, audioPathSafe: safe })
  return { ...l }
}

const api: StoneBridgeAPI = {
  getReadiness: async () => readiness(),
  getJurisdictions: async () => JURISDICTIONS,

  saveRecording: async (p: SaveRecordingPayload) => {
    await sleep(250)
    const lead = blank({
      consent_state: p.consent.state,
      consent_method: p.consent.method,
      audio_path: `/recordings/${Date.now()}.wav`
    })
    leads.unshift(lead)
    return { leadId: lead.id, audioPath: lead.audio_path }
  },
  processRecording: (id) => runPipeline(id),
  retryProcessing: (id) => runPipeline(id, true),
  onPipelineProgress: (cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  listLeads: async (o: ListLeadsOptions = {}) => {
    await sleep(120)
    const q = (o.search || '').toLowerCase()
    let rows = leads.filter((l) =>
      o.onlyDeleted ? !!l.deleted_at : o.includeDeleted ? true : !l.deleted_at
    )
    if (o.status && o.status !== 'all') rows = rows.filter((l) => l.status === o.status)
    if (q) rows = rows.filter((l) => [l.name, l.phone_e164, l.phone_raw, l.address].join(' ').toLowerCase().includes(q))
    const k = o.sortBy || 'created_at'
    const dir = o.sortDir === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => String(a[k] ?? '').localeCompare(String(b[k] ?? '')) * dir)
    return rows.map((l) => ({ ...l }))
  },
  getLead: async (id) => ({ ...find(id) }),
  updateLead: async (id, patch) => {
    const l = find(id)
    for (const k of EDITABLE_LEAD_FIELDS) if (k in patch) (l as Record<string, unknown>)[k] = patch[k]
    return { ...l }
  },
  analyzeCall: async (id) => {
    await sleep(1400)
    if (scenario === 'fail') throw new Error('Anthropic API returned 529 (overloaded). Try again in a minute.')
    const l = find(id)
    l.call_analysis = JSON.stringify(ANALYSIS)
    return { ...l }
  },
  addManualLead: async (patch) => {
    const l = blank({ ...patch, consent_method: 'manual entry (no recording)' })
    leads.unshift(l)
    return { ...l }
  },
  softDeleteLead: async (id) => {
    find(id).deleted_at = new Date().toISOString()
  },
  restoreLead: async (id) => {
    find(id).deleted_at = null
  },
  permanentDeleteLead: async (id) => {
    leads = leads.filter((l) => l.id !== id)
  },

  pushLead: async (id): Promise<PushResult> => {
    await sleep(900)
    const l = find(id)
    if (scenario === 'fail') {
      return { leadId: id, ok: false, row: null, created: false, error: 'Google Sheets: the caller does not have permission (403).' }
    }
    const created = l.sheet_row == null
    if (created) l.sheet_row = nextRow++
    l.status = 'pushed'
    l.pushed_at = new Date().toISOString()
    const calendar = l.meeting_datetime
      ? { ok: true, skipped: false, eventLink: 'https://calendar.google.com/', created: !l.calendar_event_id, error: null }
      : { ok: true, skipped: true, eventLink: null, created: false, error: null }
    if (l.meeting_datetime) {
      l.calendar_event_id = 'evt-' + id.slice(0, 6)
      l.calendar_event_link = 'https://calendar.google.com/'
    }
    return { leadId: id, ok: true, row: l.sheet_row, created, error: null, calendar }
  },
  pushAllApproved: async () => {
    const approved = leads.filter((l) => l.status === 'reviewed' && !l.deleted_at)
    const out: PushResult[] = []
    for (const l of approved) out.push(await api.pushLead(l.id))
    return out
  },
  deleteSheetRow: async (id) => {
    find(id).sheet_row = null
  }
}

;(window as unknown as { stoneBridge: StoneBridgeAPI }).stoneBridge = api

// --- Synthetic microphone: a "voice" (modulated tone) so the meter and the
// recorder behave as they would with the phone on speaker. ---
const fakeDevices = [
  { deviceId: 'default', kind: 'audioinput', label: 'MacBook Air Microphone', groupId: 'g1' },
  { deviceId: 'usb-1', kind: 'audioinput', label: 'Blue Yeti USB Microphone', groupId: 'g2' }
].map((d) => ({ ...d, toJSON: () => d })) as unknown as MediaDeviceInfo[]

let micCtx: AudioContext | null = null
async function fakeStream(): Promise<MediaStream> {
  if (scenario === 'nomic') throw new DOMException('Permission denied', 'NotAllowedError')
  micCtx ??= new AudioContext()
  if (micCtx.state === 'suspended') {
    void micCtx.resume()
    addEventListener('pointerdown', () => void micCtx?.resume(), { once: true })
  }
  const osc = micCtx.createOscillator()
  osc.frequency.value = 180
  const amp = micCtx.createGain()
  amp.gain.value = 0.25
  const lfo = micCtx.createOscillator()
  lfo.frequency.value = 2.3
  const lfoGain = micCtx.createGain()
  lfoGain.gain.value = 0.22
  lfo.connect(lfoGain).connect(amp.gain)
  const dest = micCtx.createMediaStreamDestination()
  osc.connect(amp).connect(dest)
  osc.start()
  lfo.start()
  return dest.stream
}

Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: () => fakeStream(),
    enumerateDevices: async () => (scenario === 'nomic' ? [] : fakeDevices),
    addEventListener: () => {},
    removeEventListener: () => {}
  }
})
