// =============================================================================
// Shared types — the single source of truth for the data shapes that cross the
// main <-> preload <-> renderer boundary. Keep field names identical to the
// SQLite columns (src/main/db/schema.ts) and the Google Sheet header
// (src/main/sheets/sync.ts) so a lead maps cleanly end to end.
// =============================================================================

/** Lifecycle of a captured lead as it moves from capture to the Sheet. */
export type LeadStatus = 'new' | 'reviewed' | 'pushed' | 'archived'

/** Whether the recording pipeline has finished processing a capture. */
export type ProcessingStage =
  | 'idle'
  | 'saving'
  | 'transcribing'
  | 'extracting'
  | 'done'
  | 'error'

/** Consent rule classification for a US jurisdiction. */
export type ConsentRule = 'one-party' | 'all-party' | 'mixed/unclear'

/**
 * The structured lead. Every text field defaults to "" (empty string) when the
 * transcript does not actually support it — never a guessed/placeholder value.
 * Numeric-ish fields are kept as strings so "not captured" is representable and
 * we never coerce an unknown into 0.
 */
export interface Lead {
  /** System-generated UUID. The idempotency key for the Google Sheet upsert. */
  id: string
  /** ISO-8601 timestamp of the call/capture. */
  created_at: string

  // --- Contact ---
  name: string
  phone_raw: string // exactly as heard/typed
  phone_e164: string // normalized (+1...) or "" if ambiguous/unknown
  phone_ambiguous: boolean // true when a number was mentioned but not confidently normalized

  // --- Property ---
  address: string
  beds: string
  baths: string
  sqft: string
  year_built: string
  condition_notes: string // repairs, occupancy, overall state

  // --- Deal ---
  asking_price: string
  motivation: string
  timeline: string
  summary: string // neutral 3–5 sentence call summary
  next_action: string // what the operator wants to do next
  meeting_datetime: string // next meeting/follow-up as ISO local (e.g. 2026-07-02T15:00:00) or "" if none agreed

  // --- Compliance (logged immutably; also see consent_log table) ---
  consent_state: string // two-letter code the rule was applied for
  consent_method: string // e.g. "verbal notice + audible disclosure"
  consent_confirmed: boolean // operator checked the box

  // --- Provenance / storage ---
  transcript_path: string // file on disk
  audio_path: string // raw recording on disk
  transcript_text: string // full transcript (kept local, NOT sent to Sheet)
  raw_extraction: string // raw model JSON for audit (kept local)
  call_analysis: string // JSON CallAnalysis (call scorecard), or "" if not analyzed

  // --- State ---
  status: LeadStatus
  needs_review: boolean // extraction failed/uncertain — operator must verify
  sheet_row: number | null // 1-based row in the Sheet once pushed, else null
  pushed_at: string | null // ISO timestamp of last successful push
  calendar_event_id: string // Google Calendar event id once synced, else ""
  calendar_event_link: string // htmlLink to the calendar event, else ""
  deleted_at: string | null // soft-delete tombstone; null = live
}

/** Fields the operator may edit in the Backend. (Everything except provenance/system.) */
export type EditableLeadField =
  | 'name'
  | 'phone_raw'
  | 'phone_e164'
  | 'phone_ambiguous'
  | 'address'
  | 'beds'
  | 'baths'
  | 'sqft'
  | 'year_built'
  | 'condition_notes'
  | 'asking_price'
  | 'motivation'
  | 'timeline'
  | 'summary'
  | 'next_action'
  | 'meeting_datetime'
  | 'status'

/**
 * Runtime allowlist of fields a renderer-originated update may write. Provenance,
 * consent (immutable audit), and sync columns (sheet_row, pushed_at, calendar
 * fields, deleted_at) are deliberately excluded — they're set only by trusted
 * server-side paths.
 */
export const EDITABLE_LEAD_FIELDS: EditableLeadField[] = [
  'name',
  'phone_raw',
  'phone_e164',
  'phone_ambiguous',
  'address',
  'beds',
  'baths',
  'sqft',
  'year_built',
  'condition_notes',
  'asking_price',
  'motivation',
  'timeline',
  'summary',
  'next_action',
  'meeting_datetime',
  'status'
]

/** Immutable consent audit record, one per recording. */
export interface ConsentLogEntry {
  id: string
  lead_id: string
  state: string
  rule_applied: ConsentRule
  method: string
  script_acknowledged: boolean
  audible_played: boolean
  timestamp: string
}

/** A single diarized/segmented line of the transcript. */
export interface TranscriptSegment {
  speaker: string // "A" / "B" / "Speaker 1" — or "" when diarization unavailable
  text: string
  start_ms: number
  end_ms: number
}

/** Result returned by any Transcriber implementation. */
export interface TranscriptionResult {
  text: string // full plain transcript
  segments: TranscriptSegment[]
  speaker_labeled: boolean // false => diarization unavailable; labels are empty
  engine: 'local-whisper' | 'assemblyai'
  // Entities are only populated by engines that detect them (AssemblyAI).
  entities: { type: string; text: string }[]
}

/** One jurisdiction in the consent map. */
export interface JurisdictionRule {
  state: string // full name
  code: string // two-letter
  rule: ConsentRule
  statute: string
  source_url: string
}

/** Status of the connection to an external service, surfaced in the UI. */
export interface ServiceStatus {
  configured: boolean // env/credentials present
  ok: boolean // last check succeeded
  detail: string // human-readable explanation / error
}

/** Snapshot of which capabilities are wired up, shown on the Home page. */
export interface AppReadiness {
  anthropic: ServiceStatus
  transcription: ServiceStatus
  diarization: ServiceStatus
  sheets: ServiceStatus
  calendar: ServiceStatus
  operatorState: string
  audioMode: 'speakerphone' | 'loopback'
  recordingsDir: string
}

/** Progress event emitted by the main process during the capture pipeline. */
export interface PipelineProgress {
  leadId: string
  stage: ProcessingStage
  message: string
  retryable: boolean
  audioPathSafe: string | null // path proving the raw audio is already on disk
}

/** AI grade of how well the operator handled the call (wholesaling best practices). */
export interface CallAnalysis {
  score: number // 0–100
  strengths: string[]
  improvements: string[]
}

/** Result of syncing a lead's next-meeting time to Google Calendar. */
export interface CalendarResult {
  ok: boolean
  skipped: boolean // true when there was no meeting time to sync
  eventLink: string | null
  created: boolean // true if a new event was inserted, false if an existing one updated
  error: string | null
}

/** Result of a push-to-Sheet operation (with optional calendar sync). */
export interface PushResult {
  leadId: string
  ok: boolean
  row: number | null
  created: boolean // true if a new row was appended, false if existing row updated
  error: string | null
  calendar?: CalendarResult
}
